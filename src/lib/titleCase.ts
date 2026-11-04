const EXCECOES = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'a',
  'o',
  'as',
  'os',
  'em',
  'para',
  'por'
]);

export function titleCaseWithExceptions(valor: string): string {
  const trimmed = (valor || '').trim();
  if (!trimmed) return '';

  const palavras = trimmed.match(/\S+/g) || [];
  const formatadas: string[] = [];

  for (let index = 0; index < palavras.length; index += 1) {
    const lower = palavras[index].toLowerCase();
    formatadas.push(
      index > 0 && EXCECOES.has(lower) ? lower : lower.charAt(0).toUpperCase() + lower.slice(1)
    );
  }

  return formatadas.join(' ');
}
