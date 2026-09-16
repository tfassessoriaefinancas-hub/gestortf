import { cookies } from 'next/headers';
import { env } from '@/lib/runtime';
import { SESSION_COOKIE, sameOrigin, tokenHash } from '@/lib/auth-session';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  const jar = await cookies(), token = jar.get(SESSION_COOKIE)?.value;
  if (token) await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(tokenHash(token)).run();
  jar.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
