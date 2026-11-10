// Migrado para Hono de src/routes/api/v1/relatorios/produtos/+server.ts — corpo IDÊNTICO ao original
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
import { fetchRelatorioProdutosReadModelRpc } from '$lib/server/reciboContribuicoesReadModel';

const DEFAULT_ITEMS_LIMIT = 250;
const MAX_ITEMS_LIMIT = 1000;
const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

type ProdutoRelatorioItem = {
  produto_id: string | null;
  produto: string;
  tipo: string;
  quantidade: number;
  receita: number;
  lucro: number;
  margem: number;
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

function sortProdutos(items: ProdutoRelatorioItem[], ordenacao: string) {
  return [...items].sort((left, right) => {
    if (ordenacao === 'lucro') return right.lucro - left.lucro;
    if (ordenacao === 'margem') return right.margem - left.margem;
    if (ordenacao === 'quantidade') return right.quantidade - left.quantidade;
    if (ordenacao === 'produto') return PT_BR_COLLATOR.compare(left.produto, right.produto);
    return right.receita - left.receita;
  });
}

export async function handleRelatoriosProdutosGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['relatorios_produtos', 'relatorios', 'produtos', 'cadastros'],
        1,
        'Sem acesso ao relatorio de produtos.'
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
    const tipoFiltro = String(searchParams.get('tipo') || '').trim();
    const ordenacao = String(searchParams.get('ordenacao') || 'receita').trim();
    const { limit: itemsLimit, offset: itemsOffset } = parseItemsWindow(searchParams);
    const tipoNome = String(scope.tipoNome || '').toUpperCase();
    const useNonBlockingReadModel =
      (scope.isAdmin || tipoNome.includes('MASTER')) &&
      companyIds.length > 1 &&
      vendedorIds.length === 0;

    const payload = await getCachedReadModel({
      key: buildReadModelCacheKey('relatorios:produtos', {
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
        const rpcItems = await fetchRelatorioProdutosReadModelRpc(client, {
          dataInicio,
          dataFim,
          companyIds,
          vendedorIds
        });

        if (rpcItems) {
          const items = rpcItems.map((produtoItem) => {
            const produtoId = produtoItem.produto_id ?? null;
            const produtoNameSlug = String(produtoItem.produto ?? '')
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9-]/g, '');

            return {
              ...produtoItem,
              produto_id: produtoId,
              produto_nome: produtoItem.produto,
              nome: produtoItem.produto,
              produto_display: produtoItem.produto,
              produto_short: String(produtoItem.produto ?? '').slice(0, 20),
              produto_display_name: String(produtoItem.produto ?? ''),
              produto_display_short: String(produtoItem.produto ?? '').slice(0, 12),
              produto_alternative_display: String(produtoItem.produto ?? ''),
              produto_display_alias: String(produtoItem.produto ?? ''),
              produto_name_slug: produtoNameSlug,
              produto_url: `/produtos/${produtoId ?? produtoNameSlug}`,
              produto_code: String(produtoItem.produto ?? '')
                .replace(/[^A-Za-z0-9]/g, '')
                .toUpperCase(),
              custo_medio:
                produtoItem.quantidade > 0
                  ? Math.max(produtoItem.receita - produtoItem.lucro, 0) / produtoItem.quantidade
                  : 0,
              margem: produtoItem.receita > 0 ? (produtoItem.lucro / produtoItem.receita) * 100 : 0
            };
          });

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

        const byProduto = new Map<
          string,
          {
            produto_id: string | null;
            produto: string;
            tipo: string;
            recibos: Set<string>;
            quantidade: number;
            receita: number;
            lucro: number;
          }
        >();

        for (const contribution of contributions) {
          const produto = String(contribution.produtoNome || 'Produto nao informado');
          const tipo = contribution.isSeguro ? 'Seguro' : 'Produto';
          const receita = Number(contribution.bruto || 0);
          const lucro = Number(contribution.taxas || 0);
          const key = `${produto}::${tipo}`;
          const current = byProduto.get(key) || {
            produto,
            produto_id: contribution.produtoId || null,
            tipo,
            recibos: new Set<string>(),
            quantidade: 0,
            receita: 0,
            lucro: 0
          };

          const reciboKey =
            contribution.reciboId ||
            `${contribution.vendaKey}|${contribution.reciboNumero}|${contribution.reciboDate}`;
          if (reciboKey && !current.recibos.has(reciboKey)) {
            current.recibos.add(reciboKey);
            current.quantidade += 1;
          }
          current.receita += receita;
          current.lucro += lucro;
          current.produto_id = current.produto_id || contribution.produtoId || null;
          byProduto.set(key, current);
        }

        const items = Array.from(byProduto.values())
          .map((item) => {
            const produtoItem = {
              produto_id: item.produto_id,
              produto: item.produto,
              tipo: item.tipo,
              quantidade: item.quantidade,
              receita: item.receita,
              lucro: item.lucro
            };
            const produtoId = produtoItem.produto_id ?? null;
            const produtoNameSlug = String(produtoItem.produto ?? '')
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9-]/g, '');

            return {
              ...produtoItem,
              produto_id: produtoId,
              produto_nome: produtoItem.produto,
              nome: produtoItem.produto,
              produto_display: produtoItem.produto,
              produto_short: String(produtoItem.produto ?? '').slice(0, 20),
              produto_display_name: String(produtoItem.produto ?? ''),
              produto_display_short: String(produtoItem.produto ?? '').slice(0, 12),
              produto_alternative_display: String(produtoItem.produto ?? ''),
              produto_display_alias: String(produtoItem.produto ?? ''),
              produto_name_slug: produtoNameSlug,
              // Parity helper: URL for product detail pages
              produto_url: `/produtos/${produtoId ?? produtoNameSlug}`,
              // New parity alias: product code (uppercase alphanumeric)
              produto_code: String(produtoItem.produto ?? '')
                .replace(/[^A-Za-z0-9]/g, '')
                .toUpperCase(),
              custo_medio:
                produtoItem.quantidade > 0
                  ? Math.max(produtoItem.receita - produtoItem.lucro, 0) / produtoItem.quantidade
                  : 0,
              margem: produtoItem.receita > 0 ? (produtoItem.lucro / produtoItem.receita) * 100 : 0
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

    const allItems = (Array.isArray(payload.items) ? payload.items : []) as ProdutoRelatorioItem[];
    const tipos = Array.from(
      new Set(allItems.map((item) => String(item.tipo || '').trim()).filter(Boolean))
    ).sort((left, right) => PT_BR_COLLATOR.compare(left, right));
    const filteredItems = tipoFiltro
      ? allItems.filter((item) => item.tipo === tipoFiltro)
      : allItems;
    const sortedItems = sortProdutos(filteredItems, ordenacao);
    const pagedItems = sortedItems.slice(itemsOffset, itemsOffset + itemsLimit);
    const totalReceita = sortedItems.reduce((sum, item) => sum + Number(item.receita || 0), 0);
    const totalLucro = sortedItems.reduce((sum, item) => sum + Number(item.lucro || 0), 0);

    return json(
      {
        ...payload,
        items: pagedItems,
        total: sortedItems.length,
        total_completo: allItems.length,
        truncated: itemsOffset + pagedItems.length < sortedItems.length,
        items_limit: itemsLimit,
        items_offset: itemsOffset,
        tipos,
        summary: {
          totalReceita,
          totalLucro,
          margemMedia: totalReceita > 0 ? (totalLucro / totalReceita) * 100 : 0,
          produtoTop: sortedItems[0] || null
        }
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar relatorio de produtos.');
  }
}
