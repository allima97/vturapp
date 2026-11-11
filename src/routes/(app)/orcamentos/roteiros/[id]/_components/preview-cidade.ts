export function nomeCidadeNoPdf(cidade: string): string {
  const nome = cidade.split(',')[0].trim();
  return nome || cidade.trim();
}
