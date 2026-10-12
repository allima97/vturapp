/** Formatação do Relatório de Performance (valores compactos: R$ 1.9M, R$ 62.1K, 28.6%). */
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function moedaCurta(valor: number) {
  const v = Number(valor || 0);
  const abs = Math.abs(v);
  const sinal = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sinal}R$ ${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (abs >= 1_000) return `${sinal}R$ ${(abs / 1_000).toFixed(1).replace('.', ',')}K`;
  return `${sinal}R$ ${abs.toFixed(0)}`;
}

export function valorCurto(valor: number) {
  return moedaCurta(valor).replace('R$ ', '');
}

export function moeda(valor: number | null | undefined) {
  return valor == null ? '—' : BRL.format(Number(valor));
}

export function percentual(valor: number | null | undefined, casas = 1) {
  if (valor == null || !Number.isFinite(valor)) return '—';
  return `${valor.toFixed(casas).replace('.', ',')}%`;
}

export function inteiro(valor: number) {
  return new Intl.NumberFormat('pt-BR').format(Number(valor || 0));
}
