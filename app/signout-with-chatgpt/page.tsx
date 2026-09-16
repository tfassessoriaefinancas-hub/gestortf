'use client';
import { useEffect } from 'react';

export default function SignOut() {
  useEffect(() => {
    localStorage.removeItem('tf_access_unlocked');
    fetch('/api/auth/logout', { method: 'POST' }).then(response => {
      if (response.ok) window.location.replace('/');
      else window.location.reload();
    }).catch(() => window.location.reload());
  }, []);
  return <main className="tf-gate"><p>Bloqueando o sistema…</p></main>;
}
