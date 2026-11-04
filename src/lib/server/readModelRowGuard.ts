import type { DataClient } from '$lib/server/data';
/**
 * Proteção das linhas do read model antes de gravar (25/09/2026).
 *
 * Problema: recibos que existem só na conciliação (sem recibo de venda) usam o
 * id da própria conciliação como `reciboId`. Gravar esse valor em
 * `ranking_recibo_contribuicoes.recibo_id` viola a FK para `vendas_recibos`,
 * o mês fica em 'error' e o dashboard recalcula tudo na hora a cada acesso.
 *
 * Correção: grava `recibo_id = null` quando o id não existe em `vendas_recibos`
 * (o mesmo que já é feito com `venda_id`). O cálculo não muda.
 *
 * Trava: as contagens de recibos (dashboard, relatórios, ranking) usam o
 * `recibo_id` na chave; sem ele passam a usar o número do recibo. Só gravamos se,
 * para TODAS as chaves usadas, a troca for um-para-um (linhas que eram o mesmo
 * recibo continuam iguais e recibos diferentes continuam diferentes). Assim
 * nenhuma contagem muda, em nenhum filtro. Se não for, o mês não é gravado e
 * o comportamento fica como antes (cálculo na hora).
 */
import { chunkArray } from '$lib/utils/array';

export type GuardedContributionRow = {
  venda_key: string;
  recibo_id: string | null;
  recibo_numero: string | null;
  data_recibo: string;
};

const s = (value: unknown) => String(value ?? '');

/** Chaves de contagem usadas por quem lê o read model (mesma semântica do código de leitura). */
export const RECEIPT_COUNT_KEYS: Record<string, (row: GuardedContributionRow) => string> = {
  // aggregateContributions + RPCs dashboard_vendas_summary / relatorio_produtos (quantidade)
  painel: (r) => `${s(r.venda_key)}|${s(r.recibo_id) || s(r.recibo_numero)}|${s(r.data_recibo)}`,
  // relatorios/produtos.ts
  produtos: (r) => s(r.recibo_id) || `${s(r.venda_key)}|${s(r.recibo_numero)}|${s(r.data_recibo)}`,
  // relatorios/ranking.ts
  ranking: (r) => `${s(r.venda_key)}::${s(r.recibo_id) || s(r.recibo_numero)}`,
  // relatorios/destinos.ts, relatorios/clientes.ts + RPCs relatorio_destinos/clientes
  vendas: (r) => s(r.venda_key) || s(r.recibo_id) || `${s(r.recibo_numero)}|${s(r.data_recibo)}`,
};

/**
 * Confere se trocar `before` por `after` (mesma ordem de linhas) mantém todas as
 * contagens. Retorna o nome da primeira chave que quebraria, ou null se tudo ok.
 */
export function findBrokenReceiptCountKey(
  before: GuardedContributionRow[],
  after: GuardedContributionRow[],
): string | null {
  for (const [name, keyOf] of Object.entries(RECEIPT_COUNT_KEYS)) {
    const forward = new Map<string, string>();
    const backward = new Map<string, string>();
    for (let index = 0; index < before.length; index += 1) {
      const oldKey = keyOf(before[index]);
      const newKey = keyOf(after[index]);
      const mappedNew = forward.get(oldKey);
      const mappedOld = backward.get(newKey);
      if (mappedNew !== undefined && mappedNew !== newKey) return name;
      if (mappedOld !== undefined && mappedOld !== oldKey) return name;
      forward.set(oldKey, newKey);
      backward.set(newKey, oldKey);
    }
  }
  return null;
}

/** Busca quais recibo_id existem em vendas_recibos. Erro de consulta → lança (mês fica como antes). */
async function fetchExistingReciboIds(client: DataClient, ids: string[]) {
  const existing = new Set<string>();
  for (const batch of chunkArray(ids)) {
    const { data, error } = await client.from('vendas_recibos').select('id').in('id', batch);
    if (error) throw error;
    for (const row of (data || []) as Array<{ id?: string | null }>) {
      if (row?.id) existing.add(String(row.id));
    }
  }
  return existing;
}

/**
 * Devolve as linhas prontas para gravar: `recibo_id` inexistente vira null.
 * Lança erro se isso mudaria alguma contagem (o chamador marca o mês como 'error').
 */
export async function guardContributionRowsForeignKeys<T extends GuardedContributionRow>(
  client: DataClient,
  rows: T[],
): Promise<{ rows: T[]; nulledReciboIds: number }> {
  const ids = [...new Set(rows.map((row) => s(row.recibo_id)).filter(Boolean))];
  if (ids.length === 0) return { rows, nulledReciboIds: 0 };

  const existing = await fetchExistingReciboIds(client, ids);
  let nulledReciboIds = 0;
  const guarded = rows.map((row) => {
    const id = s(row.recibo_id);
    if (!id || existing.has(id)) return row;
    nulledReciboIds += 1;
    return { ...row, recibo_id: null };
  });

  if (nulledReciboIds === 0) return { rows, nulledReciboIds: 0 };

  const broken = findBrokenReceiptCountKey(rows, guarded);
  if (broken) {
    throw new Error(
      `read model: recibo sem vínculo mudaria a contagem de recibos (chave "${broken}"); mês não gravado.`,
    );
  }
  return { rows: guarded, nulledReciboIds };
}
