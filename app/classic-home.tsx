'use client';

import { useState, type CSSProperties } from 'react';
import { ArrowUpRight, Pause, Play, type LucideIcon } from 'lucide-react';
import './hologram-home.css';

type Module = { id: string; label: string; icon: LucideIcon };
type Props = { name: string; modules: Module[]; go: (id: string) => void };
const labels: Record<string, string> = {
  numeros: 'Painel de Gestão', atendimento: 'Kanban', compromissos: 'Agenda',
  bancos: 'Bancos', calculadora: 'Calculadora', financeiro: 'Financeiro',
  usuarios: 'Usuários e acessos',
};
// Fixed, well-separated anchors keep moving controls easy to find and select.
const positions: Record<string, [number, number, number]> = {
  compromissos: [11, 16, -4], posvenda: [31, 12, 3], clientes: [51, 17, -3],
  usuarios: [71, 12, 4], bancos: [90, 17, -4],
  financeiro: [10, 49, 3], numeros: [30, 48, -3],
  atendimento: [71, 47, 3], calculadora: [91, 49, -3],
  notas: [10, 82, -3], parceiros: [30, 85, 3], relatorios: [51, 81, -3],
  producao: [71, 83, -4], servicos: [91, 82, 3],
};

export default function ClassicHome({ name, modules, go }: Props) {
  const [paused, setPaused] = useState(false);
  const items = modules.filter(item => item.id !== 'inicio');
  const compact = items.length < 10 || items.some(item => !positions[item.id]);

  return <section className={`tf-hologram-home${paused ? ' is-paused' : ''}${compact ? ' is-compact' : ''}`} aria-label="Central de módulos Gestão TF">
    <header className="tf-holo-heading">
      <span>OLÁ, {name.trim().split(' ')[0].toUpperCase()}</span>
      <h1>Seu universo de negócios.</h1>
      <p>Escolha um módulo e siga em frente.</p>
    </header>
    <nav className="tf-holo-space" aria-label="Todos os módulos">
      <div className="tf-holo-atmosphere" aria-hidden="true"><i/><i/><i/></div>
      <div className="tf-holo-core">
        <img src="/tf-logo-exact.png" alt="TF Assessoria & Finanças" width={1238} height={594}/>
        <span>CENTRAL DE MÓDULOS</span>
      </div>
      {items.map(({ id, label, icon: Icon }, index) => {
        const [x, y, tilt] = positions[id] || [50, 50, 0];
        const featured = id === 'numeros';
        return <div key={id} className={`tf-holo-anchor${featured ? ' is-featured' : ''}`} style={{
          '--x': `${x}%`, '--y': `${y}%`, '--tilt': `${tilt}deg`,
          '--float-delay': `${-index * .73}s`, '--float-duration': `${6 + index % 4}s`,
        } as CSSProperties}>
          <div className="tf-holo-float">
            <button type="button" className="tf-holo-card" onClick={() => go(id)} aria-label={`Abrir ${label}`}>
              <span className="tf-holo-glint" aria-hidden="true"/>
              <ArrowUpRight className="tf-holo-arrow" size={14} aria-hidden="true"/>
              <Icon className="tf-holo-icon" strokeWidth={1.35} aria-hidden="true"/>
              <span className="tf-holo-label">{labels[id] || label}</span>
              {featured && <span className="tf-holo-action">Acessar painel <ArrowUpRight size={12} aria-hidden="true"/></span>}
            </button>
          </div>
        </div>;
      })}
    </nav>
    <footer className="tf-holo-footer">
      <span>GESTÃO TF <i aria-hidden="true"/> CONECTANDO SEUS NEGÓCIOS</span>
      <button type="button" onClick={() => setPaused(value => !value)} aria-pressed={paused} aria-label={paused ? 'Retomar movimento dos ícones' : 'Pausar movimento dos ícones'}>
        {paused ? <Play size={13} aria-hidden="true"/> : <Pause size={13} aria-hidden="true"/>}
        {paused ? 'Retomar movimento' : 'Pausar movimento'}
      </button>
    </footer>
  </section>;
}
