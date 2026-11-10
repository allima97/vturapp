// Testes de caracterização: rateio de recibos entre vendedores (Fase 1).
// A cópia antiga não usada ($lib/vendasRateio) foi removida na Fase 2.3,
// depois de confirmada a equivalência com este módulo.
import { describe, expect, it } from 'vitest';
import * as rateio from './rateio';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const venda = {
  id: 'venda-1',
  vendedor_id: A,
  vendas_recibos: [
    { id: 'rec-1', valor_total: 1000, valor_taxas: 100 },
    { id: 'rec-2', valor_total: 500, valor_taxas: 50 }
  ]
};

const rateioMap = new Map([
  [
    'rec-1',
    {
      venda_recibo_id: 'rec-1',
      vendedor_origem_id: A,
      vendedor_destino_id: B,
      percentual_origem: 60,
      percentual_destino: 40,
      ativo: true
    }
  ]
]) as Map<string, rateio.RateioRow>;

describe('cloneReciboWithFactor', () => {
  it('escala todos os campos financeiros e gera id sintético', () => {
    const c = rateio.cloneReciboWithFactor(
      { id: 'rec-1', valor_total: 1000, valor_taxas: 100, valor_du: 33.33, valor_rav: null },
      0.4,
      B
    );
    expect(c).toMatchObject({
      id: `rec-1::rateio:${B}`,
      rateio_source_recibo_id: 'rec-1',
      rateio_vendedor_id: B,
      valor_total: 400,
      valor_taxas: 40,
      valor_du: 13.33,
      valor_rav: null
    });
  });
});

describe('applyRateioToSalesForScopedVendedores', () => {
  it('sem escopo: divide o recibo com rateio 60/40 e mantém o outro com o vendedor de origem', () => {
    const out = rateio.applyRateioToSalesForScopedVendedores([venda], rateioMap);
    const porVendedor = Object.fromEntries(
      out.map((v) => [v.vendedor_id, v.vendas_recibos!.map((r) => [r.id, r.valor_total])])
    );
    expect(porVendedor).toEqual({
      [A]: [
        [`rec-1::rateio:${A}`, 600],
        ['rec-2', 500]
      ],
      [B]: [[`rec-1::rateio:${B}`, 400]]
    });
    const a = out.find((v) => v.vendedor_id === A)!;
    expect(a.rateio_source_bruto_total).toBe(1500);
    expect(a.rateio_scope_bruto_total).toBe(1100);
    expect(a.rateio_scope_factor).toBeCloseTo(1100 / 1500, 10);
  });

  it('com escopo no vendedor destino: só a parte dele aparece', () => {
    const out = rateio.applyRateioToSalesForScopedVendedores([venda], rateioMap, [B]);
    expect(out).toHaveLength(1);
    expect(out[0].vendedor_id).toBe(B);
    expect(out[0].vendas_recibos!.map((r) => r.valor_total)).toEqual([400]);
  });

  it('escopo em vendedor sem participação: venda some', () => {
    expect(rateio.applyRateioToSalesForScopedVendedores([venda], rateioMap, [C])).toEqual([]);
  });

  it('rateio inativo é ignorado', () => {
    const inativo = new Map([['rec-1', { ...rateioMap.get('rec-1')!, ativo: false }]]);
    const out = rateio.applyRateioToSalesForScopedVendedores([venda], inativo);
    expect(out).toHaveLength(1);
    expect(out[0].vendas_recibos!.map((r) => r.id)).toEqual(['rec-1', 'rec-2']);
  });
});
