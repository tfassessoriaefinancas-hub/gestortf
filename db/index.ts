import { env } from '@/lib/runtime';

/** The shared PostgreSQL connection. Schema changes live in db/postgres/*.sql. */
export function getDb() { return env.DB; }
