// Migrado para Hono de src/routes/api/v1/dashboard/consultorias/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from "@sveltejs/kit";
import {
  fetchVendedorIdsByCompanyIds,
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveScopedVendedorIds,
  resolveUserScope,
} from "$lib/server/v1";
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags,
} from "$lib/server/readModelCache";
import { NO_STORE_HEADERS, SHORT_DYNAMIC_READ_HEADERS } from "$lib/server/httpCache";
import { chunkArray, QUERY_IN_BATCH_SIZE } from "$lib/utils/array";

const NO_STORE_TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  ...NO_STORE_HEADERS,
};

const CONSULTORIA_PERMISSION_LEVELS = new Set([
  "view",
  "create",
  "edit",
  "delete",
  "admin",
]);

type DashboardConsultoriaRow = {
  id: string | null;
  cliente_nome: string | null;
  data_hora: string | null;
  lembrete: string | null;
  destino: string | null;
  orcamento_id: string | null;
};

function clampIntParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function isRpcMissing(error: unknown, fnName: string) {
  const err = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const code = String(err.code || "");
  const message = String(err.message || "").toLowerCase();
  const needle = String(fnName || "").toLowerCase();
  return (
    code === "42883" ||
    (needle &&
      message.includes(needle) &&
      (message.includes("does not exist") ||
        message.includes("could not find")))
  );
}

export async function handleDashboardConsultoriasGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    const canConsultoria =
      scope.isAdmin ||
      scope.isMaster ||
      scope.isGestor ||
      ["consultoria_online", "consultoria", "dashboard"].some((modulo) =>
        Object.entries(scope.permissoes).some(([key, nivel]) => {
          const normalized = String(key || "")
            .trim()
            .toLowerCase();
          return (
            normalized === modulo &&
            CONSULTORIA_PERMISSION_LEVELS.has(String(nivel))
          );
        }),
      );

    if (!canConsultoria) {
      // Retorna lista vazia em vez de 403 — o dashboard apenas não mostrará o widget
      return json({ items: [] }, { headers: NO_STORE_HEADERS });
    }

    const mode = String(event.url.searchParams.get("mode") || "geral")
      .trim()
      .toLowerCase();
    const noCache =
      String(event.url.searchParams.get("no_cache") || "").trim() === "1";
    const limit = clampIntParam(event.url.searchParams.get("limit"), 50, 1, 50);

    if (mode !== "geral" && mode !== "gestor") {
      return new Response("mode invalido (use mode=geral ou mode=gestor).", {
        status: 400,
        headers: NO_STORE_TEXT_HEADERS,
      });
    }

    const companyIds =
      mode === "gestor"
        ? resolveScopedCompanyIds(
            scope,
            event.url.searchParams.get("company_id"),
          )
        : [];
    let vendedorIds = await resolveScopedVendedorIds(
      client,
      scope,
      event.url.searchParams.get("vendedor_ids"),
    );

    if (scope.isMaster && mode !== "gestor") {
      vendedorIds = [scope.userId];
    }

    const companyId = companyIds[0] || null;
    const agoraIso = new Date().toISOString();
    const limite = new Date();
    limite.setDate(limite.getDate() + 30);
    const limiteIso = limite.toISOString();

    const cacheKey = buildReadModelCacheKey("dashboard:consultorias", {
      mode,
      userId: user.id,
      papel: scope.papel,
      companyId,
      vendedorIds,
      limit,
      inicio: agoraIso.slice(0, 10),
      fim: limiteIso.slice(0, 10),
    });
    const loadPayload = async () => {
      try {
        const { data: rpcData, error: rpcErr } = await client.rpc(
          "rpc_dashboard_consultorias",
          {
            p_company_id: companyId,
            p_vendedor_ids: vendedorIds.length > 0 ? vendedorIds : null,
            p_inicio: agoraIso,
            p_fim: limiteIso,
          },
        );
        if (rpcErr) throw rpcErr;
        return { items: (Array.isArray(rpcData) ? rpcData : []).slice(0, limit) };
      } catch (rpcError: unknown) {
        if (!isRpcMissing(rpcError, "rpc_dashboard_consultorias"))
          throw rpcError;
      }

      const creatorIds =
        vendedorIds.length > 0
          ? vendedorIds
          : companyId
            ? await fetchVendedorIdsByCompanyIds(client, [companyId])
            : [];

      if (companyId && creatorIds.length === 0) {
        return { items: [] };
      }

      const fetchRows = async (ids?: string[]) => {
        let consultoriasQuery = client
          .from("consultorias_online")
          .select("id, cliente_nome, data_hora, lembrete, destino, orcamento_id")
          .eq("fechada", false)
          .gte("data_hora", agoraIso)
          .lte("data_hora", limiteIso)
          .order("data_hora", { ascending: true })
          .limit(limit);

        if (ids && ids.length > 0) {
          consultoriasQuery = consultoriasQuery.in("created_by", ids);
        }

        const { data, error } = await consultoriasQuery;
        if (error) throw error;
        return (data || []) as DashboardConsultoriaRow[];
      };

      if (creatorIds.length <= QUERY_IN_BATCH_SIZE) {
        return {
          items: await fetchRows(creatorIds.length > 0 ? creatorIds : undefined),
        };
      }

      const batchRows = await Promise.all(
        chunkArray(creatorIds).map((batch) => fetchRows(batch))
      );
      const rows = batchRows.flat();

      const rowsById = new Map<string, DashboardConsultoriaRow>();
      for (const row of rows) {
        rowsById.set(String(row?.id || ""), row);
      }

      const dedupedRows = Array.from(rowsById.values())
        .sort((left, right) =>
          String(left?.data_hora || "").localeCompare(
            String(right?.data_hora || ""),
          ),
        )
        .slice(0, limit);

      return { items: dedupedRows };
    };
    const payload = noCache
      ? await loadPayload()
      : await getCachedReadModel({
          key: cacheKey,
          tags: [
            READ_MODEL_TAGS.consultorias,
            READ_MODEL_TAGS.dashboard,
            READ_MODEL_TAGS.clients,
            READ_MODEL_TAGS.users,
            ...scopeCacheTags({
              companyIds: companyId ? [companyId] : companyIds,
              vendedorIds,
              userId: user.id,
            }),
          ],
          ttlMs: 120_000,
          staleTtlMs: 600_000,
          loader: loadPayload,
        });

    return json(payload, {
      headers: noCache ? NO_STORE_HEADERS : SHORT_DYNAMIC_READ_HEADERS,
    });
  } catch (error: unknown) {
    logServerError(
      "[dashboard/consultorias] falha ao carregar consultorias",
      error,
    );
    return json(
      { error: "Erro interno ao carregar consultorias." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
