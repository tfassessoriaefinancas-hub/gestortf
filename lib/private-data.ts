import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

/** Private datasets live outside the source tree and are never imported by the bundler. */
export function readPrivateData<T>(filename: string, fallback: T): T {
  const root = resolve(process.env.LOCAL_DATA_DIR || './data');
  const path = resolve(root, filename);
  const child = relative(root, path);
  if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Invalid data path');
  try { return JSON.parse(readFileSync(path, 'utf8')) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}
