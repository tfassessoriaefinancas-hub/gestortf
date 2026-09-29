import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { MongoDatabase, mongoDocument } from '../../lib/mongodb.ts';
import { initializeEmptyMongo } from '../../lib/mongodb-bootstrap.ts';
import { verifyPassword } from '../../lib/password.ts';

const admin = { id: 'bootstrap-owner', email: 'owner@example.com', name: 'Administrador de teste', login: '01234567890', password: 'test-only-bootstrap-password' };

test('an explicit fresh start unlocks a non-bypassed database with a working administrator and no business history', { timeout: 120000 }, async () => {
  const name = 'tf_test_bootstrap_' + randomBytes(8).toString('hex');
  const database = new MongoDatabase(process.env.MONGODB_URI, name);
  const reconnected = new MongoDatabase(process.env.MONGODB_URI, name);
  let connected = false;
  try {
    await database.connection(); connected = true;
    await database.initialize();
    await assert.rejects(database.prepare('SELECT COUNT(*) AS count FROM clients').first(), /não migrada ou inicializada/);
    assert.equal((await initializeEmptyMongo(database, admin))?.alreadyInitialized, false);
    const account = await reconnected.prepare('SELECT u.id,u.role,u.cpf,c.password_hash FROM users u JOIN auth_credentials c ON c.user_id=u.id WHERE u.email=? AND u.active=1 AND u.deleted_at IS NULL').bind(admin.email).first<{ id: string; role: string; cpf: string; password_hash: string }>();
    assert.ok(account);
    assert.equal(account.id, admin.id);
    assert.equal(account.cpf, admin.login);
    assert.equal(account.role, 'admin');
    assert.equal(await verifyPassword(admin.password, account.password_hash), true);
    assert.equal(await reconnected.prepare("SELECT value FROM app_settings WHERE key='owner_id'").first('value'), admin.id);
    for (const table of ['clients', 'operations', 'commissions', 'partners', 'stored_files', 'source_records']) assert.equal(await reconnected.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first('count'), 0);
    const connection = await database.connection();
    assert.equal(await connection.collection<{ _id: string }>('_tf_state').findOne({ _id: 'data-migration' }), null, 'empty initialization must not claim a historical migration');
    await database.prepare("INSERT INTO clients (owner_id,name,normalized_name,created_at,updated_at) VALUES (?,'New client','new client',1,1)").bind(admin.id).run();
    assert.equal((await initializeEmptyMongo(database, { ...admin, password: 'must-not-reset-the-password' }))?.alreadyInitialized, true);
    assert.equal(await reconnected.prepare('SELECT COUNT(*) AS count FROM clients').first('count'), 1);
    assert.equal(await reconnected.prepare('SELECT password_hash FROM auth_credentials').first('password_hash'), account.password_hash);
    await assert.rejects(initializeEmptyMongo(database, { ...admin, id: 'another-owner' }), /outro administrador/);
  } finally {
    await reconnected.close();
    try { if (connected) await (await database.connection()).dropDatabase(); }
    finally { await database.close(); }
  }
});

test('fresh initialization refuses existing unmarked data without deleting or replacing it', { timeout: 120000 }, async () => {
  const database = new MongoDatabase(process.env.MONGODB_URI, 'tf_test_bootstrap_' + randomBytes(8).toString('hex'));
  let connected = false;
  try {
    await database.connection(); connected = true;
    await database.initialize();
    const connection = await database.connection();
    await connection.collection<ReturnType<typeof mongoDocument>>('app_settings').insertOne(mongoDocument('app_settings', { key: 'existing', value: 'preserve' }));
    await assert.rejects(initializeEmptyMongo(database, admin), /destino já contém registros/);
    assert.equal((await connection.collection('app_settings').findOne({ key: 'existing' }))?.value, 'preserve');
    assert.equal(await connection.collection('users').countDocuments(), 0);
    assert.equal(await connection.collection<{ _id: string }>('_tf_state').findOne({ _id: 'empty-start' }), null);
  } finally {
    try { if (connected) await (await database.connection()).dropDatabase(); }
    finally { await database.close(); }
  }
});
