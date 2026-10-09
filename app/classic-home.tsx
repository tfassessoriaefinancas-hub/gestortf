'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Sparkles, type LucideIcon } from 'lucide-react';
import { moduleAccentColors } from './module-appearance';
import './hologram-home.css';

type Module = { id: string; label: string; icon: LucideIcon };
type Props = { name: string; modules: Module[]; go: (id: string) => void };
const labels: Record<string, string> = {
  numeros: 'Painel de Gestão', atendimento: 'Kanban', compromissos: 'Agenda',
  bancos: 'Bancos', calculadora: 'Calculadora', financeiro: 'Financeiro',
  usuarios: 'Usuários e acessos',
};
const primaryModules = ['numeros', 'atendimento', 'clientes', 'producao'];

export default function ClassicHome({ name, modules, go }: Props) {
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    if (!opening) return;
    const timer = window.setTimeout(() => go(opening), 180);
    return () => window.clearTimeout(timer);
  }, [opening, go]);
  const items = modules.filter(item => item.id !== 'inicio');
  const ordered = [...items.filter(item => primaryModules.includes(item.id)), ...items.filter(item => !primaryModules.includes(item.id))];
  const rowCount = Math.max(2, Math.ceil(ordered.length / 4));

  return <section className="tf-hud-home" aria-label="Central de módulos Gestão TF">
    <header className="tf-hud-heading">
      <span><Sparkles size={13} aria-hidden="true"/> OLÁ, {name.trim().split(' ')[0].toUpperCase()}</span>
      <h1>Seu universo de negócios.</h1>
      <p>Tudo conectado. Cada detalhe sob seu controle.</p>
    </header>
    <nav className="tf-hud-console" aria-label="Todos os módulos" style={{ '--hud-rows': rowCount } as CSSProperties}>
      <div className="tf-hud-center">
        <div className="tf-hud-dial">
          <div className="tf-hud-dial-segments" aria-hidden="true"/>
          <div className="tf-hud-brand"><img src="/tf-logo-exact.png" alt="TF Assessoria & Finanças" width={1238} height={594}/></div>
          <i className="tf-hud-light light-one" aria-hidden="true"/><i className="tf-hud-light light-two" aria-hidden="true"/>
        </div>
        <span>CENTRAL DE MÓDULOS</span>
        <small>Conectando seus negócios</small>
      </div>
      {ordered.map(({ id, label, icon: Icon }, index) => <div key={id} className={`tf-hud-tile${index < 4 ? ' is-primary' : ''}`} style={{
        '--tile-column': [1, 2, 4, 5][index % 4],
        '--tile-row': Math.floor(index / 4) + 1,
        '--tone': moduleAccentColors[id] || '#31618f',
        '--float-delay': `${-index * .67}s`,
        '--float-duration': `${6 + (index % 4) * .7}s`,
      } as CSSProperties}>
        <button type="button" className={`tf-hud-card${opening === id ? ' is-opening' : ''}`} onClick={() => { if (!opening) setOpening(id); }} aria-busy={opening === id} aria-label={`Abrir ${label}`}>
          <span className="tf-hud-card-shine" aria-hidden="true"/>
          <span className="tf-hud-icon"><Icon strokeWidth={1.45} aria-hidden="true"/></span>
          <span className="tf-hud-label">{labels[id] || label}</span>
          <ArrowUpRight className="tf-hud-arrow" size={14} aria-hidden="true"/>
        </button>
      </div>)}
    </nav>
    <footer className="tf-hud-footer"><span>GESTÃO TF</span><i aria-hidden="true"/>SEU PRÓXIMO PASSO COMEÇA AQUI</footer>
  </section>;
}
