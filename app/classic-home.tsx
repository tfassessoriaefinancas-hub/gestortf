'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
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
function orbitPosition(index: number, count: number, turn = 0) {
  const innerCount = Math.ceil(count / 2);
  const outer = index >= innerCount;
  const ringCount = outer ? count - innerCount : innerCount;
  const slot = outer ? index - innerCount : index;
  const angle = (slot / Math.max(1, ringCount) + (outer ? .5 / innerCount : 0)) * Math.PI * 2 + turn - Math.PI / 2;
  return [65 + Math.cos(angle) * (outer ? 27 : 14), 52 + Math.sin(angle) * (outer ? 40 : 27)];
}

export default function ClassicHome({ name, modules, go }: Props) {
  const [opening, setOpening] = useState<string | null>(null);
  const scene = useRef<HTMLElement>(null);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!opening) return;
    const timer = window.setTimeout(() => go(opening), 180);
    return () => window.clearTimeout(timer);
  }, [opening, go]);
  const items = modules.filter(item => item.id !== 'inicio');
  const ordered = [...items.filter(item => primaryModules.includes(item.id)), ...items.filter(item => !primaryModules.includes(item.id))];
  const moduleKey = ordered.map(item => item.id).join('|');
  useEffect(() => {
    const root = scene.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('.tf-network-node'));
    const lines = Array.from(root.querySelectorAll<SVGLineElement>('.tf-network-connections line'));
    const dots = Array.from(root.querySelectorAll<SVGCircleElement>('.tf-network-connections circle'));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(max-width: 700px)');
    let frame = 0, last = 0, elapsed = 0;
    function animate(now: number) {
      const paused = reduced.matches || mobile.matches || document.hidden || root!.matches(':hover, :focus-within');
      if (last && !paused) elapsed += Math.min(now - last, 64);
      last = now;
      if (!paused) nodes.forEach((node, i) => {
        const [x, y] = orbitPosition(i, nodes.length, elapsed / 110000 * Math.PI * 2);
        node.style.setProperty('--node-x', `${x}%`);
        node.style.setProperty('--node-y', `${y}%`);
        lines[i]?.setAttribute('x2', String(x * 10));
        lines[i]?.setAttribute('y2', String(y * 6.66667));
        dots[i]?.setAttribute('cx', String(x * 10));
        dots[i]?.setAttribute('cy', String(y * 6.66667));
      });
      frame = window.requestAnimationFrame(animate);
    }
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [moduleKey]);

  return <section className="tf-network-home" aria-label="Central de módulos Gestão TF">
    <header className="tf-network-heading">
      <span>OLÁ, {name.trim().split(' ')[0].toUpperCase()}</span>
      <h1>Seu negócio.<br/><em>Tudo conectado.</em></h1>
      <p>Escolha um módulo e dê o próximo passo.</p>
    </header>
    <nav ref={scene} className="tf-network-scene" aria-label="Todos os módulos">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="tf-network-background" src="/tf-finance-network.webp" alt="" width={1536} height={1024} fetchPriority="high" />
      <div className="tf-network-shade" aria-hidden="true"/>
      <svg className="tf-network-connections" viewBox="0 0 1000 666.667" preserveAspectRatio="none" aria-hidden="true">
        {ordered.map(({id},i) => {
          const [x,y]=orbitPosition(i, ordered.length);
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
          style={{'--node-x':`${orbitPosition(i, ordered.length)[0]}%`,'--node-y':`${orbitPosition(i, ordered.length)[1]}%`,'--node-delay':`${-i*.55}s`} as CSSProperties}
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
