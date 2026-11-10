export function codificarRevisaoExclusao(revisao: string): string {
  return `r:${revisao}`;
}

export function decodificarRevisaoExclusao(value: string | null): string | null {
  if (value === null || !value.startsWith('r:') || value.length > 202) return null;
  return value.slice(2);
}
