import type { DataClient } from '$lib/server/data';
// Migrado para Hono de src/routes/api/v1/parametros/metas/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from "@sveltejs/kit";
import { currentMonthRangeISODate, monthRangeFromKey } from "$lib/date";
import {
  ensureModuloAccess,
  fetchRankingVendedoresByCompanyIds,
  getAdminClient,
  isRankingEligibleUser,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse,
} from "$lib/server/v1";
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  invalidateReadModelCache,
  READ_MODEL_TAGS,
  scopeCacheTags,
} from "$lib/server/readModelCache";
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from "$lib/server/httpCache";
import { readJsonBodyLimited, rejectCrossOriginRequest } from "$lib/server/requestGuards";
import { chunkArray } from "$lib/utils/array";

const MAX_PARAMETROS_METAS_BODY_BYTES = 512 * 1024;
const PT_BR_COLLATOR = new Intl.Collator("pt-BR");

type MetaProdutoInput = {
  produto_id?: string | null;
  valor?: number | string | null;
};

type MetaInput = {
  id?: string | null;
  vendedor_id?: string | null;
  periodo?: string | null;
  meta_geral?: number | string | null;
  meta_diferenciada?: number | string | null;
  ativo?: boolean | null;
  meta_produtos?: MetaProdutoInput[] | null;
};

type UserTypeNameRow = { name?: string | null };

type RankingUserRow = {
  id?: string | null;
  nome_completo?: string | null;
  email?: string | null;
  company_id?: string | null;
  active?: boolean | null;
  uso_individual?: boolean | null;
  participa_ranking?: boolean | null;
  user_types?: UserTypeNameRow | UserTypeNameRow[] | null;
};

type ProdutoDiferenciadoRow = {
  id?: string | null;
  nome?: string | null;
  tipo?: string | null;
  ativo?: boolean | null;
  soma_na_meta?: boolean | null;
  regra_comissionamento?: string | null;
  usa_meta_produto?: boolean | null;
  meta_produto_valor?: number | string | null;
};

type ProdutoMetaRow = {
  id?: string | null;
  meta_vendedor_id?: string | null;
  produto_id?: string | null;
  valor?: number | string | null;
  produto?: ProdutoDiferenciadoRow | null;
};

type MetaVendedorRow = {
  id?: string | null;
  vendedor_id?: string | null;
  periodo?: string | null;
  meta_geral?: number | string | null;
  meta_diferenciada?: number | string | null;
  ativo?: boolean | null;
  scope?: string | null;
};

type MetasPostBody = MetaInput & {
  items?: MetaInput[] | null;
};

function readErrorField(error: unknown, field: string) {
  return error && typeof error === "object"
    ? (error as Record<string, unknown>)[field]
    : undefined;
}

function isMissingSchemaError(err: unknown) {
  const code = String(readErrorField(err, "code") || "");
  const message = String(readErrorField(err, "message") || "").toLowerCase();
  const details = String(readErrorField(err, "details") || "").toLowerCase();

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST200" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find") ||
    details.includes("could not find")
  );
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePeriod(value?: string | null) {
  const raw = String(value || "").trim();
  const monthKey = raw.match(/^(\d{4})-(0[1-9]|1[0-2])$/)?.[0];
  if (monthKey) return `${monthKey}-01`;

  const dateKey = raw.match(/^(\d{4})-(0[1-9]|1[0-2])-\d{2}$/)?.[0];
  if (dateKey) return `${dateKey.slice(0, 7)}-01`;

  return currentMonthRangeISODate().inicio;
}

function normalizeProdutoMetas(items: MetaProdutoInput[] | null | undefined) {
  const map = new Map<string, number>();

  for (const item of items || []) {
    const produtoId = String(item?.produto_id || "").trim();
    if (!isUuid(produtoId)) continue;

    const valor = toNumber(item?.valor);
    if (valor <= 0) continue;

    map.set(produtoId, (map.get(produtoId) || 0) + valor);
  }

  return Array.from(map.entries()).map(([produto_id, valor]) => ({
    produto_id,
    valor,
  }));
}

async function loadScopedVendedores(
  client: DataClient,
  scope: Awaited<ReturnType<typeof resolveUserScope>>,
) {
  const sortByName = (rows: RankingUserRow[]) =>
    [...rows].sort((a, b) =>
      PT_BR_COLLATOR.compare(
        String(a?.nome_completo || a?.email || ""),
        String(b?.nome_completo || b?.email || ""),
      ),
    );

  if (scope.isAdmin) {
    return getCachedReadModel<RankingUserRow[]>({
      key: buildReadModelCacheKey("parametros-metas:vendedores-admin", {}),
      tags: [READ_MODEL_TAGS.users, READ_MODEL_TAGS.metas],
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        const { data, error } = await client
          .from("users")
          .select(
            "id, nome_completo, email, company_id, active, uso_individual, participa_ranking, user_types(name)",
          )
          .eq("active", true)
          .eq("uso_individual", false)
          .order("nome_completo")
          .limit(5000);

        if (error) throw error;
        return sortByName(((data || []) as RankingUserRow[]).filter(isRankingEligibleUser));
      },
    });
  }

  if (scope.isMaster || scope.isGestor) {
    return sortByName(
      await fetchRankingVendedoresByCompanyIds(client, scope.companyIds),
    );
  }

  const { data, error } = await client
    .from("users")
    .select(
      "id, nome_completo, email, company_id, active, uso_individual, participa_ranking, user_types(name)",
    )
    .eq("id", scope.userId)
    .maybeSingle();

  if (error) throw error;
  return data ? [data] : [];
}

async function loadProdutosDiferenciados(client: DataClient) {
  return getCachedReadModel<ProdutoDiferenciadoRow[]>({
    key: buildReadModelCacheKey("parametros-metas:produtos-diferenciados", {}),
    tags: [READ_MODEL_TAGS.catalog, READ_MODEL_TAGS.metas, READ_MODEL_TAGS.comissoes],
    ttlMs: 300_000,
    staleTtlMs: 1_800_000,
    loader: async () => {
      const fullCols =
        "id, nome, tipo, ativo, soma_na_meta, regra_comissionamento, usa_meta_produto, meta_produto_valor";

      const primary = await client
        .from("tipo_produtos")
        .select(fullCols)
        .eq("ativo", true)
        .order("nome")
        .limit(500);
      let data = (primary.data || []) as ProdutoDiferenciadoRow[];
      let error = primary.error;

      if (error && isMissingSchemaError(error)) {
        const fallback = await client
          .from("tipo_produtos")
          .select("id, nome, tipo, ativo")
          .eq("ativo", true)
          .order("nome")
          .limit(500);
        data = (fallback.data || []) as unknown as ProdutoDiferenciadoRow[];
        error = fallback.error;
      }

      if (error) throw error;

      return ((data || []) as ProdutoDiferenciadoRow[]).filter((row) => {
        const nomeTipo = `${row?.nome || ""} ${row?.tipo || ""}`.toLowerCase();
        return (
          row?.regra_comissionamento === "diferenciado" ||
          row?.usa_meta_produto === true ||
          row?.tipo === "seguro" ||
          nomeTipo.includes("seguro")
        );
      });
    },
  });
}

async function loadProdutoMetas(client: DataClient, metaIds: string[]) {
  if (metaIds.length === 0) return new Map<string, ProdutoMetaRow[]>();

  const rows = await getCachedReadModel<ProdutoMetaRow[]>({
    key: buildReadModelCacheKey("parametros-metas:produto-metas", {
      metaIds: [...metaIds].sort(),
    }),
    tags: [READ_MODEL_TAGS.metas, READ_MODEL_TAGS.catalog],
    ttlMs: 120_000,
    staleTtlMs: 600_000,
    loader: async () => {
      const rows: ProdutoMetaRow[] = [];
      for (const metaBatch of chunkArray(metaIds)) {
        const { data, error } = await client
          .from("metas_vendedor_produto")
          .select(
            "id, meta_vendedor_id, produto_id, valor, produto:tipo_produtos!produto_id(id, nome, tipo)",
          )
          .in("meta_vendedor_id", metaBatch);

        if (error) {
          if (isMissingSchemaError(error)) return [];
          throw error;
        }
        rows.push(...((data || []) as unknown as ProdutoMetaRow[]));
      }
      return rows;
    },
  });

  const map = new Map<string, ProdutoMetaRow[]>();
  for (const row of rows) {
    const metaId = String(row?.meta_vendedor_id || "").trim();
    if (!metaId) continue;
    const list = map.get(metaId) || [];
    list.push(row);
    map.set(metaId, list);
  }

  return map;
}

async function assertTargetAllowed(
  client: DataClient,
  scope: Awaited<ReturnType<typeof resolveUserScope>>,
  vendedorId: string,
) {
  if (scope.isAdmin) return true;
  if (scope.isMaster || scope.isGestor) {
    const scopedVendedores = await loadScopedVendedores(client, scope);
    return scopedVendedores.some(
      (row) => String(row?.id || "") === vendedorId,
    );
  }

  return vendedorId === scope.userId;
}

async function findExistingMetaId(
  client: DataClient,
  vendedorId: string,
  periodo: string,
) {
  // Não filtra por scope para encontrar metas existentes independente do tipo de usuário
  let query = client
    .from("metas_vendedor")
    .select("id")
    .eq("vendedor_id", vendedorId)
    .eq("periodo", periodo)
    .order("created_at", { ascending: true })
    .limit(1);

  let { data, error } = await query;

  if (error && isMissingSchemaError(error)) {
    const fallback = await client
      .from("metas_vendedor")
      .select("id")
      .eq("vendedor_id", vendedorId)
      .eq("periodo", periodo)
      .limit(1);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw error;
  return String(data?.[0]?.id || "");
}

async function resolveMetaUserScope(client: DataClient, userId: string): Promise<"vendedor" | "gestor"> {
  try {
    const { data, error } = await client
      .from("users")
      .select("uso_individual, user_types(name)")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return "vendedor";
    const usoIndividual = Boolean(data?.uso_individual);
    if (usoIndividual) return "vendedor";
    const userRow = data as RankingUserRow;
    const tipoNome = String(
      Array.isArray(userRow.user_types)
        ? (userRow.user_types[0]?.name || "")
        : (userRow.user_types?.name || "")
    ).toUpperCase();
    return tipoNome.includes("GESTOR") ? "gestor" : "vendedor";
  } catch {
    return "vendedor";
  }
}

async function upsertMeta(
  client: DataClient,
  input: MetaInput,
  fallbackPeriod?: string,
) {
  const targetVendedorId = String(input?.vendedor_id || "").trim();
  if (!isUuid(targetVendedorId)) throw new Error("Vendedor inválido.");

  const periodoFull = normalizePeriod(input?.periodo || fallbackPeriod);
  const metaProdutos = normalizeProdutoMetas(input?.meta_produtos);
  const totalProduto = metaProdutos.reduce((sum, item) => sum + item.valor, 0);
  const metaDiferenciada =
    totalProduto > 0 ? totalProduto : toNumber(input?.meta_diferenciada);

  // Determina o scope correto baseado no tipo do usuário alvo.
  // A constraint do banco exige scope="gestor" para usuários do tipo GESTOR.
  const userScope = await resolveMetaUserScope(client, targetVendedorId);

  const payload: Record<string, unknown> = {
    vendedor_id: targetVendedorId,
    periodo: periodoFull,
    meta_geral: toNumber(input?.meta_geral),
    meta_diferenciada: metaDiferenciada,
    ativo: input?.ativo !== false,
    scope: userScope,
  };

  let metaId = String(input?.id || "").trim();
  if (!isUuid(metaId))
    metaId = await findExistingMetaId(client, targetVendedorId, periodoFull);

  const savePayload = async (row: Record<string, unknown>) => {
    const saveQuery = metaId
      ? client.from("metas_vendedor").update(row).eq("id", metaId)
      : client.from("metas_vendedor").insert(row);

    return saveQuery.select("id").single();
  };

  let { data, error } = await savePayload(payload);

  // Fallback 1: coluna scope não existe no banco
  if (error && isMissingSchemaError(error) && "scope" in payload) {
    const { scope: _scope, ...payloadWithoutScope } = payload;
    ({ data, error } = await savePayload(payloadWithoutScope));
  }

  if (error) throw error;
  metaId = String(data?.id || metaId);

  if (!metaId) throw new Error("Meta não foi gravada.");

  const deleteRes = await client
    .from("metas_vendedor_produto")
    .delete()
    .eq("meta_vendedor_id", metaId);
  if (deleteRes.error && !isMissingSchemaError(deleteRes.error))
    throw deleteRes.error;

  if (metaProdutos.length > 0 && !deleteRes.error) {
    const rows = metaProdutos.map((item) => ({
      meta_vendedor_id: metaId,
      produto_id: item.produto_id,
      valor: item.valor,
    }));
    const { error } = await client.from("metas_vendedor_produto").insert(rows);
    if (error && !isMissingSchemaError(error)) throw error;
  }

  return metaId;
}

export async function handleParametrosMetasGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ["parametros_metas", "metas", "parametros"],
        1,
        "Sem acesso a Metas.",
      );
    }

    const { searchParams } = event.url;
    const vendedorId = String(searchParams.get("vendedor_id") || "").trim();
    const periodo = normalizePeriod(searchParams.get("periodo"));
    const monthRange =
      monthRangeFromKey(periodo.slice(0, 7)) || currentMonthRangeISODate();

    const scopedVendedores = await loadScopedVendedores(client, scope);
    const scopedIds = scopedVendedores
      .map((row) => String(row?.id || "").trim())
      .filter(isUuid);
    const vendedorIds =
      vendedorId && scopedIds.includes(vendedorId) ? [vendedorId] : scopedIds;

    let metas: MetaVendedorRow[] = [];
    if (vendedorIds.length > 0) {
      for (const vendedorBatch of chunkArray(vendedorIds)) {
        let batchData: MetaVendedorRow[] = [];
        // Tenta com filtro de scope (coluna pode não existir em bancos antigos)
        const withScope = await client
          .from("metas_vendedor")
          .select("id, vendedor_id, periodo, meta_geral, meta_diferenciada, ativo, scope")
          .in("vendedor_id", vendedorBatch)
          .in("scope", ["vendedor", "gestor"])
          .gte("periodo", monthRange.inicio)
          .lte("periodo", monthRange.fim)
          .order("periodo", { ascending: false })
          .limit(1000);

        if (withScope.error) {
          if (isMissingSchemaError(withScope.error)) {
            // Coluna scope não existe — busca sem filtro de scope
            const withoutScope = await client
              .from("metas_vendedor")
              .select("id, vendedor_id, periodo, meta_geral, meta_diferenciada, ativo")
              .in("vendedor_id", vendedorBatch)
              .gte("periodo", monthRange.inicio)
              .lte("periodo", monthRange.fim)
              .order("periodo", { ascending: false })
              .limit(1000);
            if (withoutScope.error) {
              // Tabela inteira não existe
              if (isMissingSchemaError(withoutScope.error)) {
                return json({
                  items: [],
                  vendedores: scopedVendedores,
                  produtos: [],
                  periodo: periodo.slice(0, 7),
                }, { headers: DYNAMIC_READ_HEADERS });
              }
              throw withoutScope.error;
            }
            batchData = withoutScope.data || [];
          } else {
            throw withScope.error;
          }
        } else {
          batchData = withScope.data || [];
        }

        metas.push(...batchData);
      }
    }

    const metaIds = metas
      .map((row) => String(row?.id || "").trim())
      .filter(isUuid);

    // produtoMetasMap depende de metaIds; loadProdutosDiferenciados é independente.
    // Executar em paralelo para eliminar round-trip sequencial.
    const [produtoMetasMap, produtos] = await Promise.all([
      loadProdutoMetas(client, metaIds),
      loadProdutosDiferenciados(client)
    ]);

    const vendedorMap = new Map(
      scopedVendedores.map((row) => [String(row?.id || ""), row]),
    );

    const items = metas.map((row) => {
      const detalhes = produtoMetasMap.get(String(row?.id || "")) || [];
      return {
        ...row,
        vendedor: vendedorMap.get(String(row?.vendedor_id || "")) || null,
        meta_produtos: detalhes,
      };
    });

    return json({
      items,
      vendedores: scopedVendedores,
      produtos,
      periodo: periodo.slice(0, 7),
    }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, "Erro ao carregar metas.");
  }
}

export async function handleParametrosMetasPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_PARAMETROS_METAS_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ["parametros_metas", "metas", "parametros"],
        2,
        "Sem permissão para salvar metas.",
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as MetasPostBody)
        : {};
    const inputs: MetaInput[] = Array.isArray(body?.items)
      ? body.items
      : [body];
    if (inputs.length === 0)
      return json({ error: "Nenhuma meta informada." }, { status: 400, headers: NO_STORE_HEADERS });

    const scopedVendedores = await loadScopedVendedores(client, scope);
    const allowedIds = new Set(
      scopedVendedores
        .map((row) => String(row?.id || "").trim())
        .filter(isUuid),
    );
    const vendedorCompanyById = new Map(
      scopedVendedores
        .map((row) => [
          String(row?.id || "").trim(),
          String(row?.company_id || "").trim(),
        ] as const)
        .filter(([vendedorId]) => isUuid(vendedorId)),
    );
    const fallbackPeriod = normalizePeriod(body?.periodo);
    const ids: string[] = [];
    const targetVendedorIds: string[] = [];

    for (const input of inputs) {
      const targetVendedorId = String(input?.vendedor_id || "").trim();
      if (!isUuid(targetVendedorId))
        return json({ error: "Vendedor inválido." }, { status: 400, headers: NO_STORE_HEADERS });

      const allowed =
        scope.isAdmin ||
        allowedIds.has(targetVendedorId) ||
        (await assertTargetAllowed(client, scope, targetVendedorId));
      if (!allowed)
        return json({ error: "Vendedor fora do seu escopo." }, { status: 403, headers: NO_STORE_HEADERS });

      targetVendedorIds.push(targetVendedorId);
      ids.push(await upsertMeta(client, input, fallbackPeriod));
    }

    const targetCompanyIds = Array.from(
      new Set(
        targetVendedorIds
          .map((vendedorId) => vendedorCompanyById.get(vendedorId) || "")
          .filter(Boolean),
      ),
    );
    const metaScopeTags = scopeCacheTags({
      companyIds: targetCompanyIds.length > 0 ? targetCompanyIds : scope.companyIds,
      vendedorIds: targetVendedorIds,
      userId: user.id,
    });
    invalidateReadModelCache({
      tags: [
        READ_MODEL_TAGS.metas,
        READ_MODEL_TAGS.dashboard,
        READ_MODEL_TAGS.vendasKpis,
        READ_MODEL_TAGS.ranking,
        READ_MODEL_TAGS.comissoes,
      ],
      scopeTags: metaScopeTags,
    });

    return json({ ok: true, ids, id: ids[0] || null }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, "Erro ao salvar meta.");
  }
}

export async function handleParametrosMetasDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ["parametros_metas", "metas", "parametros"],
        3,
        "Sem permissão para excluir metas.",
      );
    }

    const id = String(event.url.searchParams.get("id") || "").trim();
    if (!isUuid(id)) return json({ error: "ID inválido." }, { status: 400, headers: NO_STORE_HEADERS });

    const { data: meta, error: metaError } = await client
      .from("metas_vendedor")
      .select("id, vendedor_id")
      .eq("id", id)
      .maybeSingle();
    if (metaError) throw metaError;
    const vendedorId = String(meta?.vendedor_id || "").trim();

    if (!scope.isAdmin) {
      if (
        !vendedorId ||
        !(await assertTargetAllowed(client, scope, vendedorId))
      ) {
        return json({ error: "Meta fora do seu escopo." }, { status: 403, headers: NO_STORE_HEADERS });
      }
    }

    let vendedorCompanyId = "";
    if (vendedorId) {
      const { data: vendedorRow } = await client
        .from("users")
        .select("company_id")
        .eq("id", vendedorId)
        .maybeSingle();
      vendedorCompanyId = String(vendedorRow?.company_id || "").trim();
    }

    const { error: deleteError } = await client
      .from("metas_vendedor")
      .delete()
      .eq("id", id);
    if (deleteError) throw deleteError;

    invalidateReadModelCache({
      tags: [
        READ_MODEL_TAGS.metas,
        READ_MODEL_TAGS.dashboard,
        READ_MODEL_TAGS.vendasKpis,
        READ_MODEL_TAGS.ranking,
        READ_MODEL_TAGS.comissoes,
      ],
      scopeTags: scopeCacheTags({
        companyIds: vendedorCompanyId ? [vendedorCompanyId] : scope.companyIds,
        vendedorIds: vendedorId ? [vendedorId] : [],
        userId: user.id,
      }),
    });

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, "Erro ao excluir meta.");
  }
}
