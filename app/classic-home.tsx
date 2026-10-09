'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Sparkles, type LucideIcon } from 'lucide-react';
import { moduleAccentColors } from './module-appearance';
import './hologram-home.css';
import './home-depth.css';

type Module = { id: string; label: string; icon: LucideIcon };
type Props = { name: string; modules: Module[]; go: (id: string) => void };
const labels: Record<string, string> = {
  numeros: 'Painel de Gestão', atendimento: 'Kanban', compromissos: 'Agenda',
  bancos: 'Bancos', calculadora: 'Calculadora', financeiro: 'Financeiro',
  usuarios: 'Usuários e acessos',
};
const primaryModules = ['numeros', 'atendimento', 'clientes', 'producao'];

// Deliberate near/far planes, with clear hit targets and no overlapping labels.
const placements = [
  [11,29,15,-17,4,1.08,5], [29,8,12,16,-5,.94,2],
  [22,62,16,-13,-4,1.12,6], [76,28,15,17,-4,1.06,5],
  [88,7,11,20,-3,.88,1], [68,5,11,-13,3,.9,2],
  [88,55,12,16,-3,.92,2], [67,65,13,-16,4,1,4],
  [8,4,10,-19,3,.85,1], [8,70,11,-14,2,.9,2],
  [37,80,12,12,-3,.94,3], [87,81,11,18,-4,.9,2],
  [28,38,11,-14,-3,.9,2], [72,84,10,14,3,.88,1],
  [53,83,11,-10,2,.92,2], [90,31,10,18,2,.85,1],
];
function gearPath(cx:number,cy:number,r:number,teeth:number) {
  const points=Array.from({length:teeth*4},(_,i)=>{
    const a=(i/(teeth*4))*Math.PI*2, radius=r*([.79,1,1,.79][i%4]);
    return `${cx+Math.cos(a)*radius},${cy+Math.sin(a)*radius}`;
  });
  const hole=r*.48;
  return `M${points.join('L')}Z M${cx-hole},${cy}a${hole},${hole} 0 1,0 ${hole*2},0a${hole},${hole} 0 1,0 ${-hole*2},0Z`;
}

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

  return <section className="tf-hud-home is-spatial" aria-label="Central de módulos Gestão TF">
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
          <path d="M54 190L342 158M54 203L270 180M770 103L1140 82M765 584L1080 545M800 75V228M823 570V667" opacity=".8"/>
          <path d="M142 150H328M874 125H1090M744 609L953 583" strokeWidth="4" strokeDasharray="2 13"/>
        </g>
        <g fill="currentColor">{[[30,140],[255,140],[80,555],[1140,95],[1170,550],[105,330],[1170,285],[875,480]].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="3"/>)}</g>
        <g fill="currentColor" opacity=".5">{Array.from({length:14},(_,i)=><rect key={i} x={70+i*9} y={605-(i%4)*4} width="3" height={8+(i%4)*4}/>)}</g>
      </svg>
      <div className="tf-hud-center">
        <svg className="tf-spatial-core" viewBox="0 0 400 440" aria-hidden="true">
          <defs><radialGradient id="tf-core-aura"><stop stopColor="#67e4ef" stopOpacity=".3"/><stop offset="1" stopColor="#69cdda" stopOpacity="0"/></radialGradient></defs>
          <ellipse cx="200" cy="220" rx="190" ry="212" fill="url(#tf-core-aura)"/>
          <g fill="none" stroke="currentColor">
            <ellipse cx="200" cy="220" rx="171" ry="199" opacity=".26"/>
            <ellipse cx="200" cy="220" rx="162" ry="188" strokeWidth="2" opacity=".5"/>
            <ellipse cx="200" cy="220" rx="149" ry="174" strokeWidth="12" strokeDasharray="106 32 55 100 175 24" opacity=".8"/>
            <ellipse cx="200" cy="220" rx="137" ry="160" strokeWidth="3" strokeDasharray="170 88 72 80" opacity=".55"/>
            <path d="M111 294C62 206 117 115 204 109C236 107 262 120 283 145M286 162C337 259 274 331 201 334C170 335 143 324 122 305" strokeWidth="3"/>
          </g>
          <g fill="currentColor"><path d="M269 145l19 9-1-23Z M137 305l-22-9 4 24Z"/>
            <path d={gearPath(170,229,63,12)} fillRule="evenodd"/>
            <path d={gearPath(254,181,36,10)} fillRule="evenodd"/>
            <path d={gearPath(258,266,28,9)} fillRule="evenodd"/>
          </g>
        </svg>
        <span>CENTRAL DE MÓDULOS</span>
        <small>Conectando seus negócios</small>
      </div>
      {ordered.map(({ id, label, icon: Icon }, index) => <div key={id} className={`tf-hud-tile${index < 4 ? ' is-primary' : ''}`} style={{
        '--tile-x': `${placements[index % placements.length][0]}%`,
        '--tile-width': `${placements[index % placements.length][2]}%`,
        '--card-yaw': `${placements[index % placements.length][3]}deg`,
        '--card-roll': `${placements[index % placements.length][4]}deg`,
        '--card-scale': placements[index % placements.length][5],
        '--card-depth': placements[index % placements.length][6],
        '--tile-y': `${placements[index % placements.length][1]}%`,
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
