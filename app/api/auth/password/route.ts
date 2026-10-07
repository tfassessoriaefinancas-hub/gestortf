import { cookies } from 'next/headers';
import { env } from '@/lib/runtime';
import { getSessionUser, SESSION_COOKIE, sameOrigin, tokenHash } from '@/lib/auth-session';
import { hashPassword, verifyPassword } from '@/lib/password';
import { loginIdentifier } from '@/lib/login-identifier';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'Entre com seu e-mail e senha para alterar a senha.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const current = String(body.currentPassword || ''), next = String(body.newPassword || '');
  const memberId=user.userId.startsWith('member:')?Number(user.userId.slice(7)):0;
  const ggPartner=memberId?await env.DB.prepare(`SELECT au.id FROM access_users au JOIN partners p ON p.id=au.partner_id
    WHERE au.id=? AND au.active=1 AND lower(p.name)=lower(?) LIMIT 1`).bind(memberId,'GG Veículos').first():null;
  const minimumLength = ggPartner ? 6 : 8;
  if (next.length < minimumLength || next.length > 256) return Response.json({ error: `Use uma senha entre ${minimumLength} e 256 caracteres.` }, { status: 400 });
  const requestedLogin = body.login === undefined ? null : loginIdentifier(body.login);
  if (body.login !== undefined && !ggPartner) return Response.json({ error: 'A alteração do login não está disponível para este acesso.' }, { status: 403 });
  if (body.login !== undefined && requestedLogin?.kind !== 'login') return Response.json({ error: 'Informe um login válido com letras ou números.' }, { status: 400 });
  const stored = await env.DB.prepare('SELECT password_hash FROM auth_credentials WHERE user_id=?').bind(user.userId).first<{ password_hash: string }>();
  if (!stored || !await verifyPassword(current, stored.password_hash)) return Response.json({ error: 'A senha atual não confere.' }, { status: 400 });
  if (requestedLogin) {
    const duplicate = await env.DB.prepare('SELECT id FROM users WHERE lower(login)=? AND id<>? AND active=1 AND deleted_at IS NULL LIMIT 1').bind(requestedLogin.value,user.userId).first();
    if (duplicate) return Response.json({ error: 'Este login já está em uso.' }, { status: 409 });
  }
  const token = (await cookies()).get(SESSION_COOKIE)!.value;
  const now=Date.now(),statements=[
    env.DB.prepare('UPDATE auth_credentials SET password_hash=?,updated_at=? WHERE user_id=?').bind(await hashPassword(next), Date.now(), user.userId),
    env.DB.prepare('DELETE FROM auth_sessions WHERE user_id=? AND token_hash<>?').bind(user.userId, tokenHash(token)),
  ];
  if(requestedLogin){
    statements.push(env.DB.prepare('UPDATE users SET login=?,updated_at=? WHERE id=?').bind(requestedLogin.value,now,user.userId));
    if(memberId)statements.push(env.DB.prepare('UPDATE access_users SET login=?,updated_at=? WHERE id=?').bind(requestedLogin.value,now,memberId));
  }
  await env.DB.transaction(async client=>{for(const statement of statements)await statement.execute(client)});
  return Response.json({ ok: true,login:requestedLogin?.value||undefined });
}
