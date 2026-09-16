import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PostgresDatabase, quoteIdentifier } from './postgres.ts';

export async function migratePostgres(database: PostgresDatabase) {
  await database.transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(712089231)');
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(database.schema)}`);
    await client.query(`SET LOCAL search_path TO ${quoteIdentifier(database.schema)}`);
    await client.query('CREATE TABLE IF NOT EXISTS _schema_migrations (name text PRIMARY KEY,checksum text NOT NULL,applied_at bigint NOT NULL)');
    for (const name of readdirSync(resolve('db/postgres')).filter((name) => name.endsWith('.sql')).sort()) {
      const sql = readFileSync(resolve('db/postgres', name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT checksum FROM _schema_migrations WHERE name=$1', [name]);
      if (existing.rows.length) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Migration changed after execution: ${name}`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO _schema_migrations (name,checksum,applied_at) VALUES ($1,$2,$3)', [name, checksum, Date.now()]);
    }
  });
}
