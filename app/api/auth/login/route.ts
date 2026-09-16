import { env } from '@/lib/runtime';
import { createSession, sameOrigin, tokenHash } from '@/lib/auth-session';
import { hashPassword, verifyPassword } from '@/lib/password';

// Keep an equivalent password check when an address does not exist.
const dummyHash = hashPassword('unavailable-account');
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase(), password = String(body.password || '');
  if (!email || email.length > 254 || !password || password.length > 256) return Response.json({ error: 'Informe e-mail e senha válidos.' }, { status: 400 });
  const now = Date.now(), windowStart = now - 15 * 60 * 1000;
  const key = tokenHash(`login:${email}`);
  const attempt = await env.DB.prepare(`INSERT INTO auth_attempts (key,attempts,window_start) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_attempts.window_start<? THEN 1 ELSE auth_attempts.attempts+1 END,
    window_start=CASE WHEN auth_attempts.window_start<? THEN excluded.window_start ELSE auth_attempts.window_start END RETURNING attempts`)
    .bind(key, now, windowStart, windowStart).first<{ attempts: number }>();
  if (attempt && attempt.attempts > 10) return Response.json({ error: 'Muitas tentativas. Tente novamente em 15 minutos.' }, { status: 429 });
  const account = await env.DB.prepare(`SELECT u.id,c.password_hash FROM users u JOIN auth_credentials c ON c.user_id=u.id
    WHERE lower(u.email)=? AND u.active=1 AND u.deleted_at IS NULL`).bind(email).first<{ id: string; password_hash: string }>();
  const valid = await verifyPassword(password, account?.password_hash || await dummyHash);
  if (!account || !valid) return Response.json({ error: 'E-mail ou senha incorretos.' }, { status: 401 });
  await env.DB.prepare('DELETE FROM auth_attempts WHERE key=? OR window_start<?').bind(key, windowStart).run();
  await createSession(account.id, request);
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
