import { extractISODate, formatISODateBR, formatISODateShortBR } from '$lib/date';

/**
 * Formatadores utilitários — VTUR
 *
 * Uso:
 * ```ts
 * import { formatCurrency, formatDate, formatPhone } from '$lib/utils/formatters';
 * ```
 */

// ─── Moeda ────────────────────────────────────────────────────────────────────

const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const NUMBER_FORMATTERS = new Map<number, Intl.NumberFormat>();
const DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR');
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});
const DATE_SHORT_FORMATTER = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const MONTH_LONG_UTC_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  timeZone: 'UTC'
});
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const NON_DIGIT_PATTERN = /\D/g;
const CPF_FIRST_BLOCK_PATTERN = /(\d{3})(\d)/;
const CPF_LAST_BLOCK_PATTERN = /(\d{3})(\d{1,2})$/;
const CNPJ_FIRST_BLOCK_PATTERN = /(\d{2})(\d)/;
const CNPJ_MIDDLE_BLOCK_PATTERN = /(\d{3})(\d)/;
const CNPJ_SLASH_BLOCK_PATTERN = /(\d{3})(\d)/;
const CNPJ_LAST_BLOCK_PATTERN = /(\d{4})(\d{1,2})$/;
const PHONE_DDD_PATTERN = /(\d{2})(\d)/;
const PHONE_EIGHT_DIGIT_PATTERN = /(\d{4})(\d{1,4})$/;
const PHONE_NINE_DIGIT_PATTERN = /(\d{5})(\d{1,4})$/;
const CEP_BLOCK_PATTERN = /(\d{5})(\d{1,3})$/;

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '-';
  return BRL_CURRENCY_FORMATTER.format(value);
}

export function formatCurrencyShort(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '-';
  if (Math.abs(value) >= 1_000_000)
    return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (Math.abs(value) >= 1_000) return `R$ ${(value / 1_000).toFixed(1).replace('.', ',')}k`;
  return formatCurrency(value);
}

// ─── Número ───────────────────────────────────────────────────────────────────

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null || isNaN(value)) return '-';
  let formatter = NUMBER_FORMATTERS.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    NUMBER_FORMATTERS.set(decimals, formatter);
  }
  return formatter.format(value);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value == null || isNaN(value)) return '-';
  return `${value.toFixed(decimals).replace('.', ',')}%`;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-';

  if (typeof value === 'string' && extractISODate(value)) {
    return formatISODateBR(value);
  }

  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '-';
  return DATE_FORMATTER.format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';

  if (typeof value === 'string' && ISO_DATE_PATTERN.test(value.trim())) {
    return formatISODateBR(value);
  }

  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '-';
  return DATE_TIME_FORMATTER.format(d);
}

export function formatDateShort(value: string | Date | null | undefined): string {
  if (!value) return '-';

  if (typeof value === 'string' && extractISODate(value)) {
    return formatISODateShortBR(value);
  }

  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '-';
  return DATE_SHORT_FORMATTER.format(d);
}

export function formatYearMonthLabel(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!YEAR_MONTH_PATTERN.test(raw)) return raw || '-';

  const [yearText, monthText] = raw.split('-');
  const monthDate = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, 1));
  if (isNaN(monthDate.getTime())) return raw;

  const monthName = MONTH_LONG_UTC_FORMATTER.format(monthDate);
  const monthTitle = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const yearShort = yearText.slice(-2);
  return `${monthTitle}-${yearShort}`;
}

// ─── Documentos ───────────────────────────────────────────────────────────────

export function formatCPF(value: string | null | undefined): string {
  if (!value) return '-';
  const n = value.replace(NON_DIGIT_PATTERN, '').slice(0, 11);
  return n
    .replace(CPF_FIRST_BLOCK_PATTERN, '$1.$2')
    .replace(CPF_FIRST_BLOCK_PATTERN, '$1.$2')
    .replace(CPF_LAST_BLOCK_PATTERN, '$1-$2');
}

export function formatCNPJ(value: string | null | undefined): string {
  if (!value) return '-';
  const n = value.replace(NON_DIGIT_PATTERN, '').slice(0, 14);
  return n
    .replace(CNPJ_FIRST_BLOCK_PATTERN, '$1.$2')
    .replace(CNPJ_MIDDLE_BLOCK_PATTERN, '$1.$2')
    .replace(CNPJ_SLASH_BLOCK_PATTERN, '$1/$2')
    .replace(CNPJ_LAST_BLOCK_PATTERN, '$1-$2');
}

export function formatPhone(value: string | null | undefined): string {
  if (!value) return '-';
  const n = value.replace(NON_DIGIT_PATTERN, '');
  if (n.length <= 10) {
    return n
      .slice(0, 10)
      .replace(PHONE_DDD_PATTERN, '($1) $2')
      .replace(PHONE_EIGHT_DIGIT_PATTERN, '$1-$2');
  }
  return n
    .slice(0, 11)
    .replace(PHONE_DDD_PATTERN, '($1) $2')
    .replace(PHONE_NINE_DIGIT_PATTERN, '$1-$2');
}

export function formatCEP(value: string | null | undefined): string {
  if (!value) return '-';
  const n = value.replace(NON_DIGIT_PATTERN, '').slice(0, 8);
  return n.replace(CEP_BLOCK_PATTERN, '$1-$2');
}

// ─── Texto ────────────────────────────────────────────────────────────────────

/** Trunca um texto com reticências */
export function truncate(value: string | null | undefined, max = 60): string {
  if (!value) return '-';
  return value.length > max ? value.slice(0, max) + '…' : value;
}

/** Primeiras letras de cada palavra (iniciais) */
export function initials(name: string | null | undefined, max = 2): string {
  if (!name) return '?';
  const words = name.trim().match(/\S+/g) || [];
  let result = '';

  for (let index = 0; index < words.length && index < max; index += 1) {
    result += words[index][0]?.toUpperCase() ?? '';
  }

  return result;
}
