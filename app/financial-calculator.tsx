"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLine, CalendarDays, Calculator, CheckCircle2, CircleDollarSign, Info, Sparkles } from "lucide-react";
import { formatMoney, parseMoney } from "@/lib/money";
import {
  addCalendarDays, anticipateInstallmentsByAnnualRate, buildAmortizationSchedule,
  financedValueFromPayment, implicitMonthlyRate, pricePayment, xirr,
} from "@/lib/financial-calculator";

type Order = "next" | "last";

const localIso = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const plusDays = (days: number) => { const date = new Date(`${localIso()}T12:00:00`); date.setDate(date.getDate() + days); return localIso(date); };
const parseRate = (value: string) => { const rate = Number(value.replace(/[^\d,-]/g, "").replace(",", ".")); return Number.isFinite(rate) ? rate : 0; };
const dateBr = (value?: string) => value ? value.split("-").reverse().join("/") : "—";
const rateBr = (value: number | null, digits = 6) => value == null ? "—" : `${value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
const monthLabel = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  const month = date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return `${month} ${String(date.getFullYear()).slice(-2)}`;
};

function MoneyField({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <input disabled={disabled} inputMode="decimal" value={value} placeholder="R$ 0,00" onChange={event => {
    const digits = event.target.value.replace(/\D/g, "");
    onChange(digits ? formatMoney(Number(digits) / 100) : "");
  }} />;
}

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return <label className="tf-fc-field"><span>{label}</span>{children}{note && <small>{note}</small>}</label>;
}

export default function FinancialCalculator() {
  const [principal, setPrincipal] = useState("");
  const [periods, setPeriods] = useState("48");
  const [payment, setPayment] = useState("");
  const [rate, setRate] = useState("");
  const [firstDueDate, setFirstDueDate] = useState(plusDays(30));
  const [paymentDate, setPaymentDate] = useState(localIso());
  const [order, setOrder] = useState<Order>("last");
  const [quantity, setQuantity] = useState("1");

  const values = useMemo(() => {
    let financed = parseMoney(principal);
    let installment = parseMoney(payment);
    let monthlyRate = parseRate(rate);
    const term = Math.max(0, Math.trunc(Number(periods) || 0));
    let rateWasCalculated = false, paymentWasCalculated = false, principalWasCalculated = false;

    if (!monthlyRate && financed > 0 && installment > 0 && term > 0) {
      monthlyRate = implicitMonthlyRate(financed, installment, term) || 0;
      rateWasCalculated = monthlyRate > 0;
    }
    if (!installment && financed > 0 && monthlyRate > 0 && term > 0) {
      installment = pricePayment(financed, monthlyRate, term);
      paymentWasCalculated = installment > 0;
    }
    if (!financed && installment > 0 && monthlyRate > 0 && term > 0) {
      financed = financedValueFromPayment(installment, monthlyRate, term);
      principalWasCalculated = financed > 0;
    }
    return { financed, installment, monthlyRate, term, rateWasCalculated, paymentWasCalculated, principalWasCalculated };
  }, [principal, payment, rate, periods]);

  const contractDate = firstDueDate ? addCalendarDays(firstDueDate, -30) : "";
  const schedule = useMemo(() => buildAmortizationSchedule({
    principal: values.financed, monthlyRate: values.monthlyRate, periods: values.term,
    payment: values.installment, system: "PRICE", contractDate, firstDueDate,
  }), [values, contractDate, firstDueDate]);

  const annualRate = useMemo(() => {
    if (!schedule.length || !contractDate || !values.financed) return null;
    return xirr([{ date: contractDate, value: values.financed }, ...schedule.map(row => ({ date: row.dueDate, value: -row.payment }))]);
  }, [schedule, contractDate, values.financed]);
  const remaining = useMemo(() => schedule.filter(row => row.dueDate >= paymentDate), [schedule, paymentDate]);
  const count = Math.max(1, Math.min(Number(quantity) || 1, remaining.length || 1));
  const selected = useMemo(() => order === "next" ? remaining.slice(0, count) : remaining.slice(Math.max(0, remaining.length - count)), [remaining, count, order]);
  const anticipation = useMemo(() => annualRate == null ? [] : anticipateInstallmentsByAnnualRate(schedule, selected.map(row => row.installment), paymentDate, annualRate), [annualRate, schedule, selected, paymentDate]);
  const totals = useMemo(() => anticipation.reduce((total, row) => ({ nominal: total.nominal + row.nominal, discount: total.discount + row.discount, pay: total.pay + row.presentValue }), { nominal: 0, discount: 0, pay: 0 }), [anticipation]);
  const ready = values.financed > 0 && values.installment > 0 && values.monthlyRate > 0 && values.term > 0 && Boolean(firstDueDate);
  const missing = !values.financed ? "Informe o valor financiado." : !values.term ? "Informe a quantidade de parcelas." : !values.installment && !values.monthlyRate ? "Informe o valor da parcela ou a taxa de juros." : "";

  return <section className="tf-fc-page tf-fc-simple">
    <header className="tf-fc-hero">
      <div><small>SIMULAÇÃO DE LIQUIDAÇÃO ANTECIPADA</small><h1>Antecipar parcelas</h1><p>Descubra quanto o cliente pagará e qual será o desconto dos juros futuros.</p></div>
      <div className="tf-fc-reference"><Calculator /><span><small>CÁLCULO</small><b>Automático e referencial</b></span></div>
    </header>

    <div className="tf-fc-simple-layout">
      <section className="tf-fc-panel tf-fc-contract-card">
        <div className="tf-fc-section-title"><span><CircleDollarSign /></span><div><small>DADOS DO CONTRATO</small><h2>Preencha o que você possui</h2></div></div>
        <p className="tf-fc-help">A taxa pode ficar vazia. Com valor financiado, prazo e parcela, ela será encontrada automaticamente.</p>
        <div className="tf-fc-grid two">
          <Field label="Valor financiado" note={values.principalWasCalculated ? `Calculado: ${formatMoney(values.financed)}` : undefined}><MoneyField value={principal} onChange={setPrincipal} /></Field>
          <Field label="Quantidade de parcelas (prazo)"><input type="number" min="1" max="600" value={periods} onChange={event => setPeriods(event.target.value)} /></Field>
          <Field label="Valor da parcela" note={values.paymentWasCalculated ? `Calculada: ${formatMoney(values.installment)}` : undefined}><MoneyField value={payment} onChange={setPayment} /></Field>
          <Field label="Taxa de juros (% a.m.)" note={values.rateWasCalculated ? `Calculada automaticamente: ${rateBr(values.monthlyRate)}` : "Se não souber, deixe em branco."}><input inputMode="decimal" value={rate} onChange={event => setRate(event.target.value)} placeholder="Ex.: 1,8925" /></Field>
          <Field label="Primeiro vencimento" note={firstDueDate ? `Contratação estimada em ${dateBr(contractDate)}` : undefined}><input type="date" value={firstDueDate} onChange={event => setFirstDueDate(event.target.value)} /></Field>
        </div>

        {ready && <div className="tf-fc-contract-summary">
          <span><small>VALOR FINANCIADO</small><b>{formatMoney(values.financed)}</b></span>
          <span><small>PARCELAS • PADRÃO</small><b>{values.term}× de {formatMoney(values.installment)}</b></span>
          <span><small>PRIMEIRO VENCIMENTO</small><b>{dateBr(firstDueDate)}</b></span>
          <span><small>TAXA UTILIZADA</small><b>{rateBr(values.monthlyRate)} a.m.</b></span>
        </div>}
      </section>

      <section className="tf-fc-panel tf-fc-anticipation-card">
        <div className="tf-fc-section-title"><span><ArrowDownToLine /></span><div><small>ANTECIPAÇÃO</small><h2>Escolha como deseja pagar</h2></div></div>
        <p className="tf-fc-help">Os valores apresentados são válidos para a data escolhida.</p>
        <Field label="Data do pagamento" note={remaining[0] ? `Próximo vencimento: ${dateBr(remaining[0].dueDate)}` : undefined}><input type="date" value={paymentDate} onChange={event => setPaymentDate(event.target.value)} /></Field>

        <fieldset className="tf-fc-order"><legend>Escolha a ordem da antecipação</legend>
          <label className={order === "next" ? "active" : ""}><input type="radio" name="anticipation-order" checked={order === "next"} onChange={() => setOrder("next")} /><span><b>A partir da próxima parcela</b><small>Começa pelo vencimento mais próximo.</small></span></label>
          <label className={order === "last" ? "active" : ""}><input type="radio" name="anticipation-order" checked={order === "last"} onChange={() => setOrder("last")} /><span><b>A partir da última parcela</b><small>Começa pelo final do contrato e costuma gerar maior desconto.</small></span></label>
        </fieldset>

        <Field label="Selecione a quantidade de parcelas"><select value={String(count)} onChange={event => setQuantity(event.target.value)} disabled={!remaining.length}>{Array.from({ length: remaining.length || 1 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value === remaining.length && remaining.length > 1 ? `${value} — quitar todas as parcelas restantes` : value}</option>)}</select></Field>
        {remaining.length > 0 && <div className="tf-fc-next-due"><Info /><span>Existem <b>{remaining.length} parcelas</b> disponíveis para antecipação na data escolhida.</span></div>}
      </section>
    </div>

    {!ready ? <div className="tf-fc-panel"><div className="tf-fc-empty"><Calculator /><p>{missing || "Preencha os dados do contrato para calcular."}</p></div></div> : anticipation.length ? <section className="tf-fc-panel tf-fc-result">
      <header><div><small>RESULTADO DA SIMULAÇÃO</small><h2>{count === 1 ? "Antecipando 1 parcela" : `Antecipando ${count} parcelas`}</h2><p>{order === "last" ? "Cálculo iniciado pela última parcela do contrato." : "Cálculo iniciado pela próxima parcela a vencer."}</p></div><span><Sparkles /><small>Taxa efetiva anual do fluxo</small><b>{rateBr(annualRate, 4)} a.a.</b></span></header>
      <div className="tf-fc-result-total">
        <span><small>PARCELAS</small><strong>{count} {count === 1 ? "parcela" : "parcelas"} <i>•</i> {selected.length ? monthLabel(selected[0].dueDate) : "—"}{selected.length > 1 ? ` a ${monthLabel(selected.at(-1)!.dueDate)}` : ""}</strong></span>
        <span><small>VALOR SEM DESCONTO</small><strong>{formatMoney(totals.nominal)}</strong></span>
        <span className="discount"><small>DESCONTO DE JUROS</small><strong>− {formatMoney(totals.discount)}</strong></span>
        <span className="pay"><small>TOTAL A PAGAR</small><strong>{formatMoney(totals.pay)}</strong></span>
      </div>
      <div className="tf-fc-simple-table"><header><span>Parcela</span><span>Vencimento</span><span>Antecipação</span><span>Valor original</span><span>Desconto</span><span>Valor a pagar</span></header>{anticipation.map(row => <article key={row.installment}><span><b>Parcela {row.installment}</b><small>{monthLabel(row.dueDate)}</small></span><span>{dateBr(row.dueDate)}</span><span>{row.daysEarly} dias antes</span><span>{formatMoney(row.nominal)}</span><span className="discount">− {formatMoney(row.discount)}</span><span className="pay">{formatMoney(row.presentValue)}</span></article>)}</div>
      <footer><CheckCircle2 /><p><b>Como foi calculado?</b><span>O sistema reconstruiu a taxa do contrato e descontou os juros futuros pelas datas reais dos vencimentos. É uma estimativa referencial; o boleto oficial pode variar conforme a regra da instituição.</span></p></footer>
    </section> : <div className="tf-fc-panel"><div className="tf-fc-empty"><CalendarDays /><p>Não existem parcelas futuras para a data de pagamento escolhida.</p></div></div>}
  </section>;
}
