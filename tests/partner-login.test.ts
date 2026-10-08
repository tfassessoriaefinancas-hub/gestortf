import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { loginIdentifier } from '../lib/login-identifier.ts';
import { legacyPartnerLoginQuery } from '../lib/partner-login.ts';
import { hashPassword, verifyPassword } from '../lib/password.ts';

test('the GG portal resolves the historical login with its existing password', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE users (id TEXT, login TEXT, active INTEGER, deleted_at INTEGER);
      CREATE TABLE auth_credentials (user_id TEXT, password_hash TEXT);`);
    const hash = await hashPassword('test-password');
    db.prepare('INSERT INTO users VALUES (?,?,1,NULL)').run('member:7', 'GG VEÍCULOS');
    db.prepare('INSERT INTO auth_credentials VALUES (?,?)').run('member:7', hash);
    const query = legacyPartnerLoginQuery(loginIdentifier(' GGVEICULOS '), true)!;
    const account = db.prepare(query.sql).get(...query.bindings)!;
    assert.equal(account.id, 'member:7');
    assert.equal(await verifyPassword('test-password', String(account.password_hash)), true);
    assert.equal(await verifyPassword('wrong-password', String(account.password_hash)), false);
    db.exec('UPDATE users SET active=0');
    assert.equal(db.prepare(query.sql).get(...query.bindings), undefined);
    db.exec("UPDATE users SET active=1, id='admin'");
    db.exec("UPDATE auth_credentials SET user_id='admin'");
    assert.equal(db.prepare(query.sql).get(...query.bindings), undefined);
  } finally { db.close(); }
});

test('the compatibility alias is restricted to the GG partner portal', () => {
  for (const input of ['GG VEÍCULOS', 'anotheruser', 'gg@example.com', '01234567890']) {
    assert.equal(legacyPartnerLoginQuery(loginIdentifier(input), true), null);
  }
  assert.equal(legacyPartnerLoginQuery(loginIdentifier('ggveiculos'), false), null);
});
