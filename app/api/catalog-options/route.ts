import { env } from '@/lib/runtime';
import { getTfAccess, hasTfPermission } from '../../chatgpt-auth';

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const kinds = new Set(['indicator', 'promoter', 'production']);
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export async function GET() {
  const user = await getTfAccess();
  if (!user || !hasTfPermission(user, 'atendimento')) return json({ error: 'Não autorizado.' }, 401);
  const rows = await env.DB.prepare("SELECT id,kind,label FROM crm_catalog_options WHERE owner_id IN (?,?) AND active=1 AND normalized_label!='teste 3' ORDER BY kind,lower(label)").bind(user.ownerKeys[0], user.ownerKeys[1]).all<{ id: number; kind: string; label: string }>();
  return json({ options: rows.results.map((row) => ({ id: Number(row.id), kind: row.kind, label: row.label })) });
}

export async function POST(request: Request) {
  const user = await getTfAccess();
  if (!user || !hasTfPermission(user, 'atendimento')) return json({ error: 'Não autorizado.' }, 401);
  const body = await request.json() as Record<string, unknown>;
  const kind = String(body.kind || ''), label = String(body.label || '').trim();
  if (!kinds.has(kind) || label.length < 2 || label.length > 120) return json({ error: 'Informe um cadastro válido.' }, 400);
  if (normalize(label) === 'teste 3') return json({ error: 'Esse cadastro de teste não está disponível.' }, 400);
  const now = Date.now();
  const row = await env.DB.prepare("INSERT INTO crm_catalog_options (owner_id,kind,label,normalized_label,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?) ON CONFLICT(owner_id,kind,normalized_label) DO UPDATE SET label=excluded.label,active=1,updated_at=excluded.updated_at RETURNING id,kind,label").bind(user.ownerKey, kind, label, normalize(label), now, now).first<{ id: number; kind: string; label: string }>();
  return row ? json({ option: { id: Number(row.id), kind: row.kind, label: row.label } }, 201) : json({ error: 'Não foi possível salvar o cadastro.' }, 500);
}

export async function DELETE(request: Request) {
  const user = await getTfAccess();
  if (!user || !hasTfPermission(user, 'atendimento')) return json({ error: 'Não autorizado.' }, 401);
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: 'Cadastro inválido.' }, 400);
  const row = await env.DB.prepare("UPDATE crm_catalog_options SET active=0,updated_at=? WHERE id=? AND owner_id IN (?,?) AND normalized_label!='teste 3' RETURNING id").bind(Date.now(), id, user.ownerKeys[0], user.ownerKeys[1]).first();
  return row ? json({ ok: true }) : json({ error: 'Cadastro não encontrado.' }, 404);
}
