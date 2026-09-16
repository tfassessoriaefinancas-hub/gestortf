import { redirect } from 'next/navigation';
import { getChatGPTUser } from '../chatgpt-auth';

export default async function SignIn() {
  if (await getChatGPTUser()) redirect('/');
  return (
    <main className="tf-gate">
      <section className="tf-gate-card">
        <h1>Gestão TF</h1>
        <p>Esta cópia está configurada para acesso local. Abra o sistema em localhost no computador em que ele está instalado.</p>
        <a href="http://localhost:3000">Abrir acesso local</a>
      </section>
    </main>
  );
}
