import { cookies } from 'next/headers';
import { env } from '@/lib/runtime';
import { PARTNER_SESSION_COOKIE, SESSION_COOKIE, sameOrigin, tokenHash } from '@/lib/auth-session';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  const cookieName = new URL(request.url).searchParams.get('scope') === 'partner' ? PARTNER_SESSION_COOKIE : SESSION_COOKIE;
  const jar = await cookies(), token = jar.get(cookieName)?.value;
  if (token) await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(tokenHash(token)).run();
  jar.delete(cookieName);
  return Response.json({ ok: true });
}
