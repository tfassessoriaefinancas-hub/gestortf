/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Long } from 'mongodb';
import { PostgresDatabase, quoteIdentifier } from './postgres.ts';
import { MongoDatabase, mongoDocument, fromMongo, rowIdentity } from './mongodb.ts';
import { mongoSchema } from './mongodb-schema.ts';

export type DatabaseSnapshot = { format: 'gestortf-postgres-v1'; exportedAt: string; sourceSchema: string; tables: Record<string, Record<string, any>[]>; sequences: Record<string, number>; hash: string };
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function digest(value: unknown) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
function encodeRow(table: string, input: Record<string, any>) {
  return Object.fromEntries(Object.keys(mongoSchema.tables[table].columns).map(name => {
    let value = fromMongo(input[name]);
    if (mongoSchema.tables[table].columns[name].type === 'bytea' && value != null) value = { base64: Buffer.from(value).toString('base64') };
    return [name, value ?? null];
  }));
}
function decodeRow(table: string, input: Record<string, any>) {
  return Object.fromEntries(Object.entries(input).map(([name, value]) => [name, mongoSchema.tables[table].columns[name]?.type === 'bytea' && value != null ? Buffer.from(value.base64, 'base64') : value]));
}
function validateSnapshot(snapshot: DatabaseSnapshot) {
  const { hash, ...contents } = snapshot;
  if (snapshot.format !== 'gestortf-postgres-v1' || digest(contents) !== hash) throw new Error('Snapshot incompleto ou checksum inválido.');
  if (!isDeepStrictEqual(Object.keys(snapshot.tables).sort(), Object.keys(mongoSchema.tables).sort())) throw new Error('O snapshot precisa incluir todas as tabelas atuais.');
  const identities=Object.entries(mongoSchema.tables).filter(([,definition])=>definition.identity).map(([name])=>name).sort();
  if(!snapshot.sequences||!isDeepStrictEqual(Object.keys(snapshot.sequences).sort(),identities)||Object.values(snapshot.sequences).some(value=>!Number.isSafeInteger(value)||value<0))throw new Error('Sequências de IDs ausentes ou inválidas.');
  const migrations = Object.fromEntries(snapshot.tables._schema_migrations.map(row => [row.name, row.checksum]));
  if (!isDeepStrictEqual(migrations, mongoSchema.migrations)) throw new Error('As migrações da origem são diferentes da aplicação.');
  const keys: Record<string, Set<string>> = {};
  for (const [table, rows] of Object.entries(snapshot.tables)) {
    keys[table] = new Set();
    for (const encoded of rows) {
      if (!isDeepStrictEqual(Object.keys(encoded).sort(), Object.keys(mongoSchema.tables[table].columns).sort())) throw new Error('Colunas divergentes: ' + table);
      const document = mongoDocument(table, decodeRow(table, encoded));
      if (keys[table].has(document._id)) throw new Error('Identificador duplicado: ' + table);
      keys[table].add(document._id);
    }
  }
  for (const [table, rows] of Object.entries(snapshot.tables)) for (const row of rows) for (const reference of mongoSchema.tables[table].references) {
    if (reference.columns.some(name => row[name] == null)) continue;
    const parent = Object.fromEntries(reference.foreignColumns.map((name, i) => [name, row[reference.columns[i]]]));
    if (!keys[reference.table].has(rowIdentity(reference.table, parent))) throw new Error('Referência ausente no snapshot: ' + table + ' → ' + reference.table);
  }
}

/** A single repeatable-read snapshot includes credentials, history, files and deleted records. */
export async function exportPostgresSnapshot(source: PostgresDatabase): Promise<DatabaseSnapshot> {
  const client = await source.pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='30000ms'");
    const names = (await client.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename', [source.schema])).rows.map(row => row.tablename);
    if (!isDeepStrictEqual(names, Object.keys(mongoSchema.tables).sort())) throw new Error('A origem tem tabelas ausentes ou adicionais; exportação interrompida para evitar perda de dados.');
    const tables: DatabaseSnapshot['tables'] = {};
    const sequences: Record<string, number> = {};
    for (const [table, definition] of Object.entries(mongoSchema.tables)) {
      const columns = (await client.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2', [source.schema, table])).rows.map(row => row.column_name).sort();
      if (!isDeepStrictEqual(columns, Object.keys(definition.columns).sort())) throw new Error('A origem tem colunas diferentes: ' + table);
      const rows = (await client.query(`SELECT * FROM ${quoteIdentifier(source.schema)}.${quoteIdentifier(table)} ORDER BY ${definition.primary.map(quoteIdentifier).join(',')}`)).rows;
      tables[table] = rows.map(row => encodeRow(table, row));
      if(definition.identity){
        const sequence=(await client.query('SELECT pg_get_serial_sequence($1,$2) AS name',[`${quoteIdentifier(source.schema)}.${quoteIdentifier(table)}`,definition.identity])).rows[0].name;
        const state=(await client.query(`SELECT last_value,is_called FROM ${sequence}`)).rows[0];
        sequences[table]=Number(state.last_value)-(state.is_called?0:1);
      }
    }
    await client.query('ROLLBACK');
    const contents = { format: 'gestortf-postgres-v1' as const, exportedAt: new Date().toISOString(), sourceSchema: source.schema, tables, sequences };
    const snapshot = { ...contents, hash: digest(contents) };
    validateSnapshot(snapshot);
    return snapshot;
  } finally { try { await client.query('ROLLBACK'); } catch {} client.release(); }
}

/** Destination verification compares every field, not just table counts. */
export async function verifyMongoSnapshot(destination: MongoDatabase, snapshot: DatabaseSnapshot, session?: import('mongodb').ClientSession) {
  validateSnapshot(snapshot);
  const db = await destination.connection(), counts: Record<string, number> = {};
  for (const [table, expected] of Object.entries(snapshot.tables)) {
    const actual = (await db.collection(table).find({}, { session }).toArray()).map(row => encodeRow(table, row));
    const byId = new Map(actual.map(row => [rowIdentity(table, row), row]));
    if (actual.length !== expected.length || expected.some(row => !isDeepStrictEqual(byId.get(rowIdentity(table, row)), row))) throw new Error('Conteúdo divergente no destino: ' + table);
    counts[table] = actual.length;
    const identity = mongoSchema.tables[table].identity;
    if (identity) {
      const counter = await db.collection<{ _id: string; value: Long }>('_tf_counters').findOne({ _id: table }, { session });
      const maximum = expected.reduce((maximum,row)=>Math.max(maximum,Number(row[identity])),snapshot.sequences[table]);
      if (!counter || fromMongo(counter.value) < maximum) throw new Error('Sequência de IDs divergente: ' + table);
    }
  }
  return counts;
}

export async function importMongoSnapshot(destination: MongoDatabase, snapshot: DatabaseSnapshot) {
  validateSnapshot(snapshot);
  const age = Date.now() - Date.parse(snapshot.exportedAt);
  if (!Number.isFinite(age) || age < -60000 || age > 3600000) throw new Error('Exporte novamente a origem: a transferência exige um snapshot com menos de uma hora.');
  await destination.initialize();
  const db = await destination.connection(), session = destination.client.startSession();
  try {
    return await session.withTransaction(async () => {
      await db.collection<{ _id: string; revision: Long }>('_tf_state').updateOne({ _id: 'write-lock' }, { $inc: { revision: Long.ONE } }, { session });
      const previous = await db.collection<{ _id: string; sourceHash: string }>('_tf_state').findOne({ _id: 'data-migration' }, { session });
      if (previous) {
        if (previous.sourceHash !== snapshot.hash) throw new Error('Destino já recebeu outra transferência. Nenhum registro foi sobrescrito.');
        return { alreadyImported: true, counts: await verifyMongoSnapshot(destination, snapshot, session) };
      }
      for (const table of Object.keys(mongoSchema.tables)) if (await db.collection(table).findOne({}, { session, projection: { _id: 1 } })) throw new Error('Destino já contém registros: ' + table);
      for (const [table, rows] of Object.entries(snapshot.tables)) {
        for (let offset = 0; offset < rows.length; offset += 250) await db.collection<any>(table).insertMany(rows.slice(offset, offset + 250).map(row => mongoDocument(table, decodeRow(table, row))), { session, ordered: true });
        const identity = mongoSchema.tables[table].identity;
        if (identity) await db.collection<{ _id: string; value: Long }>('_tf_counters').updateOne({ _id: table }, { $max: { value: Long.fromNumber(rows.reduce((maximum,row)=>Math.max(maximum,Number(row[identity])),snapshot.sequences[table])) } }, { session, upsert: true });
      }
      const counts = await verifyMongoSnapshot(destination, snapshot, session);
      await db.collection<any>('_tf_state').insertOne({ _id: 'data-migration', sourceHash: snapshot.hash, sourceExportedAt: snapshot.exportedAt, completedAt: new Date().toISOString(), counts }, { session });
      return { alreadyImported: false, counts };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 15000 });
  } finally { await session.endSession(); }
}
