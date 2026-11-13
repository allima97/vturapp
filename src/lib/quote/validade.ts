import { parseISODateParts } from '$lib/date';

export function validadeDoOrcamento(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = 'valid_until' in raw ? raw.valid_until : null;
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && parseISODateParts(value)
    ? value
    : null;
}

export function validadeInformadaValida(value: unknown): boolean {
  return value == null || value === '' || validadeDoOrcamento({ valid_until: value }) !== null;
}
