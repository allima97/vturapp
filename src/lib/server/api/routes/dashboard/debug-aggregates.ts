// Migrado para Hono de src/routes/api/v1/dashboard/debug-aggregates/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  getAdminClient,
  isDebugEndpointEnabled,
  isUuid,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { toFiniteNumber as toNumber } from '$lib/utils/values';

const DEBUG_HEADERS = NO_STORE_HEADERS;

type ConciliacaoDebugRow = {
  id: string | null;
  documento: string | null;
  status: string | null;
  valor_lancamentos: number | string | null;
  valor_venda_real: number | string | null;
  venda_id: string | null;
  venda_recibo_id: string | null;
  movimento_data: string | null;
};

export async function handleDashboardDebugAggregatesGet(event: RequestEvent) {
  try {
    if (!isDebugEndpointEnabled(event)) {
      return json({ error: 'Not found' }, { status: 404, headers: DEBUG_HEADERS });
    }

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      return json({ error: 'Sem acesso.' }, { status: 403, headers: DEBUG_HEADERS });
    }

    const companyId = String(event.url.searchParams.get('company_id') || '').trim();
    const inicio = String(event.url.searchParams.get('inicio') || '2026-04-01').trim();
    const fim = String(event.url.searchParams.get('fim') || '2026-04-08').trim();

    if (!companyId || !isUuid(companyId)) {
      return json({ error: 'company_id required' }, { status: 400, headers: DEBUG_HEADERS });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
      return json({ error: 'Periodo invalido.' }, { status: 400, headers: DEBUG_HEADERS });
    }

    const vendedorId = String(event.url.searchParams.get('vendedor_id') || '').trim();
    if (vendedorId && !isUuid(vendedorId)) {
      return json({ error: 'vendedor_id invalido.' }, { status: 400, headers: DEBUG_HEADERS });
    }

    let vendasQuery = client
      .from('vendas')
      .select(
        `id, vendedor_id, status, data_venda, valor_total, valor_total_bruto,
        vendas_recibos(id, numero_recibo, data_venda, valor_total, cancelado_por_conciliacao_em)`
      )
      .eq('company_id', companyId)
      .eq('cancelada', false)
      .gte('data_venda', inicio)
      .lte('data_venda', fim);

    if (vendedorId) {
      vendasQuery = vendasQuery.eq('vendedor_id', vendedorId);
    }

    const { data: vendasBase, error: vendasErr } = await vendasQuery;
    if (vendasErr) throw vendasErr;

    let totalVendas = 0;
    let vendasCanceladasStatus = 0;
    let recibosCanceladosMesmoMes = 0;
    const vendaIds: string[] = [];

    for (const v of vendasBase || []) {
      const vid = String(v.id || '').trim();
      if (vid) vendaIds.push(vid);

      if (
        String(v.status || '')
          .trim()
          .toLowerCase() === 'cancelado'
      ) {
        vendasCanceladasStatus += toNumber(v.valor_total_bruto);
        continue;
      }

      const recibos = Array.isArray(v.vendas_recibos) ? v.vendas_recibos : [];
      let vendaTotal = toNumber(v.valor_total_bruto);

      for (const r of recibos) {
        if (r.cancelado_por_conciliacao_em) {
          const reciboMes = String(r.data_venda || '').slice(0, 7);
          const cancelMes = String(r.cancelado_por_conciliacao_em).slice(0, 7);
          if (reciboMes === cancelMes) {
            recibosCanceladosMesmoMes += toNumber(r.valor_total);
            vendaTotal -= toNumber(r.valor_total);
          }
        }
      }

      totalVendas += vendaTotal;
    }

    const { data: concRecords, error: concErr } = await client
      .from('conciliacao_recibos')
      .select(
        `id, documento, descricao, status, valor_lancamentos, valor_venda_real, 
        valor_nao_comissionavel, venda_id, venda_recibo_id, movimento_data`
      )
      .eq('company_id', companyId)
      .neq('is_baixa_rac', true)
      .gte('movimento_data', inicio)
      .lte('movimento_data', fim)
      .order('movimento_data', { ascending: true });

    if (concErr) throw concErr;

    let concBaixa = 0;
    let concOpfax = 0;
    let concOther = 0;
    let concLinked = 0;
    let concCountBaixa = 0;
    let concCountOpfax = 0;
    let concCountOtherStatus = 0;
    let concCountNullStatus = 0;

    const relevantDocs = new Set<string>();

    for (const row of concRecords || []) {
      const status = String(row.status || '').toUpperCase();
      const temValor = toNumber(row.valor_lancamentos) > 0 || toNumber(row.valor_venda_real) > 0;
      if (status === 'BAIXA') {
        concCountBaixa += 1;
      } else if (status === 'OPFAX') {
        concCountOpfax += 1;
      } else {
        concCountOtherStatus += 1;
      }
      if (!row.status || String(row.status || '').trim() === '') concCountNullStatus += 1;

      if (status === 'BAIXA') {
        concBaixa += toNumber(row.valor_venda_real || row.valor_lancamentos);
        relevantDocs.add(String(row.documento || ''));
      } else if (status === 'OPFAX') {
        concOpfax += toNumber(row.valor_venda_real || row.valor_lancamentos);
        if (temValor) relevantDocs.add(String(row.documento || ''));
      } else if (temValor) {
        concOther += toNumber(row.valor_venda_real || row.valor_lancamentos);
        relevantDocs.add(String(row.documento || ''));
      }

      if (row.venda_id) {
        concLinked += 1;
      }
    }

    return json(
      {
        period: { inicio, fim },
        vendas_base: {
          total_bruto: totalVendas,
          canceladas_status: vendasCanceladasStatus,
          recibos_cancelados_mesmo_mes: recibosCanceladosMesmoMes,
          count_sales: (vendasBase || []).length,
          count_vendas_id: vendaIds.length
        },
        conciliacao: {
          count_total: (concRecords || []).length,
          count_baixa: concCountBaixa,
          count_opfax: concCountOpfax,
          count_other_status: concCountOtherStatus,
          count_null_status: concCountNullStatus,
          total_baixa: concBaixa,
          total_opfax: concOpfax,
          total_other_with_valor: concOther,
          count_linked_to_venda: concLinked,
          count_relevant_docs: relevantDocs.size
        },
        conciliacao_sample: ((concRecords || []) as ConciliacaoDebugRow[])
          .slice(0, 5)
          .map((row) => ({
            id: row.id,
            documento: String(row.documento || '').replace(/\d(?=\d{4})/g, '*'),
            status: row.status,
            valor_lancamentos: row.valor_lancamentos,
            valor_venda_real: row.valor_venda_real,
            movimento_data: row.movimento_data,
            vinculada: Boolean(row.venda_id || row.venda_recibo_id)
          }))
      },
      { headers: DEBUG_HEADERS }
    );
  } catch (error) {
    logServerError('[dashboard/debug-aggregates]', error);
    return json(
      { error: 'Erro ao carregar diagnostico.' },
      { status: 500, headers: DEBUG_HEADERS }
    );
  }
}
