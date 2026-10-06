import { redirect } from 'next/navigation';
import { getTfAccess, requireChatGPTUser } from '../chatgpt-auth';
import ImportGgClient from './client';

export const dynamic = 'force-dynamic';

export default async function ImportGgPage() {
  const user = await requireChatGPTUser('/importar-gg');
  const access = await getTfAccess(user);
  if (!access || access.role !== 'admin') redirect('/');
  return <ImportGgClient/>;
}
