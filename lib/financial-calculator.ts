import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -50, toExpPos: 50 });

export type AmortizationSystem = 'PRICE' | 'SAC' | 'PERSONALIZADO';
export type DayConvention = 'AUTO' | '30/360' | 'ACTUAL/365' | 'ACTUAL/360' | 'DIAS_CORRIDOS';
export type Periodicity = 'mensal' | 'quinzenal' | 'semanal' | 'personalizada';

export type ScheduleRow = {
  installment: number;
  dueDate: string;
  openingBalance: number;
  payment: number;
  interest: number;
  amortization: number;
  extraPayment: number;
  closingBalance: number;
};

export type CashFlow = { date: string; value: number; description?: string };

export type ScheduleInput = {
  principal: number;
  monthlyRate: number;
  periods: number;
  system: AmortizationSystem;
  contractDate?: string;
  firstDueDate?: string;
  periodicity?: Periodicity;
  payment?: number;
  graceMonths?: number;
  graceDays?: number;
  capitalizeGraceInterest?: boolean;
  payGraceInterest?: boolean;
  customPayments?: Array<{ date: string; value: number }>;
  extraordinary?: Array<{ installment?: number; date?: string; value: number }>;
};

export type AnticipationRow = {
  installment: number;
  dueDate: string;
  nominal: number;
  presentValue: number;
  discount: number;
  daysEarly: number;
};

const D = (value: Decimal.Value) => new Decimal(value || 0);
const roundMoney = (value: Decimal.Value) => D(value).toDecimalPlaces(2).toNumber();
const roundRate = (value: Decimal.Value) => D(value).toDecimalPlaces(12).toNumber();
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function pricePayment(principal: number, monthlyRate: number, periods: number): number {
  const pv = D(principal), i = D(monthlyRate).div(100), n = Math.max(0, Math.trunc(periods));
  if (!pv.isPositive() || n < 1) return 0;
  if (i.isZero()) return roundMoney(pv.div(n));
  const factor = i.plus(1).pow(n);
  return roundMoney(pv.mul(i).mul(factor).div(factor.minus(1)));
}

export function financedValueFromPayment(payment: number, monthlyRate: number, periods: number): number {
  const pmt = D(payment), i = D(monthlyRate).div(100), n = Math.max(0, Math.trunc(periods));
  if (!pmt.isPositive() || n < 1) return 0;
  if (i.isZero()) return roundMoney(pmt.mul(n));
  return roundMoney(pmt.mul(D(1).minus(i.plus(1).pow(-n))).div(i));
}

export function periodsFromPayment(principal: number, payment: number, monthlyRate: number): number | null {
  const pv = D(principal), pmt = D(payment), i = D(monthlyRate).div(100);
  if (!pv.isPositive() || !pmt.isPositive()) return null;
  if (i.isZero()) return Math.ceil(pv.div(pmt).toNumber());
  if (pmt.lte(pv.mul(i))) return null;
  const numerator = Decimal.ln(pmt.div(pmt.minus(pv.mul(i))));
  const denominator = Decimal.ln(i.plus(1));
  return Math.max(1, Math.ceil(numerator.div(denominator).toNumber()));
}

function priceEquation(principal: Decimal, payment: Decimal, periods: number, rate: Decimal) {
  if (rate.abs().lt('1e-24')) return payment.mul(periods).minus(principal);
  return payment.mul(D(1).minus(rate.plus(1).pow(-periods))).div(rate).minus(principal);
}

export function implicitMonthlyRate(principal: number, payment: number, periods: number): number | null {
  const pv = D(principal), pmt = D(payment), n = Math.trunc(periods);
  if (!pv.isPositive() || !pmt.isPositive() || n < 1 || pmt.mul(n).lt(pv)) return null;
  if (pmt.mul(n).minus(pv).abs().lt('1e-10')) return 0;

  let rate = D('0.02');
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const f = priceEquation(pv, pmt, n, rate);
    if (f.abs().lt('1e-20')) return roundRate(rate.mul(100));
    const h = D('1e-9');
    const derivative = priceEquation(pv, pmt, n, rate.plus(h)).minus(priceEquation(pv, pmt, n, rate.minus(h))).div(h.mul(2));
    if (derivative.abs().lt('1e-25')) break;
    const next = rate.minus(f.div(derivative));
    if (!next.isFinite() || next.lte('-0.999999') || next.gt(100)) break;
    if (next.minus(rate).abs().lt('1e-18')) return roundRate(next.mul(100));
    rate = next;
  }

  let low = D(0), high = D(1);
  while (priceEquation(pv, pmt, n, high).isPositive() && high.lt(100)) high = high.mul(2);
  if (priceEquation(pv, pmt, n, high).isPositive()) return null;
  for (let iteration = 0; iteration < 240; iteration += 1) {
    const mid = low.plus(high).div(2), f = priceEquation(pv, pmt, n, mid);
    if (f.abs().lt('1e-20') || high.minus(low).lt('1e-18')) return roundRate(mid.mul(100));
    if (f.isPositive()) low = mid; else high = mid;
  }
  return null;
}

export const effectiveAnnualRate = (monthlyPercent: number) => roundRate(D(monthlyPercent).div(100).plus(1).pow(12).minus(1).mul(100));
export const equivalentMonthlyRate = (annualPercent: number) => roundRate(D(annualPercent).div(100).plus(1).pow(D(1).div(12)).minus(1).mul(100));

const parseIsoDate = (value?: string) => {
  const fallback = new Date();
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(Date.UTC(fallback.getFullYear(), fallback.getMonth(), fallback.getDate()));
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};
const iso = (date: Date) => date.toISOString().slice(0, 10);
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

export function addCalendarMonths(value: string, months: number, preferredDay?: number): string {
  const date = parseIsoDate(value), originalDay = preferredDay || date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  target.setUTCDate(Math.min(originalDay, daysInMonth(target.getUTCFullYear(), target.getUTCMonth())));
  return iso(target);
}

export function addCalendarDays(value: string, days: number): string {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

export function daysBetween(from: string, to: string, convention: DayConvention = 'DIAS_CORRIDOS'): number {
  const a = parseIsoDate(from), b = parseIsoDate(to);
  if (convention === '30/360') {
    const d1 = Math.min(a.getUTCDate(), 30), d2 = Math.min(b.getUTCDate(), d1 === 30 ? 30 : 31);
    return (b.getUTCFullYear() - a.getUTCFullYear()) * 360 + (b.getUTCMonth() - a.getUTCMonth()) * 30 + d2 - d1;
  }
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function yearFraction(from: string, to: string, convention: DayConvention = 'ACTUAL/365'): number {
  const days = daysBetween(from, to, convention);
  if (convention === '30/360') return D(days).div(360).toNumber();
  if (convention === 'ACTUAL/360') return D(days).div(360).toNumber();
  return D(days).div(365).toNumber();
}

function dueDates(input: ScheduleInput): string[] {
  const periods = Math.max(0, Math.trunc(input.periods));
  const first = input.firstDueDate || addCalendarMonths(input.contractDate || iso(new Date()), 1);
  const firstDate = parseIsoDate(first);
  const firstDay = firstDate.getUTCDate();
  const preferredDay = firstDay === daysInMonth(firstDate.getUTCFullYear(), firstDate.getUTCMonth()) ? 31 : firstDay;
  return Array.from({ length: periods }, (_, index) => {
    if (input.periodicity === 'semanal') return addCalendarDays(first, index * 7);
    if (input.periodicity === 'quinzenal') return addCalendarDays(first, index * 15);
    return addCalendarMonths(first, index, preferredDay);
  });
}

export function buildAmortizationSchedule(input: ScheduleInput): ScheduleRow[] {
  const periods = Math.max(0, Math.trunc(input.periods));
  if (input.principal <= 0 || periods < 1) return [];
  if (input.system === 'PERSONALIZADO' && input.customPayments?.length) {
    let balance = D(input.principal);
    return input.customPayments.map((item, index) => {
      const opening = balance, payment = D(item.value), interest = D(0), amortization = Decimal.min(opening, payment);
      balance = Decimal.max(0, opening.minus(amortization));
      return { installment: index + 1, dueDate: item.date, openingBalance: roundMoney(opening), payment: roundMoney(payment), interest: 0, amortization: roundMoney(amortization), extraPayment: 0, closingBalance: roundMoney(balance) };
    });
  }
  const dates = dueDates(input), rate = D(input.monthlyRate).div(100);
  const graceFraction = D(input.graceMonths || 0).plus(D(input.graceDays || 0).div(30));
  let balance = D(input.principal);
  if (graceFraction.isPositive() && input.capitalizeGraceInterest !== false) balance = balance.mul(rate.plus(1).pow(graceFraction));
  const fixedPayment = D(input.payment || pricePayment(balance.toNumber(), input.monthlyRate, periods));
  const constantAmortization = balance.div(periods);
  const rows: ScheduleRow[] = [];
  for (let index = 0; index < periods; index += 1) {
    const opening = balance, interest = opening.mul(rate);
    let payment = input.system === 'SAC' ? constantAmortization.plus(interest) : fixedPayment;
    let amortization = input.system === 'SAC' ? constantAmortization : payment.minus(interest);
    if (index === periods - 1 || amortization.gt(opening)) { amortization = opening; payment = interest.plus(amortization); }
    const extra = (input.extraordinary || []).filter(item => item.installment === index + 1 || item.date === dates[index]).reduce((sum, item) => sum.plus(item.value), D(0));
    balance = Decimal.max(0, opening.minus(amortization).minus(extra));
    rows.push({
      installment: index + 1, dueDate: dates[index], openingBalance: roundMoney(opening), payment: roundMoney(payment),
      interest: roundMoney(interest), amortization: roundMoney(amortization), extraPayment: roundMoney(extra), closingBalance: roundMoney(balance),
    });
    if (balance.isZero()) break;
  }
  return rows;
}

function dailyRate(monthlyRate: number, convention: DayConvention) {
  const base = convention === 'ACTUAL/365' ? D(365).div(12) : convention === 'ACTUAL/360' ? D(30) : D(30);
  return D(monthlyRate).div(100).plus(1).pow(D(1).div(base)).minus(1);
}

export function anticipateInstallments(schedule: ScheduleRow[], installments: number[], paymentDate: string, monthlyRate: number, convention: DayConvention = 'AUTO'): AnticipationRow[] {
  const selected = new Set(installments), usedConvention = convention === 'AUTO' ? 'DIAS_CORRIDOS' : convention;
  const rate = dailyRate(monthlyRate, usedConvention);
  return schedule.filter(row => selected.has(row.installment)).map(row => {
    const daysEarly = Math.max(0, daysBetween(paymentDate, row.dueDate, usedConvention));
    const nominal = D(row.payment), present = daysEarly ? nominal.div(rate.plus(1).pow(daysEarly)) : nominal;
    return { installment: row.installment, dueDate: row.dueDate, nominal: roundMoney(nominal), presentValue: roundMoney(present), discount: roundMoney(nominal.minus(present)), daysEarly };
  });
}

function npv(rate: Decimal, cashFlows: CashFlow[]) {
  const first = cashFlows[0]?.date;
  if (!first) return D(0);
  return cashFlows.reduce((sum, flow) => sum.plus(D(flow.value).div(rate.plus(1).pow(yearFraction(first, flow.date, 'ACTUAL/365')))), D(0));
}

export function xirr(cashFlows: CashFlow[]): number | null {
  const sorted = cashFlows.filter(flow => flow.date && Number.isFinite(flow.value) && flow.value !== 0).sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2 || !sorted.some(flow => flow.value > 0) || !sorted.some(flow => flow.value < 0)) return null;
  let rate = D('0.15');
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const value = npv(rate, sorted);
    if (value.abs().lt('1e-12')) return roundRate(rate.mul(100));
    const h = D('1e-8');
    const derivative = npv(rate.plus(h), sorted).minus(npv(rate.minus(h), sorted)).div(h.mul(2));
    if (derivative.abs().lt('1e-20')) break;
    const next = rate.minus(value.div(derivative));
    if (!next.isFinite() || next.lte('-0.999999') || next.gt(10000)) break;
    if (next.minus(rate).abs().lt('1e-16')) return roundRate(next.mul(100));
    rate = next;
  }
  let low = D('-0.9999'), high = D(10), lowValue = npv(low, sorted), highValue = npv(high, sorted);
  while (lowValue.mul(highValue).isPositive() && high.lt(10000)) { high = high.mul(2); highValue = npv(high, sorted); }
  if (lowValue.mul(highValue).isPositive()) return null;
  for (let iteration = 0; iteration < 300; iteration += 1) {
    const mid = low.plus(high).div(2), value = npv(mid, sorted);
    if (value.abs().lt('1e-12') || high.minus(low).abs().lt('1e-15')) return roundRate(mid.mul(100));
    if (value.mul(lowValue).isPositive()) { low = mid; lowValue = value; } else { high = mid; highValue = value; }
  }
  return null;
}

export function calculateCet(netReleased: number, releaseDate: string, schedule: ScheduleRow[], extraFlows: CashFlow[] = []) {
  const flows: CashFlow[] = [{ date: releaseDate, value: netReleased }, ...schedule.map(row => ({ date: row.dueDate, value: -row.payment })), ...extraFlows];
  const annual = xirr(flows);
  return { annual, monthly: annual == null ? null : equivalentMonthlyRate(annual), cashFlows: flows };
}

export function amortizationScenarios(schedule: ScheduleRow[], amount: number, monthlyRate: number) {
  const first = schedule.find(row => row.closingBalance > 0) || schedule[0];
  const remainingBalance = D(first?.openingBalance || 0), amortization = Decimal.min(remainingBalance, D(amount));
  const newBalance = Decimal.max(0, remainingBalance.minus(amortization));
  const originalPayment = first?.payment || 0, originalPeriods = schedule.length;
  const shorterPeriods = newBalance.isZero() ? 0 : periodsFromPayment(newBalance.toNumber(), originalPayment, monthlyRate);
  const lowerPayment = newBalance.isZero() ? 0 : pricePayment(newBalance.toNumber(), monthlyRate, originalPeriods);
  const originalFuture = schedule.reduce((sum, row) => sum.plus(row.payment), D(0));
  const shorterFuture = D(originalPayment).mul(shorterPeriods || 0);
  const lowerFuture = D(lowerPayment).mul(originalPeriods);
  return {
    amount: roundMoney(amortization), originalPayment: roundMoney(originalPayment), originalPeriods,
    reduceTerm: { periods: shorterPeriods ?? originalPeriods, payment: roundMoney(originalPayment), totalFuture: roundMoney(shorterFuture), interest: roundMoney(Decimal.max(0, shorterFuture.minus(newBalance))), savings: roundMoney(Decimal.max(0, originalFuture.minus(shorterFuture))) },
    reducePayment: { periods: originalPeriods, payment: roundMoney(lowerPayment), totalFuture: roundMoney(lowerFuture), interest: roundMoney(Decimal.max(0, lowerFuture.minus(newBalance))), savings: roundMoney(Decimal.max(0, originalFuture.minus(lowerFuture))) },
  };
}

export function payoffEstimate(schedule: ScheduleRow[], paymentDate: string, monthlyRate: number, adjustments = 0, overdue = { finePercent: 0, monthlyInterestPercent: 0, correctionPercent: 0, charges: 0 }) {
  let nominal = D(0), present = D(0), overdueTotal = D(0);
  for (const row of schedule) {
    nominal = nominal.plus(row.payment);
    const days = daysBetween(paymentDate, row.dueDate, 'DIAS_CORRIDOS');
    if (days >= 0) present = present.plus(D(row.payment).div(dailyRate(monthlyRate, 'DIAS_CORRIDOS').plus(1).pow(days)));
    else {
      const lateDays = Math.abs(days), lateInterest = D(overdue.monthlyInterestPercent).div(100).mul(D(lateDays).div(30));
      const factor = D(1).plus(D(overdue.finePercent).div(100)).plus(lateInterest).plus(D(overdue.correctionPercent).div(100));
      const lateValue = D(row.payment).mul(factor).plus(overdue.charges);
      present = present.plus(lateValue); overdueTotal = overdueTotal.plus(lateValue.minus(row.payment));
    }
  }
  present = present.plus(adjustments);
  return { nominal: roundMoney(nominal), estimated: roundMoney(present), reduction: roundMoney(nominal.minus(present)), overdueCharges: roundMoney(overdueTotal), adjustments: roundMoney(adjustments) };
}

export function reconstructionError(principal: number, schedule: ScheduleRow[], monthlyRate: number): number {
  const i = D(monthlyRate).div(100);
  const present = schedule.reduce((sum, row, index) => sum.plus(D(row.payment).div(i.plus(1).pow(index + 1))), D(0));
  return roundMoney(present.minus(principal));
}

export function operationTotals(schedule: ScheduleRow[]) {
  const paid = schedule.reduce((sum, row) => sum.plus(row.payment), D(0));
  const interest = schedule.reduce((sum, row) => sum.plus(row.interest), D(0));
  const amortization = schedule.reduce((sum, row) => sum.plus(row.amortization), D(0));
  return { paid: roundMoney(paid), interest: roundMoney(interest), amortization: roundMoney(amortization) };
}

export function safeInstallmentSelection(raw: number[], max: number) {
  return [...new Set(raw.map(value => Math.trunc(value)).filter(value => value >= 1 && value <= max))].sort((a, b) => a - b);
}

export const percentDifference = (base: number, compared: number) => base ? roundRate(D(compared).minus(base).div(base).mul(100)) : 0;
export const normalizedPercent = (value: number) => roundRate(clamp(value, -99.999999, 1_000_000));
