/**
 * Fase 2.3: carregador único dos termos não comissionáveis.
 *
 * Os 13 termos abaixo são os ativos em produção (parametros_pagamentos_nao_comissionaveis,
 * lidos em 24/09/2026). Os nomes de forma/operação/plano são reais (vendas_pagamentos).
 */
import { describe, expect, it, vi } from 'vitest';
import { isFormaNaoComissionavel } from '$lib/naoComissionavel';
import { carregarTermosNaoComissionaveis, termosNaoComissionaveisPadrao } from './naoComissionavelTermos';

const PROD_ROWS = [
  { termo: 'Carta de crédito', termo_normalizado: 'carta de credito' },
  { termo: 'Cota', termo_normalizado: 'cota' },
  { termo: 'Cota de Presente', termo_normalizado: 'cota de presente' },
  { termo: 'Cota Presente', termo_normalizado: 'cota presente' },
  { termo: 'Credipax', termo_normalizado: 'credipax' },
  { termo: 'Credito', termo_normalizado: 'credito' },
  { termo: 'Credito de viagem', termo_normalizado: 'credito de viagem' },
  { termo: 'Credito diversos', termo_normalizado: 'credito diversos' },
  { termo: 'Credito passageiro', termo_normalizado: 'credito passageiro' },
  { termo: 'Credito pax', termo_normalizado: 'credito pax' },
  { termo: 'Ficha Agência', termo_normalizado: 'ficha agencia' },
  { termo: 'Ficha Agência-Recadastro', termo_normalizado: 'ficha agencia-recadastro' },
  { termo: 'Vale viagem', termo_normalizado: 'vale viagem' },
];

const NOMES_REAIS = [
  "Cartão de Crédito",
  "Depósito",
  "Financiamento",
  "Cartão de Débito",
  "Msc Cartao",
  "Boleto",
  "Recibo",
  "Parcelado",
  "Mastercard",
  "Créditos Diversos",
  "Visa",
  "Pix",
  "Msc Boleto",
  "Crédito",
  "Cartao Costa Cruzeiros",
  "Não Identificado (Revisar Contrato)",
  "Pix Msc",
  "Cheque",
  "Carta de Crédito",
  "Cruzeiro Tematico",
  "Pontos Livelo",
  "Ficha Agencia-Recadastro",
  "Depósito da agência",
  "Elo Débito",
  "Cartão Cruzeiros Norwegian",
  "Cartão Royal / Celebrity",
  "Vale Viagem",
  "Boleto Boleto A Vista c/ 3% de desconto",
  "Carta de Crédito Carta de Crédito A Vista",
  "Cartao Costa Cruzeiros Cartao Costa Cruzeiros Parcelas",
  "Cartão de Crédito Cartão de Crédito AMEX 02X s/juros",
  "Cartão de Crédito Cartão de Crédito ELO CRÉDITO 0 + 12X s/ juros",
  "Cartão de Crédito Cartão de Crédito MASTERCARD 8.33% entrada + 11X s/ juros",
  "Cartão de Crédito VISA 12X s/juros",
  "Cartão de Débito Cartão de Débito A Vista",
  "Cartão Royal / Celebrity Cartão Royal / Celebrity Parcelas",
  "Crédito Crédito A Vista",
  "Crédito Crédito VISA 06X s/juros",
  "Créditos Diversos Créditos Diversos 0 + 1X s/ juros",
  "Créditos Diversos Créditos Diversos A Vista",
  "Depósito Depósito Depósito da agência 1x",
  "Elo Débito Elo Débito Parcelas",
  "Ficha Agencia-Recadastro Ficha Agencia-Recadastro",
  "Ficha Agencia-Recadastro Ficha Agencia-Recadastro MASTERCARD 01X s/juros",
  "Financiamento Financiamento Central de Financiamento - Agencia",
  "Msc Boleto Msc Boleto Parcelas Parcelas Valor (R$) Vencimento",
  "Não Identificado (Revisar Contrato) Não Identificado (Revisar Contrato)",
  "Parcelado Parcelado Visa 10x",
  "Pix Pix À Vista",
  "Pontos Livelo Pontos Livelo 1x",
  "Recibo Recibo 10X s/juros",
  "Visa Visa Parcelas",
  "Parcelado Parcelado de parcelamento para instituições financeiras de sua confiança, as quais ficarão sub-rogadas plenamente no direito de receber o valor das parcelas, da forma que vier a ser definida no ato do parcelamento. 20% entrada + 9X s/ juros"
];

type Result = { data?: unknown; error?: unknown; throws?: unknown };

function fakeClient(result: Result) {
  const calls: unknown[] = [];
  const chain = {
    select: (cols: string) => (calls.push(['select', cols]), chain),
    eq: (col: string, v: unknown) => (calls.push(['eq', col, v]), chain),
    order: (col: string, opts: unknown) => {
      calls.push(['order', col, opts]);
      if (result.throws) return Promise.reject(result.throws);
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
    },
  };
  return {
    calls,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: { from: (t: string) => (calls.push(['from', t]), chain) } as any,
  };
}

describe('carregarTermosNaoComissionaveis', () => {
  it('lê só os ativos, ordenados por termo', async () => {
    const { client, calls } = fakeClient({ data: PROD_ROWS });
    await carregarTermosNaoComissionaveis(client);
    expect(calls).toEqual([
      ['from', 'parametros_pagamentos_nao_comissionaveis'],
      ['select', 'termo, termo_normalizado, ativo'],
      ['eq', 'ativo', true],
      ['order', 'termo', { ascending: true }],
    ]);
  });

  it('produção → termo_normalizado na ordem da tabela', async () => {
    const { client } = fakeClient({ data: PROD_ROWS });
    expect(await carregarTermosNaoComissionaveis(client)).toEqual(PROD_ROWS.map((r) => r.termo_normalizado));
  });

  it('usa termo quando termo_normalizado vazio; normaliza, remove vazios e duplicados', async () => {
    const { client } = fakeClient({
      data: [
        { termo: '  Crédito   PAX ', termo_normalizado: null },
        { termo: 'Credito pax', termo_normalizado: '' },
        { termo: '', termo_normalizado: null },
        { termo: 'Vale Viagem', termo_normalizado: 'vale viagem' },
      ],
    });
    expect(await carregarTermosNaoComissionaveis(client)).toEqual(['credito pax', 'vale viagem']);
  });

  it.each([
    ['tabela vazia', { data: [] }, false],
    ['data null', { data: null }, false],
    ['erro do Supabase', { error: { message: 'permission denied' } }, true],
    ['exceção', { throws: new Error('network') }, true],
  ] as const)('%s → lista padrão', async (_label, result, reportsError) => {
    const onError = vi.fn();
    const { client } = fakeClient(result as Result);
    expect(await carregarTermosNaoComissionaveis(client, { onError })).toEqual(termosNaoComissionaveisPadrao());
    expect(onError).toHaveBeenCalledTimes(reportsError ? 1 : 0);
  });

  it('lista padrão (normalizada) = DEFAULT_NAO_COMISSIONAVEIS', () => {
    expect(termosNaoComissionaveisPadrao()).toMatchInlineSnapshot(`
      [
        "credito diversos",
        "credito pax",
        "credito passageiro",
        "credito de viagem",
        "credipax",
        "vale viagem",
        "carta de credito",
        "credito",
      ]
    `);
  });
});

describe('decisão final com os termos de produção (nomes reais)', () => {
  it('mesmas formas não comissionáveis de antes da Fase 2.3', async () => {
    const { client } = fakeClient({ data: PROD_ROWS });
    const termos = await carregarTermosNaoComissionaveis(client);
    expect(NOMES_REAIS.filter((nome) => isFormaNaoComissionavel(nome, termos))).toMatchInlineSnapshot(`
      [
        "Créditos Diversos",
        "Crédito",
        "Carta de Crédito",
        "Ficha Agencia-Recadastro",
        "Vale Viagem",
        "Carta de Crédito Carta de Crédito A Vista",
        "Crédito Crédito A Vista",
        "Crédito Crédito VISA 06X s/juros",
        "Créditos Diversos Créditos Diversos 0 + 1X s/ juros",
        "Créditos Diversos Créditos Diversos A Vista",
        "Ficha Agencia-Recadastro Ficha Agencia-Recadastro",
        "Ficha Agencia-Recadastro Ficha Agencia-Recadastro MASTERCARD 01X s/juros",
      ]
    `);
  });
});
