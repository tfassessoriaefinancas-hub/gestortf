'use client';
import { formatMoney as brl } from '../../lib/money';
import { CRM_CHANGED, CRM_STORAGE_KEY } from '../../lib/crm-events';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

type Operation={id:number;clientName:string;cpf:string;bank:string;product:string;date:string;value:number;gross:number;ilaRate:number;ilaValue:number;afterIla:number;invoiceRate:number;invoiceFee:number;net:number;thiagoShare:number;partnerShare:number};
type PortalData={partner:{id:number;name:string};periods:string[];operations:Operation[]};
type Point={x:number;y:number};


const monthName=(period:string)=>{const label=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${period}-01T00:00:00Z`));return label.charAt(0).toUpperCase()+label.slice(1)};
const previousPeriod=(period:string)=>{const [year,month]=period.split('-').map(Number),date=new Date(Date.UTC(year,month-2,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`};
const formatCpf=(value:string)=>value.replace(/\D/g,'').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');

function PartnershipBrand({compact=false}:{compact?:boolean}){
  return <div className={`tf-germano-brand${compact?' compact':''}`}>
    <img className="tf-germano-tf-logo" src="/tf-logo-no-bg.png" alt="TF Assessoria e Finanças"/>
    <img className="tf-germano-gg-brand" src="/gg-veiculos-logo.png" alt="GG Veículos"/>
  </div>;
}

function ChartPoint({point,value,label,tone}:{point:Point;value:number;label:string;tone:'current'|'previous'}){
  return <g className={`tf-germano-chart-point ${tone}`} tabIndex={0} aria-label={`${label}: ${brl(value)}`}>
    <circle className="hit" cx={point.x} cy={point.y} r="14"><title>{label}: {brl(value)}</title></circle>
    <circle className="marker" cx={point.x} cy={point.y} r="4"/>
    <g className="tooltip" aria-hidden="true"><rect x={point.x-56} y={Math.max(5,point.y-35)} width="112" height="25" rx="7"/><text x={point.x} y={Math.max(21,point.y-18)}>{brl(value)}</text></g>
  </g>;
}

export default function GermanoPortal(){
  const [password,setPassword]=useState('');
  const [data,setData]=useState<PortalData|null>(null);
  const [period,setPeriod]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);

  const enter=async(event?:React.FormEvent,accessPassword=password)=>{
    event?.preventDefault();setLoading(true);setError('');
    const response=await fetch('/api/germano-report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:accessPassword})});
    const payload=await response.json();setLoading(false);
    if(!response.ok){setError(payload.error||'Não foi possível entrar.');return}
    sessionStorage.setItem('tf_germano_access','1');setData(payload);setPeriod(payload.periods[0]||new Date().toISOString().slice(0,7));
  };
  useEffect(()=>{if(sessionStorage.getItem('tf_germano_access')==='1'){setPassword('GG');void enter(undefined,'GG')}},[]);
  const authenticated = Boolean(data);
  useEffect(() => {
    if (!authenticated) return;
    let disposed = false;
    const refresh = async () => {
      try {
        const response = await fetch('/api/germano-report', { method: 'POST', cache: 'no-store' });
        if (response.ok) {
          const current = await response.json();
          if (!disposed) setData(current);
        }
      } catch { /* Preserve the visible report while the connection is unavailable. */ }
    };
    const storage = (event: StorageEvent) => { if (event.key === CRM_STORAGE_KEY) void refresh(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener(CRM_CHANGED, refresh);
    window.addEventListener('storage', storage);
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener(CRM_CHANGED, refresh); window.removeEventListener('storage', storage); };
  }, [authenticated]);

  const report=useMemo(()=>{
    if(!data||!period)return null;
    const rows=data.operations.filter(item=>item.date.startsWith(period));
    const prior=previousPeriod(period),previous=data.operations.filter(item=>item.date.startsWith(prior));
    const sum=(items:Operation[],key:keyof Pick<Operation,'value'|'gross'|'ilaValue'|'afterIla'|'invoiceFee'|'net'|'thiagoShare'|'partnerShare'>)=>items.reduce((total,item)=>total+Number(item[key]),0);
    const production=sum(rows,'value'),previousProduction=sum(previous,'value'),gross=sum(rows,'gross'),ilaValue=sum(rows,'ilaValue'),afterIla=sum(rows,'afterIla'),invoiceFee=sum(rows,'invoiceFee'),net=sum(rows,'net'),thiago=sum(rows,'thiagoShare'),partnerShare=sum(rows,'partnerShare');
    const difference=production-previousProduction,variation=previousProduction?difference/previousProduction*100:production?100:0;
    const days=[1,5,10,15,20,25,31],cumulative=(items:Operation[],day:number)=>items.filter(item=>Number(item.date.slice(8,10))<=day).reduce((total,item)=>total+item.value,0),currentTrend=days.map(day=>cumulative(rows,day)),previousTrend=days.map(day=>cumulative(previous,day));
    const max=Math.max(1,...currentTrend,...previousTrend),point=(value:number,index:number)=>({x:48+index*(624/(days.length-1)),y:222-(value/max)*172}),currentPoints=currentTrend.map(point),previousPoints=previousTrend.map(point),line=(points:Point[])=>points.map((item,index)=>`${index?'L':'M'} ${item.x} ${item.y}`).join(' '),area=(points:Point[])=>`${line(points)} L ${points.at(-1)!.x} 224 L ${points[0].x} 224 Z`;
    const variationText=Math.abs(variation).toLocaleString('pt-BR',{maximumFractionDigits:1});
    const result=rows.length===0?'SEM MOVIMENTAÇÃO':variation>=25?'CRESCIMENTO EXPRESSIVO':variation>=0?'RESULTADO POSITIVO':variation>-15?'PONTO DE ATENÇÃO':'MÊS DE RECUPERAÇÃO';
    const opening=rows.length===0?`Germano, a GG Veículos não teve produção registrada em ${monthName(period)}.`:variation>=25?`Germano, a GG Veículos teve um crescimento expressivo de ${variationText}% em ${monthName(period)}.`:variation>=0?`Germano, a GG Veículos fechou ${monthName(period)} com resultado positivo e crescimento de ${variationText}%.`:`Germano, a GG Veículos fechou ${monthName(period)} com redução de ${variationText}% em relação a ${monthName(prior)}.`;
    const analysis=`${opening} Foram ${rows.length} contratos e ${brl(production)} em produção. A comissão bruta foi de ${brl(gross)}, com ${brl(ilaValue)} de ILA e ${brl(invoiceFee)} de taxa da nota. O fechamento líquido ficou em ${brl(net)}, sendo ${brl(partnerShare)} a parte do parceiro.`;
    return {rows,previous,prior,production,previousProduction,gross,ilaValue,afterIla,invoiceFee,net,thiago,partnerShare,difference,variation,days,currentTrend,previousTrend,currentPoints,previousPoints,line,area,result,analysis};
  },[data,period]);

  if(!data)return <main className="tf-germano-gate"><form onSubmit={enter}><small>ACESSO DO PARCEIRO</small><h1>Relatórios GG Veículos</h1><p>Parceria TF Assessoria &amp; Finanças + GG Veículos</p><label>Senha<input type="password" autoFocus value={password} onChange={event=>setPassword(event.target.value)} placeholder="Digite sua senha"/></label>{error&&<em>{error}</em>}<button disabled={loading||!password}>{loading?'Entrando…':'Entrar no relatório'}</button><PartnershipBrand/></form></main>;
  if(!report)return null;

  const variationLabel=`${report.variation>=0?'+':'−'}${Math.abs(report.variation).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`;
  const printZoom=report.rows.length<=5?.82:report.rows.length<=10?.68:report.rows.length<=20?.52:report.rows.length<=35?.42:.34;
  const printStyle={'--print-zoom':printZoom,'--print-width':`${100/printZoom}%`} as CSSProperties;

  return <main className="tf-germano-portal">
    <header className="tf-germano-top"><PartnershipBrand compact/><span><small>PORTAL DO PARCEIRO · PARCERIA TF + GG</small><h1>{data.partner.name}</h1><p>Consulta completa de produção e comissões</p></span><label>MÊS DO RELATÓRIO<select value={period} onChange={event=>setPeriod(event.target.value)}>{data.periods.map(item=><option key={item} value={item}>{monthName(item)}</option>)}</select></label><button type="button" onClick={()=>{sessionStorage.removeItem('tf_germano_access');setData(null);setPassword('')}}>Sair</button></header>
    <section className="tf-germano-report" style={printStyle}>
      <div className="tf-germano-report-heading"><span><small>RELATÓRIO DA PARCERIA TF + GG</small><h2>{data.partner.name}</h2><p>{monthName(period)} · Visão completa somente para consulta</p></span><button type="button" onClick={()=>window.print()}>Imprimir relatório</button></div>
      <div className="tf-germano-cards"><article><small>VALOR FINANCIADO</small><strong>{brl(report.production)}</strong></article><article><small>COMISSÃO BRUTA</small><strong>{brl(report.gross)}</strong></article><article className="ila"><small>ILA DESCONTADO</small><strong>{brl(report.ilaValue)}</strong></article><article><small>APÓS ILA</small><strong>{brl(report.afterIla)}</strong></article><article><small>TAXA DA NOTA</small><strong>{brl(report.invoiceFee)}</strong></article><article><small>COMISSÃO LÍQUIDA</small><strong>{brl(report.net)}</strong></article><article><small>REPASSE THIAGO</small><strong>{brl(report.thiago)}</strong></article><article className="partner"><small>PARTE DO PARCEIRO</small><strong>{brl(report.partnerShare)}</strong></article></div>
      <section className="tf-germano-comparison"><header><span><small>COMPARATIVO MENSAL</small><h3>Produção total</h3></span><b className={report.difference>=0?'up':'down'}>{variationLabel}</b></header>
        <div className="tf-germano-months"><article><small>{monthName(report.prior)}</small><strong>{brl(report.previousProduction)}</strong><span>{report.previous.length} contratos</span></article><article className="current"><small>{monthName(period)}</small><strong>{brl(report.production)}</strong><span>{report.rows.length} contratos</span></article><aside><small>{report.difference>=0?'CRESCIMENTO':'REDUÇÃO'}</small><strong>{variationLabel}</strong><span>{report.difference>=0?'+':'−'} {brl(Math.abs(report.difference))}</span></aside></div>
        <div className="tf-germano-chart"><svg viewBox="0 0 720 270" role="img" aria-label="Comparativo mensal de produção"><defs><linearGradient id="gg-current-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e7b94f" stopOpacity=".62"/><stop offset="1" stopColor="#e7b94f" stopOpacity="0"/></linearGradient><linearGradient id="gg-previous-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d7d9d6" stopOpacity=".34"/><stop offset="1" stopColor="#d7d9d6" stopOpacity="0"/></linearGradient></defs>{[50,93,136,179,222].map(y=><line key={y} className="grid" x1="48" x2="672" y1={y} y2={y}/>)}{report.days.map((day,index)=><g key={day}><line className="grid vertical" x1={report.currentPoints[index].x} x2={report.currentPoints[index].x} y1="50" y2="224"/><text x={report.currentPoints[index].x} y="250">{String(day).padStart(2,'0')}</text></g>)}<path className="area previous" d={report.area(report.previousPoints)}/><path className="area current" d={report.area(report.currentPoints)}/><path className="line previous" d={report.line(report.previousPoints)}/><path className="line current" d={report.line(report.currentPoints)}/>{report.days.map((day,index)=><ChartPoint key={`p-${day}`} point={report.previousPoints[index]} value={report.previousTrend[index]} label={`${monthName(report.prior)}, dia ${day}`} tone="previous"/>)}{report.days.map((day,index)=><ChartPoint key={`c-${day}`} point={report.currentPoints[index]} value={report.currentTrend[index]} label={`${monthName(period)}, dia ${day}`} tone="current"/>)}</svg><div><span><i className="current"/>{monthName(period)} <b>{brl(report.production)}</b></span><span><i className="previous"/>{monthName(report.prior)} <b>{brl(report.previousProduction)}</b></span></div></div>
      </section>
      <article className="tf-germano-analysis"><span className={report.variation>=0?'positive':'attention'}>{report.result}</span><div><b>Fechamento do mês</b><p>{report.analysis}</p></div></article>
      <div className="tf-germano-table"><table><thead><tr><th>Cliente</th><th>CPF</th><th>Banco</th><th>Produto</th><th>Valor financiado</th><th>Comissão bruta</th><th>ILA</th><th>Após ILA</th><th>Taxa da nota</th><th>Comissão líquida</th><th>Repasse Thiago</th><th>Parte do parceiro</th></tr></thead><tbody>{report.rows.map(row=><tr key={row.id}><td>{row.clientName}</td><td>{formatCpf(row.cpf)}</td><td>{row.bank}</td><td>{row.product}</td><td>{brl(row.value)}</td><td>{brl(row.gross)}</td><td>{row.ilaRate.toLocaleString('pt-BR')}% · {brl(row.ilaValue)}</td><td>{brl(row.afterIla)}</td><td>{row.invoiceRate.toLocaleString('pt-BR')}% · {brl(row.invoiceFee)}</td><td>{brl(row.net)}</td><td>{brl(row.thiagoShare)}</td><td className="partner-value">{brl(row.partnerShare)}</td></tr>)}{!report.rows.length&&<tr><td colSpan={12}>Nenhuma operação neste mês.</td></tr>}</tbody></table></div>
      <footer><span>Visualização somente para consulta · nenhuma alteração é permitida</span><button type="button" onClick={()=>window.print()}>Imprimir relatório</button></footer>
    </section>
  </main>;
}
