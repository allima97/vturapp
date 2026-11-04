// Migrado para Hono de src/routes/api/v1/clientes/historico/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { ensureClienteAccess } from '$lib/server/clientes';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import { cleanStringSet, chunkArray } from '$lib/utils/array';

function sortByDateDesc<T>(items: T[], getDate: (item: T) => string | null) {
  return [...items].sort((left, right) =>
    String(getDate(right) || '').localeCompare(String(getDate(left) || ''))
  );
}

const QUERY_IN_BATCH_SIZE = 150;

type ClienteHistoricoVenda = {
  id: string;
  data_lancamento: string | null;
  data_embarque: string | null;
  destino_nome: string;
  destino_cidade_nome: string;
  valor_total: number;
  valor_taxas: number;
  origem_vinculo: string;
};

type ClienteHistoricoOrcamento = {
  id: string;
  data_orcamento: string | null;
  status: string | null;
  valor: number | string | null;
  produto_nome: string | null;
};

type VendaHistoricoRow = {
  id: string;
  cliente_id?: string | null;
  vendedor_id?: string | null;
  company_id?: string | null;
  data_lancamento: string | null;
  data_embarque: string | null;
  destino_cidade_id: string | null;
  destino?: {
    nome?: string | null;
    cidade_id?: string | null;
  } | null;
  origem_vinculo?: 'titular' | 'passageiro';
};

type ViagemPassageiroRow = {
  viagem_id: string | null;
};

type ViagemVendaRow = {
  id: string | null;
  venda_id: string | null;
};

type ReciboHistoricoRow = {
  venda_id: string | null;
  valor_total: number | string | null;
  valor_taxas: number | string | null;
};

type QuoteHistoricoRow = {
  id: string;
  created_at: string | null;
  status: string | null;
  status_negociacao: string | null;
  total: number | string | null;
  client_id?: string | null;
  created_by: string | null;
  quote_item?: Array<{
    title?: string | null;
    item_type?: string | null;
  }> | null;
};

type CidadeRow = {
  id: string | null;
  nome: string | null;
};

type UserCompanyRow = {
  id: string | null;
  company_id: string | null;
};

type ScopedVendasQuery = {
  in: (column: string, values: string[]) => ScopedVendasQuery;
  then: PromiseLike<{ data: VendaHistoricoRow[] | null; error: unknown }>['then'];
};

async function fetchBatched<T>(
  values: string[],
  loader: (batch: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>
) {
  const batchResults = await Promise.all(
    chunkArray(values, QUERY_IN_BATCH_SIZE).map(async (batch) => {
      const { data, error } = await loader(batch);
      if (error) throw error;
      return data || [];
    })
  );
  return batchResults.flat();
}

export async function handleClientesHistoricoGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const clienteId = String(event.url.searchParams.get('cliente_id') || '').trim();

    const filters = await ensureClienteAccess(
      client,
      scope,
      clienteId,
      event.url.searchParams.get('empresa_id'),
      event.url.searchParams.get('vendedor_ids'),
      1
    );
    const filterCompanyIdSet = cleanStringSet(filters.companyIds);
    const filterVendedorIdSet = cleanStringSet(filters.vendedorIds);

    const result = await getCachedReadModel<{
      vendas: ClienteHistoricoVenda[];
      orcamentos: ClienteHistoricoOrcamento[];
    }>({
      key: buildReadModelCacheKey('clientes:historico', {
        clienteId,
        companyIds: filters.companyIds,
        vendedorIds: filters.vendedorIds,
        userId: scope.userId
      }),
      tags: [
        READ_MODEL_TAGS.clients,
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.quote,
        READ_MODEL_TAGS.catalog,
        ...scopeCacheTags({
          companyIds: filters.companyIds,
          vendedorIds: filters.vendedorIds,
          userId: scope.userId
        })
      ],
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        const vendaSelect =
          'id, cliente_id, vendedor_id, company_id, data_lancamento, data_embarque, destino_cidade_id, destino:produtos!vendas_destino_id_fkey(nome, cidade_id)';
        const fetchScopedVendas = async (buildBaseQuery: () => ScopedVendasQuery) => {
          const rows: VendaHistoricoRow[] = [];
          const companyBatches =
            filters.companyIds.length > 0 ? chunkArray(filters.companyIds, QUERY_IN_BATCH_SIZE) : [null];
          const vendedorBatches =
            filters.vendedorIds.length > 0 ? chunkArray(filters.vendedorIds, QUERY_IN_BATCH_SIZE) : [null];

          for (const companyBatch of companyBatches) {
            for (const vendedorBatch of vendedorBatches) {
              let query = buildBaseQuery();
              if (companyBatch) query = query.in('company_id', companyBatch);
              if (vendedorBatch) query = query.in('vendedor_id', vendedorBatch);

              const { data, error } = await query;
              if (error) throw error;
              rows.push(...(data || []));
            }
          }
          return rows;
        };

        // Fase 3.7 (velocidade): as buscas que não dependem uma da outra rodam juntas.
        // Antes: vendas do titular → passageiro (3 consultas em fila) → recibos/orçamentos →
        // cidades → criadores. Agora os orçamentos começam junto com as vendas, a cadeia de
        // passageiro roda ao lado do titular, e cidades/criadores saem juntos. Mesmas consultas,
        // mesmo resultado, mesma ordem de montagem (contrato: historico.contract.test.ts).
        const quotesPromise = client
          .from('quote')
          .select(
            'id, created_at, status, status_negociacao, total, client_id, created_by, quote_item(title, item_type)'
          )
          .eq('client_id', clienteId)
          .order('created_at', { ascending: false })
          .then((response: any) => response);
        // Se o titular falhar antes, a resposta dos orçamentos é descartada sem gerar rejeição solta.
        quotesPromise.then(undefined, () => undefined);

        const loadVendasPassageiro = async () => {
          let vendasPassageiro: VendaHistoricoRow[] = [];
          try {
            const { data: viagensComoPassageiro } = await client
              .from('viagem_passageiros')
              .select('viagem_id')
              .eq('cliente_id', clienteId);

            const viagemIds = Array.from(
              new Set(
                ((viagensComoPassageiro || []) as ViagemPassageiroRow[])
                  .map((row) => String(row.viagem_id || '').trim())
                  .filter(Boolean)
              )
            );

            if (viagemIds.length > 0) {
              const viagensRows = await fetchBatched<ViagemVendaRow>(viagemIds, (batch) =>
                client
                  .from('viagens')
                  .select('id, venda_id')
                  .in('id', batch)
              );

              const vendaIds = Array.from(
                new Set(
                  viagensRows
                    .map((row) => String(row.venda_id || '').trim())
                    .filter(Boolean)
                )
              );

              if (vendaIds.length > 0) {
                vendasPassageiro = await fetchBatched<VendaHistoricoRow>(vendaIds, async (batch) => ({
                  data: await fetchScopedVendas(() =>
                    client.from('vendas').select(vendaSelect).in('id', batch) as unknown as ScopedVendasQuery
                  ),
                  error: null
                }));
              }
            }
          } catch {
            // falha silenciosa — vínculos de passageiro são complementares
          }
          return vendasPassageiro;
        };

        const [vendasTitular, vendasPassageiro] = await Promise.all([
          fetchScopedVendas(() =>
            client.from('vendas').select(vendaSelect).eq('cliente_id', clienteId) as unknown as ScopedVendasQuery
          ),
          loadVendasPassageiro()
        ]);

        const vendasMap = new Map<string, VendaHistoricoRow>();
        for (const row of vendasTitular || []) {
          vendasMap.set(row.id, { ...row, origem_vinculo: 'titular' });
        }
        for (const row of vendasPassageiro) {
          if (!vendasMap.has(row.id)) {
            vendasMap.set(row.id, { ...row, origem_vinculo: 'passageiro' });
          }
        }

        const vendasData = sortByDateDesc(
          Array.from(vendasMap.values()),
          (row) => row?.data_lancamento || null
        );
        const vendaIds = vendasData
          .map((row) => String(row?.id || '').trim())
          .filter(Boolean);

        const [{ data: recibosData, error: recibosError }, { data: quoteRows, error: quotesError }] =
          await Promise.all([
            vendaIds.length > 0
              ? fetchBatched<ReciboHistoricoRow>(vendaIds, (batch) =>
                  client
                    .from('vendas_recibos')
                    .select('venda_id, valor_total, valor_taxas')
                    .in('venda_id', batch)
                ).then((data) => ({ data, error: null }))
              : Promise.resolve({ data: [], error: null }),
            quotesPromise
          ]);

        if (recibosError) throw recibosError;
        if (quotesError) throw quotesError;

        const cidadeIds = Array.from(
          new Set(
            vendasData
              .map((row) =>
                String(row?.destino_cidade_id || row?.destino?.cidade_id || '').trim()
              )
              .filter(Boolean)
          )
        );

        let creatorCompanyMap = new Map<string, string>();
        const creatorIds = Array.from(
          new Set(
            ((quoteRows || []) as QuoteHistoricoRow[])
              .map((row) => String(row.created_by || '').trim())
              .filter(Boolean)
          )
        );

        const [cidadesResult, creatorsResult] = await Promise.allSettled([
          cidadeIds.length > 0
            ? fetchBatched<CidadeRow>(cidadeIds, (batch) =>
                client
                  .from('cidades')
                  .select('id, nome')
                  .in('id', batch)
              )
            : Promise.resolve(null),
          filters.companyIds.length > 0 && creatorIds.length > 0
            ? fetchBatched<UserCompanyRow>(creatorIds, (batch) =>
                client
                  .from('users')
                  .select('id, company_id')
                  .in('id', batch)
              )
            : Promise.resolve(null)
        ]);
        if (cidadesResult.status === 'rejected') throw cidadesResult.reason;
        if (creatorsResult.status === 'rejected') throw creatorsResult.reason;

        let cidadesMap = new Map<string, string>();
        if (cidadesResult.value) {
          const cidadesData = cidadesResult.value;
          cidadesMap = new Map(
            cidadesData.map((row) => [
              String(row?.id || '').trim(),
              String(row?.nome || '').trim()
            ])
          );
        }

        if (creatorsResult.value) {
          const creators = creatorsResult.value;

          creatorCompanyMap = new Map(
            creators.map((row) => [
              String(row?.id || '').trim(),
              String(row?.company_id || '').trim()
            ])
          );
        }

        const vendas = vendasData.map((row) => {
          const recs = ((recibosData || []) as ReciboHistoricoRow[]).filter(
            (recibo) => recibo.venda_id === row.id
          );
          const total = recs.reduce(
            (acc, recibo) => acc + Number(recibo.valor_total || 0),
            0
          );
          const taxas = recs.reduce(
            (acc, recibo) => acc + Number(recibo.valor_taxas || 0),
            0
          );
          const cidadeId = String(row?.destino_cidade_id || row?.destino?.cidade_id || '').trim();
          return {
            id: row.id,
            data_lancamento: row.data_lancamento || null,
            data_embarque: row.data_embarque || null,
            destino_nome: String(row?.destino?.nome || ''),
            destino_cidade_nome: cidadeId ? cidadesMap.get(cidadeId) || '' : '',
            valor_total: total,
            valor_taxas: taxas,
            origem_vinculo: row.origem_vinculo || 'titular'
          };
        });

        const orcamentos = ((quoteRows || []) as QuoteHistoricoRow[])
          .filter((row) => {
            if (filters.vendedorIds.length > 0) {
              return filterVendedorIdSet.has(String(row.created_by || '').trim());
            }
            if (filters.companyIds.length === 0) return true;
            const creatorCompany =
              creatorCompanyMap.get(String(row.created_by || '').trim()) || '';
            return creatorCompany ? filterCompanyIdSet.has(creatorCompany) : true;
          })
          .map((row) => ({
            id: row.id,
            data_orcamento: row.created_at || null,
            status: row.status_negociacao || row.status || null,
            valor: row.total ?? null,
            produto_nome:
              row.quote_item?.[0]?.title || row.quote_item?.[0]?.item_type || null
          }));

        return { vendas, orcamentos };
      }
    });

    return json(result, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar historico de clientes.');
  }
}
