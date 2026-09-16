import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

type Row = Record<string, unknown>;

function parameters(values: unknown[]): SQLInputValue[] {
  return values.map((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return Number(value);
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value;
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    throw new TypeError('Unsupported SQL parameter');
  });
}

/** The prepared-statement API used by the original CRM, backed by local SQLite. */
export class LocalStatement {
  readonly database: LocalDatabase;
  readonly sql: string;
  readonly values: SQLInputValue[];

  constructor(database: LocalDatabase, sql: string, values: SQLInputValue[] = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values: unknown[]) {
    return new LocalStatement(this.database, this.sql, parameters(values));
  }

  async first<T = Row>(column?: string): Promise<T | null> {
    const row = this.database.connection.prepare(this.sql).get(...this.values);
    return (column ? row?.[column] : row) as T ?? null;
  }

  execute<T = Row>() {
    const statement = this.database.connection.prepare(this.sql);
    const hasRows = statement.columns().length > 0;
    const results = hasRows ? statement.all(...this.values) as T[] : [];
    const result = hasRows ? null : statement.run(...this.values);
    return {
      success: true as const,
      results,
      meta: {
        changes: Number(result?.changes ?? 0),
        last_row_id: Number(result?.lastInsertRowid ?? 0),
        duration: 0,
      },
    };
  }

  async all<T = Row>() { return this.execute<T>(); }
  async run<T = Row>() { return this.execute<T>(); }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]> {
    const statement = this.database.connection.prepare(this.sql);
    statement.setReturnArrays(true);
    const rows = statement.all(...this.values) as unknown as T[];
    return options?.columnNames ? [statement.columns().map((c) => c.name) as T, ...rows] : rows;
  }
}

export class LocalDatabase {
  readonly connection: DatabaseSync;

  constructor(path: string, migrationsDirectory = resolve(process.cwd(), 'drizzle')) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.connection = new DatabaseSync(path);
    this.connection.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    this.migrate(migrationsDirectory);
  }

  private migrate(directory: string) {
    this.connection.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
    for (const name of readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
      this.connection.exec('BEGIN IMMEDIATE');
      try {
        const existing = this.connection.prepare('SELECT name FROM _local_migrations WHERE name = ?').get(name);
        if (!existing) {
          this.connection.exec(readFileSync(resolve(directory, name), 'utf8'));
          this.connection.prepare('INSERT INTO _local_migrations (name, applied_at) VALUES (?, ?)').run(name, Date.now());
        }
        this.connection.exec('COMMIT');
      } catch (error) {
        this.connection.exec('ROLLBACK');
        throw new Error(`Could not apply migration ${name}`, { cause: error });
      }
    }
  }

  prepare(sql: string) { return new LocalStatement(this, sql); }

  async batch<T = Row>(statements: LocalStatement[]) {
    // Keep execution synchronous inside the transaction: no request can interleave.
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => {
        if (statement.database !== this) throw new Error('Statement belongs to another database');
        return statement.execute<T>();
      });
      this.connection.exec('COMMIT');
      return results;
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }

  close() { this.connection.close(); }
}

/** Local replacement for the original document bucket. Never served statically. */
export class LocalFiles {
  readonly directory: string;
  constructor(directory: string) { this.directory = resolve(directory); }

  private path(key: string) {
    const path = resolve(this.directory, key);
    const child = relative(this.directory, path);
    if (!child || child.startsWith('..') || isAbsolute(child) || key.includes('\0')) throw new Error('Invalid document key');
    return path;
  }

  async put(key: string, value: ArrayBuffer, _options?: { httpMetadata?: { contentType?: string } }) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, new Uint8Array(value), { mode: 0o600 });
    return { key };
  }

  async get(key: string) {
    try {
      const bytes = await readFile(this.path(key));
      return { body: new Uint8Array(bytes), size: bytes.byteLength };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(keys: string | string[]) {
    await Promise.all((Array.isArray(keys) ? keys : [keys]).map(async (key) => {
      try { await unlink(this.path(key)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }));
  }
}
