/* eslint-disable @typescript-eslint/no-explicit-any */
import { MongoClient, Long, Binary, type ClientSession, type Db } from 'mongodb';
import { createHash } from 'node:crypto';
import { withDatabaseChanges } from './database-changes.ts';
import { collectionDefinition, mongoDatabaseName, mongoSchema } from './mongodb-schema.ts';
import { compileSelect, parseApplicationSql, sqlConstant, updateExpressions } from './mongodb-sql.ts';
import type { ApplicationDatabase, DatabaseClient, DatabaseRow, DatabaseStatement, QueryResult } from './database-types.ts';

const contractHash = createHash('sha256').update(JSON.stringify(mongoSchema)).digest('hex');
const duplicateCpfLegacyContractHash = 'c132da683c88171e108c223b548b7454b93ea4b4ae7c0ae8d8e7f51b701593a8';
type StoredDocument = DatabaseRow & { _id: string };
const binding = (value: unknown): unknown => {
  if (value == null) return null;
  if (typeof value === 'boolean') return Number(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return value;
};
export function fromMongo(value: any): any {
  if (Long.isLong(value)) {
    const result = value.toNumber();
    if (!Number.isSafeInteger(result)) throw new RangeError('Database number exceeds JavaScript precision');
    return result;
  }
  if (value instanceof Binary) return Buffer.from(value.buffer);
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(fromMongo);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, fromMongo(item)]));
  return value;
}
function databaseError(message: string, code: string): Error & { code: string } { return Object.assign(new Error(message), { code }); }
export function rowIdentity(table: string, row: DatabaseRow) {
  return JSON.stringify(collectionDefinition(table).primary.map(name => {
    if (row[name] == null) throw databaseError('Identificador ausente: ' + table + '.' + name, '23502');
    return fromMongo(row[name]);
  }));
}
/** Every SQL bigint is stored as BSON int64, including cents and numeric IDs. */
export function mongoDocument(table: string, input: DatabaseRow) {
  const definition = collectionDefinition(table), row: DatabaseRow = {};
  for (const [name, column] of Object.entries(definition.columns)) {
    let value = Object.hasOwn(input, name) ? input[name] : column.default;
    if (value === undefined) value = null;
    if (value == null) {
      if (column.required) throw databaseError('Campo obrigatório: ' + table + '.' + name, '23502');
      row[name] = null; continue;
    }
    if (column.type === 'bigint') {
      if (Long.isLong(value)) value = fromMongo(value);
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new RangeError('Inteiro inválido: ' + table + '.' + name);
      row[name] = Long.fromNumber(value);
    } else if (column.type === 'text') {
      if (typeof value !== 'string') throw new TypeError('Texto inválido: ' + table + '.' + name);
      row[name] = value;
    } else if (column.type === 'bytea') {
      if (value instanceof Binary) value = Buffer.from(value.buffer);
      if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) throw new TypeError('Arquivo inválido.');
      row[name] = new Binary(Buffer.from(value));
    } else if (column.type === 'jsonb') row[name] = typeof value === 'string' ? JSON.parse(value) : value;
    else throw new Error('Tipo não suportado: ' + column.type);
  }
  for (const index of definition.indexes) for (const field of Object.keys(index.fields)) if (field.startsWith('__tf_lower_')) {
    const source = field.slice('__tf_lower_'.length);
    row[field] = row[source] == null || row[source] === '' ? null : String(row[source]).toLowerCase();
  }
  row._id = rowIdentity(table, row);
  return row as StoredDocument;
}

class MongoTransaction implements DatabaseClient {
  readonly changes = new Map<string, Set<string>>();
  readonly deleted = new Map<string, DatabaseRow[]>();
  readonly database: MongoDatabase;
  readonly session: ClientSession;
  constructor(database: MongoDatabase, session: ClientSession) { this.database = database; this.session = session; }
  async query<T extends DatabaseRow = DatabaseRow>(sql: string, values: any[] = []) { return this.database.query<T>(sql, values, this); }
  changed(table: string, id: string) {
    if (!this.changes.has(table)) this.changes.set(table, new Set());
    this.changes.get(table)!.add(id);
  }
  async validateReferences() {
    const db = await this.database.connection();
    const options = { session: this.session };
    for (const [table, ids] of this.changes) {
      const references = collectionDefinition(table).references;
      if (!references.length) continue;
      for (const id of ids) {
        const row = await db.collection<StoredDocument>(table).findOne({ _id: id }, options);
        if (!row) continue;
        for (const reference of references) {
          if (reference.columns.some(name => row[name] == null)) continue;
          const filter = Object.fromEntries(reference.foreignColumns.map((name, i) => [name, row[reference.columns[i]]]));
          if (!await db.collection(reference.table).findOne(filter, { ...options, projection: { _id: 1 } })) throw databaseError('Referência inexistente: ' + table + ' → ' + reference.table, '23503');
        }
      }
    }
    for (const [table, rows] of this.deleted) for (const row of rows) {
      if (await db.collection<StoredDocument>(table).findOne({ _id: rowIdentity(table, row) }, options)) continue;
      for (const [child, definition] of Object.entries(mongoSchema.tables)) for (const reference of definition.references.filter(r => r.table === table)) {
        const filter = Object.fromEntries(reference.columns.map((name, i) => [name, row[reference.foreignColumns[i]]]));
        if (await db.collection(child).findOne(filter, { ...options, projection: { _id: 1 } })) throw databaseError('Registro ainda referenciado: ' + child + ' → ' + table, '23503');
      }
    }
  }
}

export class MongoStatement implements DatabaseStatement {
  readonly database: MongoDatabase;
  readonly sql: string;
  readonly values: unknown[];
  constructor(database: MongoDatabase, sql: string, values: unknown[] = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values: unknown[]) { return new MongoStatement(this.database, this.sql, values.map(binding)); }
  async execute<T = DatabaseRow>(client?: DatabaseClient) {
    const result = await (client || this.database).query(this.sql, this.values);
    return { success: true as const, results: result.rows as T[], meta: { changes: result.command === 'SELECT' ? 0 : result.rowCount || 0, last_row_id: Number(result.rows[0]?.id || 0), duration: 0 } };
  }
  async first<T = DatabaseRow>(column?: string): Promise<T | null> { const { results } = await this.execute<DatabaseRow>(); return (column ? results[0]?.[column] : results[0]) as T ?? null; }
  async all<T = DatabaseRow>() { return this.execute<T>(); }
  async run<T = DatabaseRow>() { return this.execute<T>(); }
  async raw<T = unknown[]>() { return (await this.execute<DatabaseRow>()).results.map(row => Object.values(row)) as T[]; }
}

export class MongoDatabase implements ApplicationDatabase, DatabaseClient {
  readonly client: MongoClient;
  readonly name: string;
  private connected?: Promise<Db>;
  private ready?: Promise<void>;
  constructor(uri = process.env.MONGODB_URI, database = process.env.MONGODB_DATABASE) {
    if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri)) throw new Error('Configure MONGODB_URI para conectar ao MongoDB.');
    this.name = mongoDatabaseName(database);
    this.client = new MongoClient(uri, { maxPoolSize: 5, minPoolSize: 0, maxIdleTimeMS: 30000, serverSelectionTimeoutMS: 15000, waitQueueTimeoutMS: 15000, promoteLongs: false, retryWrites: true });
  }
  connection() {
    if (!this.connected) this.connected = this.client.connect().then(client => client.db(this.name)).catch(error => { this.connected = undefined; throw error; });
    return this.connected;
  }
  private async upgradeCompatibleSchema(db: Db, marker: StoredDocument | null) {
    if (marker?.hash !== duplicateCpfLegacyContractHash) return marker;
    const clients = db.collection('clients');
    const indexes = await clients.listIndexes().toArray();
    if (indexes.some(index => index.name === 'clients_owner_cpf_unique')) {
      try { await clients.dropIndex('clients_owner_cpf_unique'); }
      catch (error) { if ((error as { code?: number }).code !== 27) throw error; }
    }
    await clients.createIndex({ owner_id: 1, cpf: 1 }, { name: 'idx_clients_owner_cpf' });
    await db.collection('deals').updateMany({ stage: 'fechamento' }, { $set: { stage: 'assinatura' } });
    await db.collection('deals').updateMany({ stage: 'contratado' }, { $set: { stage: 'finalizado' } });
    await db.collection('operations').updateMany({ status: 'fechamento' }, { $set: { status: 'assinatura' } });
    await db.collection('operations').updateMany({ status: 'contratado' }, { $set: { status: 'finalizado' } });
    await db.collection<StoredDocument>('_tf_state').updateOne(
      { _id: 'schema', hash: duplicateCpfLegacyContractHash },
      { $set: { hash: contractHash, version: mongoSchema.version, migratedAt: Date.now() } },
    );
    return db.collection<StoredDocument>('_tf_state').findOne({ _id: 'schema' });
  }
  private async assertReady() {
    if (!this.ready) this.ready = this.connection().then(async db => {
      const marker = await this.upgradeCompatibleSchema(db, await db.collection<StoredDocument>('_tf_state').findOne({ _id: 'schema' }));
      if (marker?.hash !== contractHash) throw new Error('Estrutura MongoDB não inicializada ou incompatível. Execute db:migrate:mongodb antes de ativar a base.');
      if (!/^tf_test_[a-f0-9]{16}$/.test(this.name)) {
        const migrated = await db.collection<StoredDocument>('_tf_state').findOne({ _id: 'data-migration' });
        const fresh = await db.collection<StoredDocument>('_tf_state').findOne({ _id: 'empty-start', mode: 'empty-with-admin' });
        if (!migrated && !fresh?.ownerId) throw new Error('Base ainda não migrada ou inicializada explicitamente com administrador.');
      }
    }).catch(error => { this.ready = undefined; throw error; });
    return this.ready;
  }
  async initialize() {
    const db = await this.connection();
    const marker = await this.upgradeCompatibleSchema(db, await db.collection<StoredDocument>('_tf_state').findOne({ _id: 'schema' }));
    if (marker && marker.hash !== contractHash) throw new Error('A estrutura MongoDB existente é diferente; migração explícita necessária.');
    const existing = await db.listCollections({}, { nameOnly: true }).toArray();
    if (!marker) for (const collection of existing) {
      if (!mongoSchema.tables[collection.name] && !['_tf_state', '_tf_counters'].includes(collection.name)) throw new Error('Destino contém coleções de outro sistema.');
      if (mongoSchema.tables[collection.name] && await db.collection(collection.name).findOne({}, { projection: { _id: 1 } })) throw new Error('Destino contém dados sem registro de migração.');
    }
    for (const [table, definition] of Object.entries(mongoSchema.tables)) {
      if (!existing.some(c => c.name === table)) await db.createCollection(table);
      const collection = db.collection(table);
      await collection.createIndex(Object.fromEntries(definition.primary.map(name => [name, 1])), { name: 'tf_primary', unique: true });
      for (const index of definition.indexes) {
        const partial: Record<string, any> = {};
        if (index.unique) for (const field of Object.keys(index.fields)) {
          const column = definition.columns[field];
          if (field.startsWith('__tf_lower_')) partial[field] = { $type: 'string' };
          else if (!column.required) partial[field] = { $type: column.type === 'text' ? 'string' : 'number' };
        }
        await collection.createIndex(index.fields as any, { name: index.name, unique: index.unique, ...(Object.keys(partial).length ? { partialFilterExpression: partial } : {}) });
      }
      // Foreign-key probes at commit must stay bounded by an index.
      for (const reference of definition.references) {
        const indexed = definition.indexes.some(index => reference.columns.every((name, i) => Object.keys(index.fields)[i] === name));
        if (!indexed) await collection.createIndex(Object.fromEntries(reference.columns.map(name => [name, 1])), { name: 'tf_reference_' + reference.columns.join('_') });
      }
    }
    await db.collection<StoredDocument>('_tf_state').updateOne({ _id: 'write-lock' }, { $setOnInsert: { revision: Long.ZERO } }, { upsert: true });
    await db.collection<StoredDocument>('_tf_state').updateOne({ _id: 'schema' }, { $setOnInsert: { hash: contractHash, version: mongoSchema.version, initializedAt: Date.now() } }, { upsert: true });
    // Collection creation must happen before a transaction, including on older Atlas tiers.
    await db.collection<StoredDocument>('_tf_counters').updateOne({ _id: '__initialized' }, { $setOnInsert: { value: Long.ZERO } }, { upsert: true });
    this.ready = undefined;
  }
  prepare(sql: string) { return new MongoStatement(this, sql); }
  async batch<T = DatabaseRow>(statements: DatabaseStatement[]) {
    return this.transaction(async client => {
      const results = [];
      for (const statement of statements) {
        if (statement.database !== this) throw new Error('Statement belongs to another database');
        results.push(await statement.execute<T>(client));
      }
      return results;
    });
  }
  async transaction<T>(action: (client: DatabaseClient) => Promise<T>): Promise<T> {
    await this.assertReady();
    const db = await this.connection(), session = this.client.startSession();
    try {
      return await session.withTransaction(async () => {
        // A shared write guard gives SQL's FOR UPDATE/advisory-lock callers a
        // serializable write boundary across all serverless instances. The
        // driver retries write conflicts with a new snapshot before any reads.
        await db.collection<StoredDocument>('_tf_state').updateOne({ _id: 'write-lock' }, { $inc: { revision: Long.ONE } }, { session });
        const transaction = new MongoTransaction(this, session);
        const result = await withDatabaseChanges(transaction, action);
        await transaction.validateReferences();
        return result;
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 15000 }) as T;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw databaseError('Registro duplicado.', '23505');
      throw error;
    } finally { await session.endSession(); }
  }
  private async select(statement: any, values: unknown[], transaction?: MongoTransaction) {
    const plan = compileSelect(statement, values), db = await this.connection();
    return (await db.collection(plan.collection).aggregate(plan.pipeline, { session: transaction?.session, maxTimeMS: 30000 }).toArray()).map(fromMongo) as DatabaseRow[];
  }
  private async returning(table: string, returning: any[], ids: string[], transaction: MongoTransaction) {
    if (!returning?.length || !ids.length) return [];
    const plan = compileSelect({ type: 'select', from: [{ type: 'table', name: { name: table } }], columns: returning });
    plan.pipeline.unshift({ $match: { _id: { $in: ids } } });
    return (await (await this.connection()).collection(table).aggregate(plan.pipeline, { session: transaction.session }).toArray()).map(fromMongo);
  }
  private async update(table: string, ids: string[], sets: any[], values: unknown[], transaction: MongoTransaction, excluded?: DatabaseRow) {
    const collection = (await this.connection()).collection<StoredDocument>(table), pipeline = updateExpressions(table, sets, values, excluded);
    for (const id of ids) {
      const updated = await collection.findOneAndUpdate({ _id: id }, pipeline, { session: transaction.session, returnDocument: 'after' });
      if (!updated) throw new Error('Registro alterado durante a transação.');
      const normalized = mongoDocument(table, fromMongo(updated));
      await collection.replaceOne({ _id: id }, normalized, { session: transaction.session });
      transaction.changed(table, id);
    }
  }
  async query<T extends DatabaseRow = DatabaseRow>(sql: string, rawValues: any[] = [], transaction?: MongoTransaction): Promise<QueryResult<T>> {
    await this.assertReady();
    const values = rawValues.map(binding);
    if (/^\s*SELECT pg_advisory_xact_lock\(/i.test(sql)) {
      if (!transaction) throw new Error('Bloqueio requer transação.');
      return { rows: [], rowCount: 1, command: 'SELECT' };
    }
    const statement = parseApplicationSql(sql);
    if (['select', 'union', 'union all'].includes(statement.type)) {
      const rows = await this.select(statement, values, transaction);
      return { rows: rows as T[], rowCount: rows.length, command: 'SELECT' };
    }
    if (!['insert', 'update', 'delete'].includes(statement.type)) throw new Error('Comando não permitido no MongoDB: ' + statement.type);
    if (!transaction) return this.transaction(client => client.query<T>(sql, values));
    const table = statement.into?.name || statement.table?.name || statement.from?.name;
    const definition = collectionDefinition(table), db = await this.connection();
    const collection = db.collection<StoredDocument>(table), options = { session: transaction.session };
    const ids: string[] = [];
    if (statement.type === 'insert') {
      const columns = statement.columns?.map((column: any) => column.name) || Object.keys(definition.columns);
      for (const name of columns) if (!definition.columns[name]) throw new Error('Coluna desconhecida: ' + name);
      const source = statement.insert.type === 'values'
        ? statement.insert.values.map((row: any[]) => row.map(value => sqlConstant(value, values)))
        : (await this.select(statement.insert, values, transaction)).map(row => Object.values(row));
      for (const input of source) {
        if (input.length !== columns.length) throw new Error('Quantidade de valores divergente.');
        const row = Object.fromEntries(columns.map((name: string, index: number) => [name, input[index]]));
        if (definition.identity) {
          const explicit = row[definition.identity];
          if (explicit == null) {
            const counter = await db.collection<StoredDocument>('_tf_counters').findOneAndUpdate({ _id: table }, { $inc: { value: Long.ONE } }, { ...options, upsert: true, returnDocument: 'after' });
            row[definition.identity] = fromMongo(counter!.value);
          } else {
            if (!Number.isSafeInteger(explicit)) throw new RangeError('ID inválido.');
            await db.collection<StoredDocument>('_tf_counters').updateOne({ _id: table }, { $max: { value: Long.fromNumber(explicit) } }, { ...options, upsert: true });
          }
        }
        const document = mongoDocument(table, row);
        if (statement.onConflict) {
          const fields = statement.onConflict.on?.exprs?.map((expr: any) => expr.type === 'ref' ? expr.name : null);
          if (!fields?.length || fields.some((name: string) => !definition.columns[name])) throw new Error('Conflito sem chave explícita.');
          const existing = fields.every((name: string) => document[name] != null) ? await collection.findOne(Object.fromEntries(fields.map((name: string) => [name, document[name]])), options) : null;
          if (existing) {
            if (statement.onConflict.do === 'do nothing') continue;
            await this.update(table, [existing._id], statement.onConflict.do.sets, values, transaction, document);
            ids.push(existing._id); continue;
          }
        }
        await collection.insertOne(document, options);
        ids.push(document._id); transaction.changed(table, document._id);
      }
    } else {
      const matched = await this.select({ type: 'select', columns: [{ expr: { type: 'ref', name: '*' } }], from: [{ type: 'table', name: { name: table } }], where: statement.where }, values, transaction);
      ids.push(...matched.map(row => rowIdentity(table, row)));
      if (statement.type === 'update') await this.update(table, ids, statement.sets, values, transaction);
      else if (ids.length) {
        await collection.deleteMany({ _id: { $in: ids } }, options);
        transaction.deleted.set(table, [...(transaction.deleted.get(table) || []), ...matched]);
      }
    }
    if (statement.type === 'delete' && statement.returning) throw new Error('DELETE RETURNING não suportado.');
    const rows = await this.returning(table, statement.returning, ids, transaction);
    return { rows: rows as T[], rowCount: ids.length, command: statement.type.toUpperCase() };
  }
  async close() { await this.client.close(); this.connected = undefined; this.ready = undefined; }
}
