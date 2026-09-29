import { createHash } from 'node:crypto';
import { env } from '@/lib/runtime';
import { CRM_RESOURCES, revisionKey } from '@/lib/crm-resources';
import { getTfAccess } from '../../../chatgpt-auth';

export async function GET() {
  const user = await getTfAccess();
  const headers = { 'cache-control': 'private, no-store' };
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401, headers });
  const keys = CRM_RESOURCES.map(revisionKey);
  const { results } = await env.DB.prepare(`SELECT key,value FROM app_settings WHERE key IN (${keys.map(() => '?').join(',')})`)
    .bind(...keys).all<{ key: string; value: string }>();
  const stored = new Map(results.map(row => [row.key, row.value]));
  const scope = createHash('sha256').update(JSON.stringify([user.userId, user.ownerKeys, user.role, user.memberId, user.partnerId, [...user.permissions].sort()])).digest('hex');
  return Response.json({ scope, ...Object.fromEntries(CRM_RESOURCES.map(resource => [resource, stored.get(revisionKey(resource)) || '0'])) }, { headers });
}
