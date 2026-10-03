import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addCalendarMonths, anticipateInstallments, buildAmortizationSchedule, calculateCet,
  effectiveAnnualRate, financedValueFromPayment, implicitMonthlyRate, payoffEstimate,
  periodsFromPayment, pricePayment, reconstructionError, xirr,
} from '../lib/financial-calculator.ts';

test('PRICE reconstructs payment, rate, principal and term with financial precision', () => {
  const payment = pricePayment(25_000, 1.8, 36);
  assert.equal(payment, 949.6);
  assert.ok(Math.abs((implicitMonthlyRate(25_000, payment, 36) || 0) - 1.8) < 0.0001);
  assert.ok(Math.abs(financedValueFromPayment(payment, 1.8, 36) - 25_000) < 0.2);
  assert.equal(periodsFromPayment(25_000, payment, 1.8), 36);
  assert.ok(Math.abs(effectiveAnnualRate(1.8) - 23.8718) < 0.001);
});

test('calendar generation preserves the contractual day without creating invalid dates', () => {
  assert.equal(addCalendarMonths('2026-01-31', 1, 31), '2026-02-28');
  assert.equal(addCalendarMonths('2028-01-31', 1, 31), '2028-02-29');
  assert.equal(addCalendarMonths('2026-01-31', 2, 31), '2026-03-31');
});

test('PRICE and SAC schedules close the outstanding balance', () => {
  for (const system of ['PRICE', 'SAC'] as const) {
    const rows = buildAmortizationSchedule({ principal: 42_650, monthlyRate: 2.1, periods: 48, system, firstDueDate: '2026-11-03' });
    assert.equal(rows.length, 48);
    assert.equal(rows.at(-1)?.closingBalance, 0);
    assert.ok(Math.abs(reconstructionError(42_650, rows, 2.1)) <= 0.2 || system === 'SAC');
  }
});

test('anticipation discounts future interest using an equivalent daily rate', () => {
  const rows = buildAmortizationSchedule({ principal: 20_000, monthlyRate: 2, periods: 24, system: 'PRICE', firstDueDate: '2026-11-03' });
  const result = anticipateInstallments(rows, [24], '2026-10-03', 2, 'DIAS_CORRIDOS')[0];
  assert.ok(result.daysEarly > 600);
  assert.ok(result.presentValue < result.nominal);
  assert.equal(Number((result.nominal - result.presentValue).toFixed(2)), result.discount);
});

test('XIRR and CET converge only for valid opposite-sign cash flows', () => {
  const rate = xirr([{ date: '2026-01-01', value: 10_000 }, { date: '2027-01-01', value: -11_000 }]);
  assert.ok(rate != null && Math.abs(rate - 10) < 0.000001);
  assert.equal(xirr([{ date: '2026-01-01', value: 100 }, { date: '2027-01-01', value: 50 }]), null);
  const schedule = buildAmortizationSchedule({ principal: 10_000, monthlyRate: 1.5, periods: 12, system: 'PRICE', firstDueDate: '2026-02-01' });
  const cet = calculateCet(9_500, '2026-01-01', schedule);
  assert.ok(cet.annual != null && cet.monthly != null && cet.annual > effectiveAnnualRate(1.5));
});

test('payoff does not discount overdue installments and applies only informed charges', () => {
  const schedule = buildAmortizationSchedule({ principal: 5_000, monthlyRate: 2, periods: 6, system: 'PRICE', firstDueDate: '2026-01-01' });
  const plain = payoffEstimate(schedule, '2026-03-15', 2);
  const charged = payoffEstimate(schedule, '2026-03-15', 2, 0, { finePercent: 2, monthlyInterestPercent: 1, correctionPercent: 0, charges: 0 });
  assert.ok(charged.estimated > plain.estimated);
  assert.ok(charged.overdueCharges > 0);
});
