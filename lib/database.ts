import { PostgresDatabase, PostgresFiles } from './postgres.ts';
import { MongoDatabase } from './mongodb.ts';
import type { ApplicationDatabase } from './database-types.ts';

export function databaseProvider(): 'postgres' | 'mongodb' {
  const provider = process.env.DATABASE_PROVIDER || 'postgres';
  if (provider !== 'postgres' && provider !== 'mongodb') throw new Error('DATABASE_PROVIDER deve ser postgres ou mongodb.');
  return provider;
}
/** Explicit selection prevents an unavailable provider from falling back to stale data. */
export function createDatabase(): ApplicationDatabase {
  return databaseProvider() === 'mongodb' ? new MongoDatabase() : new PostgresDatabase();
}
export { PostgresFiles as DatabaseFiles };
