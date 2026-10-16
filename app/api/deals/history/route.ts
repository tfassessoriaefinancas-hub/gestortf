import { env } from '@/lib/runtime';
import { getTfAccess, hasTfPermission } from '../../../chatgpt-auth';

export async function GET(request: Request) {
  const user = await getTfAccess();
  if (!user || (!hasTfPermission(user, 'atendimento') && !hasTfPermission(user, 'clientes'))) return Response.json({error:'Não autorizado'}, {status:401});
  const params = new URL(request.url).searchParams, dealId = Number(params.get('dealId')), clientId = Number(params.get('clientId'));
  if (!dealId && !clientId) return Response.json({error:'Atendimento ou cliente inválido'}, {status:400});
  const values: (string|number|null)[] = [user.ownerKeys[0], user.ownerKeys[1], dealId || clientId];
  let scope = dealId ? 'd.id=?' : "d.client_id=? AND h.event_type='encerramento'";
  if (user.role === 'employee') { scope += ' AND d.assigned_user_id=?'; values.push(user.memberId); }
  const rows = await env.DB.prepare(`SELECT h.id,h.event_type as "eventType",h.description,h.source,h.created_at as "createdAt" FROM deal_history h JOIN deals d ON d.id=h.deal_id WHERE d.owner_id IN (?,?) AND ${scope} ORDER BY h.created_at DESC`).bind(...values).all();
  return Response.json({history:rows.results}, {headers:{'cache-control':'no-store'}});
}
