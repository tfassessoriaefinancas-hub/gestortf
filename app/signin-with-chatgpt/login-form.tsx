'use client';
import { useState } from 'react';

export default function LoginForm({returnTo='/',partnerAccess=false}:{returnTo?:string;partnerAccess?:boolean}) {
  const [login, setLogin] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login, password }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || 'Não foi possível entrar.'); return; }
      window.location.replace(returnTo);
    } catch { setError('Não foi possível conectar. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <main className={`tf-gate${partnerAccess?' tf-partner-signin':''}`}><section className="tf-gate-card">
    {partnerAccess?<div className="tf-gate-brand tf-gate-partner-brand" aria-label="GG Veículos"><img src="/gg-veiculos-logo.png" alt="GG Veículos"/></div>:<div className="tf-gate-brand" aria-label="TF Assessoria e Finanças"><img src="/tf-emblem.png" alt="TF"/><strong>Assessoria &amp; Finanças</strong></div>}<small>{partnerAccess?'ACESSO EXCLUSIVO DO PARCEIRO':'ASSESSORIA E FINANÇAS'}</small>
    <h1>{partnerAccess?'Portal GG Veículos':'Gestão'}</h1><p>{partnerAccess?'Entre com o usuário ggveiculos e a sua senha.':'Entre com CPF, e-mail ou login e senha.'}</p>
    <form onSubmit={submit}>
      <label>CPF, e-mail ou login<input type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} required value={login} onChange={e => setLogin(e.target.value)} /></label>
      <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      <button className="tf-primary" type="submit" disabled={busy}>{busy ? 'Entrando…' : partnerAccess?'Entrar no portal':'Entrar'}</button>
    </form>
  </section></main>;
}
