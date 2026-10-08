'use client';

import { Fragment, useEffect, useRef } from 'react';
import { formatMoney as money } from '../../lib/money';
import './print-report.css';

type Row = {id:number;clientName:string;cpf:string;bank:string;product:string;paidDate:string;value:number;gross:number;ilaRate:number;ilaValue:number;afterIla:number;invoiceRate:number;invoiceFee:number;net:number;thiagoShare:number;partnerShare:number};
type Props = {
  partnerName:string;period:string;previousPeriod:string;
  groups:{key:string;label:string;rows:Row[]}[];
  report:{contracts:unknown[];production:number;previousProduction:number;gross:number;ilaValue:number;afterIla:number;invoiceFee:number;net:number;thiago:number;partnerShare:number;difference:number;variation:number;settlement?:{bonusDescription:string;deductionDescription:string};settlementFinance:{additional:number;appliedDeduction:number}};
};
const date=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('/'):'—';
const cpf=(value:string)=>value.replace(/\D/g,'').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');

export default function PartnerPrintReport({partnerName,period,previousPeriod,report,groups}:Props) {
  const sheet=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const fit=()=>{
      const element=sheet.current;
      if(!element)return;
      element.style.transform='none';
      // Measure the actual content at the fixed A4 width, including long names.
      const scale=Math.min(1,(190*96/25.4)/element.scrollHeight);
      element.style.transform=`scale(${scale})`;
    };
    fit();
    void document.fonts.ready.then(fit);
    const observer=new ResizeObserver(fit);
    if(sheet.current)observer.observe(sheet.current);
    window.addEventListener('beforeprint',fit);
    return()=>{observer.disconnect();window.removeEventListener('beforeprint',fit)};
  },[report,groups]);
  const adjustment=report.settlementFinance;
  return <div className="gg-print-page" aria-hidden="true"><div className="gg-print-sheet" ref={sheet}>
    <header className="ggp-header"><div className="ggp-brand"><img src="/tf-logo-no-bg.png" alt="TF"/><span/><img src="/gg-veiculos-logo.png" alt="GG Veículos"/></div><div><small>TF ASSESSORIA & FINANÇAS · PARCERIAS</small><h1>Relatório de produção e repasses</h1><p>{partnerName}</p></div><aside><b>{period}</b><span>DEMONSTRATIVO MENSAL</span></aside></header>
    <section className="ggp-summary"><div><small>CRÉDITO FINANCIADO</small><strong>{money(report.production)}</strong></div><div><small>COMISSÃO BRUTA</small><strong>{money(report.gross)}</strong></div><div><small>CRÉDITO LÍQUIDO</small><strong>{money(report.net)}</strong></div><div><small>OPERAÇÕES</small><strong>{report.contracts.length.toString().padStart(2,'0')}</strong></div></section>
    <div className="ggp-section-title"><h2>Detalhamento das operações</h2><span>Valores em reais · agrupados por origem</span></div>
    <table className="ggp-table"><colgroup>{[22,5,7,6,8,7,6,7,6,8,9,9].map((width,index)=><col key={index} style={{width:`${width}%`}}/>)}</colgroup><thead><tr>{['Cliente / CPF','Banco','Produto','Pagamento','Financiado','Comissão bruta','ILA','Após ILA','Nota fiscal','Crédito líquido','Repasse Thiago','Repasse GG'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{groups.map(group=><Fragment key={group.key}><tr className={`ggp-source ${group.key}`}><th colSpan={12}>{group.label}<span>{group.rows.filter(row=>row.id>0).length} operações</span></th></tr>{group.rows.map(row=><tr key={row.id}><td><b>{row.clientName}</b><small>{cpf(row.cpf)||'—'}</small></td><td>{row.bank}</td><td>{row.product}</td><td>{date(row.paidDate)}</td><td>{money(row.value)}</td><td>{money(row.gross)}</td><td>{money(row.ilaValue)}<small>{row.ilaRate.toLocaleString('pt-BR')}%</small></td><td>{money(row.afterIla)}</td><td>{money(row.invoiceFee)}<small>{row.invoiceRate.toLocaleString('pt-BR')}%</small></td><td>{money(row.net)}</td><td>{money(row.thiagoShare)}</td><td className="ggp-share">{money(row.partnerShare)}</td></tr>)}{!group.rows.length&&<tr><td colSpan={12} className="ggp-empty">Sem operações no período.</td></tr>}</Fragment>)}</tbody></table>
    {(adjustment.additional>0||adjustment.appliedDeduction>0)&&<div className="ggp-adjustments">{adjustment.additional>0&&<span><b>Adicional GG: + {money(adjustment.additional)}</b> · {report.settlement?.bonusDescription||'Bônus / campanha'}</span>}{adjustment.appliedDeduction>0&&<span><b>Dedução Thiago: − {money(adjustment.appliedDeduction)}</b> · {report.settlement?.deductionDescription||'Débito / antecipação'}</span>}</div>}
    <section className="ggp-bottom"><div className="ggp-costs"><h2>Fechamento financeiro</h2><dl><div><dt>Comissão bruta</dt><dd>{money(report.gross)}</dd></div><div><dt>ILA descontado</dt><dd>− {money(report.ilaValue)}</dd></div><div><dt>Após ILA</dt><dd>{money(report.afterIla)}</dd></div><div><dt>Taxa da nota fiscal</dt><dd>− {money(report.invoiceFee)}</dd></div><div className="ggp-net"><dt>Crédito líquido final</dt><dd>{money(report.net)}</dd></div></dl></div><div className="ggp-payout"><small>REPASSE · GG VEÍCULOS</small><strong>{money(report.partnerShare)}</strong><span>Valor do parceiro no período</span></div><div className="ggp-payout tf"><small>REPASSE · THIAGO</small><strong>{money(report.thiago)}</strong><span>Valor TF no período</span></div></section>
    <section className="ggp-comparison"><b>Comparativo de produção</b><span>{previousPeriod}: <strong>{money(report.previousProduction)}</strong></span><span>{period}: <strong>{money(report.production)}</strong></span><em>{report.previousProduction>0?`${report.variation>=0?'+':''}${report.variation.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`:'Sem base anterior'}<small>{money(report.difference)} de variação</small></em></section>
    <footer className="ggp-footer"><b>TF Assessoria & Finanças <span>+ {partnerName}</span></b><span>Demonstrativo de conferência · {period}</span></footer>
  </div></div>;
}
