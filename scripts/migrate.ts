import { resolve } from 'node:path';
import { LocalDatabase } from '../lib/local-runtime.ts';

try { process.loadEnvFile('.env.local'); } catch { /* Environment variables may be provided by the caller. */ }
const path = resolve(process.env.LOCAL_DATA_DIR || './data', 'crm.sqlite');
const database = new LocalDatabase(path);
console.log(`Banco pronto: ${path}`);
database.close();
