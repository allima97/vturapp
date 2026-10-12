import { normalizeText } from '$lib/normalizeText';

export type PagamentoNaoComissionavelInput = {
  venda_id?: string | null;
  venda_recibo_id?: string | null;
  valor_total?: number | null;
  valor_bruto?: number | null;
  desconto_valor?: number | null;
  paga_comissao?: boolean | null;
  forma_nome?: string | null;
  operacao?: string | null;
  plano?: string | null;
  forma?: { nome?: string | null; paga_comissao?: boolean | null } | null;
};

export type PagamentosNaoComissionaveisResumo = {
  porVenda: Map<string, number>;
  porVendaSemRecibo: Map<string, number>;
  porRecibo: Map<string, number>;
};

function normalizeTerm(value?: string | null) {
  return normalizeText(value || "", { trim: true, collapseWhitespace: true });
}

function addToMap(map: Map<string, number>, key: string, value: number) {
  if (!key || value <= 0) return;
  map.set(key, (map.get(key) || 0) + value);
}

/**
 * Termos padrão de formas de pagamento NÃO comissionáveis. Só são usados quando
 * a tabela `parametros_pagamentos_nao_comissionaveis` não pode ser lida ou está
 * vazia (em produção ela tem os termos ativos). Fonte única desde a Fase 2.3 —
 * antes havia 6 cópias desta lista/regra espalhadas pelo código.
 */
export const DEFAULT_NAO_COMISSIONAVEIS: readonly string[] = [
  "credito diversos",
  "credito pax",
  "credito passageiro",
  "credito de viagem",
  "credipax",
  "vale viagem",
  "carta de credito",
  "credito",
];

/**
 * Regra única: a forma é não comissionável se o nome normalizado contém algum
 * dos termos — exceto "cartão de crédito", que sempre comissiona.
 * Sem termos → false (quem chama é responsável por carregar os termos).
 */
export function isFormaNaoComissionavel(nome?: string | null, termos?: string[] | null) {
  const normalized = normalizeTerm(nome);
  if (!normalized) return false;
  if (normalized.includes("cartao") && normalized.includes("credito")) return false;
  for (const termo of termos || []) {
    const normalizedTerm = normalizeTerm(termo);
    if (normalizedTerm && normalized.includes(normalizedTerm)) return true;
  }
  return false;
}

export function calcularValorPagamento(pagamento: PagamentoNaoComissionavelInput) {
  const total = Number(pagamento.valor_total || 0);
  if (total > 0) return total;
  const bruto = Number(pagamento.valor_bruto || 0);
  const desconto = Number(pagamento.desconto_valor || 0);
  if (bruto > 0) return Math.max(0, bruto - desconto);
  return 0;
}

export function calcularNaoComissionavelResumo(
  pagamentos: PagamentoNaoComissionavelInput[],
  termos?: string[] | null
): PagamentosNaoComissionaveisResumo {
  const porVenda = new Map<string, number>();
  const porVendaSemRecibo = new Map<string, number>();
  const porRecibo = new Map<string, number>();

  for (const pagamento of pagamentos) {
    const vendaId = String(pagamento.venda_id || "").trim();
    if (!vendaId) continue;

    const formaNomeResolvida = [
      pagamento.forma_nome,
      pagamento.forma?.nome,
      pagamento.operacao,
      pagamento.plano,
    ].reduce((acc, value) => {
      if (!value) return acc;
      return acc ? `${acc} ${value}` : String(value);
    }, "");
    const pagaComissaoResolvido = pagamento.paga_comissao ?? pagamento.forma?.paga_comissao ?? null;
    const naoComissiona =
      pagaComissaoResolvido === false || isFormaNaoComissionavel(formaNomeResolvida, termos);
    if (!naoComissiona) continue;

    const valorBase = calcularValorPagamento(pagamento);
    if (valorBase <= 0) continue;

    addToMap(porVenda, vendaId, valorBase);

    const vendaReciboId = String(pagamento.venda_recibo_id || "").trim();
    if (vendaReciboId) {
      addToMap(porRecibo, vendaReciboId, valorBase);
    } else {
      addToMap(porVendaSemRecibo, vendaId, valorBase);
    }
  }

  return { porVenda, porVendaSemRecibo, porRecibo };
}

export function calcularNaoComissionavelPorVenda(
  pagamentos: PagamentoNaoComissionavelInput[],
  termos?: string[] | null
) {
  return calcularNaoComissionavelResumo(pagamentos, termos).porVenda;
}

/** Igual a isFormaNaoComissionavel, mas usa DEFAULT_NAO_COMISSIONAVEIS quando `termos` vier vazio. */
export function isFormaNaoComissionavelOuPadrao(nome?: string | null, termos?: readonly string[] | null) {
  return isFormaNaoComissionavel(nome, termos && termos.length > 0 ? [...termos] : [...DEFAULT_NAO_COMISSIONAVEIS]);
}
