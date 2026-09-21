import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from './runtime';
export { sameOrigin } from './request-origin';

export const SESSION_COOKIE = 'tf_session';
const SESSION_SECONDS = 60 * 60 * 24 * 7;
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function getSessionUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  try {
    const row = await env.DB.prepare(`SELECT u.id,u.email,u.name,u.role FROM auth_sessions s
      JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?
      AND u.active=1 AND u.deleted_at IS NULL`).bind(tokenHash(token), Date.now())
      .first<{ id: string; email: string; name: string | null; role: 'admin' | 'employee' }>();
    return row ? { userId: row.id, email: row.email, displayName: row.name || row.email, fullName: row.name, role: row.role, serverAuthenticated: true } : null;
  } catch (error) {
    // An unavailable database must not take down every page. Authentication
    // remains fail-closed and the login endpoint will report the outage.
    console.error('Sessão indisponível:', error);
    return null;
  }
}

export async function createSession(userId: string, request: Request) {
  const token = randomBytes(32).toString('hex'), now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at<=?').bind(now),
    env.DB.prepare('INSERT INTO auth_sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)').bind(tokenHash(token), userId, now, now + SESSION_SECONDS * 1000),
  ]);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: Boolean(process.env.VERCEL) || new URL(request.url).protocol === 'https:', sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS });
}

export async function ownerIdentity() {
  const rows = await env.DB.prepare("SELECT key,value FROM app_settings WHERE key IN ('owner_id','owner_email')").all<{ key: string; value: string }>();
  const settings = Object.fromEntries(rows.results.map(row => [row.key, row.value]));
  if (!settings.owner_id || !settings.owner_email) throw new Error('Administrador ainda não configurado no banco.');
  return { id: settings.owner_id, email: settings.owner_email };
}
