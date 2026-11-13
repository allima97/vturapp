// Migrado para Hono de src/routes/api/v1/orcamentos/list/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  logServerError,
  normalizeText,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse,
  getMonthRange,
  toISODateLocal
} from '$lib/server/v1';
import {
  addDaysISODate,
  addMonthsISODate,
  monthRangeFromKey,
  parseISODateLocal,
  todayISODateLocal
} from '$lib/date';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { resolveQuoteCreatorScope } from '$lib/server/orcamentos';
import { chunkArray, QUERY_IN_BATCH_SIZE, uniqueCleanStrings } from '$lib/utils/array';
import { validadeDoOrcamento } from '$lib/quote/validade';

type OrcamentoRow = {
  id: string;
  created_at: string | null;
  status: string | null;
  status_negociacao: string | null;
  total: number | null;
  currency: string | null;
  raw_json?: unknown;
  client_id: string | null;
  client_name?: string | null;
  client_whatsapp?: string | null;
  client_email?: string | null;
  created_by: string | null;
  last_interaction_at?: string | null;
  last_interaction_notes?: string | null;
  cliente?: {
    id?: string | null;
    nome?: string | null;
    cpf?: string | null;
    email?: string | null;
  } | null;
};

type OrcamentoItemRow = {
  id?: string | null;
  quote_id?: string | null;
  title?: string | null;
  product_name?: string | null;
  item_type?: string | null;
  total_amount?: number | null;
  order_index?: number | null;
  city_name?: string | null;
};

function dedupeOrcamentos(rows: OrcamentoRow[]) {
  const map = new Map<string, OrcamentoRow>();
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (id && !map.has(id)) map.set(id, row);
  }
  return Array.from(map.values()).sort((left, right) =>
    String(right.created_at || '').localeCompare(String(left.created_at || ''))
  );
}

function addDays(isoDate: string | null, days: number) {
  return isoDate ? addDaysISODate(isoDate, days) : null;
}

export function deriveStatus(
  row: Pick<OrcamentoRow, 'status_negociacao' | 'status'>
): 'novo' | 'pendente' | 'enviado' | 'aprovado' | 'rejeitado' | 'expirado' | 'fechado' {
  const status = normalizeText(row.status_negociacao || row.status);

  if (status.includes('fech')) return 'fechado';
  if (status.includes('aprov')) return 'aprovado';
  if (status.includes('rejeit')) return 'rejeitado';
  if (status.includes('expir')) return 'expirado';
  if (status.includes('enviado') || status.includes('confirm')) return 'enviado';
  if (status.includes('novo')) return 'novo';

  return 'pendente';
}

function getPeriodoFilter(periodo: string | null): { from?: string; to?: string } | null {
  if (!periodo) return null;

  const hojeStr = todayISODateLocal();
  const hoje = parseISODateLocal(hojeStr) || new Date();

  switch (periodo) {
    case 'hoje': {
      return { from: hojeStr, to: hojeStr };
    }
    case 'semana': {
      const inicioSemana = new Date(hoje);
      inicioSemana.setDate(hoje.getDate() - hoje.getDay());
      return { from: toISODateLocal(inicioSemana), to: hojeStr };
    }
    case 'mes': {
      const { inicio, fim } = monthRangeFromKey(hojeStr.slice(0, 7)) || getMonthRange(hoje);
      return { from: inicio, to: fim };
    }
    case 'mes_passado': {
      const monthStart = `${hojeStr.slice(0, 7)}-01`;
      const mesPassado = addMonthsISODate(monthStart, -1).slice(0, 7);
      const { inicio, fim } = monthRangeFromKey(mesPassado) || getMonthRange(hoje);
      return { from: inicio, to: fim };
    }
    default:
      return null;
  }
}

export async function handleOrcamentosListGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Orcamentos'], 1, 'Sem acesso a Orcamentos.');
    }

    const searchParams = event.url.searchParams;
    const quoteScope = await resolveQuoteCreatorScope(client, scope, {
      companyId: searchParams.get('company_id') || searchParams.get('empresa_id'),
      vendedorRaw: searchParams.get('vendedor_ids') || searchParams.get('vendedor_id')
    });
    const companyIds = quoteScope.companyIds;
    const creatorIds = quoteScope.creatorIds;

    const statusFilter = searchParams.get('status');
    const periodoFilter = getPeriodoFilter(searchParams.get('periodo'));
    const shouldFilterByCreatorIds = !quoteScope.allAccess;
    const scopedCreatorIds = creatorIds;

    if (shouldFilterByCreatorIds && scopedCreatorIds.length === 0) {
      return json([], { headers: DYNAMIC_READ_HEADERS });
    }
    const listCacheParts = {
      companyIds,
      vendedorIds: creatorIds,
      userId: shouldFilterByCreatorIds ? user.id : null,
      creatorScopeCount: shouldFilterByCreatorIds ? scopedCreatorIds.length : 0,
      periodo: searchParams.get('periodo') || null
    };
    const listCacheTags = [
      READ_MODEL_TAGS.quote,
      READ_MODEL_TAGS.clients,
      READ_MODEL_TAGS.users,
      READ_MODEL_TAGS.catalog,
      ...scopeCacheTags({ companyIds, vendedorIds: creatorIds, userId: user.id })
    ];

    const joinedSelect = `
        id,
        created_at,
        status,
        status_negociacao,
        total,
        currency,
        raw_json,
        client_id,
        client_name,
        client_whatsapp,
        client_email,
        created_by,
        last_interaction_at,
        last_interaction_notes,
        cliente:client_id (id, nome, cpf, email)
      `;
    const fallbackSelect =
      'id, created_at, status, status_negociacao, total, currency, raw_json, client_id, client_name, client_whatsapp, client_email, created_by, last_interaction_at, last_interaction_notes';

    const buildQuoteQuery = (selectClause: string, creatorIdsFilter?: string[]) => {
      let query = client
        .from('quote')
        .select(selectClause)
        .order('created_at', { ascending: false })
        .limit(500);

      if (shouldFilterByCreatorIds && creatorIdsFilter) {
        query = query.in('created_by', creatorIdsFilter);
      }

      if (periodoFilter?.from && periodoFilter?.to) {
        query = query
          .gte('created_at', periodoFilter.from)
          .lte('created_at', periodoFilter.to + 'T23:59:59');
      }

      return query;
    };

    const fetchQuoteRows = async (selectClause: string) => {
      if (!shouldFilterByCreatorIds || scopedCreatorIds.length <= QUERY_IN_BATCH_SIZE) {
        return buildQuoteQuery(
          selectClause,
          shouldFilterByCreatorIds ? scopedCreatorIds : undefined
        );
      }

      const rows: OrcamentoRow[] = [];
      for (const batch of chunkArray(scopedCreatorIds)) {
        const result = await buildQuoteQuery(selectClause, batch);
        if (result.error) {
          return { data: null, error: result.error } as typeof result;
        }
        rows.push(...((result.data || []) as unknown as OrcamentoRow[]));
      }

      return { data: dedupeOrcamentos(rows).slice(0, 500), error: null };
    };

    const data = await getCachedReadModel<OrcamentoRow[]>({
      key: buildReadModelCacheKey('orcamentos-list:rows', listCacheParts),
      tags: listCacheTags,
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        const queryResult = await fetchQuoteRows(joinedSelect);
        const queryError = queryResult.error;

        if (!queryError) return (queryResult.data || []) as OrcamentoRow[];

        logServerError('[orcamentos/list] erro na query com join; usando fallback', queryError);
        const fallback = await fetchQuoteRows(fallbackSelect);
        if (fallback.error) throw fallback.error;
        return (fallback.data || []) as OrcamentoRow[];
      }
    });

    // Derivar IDs necessários para o enrichment
    const clientIdsFromData = uniqueCleanStrings(
      ((data || []) as OrcamentoRow[]).map((row) => row.client_id)
    );
    const quoteIds = ((data || []) as OrcamentoRow[])
      .map((row) => String(row.id || '').trim())
      .filter(Boolean);
    const rowCreatorIds = uniqueCleanStrings(
      ((data || []) as OrcamentoRow[]).map((row) => row.created_by)
    );

    // Os 3 enrichments são completamente independentes entre si — executar em paralelo.
    const [clientesData, quoteItems, creators] = await Promise.all([
      clientIdsFromData.length > 0
        ? getCachedReadModel<
            Array<{ id?: string | null; nome?: string | null; email?: string | null }>
          >({
            key: buildReadModelCacheKey('orcamentos-list:clientes-map', {
              clientIds: clientIdsFromData
            }),
            tags: listCacheTags,
            ttlMs: 120_000,
            staleTtlMs: 600_000,
            loader: async () => {
              const rows: Array<{
                id?: string | null;
                nome?: string | null;
                email?: string | null;
              }> = [];
              for (const batch of chunkArray(clientIdsFromData)) {
                const { data: batchRows, error } = await client
                  .from('clientes')
                  .select('id, nome, email')
                  .in('id', batch)
                  .limit(500);
                if (error) throw error;
                rows.push(...(batchRows || []));
              }
              return rows;
            }
          })
        : Promise.resolve([]),

      quoteIds.length > 0
        ? getCachedReadModel<OrcamentoItemRow[]>({
            key: buildReadModelCacheKey('orcamentos-list:items', listCacheParts),
            tags: listCacheTags,
            ttlMs: 120_000,
            staleTtlMs: 600_000,
            loader: async () => {
              const rows: OrcamentoItemRow[] = [];
              for (const batch of chunkArray(quoteIds)) {
                const withCity = await client
                  .from('quote_item')
                  .select(
                    'id, quote_id, title, product_name, item_type, total_amount, order_index, city_name'
                  )
                  .in('quote_id', batch)
                  .order('order_index', { ascending: true })
                  .limit(5000);
                if (withCity.error) {
                  const fallback = await client
                    .from('quote_item')
                    .select(
                      'id, quote_id, title, product_name, item_type, total_amount, order_index'
                    )
                    .in('quote_id', batch)
                    .order('order_index', { ascending: true })
                    .limit(5000);
                  if (fallback.error) throw fallback.error;
                  rows.push(...((fallback.data || []) as OrcamentoItemRow[]));
                } else {
                  rows.push(...((withCity.data || []) as OrcamentoItemRow[]));
                }
              }
              return rows;
            }
          })
        : Promise.resolve([]),

      rowCreatorIds.length > 0
        ? getCachedReadModel<
            Array<{ id?: string | null; nome_completo?: string | null; email?: string | null }>
          >({
            key: buildReadModelCacheKey('orcamentos-list:creators-map', {
              creatorIds: rowCreatorIds
            }),
            tags: listCacheTags,
            ttlMs: 120_000,
            staleTtlMs: 600_000,
            loader: async () => {
              const rows: Array<{
                id?: string | null;
                nome_completo?: string | null;
                email?: string | null;
              }> = [];
              for (const batch of chunkArray(rowCreatorIds)) {
                const { data: batchRows, error } = await client
                  .from('users')
                  .select('id, nome_completo, email')
                  .in('id', batch)
                  .limit(500);
                if (error) throw error;
                rows.push(...(batchRows || []));
              }
              return rows;
            }
          })
        : Promise.resolve([])
    ]);

    // Montar mapas a partir dos dados em paralelo
    const clienteMap = new Map<string, { nome: string; email: string }>();
    for (const c of clientesData) {
      clienteMap.set(String(c.id || ''), {
        nome: String(c.nome || 'Cliente'),
        email: String(c.email || '')
      });
    }

    const quoteItemsMap = new Map<string, OrcamentoItemRow[]>();
    for (const item of quoteItems) {
      const quoteId = String(item.quote_id || '').trim();
      if (!quoteId) continue;
      const current = quoteItemsMap.get(quoteId) || [];
      current.push(item);
      quoteItemsMap.set(quoteId, current);
    }

    const creatorMap = new Map<string, { nome: string; email: string }>();
    for (const row of creators) {
      const id = String(row?.id || '').trim();
      if (!id) continue;
      creatorMap.set(id, {
        nome: String(row?.nome_completo || 'Equipe VTUR'),
        email: String(row?.email || '')
      });
    }

    let items = ((data || []) as OrcamentoRow[]).map((row) => {
      const quoteItems = quoteItemsMap.get(String(row.id || '').trim()) || [];
      const firstItem = quoteItems[0] || null;
      const itensCount = quoteItems.length;
      const vendedor = creatorMap.get(String(row.created_by || '').trim());
      const status = deriveStatus(row);

      return {
        id: row.id,
        codigo: `ORC-${row.id.slice(0, 8).toUpperCase()}`,
        cliente: String(
          row.cliente?.nome ||
            row.client_name ||
            clienteMap.get(String(row.client_id || ''))?.nome ||
            'Cliente sem nome'
        ),
        cliente_id: String(row.client_id || ''),
        cliente_email: String(
          row.cliente?.email ||
            row.client_email ||
            clienteMap.get(String(row.client_id || ''))?.email ||
            ''
        ),
        cliente_telefone: String(row.client_whatsapp || ''),
        destino: String(
          firstItem?.city_name ||
            firstItem?.product_name ||
            firstItem?.title ||
            'Orçamento sem itens'
        ),
        created_at: row.created_at || null,
        data_criacao: row.created_at?.slice(0, 10) || null,
        data_validade: validadeDoOrcamento(row.raw_json) || addDays(row.created_at, 30),
        valor_total: Number(row.total || 0),
        status: status,
        status_negociacao: row.status_negociacao || row.status,
        vendedor: vendedor?.nome || 'Equipe VTUR',
        vendedor_id: String(row.created_by || ''),
        origem: 'manual',
        quantidade_itens: itensCount,
        currency: row.currency || 'BRL',
        last_interaction_at: row.last_interaction_at || null,
        last_interaction_notes: row.last_interaction_notes || null
      };
    });

    if (statusFilter) {
      items = items.filter((item) => item.status === statusFilter);
    }

    return json(items, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar orcamentos.');
  }
}
