// Migrado para Hono de src/routes/api/v1/clientes/list/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  fetchRankingVendedoresByCompanyIds,
  getAdminClient,
  logServerError,
  parseIntSafe,
  requireAuthenticatedUser,
  resolveAccessibleClientIds,
  resolveScopedCompanyIds,
  resolveScopedVendedorIds,
  resolveUserScope,
  sanitizePostgrestSearchTerm,
  toErrorResponse
} from '$lib/server/v1';
import {
  canUseCompanyClienteScope,
  deriveClienteStatus,
  ensureClienteModuloAccess,
  formatDocumentoDisplay,
  isBirthdayToday,
  matchesClienteBusca,
  resolveCompanyClienteIds
} from '$lib/server/clientes';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import {
  cleanStringSet,
  chunkArray,
  dedupeById as dedupeRowsById,
  filterBatches,
  QUERY_IN_BATCH_SIZE,
  uniqueCleanStrings
} from '$lib/utils/array';

const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

type ClienteBaseRow = {
  id: string;
  nome: string | null;
  cpf: string | null;
  nascimento: string | null;
  telefone: string | null;
  email: string | null;
  whatsapp: string | null;
  cidade: string | null;
  estado: string | null;
  classificacao: string | null;
  tipo_pessoa: string | null;
  tipo_cliente: string | null;
  tags: string[] | null;
  active: boolean | null;
  ativo: boolean | null;
  company_id: string | null;
  created_at: string | null;
};

type FetchClientsResult = {
  data?: ClienteBaseRow[] | null;
  count?: number | null;
  error?: unknown;
};

type VendaResumoRow = {
  cliente_id: string | null;
  data_venda: string | null;
  valor_total: number | null;
};

type QuoteResumoRow = {
  client_id: string | null;
  created_at: string | null;
  created_by: string | null;
};

type ClienteLookupRow = {
  id: string;
  nome: string | null;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  cidade: string | null;
  estado: string | null;
  company_id: string | null;
  active: boolean | null;
  ativo: boolean | null;
};

const CLIENT_SELECT_FULL =
  'id, nome, cpf, nascimento, telefone, email, whatsapp, cidade, estado, classificacao, tipo_pessoa, tipo_cliente, tags, active, ativo, company_id, created_at';
const CLIENT_SELECT_SUMMARY = 'id, cpf, nascimento, active, ativo, company_id, created_at';

export async function handleClientesListGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) ensureClienteModuloAccess(scope, 1, 'Sem acesso a Clientes.');

    const { searchParams } = event.url;
    const page = parseIntSafe(searchParams.get('page'), 1);
    const pageSize = Math.min(200, parseIntSafe(searchParams.get('pageSize'), 20));
    const all = String(searchParams.get('all') || '').trim() === '1';
    const busca = String(searchParams.get('busca') || searchParams.get('q') || '').trim();
    const statusQuery = String(searchParams.get('status') || '')
      .trim()
      .toLowerCase();
    const estadoQuery = String(searchParams.get('estado') || '')
      .trim()
      .toUpperCase();
    const tipoPessoaQuery = String(searchParams.get('tipo_pessoa') || '')
      .trim()
      .toUpperCase();
    const classificacaoQuery = String(searchParams.get('classificacao') || '')
      .trim()
      .toUpperCase();
    const aniversarioHojeQuery = String(searchParams.get('aniversario_hoje') || '')
      .trim()
      .toLowerCase();
    const includeSummary = String(searchParams.get('include_summary') || '').trim() === '1';
    const summaryOnly = String(searchParams.get('summary_only') || '').trim() === '1';
    const lookupOnly = String(searchParams.get('lookup') || '').trim() === '1';
    const summaryFastPath = summaryOnly && !busca;
    const dbSearchTerm = sanitizePostgrestSearchTerm(busca, 60);
    const dbSearchDigits = busca.replace(/\D/g, '').slice(0, 30);
    const canPushBuscaToDb =
      Boolean(busca) && (dbSearchTerm.length >= 2 || dbSearchDigits.length >= 2);

    const requestedVendedorRaw =
      searchParams.get('vendedor_ids') || searchParams.get('vendedor_id');
    const companyIds = resolveScopedCompanyIds(scope, searchParams.get('empresa_id'));
    const companyIdSet = cleanStringSet(companyIds);
    const vendedorIds = await resolveScopedVendedorIds(client, scope, requestedVendedorRaw);
    const canUseCompanyScope = canUseCompanyClienteScope(scope, requestedVendedorRaw);

    const companyClientIds =
      canUseCompanyScope && companyIds.length > 0
        ? await resolveCompanyClienteIds(client, companyIds)
        : null;
    const accessibleClientIds = canUseCompanyScope
      ? null
      : await resolveAccessibleClientIds(client, { companyIds, vendedorIds });
    const scopedClientIds = companyClientIds || accessibleClientIds;
    const cacheScopeTags = scopeCacheTags({ companyIds, vendedorIds, userId: user.id });
    const listCacheTags = [
      READ_MODEL_TAGS.clients,
      READ_MODEL_TAGS.sales,
      READ_MODEL_TAGS.quote,
      ...cacheScopeTags
    ];

    if (scopedClientIds && scopedClientIds.length === 0) {
      return json(
        {
          page,
          pageSize,
          total: 0,
          items: []
        },
        { headers: DYNAMIC_READ_HEADERS }
      );
    }

    if (lookupOnly) {
      const searchTerm = sanitizePostgrestSearchTerm(busca, 60);
      const digits = busca.replace(/\D/g, '').slice(0, 30);
      const lookupLimit = Math.min(50, Math.max(5, pageSize || 15));

      if (searchTerm.length < 2 && digits.length < 2) {
        return json(
          {
            page,
            pageSize: lookupLimit,
            total: 0,
            items: []
          },
          { headers: DYNAMIC_READ_HEADERS }
        );
      }

      const orParts = [
        searchTerm ? `nome.ilike.%${searchTerm}%` : '',
        searchTerm ? `email.ilike.%${searchTerm}%` : '',
        searchTerm ? `cidade.ilike.%${searchTerm}%` : '',
        searchTerm ? `estado.ilike.%${searchTerm}%` : '',
        digits ? `cpf.ilike.%${digits}%` : '',
        digits ? `telefone.ilike.%${digits}%` : '',
        digits ? `whatsapp.ilike.%${digits}%` : ''
      ].filter(Boolean);

      const buildLookupQuery = (clientIds?: string[], companyIdsFilter = companyIds) => {
        let lookupQuery = client
          .from('clientes')
          .select(
            'id, nome, cpf, email, telefone, whatsapp, cidade, estado, company_id, active, ativo'
          )
          .order('nome', { ascending: true })
          .limit(lookupLimit);

        if (orParts.length > 0) {
          lookupQuery = lookupQuery.or(orParts.join(','));
        }

        if (clientIds) {
          lookupQuery = lookupQuery.in('id', clientIds);
        } else if (companyIdsFilter.length > 0) {
          lookupQuery = lookupQuery.in('company_id', companyIdsFilter);
        }

        return lookupQuery;
      };

      const fetchLookupRows = async () => {
        if (!scopedClientIds) {
          if (companyIds.length > QUERY_IN_BATCH_SIZE) {
            const rows: ClienteLookupRow[] = [];
            for (const batch of chunkArray(companyIds)) {
              const result = await buildLookupQuery(undefined, batch);
              if (result.error) {
                return { data: null, error: result.error } as typeof result;
              }
              rows.push(...((result.data || []) as unknown as ClienteLookupRow[]));
              if (dedupeRowsById(rows).length >= lookupLimit) break;
            }

            return {
              data: dedupeRowsById(rows)
                .sort((left, right) =>
                  PT_BR_COLLATOR.compare(String(left.nome || ''), String(right.nome || ''))
                )
                .slice(0, lookupLimit),
              error: null
            };
          }

          return buildLookupQuery();
        }

        if (scopedClientIds.length <= QUERY_IN_BATCH_SIZE) {
          return buildLookupQuery(scopedClientIds);
        }

        const rows: ClienteLookupRow[] = [];
        for (const batch of chunkArray(scopedClientIds)) {
          const result = await buildLookupQuery(batch);
          if (result.error) {
            return { data: null, error: result.error } as typeof result;
          }
          rows.push(...((result.data || []) as unknown as ClienteLookupRow[]));
          if (dedupeRowsById(rows).length >= lookupLimit) break;
        }

        return {
          data: dedupeRowsById(rows)
            .sort((left, right) =>
              PT_BR_COLLATOR.compare(String(left.nome || ''), String(right.nome || ''))
            )
            .slice(0, lookupLimit),
          error: null
        };
      };

      const { data: lookupRows, error: lookupError } = await fetchLookupRows();
      if (lookupError) throw lookupError;

      const items = ((lookupRows || []) as ClienteLookupRow[]).map((row) => {
        const tags: string[] = [];
        const contato = [row.whatsapp, row.telefone, row.email].filter(Boolean).join(' | ');
        const cidadeUf = [row.cidade, row.estado].filter(Boolean).join('/');
        return {
          id: row.id,
          nome: String(row.nome || 'Cliente sem nome'),
          cpf: row.cpf,
          documento: formatDocumentoDisplay(row.cpf),
          email: row.email,
          telefone: row.telefone,
          whatsapp: row.whatsapp,
          contato,
          cidade: row.cidade,
          estado: row.estado,
          cidade_uf: cidadeUf,
          tags,
          tags_text: '',
          status: row.active === false || row.ativo === false ? 'inativo' : 'prospect',
          ativo: row.ativo !== false
        };
      });

      return json(
        {
          page,
          pageSize: lookupLimit,
          total: items.length,
          items
        },
        { headers: DYNAMIC_READ_HEADERS }
      );
    }

    const canUseDbPagination =
      !all &&
      (!busca || canPushBuscaToDb) &&
      !statusQuery &&
      !aniversarioHojeQuery &&
      companyIds.length <= QUERY_IN_BATCH_SIZE &&
      (!scopedClientIds || scopedClientIds.length <= QUERY_IN_BATCH_SIZE);
    const canUseScopeAggregateSummaries =
      summaryFastPath &&
      canUseCompanyScope &&
      (companyIds.length > 0 || vendedorIds.length > 0) &&
      !estadoQuery &&
      !tipoPessoaQuery &&
      !classificacaoQuery &&
      !statusQuery &&
      !aniversarioHojeQuery;

    const buildClientsQuery = (
      clientIds?: string[],
      useRange = false,
      companyIdsFilter = companyIds
    ) => {
      const selectFields = summaryFastPath ? CLIENT_SELECT_SUMMARY : CLIENT_SELECT_FULL;
      let clientsQuery = (
        useRange
          ? client.from('clientes').select(selectFields, { count: 'exact' })
          : client.from('clientes').select(selectFields)
      ).order('created_at', { ascending: false });

      if (useRange) {
        clientsQuery = clientsQuery.range(
          (page - 1) * pageSize,
          (page - 1) * pageSize + pageSize - 1
        );
      } else {
        clientsQuery = clientsQuery.limit(5000);
      }

      if (clientIds) {
        clientsQuery = clientsQuery.in('id', clientIds);
      } else if (companyIdsFilter.length > 0) {
        clientsQuery = clientsQuery.in('company_id', companyIdsFilter);
      }
      if (canPushBuscaToDb) {
        const orParts = [
          dbSearchTerm ? `nome.ilike.%${dbSearchTerm}%` : '',
          dbSearchTerm ? `email.ilike.%${dbSearchTerm}%` : '',
          dbSearchTerm ? `cidade.ilike.%${dbSearchTerm}%` : '',
          dbSearchTerm ? `estado.ilike.%${dbSearchTerm}%` : '',
          dbSearchDigits ? `cpf.ilike.%${dbSearchDigits}%` : '',
          dbSearchDigits ? `telefone.ilike.%${dbSearchDigits}%` : '',
          dbSearchDigits ? `whatsapp.ilike.%${dbSearchDigits}%` : ''
        ].filter(Boolean);
        if (orParts.length > 0) clientsQuery = clientsQuery.or(orParts.join(','));
      }
      if (estadoQuery) clientsQuery = clientsQuery.eq('estado', estadoQuery);
      if (tipoPessoaQuery) clientsQuery = clientsQuery.eq('tipo_pessoa', tipoPessoaQuery);
      if (classificacaoQuery) clientsQuery = clientsQuery.eq('classificacao', classificacaoQuery);

      return clientsQuery;
    };

    const fetchClients = async () => {
      if (canUseDbPagination) {
        return buildClientsQuery(scopedClientIds || undefined, true);
      }

      if (!scopedClientIds || scopedClientIds.length <= QUERY_IN_BATCH_SIZE) {
        if (!scopedClientIds && companyIds.length > QUERY_IN_BATCH_SIZE) {
          const rows: ClienteBaseRow[] = [];
          for (const batch of chunkArray(companyIds)) {
            const result = await buildClientsQuery(undefined, false, batch);
            if (result.error) {
              return { data: null, error: result.error } as typeof result;
            }
            rows.push(...((result.data || []) as unknown as ClienteBaseRow[]));
          }

          return {
            data: dedupeRowsById(rows).sort((left, right) =>
              String(right.created_at || '').localeCompare(String(left.created_at || ''))
            ),
            error: null
          };
        }

        return buildClientsQuery(scopedClientIds || undefined);
      }

      const rows: ClienteBaseRow[] = [];
      for (const batch of chunkArray(scopedClientIds)) {
        const result = await buildClientsQuery(batch);
        if (result.error) {
          return { data: null, error: result.error } as typeof result;
        }
        rows.push(...((result.data || []) as unknown as ClienteBaseRow[]));
      }

      return {
        data: dedupeRowsById(rows).sort((left, right) =>
          String(right.created_at || '').localeCompare(String(left.created_at || ''))
        ),
        error: null
      };
    };

    const clientsResult = await getCachedReadModel<{
      data: ClienteBaseRow[];
      count: number | null;
    }>({
      key: buildReadModelCacheKey('clientes-list:clients', {
        companyIds,
        vendedorIds,
        userId: canUseCompanyScope ? null : user.id,
        individualClientIds: scope.usoIndividual ? scopedClientIds : null,
        page,
        pageSize,
        all,
        busca,
        summaryFastPath,
        canUseDbPagination,
        canPushBuscaToDb,
        estadoQuery,
        tipoPessoaQuery,
        classificacaoQuery
      }),
      tags: listCacheTags,
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        const result = (await fetchClients()) as FetchClientsResult;
        if (result?.error) throw result.error;
        return {
          data: (result?.data || []) as ClienteBaseRow[],
          count: typeof result?.count === 'number' ? result.count : null
        };
      }
    });
    const clientsData = clientsResult.data;
    const clientsCount = clientsResult.count;

    const clientIds = ((clientsData || []) as ClienteBaseRow[]).map((row) => row.id);
    const summaryClientIds = canUseScopeAggregateSummaries
      ? []
      : canUseDbPagination
        ? clientIds
        : scopedClientIds || clientIds;

    const buildSalesQuery = (
      clientIdsFilter?: string[],
      companyIdsFilter = companyIds,
      vendedorIdsFilter = vendedorIds
    ) => {
      let salesQuery = client
        .from('vendas')
        .select('cliente_id, data_venda, valor_total')
        .eq('cancelada', false)
        .not('cliente_id', 'is', null)
        .limit(5000);

      if (companyIdsFilter.length > 0) {
        salesQuery = salesQuery.in('company_id', companyIdsFilter);
      }
      if (vendedorIdsFilter.length > 0) {
        salesQuery = salesQuery.in('vendedor_id', vendedorIdsFilter);
      }
      if (clientIdsFilter) {
        salesQuery = salesQuery.in('cliente_id', clientIdsFilter);
      }

      return salesQuery;
    };

    const fetchSales = async () => {
      if (!canUseScopeAggregateSummaries && summaryClientIds.length === 0) {
        return { data: [], error: null };
      }

      const rows: VendaResumoRow[] = [];
      const clientBatches = canUseScopeAggregateSummaries
        ? [undefined]
        : chunkArray(summaryClientIds);
      for (const companyBatch of filterBatches(companyIds)) {
        for (const vendedorBatch of filterBatches(vendedorIds)) {
          for (const clientBatch of clientBatches) {
            const result = await buildSalesQuery(clientBatch, companyBatch, vendedorBatch);
            if (result.error) {
              return { data: null, error: result.error } as typeof result;
            }
            rows.push(...((result.data || []) as unknown as VendaResumoRow[]));
          }
        }
      }

      return { data: rows, error: null };
    };

    const salesData = await getCachedReadModel<VendaResumoRow[]>({
      key: buildReadModelCacheKey('clientes-list:sales', {
        companyIds,
        vendedorIds,
        userId: canUseCompanyScope ? null : user.id,
        page: canUseDbPagination ? page : null,
        pageSize: canUseDbPagination ? pageSize : null,
        all,
        busca,
        canUseDbPagination,
        canPushBuscaToDb,
        summaryFastPath,
        estadoQuery,
        tipoPessoaQuery,
        classificacaoQuery,
        statusQuery,
        aniversarioHojeQuery,
        canUseScopeAggregateSummaries,
        summaryClientCount: summaryClientIds.length
      }),
      tags: listCacheTags,
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        const result = await fetchSales();
        if (result.error) throw result.error;
        return (result.data || []) as VendaResumoRow[];
      }
    });

    const buildQuotesQuery = (
      clientIdsFilter?: string[],
      creatorIdsFilter?: string[],
      vendedorIdsFallback = vendedorIds
    ) => {
      let quotesQuery = client
        .from('quote')
        .select('client_id, created_at, created_by')
        .not('client_id', 'is', null)
        .limit(5000);

      if (clientIdsFilter) {
        quotesQuery = quotesQuery.in('client_id', clientIdsFilter);
      }
      if (creatorIdsFilter) {
        quotesQuery = quotesQuery.in('created_by', creatorIdsFilter);
      } else if (vendedorIdsFallback.length > 0) {
        quotesQuery = quotesQuery.in('created_by', vendedorIdsFallback);
      }

      return quotesQuery;
    };

    const fetchQuotesByCreatorIds = async (creatorIdsFilter: string[]) => {
      const normalizedCreatorIds = uniqueCleanStrings(creatorIdsFilter);
      if (normalizedCreatorIds.length === 0) return { data: [], error: null };

      if (normalizedCreatorIds.length <= QUERY_IN_BATCH_SIZE) {
        return buildQuotesQuery(undefined, normalizedCreatorIds);
      }

      const rows: QuoteResumoRow[] = [];
      for (const batch of chunkArray(normalizedCreatorIds)) {
        const result = await buildQuotesQuery(undefined, batch);
        if (result.error) {
          return { data: null, error: result.error } as typeof result;
        }
        rows.push(...((result.data || []) as unknown as QuoteResumoRow[]));
      }

      return { data: rows, error: null };
    };

    const fetchQuotes = async () => {
      if (canUseScopeAggregateSummaries) {
        if (vendedorIds.length > 0) {
          return fetchQuotesByCreatorIds(vendedorIds);
        }

        const creators =
          companyIds.length > 0 ? await fetchRankingVendedoresByCompanyIds(client, companyIds) : [];
        const creatorIdsForScope = ((creators || []) as Array<{ id?: string | null }>)
          .map((row) => String(row?.id || '').trim())
          .filter(Boolean);
        return fetchQuotesByCreatorIds(creatorIdsForScope);
      }

      if (clientIds.length === 0) {
        return { data: [], error: null };
      }

      const rows: QuoteResumoRow[] = [];
      const clientBatches = chunkArray(clientIds);
      const vendedorBatches = filterBatches(vendedorIds);
      for (const clientBatch of clientBatches) {
        for (const vendedorBatch of vendedorBatches) {
          const result = await buildQuotesQuery(clientBatch, undefined, vendedorBatch);
          if (result.error) {
            return { data: null, error: result.error } as typeof result;
          }
          rows.push(...((result.data || []) as unknown as QuoteResumoRow[]));
        }
      }

      return { data: rows, error: null };
    };

    let quotesData: QuoteResumoRow[] = [];
    try {
      quotesData = await getCachedReadModel<QuoteResumoRow[]>({
        key: buildReadModelCacheKey('clientes-list:quotes', {
          companyIds,
          vendedorIds,
          userId: canUseCompanyScope ? null : user.id,
          page: canUseDbPagination ? page : null,
          pageSize: canUseDbPagination ? pageSize : null,
          all,
          busca,
          canUseDbPagination,
          canPushBuscaToDb,
          summaryFastPath,
          estadoQuery,
          tipoPessoaQuery,
          classificacaoQuery,
          statusQuery,
          aniversarioHojeQuery,
          canUseScopeAggregateSummaries,
          clientCount: clientIds.length
        }),
        tags: listCacheTags,
        ttlMs: 120_000,
        staleTtlMs: 600_000,
        loader: async () => {
          const result = await fetchQuotes();
          if (result.error) throw result.error;
          return (result.data || []) as QuoteResumoRow[];
        }
      });
    } catch (quotesError) {
      // Tabela quote pode não existir em todos os ambientes — não bloqueia
      logServerError('[clientes/list] Erro ao buscar quotes', quotesError);
    }

    let creatorCompanyMap = new Map<string, string>();
    const creatorIds = Array.from(
      new Set(
        ((quotesData || []) as QuoteResumoRow[])
          .map((row) => String(row.created_by || '').trim())
          .filter(Boolean)
      )
    );

    if (companyIds.length > 0 && creatorIds.length > 0) {
      const creatorsRows: Array<{ id?: string | null; company_id?: string | null }> = [];

      for (const batch of chunkArray(creatorIds)) {
        const { data: creators } = await client
          .from('users')
          .select('id, company_id')
          .in('id', batch)
          .limit(5000);

        creatorsRows.push(...(creators || []));
      }

      creatorCompanyMap = new Map(
        creatorsRows.map((row: { id?: string | null; company_id?: string | null }) => [
          String(row?.id || '').trim(),
          String(row?.company_id || '').trim()
        ])
      );
    }

    const salesByClient = new Map<
      string,
      { total: number; lastSale: string | null; count: number }
    >();
    for (const row of (salesData || []) as VendaResumoRow[]) {
      const clientId = String(row.cliente_id || '').trim();
      if (!clientId) continue;

      const current = salesByClient.get(clientId) || {
        total: 0,
        lastSale: null,
        count: 0
      };

      const saleDate = String(row.data_venda || '').trim() || null;
      const total = Number(row.valor_total || 0);

      salesByClient.set(clientId, {
        total: current.total + total,
        count: current.count + 1,
        lastSale:
          saleDate && (!current.lastSale || saleDate > current.lastSale)
            ? saleDate
            : current.lastSale
      });
    }

    const quotesByClient = new Map<string, { total: number; lastQuote: string | null }>();
    for (const row of (quotesData || []) as QuoteResumoRow[]) {
      if (companyIds.length > 0) {
        const creatorCompany = creatorCompanyMap.get(String(row.created_by || '').trim()) || '';
        if (creatorCompany && !companyIdSet.has(creatorCompany)) continue;
      }

      const clientId = String(row.client_id || '').trim();
      if (!clientId) continue;

      const current = quotesByClient.get(clientId) || {
        total: 0,
        lastQuote: null
      };

      const quoteDate = String(row.created_at || '').trim() || null;
      quotesByClient.set(clientId, {
        total: current.total + 1,
        lastQuote:
          quoteDate && (!current.lastQuote || quoteDate > current.lastQuote)
            ? quoteDate
            : current.lastQuote
      });
    }

    const items = ((clientsData || []) as ClienteBaseRow[])
      .map((row) => {
        const sales = salesByClient.get(row.id);
        const quotes = quotesByClient.get(row.id);
        const ultimaCompra = sales?.lastSale || null;

        if (summaryFastPath) {
          return {
            id: row.id,
            status: deriveClienteStatus(row, ultimaCompra),
            total_gasto: Number(sales?.total || 0),
            total_viagens: Number(sales?.count || 0),
            total_orcamentos: Number(quotes?.total || 0),
            aniversario_hoje: isBirthdayToday(row.nascimento)
          };
        }

        const tags = Array.isArray(row.tags) ? row.tags.filter(Boolean) : [];
        const contato = [row.whatsapp, row.telefone, row.email].filter(Boolean).join(' | ');
        const cidadeUf = [row.cidade, row.estado].filter(Boolean).join('/');

        return {
          id: row.id,
          nome: String(row.nome || 'Cliente sem nome'),
          cpf: row.cpf,
          documento: formatDocumentoDisplay(row.cpf),
          email: row.email,
          telefone: row.telefone,
          whatsapp: row.whatsapp,
          contato,
          data_nascimento: row.nascimento,
          cidade: row.cidade,
          estado: row.estado,
          cidade_uf: cidadeUf,
          classificacao: row.classificacao,
          tipo_pessoa:
            row.tipo_pessoa || (String(row.cpf || '').replace(/\D/g, '').length > 11 ? 'PJ' : 'PF'),
          tipo_cliente: row.tipo_cliente || 'passageiro',
          tags,
          tags_text: tags.join(', '),
          status: deriveClienteStatus(row, ultimaCompra),
          ultima_compra: ultimaCompra,
          total_gasto: Number(sales?.total || 0),
          total_viagens: Number(sales?.count || 0),
          total_orcamentos: Number(quotes?.total || 0),
          aniversario_hoje: isBirthdayToday(row.nascimento),
          ativo: row.ativo !== false,
          created_at: row.created_at
        };
      })
      .filter((item) =>
        summaryFastPath
          ? true
          : matchesClienteBusca(item, busca, [item.documento, item.contato, item.cidade_uf])
      )
      .filter((item) => (statusQuery ? item.status === statusQuery : true))
      .filter((item) =>
        aniversarioHojeQuery ? String(item.aniversario_hoje) === aniversarioHojeQuery : true
      )
      .sort((left, right) =>
        summaryFastPath
          ? 0
          : PT_BR_COLLATOR.compare(String(left.nome || ''), String(right.nome || ''))
      );

    const paginatedItems = all
      ? items
      : canUseDbPagination
        ? items
        : items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    const total = canUseDbPagination ? Number(clientsCount || 0) : items.length;
    let summaryBase:
      | {
          total: number;
          ativos: number;
          aniversariantesHoje: number;
          totalCarteira: number;
          comViagem: number;
          emNegociacao: number;
        }
      | undefined;
    if (includeSummary) {
      const summaryItems = canUseDbPagination ? paginatedItems : items;
      const summaryStats = summaryItems.reduce(
        (acc, item) => {
          if (item.status === 'ativo') acc.ativos += 1;
          if (item.aniversario_hoje) acc.aniversariantesHoje += 1;
          acc.totalCarteira += Number(item.total_gasto || 0);
          if (item.total_viagens > 0) acc.comViagem += 1;
          if (item.total_orcamentos > 0 && item.total_viagens === 0) acc.emNegociacao += 1;
          return acc;
        },
        { ativos: 0, aniversariantesHoje: 0, totalCarteira: 0, comViagem: 0, emNegociacao: 0 }
      );
      summaryBase = { total, ...summaryStats };
    }

    if (summaryOnly) {
      return json(
        {
          page,
          pageSize,
          total,
          items: [],
          ...(summaryBase ? { summary: summaryBase } : {})
        },
        { headers: DYNAMIC_READ_HEADERS }
      );
    }

    return json(
      {
        page,
        pageSize,
        total,
        items: paginatedItems,
        ...(summaryBase ? { summary: summaryBase } : {})
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar clientes.');
  }
}
