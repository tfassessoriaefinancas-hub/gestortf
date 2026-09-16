import { PostgresDatabase } from '../lib/postgres.ts';
import { migratePostgres } from '../lib/postgres-migrate.ts';
try { process.loadEnvFile('.env.local'); } catch { /* Hosting provides DATABASE_URL. */ }
const database = new PostgresDatabase();
try { await migratePostgres(database); console.log('Schema PostgreSQL pronto.'); }
catch (error) { console.error('Falha na migração:', (error as { code?: string }).code || (error as Error).message); process.exitCode = 1; }
finally { await database.close(); }
