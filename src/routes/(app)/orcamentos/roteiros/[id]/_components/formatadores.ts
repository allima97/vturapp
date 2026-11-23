import { formatNumber } from '$lib/utils/formatters';

export function formatBRL(value: number | null | undefined): string {
  if (value == null) return '';
  return formatNumber(value, 2);
}
