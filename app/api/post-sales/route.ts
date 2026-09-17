import { env } from '@/lib/runtime';
import { getTfAccess, hasTfPermission } from '../../chatgpt-auth';

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } });
type PostSaleRow = { id: number; operation_id: number; client_id: number; status: string; completed_at: number | null; created_at: number; client_name: string; phone: string | null; cpf: string | null; original_product: string | null; bank: string | null; value_cents: number | null; installment_cents: number | null; term: number | null; operation_date: string | null; paid_at: string | null; origin: string | null; partner_name: string | null; notes: string | null };
type PostSaleCurrent = { id: number; operation_id: number; status: string; deal_id: number | null };
type PostSaleTaskRow = { id: number; status: string; completed_at: number | null };

export async function GET() {
  const user = await getTfAccess();
  if (!user || !hasTfPermission(user, 'posvenda')) return json({ error: 'Não autorizado.' }, 401);
  const employeeScope = user.role === 'employee' ? ' AND (o.partner_id=? OR o.assigned_user_id=?)' : '';
  const values = user.role === 'employee' ? [user.ownerKeys[0], user.ownerKeys[1], user.memberId || user.partnerId, user.memberId] : [user.ownerKeys[0], user.ownerKeys[1]];
  const rows = await env.DB.prepare(`SELECT t.id,t.operation_id,t.client_id,t.status,t.completed_at,t.created_at,t.updated_at,
    c.name client_name,c.phone,c.cpf,o.original_product,o.bank,o.value_cents,o.installment_cents,o.term,o.operation_date,o.paid_at,
    o.origin,o.producer,p.name partner_name,o.notes
    FROM post_sale_tasks t JOIN clients c ON c.id=t.client_id JOIN operations o ON o.id=t.operation_id
    LEFT JOIN partners p ON p.id=o.partner_id AND p.deleted_at IS NULL
    WHERE t.owner_id IN (?,?) AND c.deleted_at IS NULL AND o.deleted_at IS NULL${employeeScope}
    ORDER BY CASE WHEN t.status='pendente' THEN 0 ELSE 1 END,t.updated_at DESC,t.id DESC`).bind(...values).all<PostSaleRow>();
  const setting = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind('google_review_url').first<{ value: string }>();
  return json({
    googleReviewUrl: setting?.value || '',
    tasks: rows.results.map((row) => {
      let notes: Record<string, unknown> = {};
      try { notes = JSON.parse(row.notes || '{}'); } catch { /* legacy notes */ }
      return {
        id: Number(row.id), operationId: Number(row.operation_id), clientId: Number(row.client_id), status: row.status,
        completedAt: row.completed_at ? Number(row.completed_at) : null, createdAt: Number(row.created_at),
        clientName: row.client_name || 'Cliente', phone: row.phone || '', cpf: row.cpf || '', product: row.original_product || 'Operação',
        bank: row.bank || 'Não informado', value: Number(row.value_cents || 0) / 100, installment: Number(row.installment_cents || 0) / 100,
        term: Number(row.term || 0), completionDate: row.paid_at || row.operation_date || '', partner: row.partner_name || row.origin || 'TF',
        postSaleNotes: String(notes.postSaleNotes || ''), postSale: String(notes.postSale || ''),
      };
    }),
  });
}

export async function PATCH(request: Request) {
  const user = await getTfAccess();
  if (!user || !hasTfPermission(user, 'posvenda')) return json({ error: 'Não autorizado.' }, 401);
  const body = await request.json() as Record<string, unknown>;
  const id = Number(body.id);
  if (!id) return json({ error: 'Pós-venda inválido.' }, 400);
  const employeeScope = user.role === 'employee' ? ' AND (o.partner_id=? OR o.assigned_user_id=?)' : '';
  const current = await env.DB.prepare(`SELECT t.*,d.id deal_id FROM post_sale_tasks t JOIN operations o ON o.id=t.operation_id LEFT JOIN deals d ON d.operation_id=o.id AND d.owner_id IN (?,?) WHERE t.id=? AND t.owner_id IN (?,?)${employeeScope} LIMIT 1`).bind(...(user.role === 'employee' ? [user.ownerKeys[0], user.ownerKeys[1], id, user.ownerKeys[0], user.ownerKeys[1], user.memberId || user.partnerId, user.memberId] : [user.ownerKeys[0], user.ownerKeys[1], id, user.ownerKeys[0], user.ownerKeys[1]])).first<PostSaleCurrent>();
  if (!current) return json({ error: 'Pós-venda não encontrado.' }, 404);
  if (body.status !== 'concluido') return json({ error: 'Status inválido.' }, 400);
  const now = Date.now();
  await env.DB.transaction(async (client) => {
    const updated = await client.query('UPDATE post_sale_tasks SET status=\'concluido\',completed_at=COALESCE(completed_at,$1),updated_at=$1 WHERE id=$2 AND status!=\'concluido\' RETURNING id,completed_at', [now, id]);
    if (!updated.rowCount) return;
    await client.query("INSERT INTO deal_history (owner_id,deal_id,operation_id,event_type,description,before_json,after_json,source,created_at) VALUES ($1,$2,$3,'pos_venda_concluido',$4,$5,$6,'Gestão TF',$7)", [user.ownerKey, current.deal_id || null, current.operation_id, 'Pós-venda concluído com sucesso.', JSON.stringify({ status: 'pendente' }), JSON.stringify({ status: 'concluido', completedAt: now }), now]);
  });
  const task = await env.DB.prepare('SELECT id,status,completed_at FROM post_sale_tasks WHERE id=?').bind(id).first<PostSaleTaskRow>();
  return json({ ok: true, task: task ? { id: Number(task.id), status: task.status, completedAt: Number(task.completed_at || now) } : null });
}
