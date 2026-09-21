import pg from 'pg';
import type { PoolClient } from 'pg';

const safeNumber = (value: string) => {
  const number = Number(value);
  if (!Number.isFinite(number) || (Number.isInteger(number) && !Number.isSafeInteger(number))) throw new RangeError('Database number exceeds JavaScript precision');
  return number;
};
pg.types.setTypeParser(20, safeNumber);
pg.types.setTypeParser(1700, safeNumber);

export const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
export function databaseSchema() {
  const value = process.env.DATABASE_SCHEMA || 'public';
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) throw new Error('Invalid DATABASE_SCHEMA');
  return value;
}

/** Translate the legacy parameter API without touching quoted strings or comments. */
export function postgresSql(sql: string, schema = 'public') {
  let parameter = 0;
  const literals: string[] = [];
  const masked = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\//g, (literal) => {
    literals.push(literal);
    return `\u0001${literals.length - 1}\u0002`;
  });
  const tables = new Set(['users','access_users','clients','partners','services','operations','commissions','invoices','institutions','import_batches','audit_log','companies','contacts','deals','activities','products','proposals','automations','client_documents','deal_documents','deal_history','whatsapp_integrations','whatsapp_messages','whatsapp_pending_actions','gestor_tf_audit','partner_settlements','partner_operation_adjustments','post_sale_tasks','crm_catalog_options','stored_files','source_records','migration_runs','auth_credentials','auth_sessions','auth_attempts','app_settings']);
  return masked
    .replace(/\?/g, () => `$${++parameter}`)
    .replace(/\bAS\s+([a-zA-Z_]\w*)/gi, (match, name: string) => /[A-Z]/.test(name) ? `AS ${quoteIdentifier(name)}` : match)
    .replace(/\b(FROM|JOIN|UPDATE|INTO)\s+([a-z_]\w*)\b/gi, (match, keyword: string, table: string) => tables.has(table.toLowerCase()) ? `${keyword} ${quoteIdentifier(schema)}.${quoteIdentifier(table)}` : match)
    .replace(/\u0001(\d+)\u0002/g, (_match, index: string) => literals[Number(index)]);
}

const valuesForPostgres = (values: unknown[]) => values.map((value) => {
  if (value == null) return null;
  if (typeof value === 'boolean') return Number(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return value;
});

export class PostgresStatement {
  readonly database: PostgresDatabase;
  readonly sql: string;
  readonly values: unknown[];
  constructor(database: PostgresDatabase, sql: string, values: unknown[] = []) {
    this.database = database; this.sql = sql; this.values = values;
  }
  bind(...values: unknown[]) { return new PostgresStatement(this.database, this.sql, valuesForPostgres(values)); }
  async execute<T = Record<string, unknown>>(client?: PoolClient) {
    const result = await (client || this.database.pool).query(postgresSql(this.sql, this.database.schema), this.values);
    return { success: true as const, results: result.rows as T[], meta: { changes: result.command === 'SELECT' ? 0 : result.rowCount || 0, last_row_id: Number(result.rows[0]?.id || 0), duration: 0 } };
  }
  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const { results } = await this.execute<Record<string, unknown>>();
    return (column ? results[0]?.[column] : results[0]) as T ?? null;
  }
  async all<T = Record<string, unknown>>() { return this.execute<T>(); }
  async run<T = Record<string, unknown>>() { return this.execute<T>(); }
  async raw<T = unknown[]>(): Promise<T[]> {
    const result = await this.database.pool.query({ text: postgresSql(this.sql, this.database.schema), values: this.values, rowMode: 'array' });
    return result.rows as T[];
  }
}

export class PostgresDatabase {
  readonly pool: pg.Pool;
  readonly schema: string;
  constructor(connectionString = process.env.DATABASE_URL, schema = databaseSchema()) {
    if (!connectionString) throw new Error('Configure DATABASE_URL para conectar ao PostgreSQL.');
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL deve ser uma conexão PostgreSQL.');
    // Retain certificate validation and SCRAM channel binding on Neon.
    if (url.hostname.endsWith('.neon.tech')) url.searchParams.set('sslmode', 'verify-full');
    this.schema = schema;
    // Vercel can keep several serverless instances warm at once. Keep one
    // connection per instance so traffic cannot multiply the pool against
    // Neon project limits; the pooler still handles concurrent clients.
    this.pool = new pg.Pool({ connectionString: url.toString(), enableChannelBinding: true, max: 1, maxUses: 100, idleTimeoutMillis: 5_000, connectionTimeoutMillis: 15_000, application_name: 'gestortf-nextjs' });
    this.pool.on('error', () => console.error('PostgreSQL: conexão ociosa encerrada; uma nova conexão será aberta.'));
  }
  prepare(sql: string) { return new PostgresStatement(this, sql); }
  async batch<T = Record<string, unknown>>(statements: PostgresStatement[]) {
    return this.transaction(async (client) => {
      const results = [];
      for (const statement of statements) {
        if (statement.database !== this) throw new Error('Statement belongs to another database');
        results.push(await statement.execute<T>(client));
      }
      return results;
    });
  }
  async transaction<T>(action: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO ${quoteIdentifier(this.schema)}`);
      const result = await action(client);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async close() { await this.pool.end(); }
}

/** Attachments live with the records, including on ephemeral Vercel instances. */
export class PostgresFiles {
  readonly db: PostgresDatabase;
  constructor(db: PostgresDatabase) { this.db = db; }
  async put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) {
    await this.db.prepare('INSERT INTO stored_files (key,body,content_type,updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body,content_type=excluded.content_type,updated_at=excluded.updated_at')
      .bind(key, value, options?.httpMetadata?.contentType || 'application/octet-stream', Date.now()).run();
    return { key };
  }
  async get(key: string) {
    const row = await this.db.prepare('SELECT body FROM stored_files WHERE key=?').bind(key).first<{ body: Buffer }>();
    return row ? { body: new Uint8Array(row.body), size: row.body.byteLength } : null;
  }
  async delete(keys: string | string[]) {
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.length) await this.db.batch(list.map((key) => this.db.prepare('DELETE FROM stored_files WHERE key=?').bind(key)));
  }
}
