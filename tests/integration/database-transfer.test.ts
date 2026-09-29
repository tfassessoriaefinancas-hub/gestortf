import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PostgresDatabase, quoteIdentifier } from '../../lib/postgres.ts';
import { migratePostgres } from '../../lib/postgres-migrate.ts';
import { MongoDatabase } from '../../lib/mongodb.ts';
import { exportPostgresSnapshot, importMongoSnapshot, verifyMongoSnapshot } from '../../lib/database-transfer.ts';

test('a full PostgreSQL snapshot migrates without changing IDs, credentials, history, JSON or bytes', { timeout: 180000 }, async () => {
  if (!process.env.TRANSFER_TEST_POSTGRES_URL) throw new Error('Configure TRANSFER_TEST_POSTGRES_URL for the isolated migration test.');
  const name = 'tf_test_' + randomBytes(8).toString('hex');
  const source = new PostgresDatabase(process.env.TRANSFER_TEST_POSTGRES_URL, name);
  const destination = new MongoDatabase(process.env.MONGODB_URI, name);
  let created = false;
  try {
    await migratePostgres(source); created = true;
    await source.batch([
      source.prepare("INSERT INTO users (id,email,name,cpf,created_at,updated_at) VALUES ('owner','test@example.com','Teste','01234567890',1,1)"),
      source.prepare("INSERT INTO auth_credentials (user_id,password_hash,updated_at) VALUES ('owner','preserve-exact-hash',1)"),
      source.prepare("INSERT INTO auth_sessions (token_hash,user_id,created_at,expires_at) VALUES ('preserve-session','owner',1,9999999999999)"),
      source.prepare("INSERT INTO app_settings (key,value) VALUES ('owner_id','owner'),('owner_email','test@example.com')"),
      source.prepare("INSERT INTO clients (id,owner_id,name,normalized_name,cpf,source_row,created_at,updated_at) VALUES (900,'owner','Cliente','cliente','00123456789','original-history',1,2)"),
      source.prepare("INSERT INTO operations (id,owner_id,client_id,value_cents,is_historical,notes,created_at,updated_at) VALUES (800,'owner',900,4265000,1,?,1,2)").bind(JSON.stringify({ commissionRate: 4, source: 'original' })),
      source.prepare("INSERT INTO commissions (id,owner_id,operation_id,value_cents,received_at,status,created_at,updated_at) VALUES (700,'owner',800,170600,'2026-09-21','recebida',1,2)"),
      source.prepare("INSERT INTO source_records (source,source_id,payload) VALUES ('original','1',?)").bind(JSON.stringify({ _id: 'source-id', __tf_source: 'original', nested: { value: 12345 } })),
      source.prepare("INSERT INTO stored_files (key,body,content_type,updated_at) VALUES ('doc',?,'application/octet-stream',1)").bind(Buffer.from([0,1,255,128])),
    ]);
    // Deleted/rolled-back IDs may leave the sequence ahead of the live records.
    await source.pool.query("SELECT setval(pg_get_serial_sequence($1,'id'),1200,true)",[`${quoteIdentifier(name)}.operations`]);
    const snapshot = await exportPostgresSnapshot(source);
    assert.equal(Object.keys(snapshot.tables).length, 37);
    const result = await importMongoSnapshot(destination, snapshot);
    assert.equal(result?.counts.operations, 1);
    assert.equal(result?.counts.clients, 1);
    assert.equal((await importMongoSnapshot(destination, snapshot))?.alreadyImported, true);
    assert.deepEqual(await verifyMongoSnapshot(destination, snapshot), result?.counts);
    assert.equal(await destination.prepare('SELECT password_hash FROM auth_credentials').first('password_hash'), 'preserve-exact-hash');
    const added = await destination.prepare("INSERT INTO operations (owner_id,client_id,created_at,updated_at) VALUES ('owner',900,1,1) RETURNING id").first();
    assert.equal(added?.id, 1201);
    await assert.rejects(importMongoSnapshot(destination, snapshot), /Conteúdo divergente/);
    assert.equal(await source.prepare('SELECT COUNT(*) AS count FROM operations').first('count'), 1);
    await assert.rejects(importMongoSnapshot(destination, { ...snapshot, hash: 'modified' }), /checksum/);
  } finally {
    if (!/^tf_test_[a-f0-9]{16}$/.test(name)) throw new Error('Unsafe cleanup name');
    try { if (created) await source.pool.query(`DROP SCHEMA ${quoteIdentifier(name)} CASCADE`); }
    finally { await source.close(); }
    try { await (await destination.connection()).dropDatabase(); }
    finally { await destination.close(); }
  }
});
