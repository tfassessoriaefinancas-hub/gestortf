'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Sparkles, Settings2, Cog, type LucideIcon } from 'lucide-react';
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

// Fixed perspective planes echo the reference while keeping every menu clickable.
const planes = [
 [8,30,14,-14,3], [25,15,14,12,-3], [24,51,15,-10,-3],
 [70,17,13,13,-3], [89,12,12,15,-3], [82,38,14,12,-2],
 [68,58,13,-12,3], [8,7,11,-12,2], [8,60,12,-9,2],
 [91,64,11,12,-2], [44,79,12,-8,2], [61,82,12,8,-2],
 [26,82,12,-10,2], [81,85,12,12,-2], [47,2,11,-8,2],
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
    <nav className="tf-hud-console" aria-label="Todos os módulos" style={{"--mobile-rows":Math.ceil(Math.max(0,ordered.length - 4) / 3)} as CSSProperties}>
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
        <Settings2 className="tf-reference-cog cog-control" strokeWidth={2}/>
      </div>
      {ordered.map(({ id, label, icon: Icon }, index) => <div key={id} className={`tf-hud-tile${primaryModules.includes(id) ? ' is-primary' : ''}`} style={{
        '--tile-x': `${planes[index % planes.length][0]}%`,
        '--tile-y': `${planes[index % planes.length][1]}%`,
        '--tile-width': `${planes[index % planes.length][2]}%`,
        '--card-yaw': `${planes[index % planes.length][3]}deg`,
        '--card-roll': `${planes[index % planes.length][4]}deg`,
        '--mobile-y': `${index < 4 ? [35,180,35,180][index] : 340 + Math.floor((index - 4) / 3) * 138}px`,
        '--mobile-x': `${index < 4 ? [16,16,84,84][index] : [17,50,83][(index - 4) % 3]}%`,
        '--float-delay': `${-index * .67}s`,
        '--float-duration': `${6 + (index % 4) * .7}s`,
      } as CSSProperties}>
        <button type="button" className={`tf-hud-card${opening === id ? ' is-opening' : ''}`} onClick={() => { if (!opening) setOpening(id); }} aria-busy={opening === id} aria-label={`Abrir ${label}`}>
          <span className="tf-hud-card-shine" aria-hidden="true"/>
          <span className="tf-hud-icon" aria-hidden="true"><Icon strokeWidth={1.8}/></span>
          <span className="tf-hud-label">{labels[id] || label}</span>
        </button>
      </div>)}
    </nav>
    <footer className="tf-hud-footer"><span>GESTÃO TF</span><i aria-hidden="true"/>SEU PRÓXIMO PASSO COMEÇA AQUI</footer>
  </section>;
}
