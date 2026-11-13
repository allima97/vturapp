const formatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function formatMoneyInput(value: string | number): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return raw;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || Math.abs(amount) > Number.MAX_SAFE_INTEGER / 100) return raw;
  return formatter.format(amount);
}

export function moneyInputToDecimal(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const normalized = digits.replace(/^0+(?=\d)/, '');
  const cents = normalized.padStart(3, '0');
  const sign = raw.includes('-') ? '-' : '';
  return `${sign}${cents.slice(0, -2)}.${cents.slice(-2)}`;
}
