import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { MongoDatabase, mongoDocument } from '../../lib/mongodb.ts';
import { DatabaseFiles } from '../../lib/database.ts';
import { readOperations } from '../../lib/operations.ts';
import { updateOperationRecord } from '../../lib/update-operation.ts';

const name = 'tf_test_' + randomBytes(8).toString('hex');
const database = new MongoDatabase(process.env.MONGODB_URI, name);
before(async () => { await database.initialize(); }, { timeout: 120000 });
after(async () => {
  try { if (/^tf_test_[a-f0-9]{16}$/.test(name) && database.name === name) await (await database.connection()).dropDatabase(); }
  finally { await database.close(); }
});
const access = { ownerKeys: ['test-owner', 'test@example.com'], role: 'admin', memberId: null, partnerId: null };

test('binds literal values and preserves SQL null, aliases, LIKE and aggregate semantics', async () => {
  const strange = "O'Brien $1 ? AS Foo";
  const row = await database.prepare('SELECT ? AS literal,? AS missing,? AS enabled').bind(strange, null, true).first();
  assert.deepEqual(row, { literal: strange, missing: null, enabled: 1 });
  assert.deepEqual(await database.prepare('SELECT COUNT(*) AS count,SUM(value_cents) AS total FROM operations').first(), { count: 0, total: null });
  await database.prepare('INSERT INTO clients (owner_id,name,normalized_name,cpf,created_at,updated_at) VALUES (?,?,?,?,1,1),(?,?,?,?,1,2),(?,?,?,?,1,3)').bind('test-owner','Sem CPF','sem cpf',null,'test-owner','Outro sem CPF','outro',null,'test-owner',strange,'obrien','11111111111').run();
  assert.equal((await database.prepare('SELECT id FROM clients WHERE cpf NOT IN (?,?)').bind('222','333').all()).results.length, 1);
  assert.equal((await database.prepare('SELECT id FROM clients WHERE cpf NOT IN (?,NULL)').bind('222').all()).results.length, 0);
  assert.equal((await database.prepare("SELECT id FROM clients WHERE name LIKE ?").bind("O'Brien%").all()).results.length, 1);
  const ordered = (await database.prepare('SELECT cpf FROM clients ORDER BY cpf ASC').all()).results;
  assert.deepEqual(ordered.map(r => r.cpf), ['11111111111', null, null]);
  assert.equal((await database.prepare('SELECT id AS clientId FROM clients WHERE cpf=?').bind('11111111111').first())?.clientId, 3);
  assert.equal((await database.prepare('SELECT id FROM clients WHERE id IN (?)').bind(3).first())?.id, 3);
});

test('upserts, uniqueness and rate-limit expressions are atomic under concurrency', async () => {
  await Promise.all(Array.from({ length: 4 }, () => database.prepare('INSERT INTO auth_attempts (key,attempts,window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_attempts.window_start<? THEN 1 ELSE auth_attempts.attempts+1 END,window_start=CASE WHEN auth_attempts.window_start<? THEN excluded.window_start ELSE auth_attempts.window_start END RETURNING attempts').bind('account',100,0,0).run()));
  assert.equal((await database.prepare('SELECT attempts FROM auth_attempts WHERE key=?').bind('account').first())?.attempts, 4);
  await assert.rejects(database.prepare('INSERT INTO clients (owner_id,name,normalized_name,cpf,created_at,updated_at) VALUES (?,?,?,?,1,1)').bind('test-owner','Duplicado','duplicado','11111111111').run(), { code: '23505' });
  assert.equal((await database.prepare('INSERT INTO auth_attempts (key,attempts,window_start) VALUES (?,9,1) ON CONFLICT(key) DO NOTHING').bind('account').run()).meta.changes, 0);
});

test('transactions preserve foreign keys and roll back all partial changes', async () => {
  await assert.rejects(database.batch([
    database.prepare("INSERT INTO companies (owner_id,name,created_at) VALUES ('test-owner','Rollback',1)"),
    database.prepare("INSERT INTO contacts (company_id,name) VALUES (999999,'Invalid parent')"),
  ]), { code: '23503' });
  assert.equal(await database.prepare('SELECT COUNT(*) AS count FROM companies').first('count'), 0);
  await database.batch([
    database.prepare("INSERT INTO contacts (company_id,name) VALUES (100,'Deferred parent')"),
    database.prepare("INSERT INTO companies (id,owner_id,name,created_at) VALUES (100,'test-owner','Parent',1)"),
  ]);
  await assert.rejects(database.prepare('DELETE FROM companies WHERE id=100').run(), { code: '23503' });
});

test('operations, lateral joins and financial edits preserve IDs, payment dates and provenance', async () => {
  await database.batch([
    database.prepare("INSERT INTO partners (id,owner_id,name,created_at,updated_at) VALUES (50,'test-owner','GG Veículos',1,1)"),
    database.prepare("INSERT INTO operations (id,owner_id,client_id,partner_id,value_cents,original_product,notes,source_row,completed_at,created_at,updated_at) VALUES (50,'test-owner',3,50,1000000,'Financiamento',?,'imported-source','2026-09-20',1,1)").bind(JSON.stringify({ commissionRate: 6, observations: 'Preservar', advisoryFeeCents: 10000 })),
    database.prepare("INSERT INTO commissions (id,owner_id,operation_id,rate_bps,value_cents,expected_at,received_at,status,notes,created_at,updated_at) VALUES (50,'test-owner',50,600,60000,'2026-09-20','2026-09-21','recebida','Comissão',1,1),(51,'test-owner',50,NULL,10000,'2026-09-20',NULL,'prevista','Taxa de assessoria',1,1)"),
    database.prepare("INSERT INTO partner_operation_adjustments (owner_id,partner_id,operation_id,ila_rate_bps,invoice_rate_bps,tf_share_bps,created_at,updated_at) VALUES ('test-owner',50,50,2660,201,5000,1,1)"),
  ]);
  const before = (await readOperations(database, access))[0];
  assert.equal(before.dbId, 50); assert.equal(before.clientName, "O'Brien $1 ? AS Foo");
  assert.equal(before.partnerName, 'GG Veículos'); assert.equal(before.commissionRate, 6);
  const edited = await updateOperationRecord(database, access, 50, { commissionRate: 4 });
  assert.equal(edited.dbId, 50); assert.equal(edited.commissionRate, 4);
  const commission = await database.prepare('SELECT * FROM commissions WHERE id=50').first();
  assert.equal(commission?.value_cents, 40000); assert.equal(commission?.received_at, '2026-09-21');
  assert.equal(await database.prepare('SELECT source_row FROM operations WHERE id=50').first('source_row'), 'imported-source');
  assert.equal(await database.prepare('SELECT COUNT(*) AS count FROM operations').first('count'), 1);
  const native = await (await database.connection()).collection('operations').findOne({ id: 50 });
  assert.equal(native?.value_cents?._bsontype, 'Long');
  const employees = await readOperations(database, { ...access, role: 'employee', memberId: 999 });
  assert.deepEqual(employees, []);
});

test('subqueries, aggregates, group by, INSERT SELECT, UNION and physical deletion work', async () => {
  assert.equal((await database.prepare('SELECT c.id FROM clients c WHERE EXISTS (SELECT 1 FROM operations o WHERE o.client_id=c.id)').all()).results.length, 1);
  const group = await database.prepare('SELECT o.partner_id,substr(cm.expected_at,1,7) AS period,SUM(cm.value_cents) AS total FROM commissions cm JOIN operations o ON o.id=cm.operation_id GROUP BY o.partner_id,substr(cm.expected_at,1,7)').first();
  assert.equal(group?.partner_id, 50); assert.equal(group?.period, '2026-09'); assert.equal(group?.total, 50000);
  await database.prepare("INSERT INTO app_settings (key,value) SELECT ?,c.name FROM clients c WHERE c.id=? AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key=?)").bind('copied-name',3,'copied-name').run();
  assert.equal(await database.prepare('SELECT value FROM app_settings WHERE key=?').bind('copied-name').first('value'), "O'Brien $1 ? AS Foo");
  assert.equal((await database.prepare("SELECT id FROM clients WHERE id=3 UNION SELECT client_id FROM operations WHERE id=50").all()).results.length, 1);
  await database.prepare('DELETE FROM auth_attempts WHERE key IN (SELECT key FROM auth_attempts WHERE attempts>0)').run();
  assert.equal(await database.prepare('SELECT COUNT(*) AS count FROM auth_attempts').first('count'), 0);
});

test('attachments, archived JSON and counters retain exact contents', async () => {
  const files = new DatabaseFiles(database), bytes = Uint8Array.from([0,1,2,128,255]);
  await files.put('test/document',bytes.buffer,{httpMetadata:{contentType:'application/octet-stream'}});
  assert.deepEqual((await files.get('test/document'))?.body, bytes);
  await files.delete('test/document'); assert.equal(await files.get('test/document'), null);
  const payload = { _id: 'original-id', nested: { __tf_source: 'preserved' }, amount: 12345 };
  await database.prepare('INSERT INTO source_records (source,source_id,payload) VALUES (?,?,?)').bind('test','original',JSON.stringify(payload)).run();
  assert.deepEqual(await database.prepare('SELECT payload FROM source_records WHERE source_id=?').bind('original').first('payload'), payload);
  const next = await database.prepare("INSERT INTO operations (owner_id,client_id,created_at,updated_at) VALUES ('test-owner',3,1,1) RETURNING id").first();
  assert.ok(Number(next?.id)>50);
  await assert.rejects(database.prepare('UPDATE operations SET value_cents=? WHERE id=?').bind(1.5,next?.id).run(), /Inteiro inválido/);
  assert.equal(await database.prepare('SELECT value_cents FROM operations WHERE id=?').bind(next?.id).first('value_cents'),0);
});

test('operation pagination stays bounded and preserves ordering across 2,000 records', { timeout: 60000 }, async () => {
  const db = await database.connection();
  await db.collection<{_id:string}>('clients').insertOne(mongoDocument('clients',{id:3000,owner_id:'pagination-owner',name:'Cliente sintético',normalized_name:'cliente sintetico',created_at:1,updated_at:1}));
  const rows = Array.from({ length: 2000 }, (_, i) => mongoDocument('operations', { id: 1000+i, owner_id: 'pagination-owner', client_id: 3000, original_product: 'Financiamento', value_cents: 123456, completed_at: '2026-09-29', created_at: 1, updated_at: i+100 }));
  // Synthetic records only, in this test's randomly named database.
  await db.collection<{_id:string}>('operations').insertMany(rows);
  const paginationAccess={...access,ownerKeys:['pagination-owner','pagination@example.com']};
  const first = await readOperations(database, paginationAccess, { limit: 1000 });
  const second = await readOperations(database, paginationAccess, { limit: 1000, offset: 1000 });
  assert.equal(first.length,1000); assert.equal(second.length,1000);
  assert.equal(new Set([...first,...second].map(row=>row.dbId)).size,2000);
  assert.equal(first[0].dbId,2999); assert.equal(second[999].dbId,1000);
  assert.ok(first.every(row=>row.value===1234.56));
});
