import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_NAO_COMISSIONAVEIS } from '$lib/naoComissionavel';
import { normalizeText } from '$lib/normalizeText';
import { uniqueCleanStrings } from '$lib/utils/array';

/**
 * Carregamento ÚNICO (servidor) dos termos de formas de pagamento não
 * comissionáveis — Fase 2.3.
 *
 * Substitui 6 cópias quase idênticas (vendas/merge,
 * conciliacao/list, lib/conciliacao/source, server/vendas-kpis e
 * relatorios/vendas). Regra preservada de todas elas:
 *  - lê `parametros_pagamentos_nao_comissionaveis` com `ativo = true`,
 *    ordenado por `termo`;
 *  - usa `termo_normalizado` e, se vazio, `termo`;
 *  - normaliza (sem acento, minúsculo, espaços colapsados, trim), remove
 *    vazios e duplicados mantendo a ordem;
 *  - lista vazia, erro do Supabase ou exceção → DEFAULT_NAO_COMISSIONAVEIS.
 *
 * A normalização é a mesma que isFormaNaoComissionavel aplica na comparação,
 * então o resultado final (forma comissiona ou não) não muda.
 */

type TermoNaoComissionavelRow = {
  termo?: string | null;
  termo_normalizado?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClientLike = Pick<SupabaseClient<any, any, any>, 'from'>;

export function normalizarTermoNaoComissionavel(value?: string | null) {
  return normalizeText(value || '', { trim: true, collapseWhitespace: true });
}

export function termosNaoComissionaveisPadrao(): string[] {
  return DEFAULT_NAO_COMISSIONAVEIS.map(normalizarTermoNaoComissionavel).filter(Boolean);
}

export async function carregarTermosNaoComissionaveis(
  client: ClientLike,
  options: { onError?: (error: unknown) => void } = {},
): Promise<string[]> {
  try {
    const { data, error } = await client
      .from('parametros_pagamentos_nao_comissionaveis')
      .select('termo, termo_normalizado, ativo')
      .eq('ativo', true)
      .order('termo', { ascending: true });
    if (error) throw error;

    const termos = uniqueCleanStrings(
      ((data || []) as TermoNaoComissionavelRow[])
        .map((row) => normalizarTermoNaoComissionavel(row?.termo_normalizado || row?.termo))
        .filter(Boolean),
    );
    if (termos.length > 0) return termos;
  } catch (error) {
    options.onError?.(error);
  }
  return termosNaoComissionaveisPadrao();
}
