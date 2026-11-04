import type { DataClient } from '$lib/server/data';
// Migrado para Hono de src/routes/api/v1/relatorios/clientes/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from "@sveltejs/kit";
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveScopedVendedorIds,
  resolveUserScope,
  toErrorResponse,
} from "$lib/server/v1";
import {
  getClienteCategoria,
  getCurrentYearRange,
  monthSpanInclusive,
} from "$lib/server/relatorios";
import { fetchVendasKpiReciboContributions } from "$lib/server/vendas-kpis";
import { DYNAMIC_READ_HEADERS } from "$lib/server/httpCache";
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags,
} from "$lib/server/readModelCache";
import { getPlatformExecutionContext } from "$lib/server/readModelRebuild";
import { fetchRelatorioClientesReadModelRpc } from "$lib/server/reciboContribuicoesReadModel";
import { chunkArray, uniqueCleanStrings } from "$lib/utils/array";

const DEFAULT_ITEMS_LIMIT = 250;
const MAX_ITEMS_LIMIT = 1000;

type ClienteLookupRow = {
  id?: string | null;
  nome?: string | null;
  email?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
};

type ClienteRawItem = {
  cliente_id: string | null;
  total_compras: number;
  total_gasto: number;
  ultima_compra: string | null;
  ticket_medio: number;
  frequencia: number;
  categoria: "VIP" | "Regular" | "Ocasional";
};

type ClienteDisplayItem = ClienteRawItem & {
  cliente: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  cliente_cpf: string | null;
  cliente_telefone: string | null;
  cliente_whatsapp: string | null;
  cliente_display: string;
  cliente_nome: string;
  cliente_email: string | null;
  cliente_display_name: string;
  cliente_name: string;
};

function parseItemsWindow(searchParams: URLSearchParams) {
  const rawLimit = Number(searchParams.get("items_limit") || DEFAULT_ITEMS_LIMIT);
  const rawOffset = Number(searchParams.get("items_offset") || 0);
  const limit = Math.min(
    MAX_ITEMS_LIMIT,
    Math.max(1, Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : DEFAULT_ITEMS_LIMIT),
  );
  const offset = Math.max(0, Number.isFinite(rawOffset) ? Math.trunc(rawOffset) : 0);
  return { limit, offset };
}

function sortClientes(items: ClienteRawItem[], ordenacao: string) {
  return [...items].sort((left, right) => {
    if (ordenacao === "total_compras") return right.total_compras - left.total_compras;
    if (ordenacao === "ticket_medio") return right.ticket_medio - left.ticket_medio;
    if (ordenacao === "ultima_compra") {
      return String(right.ultima_compra || "").localeCompare(String(left.ultima_compra || ""));
    }
    return right.total_gasto - left.total_gasto;
  });
}

function toClienteDisplayItem(
  item: ClienteRawItem,
  clientesById: Map<string, ClienteLookupRow>,
): ClienteDisplayItem {
  const lookup = item.cliente_id ? clientesById.get(item.cliente_id) : null;
  const cliente = String(lookup?.nome || "").trim() || "Cliente sem nome";
  const cpf = String(lookup?.cpf || "").trim() || null;
  const email = String(lookup?.email || "").trim() || null;
  const telefone = String(lookup?.telefone || "").trim() || null;
  const whatsapp = String(lookup?.whatsapp || "").trim() || null;

  return {
    ...item,
    cliente,
    cpf,
    email,
    telefone,
    whatsapp,
    cliente_cpf: cpf,
    cliente_telefone: telefone,
    cliente_whatsapp: whatsapp,
    cliente_display: cliente,
    cliente_nome: cliente,
    cliente_email: email,
    cliente_display_name: cliente,
    cliente_name: cliente,
  };
}

async function fetchClientesByIds(client: DataClient, ids: string[]) {
  const clientesById = new Map<string, ClienteLookupRow>();
  const cleanIds = uniqueCleanStrings(ids);
  if (cleanIds.length === 0) return clientesById;

  const batchRows = await Promise.all(
    chunkArray(cleanIds).map(async (batch) => {
      const { data, error } = await client
        .from("clientes")
        .select("id, nome, email, cpf, telefone, whatsapp")
        .in("id", batch);

      if (error) throw error;
      return (data || []) as ClienteLookupRow[];
    })
  );

  for (const row of batchRows.flat()) {
    const id = String(row?.id || "").trim();
    if (id) clientesById.set(id, row);
  }

  return clientesById;
}

export async function handleRelatoriosClientesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ["relatorios_clientes", "relatorios", "clientes"],
        1,
        "Sem acesso ao relatorio de clientes.",
      );
    }

    const { searchParams } = event.url;
    const defaultRange = getCurrentYearRange();
    const dataInicio = String(
      searchParams.get("data_inicio") || defaultRange.dataInicio,
    ).trim();
    const dataFim = String(
      searchParams.get("data_fim") || defaultRange.dataFim,
    ).trim();
    const companyIds = resolveScopedCompanyIds(
      scope,
      searchParams.get("empresa_id"),
    );
    const vendedorIds = await resolveScopedVendedorIds(
      client,
      scope,
      searchParams.get("vendedor_ids") || searchParams.get("vendedor_id"),
    );
    const categoriaFiltro = String(searchParams.get("categoria") || "").trim();
    const ordenacao = String(searchParams.get("ordenacao") || "total_gasto").trim();
    const { limit: itemsLimit, offset: itemsOffset } = parseItemsWindow(searchParams);
    const tipoNome = String(scope.tipoNome || "").toUpperCase();
    const useNonBlockingReadModel =
      (scope.isAdmin || tipoNome.includes("MASTER")) &&
      companyIds.length > 1 &&
      vendedorIds.length === 0;

    const payload = await getCachedReadModel({
      key: buildReadModelCacheKey("relatorios:clientes", {
        userId: user.id,
        dataInicio,
        dataFim,
        companyIds,
        vendedorIds,
      }),
      tags: [
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.clients,
        ...scopeCacheTags({ companyIds, vendedorIds, userId: user.id }),
      ],
      ttlMs: 300_000,
      staleTtlMs: 1_800_000,
      loader: async () => {
        const months = monthSpanInclusive(dataInicio, dataFim);
        const rpcItems = await fetchRelatorioClientesReadModelRpc(client, {
          dataInicio,
          dataFim,
          companyIds,
          vendedorIds,
        });

        if (rpcItems) {
          const rawItems = rpcItems
            .map((item) => {
              const ticketMedio =
                item.total_compras > 0
                  ? item.total_gasto / item.total_compras
                  : 0;
              return {
                cliente_id: item.cliente_id,
                total_compras: item.total_compras,
                total_gasto: item.total_gasto,
                ultima_compra: item.ultima_compra,
                ticket_medio: ticketMedio,
                frequencia: item.total_compras / months,
                categoria: getClienteCategoria(
                  item.total_compras,
                  item.total_gasto,
                ),
              };
            })
            .sort((left, right) => right.total_gasto - left.total_gasto);

          return {
            rawItems,
            total: rawItems.length,
            periodo: {
              data_inicio: dataInicio,
              data_fim: dataFim,
            },
          };
        }

        const { contributions } = await fetchVendasKpiReciboContributions(client, {
          dataInicio,
          dataFim,
          companyIds,
          vendedorIds,
        }, useNonBlockingReadModel
          ? {
              mode: "stale-while-revalidate",
              executionContext: getPlatformExecutionContext(event.platform),
              fallbackToRawOnReadError: true,
              fallbackToRawWhenEmpty: true,
            }
          : undefined);

        const byClient = new Map<
          string,
          {
            cliente_id: string | null;
            vendaKeys: Set<string>;
            total_compras: number;
            total_gasto: number;
            ultima_compra: string | null;
          }
        >();

        for (const contribution of contributions) {
          const clienteId = String(contribution.clienteId || "").trim();
          const fallbackKey =
            contribution.vendaKey ||
            contribution.reciboId ||
            `${contribution.reciboNumero}|${contribution.reciboDate}`;
          const clientKey = clienteId || `sem-cliente:${fallbackKey}`;
          const current = byClient.get(clientKey) || {
            cliente_id: clienteId || null,
            vendaKeys: new Set<string>(),
            total_compras: 0,
            total_gasto: 0,
            ultima_compra: null,
          };

          const vendaKey =
            contribution.vendaKey || contribution.reciboId || fallbackKey;
          if (vendaKey && !current.vendaKeys.has(vendaKey)) {
            current.vendaKeys.add(vendaKey);
            current.total_compras += 1;
          }
          current.total_gasto += Number(contribution.bruto || 0);

          const dataRecibo = String(contribution.reciboDate || "").slice(0, 10);
          if (
            dataRecibo &&
            (!current.ultima_compra || dataRecibo > current.ultima_compra)
          ) {
            current.ultima_compra = dataRecibo;
          }

          byClient.set(clientKey, current);
        }

        const rawItems = Array.from(byClient.values())
          .map((item) => {
            const ticketMedio =
              item.total_compras > 0
                ? item.total_gasto / item.total_compras
                : 0;
            return {
              cliente_id: item.cliente_id,
              total_compras: item.total_compras,
              total_gasto: item.total_gasto,
              ultima_compra: item.ultima_compra,
              ticket_medio: ticketMedio,
              frequencia: item.total_compras / months,
              categoria: getClienteCategoria(
                item.total_compras,
                item.total_gasto,
              ),
            };
          })
          .sort((left, right) => right.total_gasto - left.total_gasto);

        return {
          rawItems,
          total: rawItems.length,
          periodo: {
            data_inicio: dataInicio,
            data_fim: dataFim,
          },
        };
      },
    });

    const rawPayload = payload as typeof payload & {
      rawItems?: ClienteRawItem[];
      items?: ClienteRawItem[];
    };
    const allItems = (Array.isArray(rawPayload.rawItems)
      ? rawPayload.rawItems
      : Array.isArray(rawPayload.items)
        ? rawPayload.items
        : []) as ClienteRawItem[];
    const filteredItems = categoriaFiltro
      ? allItems.filter((item) => item.categoria === categoriaFiltro)
      : allItems;
    const sortedItems = sortClientes(filteredItems, ordenacao);
    const pagedRawItems = sortedItems.slice(itemsOffset, itemsOffset + itemsLimit);
    const clientesById = await fetchClientesByIds(
      client,
      pagedRawItems
        .map((item) => item.cliente_id)
        .filter((id): id is string => Boolean(id)),
    );
    const items = pagedRawItems.map((item) => toClienteDisplayItem(item, clientesById));
    const totalGasto = sortedItems.reduce((sum, item) => sum + Number(item.total_gasto || 0), 0);
    const categorias = sortedItems.reduce(
      (acc, item) => {
        if (item.categoria === "VIP") acc.vip += 1;
        if (item.categoria === "Regular") acc.regular += 1;
        if (item.categoria === "Ocasional") acc.ocasional += 1;
        return acc;
      },
      { vip: 0, regular: 0, ocasional: 0 },
    );

    return json({
      periodo: payload.periodo,
      items,
      total: sortedItems.length,
      total_completo: allItems.length,
      truncated: itemsOffset + items.length < sortedItems.length,
      items_limit: itemsLimit,
      items_offset: itemsOffset,
      summary: {
        totalClientes: sortedItems.length,
        totalGasto,
        ticketMedioGeral: sortedItems.length > 0 ? totalGasto / sortedItems.length : 0,
        clientesVIP: categorias.vip,
        categorias,
      },
    }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, "Erro ao carregar relatorio de clientes.");
  }
}
