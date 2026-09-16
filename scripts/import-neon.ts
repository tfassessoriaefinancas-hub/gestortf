import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { PostgresDatabase, quoteIdentifier } from '../lib/postgres.ts';
import { migratePostgres } from '../lib/postgres-migrate.ts';

process.loadEnvFile('.env.local');
const directory = resolve(process.env.LOCAL_DATA_DIR || './data');
const contents = readFileSync(resolve(directory, 'neon-migration-plan.json'), 'utf8');
const plan = JSON.parse(contents) as { tables: Record<string, Record<string, unknown>[]>; sources: Record<string, unknown>[]; admin: { id: string; email: string }; summary: Record<string, number> };
const hash = createHash('sha256').update(contents).digest('hex');
const database = new PostgresDatabase();
try {
  await migratePostgres(database);
  await database.transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(712089232)');
    const previous = await client.query('SELECT source_hash FROM migration_runs WHERE name=$1', ['initial-local-to-neon']);
    if (previous.rows.length) {
      if (previous.rows[0].source_hash !== hash) throw new Error('Uma migração diferente já foi aplicada; dados remotos não serão sobrescritos.');
      console.log('Migração já aplicada; nenhum registro duplicado.'); return;
    }
    for (const name of Object.keys(plan.tables)) {
      const result = await client.query(`SELECT 1 FROM ${quoteIdentifier(name)} LIMIT 1`);
      if (result.rows.length) throw new Error(`Destino já contém registros em ${name}; importação interrompida.`);
    }
    const insertRows = async (table: string, rows: Record<string, unknown>[]) => {
      if (!rows.length) return;
      const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      const list = columns.map(quoteIdentifier).join(',');
      for (let offset = 0; offset < rows.length; offset += 250) {
        await client.query(`INSERT INTO ${quoteIdentifier(table)} (${list}) SELECT ${list} FROM jsonb_populate_recordset(NULL::${quoteIdentifier(table)},$1::jsonb)`, [JSON.stringify(rows.slice(offset, offset + 250))]);
      }
    };
    for (const [name, rows] of Object.entries(plan.tables)) { await insertRows(name, rows); console.log(`${name}: ${rows.length} registros`); }
    await insertRows('source_records', plan.sources);
    const identities = await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND is_identity='YES'");
    for (const row of identities.rows) {
      const target = `${quoteIdentifier(database.schema)}.${quoteIdentifier(row.table_name)}`;
      await client.query(`SELECT setval(pg_get_serial_sequence($1,$2),COALESCE(MAX(${quoteIdentifier(row.column_name)}),1),COUNT(*)>0) FROM ${target}`, [target, row.column_name]);
    }
    const salt = randomBytes(16).toString('hex');
    const password = randomBytes(18).toString('base64url');
    const passwordHash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
    await client.query('INSERT INTO auth_credentials (user_id,password_hash,updated_at) VALUES ($1,$2,$3)', [plan.admin.id, passwordHash, Date.now()]);
    await client.query('INSERT INTO app_settings (key,value) VALUES ($1,$2),($3,$4)', ['owner_id', plan.admin.id, 'owner_email', plan.admin.email]);
    const files = resolve(directory, 'files');
    const walk = (path: string): string[] => existsSync(path) ? readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(resolve(path, entry.name)) : [resolve(path, entry.name)]) : [];
    for (const filename of walk(files)) await client.query('INSERT INTO stored_files (key,body,content_type,updated_at) VALUES ($1,$2,$3,$4)', [relative(files, filename), readFileSync(filename), 'application/octet-stream', Date.now()]);
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    for (const [name, rows] of Object.entries(plan.tables)) {
      const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(name)}`);
      if (result.rows[0].count !== rows.length) throw new Error(`Contagem divergente: ${name}`);
    }
    await client.query('INSERT INTO migration_runs (name,source_hash,summary,completed_at) VALUES ($1,$2,$3,$4)', ['initial-local-to-neon', hash, JSON.stringify(plan.summary), Date.now()]);
    writeFileSync(resolve(directory, 'neon-access.json'), JSON.stringify({ email: plan.admin.email, password, instructions: 'Acesso ao CRM na Vercel. Altere a senha em Configurações após entrar.' }, null, 2), { mode: 0o600 });
    console.log('Dados e credenciais iniciais preparados; concluindo transação.');
  });
  console.log('Migração Neon concluída e conferida.');
} catch (error) {
  console.error('Migração cancelada:', (error as { code?: string }).code || (error as Error).message);
  process.exitCode = 1;
} finally { await database.close(); }
