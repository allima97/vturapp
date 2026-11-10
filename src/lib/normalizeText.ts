export type NormalizeTextOptions = {
  collapseWhitespace?: boolean;
  trim?: boolean;
};

export function normalizeText(value?: string | null, options: NormalizeTextOptions = {}) {
  let normalized = (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (options.collapseWhitespace) {
    normalized = normalized.replace(/\s+/g, ' ');
  }

  if (options.trim) {
    normalized = normalized.trim();
  }

  return normalized;
}

const LOWER_CASE_WORDS = new Set([
  'de',
  'da',
  'do',
  'dos',
  'a',
  'e',
  'o',
  'em',
  'na',
  'no',
  'nas',
  'nos',
  'por',
  'com',
  'para',
  'sem',
  'sob',
  'entre',
  'até',
  'após',
  'antes',
  'desde',
  'perante',
  'contra',
  'sobre',
  'trás',
  'via'
]);

/**
 * Converte um nome para Title Case (primeira letra maiúscula de cada palavra),
 * mantendo em minúsculo as preposições/conjunções comuns em português
 * (exceto quando são a primeira palavra).
 */
export function titleCaseNome(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const words = raw.toLowerCase().match(/\S+/g) || [];
  const formatted: string[] = [];

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    formatted.push(
      index > 0 && LOWER_CASE_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)
    );
  }

  return formatted.join(' ');
}
