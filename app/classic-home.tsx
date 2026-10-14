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
const spriteOrder = ['numeros','atendimento','clientes','producao','compromissos','bancos','calculadora','financeiro','notas','parceiros','relatorios','servicos','posvenda','usuarios'];
const spriteRows = [63,378,681,986,1278];
const primaryModules = ['numeros', 'atendimento', 'clientes', 'producao'];
// Keep the complete constellation inside the available screen area.
// These coordinates match the desktop grid in finance-network-home.css.
const origin = [31, 40];
function modulePosition(index: number, count: number) {
  const rows = Math.max(1, Math.ceil(count / 4));
  return [42 + (index % 4 + .5) * 13.5, 7 + (Math.floor(index / 4) + .5) * 86 / rows];
}

export default function ClassicHome({ name, modules, go }: Props) {
  const [opening, setOpening] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!opening) return;
    const timer = window.setTimeout(() => go(opening), 180);
    return () => window.clearTimeout(timer);
  }, [opening, go]);
  const items = modules.filter(item => item.id !== 'inicio');
  const ordered = [...items].sort((a,b) => (spriteOrder.indexOf(a.id)<0?99:spriteOrder.indexOf(a.id)) - (spriteOrder.indexOf(b.id)<0?99:spriteOrder.indexOf(b.id)));

  return <section className="tf-network-home" style={{'--desktop-rows':Math.max(1,Math.ceil(ordered.length/4)),'--mobile-rows':Math.max(1,Math.ceil(ordered.length/3)),'--landscape-rows':Math.max(1,Math.ceil(ordered.length/5))} as CSSProperties} aria-label="Central de módulos Gestão TF">
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
          const [x,y]=modulePosition(i, ordered.length);
          return <g key={id} className={active===id || opening===id ? 'is-active' : undefined}>
            <line x1={origin[0]*10} y1={origin[1]*6.66667} x2={x*10} y2={y*6.66667}/>
            <circle cx={x*10} cy={y*6.66667} r="2.5"/>

          </g>;
        })}
      </svg>
      <div className="tf-network-origin">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tf-logo-exact.png" alt="TF Assessoria & Finanças" width={1238} height={594}/>
      </div>
      <div className="tf-network-nodes">
        {ordered.map(({id,label,icon:Icon},i) => <button key={id} type="button"
          className={`tf-network-node${primaryModules.includes(id)?' is-primary':''}${opening===id?' is-opening':''}`}
          style={{'--node-delay':`${-i*.73}s`,'--node-duration':`${6.4+(i%5)*.65}s`,'--sprite-x':`${(spriteOrder.indexOf(id)%3)*50}%`,'--sprite-y':`${-spriteRows[Math.floor(spriteOrder.indexOf(id)/3)]/(971/3)}em`} as CSSProperties}
          onMouseEnter={()=>setActive(id)} onMouseLeave={()=>setActive(null)} onFocus={()=>setActive(id)} onBlur={()=>setActive(null)}
          onClick={()=>{if(!opening)setOpening(id);}} aria-busy={opening===id} aria-label={`Abrir ${label}`}>
          <span className="tf-network-glyph" aria-hidden="true">{spriteOrder.includes(id)?<span className="tf-network-metal-icon"/>:<Icon strokeWidth={1.65}/>}<ArrowUpRight className="tf-network-arrow"/></span>
          <span className="tf-network-label">{labels[id]||label}</span>
        </button>)}
      </div>
    </nav>
    <footer className="tf-network-footer"><strong>GESTÃO TF</strong><span>MELHOR QUE BANCO</span></footer>
  </section>;
}
