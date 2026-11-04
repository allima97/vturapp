import { dev } from '$app/environment';
import { normalizeText } from '$lib/normalizeText';
import { browserData as dadosBrowser } from '$lib/db/browserData';
import {
  calcularNaoComissionavelPorVenda as calcularNaoComissionavelPorVendaShared,
  calcularNaoComissionavelResumo,
  DEFAULT_NAO_COMISSIONAVEIS,
  isFormaNaoComissionavel as isFormaNaoComissionavelBase
} from '$lib/naoComissionavel';
import { uniqueCleanStrings } from '$lib/utils/array';

const DEFAULT_NAO_COMISSIONAVEIS_NORMALIZED = DEFAULT_NAO_COMISSIONAVEIS.reduce<string[]>(
  (items, termo) => {
    const normalized = normalizeText(termo, { trim: true, collapseWhitespace: true });
    if (normalized) items.push(normalized);
    return items;
  },
  []
);

let cachedTermosNaoComissionaveis: string[] | null = null;
let termosLoadPromise: Promise<string[]> | null = null;

interface ParametroPagamentoNaoComissionavelRow {
  termo?: string | null;
  termo_normalizado?: string | null;
}

function normalizeTerm(value?: string | null) {
  return normalizeText(value || '', { trim: true, collapseWhitespace: true });
}

export async function carregarTermosNaoComissionaveis(options: { force?: boolean } = {}) {
  const { force = false } = options;
  if (!force && cachedTermosNaoComissionaveis) return cachedTermosNaoComissionaveis;
  if (!force && termosLoadPromise) return termosLoadPromise;

  termosLoadPromise = (async () => {
    try {
      const { data, error } = await dadosBrowser
        .from('parametros_pagamentos_nao_comissionaveis')
        .select('termo, termo_normalizado, ativo')
        .eq('ativo', true)
        .order('termo', { ascending: true });
      if (error) throw error;
      const rows = (data || []) as ParametroPagamentoNaoComissionavelRow[];
      const termos = rows.reduce<string[]>((items, row) => {
        const termo = normalizeTerm(row?.termo_normalizado || row?.termo);
        if (termo) items.push(termo);
        return items;
      }, []);
      const unique = uniqueCleanStrings(termos);
      cachedTermosNaoComissionaveis = unique;
      return unique;
    } catch (err) {
      if (dev) console.warn('[pagamentoUtils] Falha ao carregar termos nao comissionaveis.', err);
    } finally {
      termosLoadPromise = null;
    }
    cachedTermosNaoComissionaveis = DEFAULT_NAO_COMISSIONAVEIS_NORMALIZED;
    return cachedTermosNaoComissionaveis as string[];
  })() as Promise<string[]>;

  return termosLoadPromise;
}

export function isFormaNaoComissionavel(nome?: string | null, termos?: string[] | null) {
  const lista =
    termos && termos.length
      ? termos
      : cachedTermosNaoComissionaveis || DEFAULT_NAO_COMISSIONAVEIS_NORMALIZED;
  return isFormaNaoComissionavelBase(nome, lista);
}

export function calcularNaoComissionavelPorVenda(
  pagamentos: {
    venda_id: string;
    venda_recibo_id?: string | null;
    valor_total?: number | null;
    valor_bruto?: number | null;
    desconto_valor?: number | null;
    paga_comissao?: boolean | null;
    forma_nome?: string | null;
    operacao?: string | null;
    plano?: string | null;
    forma?: { nome?: string | null; paga_comissao?: boolean | null } | null;
  }[],
  termos?: string[] | null
) {
  return calcularNaoComissionavelPorVendaShared(pagamentos, termos);
}

export { calcularNaoComissionavelResumo };
