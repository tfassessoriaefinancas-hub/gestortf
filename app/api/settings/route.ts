import { env } from '@/lib/runtime';
import { getTfOwner } from '../../chatgpt-auth';

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const googleKey = 'google_review_url';
const postSaleKey = 'post_sale_message_template';

export async function GET() {
  const owner = await getTfOwner();
  if (!owner) return json({ error: 'Não autorizado.' }, 401);
  const rows = await env.DB.prepare('SELECT key,value FROM app_settings WHERE key IN (?,?)').bind(googleKey, postSaleKey).all<{ key:string;value:string }>();
  const values=Object.fromEntries(rows.results.map(row=>[row.key,row.value]));
  return json({ googleReviewUrl: values[googleKey] || '', postSaleMessageTemplate: values[postSaleKey] || '' });
}

export async function PATCH(request: Request) {
  const owner = await getTfOwner();
  if (!owner) return json({ error: 'Não autorizado.' }, 401);
  const body = await request.json() as Record<string, unknown>;
  if(body.googleReviewUrl!==undefined){const value=String(body.googleReviewUrl||'').trim();if(value&&!/^https:\/\//i.test(value))return json({error:'Use o link HTTPS do Google.'},400);await env.DB.prepare('INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(googleKey,value).run();}
  if(body.postSaleMessageTemplate!==undefined){const value=String(body.postSaleMessageTemplate||'').trim();if(value.length>4000)return json({error:'A mensagem deve ter no máximo 4.000 caracteres.'},400);await env.DB.prepare('INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(postSaleKey,value).run();}
  return GET();
}
