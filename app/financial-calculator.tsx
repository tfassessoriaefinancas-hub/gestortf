"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine, BadgePercent, Banknote, CalendarDays, CheckCircle2, ChevronDown,
  CircleDollarSign, Clock3, FileClock, Landmark, Plus, RefreshCw, Save, Scale,
  TableProperties, Trash2, TrendingDown, WalletCards,
} from "lucide-react";
import { formatMoney, parseMoney } from "@/lib/money";
import {
  amortizationScenarios, anticipateInstallments, buildAmortizationSchedule, calculateCet,
  effectiveAnnualRate, equivalentMonthlyRate, financedValueFromPayment, implicitMonthlyRate, operationTotals,
  payoffEstimate, periodsFromPayment, pricePayment, reconstructionError, safeInstallmentSelection,
  xirr, type AmortizationSystem, type CashFlow, type DayConvention, type Periodicity,
} from "@/lib/financial-calculator";

type Tab = "simulador" | "amortizacao" | "antecipacao" | "quitacao" | "tabela" | "cet" | "comparador" | "historico";
type Cost = { id: string; description: string; value: string; financed: boolean; cash: boolean };
type HistoryItem = { id: string; createdAt: number; operation: string; system: string; principal: number; payment: number; periods: number; monthlyRate: number; annualRate: number | null };
type InstitutionRule = { id: string; bank: string; product: string; system: AmortizationSystem; convention: DayConvention; rate: string; dueRule: string; criterion: string; notes: string };

const tabs: Array<[Tab, typeof WalletCards, string]> = [
  ["simulador", WalletCards, "Simulador"], ["amortizacao", TrendingDown, "Amortização"],
  ["antecipacao", ArrowDownToLine, "Antecipação"], ["quitacao", CheckCircle2, "Quitar contrato"],
  ["tabela", TableProperties, "Tabela completa"], ["cet", BadgePercent, "CET / Custos"],
  ["comparador", Scale, "Comparador"], ["historico", FileClock, "Histórico"],
];
const operations = ["Financiamento de veículo", "Empréstimo pessoal", "Crédito com garantia", "Consignado", "CDC", "Capital de giro", "Financiamento imobiliário", "Outro"];
const costNames = ["IOF", "Tarifa de cadastro", "Registro de contrato", "Gravame", "Seguro prestamista", "Seguro do veículo", "Serviços de terceiros", "Despachante", "Avaliação", "Tarifa bancária", "Outros"];
const todayIso = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const plusDays = (days: number) => { const date = new Date(`${todayIso()}T12:00:00`); date.setDate(date.getDate() + days); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const rateValue = (value: string) => { const parsed = Number(value.replace(/[^\d,-]/g, "").replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0; };
const rateText = (value: number | null, digits = 4) => value == null ? "—" : `${value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
const dateBr = (value?: string) => value ? value.split("-").reverse().join("/") : "—";
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function MoneyField({ value, onChange, placeholder = "R$ 0,00", ...props }: { value: string; onChange: (value: string) => void; placeholder?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <input {...props} inputMode="decimal" value={value} placeholder={placeholder} onChange={event => {
    const digits = event.target.value.replace(/\D/g, "");
    onChange(digits ? formatMoney(Number(digits) / 100) : "");
  }} />;
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return <label className="tf-fc-field"><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
}

function Metric({ label, value, accent = false, note }: { label: string; value: string; accent?: boolean; note?: string }) {
  return <article className={`tf-fc-metric${accent ? " accent" : ""}`}><small>{label}</small><strong>{value}</strong>{note && <span>{note}</span>}</article>;
}

function Empty({ children }: { children: React.ReactNode }) { return <div className="tf-fc-empty"><CircleDollarSign /><p>{children}</p></div>; }

export default function FinancialCalculator() {
  const [tab, setTab] = useState<Tab>("simulador");
  const [operation, setOperation] = useState(operations[0]);
  const [system, setSystem] = useState<AmortizationSystem>("PRICE");
  const [discover, setDiscover] = useState("parcela");
  const [assetValue, setAssetValue] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const [netReleased, setNetReleased] = useState("");
  const [principal, setPrincipal] = useState("");
  const [periods, setPeriods] = useState("36");
  const [payment, setPayment] = useState("");
  const [monthlyRate, setMonthlyRate] = useState("");
  const [annualNominal, setAnnualNominal] = useState("");
  const [cetInformed, setCetInformed] = useState("");
  const [contractDate, setContractDate] = useState(todayIso());
  const [releaseDate, setReleaseDate] = useState(todayIso());
  const [firstDueDate, setFirstDueDate] = useState(plusDays(30));
  const [periodicity, setPeriodicity] = useState<Periodicity>("mensal");
  const [convention, setConvention] = useState<DayConvention>("AUTO");
  const [grace, setGrace] = useState(false);
  const [graceMonths, setGraceMonths] = useState("0");
  const [graceDays, setGraceDays] = useState("0");
  const [capitalizeGrace, setCapitalizeGrace] = useState(true);
  const [costsOpen, setCostsOpen] = useState(false);
  const [costs, setCosts] = useState<Cost[]>(() => costNames.map((description, index) => ({ id: String(index), description, value: "", financed: true, cash: false })));
  const [paidInstallments, setPaidInstallments] = useState("0");
  const [amortizationAmount, setAmortizationAmount] = useState("");
  const [anticipationDate, setAnticipationDate] = useState(todayIso());
  const [anticipationMode, setAnticipationMode] = useState("referencial");
  const [anticipationFrom, setAnticipationFrom] = useState("1");
  const [anticipationTo, setAnticipationTo] = useState("1");
  const [bankValue, setBankValue] = useState("");
  const [payoffDate, setPayoffDate] = useState(todayIso());
  const [adjustments, setAdjustments] = useState("");
  const [fine, setFine] = useState("");
  const [lateInterest, setLateInterest] = useState("");
  const [correction, setCorrection] = useState("");
  const [charges, setCharges] = useState("");
  const [cashFlows, setCashFlows] = useState<CashFlow[]>([{ date: todayIso(), value: 0, description: "Liberação" }, { date: plusDays(30), value: 0, description: "Pagamento" }]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [rules, setRules] = useState<InstitutionRule[]>([]);
  const [ruleDraft, setRuleDraft] = useState<InstitutionRule>({ id: "", bank: "", product: "", system: "PRICE", convention: "AUTO", rate: "", dueRule: "Mensal, mesmo dia", criterion: "", notes: "" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem("tf_financial_calculator_history") || "[]")); } catch { setHistory([]); }
    try { setRules(JSON.parse(localStorage.getItem("tf_financial_institution_rules") || "[]")); } catch { setRules([]); }
  }, []);

  const financedCosts = useMemo(() => costs.reduce((sum, item) => sum + (item.financed ? parseMoney(item.value) : 0), 0), [costs]);
  const cashCosts = useMemo(() => costs.reduce((sum, item) => sum + (item.cash ? parseMoney(item.value) : 0), 0), [costs]);
  const enteredPrincipal = parseMoney(principal);
  const inferredPrincipal = Math.max(0, parseMoney(assetValue) - parseMoney(downPayment) + financedCosts);
  const basePrincipal = enteredPrincipal || inferredPrincipal;
  const basePeriods = Math.max(0, Math.trunc(Number(periods) || 0));
  const enteredRate = monthlyRate.trim() ? rateValue(monthlyRate) : equivalentMonthlyRate(rateValue(annualNominal));
  const enteredPayment = parseMoney(payment);

  const solved = useMemo(() => {
    let solvedPrincipal = basePrincipal, solvedPeriods = basePeriods, solvedRate = enteredRate, solvedPayment = enteredPayment;
    if (discover === "parcela" && solvedPrincipal && solvedRate >= 0 && solvedPeriods) solvedPayment = system === "SAC" ? solvedPrincipal / solvedPeriods + solvedPrincipal * solvedRate / 100 : pricePayment(solvedPrincipal, solvedRate, solvedPeriods);
    if (discover === "taxa" && solvedPrincipal && solvedPayment && solvedPeriods) solvedRate = implicitMonthlyRate(solvedPrincipal, solvedPayment, solvedPeriods) ?? 0;
    if (discover === "financiado" && solvedPayment && solvedPeriods) solvedPrincipal = financedValueFromPayment(solvedPayment, solvedRate, solvedPeriods);
    if (discover === "prazo" && solvedPrincipal && solvedPayment) solvedPeriods = periodsFromPayment(solvedPrincipal, solvedPayment, solvedRate) || 0;
    return { principal: solvedPrincipal, periods: solvedPeriods, rate: solvedRate, payment: solvedPayment };
  }, [basePrincipal, basePeriods, enteredRate, enteredPayment, discover, system]);

  const schedule = useMemo(() => buildAmortizationSchedule({
    principal: solved.principal, monthlyRate: solved.rate, periods: solved.periods, system,
    contractDate, firstDueDate, periodicity, payment: system === "PRICE" ? solved.payment : undefined,
    graceMonths: grace ? Number(graceMonths) : 0, graceDays: grace ? Number(graceDays) : 0, capitalizeGraceInterest: capitalizeGrace,
    customPayments: system === "PERSONALIZADO" ? cashFlows.filter(flow => flow.value < 0).map(flow => ({ date: flow.date, value: Math.abs(flow.value) })) : undefined,
  }), [solved, system, contractDate, firstDueDate, periodicity, grace, graceMonths, graceDays, capitalizeGrace, cashFlows]);
  const totals = useMemo(() => operationTotals(schedule), [schedule]);
  const remainingSchedule = useMemo(() => schedule.slice(Math.max(0, Number(paidInstallments) || 0)), [schedule, paidInstallments]);
  const effectiveAnnual = solved.rate >= 0 ? effectiveAnnualRate(solved.rate) : 0;
  const net = parseMoney(netReleased) || Math.max(0, solved.principal - financedCosts);
  const cet = useMemo(() => calculateCet(net, releaseDate, schedule, costs.filter(item => item.cash && parseMoney(item.value)).map(item => ({ date: releaseDate, value: -parseMoney(item.value), description: item.description }))), [net, releaseDate, schedule, costs]);
  const error = useMemo(() => system === "PRICE" && schedule.length ? reconstructionError(solved.principal, schedule, solved.rate) : 0, [system, schedule, solved.principal, solved.rate]);
  const inconsistent = enteredPrincipal > 0 && enteredPayment > 0 && basePeriods > 0 && monthlyRate !== "" && Math.abs(pricePayment(enteredPrincipal, enteredRate, basePeriods) - enteredPayment) > 0.02;
  const scenarios = useMemo(() => amortizationScenarios(remainingSchedule, parseMoney(amortizationAmount), solved.rate), [remainingSchedule, amortizationAmount, solved.rate]);
  const selectedInstallments = useMemo(() => {
    const from = Number(anticipationFrom), to = Number(anticipationTo || anticipationFrom);
    return safeInstallmentSelection(Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index), schedule.length);
  }, [anticipationFrom, anticipationTo, schedule.length]);
  const anticipation = useMemo(() => anticipateInstallments(schedule, selectedInstallments, anticipationDate, solved.rate, convention), [schedule, selectedInstallments, anticipationDate, solved.rate, convention]);
  const anticipationTotals = useMemo(() => anticipation.reduce((sum, row) => ({ nominal: sum.nominal + row.nominal, present: sum.present + row.presentValue, discount: sum.discount + row.discount }), { nominal: 0, present: 0, discount: 0 }), [anticipation]);
  const payoff = useMemo(() => payoffEstimate(remainingSchedule, payoffDate, solved.rate, parseMoney(adjustments), { finePercent: rateValue(fine), monthlyInterestPercent: rateValue(lateInterest), correctionPercent: rateValue(correction), charges: parseMoney(charges) }), [remainingSchedule, payoffDate, solved.rate, adjustments, fine, lateInterest, correction, charges]);
  const irregularRate = useMemo(() => xirr(cashFlows), [cashFlows]);

  const flash = (text: string) => { setMessage(text); window.setTimeout(() => setMessage(""), 2600); };
  const saveHistory = () => {
    if (!solved.principal || !solved.periods || !schedule.length) return flash("Preencha os dados da operação antes de salvar.");
    const item: HistoryItem = { id: uid(), createdAt: Date.now(), operation, system, principal: solved.principal, payment: schedule[0]?.payment || solved.payment, periods: solved.periods, monthlyRate: solved.rate, annualRate: cet.annual };
    const next = [item, ...history].slice(0, 60); setHistory(next); localStorage.setItem("tf_financial_calculator_history", JSON.stringify(next)); flash("Simulação salva no histórico.");
  };
  const loadHistory = (item: HistoryItem) => { setOperation(item.operation); setSystem(item.system as AmortizationSystem); setPrincipal(formatMoney(item.principal)); setPayment(formatMoney(item.payment)); setPeriods(String(item.periods)); setMonthlyRate(String(item.monthlyRate).replace(".", ",")); setDiscover("parcela"); setTab("simulador"); };
  const saveRule = () => {
    if (!ruleDraft.bank.trim()) return flash("Informe a instituição.");
    const next = [{ ...ruleDraft, id: uid(), bank: ruleDraft.bank.trim() }, ...rules]; setRules(next); localStorage.setItem("tf_financial_institution_rules", JSON.stringify(next)); setRuleDraft({ id: "", bank: "", product: "", system: "PRICE", convention: "AUTO", rate: "", dueRule: "Mensal, mesmo dia", criterion: "", notes: "" }); flash("Regra institucional cadastrada.");
  };

  return <section className="tf-fc-page">
    <header className="tf-fc-hero">
      <div><small>ANÁLISE PROFISSIONAL DE CRÉDITO</small><h1>Calculadora Financeira</h1><p>Reconstrua operações, descubra variáveis e simule amortizações com datas e fluxos reais.</p></div>
      <button type="button" className="tf-fc-save" onClick={saveHistory}><Save /> Salvar simulação</button>
    </header>

    <nav className="tf-fc-tabs" aria-label="Módulos da calculadora">{tabs.map(([id, Icon, label]) => <button type="button" key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon /><span>{label}</span></button>)}</nav>

    {tab === "simulador" && <div className="tf-fc-layout">
      <div className="tf-fc-panel tf-fc-form-panel">
        <div className="tf-fc-section-title"><span><WalletCards /></span><div><small>CONDIÇÕES DA OPERAÇÃO</small><h2>Dados do financiamento</h2></div></div>
        <div className="tf-fc-grid three">
          <Field label="Modalidade"><select value={operation} onChange={e => setOperation(e.target.value)}>{operations.map(item => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Sistema de amortização"><select value={system} onChange={e => setSystem(e.target.value as AmortizationSystem)}><option>PRICE</option><option>SAC</option><option value="PERSONALIZADO">Personalizado / Fluxo informado</option></select></Field>
          <Field label="O que deseja descobrir?"><select value={discover} onChange={e => setDiscover(e.target.value)}><option value="parcela">Valor da parcela</option><option value="taxa">Taxa de juros</option><option value="financiado">Valor financiado</option><option value="prazo">Prazo</option><option value="cet">CET</option><option value="saldo">Saldo devedor</option><option value="antecipacao">Valor de antecipação</option></select></Field>
        </div>
        <div className="tf-fc-grid four">
          <Field label="Valor do bem"><MoneyField value={assetValue} onChange={setAssetValue} /></Field>
          <Field label="Entrada"><MoneyField value={downPayment} onChange={setDownPayment} /></Field>
          <Field label="Valor líquido liberado"><MoneyField value={netReleased} onChange={setNetReleased} /></Field>
          <Field label="Valor total financiado" help={discover === "financiado" ? "Deixe vazio: o sistema calculará." : undefined}><MoneyField value={principal} onChange={setPrincipal} disabled={discover === "financiado"} /></Field>
          <Field label="Quantidade de parcelas" help={discover === "prazo" ? "Calculado pela prestação informada." : undefined}><input type="number" min="1" value={periods} onChange={e => setPeriods(e.target.value)} disabled={discover === "prazo"} /></Field>
          <Field label="Valor da parcela" help={discover === "parcela" ? "Calculado automaticamente." : undefined}><MoneyField value={payment} onChange={setPayment} disabled={discover === "parcela"} /></Field>
          <Field label="Taxa contratual (% a.m.)" help={discover === "taxa" ? "Taxa implícita calculada pelo fluxo." : undefined}><input inputMode="decimal" placeholder="0,0000" value={monthlyRate} onChange={e => setMonthlyRate(e.target.value)} disabled={discover === "taxa"} /></Field>
          <Field label="Taxa anual nominal (% a.a.)"><input inputMode="decimal" placeholder="Opcional" value={annualNominal} onChange={e => setAnnualNominal(e.target.value)} /></Field>
          <Field label="CET informado (% a.a.)"><input inputMode="decimal" placeholder="Opcional" value={cetInformed} onChange={e => setCetInformed(e.target.value)} /></Field>
          <Field label="Data da contratação"><input type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} /></Field>
          <Field label="Data da liberação"><input type="date" value={releaseDate} onChange={e => setReleaseDate(e.target.value)} /></Field>
          <Field label="Primeiro vencimento"><input type="date" value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)} /></Field>
          <Field label="Periodicidade"><select value={periodicity} onChange={e => setPeriodicity(e.target.value as Periodicity)}><option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option><option value="semanal">Semanal</option><option value="personalizada">Personalizada</option></select></Field>
          <Field label="Convenção financeira"><select value={convention} onChange={e => setConvention(e.target.value as DayConvention)}><option value="AUTO">Automático / contrato</option><option value="30/360">30/360</option><option value="ACTUAL/365">Actual/365</option><option value="ACTUAL/360">Actual/360</option><option value="DIAS_CORRIDOS">Dias corridos</option></select></Field>
          <Field label="Parcelas já pagas"><input type="number" min="0" max={solved.periods || undefined} value={paidInstallments} onChange={e => setPaidInstallments(e.target.value)} /></Field>
        </div>
        <div className="tf-fc-inline-toggle"><label><input type="checkbox" checked={grace} onChange={e => setGrace(e.target.checked)} /><span>Possui carência</span></label>{grace && <><Field label="Meses"><input type="number" min="0" value={graceMonths} onChange={e => setGraceMonths(e.target.value)} /></Field><Field label="Dias"><input type="number" min="0" value={graceDays} onChange={e => setGraceDays(e.target.value)} /></Field><label><input type="checkbox" checked={capitalizeGrace} onChange={e => setCapitalizeGrace(e.target.checked)} /><span>Capitalizar juros</span></label></>}</div>
        <button type="button" className="tf-fc-expand" onClick={() => setCostsOpen(open => !open)}><span><Banknote /> Custos incluídos no financiamento</span><b>{formatMoney(financedCosts)}</b><ChevronDown className={costsOpen ? "open" : ""} /></button>
        {costsOpen && <div className="tf-fc-costs"><header><span>Descrição</span><span>Valor</span><span>Financiado</span><span>Pago à vista</span></header>{costs.map(item => <div key={item.id}><input value={item.description} onChange={e => setCosts(rows => rows.map(row => row.id === item.id ? { ...row, description: e.target.value } : row))} /><MoneyField value={item.value} onChange={value => setCosts(rows => rows.map(row => row.id === item.id ? { ...row, value } : row))} /><input type="checkbox" checked={item.financed} onChange={e => setCosts(rows => rows.map(row => row.id === item.id ? { ...row, financed: e.target.checked, cash: e.target.checked ? false : row.cash } : row))} /><input type="checkbox" checked={item.cash} onChange={e => setCosts(rows => rows.map(row => row.id === item.id ? { ...row, cash: e.target.checked, financed: e.target.checked ? false : row.financed } : row))} /></div>)}</div>}
      </div>
      <aside className="tf-fc-summary">
        <small>RESUMO DA OPERAÇÃO</small><h2>{operation}</h2>
        <div className="tf-fc-summary-main"><span>Prestação estimada</span><strong>{formatMoney(schedule[0]?.payment || solved.payment)}</strong><small>{solved.periods || 0} parcelas · {system}</small></div>
        <div className="tf-fc-metrics two"><Metric label="Valor financiado" value={formatMoney(solved.principal)} /><Metric label="Líquido liberado" value={formatMoney(net)} /><Metric label="Taxa contratual" value={`${rateText(solved.rate)} a.m.`} /><Metric label="Taxa efetiva" value={`${rateText(effectiveAnnual)} a.a.`} /><Metric label="CET calculado" value={`${rateText(cet.annual)} a.a.`} accent /><Metric label="Custo financeiro" value={formatMoney(totals.interest + financedCosts + cashCosts)} /></div>
        <div className={`tf-fc-validation${Math.abs(error) <= 0.02 ? " ok" : " warn"}`}><CheckCircle2 /><span><b>Conferência matemática</b><small>Erro de reconstrução: {formatMoney(error)}</small></span></div>
        {inconsistent && <div className="tf-fc-warning"><b>Os dados informados não fecham matematicamente.</b><span>Parcela informada: {formatMoney(enteredPayment)}</span><span>Parcela calculada: {formatMoney(pricePayment(enteredPrincipal, enteredRate, basePeriods))}</span><small>Verifique seguro, IOF, tarifas, carência, taxa ou fluxo irregular.</small></div>}
        <p className="tf-fc-disclaimer">Simulação referencial pela matemática financeira do contrato. O valor emitido pela instituição pode incluir regras próprias cadastradas no instrumento contratual.</p>
      </aside>
    </div>}

    {tab === "amortizacao" && <div className="tf-fc-panel"><div className="tf-fc-section-title"><span><TrendingDown /></span><div><small>AMORTIZAÇÃO EXTRAORDINÁRIA</small><h2>Tenho um valor para reduzir a dívida</h2></div></div><div className="tf-fc-grid three"><Field label="Valor da amortização"><MoneyField value={amortizationAmount} onChange={setAmortizationAmount} /></Field><Field label="Parcelas já pagas"><input type="number" min="0" value={paidInstallments} onChange={e => setPaidInstallments(e.target.value)} /></Field><Metric label="Saldo antes da amortização" value={formatMoney(remainingSchedule[0]?.openingBalance || 0)} /></div>{parseMoney(amortizationAmount) > 0 && remainingSchedule.length ? <><div className="tf-fc-scenario-grid"><Scenario title="Reduzir prazo" subtitle="Mantendo aproximadamente a prestação" payment={scenarios.reduceTerm.payment} periods={scenarios.reduceTerm.periods} total={scenarios.reduceTerm.totalFuture} interest={scenarios.reduceTerm.interest} savings={scenarios.reduceTerm.savings} /><Scenario title="Reduzir prestação" subtitle="Mantendo o prazo remanescente" payment={scenarios.reducePayment.payment} periods={scenarios.reducePayment.periods} total={scenarios.reducePayment.totalFuture} interest={scenarios.reducePayment.interest} savings={scenarios.reducePayment.savings} /></div><p className="tf-fc-disclaimer">A calculadora apresenta os dois cenários sem classificar automaticamente uma opção como melhor.</p></> : <Empty>Informe os dados no Simulador e o valor que pretende amortizar.</Empty>}</div>}

    {tab === "antecipacao" && <div className="tf-fc-panel"><div className="tf-fc-section-title"><span><ArrowDownToLine /></span><div><small>LIQUIDAÇÃO ANTECIPADA</small><h2>Quanto custa antecipar parcelas?</h2></div></div><div className="tf-fc-grid four"><Field label="Modo de cálculo"><select value={anticipationMode} onChange={e => setAnticipationMode(e.target.value)}><option value="referencial">Referencial matemático</option><option value="contratual">Contratual / perfil cadastrado</option><option value="banco">Valor informado pelo banco</option></select></Field><Field label="Pagar em"><input type="date" value={anticipationDate} onChange={e => setAnticipationDate(e.target.value)} /></Field><Field label="Da parcela"><input type="number" min="1" max={schedule.length} value={anticipationFrom} onChange={e => setAnticipationFrom(e.target.value)} /></Field><Field label="Até a parcela"><input type="number" min="1" max={schedule.length} value={anticipationTo} onChange={e => setAnticipationTo(e.target.value)} /></Field>{anticipationMode === "banco" && <Field label="Valor oficial informado"><MoneyField value={bankValue} onChange={setBankValue} /></Field>}</div><div className="tf-fc-shortcuts"><button onClick={() => { const max = schedule.length; setAnticipationFrom(String(Math.max(1, max - 2))); setAnticipationTo(String(max)); }}>Últimas 3</button><button onClick={() => { const max = schedule.length; setAnticipationFrom(String(Math.max(1, max - 5))); setAnticipationTo(String(max)); }}>Últimas 6</button><button onClick={() => { const max = schedule.length; setAnticipationFrom(String(Math.max(1, max - 11))); setAnticipationTo(String(max)); }}>Últimas 12</button><button onClick={() => { setAnticipationFrom(String(Number(paidInstallments) + 1)); setAnticipationTo(String(schedule.length)); }}>Todas restantes</button></div>{anticipation.length ? <><div className="tf-fc-metrics four"><Metric label="Valor nominal" value={formatMoney(anticipationTotals.nominal)} /><Metric label="Valor antecipado" value={formatMoney(anticipationMode === "banco" && parseMoney(bankValue) ? parseMoney(bankValue) : anticipationTotals.present)} accent /><Metric label="Economia" value={formatMoney(anticipationTotals.discount)} /><Metric label="Economia percentual" value={rateText(anticipationTotals.nominal ? anticipationTotals.discount / anticipationTotals.nominal * 100 : 0, 2)} /></div><ScheduleTable mode="anticipation" rows={anticipation} /></> : <Empty>Preencha uma operação válida para calcular a antecipação.</Empty>}<p className="tf-fc-disclaimer">O resultado referencial não representa necessariamente o boleto oficial emitido pelo banco.</p></div>}

    {tab === "quitacao" && <div className="tf-fc-panel"><div className="tf-fc-section-title"><span><CheckCircle2 /></span><div><small>LIQUIDAÇÃO TOTAL</small><h2>Quitar contrato hoje</h2></div></div><div className="tf-fc-grid four"><Field label="Parcelas já pagas"><input type="number" min="0" max={schedule.length} value={paidInstallments} onChange={e => setPaidInstallments(e.target.value)} /></Field><Field label="Data da quitação"><input type="date" value={payoffDate} onChange={e => setPayoffDate(e.target.value)} /></Field><Field label="Ajustes informados (+/-)"><MoneyField value={adjustments} onChange={setAdjustments} /></Field><Field label="Multa (%)"><input inputMode="decimal" value={fine} onChange={e => setFine(e.target.value)} placeholder="Somente se prevista" /></Field><Field label="Juros de mora (% a.m.)"><input inputMode="decimal" value={lateInterest} onChange={e => setLateInterest(e.target.value)} placeholder="Somente se previsto" /></Field><Field label="Correção (%)"><input inputMode="decimal" value={correction} onChange={e => setCorrection(e.target.value)} /></Field><Field label="Outros encargos"><MoneyField value={charges} onChange={setCharges} /></Field></div>{remainingSchedule.length ? <div className="tf-fc-payoff"><div><small>VALOR ESTIMADO PARA LIQUIDAÇÃO</small><strong>{formatMoney(payoff.estimated)}</strong><span>Na data de {dateBr(payoffDate)}</span></div><div className="tf-fc-metrics four"><Metric label="Saldo nominal" value={formatMoney(payoff.nominal)} /><Metric label="Valor presente" value={formatMoney(payoff.estimated)} /><Metric label="Redução estimada" value={formatMoney(payoff.reduction)} accent /><Metric label="Encargos vencidos" value={formatMoney(payoff.overdueCharges)} /></div></div> : <Empty>Não há parcelas remanescentes para liquidar.</Empty>}<p className="tf-fc-disclaimer">Parcelas vencidas são separadas das futuras e não recebem desconto de antecipação. Encargos só são aplicados quando informados.</p></div>}

    {tab === "tabela" && <div className="tf-fc-panel"><div className="tf-fc-section-title"><span><TableProperties /></span><div><small>EVOLUÇÃO DO CONTRATO</small><h2>Tabela completa de amortização</h2></div></div>{schedule.length ? <><div className="tf-fc-metrics four"><Metric label="Principal" value={formatMoney(solved.principal)} /><Metric label="Total das prestações" value={formatMoney(totals.paid)} /><Metric label="Juros totais" value={formatMoney(totals.interest)} accent /><Metric label="Último vencimento" value={dateBr(schedule.at(-1)?.dueDate)} /></div><ScheduleTable mode="schedule" rows={schedule} /></> : <Empty>Preencha os dados básicos para gerar a tabela.</Empty>}</div>}

    {tab === "cet" && <div className="tf-fc-stack"><div className="tf-fc-panel"><div className="tf-fc-section-title"><span><BadgePercent /></span><div><small>CUSTO EFETIVO TOTAL</small><h2>Taxas e custos reais da operação</h2></div></div><div className="tf-fc-metrics four"><Metric label="Taxa contratual" value={`${rateText(solved.rate)} a.m.`} /><Metric label="Anual efetiva equivalente" value={`${rateText(effectiveAnnual)} a.a.`} /><Metric label="CET mensal equivalente" value={`${rateText(cet.monthly)} a.m.`} accent /><Metric label="CET anual" value={`${rateText(cet.annual)} a.a.`} accent /><Metric label="Custos financiados" value={formatMoney(financedCosts)} /><Metric label="Custos pagos à vista" value={formatMoney(cashCosts)} /><Metric label="Custo financeiro total" value={formatMoney(totals.interest + financedCosts + cashCosts)} /><Metric label="Diferença taxa × CET" value={cet.annual == null ? "—" : `${rateText(cet.annual - effectiveAnnual)} a.a.`} /></div></div><div className="tf-fc-panel"><div className="tf-fc-section-title"><span><RefreshCw /></span><div><small>FLUXO PERSONALIZADO</small><h2>Taxa implícita por datas reais (XIRR)</h2></div></div><div className="tf-fc-flow-list">{cashFlows.map((flow, index) => <div key={index}><input type="date" value={flow.date} onChange={e => setCashFlows(rows => rows.map((row, i) => i === index ? { ...row, date: e.target.value } : row))} /><input value={flow.description || ""} placeholder="Descrição" onChange={e => setCashFlows(rows => rows.map((row, i) => i === index ? { ...row, description: e.target.value } : row))} /><MoneyField value={flow.value ? formatMoney(Math.abs(flow.value)) : ""} onChange={value => setCashFlows(rows => rows.map((row, i) => i === index ? { ...row, value: (row.value < 0 ? -1 : 1) * parseMoney(value) } : row))} /><select value={flow.value < 0 ? "saida" : "entrada"} onChange={e => setCashFlows(rows => rows.map((row, i) => i === index ? { ...row, value: Math.abs(row.value) * (e.target.value === "saida" ? -1 : 1) } : row))}><option value="entrada">Entrada</option><option value="saida">Saída</option></select><button onClick={() => setCashFlows(rows => rows.filter((_, i) => i !== index))}><Trash2 /></button></div>)}</div><button className="tf-fc-add" onClick={() => setCashFlows(rows => [...rows, { date: plusDays(rows.length * 30), value: 0, description: "" }])}><Plus /> Adicionar fluxo</button><div className="tf-fc-xirr"><span>Taxa interna baseada nas datas</span><strong>{irregularRate == null ? "Fluxo insuficiente" : `${rateText(irregularRate, 6)} a.a.`}</strong><small>A taxa só é apresentada quando o VPL converge para zero.</small></div></div></div>}

    {tab === "comparador" && <div className="tf-fc-panel"><div className="tf-fc-section-title"><span><Scale /></span><div><small>DECISÃO FINANCEIRA</small><h2>Reduzir prazo versus reduzir prestação</h2></div></div>{parseMoney(amortizationAmount) > 0 && remainingSchedule.length ? <div className="tf-fc-compare-table"><header><span>Indicador</span><b>Reduzir prazo</b><b>Reduzir prestação</b></header>{[["Desembolso da amortização", formatMoney(scenarios.amount), formatMoney(scenarios.amount)], ["Nova prestação", formatMoney(scenarios.reduceTerm.payment), formatMoney(scenarios.reducePayment.payment)], ["Novo prazo", `${scenarios.reduceTerm.periods} períodos`, `${scenarios.reducePayment.periods} períodos`], ["Total futuro pago", formatMoney(scenarios.reduceTerm.totalFuture), formatMoney(scenarios.reducePayment.totalFuture)], ["Juros restantes", formatMoney(scenarios.reduceTerm.interest), formatMoney(scenarios.reducePayment.interest)], ["Economia estimada", formatMoney(scenarios.reduceTerm.savings), formatMoney(scenarios.reducePayment.savings)]].map(row => <div key={row[0]}><span>{row[0]}</span><strong>{row[1]}</strong><strong>{row[2]}</strong></div>)}</div> : <Empty>Informe o valor da amortização na aba Amortização para comparar os cenários.</Empty>}<p className="tf-fc-disclaimer">A escolha depende da necessidade de caixa, prazo e estratégia do cliente. Nenhum cenário é classificado automaticamente como melhor.</p></div>}

    {tab === "historico" && <div className="tf-fc-stack"><div className="tf-fc-panel"><div className="tf-fc-section-title"><span><FileClock /></span><div><small>SIMULAÇÕES SALVAS</small><h2>Histórico da calculadora</h2></div></div>{history.length ? <div className="tf-fc-history">{history.map(item => <article key={item.id}><div><small>{new Date(item.createdAt).toLocaleString("pt-BR")}</small><strong>{item.operation}</strong><span>{item.system} · {item.periods} parcelas · {rateText(item.monthlyRate)} a.m.</span></div><div><b>{formatMoney(item.principal)}</b><span>{formatMoney(item.payment)} / parcela</span></div><button onClick={() => loadHistory(item)}>Abrir</button><button className="danger" onClick={() => { const next = history.filter(row => row.id !== item.id); setHistory(next); localStorage.setItem("tf_financial_calculator_history", JSON.stringify(next)); }}><Trash2 /></button></article>)}</div> : <Empty>As simulações salvas aparecerão aqui.</Empty>}</div><div className="tf-fc-panel"><div className="tf-fc-section-title"><span><Landmark /></span><div><small>INSTITUIÇÕES / REGRAS DE CÁLCULO</small><h2>Perfis contratuais validados</h2></div></div><div className="tf-fc-grid four"><Field label="Banco / instituição"><input value={ruleDraft.bank} onChange={e => setRuleDraft(row => ({ ...row, bank: e.target.value }))} /></Field><Field label="Produto"><input value={ruleDraft.product} onChange={e => setRuleDraft(row => ({ ...row, product: e.target.value }))} /></Field><Field label="Sistema"><select value={ruleDraft.system} onChange={e => setRuleDraft(row => ({ ...row, system: e.target.value as AmortizationSystem }))}><option>PRICE</option><option>SAC</option><option value="PERSONALIZADO">Personalizado</option></select></Field><Field label="Convenção"><select value={ruleDraft.convention} onChange={e => setRuleDraft(row => ({ ...row, convention: e.target.value as DayConvention }))}><option value="AUTO">Automático</option><option value="30/360">30/360</option><option value="ACTUAL/365">Actual/365</option><option value="ACTUAL/360">Actual/360</option><option value="DIAS_CORRIDOS">Dias corridos</option></select></Field><Field label="Taxa contratual"><input value={ruleDraft.rate} onChange={e => setRuleDraft(row => ({ ...row, rate: e.target.value }))} placeholder="% a.m." /></Field><Field label="Geração dos vencimentos"><input value={ruleDraft.dueRule} onChange={e => setRuleDraft(row => ({ ...row, dueRule: e.target.value }))} /></Field><Field label="Critério contratual conhecido"><input value={ruleDraft.criterion} onChange={e => setRuleDraft(row => ({ ...row, criterion: e.target.value }))} /></Field><Field label="Observações"><input value={ruleDraft.notes} onChange={e => setRuleDraft(row => ({ ...row, notes: e.target.value }))} /></Field></div><button className="tf-fc-add" onClick={saveRule}><Plus /> Cadastrar regra validada</button>{rules.length > 0 && <div className="tf-fc-rules">{rules.map(rule => <article key={rule.id}><Landmark /><div><strong>{rule.bank}</strong><span>{rule.product || "Produto não informado"} · {rule.system} · {rule.convention}</span><small>{rule.criterion || "Cálculo conforme parâmetros cadastrados."}</small></div><button onClick={() => { const next = rules.filter(row => row.id !== rule.id); setRules(next); localStorage.setItem("tf_financial_institution_rules", JSON.stringify(next)); }}><Trash2 /></button></article>)}</div>}<p className="tf-fc-disclaimer">Nenhuma fórmula específica de banco é presumida. Cadastre apenas critérios conferidos no contrato ou documentação oficial.</p></div></div>}
    {message && <div className="tf-fc-toast">{message}</div>}
  </section>;
}

function Scenario({ title, subtitle, payment, periods, total, interest, savings }: { title: string; subtitle: string; payment: number; periods: number; total: number; interest: number; savings: number }) {
  return <article className="tf-fc-scenario"><small>CENÁRIO</small><h3>{title}</h3><p>{subtitle}</p><strong>{periods} × {formatMoney(payment)}</strong><div><span><small>Total futuro</small><b>{formatMoney(total)}</b></span><span><small>Juros restantes</small><b>{formatMoney(interest)}</b></span><span><small>Economia estimada</small><b>{formatMoney(savings)}</b></span></div></article>;
}

function ScheduleTable({ mode, rows }: { mode: "schedule" | "anticipation"; rows: any[] }) {
  return <div className="tf-fc-table-wrap"><table className="tf-fc-table"><thead>{mode === "schedule" ? <tr><th>Parcela</th><th>Vencimento</th><th>Saldo inicial</th><th>Prestação</th><th>Juros</th><th>Amortização</th><th>Extra</th><th>Saldo final</th></tr> : <tr><th>Parcela</th><th>Vencimento</th><th>Valor nominal</th><th>Dias antecipados</th><th>Desconto</th><th>Valor antecipado</th></tr>}</thead><tbody>{rows.map(row => mode === "schedule" ? <tr key={row.installment}><td>{row.installment}</td><td>{dateBr(row.dueDate)}</td><td>{formatMoney(row.openingBalance)}</td><td><b>{formatMoney(row.payment)}</b></td><td>{formatMoney(row.interest)}</td><td>{formatMoney(row.amortization)}</td><td>{formatMoney(row.extraPayment)}</td><td>{formatMoney(row.closingBalance)}</td></tr> : <tr key={row.installment}><td>{row.installment}</td><td>{dateBr(row.dueDate)}</td><td>{formatMoney(row.nominal)}</td><td>{row.daysEarly}</td><td>{formatMoney(row.discount)}</td><td><b>{formatMoney(row.presentValue)}</b></td></tr>)}</tbody></table></div>;
}
