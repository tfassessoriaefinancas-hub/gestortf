import { chatGPTSignOutPath, getTfAccess, requireChatGPTUser } from './chatgpt-auth';
import Dashboard from './dashboard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireChatGPTUser('/');
  const access = await getTfAccess(user);
  if (!access)
    return (
      <main className="tf-access-denied">
        <section>
          <img src="/tf-logo-no-bg.png" alt="TF Assessoria e Finanças" />
          <small>ACESSO NÃO AUTORIZADO</small>
          <h1>Seu usuário ainda não foi liberado</h1>
          <p>Peça ao administrador para cadastrar o e-mail <b>{user.email}</b> em Usuários e acessos.</p>
          <a href={chatGPTSignOutPath('/')}>Entrar com outra conta</a>
        </section>
      </main>
    );
  return <Dashboard user={{ name: access.displayName, email: access.email, role: access.role, memberId: access.memberId, partnerId:access.partnerId, permissions: access.permissions }} />;
}
