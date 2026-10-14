'use client';

import { useEffect, useId, useState } from 'react';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import './finance-network-home.css';

type Module = { id: string; label: string; icon: LucideIcon };
type Props = { name: string; modules: Module[]; go: (id: string) => void };
const moduleOrder = ['numeros','atendimento','clientes','producao','compromissos','bancos','calculadora','financeiro','notas','parceiros','relatorios','servicos','posvenda','usuarios'];
const labels: Record<string, string> = {
  numeros:'Painel de Gestão', atendimento:'Kanban', compromissos:'Agenda', bancos:'Bancos',
  calculadora:'Calculadora', financeiro:'Financeiro', usuarios:'Usuários e acessos',
};
const descriptions: Record<string, string> = {
  numeros:'Visão completa', atendimento:'Acompanhe negócios', clientes:'Relacionamento',
  producao:'Resultados em tempo real', compromissos:'Seus compromissos', bancos:'Convênios e soluções',
  calculadora:'Simule e compare', financeiro:'Comissões e cobranças', notas:'Emissão e controle',
  parceiros:'Juntos mais longe', relatorios:'Dados que geram ação', servicos:'Produtos e oportunidades',
  posvenda:'Atendimento contínuo', usuarios:'Gestão de equipe',
};

export default function ClassicHome({ name, modules, go }: Props) {
  const [opening, setOpening] = useState<string | null>(null);
  const iconGradient = useId().replace(/:/g, '');
  useEffect(() => {
    if (!opening) return;
    const timer = window.setTimeout(() => go(opening), 180);
    return () => window.clearTimeout(timer);
  }, [opening, go]);
  // Only arrange the modules already authorized for this user.
  const ordered = modules.filter(item => item.id !== 'inicio').sort((a,b) => {
    const rank = (id:string) => moduleOrder.includes(id) ? moduleOrder.indexOf(id) : moduleOrder.length;
    return rank(a.id) - rank(b.id);
  });
  return <section className="tf-network-home tf-executive-home" aria-label="Central de módulos Gestão TF">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="tf-executive-backdrop" src="/tf-executive-desk-v2.webp" alt="" width={1536} height={1024} fetchPriority="high"/>
    <div className="tf-executive-vignette" aria-hidden="true"/>
    <header className="tf-executive-hero">
      <div className="tf-executive-copy">
        <span className="tf-executive-welcome">BEM-VINDO, {name.trim().split(' ')[0].toUpperCase()}</span>
        <h1>Seu negócio.<br/><em>Tudo conectado.</em></h1>
        <p>Escolha um módulo e dê o próximo passo.</p>
        <div className="tf-executive-values"><span>Planejamento</span><span>Estratégia</span><span>Resultados</span></div>
      </div>
      <div className="tf-executive-brand">
        <div className="tf-executive-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tf-logo-exact.png" alt="TF Assessoria & Finanças" width={1238} height={594}/>
        </div>
        <span>MELHOR QUE BANCO</span>
      </div>
      <span className="tf-executive-motto">DISCIPLINA<br/>GERA LIBERDADE</span>
    </header>
    <svg width="0" height="0" className="tf-executive-defs" aria-hidden="true"><defs>
      <linearGradient id={iconGradient} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fffdf7"/><stop offset=".42" stopColor="#eee7d6"/><stop offset=".72" stopColor="#c9a66b"/><stop offset="1" stopColor="#f9f5ec"/></linearGradient>
    </defs></svg>
    <nav className="tf-executive-grid" aria-label="Todos os módulos">
      {ordered.map(({id,label,icon:Icon}) => <button key={id} type="button"
        className={`tf-network-node tf-executive-card${opening===id?' is-opening':''}`}
        onClick={()=>{if(!opening)setOpening(id);}} aria-busy={opening===id} aria-label={`Abrir ${labels[id]||label}`}>
        <span className="tf-executive-tile" aria-hidden="true"><Icon stroke={`url(#${iconGradient})`} strokeWidth={1.6}/><ArrowUpRight className="tf-executive-arrow"/></span>
        <span className="tf-executive-label">{labels[id]||label}</span>
        {descriptions[id] && <span className="tf-executive-description">{descriptions[id]}</span>}
      </button>)}
    </nav>
    <footer className="tf-executive-footer"><span>MAIS CLIENTES<br/>MAIS CONQUISTAS<br/>SEMPRE À FRENTE</span><span>RESULTADOS<br/>QUE MOVEM</span></footer>
  </section>;
}
