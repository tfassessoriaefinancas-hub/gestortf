'use client';
import { useEffect } from 'react';

export default function SignOut() {
  useEffect(() => {
    localStorage.removeItem('tf_access_unlocked');
    window.location.replace('/');
  }, []);
  return <main className="tf-gate"><p>Bloqueando o sistema…</p></main>;
}
