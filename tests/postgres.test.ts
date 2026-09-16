import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postgresSql, PostgresDatabase, databaseSchema } from '../lib/postgres.ts';
import { hashPassword, verifyPassword } from '../lib/password.ts';
import { sameOrigin } from '../lib/request-origin.ts';

test('PostgreSQL parameters, aliases and schema preserve literals and comments', () => {
  assert.equal(postgresSql("SELECT '?' AS label, id as clientId FROM clients WHERE name=? AND notes='It''s ?' -- ?\n AND id=?", 'tf_test_example'),
    "SELECT '?' AS label, id AS \"clientId\" FROM \"tf_test_example\".\"clients\" WHERE name=$1 AND notes='It''s ?' -- ?\n AND id=$2");
  assert.equal(postgresSql('UPDATE operations SET value_cents=? WHERE id IN (SELECT operation_id FROM commissions WHERE id=?)'),
    'UPDATE "public"."operations" SET value_cents=$1 WHERE id IN (SELECT operation_id FROM "public"."commissions" WHERE id=$2)');
});

test('PostgreSQL is required; a missing connection never selects SQLite', () => {
  assert.throws(() => new PostgresDatabase(''), /DATABASE_URL/);
  assert.throws(() => new PostgresDatabase('file:crm.sqlite'), /PostgreSQL/);
  const previous=process.env.DATABASE_SCHEMA;
  try { process.env.DATABASE_SCHEMA='public; DROP SCHEMA public';assert.throws(databaseSchema,/Invalid/); }
  finally { if(previous===undefined)delete process.env.DATABASE_SCHEMA;else process.env.DATABASE_SCHEMA=previous; }
});

test('passwords have independent salts and reject wrong or malformed credentials', async () => {
  const first=await hashPassword('test-only-password'),second=await hashPassword('test-only-password');
  assert.notEqual(first,second);
  assert.equal(await verifyPassword('test-only-password',first),true);
  assert.equal(await verifyPassword('wrong-password',first),false);
  assert.equal(await verifyPassword('test-only-password','invalid'),false);
});

test('origin checks use the browser host through a proxy and reject outside origins',()=>{
  assert.equal(sameOrigin(new Request('http://localhost:3100/api/auth/login',{headers:{host:'127.0.0.1:3100',origin:'http://127.0.0.1:3100'}})),true);
  for(const origin of ['https://evil.example','null','https://crm.example/path'])assert.equal(sameOrigin(new Request('http://localhost/api/auth/login',{headers:{host:'crm.example',origin}})),false);
  assert.equal(sameOrigin(new Request('http://localhost/api/auth/login')),false);
});
