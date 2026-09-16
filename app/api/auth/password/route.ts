import { cookies } from 'next/headers';
import { env } from '@/lib/runtime';
import { getSessionUser, SESSION_COOKIE, sameOrigin, tokenHash } from '@/lib/auth-session';
import { hashPassword, verifyPassword } from '@/lib/password';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'Entre com seu e-mail e senha para alterar a senha.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const current = String(body.currentPassword || ''), next = String(body.newPassword || '');
  if (next.length < 8 || next.length > 256) return Response.json({ error: 'Use uma senha entre 8 e 256 caracteres.' }, { status: 400 });
  const stored = await env.DB.prepare('SELECT password_hash FROM auth_credentials WHERE user_id=?').bind(user.userId).first<{ password_hash: string }>();
  if (!stored || !await verifyPassword(current, stored.password_hash)) return Response.json({ error: 'A senha atual não confere.' }, { status: 400 });
  const token = (await cookies()).get(SESSION_COOKIE)!.value;
  await env.DB.batch([
    env.DB.prepare('UPDATE auth_credentials SET password_hash=?,updated_at=? WHERE user_id=?').bind(await hashPassword(next), Date.now(), user.userId),
    env.DB.prepare('DELETE FROM auth_sessions WHERE user_id=? AND token_hash<>?').bind(user.userId, tokenHash(token)),
  ]);
  return Response.json({ ok: true });
}
