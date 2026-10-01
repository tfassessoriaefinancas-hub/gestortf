import { env } from '@/lib/runtime';
import { getTfAccess, hasTfPermission } from '../../chatgpt-auth';

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'private, no-store' } });
const allowedTypes = new Set(['agendamento', 'compromisso', 'tarefa', 'lembrete']);
type ActivityRow = { id: number; type: string; title: string; due_at: number | null; completed_at: number | null };

function decode(row: ActivityRow) {
  let details: { title?: string; clientName?: string; notes?: string } = {};
  try { details = JSON.parse(row.title || '{}'); } catch { details = { title: row.title }; }
  return {
    id: Number(row.id), type: row.type, title: String(details.title || row.title || 'Atividade'),
    clientName: String(details.clientName || ''), notes: String(details.notes || ''),
    dueAt: row.due_at ? Number(row.due_at) : null, completedAt: row.completed_at ? Number(row.completed_at) : null,
  };
}

function input(body: Record<string, unknown>) {
  const type = String(body.type || ''), title = String(body.title || '').trim(), clientName = String(body.clientName || '').trim(), notes = String(body.notes || '').trim();
  const dueAt = Number(body.dueAt);
  if (!allowedTypes.has(type)) return { error: 'Escolha um tipo de atividade válido.' } as const;
  if (title.length < 2 || title.length > 160) return { error: 'Informe um título de até 160 caracteres.' } as const;
  if (!Number.isSafeInteger(dueAt) || dueAt < 1) return { error: 'Informe a data e o horário.' } as const;
  if (clientName.length > 160 || notes.length > 1200) return { error: 'Revise os dados informados.' } as const;
  return { type, dueAt, payload: JSON.stringify({ title, clientName, notes }) } as const;
}

export async function GET() {
  const user = await getTfAccess();
  if (!user || !hasTfPermission(user, 'inicio')) return json({ error: 'Não autorizado.' }, 401);
  const rows = await env.DB.prepare('SELECT id,type,title,due_at,completed_at FROM activities WHERE owner_id IN (?,?) ORDER BY due_at ASC,id DESC')
    .bind(user.ownerKeys[0], user.ownerKeys[1]).all<ActivityRow>();
  return json({ activities: rows.results.map(decode) });
}

export async function POST(request: Request) {
  const user = await getTfAccess();
  if (!user || !hasTfPermission(user, 'inicio')) return json({ error: 'Não autorizado.' }, 401);
  const data = input(await request.json() as Record<string, unknown>);
  if ('error' in data) return json({ error: data.error }, 400);
  const row = await env.DB.prepare('INSERT INTO activities (owner_id,type,title,due_at,completed_at) VALUES (?,?,?,?,NULL) RETURNING id,type,title,due_at,completed_at')
    .bind(user.ownerKey, data.type, data.payload, data.dueAt).first<ActivityRow>();
  return row ? json({ activity: decode(row) }, 201) : json({ error: 'Não foi possível cadastrar a atividade.' }, 500);
}

export async function PATCH(request: Request) {
  const user = await getTfAccess();
  if (!user || !hasTfPermission(user, 'inicio')) return json({ error: 'Não autorizado.' }, 401);
  const body = await request.json() as Record<string, unknown>, id = Number(body.id);
  if (!id) return json({ error: 'Atividade inválida.' }, 400);
  let row: ActivityRow | null;
  if (body.action === 'complete') {
    row = await env.DB.prepare('UPDATE activities SET completed_at=? WHERE id=? AND owner_id IN (?,?) RETURNING id,type,title,due_at,completed_at')
      .bind(body.completed === false ? null : Date.now(), id, user.ownerKeys[0], user.ownerKeys[1]).first<ActivityRow>();
  } else {
    const data = input(body);
    if ('error' in data) return json({ error: data.error }, 400);
    row = await env.DB.prepare('UPDATE activities SET type=?,title=?,due_at=? WHERE id=? AND owner_id IN (?,?) RETURNING id,type,title,due_at,completed_at')
      .bind(data.type, data.payload, data.dueAt, id, user.ownerKeys[0], user.ownerKeys[1]).first<ActivityRow>();
  }
  return row ? json({ activity: decode(row) }) : json({ error: 'Atividade não encontrada.' }, 404);
}

export async function DELETE(request: Request) {
  const user = await getTfAccess();
  if (!user || !hasTfPermission(user, 'inicio')) return json({ error: 'Não autorizado.' }, 401);
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: 'Atividade inválida.' }, 400);
  const row = await env.DB.prepare('DELETE FROM activities WHERE id=? AND owner_id IN (?,?) RETURNING id').bind(id, user.ownerKeys[0], user.ownerKeys[1]).first();
  return row ? json({ ok: true }) : json({ error: 'Atividade não encontrada.' }, 404);
}
