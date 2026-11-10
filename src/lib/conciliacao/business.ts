/**
 * Lógica de negócio de Conciliação — vtur-svelte
 *
 * Portabilizado FIELMENTE do vtur-app (src/lib/conciliacao/business.ts).
 * NÃO alterar sem sincronizar com o vtur-app.
 *
 * REGRAS CRÍTICAS:
 *  - valor_venda_real = lancamentos − descontos − abatimentos  (SEM taxas)
 *  - valor_comissao_loja: cascata comissao_loja → saldo → calculada_loja → visao_master
 *  - faixa SEGURO_32_35: tolerância ±0.6 em torno de 32% e 35%
 *  - status BAIXA: única condição para venda efetivada
 */

export type ConciliacaoStatus = 'BAIXA' | 'OPFAX' | 'ESTORNO' | 'OUTRO';
export type ConciliacaoFaixaComissao = string | 'SEM_COMISSAO';

// ---------------------------------------------------------------------------
// HELPERS INTERNOS
// ---------------------------------------------------------------------------

function normalizeText(value?: string | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function firstPositiveMoney(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    const num = Number(value ?? 0);
    if (Number.isFinite(num) && Math.abs(num) > 0.009) return roundMoney(num);
  }
  return null;
}

function firstPositivePercent(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    const num = Number(value ?? 0);
    if (Number.isFinite(num) && num > 0) return roundPercent(num);
  }
  return null;
}

// ---------------------------------------------------------------------------
// STATUS
// ---------------------------------------------------------------------------

export function normalizeConciliacaoDescricaoKey(value?: string | null): string {
  return normalizeText(value);
}

/**
 * Normaliza o status de conciliação baseado no campo status ou descrição.
 * Ordem de prioridade: ESTORNO > BAIXA > OPFAX > OUTRO
 */
export function normalizeConciliacaoStatus(value?: string | null): ConciliacaoStatus {
  const raw = normalizeText(value);
  if (!raw) return 'OUTRO';
  if (raw.includes('ESTORNO')) return 'ESTORNO';
  if (raw.includes('BAIXA')) return 'BAIXA';
  if (raw.includes('OPFAX')) return 'OPFAX';
  return 'OUTRO';
}

/** @alias normalizeConciliacaoStatus */
export function inferConciliacaoStatus(descricao?: string | null): ConciliacaoStatus {
  return normalizeConciliacaoStatus(descricao);
}

/**
 * Resolve o status final do registro.
 * Descrição tem prioridade sobre o campo status.
 */
export function resolveConciliacaoStatus(params: {
  status?: string | null;
  descricao?: string | null;
}): ConciliacaoStatus {
  const descricaoStatus = normalizeConciliacaoStatus(params.descricao);
  if (descricaoStatus !== 'OUTRO') return descricaoStatus;
  return normalizeConciliacaoStatus(params.status);
}

/**
 * Retorna true SOMENTE para status BAIXA (venda efetivada/concluída).
 */
export function isConciliacaoEfetivada(params: {
  status?: string | null;
  descricao?: string | null;
}): boolean {
  return resolveConciliacaoStatus(params) === 'BAIXA';
}

/**
 * Retorna true para registros importáveis: BAIXA, OPFAX ou ESTORNO.
 */
export function isConciliacaoImportavel(params: {
  status?: string | null;
  descricao?: string | null;
}): boolean {
  const status = resolveConciliacaoStatus(params);
  return status === 'BAIXA' || status === 'OPFAX' || status === 'ESTORNO';
}

// ---------------------------------------------------------------------------
// CÁLCULOS FINANCEIROS
// ---------------------------------------------------------------------------

/**
 * Calcula o valor real da venda.
 *
 * ⚠️  CRÍTICO: TAXAS não são subtraídas do valor_venda_real.
 * Apenas descontos e abatimentos reduzem o valor base.
 *
 * valor_venda_real = valor_lancamentos − valor_descontos − valor_abatimentos
 */
export function calcularValorVendaReal(params: {
  valorLancamentos?: number | null;
  valorTaxas?: number | null; // ← recebido mas NÃO usado no cálculo
  valorDescontos?: number | null;
  valorAbatimentos?: number | null;
}): number {
  const bruto = Number(params.valorLancamentos || 0);
  const descontos = Number(params.valorDescontos || 0);
  const abatimentos = Number(params.valorAbatimentos || 0);
  return roundMoney(Math.max(0, bruto - descontos - abatimentos));
}

/**
 * Calcula o percentual de comissão da loja.
 * percentual = (valor_saldo / valor_venda_real) × 100
 */
export function calcularPercentualComissaoLoja(params: {
  valorVendaReal?: number | null;
  valorSaldo?: number | null;
}): number | null {
  const base = Number(params.valorVendaReal || 0);
  const saldo = Number(params.valorSaldo || 0);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(saldo) || saldo <= 0) {
    return null;
  }
  return roundPercent((saldo / base) * 100);
}

/**
 * Resolve o valor de comissão da loja com cascata de prioridade:
 * 1º valorComissaoLoja (se preenchido)
 * 2º valorSaldo
 * 3º valorCalculadaLoja
 * 4º valorVisaoMaster
 * 5º (valorVendaReal × percentualComissaoLoja) / 100
 */
export function resolveConciliacaoComissaoLoja(params: {
  valorComissaoLoja?: number | null;
  valorSaldo?: number | null;
  valorCalculadaLoja?: number | null;
  valorVisaoMaster?: number | null;
  percentualComissaoLoja?: number | null;
  valorVendaReal?: number | null;
}): number {
  const valorVendaReal = Number(params.valorVendaReal || 0);
  const percentualExplicito = firstPositivePercent(params.percentualComissaoLoja);
  const valorDireto = firstPositiveMoney(
    params.valorComissaoLoja,
    params.valorSaldo,
    params.valorCalculadaLoja,
    params.valorVisaoMaster
  );

  if (valorDireto != null) return valorDireto;
  if (percentualExplicito != null && Number.isFinite(valorVendaReal) && valorVendaReal > 0) {
    return roundMoney((valorVendaReal * percentualExplicito) / 100);
  }
  return 0;
}

/**
 * Resolve o percentual de comissão da loja com cascata de prioridade.
 */
export function resolveConciliacaoPercentualLoja(params: {
  percentualComissaoLoja?: number | null;
  valorComissaoLoja?: number | null;
  valorSaldo?: number | null;
  valorCalculadaLoja?: number | null;
  valorVisaoMaster?: number | null;
  valorVendaReal?: number | null;
}): number | null {
  const percentualExplicito = firstPositivePercent(params.percentualComissaoLoja);
  if (percentualExplicito != null) return percentualExplicito;

  const valorComissaoLoja = resolveConciliacaoComissaoLoja({
    valorComissaoLoja: params.valorComissaoLoja,
    valorSaldo: params.valorSaldo,
    valorCalculadaLoja: params.valorCalculadaLoja,
    valorVisaoMaster: params.valorVisaoMaster,
    valorVendaReal: params.valorVendaReal
  });

  return calcularPercentualComissaoLoja({
    valorVendaReal: params.valorVendaReal,
    valorSaldo: valorComissaoLoja
  });
}

// ---------------------------------------------------------------------------
// FAIXA DE COMISSÃO
// ---------------------------------------------------------------------------

/**
 * Classifica o percentual de comissão em faixas.
 *
 * FAIXAS:
 * - SEM_COMISSAO: percentual <= 0
 * - SEGURO_32_35: |pct - 32| <= 0.6 OU |pct - 35| <= 0.6 OU (31.5 <= pct <= 35.5)
 * - MAIOR_OU_IGUAL_10: pct >= 10
 * - MENOR_10: 0 < pct < 10
 */
export function classificarFaixaComissao(percentual?: number | null): ConciliacaoFaixaComissao {
  const pct = Number(percentual || 0);
  if (!Number.isFinite(pct) || pct <= 0) return 'SEM_COMISSAO';
  if (Math.abs(pct - 32) <= 0.6 || Math.abs(pct - 35) <= 0.6 || (pct >= 31.5 && pct <= 35.5)) {
    return 'SEGURO_32_35';
  }
  if (pct >= 10) return 'MAIOR_OU_IGUAL_10';
  return 'MENOR_10';
}

/** Retorna true se o percentual se enquadra na faixa SEGURO_32_35. */
export function isConciliacaoSeguroViagem(percentual?: number | null): boolean {
  return classificarFaixaComissao(percentual) === 'SEGURO_32_35';
}

/** Verifica se há qualquer valor financeiro significativo no registro. */
export function temValorFinanceiro(params: {
  valorLancamentos?: number | null;
  valorTaxas?: number | null;
  valorDescontos?: number | null;
  valorAbatimentos?: number | null;
  valorSaldo?: number | null;
  valorOpfax?: number | null;
}): boolean {
  const values = [
    params.valorLancamentos,
    params.valorTaxas,
    params.valorDescontos,
    params.valorAbatimentos,
    params.valorSaldo,
    params.valorOpfax
  ];
  return values.some((value) => Math.abs(Number(value || 0)) > 0.009);
}

// ---------------------------------------------------------------------------
// MÉTRICAS COMPLETAS
// ---------------------------------------------------------------------------

/**
 * Constrói todas as métricas calculadas de um registro de conciliação.
 * É a função central — combina todas as regras de negócio acima.
 */
export function buildConciliacaoMetrics(params: {
  descricao?: string | null;
  valorLancamentos?: number | null;
  valorTaxas?: number | null;
  valorDescontos?: number | null;
  valorAbatimentos?: number | null;
  valorNaoComissionavel?: number | null;
  valorSaldo?: number | null;
  valorOpfax?: number | null;
  valorCalculadaLoja?: number | null;
  valorVisaoMaster?: number | null;
  valorComissaoLoja?: number | null;
  percentualComissaoLoja?: number | null;
}) {
  const status = inferConciliacaoStatus(params.descricao);

  // valor_venda_real: sem taxas
  const valorVendaRealBase = calcularValorVendaReal({
    valorLancamentos: params.valorLancamentos,
    valorTaxas: params.valorTaxas,
    valorDescontos: params.valorDescontos,
    valorAbatimentos: params.valorAbatimentos
  });

  // Subtrai valor não comissionável do valor real
  const valorNaoComissionavel = Math.max(0, Number(params.valorNaoComissionavel || 0));
  const valorVendaReal = Math.max(0, valorVendaRealBase - valorNaoComissionavel);

  // valor_comissao_loja: cascata de prioridade
  const valorComissaoLoja = resolveConciliacaoComissaoLoja({
    valorComissaoLoja: params.valorComissaoLoja,
    valorSaldo: params.valorSaldo,
    valorCalculadaLoja: params.valorCalculadaLoja,
    valorVisaoMaster: params.valorVisaoMaster,
    percentualComissaoLoja: params.percentualComissaoLoja,
    valorVendaReal
  });

  // percentual_comissao_loja: derivado do saldo / venda_real
  const percentualComissaoLoja = resolveConciliacaoPercentualLoja({
    percentualComissaoLoja: params.percentualComissaoLoja,
    valorComissaoLoja,
    valorSaldo: params.valorSaldo,
    valorCalculadaLoja: params.valorCalculadaLoja,
    valorVisaoMaster: params.valorVisaoMaster,
    valorVendaReal
  });

  const faixaComissao = classificarFaixaComissao(percentualComissaoLoja);

  return {
    status,
    descricaoChave: normalizeConciliacaoDescricaoKey(params.descricao),
    valorVendaReal,
    valorComissaoLoja,
    percentualComissaoLoja,
    faixaComissao,
    isSeguroViagem: isConciliacaoSeguroViagem(percentualComissaoLoja),
    temValorFinanceiro: temValorFinanceiro({
      valorLancamentos: params.valorLancamentos,
      valorTaxas: params.valorTaxas,
      valorDescontos: params.valorDescontos,
      valorAbatimentos: params.valorAbatimentos,
      valorSaldo: params.valorSaldo,
      valorOpfax: params.valorOpfax
    })
  };
}
