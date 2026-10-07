'use client';
import { useEffect } from 'react';

export default function SignOut() {
  useEffect(() => {
    localStorage.removeItem('tf_access_unlocked');
    const raw = new URLSearchParams(window.location.search).get('return_to') || '/';
    let returnTo = '/';
    try {
      const target = new URL(raw, window.location.origin);
      if (target.origin === window.location.origin && target.pathname !== '/signout-with-chatgpt') returnTo = `${target.pathname}${target.search}${target.hash}`;
    } catch {}
    fetch('/api/auth/logout', { method: 'POST' }).then(response => {
      if (response.ok) window.location.replace(returnTo);
      else window.location.reload();
    }).catch(() => window.location.reload());
  }, []);
  return <main className="tf-gate"><p>Bloqueando o sistema…</p></main>;
}
