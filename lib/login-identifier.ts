export function loginIdentifier(input: unknown): { kind: 'email' | 'cpf' | 'login'; value: string } | null {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  if (!value || value.length > 254) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { kind: 'email', value };
  if (/^[\d.\s-]+$/.test(value)) {
    const cpf = value.replace(/\D/g, '');
    return cpf.length === 11 ? { kind: 'cpf', value: cpf } : null;
  }
  return /^[\p{L}\d]+(?:[ _][\p{L}\d]+)+$/u.test(value) && value.length <= 80 ? { kind: 'login', value } : null;
}
