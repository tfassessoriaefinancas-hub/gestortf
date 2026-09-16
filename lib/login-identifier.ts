export function loginIdentifier(input: unknown): { kind: 'email' | 'cpf'; value: string } | null {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  if (!value || value.length > 254) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { kind: 'email', value };
  if (!/^[\d.\s-]+$/.test(value)) return null;
  const cpf = value.replace(/\D/g, '');
  return cpf.length === 11 ? { kind: 'cpf', value: cpf } : null;
}
