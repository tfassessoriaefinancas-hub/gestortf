'use client';

import { useState, type CSSProperties } from 'react';
import { ArrowUpRight, Pause, Play, type LucideIcon } from 'lucide-react';

type Module = { id: string; label: string; icon: LucideIcon };
type Props = { name: string; modules: Module[]; go: (id: string) => void };
const labels: Record<string, string> = {
  numeros: 'Seu negócio em números', compromissos: 'Compromissos', bancos: 'Bancos',
  calculadora: 'Calculadora', financeiro: 'Financeiro / Comissões', usuarios: 'Usuários e acessos',
};

export default function ClassicHome({ name, modules, go }: Props) {
  const [paused, setPaused] = useState(false);
  const items = modules.filter(item => item.id !== 'inicio');
  return <section className={`tf-launcher${paused ? ' is-paused' : ''}`} aria-label="Central de módulos Gestão TF">
    <header className="tf-launcher-heading">
      <span>OLÁ, {name.split(' ')[0].toUpperCase()}</span>
      <h1>Seu universo de negócios.</h1>
      <p>Escolha um módulo para começar.</p>
    </header>
    <div className="tf-launcher-space" role="navigation" aria-label="Todos os módulos">
      <div className="tf-launcher-orbit-line" aria-hidden="true" />
      <div className="tf-launcher-orbit-line inner" aria-hidden="true" />
      <div className="tf-launcher-glow" aria-hidden="true" />
      <div className="tf-launcher-core"><img src="/tf-emblem.png" alt="" width={64} height={64}/><strong>Gestão TF</strong><span>MELHOR QUE BANCO</span><i aria-hidden="true" /></div>
      {items.map(({ id, label, icon: Icon }, index) => <div key={id} className="tf-launcher-slot" style={{ '--start': `${index * 100 / items.length}%`, '--tone': ['#927d55', '#638777', '#6c829b', '#8b7895'][index % 4] } as CSSProperties}>
        <button type="button" className={`tf-launcher-module${id === 'numeros' ? ' is-overview' : ''}`} onClick={() => go(id)} aria-label={`Abrir ${label}`}>
          <i><Icon size={25} strokeWidth={1.45}/><ArrowUpRight className="tf-launcher-arrow" size={11} /></i>
          <span>{labels[id] || label}</span>
        </button>
      </div>)}
    </div>
    <footer className="tf-launcher-footer"><span><i/> TF ASSESSORIA & FINANÇAS</span><button type="button" onClick={() => setPaused(value => !value)} aria-pressed={paused} aria-label={paused ? 'Retomar animação dos módulos' : 'Pausar animação dos módulos'}>{paused ? <Play size={12} /> : <Pause size={12} />}{paused ? 'Retomar movimento' : 'Pausar movimento'}</button></footer>
  </section>;
}
