import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDatabase, LocalFiles } from '../lib/local-runtime.ts';
import { localIdentity } from '../lib/local-identity.ts';
import { readPrivateData } from '../lib/private-data.ts';

test('migrations and CRM records survive reopening the database', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tf-db-test-'));
  const path = join(directory, 'crm.sqlite');
  let db = new LocalDatabase(path);
  try {
    const client = await db.prepare('INSERT INTO clients (owner_id, name, normalized_name, cpf, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
      .bind('test-owner', 'Cliente de teste', 'cliente de teste', '00000000000', 1, 1).first<{ id: number }>();
    assert.ok(client?.id);
    db.close();
    db = new LocalDatabase(path);
    const row = await db.prepare('SELECT name FROM clients WHERE id = ?').bind(client.id).first<{ name: string }>();
    assert.equal(row?.name, 'Cliente de teste');
    const migrations = await db.prepare('SELECT COUNT(*) AS count FROM _local_migrations').first<{ count: number }>();
    assert.equal(migrations?.count, 13);
  } finally { db.close(); await rm(directory, { recursive: true, force: true }); }
});

test('a failed batch rolls back every statement', async () => {
  const db = new LocalDatabase(':memory:');
  try {
    await assert.rejects(db.batch([
      db.prepare('INSERT INTO companies (owner_id, name, created_at) VALUES (?, ?, ?)').bind('test', 'Must roll back', 1),
      db.prepare('INSERT INTO contacts (company_id, name) VALUES (?, ?)').bind(9999, 'Invalid parent'),
    ]));
    assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM companies').first('count'), 0);
  } finally { db.close(); }
});

test('batch RETURNING, change counts, raw arrays and bind values match the original APIs', async () => {
  const db = new LocalDatabase(':memory:');
  try {
    const [insert] = await db.batch<{ id: number }>([
      db.prepare('INSERT INTO companies (owner_id, name, created_at) VALUES (?, ?, ?) RETURNING id').bind('test', 'TF', 1),
    ]);
    assert.equal(insert.results[0].id, 1);
    const result = await db.prepare('UPDATE companies SET name = ? WHERE id = ?').bind('Updated', 1).run();
    assert.equal(result.meta.changes, 1);
    assert.deepEqual(await db.prepare('SELECT name FROM companies').raw(), [['Updated']]);
    assert.equal(await db.prepare('SELECT id FROM companies WHERE id = 2').first(), null);
    assert.deepEqual((await db.prepare('SELECT ? AS enabled, ? AS missing').bind(true, undefined).all()).results.map((row) => ({ ...row })), [{ enabled: 1, missing: null }]);
  } finally { db.close(); }
});

test('documents can be stored, retrieved and deleted without escaping their folder', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tf-files-test-'));
  const files = new LocalFiles(directory);
  try {
    const value = new TextEncoder().encode('Documento de teste');
    await files.put('clients/test/document.txt', value.buffer);
    assert.equal(new TextDecoder().decode((await files.get('clients/test/document.txt'))?.body), 'Documento de teste');
    await assert.rejects(files.put('../outside.txt', value.buffer), /Invalid document key/);
    await assert.rejects(files.get('/etc/passwd'), /Invalid document key/);
    await files.delete(['clients/test/document.txt']);
    assert.equal(await files.get('clients/test/document.txt'), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('local identity is opt-in and accepts only loopback hosts', () => {
  const previous = process.env.LOCAL_AUTH_ENABLED;
  try {
    delete process.env.LOCAL_AUTH_ENABLED;
    assert.equal(localIdentity('localhost:3000'), null);
    process.env.LOCAL_AUTH_ENABLED = 'true';
    for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000']) assert.ok(localIdentity(host));
    for (const host of [null, 'crm.example.com', 'localhost.evil.test', '192.168.0.2:3000']) assert.equal(localIdentity(host), null);
  } finally {
    if (previous === undefined) delete process.env.LOCAL_AUTH_ENABLED;
    else process.env.LOCAL_AUTH_ENABLED = previous;
  }
});

test('private datasets load at runtime, stay optional and reject traversal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tf-private-test-'));
  const previous = process.env.LOCAL_DATA_DIR;
  process.env.LOCAL_DATA_DIR = directory;
  try {
    assert.deepEqual(readPrivateData('missing.json', []), []);
    await writeFile(join(directory, 'records.json'), JSON.stringify([{ name: 'Test fixture' }]));
    assert.deepEqual(readPrivateData('records.json', []), [{ name: 'Test fixture' }]);
    assert.throws(() => readPrivateData('../outside.json', []), /Invalid data path/);
    await writeFile(join(directory, 'broken.json'), 'invalid json');
    assert.throws(() => readPrivateData('broken.json', []), SyntaxError);
  } finally {
    if (previous === undefined) delete process.env.LOCAL_DATA_DIR;
    else process.env.LOCAL_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
