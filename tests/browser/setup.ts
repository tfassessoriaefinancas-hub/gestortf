import { PostgresDatabase, quoteIdentifier } from '../../lib/postgres';
import { migratePostgres } from '../../lib/postgres-migrate';
import { hashPassword } from '../../lib/password';

export default async function setup() {
  const schema=process.env.DATABASE_SCHEMA;
  if(!schema || !/^tf_test_[a-f0-9]+$/.test(schema))throw new Error('Tests require their own isolated schema.');
  const db=new PostgresDatabase();
  try {
    await migratePostgres(db);
    await db.batch([
      db.prepare("INSERT INTO users (id,email,name,role,active,created_at,updated_at) VALUES ('local-test-owner','admin@example.com','Teste local','admin',1,1,1)"),
      db.prepare("INSERT INTO auth_credentials (user_id,password_hash,updated_at) VALUES ('local-test-owner',?,1)").bind(await hashPassword('test-only-password')),
      db.prepare("INSERT INTO app_settings (key,value) VALUES ('owner_id','local-test-owner'),('owner_email','admin@example.com')"),
      db.prepare("INSERT INTO clients (id,owner_id,name,normalized_name,cpf,created_at,updated_at) VALUES (100,'local-test-owner','Cliente histórico de teste','cliente historico','11111111111',1,1)"),
      db.prepare("INSERT INTO operations (id,owner_id,client_id,original_product,value_cents,status,is_historical,report_excluded,created_at,updated_at) VALUES (100,'local-test-owner',100,'Operação histórica',123456,'Pago',1,0,1,1),(101,'local-test-owner',100,'Histórico substituído',999,'Pago',1,1,1,1)"),
    ]);
  } catch(error) {
    await db.pool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    throw error;
  } finally { await db.close(); }
  return async()=>{
    const cleanup=new PostgresDatabase();
    try { await cleanup.pool.query(`DROP SCHEMA ${quoteIdentifier(schema)} CASCADE`); }
    finally { await cleanup.close(); }
  };
}
