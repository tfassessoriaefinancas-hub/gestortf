'use client';
import { formatMoney as brl } from '../../lib/money';
import { partnerSettlementFinance } from '../../lib/operation-finance';
import { CRM_CHANGED } from '../../lib/crm-events';
import { startActiveRefresh } from '../../lib/active-refresh';

import { Fragment, useEffect, useMemo, useState } from 'react';

type Operation={id:number;clientName:string;cpf:string;bank:string;product:string;date:string;paidDate:string;value:number;producer:string;origin:string;gross:number;ilaRate:number;ilaValue:number;afterIla:number;invoiceRate:number;invoiceFee:number;net:number;thiagoShare:number;partnerShare:number};
type PartnerSettlement={period:string;bonus:number;bonusDescription:string;deduction:number;deductionDescription:string};
type PortalData={partner:{id:number;name:string};periods:string[];operations:Operation[];settlements:PartnerSettlement[]};
type Point={x:number;y:number};


const monthName=(period:string)=>{const label=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${period}-01T00:00:00Z`));return label.charAt(0).toUpperCase()+label.slice(1)};
const previousPeriod=(period:string)=>{const [year,month]=period.split('-').map(Number),date=new Date(Date.UTC(year,month-2,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`};
const formatCpf=(value:string)=>value.replace(/\D/g,'').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
const formatDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`)):'—';
const sourceGroup=(row:Operation)=>/^TF$/i.test(row.producer)||/^TF Assessoria/i.test(row.origin)?'tf':'gg';
const byPaidDate=(a:Operation,b:Operation)=>(a.paidDate||a.date||'9999-12-31').localeCompare(b.paidDate||b.date||'9999-12-31')||a.date.localeCompare(b.date)||a.clientName.localeCompare(b.clientName,'pt-BR',{sensitivity:'base'});

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
  const [data,setData]=useState<PortalData|null>(null);
  const [period,setPeriod]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const partnerId=typeof window==='undefined'?0:Number(new URLSearchParams(window.location.search).get('partner')||0);

  const enter=async()=>{
    setLoading(true);setError('');
    try {
      const response=await fetch('/api/germano-report',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({partnerId})});
      const payload=await response.json();
      if(!response.ok){setError(payload.error||'Não foi possível entrar.');return}
      setData(payload);setPeriod(payload.periods[0]||new Date().toISOString().slice(0,7));
    } catch {setError('Não foi possível carregar o relatório. Tente novamente.');}
    finally {setLoading(false);}
  };
  useEffect(()=>{void enter()},[partnerId]);
  const authenticated = Boolean(data);
  useEffect(() => {
    if (!authenticated) return;
    let disposed = false;
    let refreshing = false;
    const refresh = async () => {
      if (disposed || refreshing || document.visibilityState === 'hidden' || navigator.onLine === false) return;
      refreshing = true;
      try {
        const response = await fetch('/api/germano-report', { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ partnerId }) });
        if (response.ok) {
          const current = await response.json();
          if (!disposed) setData(current);
        }
      } catch { /* Preserve the visible report while the connection is unavailable. */ }
      finally { refreshing = false; }
    };
    const stopRefresh = startActiveRefresh(refresh);
    window.addEventListener(CRM_CHANGED, refresh);
    return () => { disposed = true; stopRefresh(); window.removeEventListener(CRM_CHANGED, refresh); };
  }, [authenticated, partnerId]);

  const report=useMemo(()=>{
    if(!data||!period)return null;
    const rows=data.operations.filter(item=>item.date.startsWith(period)),contracts=rows.filter(item=>item.id>0);
    const prior=previousPeriod(period),previous=data.operations.filter(item=>item.date.startsWith(prior)),previousContracts=previous.filter(item=>item.id>0);
    const sum=(items:Operation[],key:keyof Pick<Operation,'value'|'gross'|'ilaValue'|'afterIla'|'invoiceFee'|'net'|'thiagoShare'|'partnerShare'>)=>items.reduce((total,item)=>total+Number(item[key]),0);
    const production=sum(rows,'value'),previousProduction=sum(previous,'value'),gross=sum(rows,'gross'),ilaValue=sum(rows,'ilaValue'),afterIla=sum(rows,'afterIla'),invoiceFee=sum(rows,'invoiceFee'),baseNet=sum(rows,'net'),thiago=sum(rows,'thiagoShare'),basePartnerShare=sum(rows,'partnerShare'),settlement=data.settlements?.find(item=>item.period===period),settlementFinance=partnerSettlementFinance(baseNet,basePartnerShare,settlement?.bonus,settlement?.deduction),net=settlementFinance.creditNet,partnerShare=settlementFinance.partnerShare;
    const difference=production-previousProduction,variation=previousProduction?difference/previousProduction*100:production?100:0;
    const days=[1,5,10,15,20,25,31],cumulative=(items:Operation[],day:number)=>items.filter(item=>Number(item.date.slice(8,10))<=day).reduce((total,item)=>total+item.value,0),currentTrend=days.map(day=>cumulative(rows,day)),previousTrend=days.map(day=>cumulative(previous,day));
    const max=Math.max(1,...currentTrend,...previousTrend),point=(value:number,index:number)=>({x:48+index*(624/(days.length-1)),y:222-(value/max)*172}),currentPoints=currentTrend.map(point),previousPoints=previousTrend.map(point),line=(points:Point[])=>points.map((item,index)=>`${index?'L':'M'} ${item.x} ${item.y}`).join(' '),area=(points:Point[])=>`${line(points)} L ${points.at(-1)!.x} 224 L ${points[0].x} 224 Z`;
    const variationText=Math.abs(variation).toLocaleString('pt-BR',{maximumFractionDigits:1});
    const result=contracts.length===0?'SEM MOVIMENTAÇÃO':variation>=25?'CRESCIMENTO EXPRESSIVO':variation>=0?'RESULTADO POSITIVO':variation>-15?'PONTO DE ATENÇÃO':'MÊS DE RECUPERAÇÃO';
    const opening=contracts.length===0?`Germano, a GG Veículos não teve produção registrada em ${monthName(period)}.`:variation>=25?`Germano, a GG Veículos teve um crescimento expressivo de ${variationText}% em ${monthName(period)}.`:variation>=0?`Germano, a GG Veículos fechou ${monthName(period)} com resultado positivo e crescimento de ${variationText}%.`:`Germano, a GG Veículos fechou ${monthName(period)} com redução de ${variationText}% em relação a ${monthName(prior)}.`;
    const adjustmentText=settlementFinance.additional||settlementFinance.appliedDeduction?` Após ${settlementFinance.additional?`adicional de ${brl(settlementFinance.additional)}`:''}${settlementFinance.additional&&settlementFinance.appliedDeduction?' e ':''}${settlementFinance.appliedDeduction?`dedução de ${brl(settlementFinance.appliedDeduction)}`:''}, o crédito líquido ficou em ${brl(net)}.`:'';
    const analysis=`${opening} Foram ${contracts.length} contratos e ${brl(production)} em produção. A comissão bruta foi de ${brl(gross)}, com ${brl(ilaValue)} de ILA e ${brl(invoiceFee)} de taxa da nota.${adjustmentText} O repasse Thiago é ${brl(thiago)} e o repasse do parceiro é ${brl(partnerShare)}.`;
    return {rows,contracts,previous,previousContracts,prior,production,previousProduction,gross,ilaValue,afterIla,invoiceFee,net,thiago,partnerShare,settlement,settlementFinance,difference,variation,days,currentTrend,previousTrend,currentPoints,previousPoints,line,area,result,analysis};
  },[data,period]);

  if(!data)return <main className="tf-germano-gate"><section><small>ACESSO DO PARCEIRO</small><h1>Relatórios GG Veículos</h1><p>Parceria TF Assessoria &amp; Finanças + GG Veículos</p>{loading?<b>Carregando relatório…</b>:<><em>{error||'Entre com o usuário e a senha da GG Veículos para acessar.'}</em><a href={`/signin-with-chatgpt?return_to=${encodeURIComponent(`/germano${partnerId?`?partner=${partnerId}`:''}`)}`}>Entrar no sistema</a></>}<PartnershipBrand/></section></main>;
  if(!report)return null;

  const variationLabel=`${report.variation>=0?'+':'−'}${Math.abs(report.variation).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`;
  const groupedRows=[{key:'tf',label:'TF Assessoria e Finanças',rows:report.rows.filter(row=>sourceGroup(row)==='tf').sort(byPaidDate)},{key:'gg',label:'GG Veículos',rows:report.rows.filter(row=>sourceGroup(row)==='gg').sort(byPaidDate)}];
  const exportCsv=()=>{const cells=(values:unknown[])=>values.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(';'),lines=[cells(['Origem','Cliente','CPF','Banco','Produto','Data da operação','Data do pagamento','Valor financiado','Comissão bruta','Crédito líquido','Repasse Thiago','Repasse parceiro'])];for(const group of groupedRows)for(const row of group.rows)lines.push(cells([group.label,row.clientName,formatCpf(row.cpf),row.bank,row.product,formatDate(row.date),formatDate(row.paidDate),brl(row.value),brl(row.gross),brl(row.net),brl(row.thiagoShare),brl(row.partnerShare)]));if(report.settlementFinance.additional)lines.push(cells(['Ajuste do parceiro','Valor adicional','','Adicional',report.settlement?.bonusDescription||'Bônus / campanha','','','','',brl(report.settlementFinance.additional),brl(0),brl(report.settlementFinance.additional)]));if(report.settlementFinance.appliedDeduction)lines.push(cells(['Ajuste do parceiro','Valor deduzido','','Dedução',report.settlement?.deductionDescription||'Débito / antecipação','','','','',`- ${brl(report.settlementFinance.appliedDeduction)}`,brl(0),`- ${brl(report.settlementFinance.appliedDeduction)}`]));lines.push(cells(['TOTAL DO PERÍODO','','','','','','',brl(report.production),brl(report.gross),brl(report.net),brl(report.thiago),brl(report.partnerShare)]));const blob=new Blob([`\uFEFF${lines.join('\r\n')}`],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`relatorio-gg-veiculos-${period}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};

  return <main className="tf-germano-portal">
    <header className="tf-germano-top"><PartnershipBrand compact/><span><small>PORTAL DO PARCEIRO · PARCERIA TF + GG</small><h1>{data.partner.name}</h1><p>Consulta completa de produção e comissões</p></span><label>MÊS DO RELATÓRIO<select value={period} onChange={event=>setPeriod(event.target.value)}>{data.periods.map(item=><option key={item} value={item}>{monthName(item)}</option>)}</select></label><button type="button" onClick={()=>{const partner=data.partner.id||partnerId;window.location.href=`/signout-with-chatgpt?scope=partner&return_to=${encodeURIComponent(`/germano${partner?`?partner=${partner}`:''}`)}`}}>Sair</button></header>
    <section className="tf-germano-report">
      <div className="tf-germano-report-heading"><div className="tf-germano-print-logos" aria-hidden="true"><img src="/tf-logo-no-bg.png" alt=""/><span>+</span><img src="/gg-veiculos-logo.png" alt=""/></div><span><small>RELATÓRIO DA PARCERIA TF + GG</small><h2>{data.partner.name}</h2><p>{monthName(period)} · Relatório de produção e repasses</p></span><div><button type="button" onClick={exportCsv}>Exportar dados</button><button type="button" onClick={()=>window.print()}>Imprimir relatório</button></div></div>
      <section className="tf-germano-clients"><header className="tf-germano-section-title"><span><small>01 · CLIENTES</small><h3>Clientes e operações do período</h3></span><b>{report.contracts.length} {report.contracts.length===1?'cliente':'clientes'}</b></header>
        <div className="tf-germano-table"><table><thead><tr><th>Cliente</th><th>CPF</th><th>Banco</th><th>Produto</th><th>Pagamento</th><th>Valor financiado</th><th>Comissão bruta</th><th>ILA</th><th>Após ILA</th><th>Taxa da nota</th><th>Crédito líquido</th><th>Repasse Thiago</th><th>Repasse parceiro</th></tr></thead><tbody>{groupedRows.map(group=>{const clientCount=group.rows.filter(row=>row.id>0).length;return <Fragment key={group.key}><tr className={`tf-germano-source ${group.key}`}><th colSpan={13}>{group.label}<small>{clientCount} {clientCount===1?'cliente':'clientes'}</small></th></tr>{group.rows.map(row=><tr key={row.id}><td>{row.clientName}</td><td>{formatCpf(row.cpf)||'—'}</td><td>{row.bank}</td><td>{row.product}</td><td>{formatDate(row.paidDate)}</td><td>{brl(row.value)}</td><td>{brl(row.gross)}</td><td>{row.ilaRate.toLocaleString('pt-BR')}% · {brl(row.ilaValue)}</td><td>{brl(row.afterIla)}</td><td>{row.invoiceRate.toLocaleString('pt-BR')}% · {brl(row.invoiceFee)}</td><td>{brl(row.net)}</td><td>{brl(row.thiagoShare)}</td><td className="partner-value">{brl(row.partnerShare)}</td></tr>)}{!group.rows.length&&<tr className="tf-germano-source-empty"><td colSpan={13}>Nenhum cliente neste bloco.</td></tr>}</Fragment>})}{report.settlementFinance.additional>0&&<tr className="tf-germano-adjustment positive"><td>Ajuste do parceiro</td><td>—</td><td>Adicional</td><td>{report.settlement?.bonusDescription||'Bônus / campanha'}</td><td>—</td><td>—</td><td>—</td><td>0%</td><td>—</td><td>0%</td><td>+ {brl(report.settlementFinance.additional)}</td><td>{brl(0)}</td><td className="partner-value">+ {brl(report.settlementFinance.additional)}</td></tr>}{report.settlementFinance.appliedDeduction>0&&<tr className="tf-germano-adjustment negative"><td>Ajuste do parceiro</td><td>—</td><td>Dedução</td><td>{report.settlement?.deductionDescription||'Débito / antecipação'}</td><td>—</td><td>—</td><td>—</td><td>0%</td><td>—</td><td>0%</td><td>− {brl(report.settlementFinance.appliedDeduction)}</td><td>{brl(0)}</td><td className="partner-value">− {brl(report.settlementFinance.appliedDeduction)}</td></tr>}</tbody></table></div>
        <div className="tf-germano-client-totals"><span><small>CRÉDITOS FINANCIADOS</small><strong>{brl(report.production)}</strong></span><span><small>CRÉDITO LÍQUIDO TOTAL</small><strong>{brl(report.net)}</strong></span><span><small>REPASSE THIAGO</small><strong>{brl(report.thiago)}</strong></span><span className="partner"><small>REPASSE GG VEÍCULOS</small><strong>{brl(report.partnerShare)}</strong></span></div>
      </section>
      <section className="tf-germano-comparison"><header><span><small>02 · GRÁFICO COMPARATIVO</small><h3>Produção total</h3></span><b className={report.difference>=0?'up':'down'}>{variationLabel}</b></header>
        <div className="tf-germano-months"><article><small>{monthName(report.prior)}</small><strong>{brl(report.previousProduction)}</strong><span>{report.previousContracts.length} contratos</span></article><article className="current"><small>{monthName(period)}</small><strong>{brl(report.production)}</strong><span>{report.contracts.length} contratos</span></article><aside><small>{report.difference>=0?'CRESCIMENTO':'REDUÇÃO'}</small><strong>{variationLabel}</strong><span>{report.difference>=0?'+':'−'} {brl(Math.abs(report.difference))}</span></aside></div>
        <div className="tf-germano-chart"><svg viewBox="0 0 720 270" role="img" aria-label="Comparativo mensal de produção"><defs><linearGradient id="gg-current-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e7b94f" stopOpacity=".62"/><stop offset="1" stopColor="#e7b94f" stopOpacity="0"/></linearGradient><linearGradient id="gg-previous-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d7d9d6" stopOpacity=".34"/><stop offset="1" stopColor="#d7d9d6" stopOpacity="0"/></linearGradient></defs>{[50,93,136,179,222].map(y=><line key={y} className="grid" x1="48" x2="672" y1={y} y2={y}/>)}{report.days.map((day,index)=><g key={day}><line className="grid vertical" x1={report.currentPoints[index].x} x2={report.currentPoints[index].x} y1="50" y2="224"/><text x={report.currentPoints[index].x} y="250">{String(day).padStart(2,'0')}</text></g>)}<path className="area previous" d={report.area(report.previousPoints)}/><path className="area current" d={report.area(report.currentPoints)}/><path className="line previous" d={report.line(report.previousPoints)}/><path className="line current" d={report.line(report.currentPoints)}/>{report.days.map((day,index)=><ChartPoint key={`p-${day}`} point={report.previousPoints[index]} value={report.previousTrend[index]} label={`${monthName(report.prior)}, dia ${day}`} tone="previous"/>)}{report.days.map((day,index)=><ChartPoint key={`c-${day}`} point={report.currentPoints[index]} value={report.currentTrend[index]} label={`${monthName(period)}, dia ${day}`} tone="current"/>)}</svg><div><span><i className="current"/>{monthName(period)} <b>{brl(report.production)}</b></span><span><i className="previous"/>{monthName(report.prior)} <b>{brl(report.previousProduction)}</b></span></div></div>
      </section>
      <section className="tf-germano-financial"><header className="tf-germano-section-title"><span><small>03 · FECHAMENTO</small><h3>Resumo financeiro e repasses</h3></span><b>{monthName(period)}</b></header>
        <div className="tf-germano-cards"><article><small>VALOR FINANCIADO</small><strong>{brl(report.production)}</strong></article><article><small>COMISSÃO BRUTA</small><strong>{brl(report.gross)}</strong></article><article className="ila"><small>ILA DESCONTADO</small><strong>{brl(report.ilaValue)}</strong></article><article><small>APÓS ILA</small><strong>{brl(report.afterIla)}</strong></article><article><small>TAXA DA NOTA</small><strong>{brl(report.invoiceFee)}</strong></article>{report.settlementFinance.additional>0&&<article><small>VALOR ADICIONAL</small><strong>+ {brl(report.settlementFinance.additional)}</strong></article>}{report.settlementFinance.appliedDeduction>0&&<article className="ila"><small>VALOR DEDUZIDO</small><strong>− {brl(report.settlementFinance.appliedDeduction)}</strong></article>}<article><small>CRÉDITO LÍQUIDO</small><strong>{brl(report.net)}</strong></article><article><small>REPASSE THIAGO</small><strong>{brl(report.thiago)}</strong></article><article className="partner"><small>REPASSE PARCEIRO</small><strong>{brl(report.partnerShare)}</strong></article></div>
        <article className="tf-germano-analysis"><span className={report.variation>=0?'positive':'attention'}>{report.result}</span><div><b>Fechamento do mês</b><p>{report.analysis}</p></div></article>
      </section>
      <footer><span>Visualização somente para consulta · nenhuma alteração é permitida</span><button type="button" onClick={()=>window.print()}>Imprimir relatório</button></footer>
    </section>
  </main>;
}
