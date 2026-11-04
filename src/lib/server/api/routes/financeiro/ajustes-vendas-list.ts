// Migrado para Hono de src/routes/api/v1/financeiro/ajustes-vendas/list/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  fetchRankingVendedoresByCompanyIds,
  getAdminClient,
  isUuid,
  logServerError,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  sanitizePostgrestSearchTerm,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS, SHORT_DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import {
  cleanStringSet,
  chunkArray,
  dedupeById,
  QUERY_IN_BATCH_SIZE,
  uniqueCleanStrings
} from '$lib/utils/array';

const ISO_DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

type ErrorWithCode = {
  code?: string | null;
  message?: string | null;
};

type AjusteVendaClienteRow = {
  nome?: string | null;
};

type AjusteVendaVendaRow = {
  id?: string | null;
  vendedor_id?: string | null;
  cliente_id?: string | null;
  cancelada?: boolean | null;
  company_id?: string | null;
  clientes?: AjusteVendaClienteRow | null;
};

type AjusteVendaReciboRow = {
  id?: string | null;
  venda_id?: string | null;
  numero_recibo?: string | null;
  data_venda?: string | null;
  valor_total?: number | string | null;
  valor_taxas?: number | string | null;
  vendas?: AjusteVendaVendaRow | null;
};

type AjusteConciliacaoUserRow = {
  id?: string | null;
  nome_completo?: string | null;
};

type AjusteConciliacaoRow = {
  id?: string | null;
  documento?: string | null;
  movimento_data?: string | null;
  valor_lancamentos?: number | string | null;
  valor_venda_real?: number | string | null;
  valor_taxas?: number | string | null;
  ranking_vendedor_id?: string | null;
  venda_id?: string | null;
  venda_recibo_id?: string | null;
  users?: AjusteConciliacaoUserRow | null;
};

type AjusteRateioVendedorRow = {
  id?: string | null;
  nome_completo?: string | null;
};

type AjusteRateioRow = {
  id?: string | null;
  venda_recibo_id?: string | null;
  conciliacao_recibo_id?: string | null;
  ativo?: boolean | null;
  vendedor_origem_id?: string | null;
  vendedor_destino_id?: string | null;
  percentual_origem?: number | string | null;
  percentual_destino?: number | string | null;
  observacao?: string | null;
  updated_at?: string | null;
  vendedor_destino?: AjusteRateioVendedorRow | null;
};

type AjusteVendedorRow = {
  id?: string | null;
  nome_completo?: string | null;
};

function isIsoDate(value?: string | null) {
  const normalized = String(value || "").trim();
  if (!normalized) return true;
  return ISO_DATE_PATTERN.test(normalized);
}

function isRateioTableMissingError(err: unknown) {
  const error = err as ErrorWithCode;
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "42P01" &&
    (message.includes("vendas_recibos_rateio") || message.includes("does not exist"))
  );
}

let rateioMissingLogged = false;

export async function handleFinanceiroAjustesVendasListGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['operacao_conciliacao', 'conciliacao'],
        1,
        'Sem acesso a Ajustes de Vendas.'
      );
    }

    if (!(scope.isAdmin || scope.papel === "MASTER" || scope.papel === "FINANCEIRO" || scope.papel === "GESTOR")) {
      return json(
        { error: "Somente financeiro/gestor/master podem acessar Ajustes de Vendas." },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const url = event.url;
    const requestedCompanyId = String(url.searchParams.get("company_id") || "").trim();
    const inicio = String(url.searchParams.get("inicio") || "").trim();
    const fim = String(url.searchParams.get("fim") || "").trim();
    const vendedorId = String(url.searchParams.get("vendedor_id") || "").trim();
    const termoRaw = sanitizePostgrestSearchTerm(url.searchParams.get("q"));
    const termo = termoRaw.length >= 2 ? termoRaw : "";
    const apenasRateados = url.searchParams.get("apenas_rateados") === "true";
    const limitRaw = Number(url.searchParams.get("limit") || 80);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 80;

    if (!isIsoDate(inicio) || !isIsoDate(fim)) {
      return json({ error: "inicio/fim invalidos. Use YYYY-MM-DD." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (vendedorId && !isUuid(vendedorId)) {
      return json({ error: "vendedor_id invalido." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const companyIds = resolveScopedCompanyIds(scope, requestedCompanyId);
    if (companyIds.length === 0) {
      return json({ error: "company_id nao resolvido para este usuario." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const buildVendaQuery = (companyIdsFilter = companyIds) => {
      let query = client
        .from("vendas_recibos")
        .select(
          `
            id,
            venda_id,
            numero_recibo,
            data_venda,
            valor_total,
            valor_taxas,
            vendas!inner (
              id,
              vendedor_id,
              cliente_id,
              cancelada,
              company_id,
              clientes:clientes!cliente_id (
                nome
              )
            )
          `
        )
        .eq("vendas.cancelada", false)
        .order("data_venda", { ascending: false })
        .limit(limit);

      if (companyIdsFilter.length === 1) {
        query = query.eq("vendas.company_id", companyIdsFilter[0]);
      } else if (companyIdsFilter.length > 1) {
        query = query.in("vendas.company_id", companyIdsFilter);
      }
      if (inicio) query = query.gte("data_venda", inicio);
      if (fim) query = query.lte("data_venda", fim);
      if (vendedorId) query = query.eq("vendas.vendedor_id", vendedorId);
      if (termo) query = query.or(`numero_recibo.ilike.%${termo}%`);

      return query;
    };

    const fetchVendaRows = async () => {
      if (companyIds.length <= QUERY_IN_BATCH_SIZE) {
        return buildVendaQuery();
      }

      const rows: AjusteVendaReciboRow[] = [];
      for (const batch of chunkArray(companyIds)) {
        const result = await buildVendaQuery(batch);
        if (result.error) return { data: null, error: result.error } as typeof result;
        rows.push(...((result.data || []) as AjusteVendaReciboRow[]));
      }

      return {
        data: dedupeById(rows)
          .sort((a, b) => String(b?.data_venda || "").localeCompare(String(a?.data_venda || "")))
          .slice(0, limit),
        error: null,
      };
    };

    const { data, error } = await fetchVendaRows();
    if (error) throw error;

    const vendaRows = (data || []) as AjusteVendaReciboRow[];
    const reciboIds = uniqueCleanStrings(vendaRows.map((row) => row?.id));
    const reciboIdSet = cleanStringSet(reciboIds);

    const buildConciliacaoQuery = (companyIdsFilter = companyIds) => {
      let conciliacaoQuery = client
        .from("conciliacao_recibos")
        .select(
          `
            id,
            documento,
            movimento_data,
            valor_lancamentos,
            valor_venda_real,
            valor_taxas,
            ranking_vendedor_id,
            venda_id,
            venda_recibo_id,
            users:users!ranking_vendedor_id (
              id,
              nome_completo
            )
          `
        )
        .in("company_id", companyIdsFilter)
        .is("venda_recibo_id", null)
        .neq("is_baixa_rac", true)
        .order("movimento_data", { ascending: false })
        .limit(limit);

      if (inicio) conciliacaoQuery = conciliacaoQuery.gte("movimento_data", inicio);
      if (fim) conciliacaoQuery = conciliacaoQuery.lte("movimento_data", fim);
      if (vendedorId) conciliacaoQuery = conciliacaoQuery.eq("ranking_vendedor_id", vendedorId);
      if (termo) conciliacaoQuery = conciliacaoQuery.ilike("documento", `%${termo}%`);
      return conciliacaoQuery;
    };

    const fetchConciliacaoRows = async () => {
      if (companyIds.length <= QUERY_IN_BATCH_SIZE) {
        return buildConciliacaoQuery();
      }

      const rows: AjusteConciliacaoRow[] = [];
      for (const batch of chunkArray(companyIds)) {
        const result = await buildConciliacaoQuery(batch);
        if (result.error) return { data: null, error: result.error } as typeof result;
        rows.push(...((result.data || []) as AjusteConciliacaoRow[]));
      }

      return {
        data: dedupeById(rows)
          .sort((a, b) => String(b?.movimento_data || "").localeCompare(String(a?.movimento_data || "")))
          .slice(0, limit),
        error: null,
      };
    };

    const { data: conciliacaoData, error: conciliacaoError } = await fetchConciliacaoRows();
    if (conciliacaoError) throw conciliacaoError;

    const conciliacaoRows = (conciliacaoData || []) as AjusteConciliacaoRow[];
    const conciliacaoIds = uniqueCleanStrings(conciliacaoRows.map((row) => row?.id));
    const conciliacaoIdSet = cleanStringSet(conciliacaoIds);

    let rateioMap = new Map<string, AjusteRateioRow>();
    if (reciboIds.length > 0 || conciliacaoIds.length > 0) {
      const buildRateioQuery = () =>
        client
          .from("vendas_recibos_rateio")
          .select(
            `
              id,
              venda_recibo_id,
              conciliacao_recibo_id,
              ativo,
              vendedor_origem_id,
              vendedor_destino_id,
              percentual_origem,
              percentual_destino,
              observacao,
              updated_at,
              vendedor_destino:users!vendedor_destino_id (
                id,
                nome_completo
              )
            `
          );

      const rateioDataRows: AjusteRateioRow[] = [];
      let rateioError: unknown = null;
      const companyBatches = companyIds.length > QUERY_IN_BATCH_SIZE ? chunkArray(companyIds) : [companyIds];
      for (const batch of companyBatches) {
        let scopedRateioQuery = buildRateioQuery();
        if (batch.length === 1) {
          scopedRateioQuery = scopedRateioQuery.eq("company_id", batch[0]);
        } else if (batch.length > 1) {
          scopedRateioQuery = scopedRateioQuery.in("company_id", batch);
        }

        const { data: batchData, error: batchError } = await scopedRateioQuery;
        if (batchError) {
          rateioError = batchError;
          break;
        }
        rateioDataRows.push(...((batchData || []) as AjusteRateioRow[]));
      }

      if (rateioError) {
        if (!isRateioTableMissingError(rateioError)) {
          throw rateioError;
        }
        if (!rateioMissingLogged) {
          rateioMissingLogged = true;
          logServerError("[ajustes-vendas/list] tabela vendas_recibos_rateio ainda nao existe", rateioError);
        }
      } else {
        for (const row of rateioDataRows) {
          const vendaReciboKey = String(row?.venda_recibo_id || "").trim();
          const concKey = String(row?.conciliacao_recibo_id || "").trim();
          if (vendaReciboKey && reciboIdSet.has(vendaReciboKey)) {
            rateioMap.set(`vr:${vendaReciboKey}`, row);
          }
          if (concKey && conciliacaoIdSet.has(concKey)) {
            rateioMap.set(`cr:${concKey}`, row);
          }
        }
      }
    }

    const vendedorIdsFromRows = uniqueCleanStrings(
      vendaRows.map((row) => row?.vendas?.vendedor_id)
    );
    const vendedorNomeMap = new Map<string, string>();
    if (vendedorIdsFromRows.length > 0) {
      for (const batch of chunkArray(vendedorIdsFromRows)) {
        const { data: vendedoresOrigem, error: vendedoresOrigemError } = await client
          .from("users")
          .select("id, nome_completo")
          .in("id", batch);
        if (vendedoresOrigemError) throw vendedoresOrigemError;
        for (const row of vendedoresOrigem || []) {
          const id = String(row?.id || "").trim();
          if (!id) continue;
          vendedorNomeMap.set(id, String(row?.nome_completo || "Sem vendedor"));
        }
      }
    }

    const itensVendas = vendaRows.map((row) => {
      const baseId = String(row?.id || "").trim();
      const rateio = rateioMap.get(`vr:${baseId}`) || null;
      const vendedorOrigemId = String(row?.vendas?.vendedor_id || "");
      return {
        id: `vr:${baseId}`,
        recibo_tipo: "venda",
        recibo_origem_id: baseId,
        venda_id: String(row?.venda_id || ""),
        numero_recibo: String(row?.numero_recibo || "").trim() || "-",
        data_venda: String(row?.data_venda || "").slice(0, 10),
        valor_total: Number(row?.valor_total || 0),
        valor_taxas: Number(row?.valor_taxas || 0),
        vendedor_origem_id: vendedorOrigemId,
        vendedor_origem_nome: String(vendedorNomeMap.get(vendedorOrigemId) || "Sem vendedor"),
        cliente_nome: String(row?.vendas?.clientes?.nome || ""),
        rateio: rateio
          ? {
              id: String(rateio?.id || ""),
              ativo: Boolean(rateio?.ativo),
              vendedor_destino_id: String(rateio?.vendedor_destino_id || ""),
              vendedor_destino_nome: String(
                rateio?.vendedor_destino?.nome_completo || "Sem vendedor"
              ),
              percentual_origem: Number(rateio?.percentual_origem || 0),
              percentual_destino: Number(rateio?.percentual_destino || 0),
              observacao: String(rateio?.observacao || ""),
              updated_at: String(rateio?.updated_at || ""),
            }
          : null,
      };
    });

    const itensConciliacao = conciliacaoRows.map((row) => {
      const concId = String(row?.id || "").trim();
      const rateio = rateioMap.get(`cr:${concId}`) || null;
      const vendedorOrigemId = String(row?.ranking_vendedor_id || "");
      const bruto =
        Number(row?.valor_venda_real || 0) > 0
          ? Number(row?.valor_venda_real || 0)
          : Number(row?.valor_lancamentos || 0);
      return {
        id: `cr:${concId}`,
        recibo_tipo: "conciliacao",
        recibo_origem_id: concId,
        venda_id: String(row?.venda_id || ""),
        numero_recibo: String(row?.documento || "").trim() || "-",
        data_venda: String(row?.movimento_data || "").slice(0, 10),
        valor_total: Number(bruto || 0),
        valor_taxas: Number(row?.valor_taxas || 0),
        vendedor_origem_id: vendedorOrigemId,
        vendedor_origem_nome: String(
          row?.users?.nome_completo || vendedorNomeMap.get(vendedorOrigemId) || "Sem vendedor"
        ),
        cliente_nome: "",
        rateio: rateio
          ? {
              id: String(rateio?.id || ""),
              ativo: Boolean(rateio?.ativo),
              vendedor_destino_id: String(rateio?.vendedor_destino_id || ""),
              vendedor_destino_nome: String(
                rateio?.vendedor_destino?.nome_completo || "Sem vendedor"
              ),
              percentual_origem: Number(rateio?.percentual_origem || 0),
              percentual_destino: Number(rateio?.percentual_destino || 0),
              observacao: String(rateio?.observacao || ""),
              updated_at: String(rateio?.updated_at || ""),
            }
          : null,
      };
    });

    const itensUnificados = [...itensVendas, ...itensConciliacao]
      .sort((a, b) => String(b?.data_venda || "").localeCompare(String(a?.data_venda || "")));

    const items = (apenasRateados
      ? itensUnificados.filter((item) => item.rateio && item.rateio.ativo)
      : itensUnificados
    ).slice(0, limit);

    const vendedoresData = await fetchRankingVendedoresByCompanyIds(client, companyIds);

    const vendedores = ((vendedoresData || []) as AjusteVendedorRow[]).map((row) => ({
      id: String(row?.id || ""),
      nome_completo: String(row?.nome_completo || "Sem nome"),
    }));

    return json({ items, vendedores }, { headers: SHORT_DYNAMIC_READ_HEADERS });
  } catch (err: unknown) {
    logServerError("[financeiro/ajustes-vendas/list] erro ao carregar lista", err);
    return json(
      { error: "Erro ao carregar ajustes de vendas." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
