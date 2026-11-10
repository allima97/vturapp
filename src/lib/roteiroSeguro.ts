export type SeguroPasseioLike = {
  tipo?: string | null;
  passeio?: string | null;
  cidade?: string | null;
  fornecedor?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
};

const MONTH_SHORT_PT_BR = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez'
] as const;
const BUDGET_ITEM_SEPARATOR_RE = /^(\s+|\/|-|\(|\)|,|\+)$/;
const BUDGET_ITEM_ACRONYM_RE = /^[A-Z0-9]{2,4}$/;
const NUMERIC_TEXT_RE = /^\d+$/;
const LOWER_CASE_BUDGET_ITEM_WORDS = new Set([
  'a',
  'à',
  'ao',
  'aos',
  'as',
  'às',
  'com',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'na',
  'nas',
  'no',
  'nos',
  'o',
  'os',
  'ou',
  'para',
  'por',
  'sem',
  'um',
  'uma',
  'uns',
  'umas'
]);

function textValue(value?: string | null) {
  return String(value || '').trim();
}

function normalizeText(value?: string | null) {
  return textValue(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function formatBudgetItemText(value?: string | null) {
  const raw = textValue(value);
  if (!raw) return '';
  let seenWord = false;
  return raw
    .split(/(\s+|\/|-|\(|\)|,|\+)/)
    .map((part) => {
      if (!part || BUDGET_ITEM_SEPARATOR_RE.test(part)) return part;
      if (BUDGET_ITEM_ACRONYM_RE.test(part)) return part;
      if (NUMERIC_TEXT_RE.test(part)) return part;
      const lower = part.toLowerCase();
      const shouldLower = seenWord && LOWER_CASE_BUDGET_ITEM_WORDS.has(lower);
      seenWord = true;
      if (shouldLower) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

function toDateOrNull(value?: string | null) {
  const raw = textValue(value);
  if (!raw) return null;
  const date = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatShortDatePtBr(value?: string | null) {
  const date = toDateOrNull(value);
  if (!date) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = MONTH_SHORT_PT_BR[date.getMonth()] || '';
  return month ? `${day} de ${month}` : '';
}

function calcDiarias(dataInicio?: string | null, dataFim?: string | null) {
  const start = toDateOrNull(dataInicio);
  const end = toDateOrNull(dataFim || dataInicio);
  if (!start || !end) return 0;
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (endMs < startMs) return 0;
  const diffDays = Math.round((endMs - startMs) / 86400000);
  return diffDays + 1;
}

export function isSeguroPasseioLike(item?: SeguroPasseioLike | null) {
  const tipo = normalizeText(item?.tipo);
  if (tipo.includes('seguro')) return true;

  const passeio = normalizeText(item?.passeio);
  const cidade = normalizeText(item?.cidade);
  const fornecedor = normalizeText(item?.fornecedor);

  if (passeio.includes('seguro') && (passeio.includes('viagem') || passeio.includes('travel')))
    return true;

  const providerHint =
    fornecedor.includes('assist card') ||
    fornecedor.includes('assistcard') ||
    fornecedor.includes('intermac') ||
    fornecedor.includes('segur');

  if (!cidade && providerHint) return true;
  if (!cidade && passeio.includes('inter plus')) return true;
  return false;
}

export function buildSeguroViagemIncludeText(item?: SeguroPasseioLike | null) {
  const rawPasseio = textValue(item?.passeio);
  const normalizedPasseio = normalizeText(rawPasseio);
  const passeioSemPrefixo = normalizedPasseio.startsWith('seguro viagem')
    ? rawPasseio.replace(/^seguro\s+viagem\s*/i, '').trim()
    : rawPasseio;
  const passeioNome = formatBudgetItemText(passeioSemPrefixo);
  const seguroNome = passeioNome ? `Seguro viagem ${passeioNome}` : 'Seguro viagem';

  const dataInicio = textValue(item?.data_inicio);
  const dataFim = textValue(item?.data_fim || item?.data_inicio);
  const inicioLabel = formatShortDatePtBr(dataInicio);
  const fimLabel = formatShortDatePtBr(dataFim);
  const diarias = calcDiarias(dataInicio, dataFim);

  if (inicioLabel && fimLabel) {
    const diariasLabel = diarias > 0 ? ` (${diarias} ${diarias === 1 ? 'diária' : 'diárias'})` : '';
    return `${seguroNome} válido de ${inicioLabel} - ${fimLabel}${diariasLabel}.`;
  }

  if (inicioLabel) {
    const diariasLabel = diarias > 0 ? ` (${diarias} ${diarias === 1 ? 'diária' : 'diárias'})` : '';
    return `${seguroNome} válido em ${inicioLabel}${diariasLabel}.`;
  }

  return `${seguroNome}.`;
}

export function extractSeguroViagemIncludeLinesFromPasseios(items: SeguroPasseioLike[]) {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const item of items || []) {
    if (!isSeguroPasseioLike(item)) continue;
    const line = buildSeguroViagemIncludeText(item);
    const key = normalizeText(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }

  return lines;
}

export function mergeUniqueTextLines(baseText: string, newLines: string[]) {
  const existing: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of String(baseText || '')
    .replace(/\r/g, '\n')
    .split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    existing.push(line);
    const key = normalizeText(line);
    if (key) seen.add(key);
  }

  const merged = [...existing];

  for (const rawLine of newLines || []) {
    const line = String(rawLine || '').trim();
    if (!line) continue;
    const key = normalizeText(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(line);
  }

  return merged.join('\n');
}
