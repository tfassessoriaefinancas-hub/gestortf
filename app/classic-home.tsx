'use client';

import { useState, type CSSProperties } from 'react';
import { ArrowUpRight, Pause, Play, type LucideIcon } from 'lucide-react';

type Module = { id: string; label: string; icon: LucideIcon };
type Props = { name: string; modules: Module[]; go: (id: string) => void };
const labels: Record<string, string> = {
  numeros: 'Seu negócio em números', compromissos: 'Compromissos', bancos: 'Bancos',
  calculadora: 'Calculadora', financeiro: 'Financeiro / Comissões', usuarios: 'Usuários e acessos',
};
const compactLabels: Record<string, string> = { atendimento: 'Kanban', calculadora: 'Cálculos', numeros: 'Números', compromissos: 'Agenda', financeiro: 'Financeiro', usuarios: 'Acessos' };
const primaryModules = ['atendimento', 'clientes', 'producao', 'numeros'];

export default function ClassicHome({ name, modules, go }: Props) {
  const [paused, setPaused] = useState(false);
  const items = modules.filter(item => item.id !== 'inicio');
  const rings = [
    { id: 'inner', items: items.filter(item => primaryModules.includes(item.id)), start: 0 },
    { id: 'outer', items: items.filter(item => !primaryModules.includes(item.id)), start: 5 },
  ];
  return <section className={`tf-launcher${paused ? ' is-paused' : ''}`} aria-label="Central de módulos Gestão TF">
    <header className="tf-launcher-heading">
      <span>OLÁ, {name.split(' ')[0].toUpperCase()}</span>
      <h1>Seu universo de negócios.</h1>
      <p>Escolha um módulo para começar.</p>
    </header>
    <div className="tf-launcher-space" role="navigation" aria-label="Todos os módulos">
      <div className="tf-launcher-core">
        <img src="/tf-logo-exact.png" alt="TF Assessoria & Finanças" width={1238} height={594}/>
      </div>
      {rings.filter(ring => ring.items.length).map(ring => <div key={ring.id} className={`tf-launcher-ring ring-${ring.id}`}>
        <div className="tf-launcher-orbit-line" aria-hidden="true" />
        {[12, 43, 78].map(start => <span key={start} className="tf-launcher-spark" aria-hidden="true" style={{ '--start': `${start}%` } as CSSProperties} />)}
        {ring.items.map(({ id, label, icon: Icon }, index) => <div key={id} className="tf-launcher-slot" style={{ '--start': `${ring.start + index * 100 / ring.items.length}%`, '--tone': ['#8b7959', '#5c7d73', '#687d92', '#83798e'][index % 4] } as CSSProperties}>
          <button type="button" className={`tf-launcher-module${id === 'numeros' ? ' is-overview' : ''}`} onClick={() => go(id)} aria-label={`Abrir ${label}`} title={label}>
            <i><Icon size={23} strokeWidth={1.45}/></i>
            <span><span className="tf-module-full-label">{labels[id] || label}</span><span className="tf-module-compact-label">{compactLabels[id] || labels[id] || label}</span></span>
            <ArrowUpRight className="tf-launcher-arrow" size={12} aria-hidden="true" />
          </button>
        </div>)}
      </div>)}
    </div>
    <footer className="tf-launcher-footer"><span><i/> SEU CRM, SEMPRE CONECTADO</span><button type="button" onClick={() => setPaused(value => !value)} aria-pressed={paused} aria-label={paused ? 'Retomar animação dos módulos' : 'Pausar animação dos módulos'}>{paused ? <Play size={12} /> : <Pause size={12} />}{paused ? 'Retomar movimento' : 'Pausar movimento'}</button></footer>
  </section>;
}
