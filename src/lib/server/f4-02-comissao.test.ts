/**
 * F4-02 — Comissão, estorno e invariantes
 *
 * Suíte N: cálculo puro de comissão (sem DB; função determinística)
 * Suíte O: estorno via service (Workers runtime com D1 real — arquivo separado)
 *
 * Esta suíte (N) usa vitest puro (sem Workers) porque testa funções puras.
 */

import { describe, it, expect } from 'vitest';
import { calcularComissao, roundHalfEven, type VendaDetalhe } from '$lib/server/vendas/service';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: monta VendaDetalhe mínimo para teste de comissão
// ─────────────────────────────────────────────────────────────────────────────

function vendaFixture(
  itens: Array<{ valorTotalCentavos: number; pagaComissao: boolean }>,
  valorNaoComissionadoCentavos = 0
): Pick<VendaDetalhe, 'itens' | 'valorNaoComissionadoCentavos'> {
  return {
    valorNaoComissionadoCentavos,
    itens: itens.map((it, i) => ({
      id: i + 1,
      empresaId: 1,
      vendaId: 1,
      produtoId: null,
      numeroRecibo: null,
      numeroReserva: null,
      dataServico: null,
      dataFimServico: null,
      pax: 1,
      descricao: `Item ${i + 1}`,
      tipo: 'servico',
      moeda: 'BRL',
      cambioCentavos: 10000,
      valorNetoCentavos: it.valorTotalCentavos,
      valorBrutoCentavos: it.valorTotalCentavos,
      valorTaxasCentavos: 0,
      valorTotalCentavos: it.valorTotalCentavos,
      pagaComissao: it.pagaComissao,
      notas: null,
      criadoEm: '2026-01-01T00:00:00.000Z',
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// N. Cálculo de comissão (puro)
// ─────────────────────────────────────────────────────────────────────────────

describe('N. calcularComissao — cálculo puro', () => {
  // N1. Caso simples (10% sobre R$100,00)
  it('N1. 10% sobre R$100,00 = R$10,00', () => {
    const v = vendaFixture([{ valorTotalCentavos: 10_000, pagaComissao: true }]);
    const r = calcularComissao(v, 10);
    expect(r.baseComissionavelCentavos).toBe(10_000);
    expect(r.comissaoCentavos).toBe(1_000);
    expect(r.taxaPct).toBe(10);
  });

  // N2. Arredondamento normal (resultado fracionário abaixo de .5)
  it('N2. 10% sobre R$33,33 → R$3,33 (truncado de 333.3)', () => {
    const v = vendaFixture([{ valorTotalCentavos: 3_333, pagaComissao: true }]);
    const r = calcularComissao(v, 10);
    expect(r.comissaoCentavos).toBe(333); // 333.3 → 333
  });

  // N3. Arredondamento normal (resultado fracionário acima de .5)
  it('N3. 10% sobre R$10,15 → R$1,02 (101.5 → half-even → 102)', () => {
    const v = vendaFixture([{ valorTotalCentavos: 1_015, pagaComissao: true }]);
    const r = calcularComissao(v, 10);
    // 1015 * 0.10 = 101.5 → half-even: 101 é ímpar → arredonda para cima → 102
    expect(r.comissaoCentavos).toBe(102);
  });

  // N4. Banker's rounding: .5 com piso par → arredonda para baixo (par)
  it('N4. 10% sobre R$10,05 → R$1,00 (100.5 → half-even → 100)', () => {
    const v = vendaFixture([{ valorTotalCentavos: 1_005, pagaComissao: true }]);
    const r = calcularComissao(v, 10);
    // 1005 * 0.10 = 100.5 → half-even: 100 é par → não incrementa → 100
    expect(r.comissaoCentavos).toBe(100);
  });

  // N5. Banker's rounding: .5 com piso ímpar → arredonda para cima
  it('N5. 10% sobre R$30,05 → R$3,00 (300.5 → half-even → 300)', () => {
    const v = vendaFixture([{ valorTotalCentavos: 3_005, pagaComissao: true }]);
    const r = calcularComissao(v, 10);
    // 3005 * 0.10 = 300.5 → half-even: 300 é par → não incrementa → 300
    expect(r.comissaoCentavos).toBe(300);
  });

  // N6. Itens mistos: somente os com paga_comissao=true entram na base
  it('N6. soma apenas itens comissionáveis', () => {
    const v = vendaFixture([
      { valorTotalCentavos: 5_000, pagaComissao: true },
      { valorTotalCentavos: 3_000, pagaComissao: false },
      { valorTotalCentavos: 2_000, pagaComissao: true },
    ]);
    const r = calcularComissao(v, 10);
    expect(r.baseComissionavelCentavos).toBe(7_000); // 5000 + 2000
    expect(r.comissaoCentavos).toBe(700);
    expect(r.valorNaoComissionadoCentavos).toBe(0);
  });

  // N7. Taxa 0% → comissão zero
  it('N7. taxa 0% → comissão sempre zero', () => {
    const v = vendaFixture([{ valorTotalCentavos: 100_000, pagaComissao: true }]);
    const r = calcularComissao(v, 0);
    expect(r.comissaoCentavos).toBe(0);
  });

  // N8. Taxa 100% → comissão = base
  it('N8. taxa 100% → comissão = base comissionável', () => {
    const v = vendaFixture([{ valorTotalCentavos: 50_000, pagaComissao: true }]);
    const r = calcularComissao(v, 100);
    expect(r.comissaoCentavos).toBe(50_000);
  });

  // N9. Nenhum item comissionável → base zero
  it('N9. zero itens comissionáveis → base e comissão = 0', () => {
    const v = vendaFixture([
      { valorTotalCentavos: 10_000, pagaComissao: false },
      { valorTotalCentavos: 5_000, pagaComissao: false },
    ]);
    const r = calcularComissao(v, 15);
    expect(r.baseComissionavelCentavos).toBe(0);
    expect(r.comissaoCentavos).toBe(0);
  });

  // N10. Taxa inválida > 100 → VendaError
  it('N10. taxa > 100 → VendaError VALIDACAO', () => {
    const v = vendaFixture([{ valorTotalCentavos: 1_000, pagaComissao: true }]);
    const err101 = (() => { try { calcularComissao(v, 101); } catch(e) { return e; } })(); expect(err101).toBeInstanceOf(Error); expect((err101 as { code: string }).code).toBe('VALIDACAO');
  });

  // N11. Taxa negativa → VendaError
  it('N11. taxa negativa → VendaError VALIDACAO', () => {
    const v = vendaFixture([{ valorTotalCentavos: 1_000, pagaComissao: true }]);
    const errN1 = (() => { try { calcularComissao(v, -1); } catch(e) { return e; } })(); expect(errN1).toBeInstanceOf(Error); expect((errN1 as { code: string }).code).toBe('VALIDACAO');
  });

  // N12. Taxa fracionária (10.5%)
  it('N12. 10.5% sobre R$200,00 = R$21,00 (exato)', () => {
    const v = vendaFixture([{ valorTotalCentavos: 20_000, pagaComissao: true }]);
    const r = calcularComissao(v, 10.5);
    expect(r.comissaoCentavos).toBe(2_100); // 20000 * 0.105 = 2100
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// N-rhe. roundHalfEven — cobertura de unidade
// ─────────────────────────────────────────────────────────────────────────────

describe('N-rhe. roundHalfEven', () => {
  it('0.5 → 0 (par)', () => expect(roundHalfEven(0.5)).toBe(0));
  it('1.5 → 2 (par)', () => expect(roundHalfEven(1.5)).toBe(2));
  it('2.5 → 2 (par)', () => expect(roundHalfEven(2.5)).toBe(2));
  it('3.5 → 4 (par)', () => expect(roundHalfEven(3.5)).toBe(4));
  it('4.5 → 4 (par)', () => expect(roundHalfEven(4.5)).toBe(4));
  it('2.3 → 2 (normal)', () => expect(roundHalfEven(2.3)).toBe(2));
  it('2.7 → 3 (normal)', () => expect(roundHalfEven(2.7)).toBe(3));
  it('0.0 → 0', () => expect(roundHalfEven(0.0)).toBe(0));
  it('5.0 → 5', () => expect(roundHalfEven(5.0)).toBe(5));
  it('-0.5 → 0 (negativo; Math.floor(-0.5)=-1 → ímpar → -0)', () => {
    // -0.5: floor=-1 (ímpar) → floor+1=0
    expect(roundHalfEven(-0.5)).toBe(0);
  });
});
