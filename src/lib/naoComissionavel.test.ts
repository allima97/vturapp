// Testes de caracterização: pagamentos não comissionáveis (Fase 1).
// Desde a Fase 2.3 esta é a ÚNICA implementação da regra (antes havia cópias
// em vendas-kpis, relatorios/vendas, vendas/merge,
// conciliacao/_legacy e pagamentoUtils). O carregamento dos termos no servidor
// está em $lib/server/naoComissionavelTermos.
import { describe, expect, it } from 'vitest';
import {
  calcularNaoComissionavelPorVenda,
  calcularNaoComissionavelResumo,
  calcularValorPagamento,
  isFormaNaoComissionavel,
} from './naoComissionavel';

// Termos ativos em produção em 24/09/2026 (parametros_pagamentos_nao_comissionaveis)
const TERMOS = [
  'carta de credito',
  'cota',
  'cota de presente',
  'cota presente',
  'credipax',
  'credito',
  'credito de viagem',
  'credito diversos',
  'credito passageiro',
  'credito pax',
  'ficha agencia',
  'ficha agencia-recadastro',
  'vale viagem',
];

describe('isFormaNaoComissionavel', () => {
  it('casa por "contém", sem acento e sem diferença de caixa', () => {
    expect(isFormaNaoComissionavel('Crédito Pax', TERMOS)).toBe(true);
    expect(isFormaNaoComissionavel('VALE VIAGEM 2024', TERMOS)).toBe(true);
    expect(isFormaNaoComissionavel('Ficha Agência', TERMOS)).toBe(true);
  });

  it('cartão de crédito NUNCA é não comissionável, mesmo contendo "credito"', () => {
    expect(isFormaNaoComissionavel('Cartão de Crédito', TERMOS)).toBe(false);
    expect(isFormaNaoComissionavel('credito cartao visa', TERMOS)).toBe(false);
  });

  it('formas comuns comissionam', () => {
    expect(isFormaNaoComissionavel('PIX', TERMOS)).toBe(false);
    expect(isFormaNaoComissionavel('Boleto', TERMOS)).toBe(false);
    expect(isFormaNaoComissionavel('', TERMOS)).toBe(false);
    expect(isFormaNaoComissionavel('Crédito Pax', [])).toBe(false);
  });
});

describe('calcularValorPagamento', () => {
  it('usa valor_total; senão bruto − desconto (mín. 0)', () => {
    expect(calcularValorPagamento({ valor_total: 500, valor_bruto: 900 })).toBe(500);
    expect(calcularValorPagamento({ valor_bruto: 900, desconto_valor: 100 })).toBe(800);
    expect(calcularValorPagamento({ valor_bruto: 100, desconto_valor: 300 })).toBe(0);
    expect(calcularValorPagamento({})).toBe(0);
  });
});

describe('calcularNaoComissionavelResumo', () => {
  const pagamentos = [
    // não comissionável por termo, vinculado a recibo
    { venda_id: 'v1', venda_recibo_id: 'r1', forma_nome: 'Crédito Pax', valor_total: 300 },
    // não comissionável por paga_comissao = false, sem recibo
    { venda_id: 'v1', forma_nome: 'Qualquer', paga_comissao: false, valor_bruto: 250, desconto_valor: 50 },
    // comissionável
    { venda_id: 'v1', forma_nome: 'PIX', valor_total: 1000 },
    // forma aninhada + operação/plano entram no nome resolvido
    { venda_id: 'v2', forma: { nome: 'Vale' }, operacao: 'viagem', valor_total: 80 },
    // paga_comissao explícito true vence o termo? NÃO: termo continua valendo
    { venda_id: 'v3', forma_nome: 'Cota presente', paga_comissao: true, valor_total: 40 },
    // sem venda_id é ignorado
    { forma_nome: 'Crédito Pax', valor_total: 999 },
    // valor zero é ignorado
    { venda_id: 'v4', forma_nome: 'Crédito Pax', valor_total: 0 },
  ];

  it('separa por venda, por recibo e por venda sem recibo', () => {
    const r = calcularNaoComissionavelResumo(pagamentos, TERMOS);
    expect(Object.fromEntries(r.porVenda)).toEqual({ v1: 500, v2: 80, v3: 40 });
    expect(Object.fromEntries(r.porRecibo)).toEqual({ r1: 300 });
    expect(Object.fromEntries(r.porVendaSemRecibo)).toEqual({ v1: 200, v2: 80, v3: 40 });
  });

  it('calcularNaoComissionavelPorVenda = resumo.porVenda', () => {
    expect(Object.fromEntries(calcularNaoComissionavelPorVenda(pagamentos, TERMOS))).toEqual({
      v1: 500,
      v2: 80,
      v3: 40,
    });
  });
});
