'use client';

import { useState, type CSSProperties } from 'react';
import { moduleAccentColors } from './module-appearance';
import { ArrowDown, ArrowUpRight, Pause, Play, UsersRound, Columns3, FileChartColumn, ChartNoAxesCombined, CalendarDays, Landmark, Calculator, WalletCards, ReceiptText, Handshake, ChartSpline, BriefcaseBusiness, MessageCircle, UserRoundCog, type LucideIcon } from 'lucide-react';
import './module-orbits.css';
import './module-motion.css';

type Destination = { label: string; icon: LucideIcon; color: string };
const destinations: Record<string, Destination> = {
  numeros:{label:'Painel de Gestão',icon:ChartNoAxesCombined,color:moduleAccentColors.numeros},
  atendimento:{label:'Atendimento',icon:Columns3,color:moduleAccentColors.atendimento},
  clientes:{label:'Clientes',icon:UsersRound,color:moduleAccentColors.clientes},
  producao:{label:'Produção',icon:FileChartColumn,color:moduleAccentColors.producao},
  compromissos:{label:'Agenda',icon:CalendarDays,color:moduleAccentColors.compromissos},
  bancos:{label:'Bancos',icon:Landmark,color:moduleAccentColors.bancos},
  calculadora:{label:'Calculadora',icon:Calculator,color:moduleAccentColors.calculadora},
  financeiro:{label:'Financeiro',icon:WalletCards,color:moduleAccentColors.financeiro},
  comissoes:{label:'Comissões',icon:WalletCards,color:moduleAccentColors.comissoes},
  notas:{label:'Notas fiscais',icon:ReceiptText,color:moduleAccentColors.notas},
  parceiros:{label:'Parceiros',icon:Handshake,color:moduleAccentColors.parceiros},
  relatorios:{label:'Relatórios',icon:ChartSpline,color:moduleAccentColors.relatorios},
  servicos:{label:'Serviços',icon:BriefcaseBusiness,color:moduleAccentColors.servicos},
  posvenda:{label:'Pós-venda',icon:MessageCircle,color:moduleAccentColors.posvenda},
  usuarios:{label:'Usuários e acessos',icon:UserRoundCog,color:moduleAccentColors.usuarios},
};
const copy: Record<string,[string,string,string]> = {
  numeros:['Uma visão clara.','Mais espaço para crescer.','Conecte produção, clientes e resultados para acompanhar o que move o seu negócio.'],
  atendimento:['Boas conversas.','Novas oportunidades.','Organize cada etapa e dê o próximo passo no atendimento de seus clientes.'],
  clientes:['Pessoas no centro.','Relacionamentos que crescem.','Consulte cadastros, retome conversas e acompanhe o histórico de cada cliente.'],
  producao:['Cada operação conta.','Veja seu negócio avançar.','Explore sua produção e acompanhe os resultados de cada período.'],
  financeiro:['Clareza nos valores.','Controle nas decisões.','Acompanhe comissões, recebimentos e a evolução dos seus resultados.'],
  comissoes:['Seu trabalho gera valor.','Acompanhe cada recebimento.','Consulte comissões registradas, valores recebidos e pendências.'],
  notas:['Documentos em ordem.','Rotina mais simples.','Organize notas fiscais e encontre os arquivos vinculados aos seus clientes.'],
  parceiros:['Conexões de confiança.','Crescimento em conjunto.','Acompanhe sua rede comercial e os resultados de cada parceria.'],
  compromissos:['Seu dia organizado.','Cada contato no tempo certo.','Reúna compromissos e lembretes para conduzir a rotina do escritório.'],
  bancos:['Mais possibilidades.','O acesso certo, mais perto.','Encontre instituições, plataformas e ferramentas para sua próxima operação.'],
  calculadora:['Números com clareza.','Cenários para decidir.','Simule contratos e consulte as condições antes do próximo passo.'],
  relatorios:['Dados que explicam.','Resultados que orientam.','Escolha o período, organize as informações e prepare sua análise.'],
  servicos:['Soluções para cada momento.','Oportunidades para conectar.','Explore seu portfólio e acompanhe a produção de cada serviço.'],
  posvenda:['O cuidado continua.','Depois de cada conquista.','Mantenha o relacionamento ativo e acompanhe os próximos contatos.'],
  usuarios:['Sua equipe conectada.','Cada acesso organizado.','Gerencie usuários, parceiros e as áreas autorizadas para cada pessoa.'],
};
type ModuleVisual = { layout:'original'|'portrait-left'|'portrait-right'|'portrait-center'; scene:string; caption:string; links:string[] };
const visuals:Record<string,ModuleVisual> = {
  numeros:{layout:'original',scene:'original',caption:'',links:[]},
  atendimento:{layout:'portrait-left',scene:'conversation',caption:'Conexões começam com uma boa conversa.',links:['clientes','compromissos']},
  clientes:{layout:'portrait-right',scene:'arch',caption:'Cada pessoa tem uma história.',links:['atendimento','posvenda']},
  producao:{layout:'portrait-center',scene:'steps',caption:'Do primeiro contato à conquista.',links:['relatorios','financeiro']},
  financeiro:{layout:'portrait-left',scene:'balance',caption:'Organização para planejar o próximo passo.',links:['notas','relatorios']},
  comissoes:{layout:'portrait-left',scene:'balance',caption:'Seu trabalho, seus resultados.',links:['financeiro','producao']},
  notas:{layout:'portrait-right',scene:'paper',caption:'Tudo em ordem. Tudo por perto.',links:['clientes','financeiro']},
  parceiros:{layout:'portrait-center',scene:'connections',caption:'Boas parcerias abrem caminhos.',links:['producao','clientes']},
  compromissos:{layout:'portrait-left',scene:'calendar',caption:'Um dia bem planejado faz a diferença.',links:['atendimento','posvenda']},
  bancos:{layout:'portrait-right',scene:'pillars',caption:'Conecte oportunidades e soluções.',links:['calculadora','servicos']},
  calculadora:{layout:'portrait-center',scene:'precision',caption:'Explore possibilidades com clareza.',links:['bancos','producao']},
  relatorios:{layout:'portrait-left',scene:'insights',caption:'Encontre a história por trás dos números.',links:['producao','financeiro']},
  servicos:{layout:'portrait-right',scene:'possibilities',caption:'Uma solução para cada momento.',links:['bancos','parceiros']},
  posvenda:{layout:'portrait-center',scene:'care',caption:'O relacionamento continua.',links:['clientes','compromissos']},
  usuarios:{layout:'portrait-left',scene:'network',caption:'Pessoas conectadas. Acessos organizados.',links:['parceiros','compromissos']},
};
const groups = [
  { id:'resultados',label:'Resultados',description:'Produção e visão financeira',links:['numeros','producao','financeiro','relatorios'] },
  { id:'relacionamento',label:'Relacionamento',description:'Clientes e oportunidades',links:['atendimento','clientes','parceiros','posvenda'] },
  { id:'rotina',label:'Rotina e documentos',description:'Ferramentas do escritório',links:['compromissos','notas','bancos','calculadora','servicos','usuarios'] },
];
function initialGroup(view:string) { return groups.find(group=>group.links.includes(view))?.id || 'resultados'; }

type Props = {
  view:string; name:string; can:(view:string)=>boolean; go:(view:string)=>void;
  clientCount:number; operationCount:number; activeCount:number;
};
export default function ModuleExperience({view,name,can,go,clientCount,operationCount,activeCount}:Props) {
  const [selected,setSelected]=useState(initialGroup(view));
  const [motionPaused,setMotionPaused]=useState(false);
  const info=destinations[view];
  if(!info)return null;
  const [headline,highlight,description]=copy[view];
  const visual=visuals[view];
  const portrait=view==='numeros'?'/tf-client-consultant.webp':`/module-portraits/${view==='comissoes'?'financeiro':view}.webp`;
  const available=groups.map(group=>({...group,links:group.links.filter(id=>can(id))})).filter(group=>group.links.length);
  const active=available.find(group=>group.id===selected)||available[0];
  const details=()=>{
    const section=document.getElementById('tf-module-workspace');
    section?.focus({preventScroll:true});
    section?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  };
  const navigate=(id:string)=>id===view?details():go(id);
  const stats=[
    ...(can('clientes')?[{id:'clientes',label:'Clientes na base',value:clientCount,icon:UsersRound}]:[]),
    ...(can('producao')?[{id:'producao',label:'Operações registradas',value:operationCount,icon:FileChartColumn}]:[]),
    ...(can('atendimento')?[{id:'atendimento',label:'Em atendimento',value:activeCount,icon:Columns3}]:[]),
  ];
  const sceneLinks=(view==='numeros'?(active?.links||[]):visual.links).filter(id=>id!==view&&can(id)).slice(0,2);
  return <section className={`tf-module-experience has-scene-motion module-${view} layout-${visual.layout} scene-${visual.scene}${motionPaused?' is-motion-paused':''}`} aria-label={`Apresentação de ${info.label}`} style={{'--module-accent':info.color} as CSSProperties}>
    <header className="tf-experience-welcome"><div><span>SEU ESPAÇO DE TRABALHO</span><p>Bem-vindo, <strong>{name.split(' ')[0]}.</strong></p></div><span className="tf-experience-location"><info.icon size={16}/>{info.label}</span></header>
    <div className="tf-experience-composition">
      <div className="tf-experience-copy"><span className="tf-experience-eyebrow">GESTÃO TF · MELHOR QUE BANCO</span><h2>{headline}<br/><em>{highlight}</em></h2><p>{description}</p><button type="button" className="tf-experience-detail" onClick={details}>Explorar {info.label}<ArrowDown size={16}/></button></div>
      <div className="tf-experience-scene">
        <div className="tf-experience-halo" aria-hidden="true"/>
        {view!=='numeros'&&<div className="tf-module-scenery" aria-hidden="true"><i/><i/><i/></div>}
        <img src={portrait} alt="" width={667} height={1000} decoding="async"/>
        {visual.caption&&<span className="tf-module-scene-caption">{visual.caption}</span>}
        {sceneLinks.length>0&&<nav className="tf-module-orbits" aria-label={`Atalhos flutuantes de ${info.label}`}>
          {sceneLinks.map((id,index)=>{const item=destinations[id],Icon=item.icon;return <div key={id} className={`tf-module-orbit orbit-${index}`} style={{'--orbit-tone':item.color,'--orbit-start':index?'62%':'16%'} as CSSProperties}>
            <div className="tf-module-orbit-track" aria-hidden="true"/>
            <div className="tf-module-orbit-anchor">
              <button type="button" className="tf-module-orbit-card" onClick={()=>navigate(id)} aria-label={`Abrir ${item.label}`} title={item.label}>
                <Icon size={25} strokeWidth={1.6} aria-hidden="true"/><span>{item.label}</span><ArrowUpRight size={10} aria-hidden="true"/>
              </button>
            </div>
          </div>})}
        </nav>}
        {sceneLinks.length>0&&<button type="button" className="tf-module-motion-toggle" onClick={()=>setMotionPaused(value=>!value)} aria-pressed={motionPaused} aria-label={motionPaused?'Retomar movimento dos atalhos':'Pausar movimento dos atalhos'} title={motionPaused?'Retomar movimento':'Pausar movimento'}>{motionPaused?<Play size={13} aria-hidden="true"/>:<Pause size={13} aria-hidden="true"/>}</button>}
      </div>
      <nav className="tf-experience-topics" aria-label="Assuntos do módulo"><small>O QUE VOCÊ QUER ACOMPANHAR?</small>{available.map((group,index)=><button key={group.id} type="button" aria-expanded={active?.id===group.id} aria-controls="tf-experience-shortcuts" onClick={()=>setSelected(group.id)} className={active?.id===group.id?'is-active':''}><span className="tf-topic-number">0{index+1}</span><span><b>{group.label}</b><small>{group.description}</small></span><ArrowUpRight size={17}/></button>)}</nav>
    </div>
    <div key={active?.id} id="tf-experience-shortcuts" className="tf-experience-shortcuts" aria-label={`Atalhos de ${active?.label||info.label}`}>
      {(active?.links||[]).map((id,index)=>{const item=destinations[id],Icon=item.icon;return <button type="button" key={id} className={id===view?'is-current':undefined} aria-current={id===view?'page':undefined} onClick={()=>navigate(id)} style={{'--shortcut-color':item.color,'--motion-order':index} as CSSProperties}><Icon size={22}/><span>{item.label}</span><ArrowUpRight size={14}/></button>})}
    </div>
    {stats.length>0&&<div className="tf-experience-stats">{stats.map(({id,label,value,icon:Icon})=><button key={id} type="button" onClick={()=>navigate(id)}><Icon size={19}/><span><small>{label}</small><strong>{value.toLocaleString('pt-BR')}</strong></span><ArrowUpRight size={14}/></button>)}</div>}
  </section>;
}
