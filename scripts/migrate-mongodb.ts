import { MongoDatabase } from '../lib/mongodb.ts';
try { process.loadEnvFile('.env.local'); } catch { /* Hosting may inject credentials. */ }
const database = new MongoDatabase();
try { await database.initialize(); console.log('Estrutura MongoDB pronta. Nenhum registro de cliente foi importado ou alterado.'); }
catch (error) { console.error('Falha ao preparar MongoDB:', (error as { code?: string }).code || (error as Error).name); process.exitCode = 1; }
finally { await database.close(); }
