// Testes de caracterização: valor que entra no ranking (Fase 1).
import { describe, expect, it } from 'vitest';
import { calcularRankingComissionavel } from './rankingComissionavel';

describe('calcularRankingComissionavel', () => {
  it('sem não comissionável: ranking = bruto e taxas intactas', () => {
    expect(calcularRankingComissionavel({ valorBruto: 1000, valorTaxas: 150 })).toEqual({
      valorRanking: 1000,
      valorTaxasRanking: 150,
      fatorValor: 1,
      fatorTaxas: 1,
      valorNaoComissionadoAplicado: 0
    });
  });

  it('com não comissionável: ranking = bruto − não comissionável − taxas; taxas zeram', () => {
    expect(
      calcularRankingComissionavel({ valorBruto: 1000, valorTaxas: 150, valorNaoComissionado: 300 })
    ).toEqual({
      valorRanking: 550,
      valorTaxasRanking: 0,
      fatorValor: 0.55,
      fatorTaxas: 0,
      valorNaoComissionadoAplicado: 450
    });
  });

  it('não comissionável maior que o bruto: ranking 0, fator 0', () => {
    const r = calcularRankingComissionavel({
      valorBruto: 100,
      valorTaxas: 10,
      valorNaoComissionado: 500
    });
    expect(r.valorRanking).toBe(0);
    expect(r.fatorValor).toBe(0);
    expect(r.valorNaoComissionadoAplicado).toBe(100);
  });

  it('valores negativos ou nulos viram 0', () => {
    expect(calcularRankingComissionavel({ valorBruto: -10, valorTaxas: null }).valorRanking).toBe(
      0
    );
  });
});
