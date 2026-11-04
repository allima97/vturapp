import type { DataClient } from '$lib/server/data';
import type { ReportVendaRow } from '$lib/server/relatorios';
import type { ResolvedReceiptCommission, ResolvedVendaCommission } from '$lib/server/comissoes';
import { chunkArray, uniqueCleanStrings as uniqueIds } from '$lib/utils/array';
import { toFiniteNumber as toNum } from '$lib/utils/values';

export type PersistedComissaoRow = {
  id: string;
  venda_id: string | null;
  recibo_id: string | null;
  vendedor_id: string | null;
  regra_id: string | null;
  valor_venda: number | null;
  valor_comissionavel: number | null;
  percentual_aplicado: number | null;
  valor_comissao: number | null;
  status: string | null;
  data_pagamento: string | null;
  observacoes_pagamento: string | null;
  pago_por: string | null;
  mes_referencia: number | null;
  ano_referencia: number | null;
  company_id: string | null;
};

export type PersistedComissoesSnapshot = {
  rows: PersistedComissaoRow[];
  available: boolean;
};

function isMissingComissoesSchema(error: unknown) {
  const code = String((error as { code?: string })?.code || '').trim();
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    code === '42703' ||
    message.includes('schema cache') ||
    message.includes('could not find the table') ||
    message.includes('does not exist') ||
    message.includes('relation') ||
    message.includes('column')
  );
}

function getPeriodFromDate(dateIso?: string | null) {
  const raw = String(dateIso || '').trim();
  const [yearStr, monthStr] = raw.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (Number.isFinite(year) && Number.isFinite(month) && year > 2000 && month >= 1 && month <= 12) {
    return { mes: month, ano: year };
  }

  const now = new Date();
  return { mes: now.getMonth() + 1, ano: now.getFullYear() };
}

const QUERY_IN_BATCH_SIZE = 150;

function buildFilterBatches(filters: Array<{ column: string; values: string[] }>) {
  return filters.reduce<Array<Array<{ column: string; values: string[] }>>>(
    (groups, filter) =>
      groups.flatMap((group) =>
        chunkArray(filter.values, QUERY_IN_BATCH_SIZE).map((values) => [
          ...group,
          { column: filter.column, values }
        ])
      ),
    [[]]
  );
}

export function buildPersistedComissaoKey(vendaId?: string | null, vendedorId?: string | null) {
  const venda = String(vendaId || '').trim();
  const vendedor = String(vendedorId || '').trim();
  if (!venda || !vendedor) return '';
  return `venda:${venda}::${vendedor}`;
}

export function buildPersistedReciboComissaoKey(
  reciboId?: string | null,
  vendedorId?: string | null,
  vendaId?: string | null
) {
  const recibo = String(reciboId || '').trim();
  const vendedor = String(vendedorId || '').trim();
  if (recibo && vendedor) return `recibo:${recibo}::${vendedor}`;
  return buildPersistedComissaoKey(vendaId, vendedorId);
}

export async function fetchPersistedComissoes(
  client: DataClient,
  params: {
    vendaIds?: string[];
    reciboIds?: string[];
    vendedorIds?: string[];
    companyIds?: string[];
  }
): Promise<PersistedComissoesSnapshot> {
  const vendaIds = uniqueIds(params.vendaIds);
  const reciboIds = uniqueIds(params.reciboIds);
  const vendedorIds = uniqueIds(params.vendedorIds);
  const companyIds = uniqueIds(params.companyIds);
  const primaryReceiptOrSaleFilter =
    reciboIds.length > 0
      ? [{ column: 'recibo_id', values: reciboIds }]
      : vendaIds.length > 0
        ? [{ column: 'venda_id', values: vendaIds }]
        : [];
  const filters = [
    ...primaryReceiptOrSaleFilter,
    ...(vendedorIds.length > 0 ? [{ column: 'vendedor_id', values: vendedorIds }] : []),
    ...(companyIds.length > 0 ? [{ column: 'company_id', values: companyIds }] : [])
  ];
  const batches = filters.length > 0 ? buildFilterBatches(filters) : [[]];
  const rowsById = new Map<string, PersistedComissaoRow>();

  for (const batchFilters of batches) {
    let query = client
      .from('comissoes')
      .select(
        'id, venda_id, recibo_id, vendedor_id, regra_id, valor_venda, valor_comissionavel, percentual_aplicado, valor_comissao, status, data_pagamento, observacoes_pagamento, pago_por, mes_referencia, ano_referencia, company_id'
      )
      .limit(5000);

    for (const filter of batchFilters) {
      query = query.in(filter.column, filter.values);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingComissoesSchema(error)) {
        return {
          rows: [],
          available: false
        };
      }
      throw error;
    }

    for (const row of (data || []) as PersistedComissaoRow[]) {
      if (row?.id) rowsById.set(row.id, row);
    }
  }

  return {
    rows: Array.from(rowsById.values()),
    available: true
  };
}

export async function persistPaidComissoes(params: {
  client: DataClient;
  userId: string;
  rows: ReportVendaRow[];
  resolvedByKey: Map<string, ResolvedVendaCommission>;
  existingByKey: Map<string, PersistedComissaoRow>;
  dataPagamento: string;
  observacoesPagamento?: string | null;
}) {
  const { client, userId, rows, resolvedByKey, existingByKey, dataPagamento, observacoesPagamento } = params;

  const inserts: Record<string, unknown>[] = [];
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];

  for (const row of rows) {
    const key = buildPersistedComissaoKey(row.id, row.vendedor_id);
    if (!key) continue;

    const resolved = resolvedByKey.get(key);
    if (!resolved || resolved.valorComissao <= 0) continue;

    const existing = existingByKey.get(key);
    const periodo = getPeriodFromDate(row.data_venda);
    const payload = {
      venda_id: row.id,
      vendedor_id: row.vendedor_id,
      regra_id: resolved.regraId,
      valor_venda: resolved.valorVenda,
      valor_comissionavel: resolved.valorComissionavel,
      percentual_aplicado: resolved.percentual,
      valor_comissao: resolved.valorComissao,
      status: 'PAGA',
      data_pagamento: dataPagamento,
      observacoes_pagamento: observacoesPagamento || null,
      pago_por: userId,
      mes_referencia: periodo.mes,
      ano_referencia: periodo.ano,
      company_id: row.company_id,
      created_by: existing ? undefined : userId
    };

    if (existing?.id) {
      updates.push({
        id: existing.id,
        payload
      });
    } else {
      inserts.push(payload);
    }
  }

  if (updates.length === 0 && inserts.length === 0) {
    return { pagas: 0 };
  }

  try {
    if (inserts.length > 0) {
      const { error: insertError } = await client.from('comissoes').insert(inserts);
      if (insertError) throw insertError;
    }

    for (const update of updates) {
      const { error: updateError } = await client
        .from('comissoes')
        .update(update.payload)
        .eq('id', update.id);

      if (updateError) throw updateError;
    }

    return { pagas: updates.length + inserts.length };
  } catch (error) {
    if (isMissingComissoesSchema(error)) {
      return { pagas: 0, fallback: true as const };
    }
    throw error;
  }
}

export type PersistReceiptPaymentRow = {
  venda_id: string;
  recibo_id: string;
  vendedor_id: string | null;
  company_id: string | null;
  data_venda: string | null;
  valor_recibo: number;
};

export async function persistPaidReceiptComissoes(params: {
  client: DataClient;
  userId: string;
  rows: PersistReceiptPaymentRow[];
  resolvedByKey: Map<string, ResolvedReceiptCommission>;
  existingByKey: Map<string, PersistedComissaoRow>;
  dataPagamento: string;
  observacoesPagamento?: string | null;
}) {
  const { client, userId, rows, resolvedByKey, existingByKey, dataPagamento, observacoesPagamento } = params;

  const inserts: Record<string, unknown>[] = [];
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];

  for (const row of rows) {
    const key = buildPersistedReciboComissaoKey(row.recibo_id, row.vendedor_id, row.venda_id);
    if (!key) continue;

    const resolved = resolvedByKey.get(key);
    if (!resolved || resolved.valorComissao <= 0) continue;

    const existing = existingByKey.get(key);
    const periodo = getPeriodFromDate(row.data_venda);
    const payload = {
      venda_id: row.venda_id,
      recibo_id: row.recibo_id,
      vendedor_id: row.vendedor_id,
      regra_id: null,
      valor_venda: row.valor_recibo,
      valor_comissionavel: resolved.valorComissionavel,
      percentual_aplicado: resolved.percentual,
      valor_comissao: resolved.valorComissao,
      status: 'PAGA',
      data_pagamento: dataPagamento,
      observacoes_pagamento: observacoesPagamento || null,
      pago_por: userId,
      mes_referencia: periodo.mes,
      ano_referencia: periodo.ano,
      company_id: row.company_id,
      created_by: existing ? undefined : userId
    };

    if (existing?.id) {
      updates.push({
        id: existing.id,
        payload
      });
    } else {
      inserts.push(payload);
    }
  }

  if (updates.length === 0 && inserts.length === 0) {
    return { pagas: 0 };
  }

  try {
    if (inserts.length > 0) {
      const { error: insertError } = await client.from('comissoes').insert(inserts);
      if (insertError) throw insertError;
    }

    for (const update of updates) {
      const { error: updateError } = await client
        .from('comissoes')
        .update(update.payload)
        .eq('id', update.id);

      if (updateError) throw updateError;
    }

    return { pagas: updates.length + inserts.length };
  } catch (error) {
    if (isMissingComissoesSchema(error)) {
      return { pagas: 0, fallback: true as const };
    }
    throw error;
  }
}

export function applyPersistedComissao(
  base: {
    valor_venda: number;
    valor_comissionavel: number;
    percentual_aplicado: number;
    valor_comissao: number;
    status: string;
    valor_pago: number;
  },
  persisted?: PersistedComissaoRow | null
) {
  if (!persisted) return base;

  const normalizedStatus = String(persisted.status || '').toLowerCase();
  const status =
    normalizedStatus === 'paga'
      ? 'pago'
      : normalizedStatus === 'cancelada'
        ? 'cancelada'
        : normalizedStatus === 'processando'
          ? 'processando'
          : 'pendente';

  const valorComissao = persisted.valor_comissao != null ? toNum(persisted.valor_comissao) : base.valor_comissao;

  return {
    valor_venda: persisted.valor_venda != null ? toNum(persisted.valor_venda) : base.valor_venda,
    valor_comissionavel:
      persisted.valor_comissionavel != null ? toNum(persisted.valor_comissionavel) : base.valor_comissionavel,
    percentual_aplicado:
      persisted.percentual_aplicado != null ? toNum(persisted.percentual_aplicado) : base.percentual_aplicado,
    valor_comissao: valorComissao,
    status,
    valor_pago: status === 'pago' ? valorComissao : 0
  };
}
