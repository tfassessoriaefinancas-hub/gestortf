'use client';

import { type CSSProperties } from 'react';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
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
  const items = modules.filter(item => item.id !== 'inicio');
  const rings = [
    { id: 'inner', items: items.filter(item => primaryModules.includes(item.id)), start: 0 },
    { id: 'outer', items: items.filter(item => !primaryModules.includes(item.id)), start: 6 },
  ];

  return <section className="tf-hologram-home" aria-label="Central de módulos Gestão TF">
    <header className="tf-holo-heading">
      <span>OLÁ, {name.trim().split(' ')[0].toUpperCase()}</span>
      <h1>Seu universo de negócios.</h1>
      <p>Escolha um módulo e siga em frente.</p>
    </header>
    <nav className="tf-holo-space" aria-label="Todos os módulos">
      <div className="tf-holo-core">
        <img src="/tf-logo-exact.png" alt="TF Assessoria & Finanças" width={1238} height={594}/>
        <span>CENTRAL DE MÓDULOS</span>
      </div>
      {rings.filter(ring => ring.items.length).map(ring => <div key={ring.id} className={`tf-holo-ring tf-holo-ring-${ring.id}`}>
        <div className="tf-holo-track" aria-hidden="true"/>
        {[18, 55, 88].map(start => <span key={start} className="tf-holo-spark" aria-hidden="true" style={{ '--start': `${start}%` } as CSSProperties}/>)}
        {ring.items.map(({ id, label, icon: Icon }, index) => <div key={id} className="tf-holo-anchor" style={{
          '--start': `${ring.start + index * 100 / ring.items.length}%`,
          '--tone': moduleAccentColors[id] || '#31618f',
          '--glint-delay': `${-index * .73}s`,
        } as CSSProperties}>
          <button type="button" className="tf-holo-card" onClick={() => go(id)} aria-label={`Abrir ${label}`} title={label}>
            <span className="tf-holo-glint" aria-hidden="true"/>
            <Icon className="tf-holo-icon" strokeWidth={1.6} aria-hidden="true"/>
            <span className="tf-holo-label">{labels[id] || label}</span>
            <ArrowUpRight className="tf-holo-arrow" size={12} aria-hidden="true"/>
          </button>
        </div>)}
      </div>)}
    </nav>
    <footer className="tf-holo-footer">
      <span>GESTÃO TF <i aria-hidden="true"/> CONECTANDO SEUS NEGÓCIOS</span>

    </footer>
  </section>;
}
