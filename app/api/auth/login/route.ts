import { env } from '@/lib/runtime';
import { createSession, sameOrigin, tokenHash } from '@/lib/auth-session';
import { hashPassword, verifyPassword } from '@/lib/password';
import { loginIdentifier } from '@/lib/login-identifier';

// Keep an equivalent password check when an account does not exist.
const dummyHash = hashPassword('unavailable-account');
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const identifier = loginIdentifier(body.login ?? body.email), password = String(body.password || '');
  if (!identifier || !password || password.length > 256) return Response.json({ error: 'Informe CPF, e-mail ou login e uma senha válidos.' }, { status: 400 });
  const accountField = identifier.kind === 'cpf' ? 'u.cpf' : identifier.kind === 'login' ? 'lower(u.login)' : 'lower(u.email)';
  const account = await env.DB.prepare(`SELECT u.id,c.password_hash FROM users u JOIN auth_credentials c ON c.user_id=u.id
    WHERE ${accountField}=? AND u.active=1 AND u.deleted_at IS NULL`).bind(identifier.value).first<{ id: string; password_hash: string }>();
  const now = Date.now(), windowStart = now - 15 * 60 * 1000;
  // CPF, formatted CPF and email share the same attempt limit for an account.
  const key = tokenHash(account ? `login:account:${account.id}` : `login:${identifier.kind}:${identifier.value}`);
  const attempt = await env.DB.prepare(`INSERT INTO auth_attempts (key,attempts,window_start) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_attempts.window_start<? THEN 1 ELSE auth_attempts.attempts+1 END,
    window_start=CASE WHEN auth_attempts.window_start<? THEN excluded.window_start ELSE auth_attempts.window_start END RETURNING attempts`)
    .bind(key, now, windowStart, windowStart).first<{ attempts: number }>();
  if (attempt && attempt.attempts > 10) return Response.json({ error: 'Muitas tentativas. Tente novamente em 15 minutos.' }, { status: 429 });
  const valid = await verifyPassword(password, account?.password_hash || await dummyHash);
  if (!account || !valid) return Response.json({ error: 'CPF, e-mail, login ou senha incorretos.' }, { status: 401 });
  await env.DB.prepare('DELETE FROM auth_attempts WHERE key=? OR window_start<?').bind(key, windowStart).run();
  await createSession(account.id, request);
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
