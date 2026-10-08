'use client';

import { useState, type CSSProperties } from 'react';
import { ArrowUpRight, ArrowRight, Pause, Play, Sparkles, type LucideIcon } from 'lucide-react';

type Module = { id: string; label: string; icon: LucideIcon };
type Props = { name: string; modules: Module[]; go: (id: string) => void };
const orbitIds = ['producao', 'clientes', 'atendimento', 'parceiros', 'financeiro', 'relatorios'];

export default function ClassicHome({ name, modules, go }: Props) {
  const [paused, setPaused] = useState(false);
  const orbit = orbitIds.flatMap(id => modules.filter(item => item.id === id));
  const shortcuts = modules.filter(item => !orbitIds.includes(item.id) && item.id !== 'inicio');
  const can = (id: string) => modules.some(item => item.id === id);
  return <div className="tf-classic-home">
    <div className="tf-classic-greeting"><span><span className="tf-classic-status" /> SEU ESPAÇO DE NEGÓCIOS</span><p>Bem-vindo, <b>{name.split(' ')[0]}</b>.</p></div>
    <section className="tf-classic-hero" aria-label="Central de negócios Gestão TF">
      <div className="tf-classic-copy">
        <span className="tf-classic-eyebrow"><Sparkles size={14} /> GESTÃO TF · MELHOR QUE BANCO</span>
        <h1>Conexões que viram<br /><em>grandes negócios.</em></h1>
        <p>Seu atendimento, sua produção e seus parceiros.<br />Tudo conectado para você ir além.</p>
        <div className="tf-classic-actions">
          {can('atendimento') && <button type="button" className="tf-classic-cta" onClick={() => go('atendimento')}>Abrir atendimento <ArrowUpRight size={18} /></button>}
          {can('producao') && <button type="button" className="tf-classic-link" onClick={() => go('producao')}>Ver produção <ArrowRight size={17} /></button>}
        </div>
        <span className="tf-classic-signature">Pessoas no centro. Resultados em movimento.</span>
      </div>
      <div className={`tf-classic-universe${paused ? ' is-paused' : ''}`}>
        <div className="tf-classic-orbit" role="group" aria-label="Acessos aos módulos">
          <div className="tf-orbit-ring" aria-hidden="true" /><div className="tf-orbit-ring outer" aria-hidden="true" />
          <div className="tf-orbit-center"><img src="/tf-emblem.png" alt="" /><strong>Gestão TF</strong></div>
          {orbit.map(({ id, label, icon: Icon }, index) => <div className="tf-orbit-slot" key={id} style={{ '--angle': `${index * 360 / orbit.length - 90}deg` } as CSSProperties}>
            <button type="button" className={`tf-orbit-module module-${id}`} onClick={() => go(id)} aria-label={`Abrir ${label}`}><i><Icon size={21} strokeWidth={1.7} /></i><span>{id === 'financeiro' ? 'Financeiro' : label}</span><ArrowUpRight className="tf-orbit-arrow" size={12} /></button>
          </div>)}
        </div>
        <button type="button" className="tf-orbit-control" onClick={() => setPaused(value => !value)} aria-pressed={paused} aria-label={paused ? 'Retomar animação dos módulos' : 'Pausar animação dos módulos'}>{paused ? <Play size={12} /> : <Pause size={12} />}<span>{paused ? 'Retomar movimento' : 'Pausar movimento'}</span></button>
      </div>
    </section>
    {shortcuts.length > 0 && <nav className="tf-classic-shortcuts" aria-label="Mais ferramentas"><span>EXPLORE<br /><b>Seu escritório</b></span><div>{shortcuts.map(({id,label,icon:Icon}) => <button key={id} type="button" onClick={() => go(id)}><Icon size={20} strokeWidth={1.6} /><span>{label}</span></button>)}</div></nav>}
    <div className="tf-classic-section-heading"><div><span>ACOMPANHAMENTO</span><h2>Seu negócio em números</h2></div><span>Visão geral dos resultados</span></div>
  </div>;
}
