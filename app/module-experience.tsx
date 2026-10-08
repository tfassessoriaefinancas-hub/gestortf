'use client';

import { useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUpRight, UsersRound, Columns3, FileChartColumn, ChartNoAxesCombined, CalendarDays, Landmark, Calculator, WalletCards, ReceiptText, Handshake, ChartSpline, BriefcaseBusiness, MessageCircle, UserRoundCog, type LucideIcon } from 'lucide-react';

type Destination = { label: string; icon: LucideIcon; color: string };
const destinations: Record<string, Destination> = {
  numeros:{label:'Painel de Gestão',icon:ChartNoAxesCombined,color:'#a48248'},
  atendimento:{label:'Atendimento',icon:Columns3,color:'#4778a9'},
  clientes:{label:'Clientes',icon:UsersRound,color:'#7966ad'},
  producao:{label:'Produção',icon:FileChartColumn,color:'#338672'},
  compromissos:{label:'Agenda',icon:CalendarDays,color:'#a16d51'},
  bancos:{label:'Bancos',icon:Landmark,color:'#507795'},
  calculadora:{label:'Calculadora',icon:Calculator,color:'#7465a0'},
  financeiro:{label:'Financeiro',icon:WalletCards,color:'#398168'},
  comissoes:{label:'Comissões',icon:WalletCards,color:'#398168'},
  notas:{label:'Notas fiscais',icon:ReceiptText,color:'#ad627b'},
  parceiros:{label:'Parceiros',icon:Handshake,color:'#43858a'},
  relatorios:{label:'Relatórios',icon:ChartSpline,color:'#646faa'},
  servicos:{label:'Serviços',icon:BriefcaseBusiness,color:'#a6824b'},
  posvenda:{label:'Pós-venda',icon:MessageCircle,color:'#568679'},
  usuarios:{label:'Usuários e acessos',icon:UserRoundCog,color:'#8c6783'},
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
  const info=destinations[view];
  if(!info)return null;
  const [headline,highlight,description]=copy[view];
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
  const sceneLinks=(active?.links||[]).filter(id=>id!==view).slice(0,2);
  return <section className="tf-module-experience" aria-label={`Apresentação de ${info.label}`} style={{'--module-accent':info.color} as CSSProperties}>
    <header className="tf-experience-welcome"><div><span>SEU ESPAÇO DE TRABALHO</span><p>Bem-vindo, <strong>{name.split(' ')[0]}.</strong></p></div><span className="tf-experience-location"><info.icon size={16}/>{info.label}</span></header>
    <div className="tf-experience-composition">
      <div className="tf-experience-copy"><span className="tf-experience-eyebrow">GESTÃO TF · MELHOR QUE BANCO</span><h2>{headline}<br/><em>{highlight}</em></h2><p>{description}</p><button type="button" className="tf-experience-detail" onClick={details}>Explorar {info.label}<ArrowDown size={16}/></button></div>
      <div className="tf-experience-scene">
        <div className="tf-experience-halo" aria-hidden="true"/>
        <img src="/tf-client-consultant.webp" alt="" width={667} height={1000}/>
        {sceneLinks.map((id,index)=>{const item=destinations[id],Icon=item.icon;return <button type="button" key={id} className={`tf-experience-float float-${index}`} onClick={()=>navigate(id)}><Icon size={18} style={{color:item.color}}/><span>{item.label}</span><ArrowUpRight size={12}/></button>})}
      </div>
      <nav className="tf-experience-topics" aria-label="Assuntos do módulo"><small>O QUE VOCÊ QUER ACOMPANHAR?</small>{available.map((group,index)=><button key={group.id} type="button" aria-expanded={active?.id===group.id} aria-controls="tf-experience-shortcuts" onClick={()=>setSelected(group.id)} className={active?.id===group.id?'is-active':''}><span className="tf-topic-number">0{index+1}</span><span><b>{group.label}</b><small>{group.description}</small></span><ArrowUpRight size={17}/></button>)}</nav>
    </div>
    <div id="tf-experience-shortcuts" className="tf-experience-shortcuts" aria-label={`Atalhos de ${active?.label||info.label}`}>
      {(active?.links||[]).map(id=>{const item=destinations[id],Icon=item.icon;return <button type="button" key={id} onClick={()=>navigate(id)} style={{'--shortcut-color':item.color} as CSSProperties}><Icon size={22}/><span>{item.label}</span><ArrowUpRight size={14}/></button>})}
    </div>
    {stats.length>0&&<div className="tf-experience-stats">{stats.map(({id,label,value,icon:Icon})=><button key={id} type="button" onClick={()=>navigate(id)}><Icon size={19}/><span><small>{label}</small><strong>{value.toLocaleString('pt-BR')}</strong></span><ArrowUpRight size={14}/></button>)}</div>}
  </section>;
}
