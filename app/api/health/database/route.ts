import { env } from '@/lib/runtime';

export async function GET() {
  try {
    await env.DB.prepare('SELECT id FROM users LIMIT 1').all<{ id: string }>();
    return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('Falha na verificação do banco:', error);
    return Response.json({ ok: false }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
