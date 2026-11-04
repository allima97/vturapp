// Migrado para Hono de src/routes/api/v1/viagens/clientes/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from "@sveltejs/kit";
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveAccessibleClientIds,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse,
} from "$lib/server/v1";
import { DYNAMIC_READ_HEADERS } from "$lib/server/httpCache";
import { canUseCompanyClienteScope, resolveCompanyClienteIds } from "$lib/server/clientes";
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags,
} from "$lib/server/readModelCache";
import { chunkArray, QUERY_IN_BATCH_SIZE } from "$lib/utils/array";

type ViagemClienteRow = {
  id: string;
  nome: string | null;
  cpf: string | null;
};

const PT_BR_COLLATOR = new Intl.Collator("pt-BR");

function dedupeClientes(rows: ViagemClienteRow[]) {
  const map = new Map<string, ViagemClienteRow>();
  for (const row of rows) {
    const id = String(row?.id || "").trim();
    if (id && !map.has(id)) map.set(id, row);
  }
  return Array.from(map.values()).sort((left, right) =>
    PT_BR_COLLATOR.compare(String(left.nome || ""), String(right.nome || "")),
  );
}

export async function handleViagensClientesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ["operacao_viagens", "viagens", "operacao"],
        1,
        "Sem acesso a Viagens.",
      );
    }

    const companyIds = resolveScopedCompanyIds(scope, event.url.searchParams.get("empresa_id"));
    const useCompanyScope = canUseCompanyClienteScope(scope);
    const vendedorIds = useCompanyScope ? [] : [user.id];
    const companyClientIds = useCompanyScope && companyIds.length > 0
      ? await resolveCompanyClienteIds(client, companyIds)
      : null;
    const accessibleClientIds = !useCompanyScope
      ? await resolveAccessibleClientIds(client, {
          companyIds,
          vendedorIds,
        })
      : null;
    const scopedClientIds = companyClientIds || accessibleClientIds;

    if (scopedClientIds && scopedClientIds.length === 0) {
      return json([], { headers: DYNAMIC_READ_HEADERS });
    }

    const cacheKey = buildReadModelCacheKey("viagens:clientes", {
      isAdmin: scope.isAdmin,
      useCompanyScope,
      companyIds,
      vendedorIds,
      accessibleClientCount: scopedClientIds?.length ?? null,
      userId: useCompanyScope ? null : user.id,
    });
    const payload = await getCachedReadModel({
      key: cacheKey,
      tags: [
        READ_MODEL_TAGS.trips,
        READ_MODEL_TAGS.clients,
        READ_MODEL_TAGS.sales,
        ...scopeCacheTags({
          companyIds,
          vendedorIds,
          userId: useCompanyScope ? undefined : user.id,
        }),
      ],
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        const buildQuery = (clientIds?: string[], companyIdsFilter = companyIds) => {
          let query = client
            .from("clientes")
            .select("id, nome, cpf")
            .order("nome", { ascending: true })
            .limit(200);
          if (clientIds) {
            query = query.in("id", clientIds);
          } else if (companyIdsFilter.length > 0) {
            query = query.in("company_id", companyIdsFilter);
          }
          return query;
        };

        const fetchClientes = async () => {
          if (scopedClientIds && scopedClientIds.length > 0) {
            if (scopedClientIds.length <= QUERY_IN_BATCH_SIZE) {
              return buildQuery(scopedClientIds);
            }

            const rows: ViagemClienteRow[] = [];
            for (const batch of chunkArray(scopedClientIds)) {
              const result = await buildQuery(batch);
              if (result.error) {
                return { data: null, error: result.error } as typeof result;
              }
              rows.push(
                ...((result.data || []) as unknown as ViagemClienteRow[]),
              );
            }

            return { data: dedupeClientes(rows).slice(0, 200), error: null };
          }

          if (companyIds.length > QUERY_IN_BATCH_SIZE) {
            const rows: ViagemClienteRow[] = [];
            for (const batch of chunkArray(companyIds)) {
              const result = await buildQuery(undefined, batch);
              if (result.error) {
                return { data: null, error: result.error } as typeof result;
              }
              rows.push(
                ...((result.data || []) as unknown as ViagemClienteRow[]),
              );
              if (dedupeClientes(rows).length >= 200) break;
            }

            return { data: dedupeClientes(rows).slice(0, 200), error: null };
          }

          return buildQuery();
        };

        const { data, error } = await fetchClientes();
        if (error) throw error;
        return data || [];
      },
    });

    return json(payload, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, "Erro ao carregar clientes.");
  }
}
