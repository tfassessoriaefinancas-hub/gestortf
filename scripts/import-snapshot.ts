import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalDatabase } from '../lib/local-runtime.ts';

try { process.loadEnvFile('.env.local'); } catch { /* Caller may provide the environment. */ }
const filename = process.argv[2];
if (!filename) throw new Error('Uso: npm run db:import -- caminho/snapshot.json');
const snapshot = JSON.parse(readFileSync(resolve(filename), 'utf8')) as { tables: Record<string, Record<string, unknown>[]> };
if (!snapshot.tables || typeof snapshot.tables !== 'object') throw new Error('Snapshot inválido.');
const database = new LocalDatabase(resolve(process.env.LOCAL_DATA_DIR || './data', 'crm.sqlite'));
const sql = database.connection;
const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;
const allowed = new Set(sql.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_local_migrations'").all().map((row) => row.name));
let total = 0;
sql.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE');
try {
  for (const [table, rows] of Object.entries(snapshot.tables)) {
    if (!allowed.has(table) || !Array.isArray(rows)) throw new Error(`Tabela inválida: ${table}`);
    if (sql.prepare(`SELECT 1 FROM ${quote(table)} LIMIT 1`).get()) throw new Error(`A tabela ${table} já contém dados. Importe em um banco vazio.`);
    const columns = new Set(sql.prepare(`PRAGMA table_info(${quote(table)})`).all().map((column) => column.name));
    for (const row of rows) {
      const keys = Object.keys(row);
      if (!keys.length || keys.some((key) => !columns.has(key))) throw new Error(`Colunas incompatíveis em ${table}`);
      await database.prepare(`INSERT INTO ${quote(table)} (${keys.map(quote).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(...keys.map((key) => row[key])).run();
      total++;
    }
  }
  const violations = sql.prepare('PRAGMA foreign_key_check').all();
  if (violations.length) throw new Error(`Snapshot com ${violations.length} referências inválidas.`);
  sql.exec('COMMIT');
  console.log(`Importação concluída: ${total} registros em ${Object.keys(snapshot.tables).length} tabelas.`);
} catch (error) {
  sql.exec('ROLLBACK');
  throw error;
} finally {
  sql.exec('PRAGMA foreign_keys = ON');
  database.close();
}
