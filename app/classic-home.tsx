'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Sparkles, Cog, type LucideIcon } from 'lucide-react';
import './hologram-home.css';

type Module = { id: string; label: string; icon: LucideIcon };
type Props = { name: string; modules: Module[]; go: (id: string) => void };
const labels: Record<string, string> = {
  numeros: 'Painel de Gestão', atendimento: 'Kanban', compromissos: 'Agenda',
  bancos: 'Bancos', calculadora: 'Calculadora', financeiro: 'Financeiro',
  usuarios: 'Usuários e acessos',
};
const primaryModules = ['numeros', 'atendimento', 'clientes', 'producao'];

// Photo and controls share one coordinate space: pen tip at 48.4%, 46.5%.
const planes = [
 [10,35,11,-16,2], [26,21,11,-12,-3], [13,62,11,-14,2],
 [72,20,10,14,-3], [72,55,10,12,-2], [90,65,10,14,-2],
 [88,43,10,14,-3], [10,12,10,-14,2], [55,13,10,10,-2],
 [88,15,10,14,-3], [28,79,11,-10,2], [48,83,11,8,-2],
 [68,80,11,12,-2], [88,87,11,14,-2],
];
// A compact perimeter on phones leaves the hand and pen visible in the center.
const mobilePlanes = [
 [15,29], [15,10], [15,48], [84,12], [84,49], [15,67],
 [84,68], [16,84], [49,8], [84,31], [50,81], [32,100],
 [84,85], [68,100],
];

export default function ClassicHome({ name, modules, go }: Props) {
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    if (!opening) return;
    const timer = window.setTimeout(() => go(opening), 180);
    return () => window.clearTimeout(timer);
  }, [opening, go]);
  const items = modules.filter(item => item.id !== 'inicio');
  const ordered = [...items.filter(item => primaryModules.includes(item.id)), ...items.filter(item => !primaryModules.includes(item.id))];

  return <section className="tf-hud-home is-spatial is-reference" aria-label="Central de módulos Gestão TF">
    <header className="tf-hud-heading">
      <span><Sparkles size={13} aria-hidden="true"/> OLÁ, {name.trim().split(' ')[0].toUpperCase()}</span>
      <h1>Seu universo de negócios.</h1>
      <p>Tudo conectado. Cada detalhe sob seu controle.</p>
    </header>
    <nav className="tf-hud-console" aria-label="Todos os módulos">
      <div className="tf-hud-scene" aria-hidden="true">
        {/* Keep the photo in its own plane so the pen and dial stay aligned. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tf-pen-console-v2.webp" alt="" width="1536" height="1024" fetchPriority="high" />
      </div>
      <svg className="tf-hud-circuit" viewBox="0 0 1200 800" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M30 140H255L310 195H415M80 555H250L320 485H435M785 185H880V95H1140M775 480H875L945 550H1170M105 330H220V365H390M815 340H1035V285H1170"/>
          <path opacity=".45" d="M40 153H230L288 211H355M843 198H893V110H1105M800 496H860L931 568H1120"/>
          <path d="M54 190L342 158M54 203L270 180M770 103L1140 82M765 584L1080 545M800 75V228M823 570V667" opacity=".8"/>
          <path d="M142 150H328M874 125H1090M744 609L953 583" strokeWidth="4" strokeDasharray="2 13"/>
        </g>
        <g fill="currentColor">{[[30,140],[255,140],[80,555],[1140,95],[1170,550],[105,330],[1170,285],[875,480]].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="3"/>)}</g>
        <g fill="currentColor" opacity=".5">{Array.from({length:14},(_,i)=><rect key={i} x={70+i*9} y={605-(i%4)*4} width="3" height={8+(i%4)*4}/>)}</g>
      </svg>
      <div className="tf-reference-core" aria-hidden="true">
        <svg viewBox="0 0 360 400" className="tf-reference-rings">
          <defs><radialGradient id="tf-ref-glow"><stop stopColor="#69e9ff" stopOpacity=".35"/><stop offset="1" stopColor="#2abbd7" stopOpacity="0"/></radialGradient></defs>
          <ellipse cx="180" cy="200" rx="175" ry="198" fill="url(#tf-ref-glow)"/>
          <g fill="none" stroke="currentColor">
            <ellipse cx="180" cy="200" rx="164" ry="190" opacity=".25"/>
            <ellipse cx="180" cy="200" rx="151" ry="175" opacity=".65"/>
            <ellipse cx="180" cy="200" rx="136" ry="158" strokeWidth="13" strokeDasharray="110 36 60 85 130 45" opacity=".8"/>
            <ellipse cx="180" cy="200" rx="122" ry="142" strokeWidth="4" strokeDasharray="200 38 100 70" opacity=".55"/>
            <ellipse cx="180" cy="200" rx="102" ry="118" strokeWidth="1.5" opacity=".75"/>
            <path d="M105 251C65 164 123 101 198 112M249 150C293 236 234 299 163 286" strokeWidth="3"/>
          </g>
          <path d="M186 103l17 10-19 5M176 280l-18 5 15 11" fill="currentColor"/>
        </svg>
        <Cog className="tf-reference-cog cog-main" strokeWidth={2.8}/>
        <Cog className="tf-reference-cog cog-small" strokeWidth={2.8}/>
        <span className="tf-reference-contact"/>
      </div>
      {ordered.map(({ id, label, icon: Icon }, index) => <div key={id} className={`tf-hud-tile${primaryModules.includes(id) ? ' is-primary' : ''}`} style={{
        '--tile-x': `${planes[index % planes.length][0]}%`,
        '--tile-y': `${planes[index % planes.length][1]}%`,
        '--tile-width': `${planes[index % planes.length][2]}%`,
        '--card-yaw': `${planes[index % planes.length][3]}deg`,
        '--card-roll': `${planes[index % planes.length][4]}deg`,
        '--mobile-y': `${mobilePlanes[index % mobilePlanes.length][1]}%`,
        '--mobile-x': `${mobilePlanes[index % mobilePlanes.length][0]}%`,
        '--float-delay': `${-index * .67}s`,
        '--float-duration': `${6 + (index % 4) * .7}s`,
      } as CSSProperties}>
        <button type="button" className={`tf-hud-card${opening === id ? ' is-opening' : ''}`} onClick={() => { if (!opening) setOpening(id); }} aria-busy={opening === id} aria-label={`Abrir ${label}`}>
          <span className="tf-hud-card-shine" aria-hidden="true"/>
          <span className="tf-hud-icon" aria-hidden="true"><Icon strokeWidth={2.2}/></span>
          <span className="tf-hud-label">{labels[id] || label}</span>
        </button>
      </div>)}
    </nav>
    <footer className="tf-hud-footer"><span>GESTÃO TF</span><i aria-hidden="true"/>SEU PRÓXIMO PASSO COMEÇA AQUI</footer>
  </section>;
}
