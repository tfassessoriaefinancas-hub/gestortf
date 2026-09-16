'use client';
import { useState } from 'react';

export default function LoginForm() {
  const [login, setLogin] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login, password }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || 'Não foi possível entrar.'); return; }
      window.location.replace('/');
    } catch { setError('Não foi possível conectar. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <main className="tf-gate"><section className="tf-gate-card">
    <div className="tf-gate-brand" aria-label="TF Assessoria e Finanças"><img src="/tf-emblem.png" alt="TF"/><strong>Assessoria &amp; Finanças</strong></div><small>ASSESSORIA E FINANÇAS</small>
    <h1>Gestão</h1><p>Entre com seu CPF ou e-mail e senha.</p>
    <form onSubmit={submit}>
      <label>CPF ou e-mail<input type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} required value={login} onChange={e => setLogin(e.target.value)} /></label>
      <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      <button className="tf-primary" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
    </form>
  </section></main>;
}
