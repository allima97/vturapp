// Migrado para Hono de src/routes/api/v1/relatorios/destinos/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveScopedVendedorIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { getCurrentYearRange } from '$lib/server/relatorios';
import { fetchVendasKpiReciboContributions } from '$lib/server/vendas-kpis';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { getPlatformExecutionContext } from '$lib/server/readModelRebuild';
import { fetchRelatorioDestinosReadModelRpc } from '$lib/server/reciboContribuicoesReadModel';
import { modulosOperacionaisGeograficosAtivos } from '$lib/config/destinosGeograficos';
import { chaveDestinoRelatorio } from '$lib/relatorioDestino';

const DEFAULT_ITEMS_LIMIT = 250;
const MAX_ITEMS_LIMIT = 1000;
const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

type DestinoRelatorioItem = {
  destino: string;
  quantidade: number;
  receita: number;
  ticket_medio: number;
  percentual: number;
};

function parseItemsWindow(searchParams: URLSearchParams) {
  const rawLimit = Number(searchParams.get('items_limit') || DEFAULT_ITEMS_LIMIT);
  const rawOffset = Number(searchParams.get('items_offset') || 0);
  const limit = Math.min(
    MAX_ITEMS_LIMIT,
    Math.max(1, Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : DEFAULT_ITEMS_LIMIT)
  );
  const offset = Math.max(0, Number.isFinite(rawOffset) ? Math.trunc(rawOffset) : 0);
  return { limit, offset };
}

function sortDestinos(items: DestinoRelatorioItem[], ordenacao: string) {
  return [...items].sort((left, right) => {
    if (ordenacao === 'quantidade') return right.quantidade - left.quantidade;
    if (ordenacao === 'ticket_medio') return right.ticket_medio - left.ticket_medio;
    if (ordenacao === 'destino') return PT_BR_COLLATOR.compare(left.destino, right.destino);
    return right.receita - left.receita;
  });
}

function applyRecorte(items: DestinoRelatorioItem[], recorte: string) {
  if (recorte === 'top5') return items.slice(0, 5);
  if (recorte === 'top10') return items.slice(0, 10);
  return items;
}

export async function handleRelatoriosDestinosGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['relatorios_destinos', 'relatorios', 'vendas'],
        1,
        'Sem acesso ao relatorio de destinos.'
      );
    }

    const { searchParams } = event.url;
    const defaultRange = getCurrentYearRange();
    const dataInicio = String(searchParams.get('data_inicio') || defaultRange.dataInicio).trim();
    const dataFim = String(searchParams.get('data_fim') || defaultRange.dataFim).trim();
    const companyIds = resolveScopedCompanyIds(scope, searchParams.get('empresa_id'));
    const vendedorIds = await resolveScopedVendedorIds(
      client,
      scope,
      searchParams.get('vendedor_ids') || searchParams.get('vendedor_id')
    );
    const ordenacao = String(searchParams.get('ordenacao') || 'receita').trim();
    const recorte = String(searchParams.get('recorte') || 'todos').trim();
    const { limit: itemsLimit, offset: itemsOffset } = parseItemsWindow(searchParams);
    const tipoNome = String(scope.tipoNome || '').toUpperCase();
    const useNonBlockingReadModel =
      (scope.isAdmin || tipoNome.includes('MASTER')) &&
      companyIds.length > 1 &&
      vendedorIds.length === 0;

    const payload = await getCachedReadModel({
      key: buildReadModelCacheKey('relatorios:destinos', {
        userId: user.id,
        dataInicio,
        dataFim,
        companyIds,
        vendedorIds
      }),
      tags: [
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.catalog,
        ...scopeCacheTags({ companyIds, vendedorIds, userId: user.id })
      ],
      ttlMs: 300_000,
      staleTtlMs: 1_800_000,
      loader: async () => {
        const rpcItems = await fetchRelatorioDestinosReadModelRpc(client, {
          dataInicio,
          dataFim,
          companyIds,
          vendedorIds
        });

        if (rpcItems) {
          const totalReceita = rpcItems.reduce((sum, item) => sum + Number(item.receita || 0), 0);
          const items = rpcItems
            .map((destinoItem) => ({
              ...destinoItem,
              destino_id: null,
              destino: destinoItem.destino,
              destino_nome: destinoItem.destino,
              destino_display: destinoItem.destino,
              destino_short: String(destinoItem.destino ?? '').slice(0, 20),
              destino_display_name: String(destinoItem.destino ?? ''),
              destino_display_short: String(destinoItem.destino ?? '').slice(0, 12),
              destino_slug: String(destinoItem.destino ?? '')
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, ''),
              destino_codigo: String(destinoItem.destino ?? '')
                .replace(/[^A-Za-z0-9]/g, '')
                .toUpperCase(),
              ticket_medio:
                destinoItem.quantidade > 0 ? destinoItem.receita / destinoItem.quantidade : 0,
              percentual: totalReceita > 0 ? (destinoItem.receita / totalReceita) * 100 : 0
            }))
            .sort((left, right) => right.receita - left.receita);

          return {
            items,
            total: items.length,
            periodo: {
              data_inicio: dataInicio,
              data_fim: dataFim
            }
          };
        }

        const { contributions } = await fetchVendasKpiReciboContributions(
          client,
          {
            dataInicio,
            dataFim,
            companyIds,
            vendedorIds
          },
          useNonBlockingReadModel
            ? {
                mode: 'stale-while-revalidate',
                executionContext: getPlatformExecutionContext(event.platform),
                fallbackToRawOnReadError: true,
                fallbackToRawWhenEmpty: true
              }
            : undefined
        );

        const totalReceita = contributions.reduce(
          (sum, contribution) => sum + Number(contribution.bruto || 0),
          0
        );
        const byDestino = new Map<
          string,
          {
            destino: string;
            vendaKeys: Set<string>;
            quantidade: number;
            receita: number;
          }
        >();

        for (const contribution of contributions) {
          const agrupado = chaveDestinoRelatorio(
            contribution.destinoNome,
            contribution.destinoGeograficoId,
            modulosOperacionaisGeograficosAtivos
          );
          const destino = agrupado.destino;
          const current = byDestino.get(agrupado.chave) || {
            destino,
            vendaKeys: new Set<string>(),
            quantidade: 0,
            receita: 0
          };

          const vendaKey =
            contribution.vendaKey ||
            contribution.reciboId ||
            `${contribution.reciboNumero}|${contribution.reciboDate}`;
          if (vendaKey && !current.vendaKeys.has(vendaKey)) {
            current.vendaKeys.add(vendaKey);
            current.quantidade += 1;
          }
          current.receita += Number(contribution.bruto || 0);
          byDestino.set(agrupado.chave, current);
        }

        const items = Array.from(byDestino.values())
          .map((item) => {
            const destinoItem = {
              destino: item.destino,
              quantidade: item.quantidade,
              receita: item.receita
            };

            return {
              ...destinoItem,
              destino_id: null,
              // Expose alias for parity with VTUR-APP expectations
              destino: destinoItem.destino,
              destino_nome: destinoItem.destino,
              // New parity alias: display name and short name
              destino_display: destinoItem.destino,
              destino_short: String(destinoItem.destino ?? '').slice(0, 20),
              destino_display_name: String(destinoItem.destino ?? ''),
              destino_display_short: String(destinoItem.destino ?? '').slice(0, 12),
              destino_slug: String(destinoItem.destino ?? '')
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, ''),
              destino_codigo: String(destinoItem.destino ?? '')
                .replace(/[^A-Za-z0-9]/g, '')
                .toUpperCase(),
              ticket_medio:
                destinoItem.quantidade > 0 ? destinoItem.receita / destinoItem.quantidade : 0,
              percentual: totalReceita > 0 ? (destinoItem.receita / totalReceita) * 100 : 0
            };
          })
          .sort((left, right) => right.receita - left.receita);

        return {
          items,
          total: items.length,
          periodo: {
            data_inicio: dataInicio,
            data_fim: dataFim
          }
        };
      }
    });

    const allItems = (Array.isArray(payload.items) ? payload.items : []) as DestinoRelatorioItem[];
    const sortedItems = sortDestinos(allItems, ordenacao);
    const recorteItems = applyRecorte(sortedItems, recorte);
    const pagedItems = recorteItems.slice(itemsOffset, itemsOffset + itemsLimit);
    const totalReceita = recorteItems.reduce((sum, item) => sum + Number(item.receita || 0), 0);
    const totalVendas = recorteItems.reduce((sum, item) => sum + Number(item.quantidade || 0), 0);

    return json(
      {
        ...payload,
        items: pagedItems,
        total: recorteItems.length,
        total_completo: allItems.length,
        truncated: itemsOffset + pagedItems.length < recorteItems.length,
        items_limit: itemsLimit,
        items_offset: itemsOffset,
        summary: {
          totalReceita,
          totalVendas,
          destinoTop: recorteItems[0] || null
        }
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar relatorio de destinos.');
  }
}
