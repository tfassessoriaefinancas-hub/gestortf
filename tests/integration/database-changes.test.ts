import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PostgresDatabase, quoteIdentifier } from '../../lib/postgres.ts';
import { MongoDatabase } from '../../lib/mongodb.ts';
import { migratePostgres } from '../../lib/postgres-migrate.ts';

for (const provider of ['postgres', 'mongodb'] as const) test(`${provider}: revisions persist with commits, survive reconnects and roll back with data`, { timeout: 120000 }, async () => {
  const name = `tf_test_${randomBytes(8).toString('hex')}`;
  if (provider === 'postgres' && !process.env.TRANSFER_TEST_POSTGRES_URL) throw new Error('Set TRANSFER_TEST_POSTGRES_URL for the isolated schema.');
  const db = provider === 'postgres' ? new PostgresDatabase(process.env.TRANSFER_TEST_POSTGRES_URL, name) : new MongoDatabase(process.env.MONGODB_URI, name);
  const other = provider === 'postgres' ? new PostgresDatabase(process.env.TRANSFER_TEST_POSTGRES_URL, name) : new MongoDatabase(process.env.MONGODB_URI, name);
  const revisions = async () => (await other.prepare("SELECT key,value FROM app_settings WHERE key LIKE 'crm_revision:%' ORDER BY key").all()).results;
  try {
    if (db instanceof PostgresDatabase) await migratePostgres(db); else await db.initialize();
    await db.prepare("INSERT INTO users (id,email,name,created_at,updated_at) VALUES ('owner','test@example.com','Owner',1,1)").run();
    const before = await revisions();
    await db.prepare("INSERT INTO auth_sessions (token_hash,user_id,created_at,expires_at) VALUES ('session','owner',1,9999999999999)").run();
    assert.deepEqual(await revisions(), before, 'authentication must not cause data reloads');
    await db.batch([
      db.prepare("INSERT INTO clients (id,owner_id,name,normalized_name,created_at,updated_at) VALUES (10,'owner','Client','client',1,1)"),
      db.prepare("INSERT INTO operations (id,owner_id,client_id,value_cents,created_at,updated_at) VALUES (20,'owner',10,123456,1,1)"),
    ]);
    const initial = await revisions();
    assert.ok(initial.some(row => row.key === 'crm_revision:crm'));
    await db.prepare('UPDATE operations SET value_cents=1 WHERE id=999').run();
    assert.deepEqual(await revisions(), initial, 'an unmatched update must not publish changes');
    await assert.rejects(db.transaction(async client => {
      await client.query('UPDATE operations SET value_cents=$1 WHERE id=$2', [999, 20]);
      throw new Error('rollback');
    }), /rollback/);
    assert.deepEqual(await revisions(), initial);
    assert.equal(await other.prepare('SELECT value_cents FROM operations WHERE id=20').first('value_cents'), 123456);
    await db.transaction(client => client.query('UPDATE operations SET value_cents=$1 WHERE id=$2', [654321, 20]));
    const updated = await revisions();
    assert.notEqual(updated.find(row => row.key === 'crm_revision:crm')?.value, initial.find(row => row.key === 'crm_revision:crm')?.value);
    await db.prepare('DELETE FROM operations WHERE id=20').run();
    assert.notDeepEqual(await revisions(), updated, 'physical deletions must invalidate history too');
    const beforeReads = await revisions();
    await other.prepare('SELECT * FROM clients').all();
    assert.deepEqual(await revisions(), beforeReads, 'reads must never invalidate themselves');
  } finally {
    await other.close();
    try { if (db instanceof PostgresDatabase) await db.pool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(name)} CASCADE`); else await (await db.connection()).dropDatabase(); }
    finally { await db.close(); }
  }
});
