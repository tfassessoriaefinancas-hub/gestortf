import { getTfAccess } from '../../chatgpt-auth';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const access = await getTfAccess();
  if (!access || access.role !== 'admin') return Response.json({ error: 'Não autorizado' }, { status: 401 });
  const { file } = await context.params;
  if (!['tf-clients.json', 'tf-operations.json'].includes(file)) return Response.json({ error: 'Arquivo não encontrado' }, { status: 404 });
  // Legacy clients receive no second dataset: all active records now come from /api/crm/data.
  return Response.json([], {
    headers: { 'cache-control': 'private, no-store' },
  });
}
