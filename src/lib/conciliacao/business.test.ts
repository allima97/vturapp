// Testes de caracterização das regras de conciliação (Fase 1).
// Travam o comportamento ATUAL — portado do vturapp original. Se algum teste
// quebrar, a regra de negócio mudou: confirmar com o André antes de ajustar.
import { describe, expect, it } from 'vitest';
import {
  buildConciliacaoMetrics,
  calcularPercentualComissaoLoja,
  calcularValorVendaReal,
  classificarFaixaComissao,
  isConciliacaoEfetivada,
  isConciliacaoImportavel,
  normalizeConciliacaoStatus,
  resolveConciliacaoComissaoLoja,
  resolveConciliacaoStatus,
  temValorFinanceiro
} from './business';

describe('status de conciliação', () => {
  it('prioridade ESTORNO > BAIXA > OPFAX > OUTRO, sem acento/maiúsculas', () => {
    expect(normalizeConciliacaoStatus('Baixa de estorno')).toBe('ESTORNO');
    expect(normalizeConciliacaoStatus('baixa')).toBe('BAIXA');
    expect(normalizeConciliacaoStatus('OPFAX pendente')).toBe('OPFAX');
    expect(normalizeConciliacaoStatus('qualquer coisa')).toBe('OUTRO');
    expect(normalizeConciliacaoStatus('')).toBe('OUTRO');
    expect(normalizeConciliacaoStatus(null)).toBe('OUTRO');
  });

  it('descrição tem prioridade sobre o campo status', () => {
    expect(resolveConciliacaoStatus({ status: 'BAIXA', descricao: 'OPFAX' })).toBe('OPFAX');
    expect(resolveConciliacaoStatus({ status: 'BAIXA', descricao: 'texto livre' })).toBe('BAIXA');
  });

  it('só BAIXA é venda efetivada; BAIXA/OPFAX/ESTORNO são importáveis', () => {
    expect(isConciliacaoEfetivada({ descricao: 'BAIXA' })).toBe(true);
    expect(isConciliacaoEfetivada({ descricao: 'OPFAX' })).toBe(false);
    expect(isConciliacaoImportavel({ descricao: 'ESTORNO' })).toBe(true);
    expect(isConciliacaoImportavel({ descricao: 'OPFAX' })).toBe(true);
    expect(isConciliacaoImportavel({ descricao: 'outro' })).toBe(false);
  });
});

describe('valores', () => {
  it('valor_venda_real = lançamentos − descontos − abatimentos (taxas NÃO entram)', () => {
    expect(
      calcularValorVendaReal({
        valorLancamentos: 1000,
        valorTaxas: 150,
        valorDescontos: 50,
        valorAbatimentos: 25
      })
    ).toBe(925);
    expect(calcularValorVendaReal({ valorLancamentos: 100, valorDescontos: 300 })).toBe(0);
  });

  it('percentual da loja = saldo / venda_real × 100 (null quando base ou saldo <= 0)', () => {
    expect(calcularPercentualComissaoLoja({ valorVendaReal: 1000, valorSaldo: 125 })).toBe(12.5);
    expect(calcularPercentualComissaoLoja({ valorVendaReal: 0, valorSaldo: 125 })).toBeNull();
    expect(calcularPercentualComissaoLoja({ valorVendaReal: 1000, valorSaldo: 0 })).toBeNull();
  });

  it('comissão da loja: cascata comissao_loja → saldo → calculada_loja → visao_master → percentual', () => {
    expect(resolveConciliacaoComissaoLoja({ valorComissaoLoja: 10, valorSaldo: 20 })).toBe(10);
    expect(resolveConciliacaoComissaoLoja({ valorSaldo: 20, valorCalculadaLoja: 30 })).toBe(20);
    expect(resolveConciliacaoComissaoLoja({ valorCalculadaLoja: 30, valorVisaoMaster: 40 })).toBe(
      30
    );
    expect(resolveConciliacaoComissaoLoja({ valorVisaoMaster: 40 })).toBe(40);
    expect(
      resolveConciliacaoComissaoLoja({ percentualComissaoLoja: 10, valorVendaReal: 500 })
    ).toBe(50);
    expect(resolveConciliacaoComissaoLoja({})).toBe(0);
  });

  it('valores negativos significativos também contam na cascata (|v| > 0,009)', () => {
    expect(resolveConciliacaoComissaoLoja({ valorComissaoLoja: -15, valorSaldo: 20 })).toBe(-15);
    expect(resolveConciliacaoComissaoLoja({ valorComissaoLoja: 0.005, valorSaldo: 20 })).toBe(20);
  });
});

describe('faixa de comissão', () => {
  it.each([
    [0, 'SEM_COMISSAO'],
    [-1, 'SEM_COMISSAO'],
    [null, 'SEM_COMISSAO'],
    [5, 'MENOR_10'],
    [9.99, 'MENOR_10'],
    [10, 'MAIOR_OU_IGUAL_10'],
    [31.4, 'MAIOR_OU_IGUAL_10'],
    [31.5, 'SEGURO_32_35'],
    [32, 'SEGURO_32_35'],
    [35.5, 'SEGURO_32_35'],
    [35.59, 'SEGURO_32_35'],
    // ATENÇÃO (comportamento atual, não corrigido): a regra diz "±0,6 em torno
    // de 35", mas |35,6 − 35| = 0,6000000000000014 em ponto flutuante, então
    // exatamente 35,6% NÃO entra na faixa de seguro. Mudar isso altera a
    // classificação de recibos — decidir junto com a regra do vturapp original.
    [35.6, 'MAIOR_OU_IGUAL_10'],
    [35.61, 'MAIOR_OU_IGUAL_10']
  ])('%s%% → %s', (pct, faixa) => {
    expect(classificarFaixaComissao(pct as number | null)).toBe(faixa);
  });
});

describe('temValorFinanceiro', () => {
  it('ignora valores abaixo de 1 centavo', () => {
    expect(temValorFinanceiro({ valorLancamentos: 0.005 })).toBe(false);
    expect(temValorFinanceiro({ valorOpfax: -10 })).toBe(true);
  });
});

describe('buildConciliacaoMetrics (função central)', () => {
  it('BAIXA comum: não comissionável sai do valor real; percentual vem do saldo', () => {
    const m = buildConciliacaoMetrics({
      descricao: 'Baixa',
      valorLancamentos: 1200,
      valorTaxas: 100,
      valorDescontos: 100,
      valorAbatimentos: 0,
      valorNaoComissionavel: 100,
      valorSaldo: 120
    });
    expect(m).toEqual({
      status: 'BAIXA',
      descricaoChave: 'BAIXA',
      valorVendaReal: 1000,
      valorComissaoLoja: 120,
      percentualComissaoLoja: 12,
      faixaComissao: 'MAIOR_OU_IGUAL_10',
      isSeguroViagem: false,
      temValorFinanceiro: true
    });
  });

  it('seguro viagem: 32% cai na faixa SEGURO_32_35', () => {
    const m = buildConciliacaoMetrics({
      descricao: 'BAIXA',
      valorLancamentos: 500,
      valorSaldo: 160
    });
    expect(m.percentualComissaoLoja).toBe(32);
    expect(m.faixaComissao).toBe('SEGURO_32_35');
    expect(m.isSeguroViagem).toBe(true);
  });

  it('sem saldo nem percentual: comissão 0, percentual null, SEM_COMISSAO', () => {
    const m = buildConciliacaoMetrics({ descricao: 'OPFAX', valorLancamentos: 300 });
    expect(m.status).toBe('OPFAX');
    expect(m.valorComissaoLoja).toBe(0);
    expect(m.percentualComissaoLoja).toBeNull();
    expect(m.faixaComissao).toBe('SEM_COMISSAO');
  });
});
