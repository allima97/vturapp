export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const TIME_ZONE_DATE_PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
const TIME_ZONE_DATE_PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>([
  [BUSINESS_TIME_ZONE, TIME_ZONE_DATE_PARTS_FORMATTER]
]);

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function partsFromTimeZone(date: Date, timeZone = BUSINESS_TIME_ZONE) {
  let formatter = TIME_ZONE_DATE_PARTS_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    TIME_ZONE_DATE_PARTS_FORMATTERS.set(timeZone, formatter);
  }

  const parts = formatter.formatToParts(date);

  return {
    year: parts.find((part) => part.type === 'year')?.value || '0000',
    month: parts.find((part) => part.type === 'month')?.value || '01',
    day: parts.find((part) => part.type === 'day')?.value || '01'
  };
}

export function todayISODateLocal(reference = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const { year, month, day } = partsFromTimeZone(reference, timeZone);
  return `${year}-${month}-${day}`;
}

export function toISODateLocal(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function toISODateUTC(date: Date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function extractISODate(value: string | Date | null | undefined) {
  if (!value) return '';
  if (value instanceof Date) return toISODateLocal(value);

  const raw = String(value).trim();
  const match = raw.match(ISO_DATE_RE);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

export function parseISODateParts(value: string | Date | null | undefined) {
  const iso = extractISODate(value);
  if (!iso) return null;

  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, iso };
}

export function parseISODateLocal(value: string | Date | null | undefined) {
  const parts = parseISODateParts(value);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day);
}

export function addDaysISODate(value: string | Date | null | undefined, days: number) {
  const parts = parseISODateParts(value);
  if (!parts) return '';

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function addMonthsISODate(value: string | Date | null | undefined, months: number) {
  const parts = parseISODateParts(value);
  if (!parts) return '';

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCMonth(date.getUTCMonth() + months);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function diffDaysISODate(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined
) {
  const startParts = parseISODateParts(start);
  const endParts = parseISODateParts(end);
  if (!startParts || !endParts) return null;

  const startMs = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const endMs = Date.UTC(endParts.year, endParts.month - 1, endParts.day);
  return Math.round((endMs - startMs) / 86_400_000);
}

export function compareISODate(
  a: string | Date | null | undefined,
  b: string | Date | null | undefined
) {
  const aIso = extractISODate(a);
  const bIso = extractISODate(b);
  if (!aIso || !bIso) return 0;
  return aIso.localeCompare(bIso);
}

export function formatISODateBR(value: string | Date | null | undefined) {
  const parts = parseISODateParts(value);
  if (!parts) return '-';
  return `${pad2(parts.day)}/${pad2(parts.month)}/${parts.year}`;
}

export function formatISODateShortBR(value: string | Date | null | undefined) {
  const parts = parseISODateParts(value);
  if (!parts) return '-';
  return `${pad2(parts.day)}/${pad2(parts.month)}`;
}

export function monthRangeFromYearMonth(year: number, month: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    inicio: `${year}-${pad2(month)}-01`,
    fim: `${year}-${pad2(month)}-${pad2(lastDay)}`
  };
}

export function monthRangeFromKey(monthKey: string | null | undefined) {
  const raw = String(monthKey || '').trim();
  const match = raw.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) return null;
  return monthRangeFromYearMonth(Number(match[1]), Number(match[2]));
}

export function currentMonthRangeISODate(reference = new Date()) {
  const today = todayISODateLocal(reference);
  const parts = parseISODateParts(today);
  if (!parts) return monthRangeFromYearMonth(reference.getFullYear(), reference.getMonth() + 1);
  return monthRangeFromYearMonth(parts.year, parts.month);
}
