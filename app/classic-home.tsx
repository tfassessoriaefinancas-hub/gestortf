'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Sparkles, type LucideIcon } from 'lucide-react';
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

const descriptions: Record<string,string> = {
  numeros:'Resultados e indicadores', atendimento:'Negócios em movimento', clientes:'Relacionamentos que crescem',
  producao:'Sua operação em foco', compromissos:'Organize seu dia', bancos:'Instituições parceiras',
  calculadora:'Simule novas possibilidades', financeiro:'Controle e clareza', comissoes:'Acompanhe seus ganhos',
  notas:'Documentos e faturamento', parceiros:'Conexões de confiança', relatorios:'Dados para decidir',
  servicos:'Soluções para seus clientes', posvenda:'Continue o relacionamento', usuarios:'Equipe e permissões',
};

export default function ClassicHome({ name, modules, go }: Props) {
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    if (!opening) return;
    const timer = window.setTimeout(() => go(opening), 180);
    return () => window.clearTimeout(timer);
  }, [opening, go]);
  const items = modules.filter(item => item.id !== 'inicio');
  const ordered = [...items.filter(item => primaryModules.includes(item.id)), ...items.filter(item => !primaryModules.includes(item.id))];

  return <section className="tf-hud-home is-spatial" aria-label="Central de módulos Gestão TF">
    <header className="tf-hud-heading">
      <span><Sparkles size={13} aria-hidden="true"/> OLÁ, {name.trim().split(' ')[0].toUpperCase()}</span>
      <h1>Seu universo de negócios.</h1>
      <p>Tudo conectado. Cada detalhe sob seu controle.</p>
    </header>
    <nav className="tf-hud-console" aria-label="Todos os módulos">
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
      {ordered.map(({ id, label, icon: Icon }, index) => <div key={id} className={`tf-hud-tile${primaryModules.includes(id) ? ' is-primary' : ''}`} style={{
        '--card-yaw': `${[-7, 5, -4, 7][index % 4]}deg`,
        '--card-roll': `${[-1.5, 1, -1, 1.5][index % 4]}deg`,
        '--tile-offset': `${[0, 14, -4, 10][index % 4]}px`,
        '--tone': primaryModules.includes(id) ? '#e8d6b2' : '#d0e6ef',
        '--float-delay': `${-index * .67}s`,
        '--float-duration': `${6 + (index % 4) * .7}s`,
      } as CSSProperties}>
        <button type="button" className={`tf-hud-card${opening === id ? ' is-opening' : ''}`} onClick={() => { if (!opening) setOpening(id); }} aria-busy={opening === id} aria-label={`Abrir ${label}`}>
          <span className="tf-hud-card-shine" aria-hidden="true"/>
          <span className="tf-hud-icon" aria-hidden="true"><Icon className="tf-hud-icon-depth" strokeWidth={2.3}/><Icon className="tf-hud-icon-face" strokeWidth={1.6}/></span>
          <span className="tf-hud-copy"><span className="tf-hud-label">{labels[id] || label}</span><span className="tf-hud-description">{descriptions[id]}</span></span>
          <ArrowUpRight className="tf-hud-arrow" size={14} aria-hidden="true"/>
        </button>
      </div>)}
    </nav>
    <footer className="tf-hud-footer"><span>GESTÃO TF</span><i aria-hidden="true"/>SEU PRÓXIMO PASSO COMEÇA AQUI</footer>
  </section>;
}
