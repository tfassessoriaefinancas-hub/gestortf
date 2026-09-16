const reais = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function parseMoney(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const clean = String(value ?? '').trim().replace(/[^\d,.-]/g, '');
  const normalized = clean.includes(',')
    ? clean.replace(/\./g, '').replace(',', '.')
    : /^-?\d{1,3}(\.\d{3})+$/.test(clean) ? clean.replace(/\./g, '') : clean;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export const toCents = (value: unknown) => Math.round((parseMoney(value) + Number.EPSILON) * 100);
export const formatMoney = (value: number) => reais.format(Number.isFinite(value) ? value : 0);
export const formatMoneyInput = (value: unknown) => value === '' || value == null ? '' : formatMoney(parseMoney(value));
export const moneyToStorage = (value: unknown) => value === '' || value == null ? '' : parseMoney(value);

export function parseRate(value: unknown): number {
  const rate = Number(String(value ?? 0).replace('%', '').replace(',', '.'));
  return Number.isFinite(rate) ? Math.max(0, Math.min(100, rate)) : 0;
}
