import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PostgresDatabase } from '../lib/postgres.ts';
import { MongoDatabase } from '../lib/mongodb.ts';
import { exportPostgresSnapshot, importMongoSnapshot, verifyMongoSnapshot, type DatabaseSnapshot } from '../lib/database-transfer.ts';

try { process.loadEnvFile('.env.local'); } catch { /* Credentials may be injected. */ }
const mode = process.argv[2], path = resolve(process.argv[3] || 'data/mongodb-migration/current-postgres-snapshot.json');
if (!['export', 'import', 'verify'].includes(mode)) throw new Error('Use: transfer-mongodb.ts export|import|verify [arquivo privado].');
const database = mode === 'export' ? new PostgresDatabase() : new MongoDatabase();
try {
  if (mode === 'export') {
    const snapshot = await exportPostgresSnapshot(database as PostgresDatabase);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ exported: true, exportedAt: snapshot.exportedAt, counts: Object.fromEntries(Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.length])) }));
  } else {
    const snapshot = JSON.parse(readFileSync(path, 'utf8')) as DatabaseSnapshot;
    const result = mode === 'import' ? await importMongoSnapshot(database as MongoDatabase, snapshot) : { verified: true, counts: await verifyMongoSnapshot(database as MongoDatabase, snapshot) };
    console.log(JSON.stringify(result));
  }
} catch (error) {
  console.error(JSON.stringify({ success: false, code: (error as { code?: string }).code || (error as Error).name, message: String((error as Error).message).replace(/(?:postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s]+/gi, '[conexão privada]') }));
  process.exitCode = 1;
} finally { await database.close(); }
