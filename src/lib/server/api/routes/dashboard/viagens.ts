// Migrado para Hono de src/routes/api/v1/dashboard/viagens/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  fetchRankingVendedoresByCompanyIds,
  getAdminClient,
  parseUuidList,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { addDaysISODate, todayISODateLocal } from '$lib/date';
import { normalizeViagemStatus } from '$lib/viagens/status';
import { syncViagensStatus } from '$lib/server/viagensStatus';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import { cleanStringSet, chunkArray, uniqueCleanStrings } from '$lib/utils/array';

type DashboardViagemRow = {
  id: string;
  venda_id: string | null;
  cliente_id: string | null;
  company_id: string;
  responsavel_user_id: string | null;
  destino: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: string | null;
};

type DashboardViagemClienteRow = {
  id?: string | null;
  nome?: string | null;
  whatsapp?: string | null;
  telefone?: string | null;
};

type DashboardViagemVendedorRow = {
  id?: string | null;
  nome_completo?: string | null;
};

type DashboardViagemVendaRow = {
  id?: string | null;
  numero_venda?: string | number | null;
};

function isCancelledStatus(value?: string | null) {
  return normalizeViagemStatus(value) === 'cancelada';
}

function clampIntParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function compareNullableDate(a?: string | null, b?: string | null) {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
}

function mergeDashboardViagens(...groups: DashboardViagemRow[][]) {
  const byId = new Map<string, DashboardViagemRow>();
  for (const group of groups) {
    for (const row of group) {
      const id = String(row?.id || '').trim();
      if (id && !byId.has(id)) byId.set(id, row);
    }
  }
  return Array.from(byId.values()).sort((a, b) =>
    compareNullableDate(a.data_inicio, b.data_inicio)
  );
}

async function fetchDashboardViagens(params: {
  client: ReturnType<typeof getAdminClient>;
  companyIds: string[];
  vendedorIds: string[];
  from: string;
  to?: string;
  ongoing?: boolean;
  limit: number;
}) {
  const baseSelect =
    'id, venda_id, cliente_id, company_id, responsavel_user_id, destino, data_inicio, data_fim, status';
  const buildQuery = (selectFields: string, companyBatch?: string[] | null) => {
    let query = params.client
      .from('viagens')
      .select(selectFields)
      .order('data_inicio', { ascending: true })
      .limit(params.limit);

    if (params.ongoing) {
      query = query.lte('data_inicio', params.from).gte('data_fim', params.from);
    } else {
      query = query.gte('data_inicio', params.from);
      if (params.to) query = query.lte('data_inicio', params.to);
    }

    if (companyBatch && companyBatch.length > 0) {
      query = query.in('company_id', companyBatch);
    }

    return query;
  };

  const companyBatches = params.companyIds.length > 0 ? chunkArray(params.companyIds) : [null];

  if (params.vendedorIds.length > 0) {
    const batchRows = await Promise.all(
      companyBatches.flatMap((companyBatch) =>
        chunkArray(params.vendedorIds).map(async (vendedorBatch) => {
          const [responsavelResult, vendaResult] = await Promise.all([
            buildQuery(baseSelect, companyBatch).in('responsavel_user_id', vendedorBatch),
            buildQuery(`${baseSelect}, venda:vendas!inner(id, vendedor_id)`, companyBatch).in(
              'venda.vendedor_id',
              vendedorBatch
            )
          ]);

          if (responsavelResult.error) throw responsavelResult.error;
          if (vendaResult.error) throw vendaResult.error;
          return [
            ...((responsavelResult.data || []) as unknown as DashboardViagemRow[]),
            ...((vendaResult.data || []) as unknown as DashboardViagemRow[])
          ];
        })
      )
    );
    return mergeDashboardViagens(batchRows.flat())
      .slice(0, params.limit)
      .filter((row) => !isCancelledStatus(row.status));
  } else {
    const batchRows = await Promise.all(
      companyBatches.map(async (companyBatch) => {
        const result = await buildQuery(baseSelect, companyBatch);
        if (result.error) throw result.error;
        return (result.data || []) as unknown as DashboardViagemRow[];
      })
    );
    return mergeDashboardViagens(batchRows.flat())
      .slice(0, params.limit)
      .filter((row) => !isCancelledStatus(row.status));
  }
}

async function hydrateViagens(
  client: ReturnType<typeof getAdminClient>,
  rows: DashboardViagemRow[]
) {
  if (rows.length === 0) return [];

  const resolvedStatuses = await syncViagensStatus(client, rows);

  const clienteIds = uniqueCleanStrings(rows.map((row) => row.cliente_id));
  const clientesMap = new Map<string, { nome: string; contato: string | null }>();
  if (clienteIds.length > 0) {
    const batchRows = await Promise.all(
      chunkArray(clienteIds).map(async (batch) => {
        const { data, error } = await client
          .from('clientes')
          .select('id, nome, whatsapp, telefone')
          .in('id', batch);
        if (error) throw error;
        return (data || []) as DashboardViagemClienteRow[];
      })
    );
    for (const row of batchRows.flat()) {
      const id = String(row?.id || '').trim();
      if (!id) continue;
      clientesMap.set(id, {
        nome: String(row?.nome || 'Cliente'),
        contato: row?.whatsapp || row?.telefone || null
      });
    }
  }

  const vendedorIds = uniqueCleanStrings(rows.map((row) => row.responsavel_user_id));
  const vendedoresMap = new Map<string, string>();
  if (vendedorIds.length > 0) {
    const batchRows = await Promise.all(
      chunkArray(vendedorIds).map(async (batch) => {
        const { data, error } = await client
          .from('users')
          .select('id, nome_completo')
          .in('id', batch);
        if (error) throw error;
        return (data || []) as DashboardViagemVendedorRow[];
      })
    );
    for (const row of batchRows.flat()) {
      const id = String(row?.id || '').trim();
      if (id) vendedoresMap.set(id, String(row?.nome_completo || ''));
    }
  }

  const vendaIds = uniqueCleanStrings(rows.map((row) => row.venda_id));
  const vendasMap = new Map<string, string | null>();
  if (vendaIds.length > 0) {
    const batchRows = await Promise.all(
      chunkArray(vendaIds).map(async (batch) => {
        const { data, error } = await client
          .from('vendas')
          .select('id, numero_venda')
          .in('id', batch);
        if (error) throw error;
        return (data || []) as DashboardViagemVendaRow[];
      })
    );
    for (const row of batchRows.flat()) {
      const id = String(row?.id || '').trim();
      if (id) vendasMap.set(id, row?.numero_venda ? String(row.numero_venda) : null);
    }
  }

  // Agrupa por venda_id: usa data_inicio mínima (1º embarque) e data_fim máxima (último retorno).
  // Viagens avulsas (sem venda_id) são representadas individualmente pelo próprio id.
  const grupos = new Map<
    string,
    {
      id: string;
      venda_id: string | null;
      cliente_id: string | null;
      responsavel_user_id: string | null;
      destino: string | null;
      data_inicio: string | null;
      data_fim: string | null;
      status: string;
    }
  >();

  for (const row of rows) {
    const key = row.venda_id || row.id;
    const status = resolvedStatuses.get(row.id) || normalizeViagemStatus(row.status);
    const existing = grupos.get(key);

    if (!existing) {
      grupos.set(key, {
        id: row.id,
        venda_id: row.venda_id,
        cliente_id: row.cliente_id,
        responsavel_user_id: row.responsavel_user_id,
        destino: row.destino,
        data_inicio: row.data_inicio,
        data_fim: row.data_fim,
        status
      });
    } else {
      // Mantém a data_inicio mínima (primeiro embarque da venda)
      if (row.data_inicio && (!existing.data_inicio || row.data_inicio < existing.data_inicio)) {
        existing.data_inicio = row.data_inicio;
      }
      // Mantém a data_fim máxima (último retorno da venda)
      if (row.data_fim && (!existing.data_fim || row.data_fim > existing.data_fim)) {
        existing.data_fim = row.data_fim;
      }
      // Destino do primeiro recibo (já está no existing)
    }
  }

  // Reordena por data_inicio após agrupamento
  const grouped = Array.from(grupos.values()).sort((a, b) =>
    compareNullableDate(a.data_inicio, b.data_inicio)
  );

  return grouped.map((row) => {
    const cliente = row.cliente_id ? clientesMap.get(row.cliente_id) : null;

    return {
      id: row.id,
      venda_id: row.venda_id,
      numero_venda: row.venda_id ? vendasMap.get(row.venda_id) || null : null,
      data_inicio: row.data_inicio,
      data_fim: row.data_fim,
      data_embarque: row.data_inicio,
      data_final: row.data_fim,
      cliente_nome: cliente?.nome || 'Cliente',
      cliente_whatsapp: cliente?.contato || null,
      clientes: { nome: cliente?.nome || 'Cliente' },
      destino: row.destino || 'Destino',
      vendedor_nome: row.responsavel_user_id
        ? vendedoresMap.get(row.responsavel_user_id) || null
        : null,
      status: row.status
    };
  });
}

export async function handleDashboardViagensGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    const { searchParams } = event.url;
    const companyIds = resolveScopedCompanyIds(
      scope,
      searchParams.get('company_id') || searchParams.get('empresa_id')
    );
    const requestedVendedorIds = parseUuidList(
      searchParams.get('vendedor_ids') || searchParams.get('vendedor_id')
    );
    const proximasLimit = clampIntParam(searchParams.get('limit'), 100, 1, 100);
    const emAndamentoLimit = clampIntParam(searchParams.get('em_andamento_limit'), 50, 1, 50);
    const tipoNome = String(scope.tipoNome || '').toUpperCase();

    const hoje = todayISODateLocal();
    const em30dias = addDaysISODate(hoje, 30);

    let vendedorIds: string[] = [];
    if (tipoNome.includes('ADMIN')) {
      vendedorIds = requestedVendedorIds;
    } else if (tipoNome.includes('GESTOR')) {
      const gestorCompanyIds =
        companyIds.length > 0 ? companyIds : scope.companyId ? [scope.companyId] : [];
      const equipeIds = uniqueCleanStrings(
        (
          await getCachedReadModel<Array<{ id?: string | null }>>({
            key: buildReadModelCacheKey('dashboard:viagens:equipe', {
              gestorCompanyIds,
              userId: user.id
            }),
            tags: [
              READ_MODEL_TAGS.users,
              READ_MODEL_TAGS.dashboard,
              ...scopeCacheTags({
                companyIds: gestorCompanyIds,
                userId: user.id
              })
            ],
            ttlMs: 300_000,
            staleTtlMs: 1_800_000,
            loader: () => fetchRankingVendedoresByCompanyIds(client, gestorCompanyIds)
          })
        ).map((row) => row?.id)
      );
      const equipeSet = cleanStringSet(equipeIds);
      vendedorIds =
        requestedVendedorIds.length > 0
          ? requestedVendedorIds.filter((id) => equipeSet.has(id))
          : equipeIds;
    } else if (tipoNome.includes('MASTER')) {
      vendedorIds = requestedVendedorIds;
    } else {
      vendedorIds = [scope.userId];
    }

    if (!scope.isAdmin && companyIds.length === 0 && vendedorIds.length === 0) {
      return json(
        {
          items: [],
          proximas: [],
          em_andamento: [],
          total_proximas: 0,
          total_em_andamento: 0
        },
        { headers: DYNAMIC_READ_HEADERS }
      );
    }

    const cacheKey = buildReadModelCacheKey('dashboard:viagens', {
      companyIds,
      requestedVendedorIds,
      vendedorIds,
      proximasLimit,
      emAndamentoLimit,
      hoje,
      em30dias,
      userId: user.id,
      tipoNome
    });
    const payload = await getCachedReadModel({
      key: cacheKey,
      tags: [
        READ_MODEL_TAGS.trips,
        READ_MODEL_TAGS.dashboard,
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.clients,
        READ_MODEL_TAGS.users,
        ...scopeCacheTags({ companyIds, vendedorIds, userId: user.id })
      ],
      ttlMs: 300_000,
      staleTtlMs: 1_800_000,
      loader: async () => {
        const [proximasRows, emAndamentoRows] = await Promise.all([
          fetchDashboardViagens({
            client,
            companyIds,
            vendedorIds,
            from: hoje,
            to: em30dias,
            limit: proximasLimit
          }),
          fetchDashboardViagens({
            client,
            companyIds,
            vendedorIds,
            from: hoje,
            ongoing: true,
            limit: emAndamentoLimit
          })
        ]);

        const [proximas, emAndamento] = await Promise.all([
          hydrateViagens(client, proximasRows),
          hydrateViagens(client, emAndamentoRows)
        ]);

        return {
          items: proximas,
          proximas,
          em_andamento: emAndamento,
          total_proximas: proximas.length,
          total_em_andamento: emAndamento.length
        };
      }
    });

    return json(payload, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar viagens do dashboard.');
  }
}
