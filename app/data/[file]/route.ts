import { getTfAccess } from '../../chatgpt-auth';
import { readPrivateData } from '@/lib/private-data';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const access = await getTfAccess();
  if (!access || access.role !== 'admin') return Response.json({ error: 'Não autorizado' }, { status: 401 });
  const { file } = await context.params;
  if (!['tf-clients.json', 'tf-operations.json'].includes(file)) return Response.json({ error: 'Arquivo não encontrado' }, { status: 404 });
  return Response.json(readPrivateData<unknown[]>(`historical/${file}`, []), {
    headers: { 'cache-control': 'private, no-store' },
  });
}
