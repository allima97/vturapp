// Migrado para Hono de src/routes/api/v1/pagamentos/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  parseIntSafe,
  requireAuthenticatedUser,
  resolveScopedCompanyId,
  resolveScopedCompanyIds,
  resolveUserScope,
  sanitizePostgrestSearchTerm,
  toErrorResponse
} from '$lib/server/v1';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  invalidateReadModelCache,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { chunkArray, dedupeById, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

const MAX_PAGAMENTO_BODY_BYTES = 64 * 1024;
type PagamentoListRow = {
  id?: string | null;
  created_at?: string | null;
};
type PagamentoCreateBody = {
  venda_id?: unknown;
  forma_pagamento_id?: unknown;
  forma_nome?: unknown;
  forma_pagamento?: unknown;
  operacao?: unknown;
  plano?: unknown;
  valor_bruto?: unknown;
  valor?: unknown;
  desconto_valor?: unknown;
  valor_total?: unknown;
  parcelas?: unknown;
  parcelas_qtd?: unknown;
  parcelas_valor?: unknown;
  vencimento_primeira?: unknown;
  paga_comissao?: unknown;
  observacoes?: unknown;
  empresa_id?: unknown;
  company_id?: unknown;
};

function invalidatePagamentoReadModels(companyId: string | null | undefined, userId: string) {
  invalidateReadModelCache({
    tags: [
      READ_MODEL_TAGS.payments,
      READ_MODEL_TAGS.sales,
      READ_MODEL_TAGS.finance,
      READ_MODEL_TAGS.dashboard,
      READ_MODEL_TAGS.vendasKpis,
      READ_MODEL_TAGS.ranking,
      READ_MODEL_TAGS.comissoes
    ],
    scopeTags: scopeCacheTags({ companyIds: companyId ? [companyId] : [], userId })
  });
}

// GET - Listar pagamentos
export async function handlePagamentosGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['financeiro'], 1, 'Sem acesso ao Financeiro.');
    }

    const { searchParams } = event.url;
    const vendaId = searchParams.get('venda_id');
    const formaPagamentoId = searchParams.get('forma_pagamento_id');
    const rawBusca = sanitizePostgrestSearchTerm(searchParams.get('q'), 80);
    const busca = rawBusca.length >= 2 ? rawBusca : '';
    const page = Math.max(1, parseIntSafe(searchParams.get('page'), 1));
    const pageSize = Math.min(100, Math.max(1, parseIntSafe(searchParams.get('pageSize'), 50)));
    const companyIds = resolveScopedCompanyIds(scope, searchParams.get('empresa_id'));

    if (vendaId && !isUuid(vendaId)) {
      return json({ error: 'venda_id inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (formaPagamentoId && !isUuid(formaPagamentoId)) {
      return json(
        { error: 'forma_pagamento_id inválido.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const selectPagamentos = `
      id, venda_id, forma_pagamento_id, company_id, forma_nome, operacao, plano,
      valor_bruto, desconto_valor, valor_total, parcelas_qtd, parcelas_valor,
      vencimento_primeira, paga_comissao, observacoes, created_at, updated_at,
      venda:vendas!venda_id(id, numero_venda),
      forma_pagamento:formas_pagamento!forma_pagamento_id(id, nome)
    `;
    const from = (page - 1) * pageSize;
    const to = page * pageSize - 1;

    const buildQuery = (companyIdsFilter = companyIds, useRange = true) => {
      let query = client
        .from('vendas_pagamentos')
        .select(selectPagamentos, { count: 'exact' })
        .order('created_at', { ascending: false });

      if (useRange) {
        query = query.range(from, to);
      } else {
        query = query.limit(to + 1);
      }

      if (vendaId) query = query.eq('venda_id', vendaId);
      if (formaPagamentoId) query = query.eq('forma_pagamento_id', formaPagamentoId);
      if (companyIdsFilter.length > 0) query = query.in('company_id', companyIdsFilter);
      if (busca) {
        query = query.or(
          [
            `forma_nome.ilike.%${busca}%`,
            `operacao.ilike.%${busca}%`,
            `plano.ilike.%${busca}%`,
            `observacoes.ilike.%${busca}%`
          ].join(',')
        );
      }

      return query;
    };

    const result = await getCachedReadModel<{ items: PagamentoListRow[]; total: number }>({
      key: buildReadModelCacheKey('pagamentos:list', {
        vendaId,
        formaPagamentoId,
        companyIds,
        busca,
        page,
        pageSize
      }),
      tags: [
        READ_MODEL_TAGS.payments,
        READ_MODEL_TAGS.sales,
        ...scopeCacheTags({ companyIds, userId: user.id })
      ],
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        if (companyIds.length > QUERY_IN_BATCH_SIZE) {
          const rows: PagamentoListRow[] = [];
          let total = 0;
          for (const batch of chunkArray(companyIds)) {
            const { data, count, error } = await buildQuery(batch, false);
            if (error) throw error;
            total += Number(count ?? data?.length ?? 0);
            rows.push(...(data || []));
          }

          const items = dedupeById(rows)
            .sort((left, right) =>
              String(right?.created_at || '').localeCompare(String(left?.created_at || ''))
            )
            .slice(from, to + 1);

          return { items, total };
        }

        const { data, count, error } = await buildQuery();
        if (error) throw error;
        return {
          items: (data || []) as PagamentoListRow[],
          total: Number(count ?? data?.length ?? 0)
        };
      }
    });

    return json(
      { success: true, items: result.items, total: result.total, page, pageSize },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar pagamentos.');
  }
}

// POST - Criar novo pagamento de venda
export async function handlePagamentosPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_PAGAMENTO_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    ensureModuloAccess(scope, ['financeiro'], 2, 'Sem permissao para criar pagamentos.');

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as PagamentoCreateBody)
        : {};
    const vendaId = typeof body.venda_id === 'string' ? body.venda_id : '';
    const formaPagamentoId =
      typeof body.forma_pagamento_id === 'string' ? body.forma_pagamento_id : '';
    const requestedCompanyId =
      typeof body.empresa_id === 'string'
        ? body.empresa_id
        : typeof body.company_id === 'string'
          ? body.company_id
          : null;

    if (!isUuid(vendaId)) {
      return json(
        { success: false, error: 'ID da venda invalido.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (formaPagamentoId && !isUuid(formaPagamentoId)) {
      return json(
        { success: false, error: 'ID da forma de pagamento invalido.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { data: venda, error: vendaErr } = await client
      .from('vendas')
      .select('id, company_id')
      .eq('id', vendaId)
      .maybeSingle();

    if (vendaErr) throw vendaErr;
    if (!venda) {
      return json(
        { success: false, error: 'Venda nao encontrada.' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const vendaCompanyId = String(venda.company_id || '').trim();
    const targetCompanyId = resolveScopedCompanyId(scope, requestedCompanyId);

    if (!targetCompanyId) {
      return json(
        { success: false, error: 'Selecione uma empresa para criar o pagamento.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!vendaCompanyId || vendaCompanyId !== targetCompanyId) {
      return json(
        { success: false, error: 'Venda fora do escopo da empresa.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const { data, error } = await client
      .from('vendas_pagamentos')
      .insert([
        {
          venda_id: vendaId,
          company_id: targetCompanyId,
          forma_pagamento_id: formaPagamentoId || null,
          forma_nome: body.forma_nome || body.forma_pagamento || null,
          operacao: body.operacao || null,
          plano: body.plano || null,
          valor_bruto: body.valor_bruto || body.valor || null,
          desconto_valor: body.desconto_valor || null,
          valor_total: body.valor_total || body.valor || null,
          parcelas: body.parcelas || null,
          parcelas_qtd: body.parcelas_qtd || null,
          parcelas_valor: body.parcelas_valor || null,
          vencimento_primeira: body.vencimento_primeira || null,
          paga_comissao: body.paga_comissao ?? null,
          observacoes: body.observacoes || null
        }
      ])
      .select(
        'id, company_id, venda_id, forma_pagamento_id, forma_nome, operacao, plano, valor_bruto, desconto_valor, valor_total, parcelas_qtd, parcelas_valor, vencimento_primeira, paga_comissao, observacoes, created_at, updated_at'
      )
      .single();

    if (error) throw error;

    invalidatePagamentoReadModels(data?.company_id, user.id);

    return json({ success: true, item: data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao criar pagamento.');
  }
}
