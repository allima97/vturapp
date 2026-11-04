// Migrado para Hono de src/routes/api/v1/financeiro/caixa/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveScopedCompanyId,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse,
  toISODateLocal,
  getMonthRange
} from '$lib/server/v1';
import { addDaysISODate, parseISODateLocal, todayISODateLocal } from '$lib/date';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  invalidateReadModelCache,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { chunkArray } from '$lib/utils/array';

const MAX_CAIXA_MOVIMENTACAO_BODY_BYTES = 32 * 1024;

type JsonBody = Record<string, unknown>;

type PagamentoCaixaRow = {
  id?: string | null;
  venda_id?: string | null;
  forma_nome?: string | null;
  valor_total?: number | string | null;
  created_at?: string | null;
  venda?: RelationRow<{
    numero_venda?: string | null;
  }>;
};

type MovimentoCaixaRow = {
  id?: string | null;
  tipo?: string | null;
  categoria?: string | null;
  descricao?: string | null;
  valor?: number | string | null;
  data_movimentacao?: string | null;
  forma_pagamento?: RelationRow<{
    nome?: string | null;
  }>;
};

type RelationRow<T> = T | T[] | null | undefined;

function optionalString(value: unknown) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function firstRelation<T>(value: RelationRow<T>) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export async function handleFinanceiroCaixaGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['financeiro'], 1, 'Sem acesso ao Financeiro.');
    }

    const { searchParams } = event.url;
    const periodo = searchParams.get('periodo') || 'mes_atual';
    const dataInicio = searchParams.get('data_inicio');
    const dataFim = searchParams.get('data_fim');
    const companyIds = resolveScopedCompanyIds(scope, searchParams.get('empresa_id'));

    let inicio: string;
    let fim: string;
    if (dataInicio && dataFim) {
      inicio = dataInicio;
      fim = dataFim;
    } else if (periodo === 'semana') {
      const hojeIso = todayISODateLocal();
      const hoje = parseISODateLocal(hojeIso) || new Date();
      const sete = new Date(hoje);
      sete.setDate(hoje.getDate() - 7);
      inicio = addDaysISODate(hojeIso, -7) || toISODateLocal(sete);
      fim = hojeIso;
    } else {
      const range = getMonthRange();
      inicio = range.inicio;
      fim = range.fim;
    }

    // Pagamentos e movimentações são completamente independentes — executar em paralelo.
    const [pagamentos, movimentacoes] = await Promise.all([
      getCachedReadModel<PagamentoCaixaRow[]>({
        key: buildReadModelCacheKey('caixa:pagamentos', { companyIds, inicio, fim }),
        tags: [
          READ_MODEL_TAGS.finance,
          READ_MODEL_TAGS.payments,
          READ_MODEL_TAGS.sales,
          ...scopeCacheTags({ companyIds, userId: user.id })
        ],
        ttlMs: 120_000,
        staleTtlMs: 600_000,
        loader: async () => {
          const rows: PagamentoCaixaRow[] = [];
          const companyBatches = companyIds.length > 0 ? chunkArray(companyIds) : [null];
          for (const companyBatch of companyBatches) {
            let pagamentosQuery = client
              .from('vendas_pagamentos')
              .select(
                'id, venda_id, forma_nome, valor_total, created_at, venda:vendas!venda_id(numero_venda, cliente_id, data_venda, company_id)'
              )
              .gte('created_at', inicio + 'T00:00:00')
              .lte('created_at', fim + 'T23:59:59');
            if (companyBatch) pagamentosQuery = pagamentosQuery.in('company_id', companyBatch);
            const { data, error: pagError } = await pagamentosQuery;
            if (pagError) {
              logServerError('[caixa] Erro pagamentos', pagError);
              continue;
            }
            rows.push(...(data || []));
          }
          return rows;
        }
      }),
      getCachedReadModel<MovimentoCaixaRow[]>({
        key: buildReadModelCacheKey('caixa:movimentacoes', { companyIds, inicio, fim }),
        tags: [READ_MODEL_TAGS.finance, ...scopeCacheTags({ companyIds, userId: user.id })],
        ttlMs: 120_000,
        staleTtlMs: 600_000,
        loader: async () => {
          const rows: MovimentoCaixaRow[] = [];
          const companyBatches = companyIds.length > 0 ? chunkArray(companyIds) : [null];
          for (const companyBatch of companyBatches) {
            let movQuery = client
              .from('caixa_movimentacoes')
              .select(
                'id, tipo, categoria, descricao, valor, data_movimentacao, forma_pagamento:forma_pagamento_id(id, nome)'
              )
              .gte('data_movimentacao', inicio)
              .lte('data_movimentacao', fim)
              .order('data_movimentacao', { ascending: false });
            if (companyBatch) movQuery = movQuery.in('company_id', companyBatch);
            const { data, error: movError } = await movQuery;
            if (movError) {
              logServerError('[caixa] caixa_movimentacoes', movError);
              continue;
            }
            rows.push(...(data || []));
          }
          return rows;
        }
      })
    ]);

    const pagItems = pagamentos || [];
    const movItems = movimentacoes || [];

    const totalEntradasPagamentos = pagItems.reduce(
      (sum, p) => sum + Number(p.valor_total || 0),
      0
    );
    const totalEntradasMovimentacoes = movItems
      .filter((m) => String(m.tipo || '').toLowerCase() === 'entrada')
      .reduce((sum, m) => sum + Number(m.valor || 0), 0);
    const totalSaidas = movItems
      .filter((m) => String(m.tipo || '').toLowerCase() === 'saida')
      .reduce((sum, m) => sum + Number(m.valor || 0), 0);

    const totalEntradas = totalEntradasPagamentos + totalEntradasMovimentacoes;
    const saldo = totalEntradas - totalSaidas;

    const porFormaPagamento = new Map();
    for (const p of pagItems) {
      const fp = p.forma_nome || 'Nao especificado';
      const atual = porFormaPagamento.get(fp) || { nome: fp, valor: 0, quantidade: 0 };
      atual.valor += Number(p.valor_total || 0);
      atual.quantidade += 1;
      porFormaPagamento.set(fp, atual);
    }

    for (const m of movItems) {
      const formaPagamento = firstRelation(m.forma_pagamento);
      const fp = formaPagamento?.nome || 'Nao especificado';
      const atual = porFormaPagamento.get(fp) || { nome: fp, valor: 0, quantidade: 0 };
      const sinal = String(m.tipo || '').toLowerCase() === 'saida' ? -1 : 1;
      atual.valor += sinal * Number(m.valor || 0);
      atual.quantidade += 1;
      porFormaPagamento.set(fp, atual);
    }

    const movimentacoesUnificadas = [
      ...pagItems.map((p) => {
        const venda = firstRelation(p.venda);

        return {
          id: p.id,
          tipo: 'entrada',
          categoria: 'venda',
          descricao: `Pagamento ${venda?.numero_venda || p.venda_id?.slice(0, 8) || ''}`,
          valor: Number(p.valor_total || 0),
          data: p.created_at?.slice(0, 10) || '',
          forma_pagamento: p.forma_nome || '-',
          status: 'confirmado',
          cliente: '-',
          origem: 'pagamento'
        };
      }),
      ...movItems.map((m) => {
        const formaPagamento = firstRelation(m.forma_pagamento);

        return {
          id: m.id,
          tipo: m.tipo,
          categoria: m.categoria,
          descricao: m.descricao,
          valor: Number(m.valor || 0),
          data: m.data_movimentacao || '',
          forma_pagamento: formaPagamento?.nome || '-',
          status: 'confirmado',
          cliente: '-',
          origem: 'caixa'
        };
      })
    ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    return json(
      {
        success: true,
        periodo: { inicio, fim },
        resumo: {
          totalEntradas,
          totalSaidas,
          totalPendente: 0,
          totalDivergente: 0,
          totalMovimentacoes: movimentacoesUnificadas.length,
          saldo
        },
        porFormaPagamento: Array.from(porFormaPagamento.values()),
        movimentacoes: movimentacoesUnificadas
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar resumo do caixa.');
  }
}

export async function handleFinanceiroCaixaPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CAIXA_MOVIMENTACAO_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    ensureModuloAccess(scope, ['financeiro'], 2, 'Sem permissao para criar movimentacoes.');

    const body =
      bodyResult.data && typeof bodyResult.data === 'object' ? (bodyResult.data as JsonBody) : {};
    if (!body.tipo || !body.descricao || body.valor === undefined || !body.data_movimentacao) {
      return json(
        { success: false, error: 'Tipo, descricao, valor e data sao obrigatorios.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const companyId = resolveScopedCompanyId(
      scope,
      optionalString(body.empresa_id || body.company_id)
    );
    if (!companyId) {
      return json(
        { success: false, error: 'Selecione uma empresa para criar movimentação.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { data, error } = await client
      .from('caixa_movimentacoes')
      .insert([
        {
          company_id: companyId,
          tipo: body.tipo,
          categoria: body.categoria || 'outro',
          descricao: body.descricao,
          valor: body.valor,
          data_movimentacao: body.data_movimentacao,
          forma_pagamento_id: body.forma_pagamento_id || null,
          observacoes: body.observacoes || null,
          user_id: user.id
        }
      ])
      .select(
        'id, company_id, tipo, categoria, descricao, valor, data_movimentacao, forma_pagamento_id, observacoes, user_id'
      )
      .single();

    if (error) {
      if (
        String(error.code || '').includes('42P01') ||
        String(error.message || '').includes('does not exist')
      ) {
        return json(
          { success: true, item: { id: crypto.randomUUID(), ...body, company_id: companyId } },
          { headers: NO_STORE_HEADERS }
        );
      }
      throw error;
    }

    const financeScopeTags = scopeCacheTags({
      companyIds: data?.company_id ? [data.company_id] : [],
      userId: user.id
    });
    invalidateReadModelCache({
      tags: [READ_MODEL_TAGS.finance],
      scopeTags: financeScopeTags
    });

    return json({ success: true, item: data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao criar movimentacao.');
  }
}
