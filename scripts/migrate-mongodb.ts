import { MongoDatabase } from '../lib/mongodb.ts';
import { readFileSync } from 'node:fs';
import { initializeEmptyMongo, type EmptyMongoAdmin } from '../lib/mongodb-bootstrap.ts';
try { process.loadEnvFile('.env.local'); } catch { /* Hosting may inject credentials. */ }
const database = new MongoDatabase();
try {
  if (process.argv.includes('--empty')) {
    const index = process.argv.indexOf('--admin-file');
    if (index < 0 || !process.argv[index + 1] || process.argv[index + 1].startsWith('--')) throw new Error('Informe --admin-file com o arquivo privado do administrador.');
    const admin = JSON.parse(readFileSync(process.argv[index + 1], 'utf8')) as EmptyMongoAdmin;
    console.log(JSON.stringify(await initializeEmptyMongo(database, admin)));
  } else {
    await database.initialize();
    console.log('Estrutura MongoDB pronta. Nenhum registro de cliente foi importado ou alterado.');
  }
}
catch (error) { console.error('Falha ao preparar MongoDB:', (error as { code?: string }).code || (error as Error).name); process.exitCode = 1; }
finally { await database.close(); }
