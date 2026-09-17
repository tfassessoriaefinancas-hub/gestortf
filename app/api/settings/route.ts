import { env } from '@/lib/runtime';
import { getTfOwner } from '../../chatgpt-auth';

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const key = 'google_review_url';

export async function GET() {
  const owner = await getTfOwner();
  if (!owner) return json({ error: 'Não autorizado.' }, 401);
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{ value: string }>();
  return json({ googleReviewUrl: row?.value || '' });
}

export async function PATCH(request: Request) {
  const owner = await getTfOwner();
  if (!owner) return json({ error: 'Não autorizado.' }, 401);
  const body = await request.json() as Record<string, unknown>;
  const value = String(body.googleReviewUrl || '').trim();
  if (value && !/^https:\/\//i.test(value)) return json({ error: 'Use o link HTTPS do Google.' }, 400);
  await env.DB.prepare('INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, value).run();
  return json({ googleReviewUrl: value });
}
