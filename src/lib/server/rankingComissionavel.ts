import { toFiniteNumber as toNumber } from '$lib/utils/values';

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function calcularRankingComissionavel(params: {
  valorBruto?: number | null;
  valorTaxas?: number | null;
  valorNaoComissionado?: number | null;
}) {
  const valorBruto = Math.max(0, toNumber(params.valorBruto));
  const valorTaxas = Math.max(0, toNumber(params.valorTaxas));
  const valorNaoComissionado = Math.max(0, toNumber(params.valorNaoComissionado));

  if (valorNaoComissionado <= 0) {
    return {
      valorRanking: valorBruto,
      valorTaxasRanking: valorTaxas,
      fatorValor: 1,
      fatorTaxas: 1,
      valorNaoComissionadoAplicado: 0
    };
  }

  const valorRecebidoComissionavel = Math.max(0, valorBruto - valorNaoComissionado);
  const valorRanking = roundMoney(Math.max(0, valorRecebidoComissionavel - valorTaxas));

  return {
    valorRanking,
    valorTaxasRanking: 0,
    fatorValor: valorBruto > 0 ? Math.max(0, Math.min(1, valorRanking / valorBruto)) : 0,
    fatorTaxas: 0,
    valorNaoComissionadoAplicado: roundMoney(Math.max(0, valorBruto - valorRanking))
  };
}
