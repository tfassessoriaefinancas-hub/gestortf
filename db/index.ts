import { env } from '@/lib/runtime';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';

export function getDb() {
  return drizzle(async (sql, params, method) => {
    const statement = env.DB.prepare(sql).bind(...params);
    if (method === 'run') { await statement.run(); return { rows: [] }; }
    const rows = await statement.raw();
    return { rows: method === 'get' ? rows[0] ?? [] : rows };
  }, { schema });
}
