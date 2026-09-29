import { env } from '@/lib/runtime';

/** The explicitly selected application database, shared by every API. */
export function getDb() { return env.DB; }
