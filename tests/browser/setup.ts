import { PostgresDatabase, quoteIdentifier } from '../../lib/postgres';
import { createDatabase } from '../../lib/database';
import { MongoDatabase } from '../../lib/mongodb';
import { migratePostgres } from '../../lib/postgres-migrate';
import { hashPassword } from '../../lib/password';

export default async function setup() {
  const schema=process.env.DATABASE_SCHEMA;
  if(!schema || !/^tf_test_[a-f0-9]+$/.test(schema))throw new Error('Tests require their own isolated schema.');
  const db=createDatabase();
  const cleanupDatabase=async()=>{
    if(db instanceof MongoDatabase){
      if(db.name!==schema)throw new Error('MongoDB cleanup requires the isolated test database.');
      await (await db.connection()).dropDatabase();
    }else if(db instanceof PostgresDatabase)await db.pool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
  };
  try {
    if(db instanceof MongoDatabase){
      if(db.name!==schema)throw new Error('MongoDB tests require their own isolated database.');
      await db.initialize();
    }else if(db instanceof PostgresDatabase)await migratePostgres(db);
    await db.batch([
      db.prepare("INSERT INTO users (id,email,name,role,active,created_at,updated_at,cpf) VALUES ('local-test-owner','admin@example.com','Teste local','admin',1,1,1,'01234567890')"),
      db.prepare("INSERT INTO auth_credentials (user_id,password_hash,updated_at) VALUES ('local-test-owner',?,1)").bind(await hashPassword('test-only-password')),
      db.prepare("INSERT INTO app_settings (key,value) VALUES ('owner_id','local-test-owner'),('owner_email','admin@example.com')"),
      db.prepare("INSERT INTO clients (id,owner_id,name,normalized_name,cpf,created_at,updated_at) VALUES (100,'local-test-owner','Cliente histórico de teste','cliente historico','11111111111',1,1)"),
      db.prepare("INSERT INTO operations (id,owner_id,client_id,original_product,value_cents,status,is_historical,report_excluded,created_at,updated_at) VALUES (100,'local-test-owner',100,'Operação histórica',123456,'Pago',1,0,1,1),(101,'local-test-owner',100,'Histórico substituído',999,'Pago',1,1,1,1)"),
    ]);
  } catch(error) {
    await cleanupDatabase();
    await db.close();
    throw error;
  }
  return async()=>{
    try { await cleanupDatabase(); }
    finally { await db.close(); }
  };
}
