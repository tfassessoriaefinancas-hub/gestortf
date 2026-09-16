import { parseRate } from './money.ts';

export function operationNotes(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...value };
  try {
    const parsed = JSON.parse(String(value || '{}'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* Old imports also contain plain-text observations. */ }
  return value ? { observations: String(value) } : {};
}

export type CommissionRow = {
  id: number; rate_bps: number | null; value_cents: number; status: string;
  notes: string | null; expected_at?: string | null; received_at?: string | null;
};
export const isPartnerLegacyBase = (row: Pick<CommissionRow, 'notes'>) => /^base após ila parceiro gg/i.test(row.notes || '');
export const isPartnerBonus = (row: Pick<CommissionRow, 'notes'>) => /^bonificação parceiro gg/i.test(row.notes || '');
export const feeLabels = { adhesionFeeCents: 'Taxa de adesão', advisoryFeeCents: 'Taxa de assessoria', bonusCents: 'Bonificação' } as const;
export const isFee = (row: Pick<CommissionRow, 'notes'>) => Object.values(feeLabels).some(label => label === row.notes);
export const isGrossCommission = (row: CommissionRow) => !isPartnerLegacyBase(row) && !isPartnerBonus(row) && !isFee(row);
export const isPaid = (row: CommissionRow) => ['recebida', 'paga', 'historica'].includes(row.status);

/** Keep receipt IDs and their existing proportions while using the current operation totals. */
export function revenueAmounts(finance: ReturnType<typeof operationFinance>, rows: CommissionRow[]) {
  const amounts = new Map<number, number>();
  const groups = [
    { rows: rows.filter(isGrossCommission), total: finance.grossCents },
    ...Object.entries(feeLabels).map(([key, label]) => ({ rows: rows.filter(row => row.notes === label), total: finance[key as keyof typeof feeLabels] })),
  ];
  for (const group of groups) {
    const stored = group.rows.reduce((sum, row) => sum + Number(row.value_cents), 0);
    let allocated = 0;
    group.rows.forEach((row, index) => {
      const amount = index === group.rows.length - 1 ? group.total - allocated : Math.round(group.total * (stored > 0 ? Number(row.value_cents) / stored : 1 / group.rows.length));
      amounts.set(row.id, amount);
      allocated += amount;
    });
  }
  return amounts;
}

/** Resolve every screen from the operation's current rate, with legacy amounts only as fallback. */
export function operationFinance(valueCents: number, notes: Record<string, unknown>, commissions: CommissionRow[], storedIlaRate = 0) {
  const ordinary = commissions.filter(row => !isPartnerLegacyBase(row) && !isPartnerBonus(row));
  const grossRows = ordinary.filter(isGrossCommission);
  const storedRate = grossRows.find(row => row.rate_bps != null)?.rate_bps;
  const explicitRate = notes.commissionRate != null && notes.commissionRate !== '';
  const hasRate = explicitRate || storedRate != null;
  const legacyBase = commissions.filter(isPartnerLegacyBase).reduce((sum, row) => sum + Number(row.value_cents), 0);
  const storedGross = grossRows.reduce((sum, row) => sum + Number(row.value_cents), 0);
  const rate = explicitRate ? parseRate(notes.commissionRate) : storedRate != null ? Number(storedRate) / 100 : 0;
  const grossCents = hasRate ? Math.round(valueCents * rate / 100)
    : grossRows.length ? storedGross
    : legacyBase > 0 ? Math.round(legacyBase / (storedIlaRate < 100 ? 1 - storedIlaRate / 100 : 1)) : 0;
  const fees = Object.fromEntries(Object.entries(feeLabels).map(([key, label]) => [key,
    notes[key] != null ? Number(notes[key]) || 0 : ordinary.filter(row => row.notes === label).reduce((sum, row) => sum + Number(row.value_cents), 0),
  ])) as Record<keyof typeof feeLabels, number>;
  const totalCents = grossCents + fees.adhesionFeeCents + fees.advisoryFeeCents + fees.bonusCents;
  // Keep partial receipts proportional when reading an old imported amount with a corrected rate.
  const paidPart = (rows: CommissionRow[], total: number) => {
    if (!rows.length) return notes.commissionPaid ? total : 0;
    if (rows.every(isPaid)) return total;
    const storedTotal = rows.reduce((sum, row) => sum + Number(row.value_cents), 0);
    return storedTotal > 0 ? Math.round(total * rows.filter(isPaid).reduce((sum, row) => sum + Number(row.value_cents), 0) / storedTotal) : 0;
  };
  const receivedCents = paidPart(grossRows.length ? grossRows : commissions.filter(isPartnerLegacyBase), grossCents) + Object.entries(feeLabels).reduce((sum, [key, label]) => sum + paidPart(ordinary.filter(row => row.notes === label), fees[key as keyof typeof feeLabels]), 0);
  return {
    commissionRate: hasRate ? rate : valueCents > 0 ? grossCents / valueCents * 100 : 0,
    hasCommissionRate: hasRate, grossCents, totalCents, receivedCents,
    pendingCents: Math.max(0, totalCents - receivedCents),
    commissionPaid: totalCents > 0 ? receivedCents >= totalCents : Boolean(notes.commissionPaid),
    ...fees,
  };
}

/** The existing ILA -> invoice fee -> share rule, shared by the panel and partner portal. */
export function partnerFinance(gross: number, ilaRate: number, invoiceRate: number, tfShare: number) {
  const ilaValue = gross * ilaRate / 100;
  const afterIla = Math.max(0, gross - ilaValue);
  const invoiceFee = afterIla * invoiceRate / 100;
  const net = Math.max(0, afterIla - invoiceFee);
  const thiagoShare = net * tfShare / 100;
  return { gross, ilaRate, ilaValue, afterIla, invoiceRate, invoiceFee, net, tfShare, thiagoShare, partnerShare: Math.max(0, net - thiagoShare) };
}
