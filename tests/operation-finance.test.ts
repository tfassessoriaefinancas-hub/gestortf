import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, parseMoney, toCents } from '../lib/money.ts';
import { operationFinance, partnerFinance, revenueAmounts, type CommissionRow } from '../lib/operation-finance.ts';

test('reais keep cents in Brazilian and numeric input', () => {
  for (const [input, expected] of [['R$ 469,38', 469.38], ['1.261,59', 1261.59], ['17.900,00', 17900], ['42650.00', 42650]] as const) {
    assert.equal(parseMoney(input), expected);
    assert.equal(toCents(input), Math.round(expected * 100));
    assert.match(formatMoney(expected), /^R\$\s[\d.]+,\d{2}$/);
  }
});

test('the current rate overrides imported partner totals without including advisory fees', () => {
  const rows: CommissionRow[] = [
    { id: 1, rate_bps: 600, value_cents: 255900, status: 'recebida', notes: 'Comissão' },
    { id: 2, rate_bps: null, value_cents: 100000, status: 'recebida', notes: 'Taxa de assessoria' },
    { id: 3, rate_bps: null, value_cents: 189000, status: 'recebida', notes: 'Base após ILA parceiro GG' },
  ];
  const current = operationFinance(4265000, { commissionRate: 4, advisoryFeeCents: 100000, sourceCommissionCents: 255900 }, rows, 26.06);
  assert.equal(current.grossCents, 170600);
  assert.equal(current.totalCents, 270600);
  const partner = partnerFinance(current.grossCents / 100, 26.06, 2, 50);
  assert.equal(formatMoney(partner.afterIla).replace(/\s/g, ''), 'R$1.261,42');
  assert.equal(formatMoney(partner.partnerShare).replace(/\s/g, ''), 'R$618,09');
  assert.equal(operationFinance(4265000, { commissionRate: 0 }, rows).grossCents, 0);
});

test('partial receipts and imported amounts survive without a new distribution rule', () => {
  const rows: CommissionRow[] = [
    { id: 1, rate_bps: 400, value_cents: 20000, status: 'recebida', notes: 'Comissão · Parcela 1/2' },
    { id: 2, rate_bps: 400, value_cents: 20000, status: 'prevista', notes: 'Comissão · Parcela 2/2' },
  ];
  const partial = operationFinance(1000000, { commissionRate: 4, commissionPaid: true }, rows);
  assert.equal(partial.receivedCents, 20000);
  assert.equal(partial.pendingCents, 20000);
  assert.equal(partial.commissionPaid, false);
  const corrected = operationFinance(1000000, { commissionRate: 6 }, rows);
  assert.deepEqual([...revenueAmounts(corrected, rows)], [[1, 30000], [2, 30000]]);
  const legacy = operationFinance(1000000, {}, [{ id: 3, rate_bps: null, value_cents: 46938, status: 'historica', notes: 'Comissão importada' }]);
  assert.equal(legacy.grossCents, 46938);
  assert.equal(legacy.receivedCents, 46938);
  const partnerLegacy = operationFinance(1000000, {}, [{ id: 4, rate_bps: null, value_cents: 73400, status: 'recebida', notes: 'Base após ILA parceiro GG' }], 26.6);
  assert.equal(partnerLegacy.grossCents, 100000);
  assert.equal(partnerLegacy.receivedCents, 100000);
});
