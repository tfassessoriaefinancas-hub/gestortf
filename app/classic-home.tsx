'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import './finance-network-home.css';

type Module = { id: string; label: string; icon: LucideIcon };
type Props = { name: string; modules: Module[]; go: (id: string) => void };
const labels: Record<string, string> = {
  numeros: 'Painel de Gestão', atendimento: 'Kanban', compromissos: 'Agenda',
  bancos: 'Bancos', calculadora: 'Calculadora', financeiro: 'Financeiro',
  usuarios: 'Usuários e acessos',
};
const primaryModules = ['numeros', 'atendimento', 'clientes', 'producao'];
// Photo, fingertip, connection lines and controls share one coordinate system.
const origin = [31, 40];
const positions = [
  [48, 14], [58, 26], [62, 42], [60, 59], [53, 74], [43, 85], [30, 91],
  [69, 9], [81, 20], [89, 36], [91, 54], [85, 72], [73, 86], [59, 91],
];

export default function ClassicHome({ name, modules, go }: Props) {
  const [opening, setOpening] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!opening) return;
    const timer = window.setTimeout(() => go(opening), 180);
    return () => window.clearTimeout(timer);
  }, [opening, go]);
  const items = modules.filter(item => item.id !== 'inicio');
  const ordered = [...items.filter(item => primaryModules.includes(item.id)), ...items.filter(item => !primaryModules.includes(item.id))];

  return <section className="tf-network-home" aria-label="Central de módulos Gestão TF">
    <header className="tf-network-heading">
      <span>OLÁ, {name.trim().split(' ')[0].toUpperCase()}</span>
      <h1>Seu negócio.<br/><em>Tudo conectado.</em></h1>
      <p>Escolha um módulo e dê o próximo passo.</p>
    </header>
    <nav className="tf-network-scene" aria-label="Todos os módulos">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="tf-network-background" src="/tf-finance-network.webp" alt="" width={1536} height={1024} fetchPriority="high" />
      <div className="tf-network-shade" aria-hidden="true"/>
      <svg className="tf-network-connections" viewBox="0 0 1000 666.667" preserveAspectRatio="none" aria-hidden="true">
        {ordered.map(({id},i) => {
          const [x,y]=positions[i % positions.length];
          return <g key={id} className={active===id || opening===id ? 'is-active' : undefined}>
            <line x1={origin[0]*10} y1={origin[1]*6.66667} x2={x*10} y2={y*6.66667}/>
            <circle cx={x*10} cy={y*6.66667} r="2.5"/>
            <circle className="tf-network-pulse" r="2">
              <animate attributeName="cx" values={`${origin[0]*10};${x*10}`} dur="6s" begin={`${i*.48}s`} repeatCount="indefinite"/>
              <animate attributeName="cy" values={`${origin[1]*6.66667};${y*6.66667}`} dur="6s" begin={`${i*.48}s`} repeatCount="indefinite"/>
            </circle>
          </g>;
        })}
      </svg>
      <div className="tf-network-origin" aria-hidden="true"><i/><i/><span>TF</span></div>
      <div className="tf-network-nodes">
        {ordered.map(({id,label,icon:Icon},i) => <button key={id} type="button"
          className={`tf-network-node${primaryModules.includes(id)?' is-primary':''}${opening===id?' is-opening':''}`}
          style={{'--node-x':`${positions[i%positions.length][0]}%`,'--node-y':`${positions[i%positions.length][1]}%`,'--node-delay':`${-i*.55}s`} as CSSProperties}
          onMouseEnter={()=>setActive(id)} onMouseLeave={()=>setActive(null)} onFocus={()=>setActive(id)} onBlur={()=>setActive(null)}
          onClick={()=>{if(!opening)setOpening(id);}} aria-busy={opening===id} aria-label={`Abrir ${label}`}>
          <span className="tf-network-glyph" aria-hidden="true"><Icon strokeWidth={1.65}/><ArrowUpRight className="tf-network-arrow"/></span>
          <span className="tf-network-label">{labels[id]||label}</span>
        </button>)}
      </div>
    </nav>
    <footer className="tf-network-footer"><strong>GESTÃO TF</strong><span>MELHOR QUE BANCO</span></footer>
  </section>;
}
