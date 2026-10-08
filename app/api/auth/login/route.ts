import { env } from '@/lib/runtime';
import { createSession, PARTNER_SESSION_COOKIE, sameOrigin, tokenHash } from '@/lib/auth-session';
import { hashPassword, verifyPassword } from '@/lib/password';
import { loginIdentifier } from '@/lib/login-identifier';
import { legacyPartnerLoginQuery } from '@/lib/partner-login';

// Keep an equivalent password check when an account does not exist.
const dummyHash = hashPassword('unavailable-account');
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const identifier = loginIdentifier(body.login ?? body.email), password = String(body.password || '');
  const requestedPartnerId = Number(body.partnerId || 0), partnerAccess = body.partnerAccess === true || requestedPartnerId > 0;
  if (!identifier || !password || password.length > 256) return Response.json({ error: 'Informe CPF, e-mail ou login e uma senha válidos.' }, { status: 400 });
  try {
  const accountField = identifier.kind === 'cpf' ? 'u.cpf' : identifier.kind === 'login' ? 'lower(u.login)' : 'lower(u.email)';
  let account = await env.DB.prepare(`SELECT u.id,c.password_hash FROM users u JOIN auth_credentials c ON c.user_id=u.id
    WHERE ${accountField}=? AND u.active=1 AND u.deleted_at IS NULL`).bind(identifier.value).first<{ id: string; password_hash: string }>();
  const legacyQuery = legacyPartnerLoginQuery(identifier, partnerAccess);
  if (!account && legacyQuery) account = await env.DB.prepare(legacyQuery.sql).bind(...legacyQuery.bindings).first<{ id: string; password_hash: string }>();
  const now = Date.now(), windowStart = now - 15 * 60 * 1000;
  // CPF, formatted CPF and email share the same attempt limit for an account.
  const key = tokenHash(account ? `login:account:${account.id}` : `login:${identifier.kind}:${identifier.value}`);
  const attempt = await env.DB.prepare(`INSERT INTO auth_attempts (key,attempts,window_start) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_attempts.window_start<? THEN 1 ELSE auth_attempts.attempts+1 END,
    window_start=CASE WHEN auth_attempts.window_start<? THEN excluded.window_start ELSE auth_attempts.window_start END RETURNING attempts`)
    .bind(key, now, windowStart, windowStart).first<{ attempts: number }>();
  if (attempt && attempt.attempts > 10) return Response.json({ error: 'Muitas tentativas. Tente novamente em 15 minutos.' }, { status: 429 });
  const memberId = account?.id.startsWith('member:') ? Number(account.id.slice(7)) : 0;
  const membership = memberId ? await env.DB.prepare(`SELECT au.partner_id FROM access_users au JOIN partners p ON p.id=au.partner_id
    WHERE au.id=? AND au.active=1 AND p.active=1 AND p.deleted_at IS NULL LIMIT 1`).bind(memberId).first<{partner_id:number}>() : null;
  const valid = await verifyPassword(password, account?.password_hash || await dummyHash);
  const validPartner = Boolean(membership?.partner_id) && (!requestedPartnerId || Number(membership?.partner_id) === requestedPartnerId);
  if (!account || !valid || (partnerAccess && !validPartner)) return Response.json({ error: partnerAccess ? 'Usuário ou senha do parceiro incorretos.' : 'CPF, e-mail, login ou senha incorretos.' }, { status: 401 });
  await env.DB.prepare('DELETE FROM auth_attempts WHERE key=? OR window_start<?').bind(key, windowStart).run();
  if (partnerAccess) await createSession(account.id, request, PARTNER_SESSION_COOKIE);
  else {
    await createSession(account.id, request);
    if (membership?.partner_id) await createSession(account.id, request, PARTNER_SESSION_COOKIE);
  }
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('Falha ao autenticar:', error);
    return Response.json({ error: 'O banco de dados está temporariamente indisponível. Tente novamente mais tarde.' }, { status: 503 });
  }
}
