'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Sparkles, Settings2, Cog, type LucideIcon } from 'lucide-react';
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
      <svg className="tf-hud-circuit" viewBox="0 0 1200 700" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M30 140H255L310 195H415M80 555H250L320 485H435M785 185H880V95H1140M775 480H875L945 550H1170M105 330H220V365H390M815 340H1035V285H1170"/>
          <path opacity=".45" d="M40 153H230L288 211H355M843 198H893V110H1105M800 496H860L931 568H1120"/>
          <circle cx="600" cy="350" r="168"/><circle cx="600" cy="350" r="182" strokeDasharray="1 13"/>
          <path strokeWidth="4" strokeDasharray="74 28 16 54" d="M600 172a178 178 0 1 1-.1 0"/>
        </g>
        <g fill="currentColor">{[[30,140],[255,140],[80,555],[1140,95],[1170,550],[105,330],[1170,285],[875,480]].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="3"/>)}</g>
        <g fill="currentColor" opacity=".5">{Array.from({length:14},(_,i)=><rect key={i} x={70+i*9} y={605-(i%4)*4} width="3" height={8+(i%4)*4}/>)}</g>
      </svg>
      <div className="tf-hud-center">
        <div className="tf-hud-dial">
          <div className="tf-hud-dial-segments" aria-hidden="true"/>
          <div className="tf-hud-engine" aria-hidden="true"><Cog className="tf-hud-gear-main" strokeWidth={1.1}/><Cog className="tf-hud-gear-small" strokeWidth={1.3}/><Settings2 className="tf-hud-engine-control" strokeWidth={1.3}/></div>
          <i className="tf-hud-light light-one" aria-hidden="true"/><i className="tf-hud-light light-two" aria-hidden="true"/>
        </div>
        <span>CENTRAL DE MÓDULOS</span>
        <small>Conectando seus negócios</small>
      </div>
      {ordered.map(({ id, label, icon: Icon }, index) => <div key={id} className={`tf-hud-tile${index < 4 ? ' is-primary' : ''}`} style={{
        '--tile-x': `${[9, 27, 73, 91][index % 4]}%`,
        '--tile-y': `${12 + Math.floor(index / 4) * 22 + [0, 5, -2, 4][index % 4]}%`,
        '--tile-offset': `${[-18, 15, -6, 24][index % 4]}px`,
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
