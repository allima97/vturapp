// Migrado para Hono de src/routes/api/v1/dashboard/follow-ups/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getDefaultFollowUpRange, isIsoDate, resolveFollowUpFilters } from '$lib/server/agenda';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { syncViagensStatus } from '$lib/server/viagensStatus';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { getPlatformExecutionContext } from '$lib/server/readModelRebuild';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { chunkArray, cleanStringSet, uniqueCleanStrings } from '$lib/utils/array';

type FollowUpClienteRow = {
  id?: string | null;
  nome?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  telefone?: string | null;
};

type FollowUpDestinoRow = {
  id?: string | null;
  nome?: string | null;
};

type FollowUpVendaRow = {
  id?: string | null;
  data_embarque?: string | null;
  data_final?: string | null;
  vendedor_id?: string | null;
  cancelada?: boolean | null;
  cliente_id?: string | null;
  clientes?: FollowUpClienteRow | null;
  destino_cidade?: FollowUpDestinoRow | null;
};

type DashboardFollowUpRow = {
  id?: string | null;
  venda_id?: string | null;
  company_id?: string | null;
  cliente_id?: string | null;
  responsavel_user_id?: string | null;
  destino?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  status?: string | null;
  follow_up_text?: string | null;
  follow_up_fechado?: boolean | null;
  updated_at?: string | null;
  cliente?: FollowUpClienteRow | FollowUpClienteRow[] | null;
  venda?: FollowUpVendaRow | FollowUpVendaRow[] | null;
  __allClosed?: boolean;
  __viagemIds?: string[];
};

type DashboardFollowUpGroupRow = Omit<DashboardFollowUpRow, 'venda'> & {
  venda: FollowUpVendaRow | null;
  cliente: FollowUpClienteRow | null;
};

type FollowUpPassageiroRow = {
  viagem_id?: string | null;
  cliente_id?: string | null;
  cliente?: FollowUpClienteRow | FollowUpClienteRow[] | null;
};

function normalizeStatusFilter(value: string | null) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === 'fechados') return 'fechados';
  if (raw === 'todos') return 'todos';
  return 'abertos';
}

function clampIntParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function getVendaFromRow(row: DashboardFollowUpRow) {
  const venda = Array.isArray(row?.venda) ? row.venda[0] : row?.venda;
  return venda && typeof venda === 'object' ? venda : null;
}

function getClienteFromRow(row: DashboardFollowUpRow) {
  const cliente = Array.isArray(row?.cliente) ? row.cliente[0] : row?.cliente;
  return cliente && typeof cliente === 'object' ? cliente : null;
}

function hasLinkedVenda(row: DashboardFollowUpRow) {
  return Boolean(String(row?.venda_id || getVendaFromRow(row)?.id || '').trim());
}

function isFollowUpAllowedForVendedores(
  row: DashboardFollowUpRow,
  vendedorIdSet: ReadonlySet<string>
) {
  const venda = getVendaFromRow(row);
  const responsavelId = String(row?.responsavel_user_id || '').trim();

  if (hasLinkedVenda(row)) {
    if (!venda || venda.cancelada === true) return false;
    if (vendedorIdSet.size === 0) return true;
    return (
      vendedorIdSet.has(String(venda.vendedor_id || '').trim()) || vendedorIdSet.has(responsavelId)
    );
  }

  // Viagem avulsa sem venda usa o responsável operacional da própria viagem.
  if (vendedorIdSet.size === 0) return true;
  return vendedorIdSet.has(responsavelId);
}

function dedupeFollowUpRows(rows: DashboardFollowUpRow[]) {
  const byId = new Map<string, DashboardFollowUpRow>();
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, row);
  }
  return Array.from(byId.values());
}

function addGroupViagemId(group: DashboardFollowUpGroupRow, viagemId?: string | null) {
  const id = String(viagemId || '').trim();
  if (!id) return;
  const current = group.__viagemIds ?? [];
  if (!current.includes(id)) group.__viagemIds = [...current, id];
}

function addUniqueCliente(
  clientes: FollowUpClienteRow[],
  seen: Set<string>,
  cliente?: FollowUpClienteRow | null
) {
  const id = String(cliente?.id || '').trim();
  const nome = String(cliente?.nome || '').trim();
  if (!id && !nome) return;
  const key =
    id ||
    nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  if (!key || seen.has(key)) return;
  seen.add(key);
  clientes.push({
    id: id || null,
    nome: nome || 'Cliente sem nome',
    email: cliente?.email ? String(cliente.email) : null,
    whatsapp: cliente?.whatsapp ? String(cliente.whatsapp) : null,
    telefone: cliente?.telefone ? String(cliente.telefone) : null
  });
}

async function fetchPassageirosByViagemIds(
  client: ReturnType<typeof getAdminClient>,
  viagemIds: string[]
) {
  const byViagem = new Map<string, FollowUpClienteRow[]>();
  const uniqueViagemIds = uniqueCleanStrings(viagemIds);
  if (uniqueViagemIds.length === 0) return byViagem;

  const batches = await Promise.all(
    chunkArray(uniqueViagemIds).map(async (viagemBatch) => {
      const { data, error } = await client
        .from('viagem_passageiros')
        .select(
          `
            viagem_id,
            cliente_id,
            cliente:clientes!cliente_id (id, nome, email, whatsapp, telefone)
          `
        )
        .in('viagem_id', viagemBatch);
      if (error) throw error;
      return (data || []) as FollowUpPassageiroRow[];
    })
  );

  for (const row of batches.flat()) {
    const viagemId = String(row?.viagem_id || '').trim();
    if (!viagemId) continue;
    const cliente = Array.isArray(row?.cliente) ? row.cliente[0] : row?.cliente;
    if (!cliente) continue;
    const current = byViagem.get(viagemId) ?? [];
    current.push({
      id: row?.cliente_id ? String(row.cliente_id) : cliente.id ? String(cliente.id) : null,
      nome: cliente.nome ? String(cliente.nome) : null,
      email: cliente.email ? String(cliente.email) : null,
      whatsapp: cliente.whatsapp ? String(cliente.whatsapp) : null,
      telefone: cliente.telefone ? String(cliente.telefone) : null
    });
    byViagem.set(viagemId, current);
  }

  return byViagem;
}

function resolveClientesForFollowUp(
  item: DashboardFollowUpGroupRow,
  passageirosByViagem: Map<string, FollowUpClienteRow[]>
) {
  const clientes: FollowUpClienteRow[] = [];
  const seen = new Set<string>();

  for (const viagemId of item.__viagemIds ?? []) {
    for (const passageiro of passageirosByViagem.get(viagemId) ?? []) {
      addUniqueCliente(clientes, seen, passageiro);
    }
  }

  addUniqueCliente(clientes, seen, item.cliente);
  addUniqueCliente(clientes, seen, item.venda?.clientes ?? null);

  if (clientes.length > 0) return clientes;

  return [
    {
      id: null,
      nome: 'Cliente sem nome',
      email: null,
      whatsapp: null,
      telefone: null
    }
  ];
}

export async function handleDashboardFollowUpsGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    // Follow-up do dashboard é acessível a qualquer usuário autenticado
    // (a verificação de módulo detalhada fica nas rotas de operação completas)

    const defaults = getDefaultFollowUpRange();
    const inicio = String(event.url.searchParams.get('inicio') || defaults.inicio).trim();
    const fim = String(event.url.searchParams.get('fim') || defaults.fim).trim();
    const statusFilter = normalizeStatusFilter(event.url.searchParams.get('status'));
    const hasExplicitLimit = event.url.searchParams.has('limit');
    const outputLimit = clampIntParam(event.url.searchParams.get('limit'), 500, 1, 500);
    const candidateLimit = hasExplicitLimit ? Math.max(40, outputLimit * 8) : 500;
    const detailLimit = hasExplicitLimit ? Math.max(80, outputLimit * 12) : 5000;

    if (!isIsoDate(inicio) || !isIsoDate(fim)) {
      return json(
        { error: 'inicio e fim devem estar no formato YYYY-MM-DD.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { companyIds, vendedorIds } = await resolveFollowUpFilters(
      client,
      scope,
      event.url.searchParams
    );
    const executionContext = getPlatformExecutionContext(event.platform);
    const queueStatusSync = (rows: DashboardFollowUpRow[]) => {
      if (!Array.isArray(rows) || rows.length === 0) return;
      const task = syncViagensStatus(client, rows).catch(() => undefined);
      if (executionContext) executionContext.waitUntil(task);
      else void task;
    };
    const cacheKey = buildReadModelCacheKey('dashboard:follow-ups', {
      inicio,
      fim,
      statusFilter,
      outputLimit,
      candidateLimit,
      detailLimit,
      companyIds,
      vendedorIds,
      userId: user.id
    });
    const payload = await getCachedReadModel({
      key: cacheKey,
      tags: [
        READ_MODEL_TAGS.trips,
        READ_MODEL_TAGS.dashboard,
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.clients,
        ...scopeCacheTags({ companyIds, vendedorIds, userId: user.id })
      ],
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        const vendedorIdSet = cleanStringSet(vendedorIds);
        const buildBaseQuery = (limit: number, vendaJoin = 'venda:vendas') =>
          client
            .from('viagens')
            .select(
              `
          id,
          venda_id,
          company_id,
          cliente_id,
          responsavel_user_id,
          destino,
          data_inicio,
          data_fim,
          status,
          follow_up_text,
          follow_up_fechado,
          updated_at,
          cliente:clientes!cliente_id (id, nome, email, whatsapp, telefone),
          ${vendaJoin} (
            id,
            data_embarque,
            data_final,
            vendedor_id,
            cancelada,
            cliente_id,
            clientes:clientes (id, nome, email, whatsapp, telefone),
            destino_cidade:cidades!destino_cidade_id (id, nome)
          )
        `
            )
            .not('data_fim', 'is', null)
            .or('status.is.null,status.neq.Fechado')
            .order('data_fim', { ascending: false })
            .limit(limit);

        const applyCommonFilters = (
          query: ReturnType<typeof buildBaseQuery>,
          options: {
            companyBatch?: string[] | null;
            vendedorBatch?: string[] | null;
            responsavelBatch?: string[] | null;
            vendaBatch?: string[] | null;
            usePeriod?: boolean;
          }
        ) => {
          let scopedQuery = query;
          if (options.usePeriod !== false) {
            scopedQuery = scopedQuery.gte('data_fim', inicio).lte('data_fim', fim);
          }
          if (statusFilter === 'abertos') {
            scopedQuery = scopedQuery.or('follow_up_fechado.is.null,follow_up_fechado.eq.false');
          } else if (statusFilter === 'fechados') {
            scopedQuery = scopedQuery.eq('follow_up_fechado', true);
          }
          if (options.companyBatch)
            scopedQuery = scopedQuery.in('company_id', options.companyBatch);
          if (options.vendedorBatch)
            scopedQuery = scopedQuery.in('venda.vendedor_id', options.vendedorBatch);
          if (options.responsavelBatch)
            scopedQuery = scopedQuery.in('responsavel_user_id', options.responsavelBatch);
          if (options.vendaBatch) scopedQuery = scopedQuery.in('venda_id', options.vendaBatch);
          return scopedQuery;
        };

        const companyBatches = companyIds.length > 0 ? chunkArray(companyIds) : [null];
        const vendedorBatches = vendedorIds.length > 0 ? chunkArray(vendedorIds) : [null];
        const candidatasBatches = await Promise.all(
          companyBatches.flatMap((companyBatch) =>
            vendedorBatches.flatMap((vendedorBatch) => {
              if (!vendedorBatch) {
                return [
                  (async () => {
                    const { data, error: candidatasError } = await applyCommonFilters(
                      buildBaseQuery(candidateLimit),
                      {
                        companyBatch
                      }
                    );
                    if (candidatasError) throw candidatasError;
                    return (data || []) as DashboardFollowUpRow[];
                  })()
                ];
              }

              return [
                (async () => {
                  const { data, error: responsavelError } = await applyCommonFilters(
                    buildBaseQuery(candidateLimit),
                    {
                      companyBatch,
                      responsavelBatch: vendedorBatch
                    }
                  );
                  if (responsavelError) throw responsavelError;
                  return (data || []) as DashboardFollowUpRow[];
                })(),
                (async () => {
                  const { data, error: vendedorError } = await applyCommonFilters(
                    buildBaseQuery(candidateLimit, 'venda:vendas!inner'),
                    { companyBatch, vendedorBatch }
                  );
                  if (vendedorError) throw vendedorError;
                  return (data || []) as DashboardFollowUpRow[];
                })()
              ];
            })
          )
        );
        const candidatasData = dedupeFollowUpRows(candidatasBatches.flat());

        const candidatas = candidatasData.filter((row) =>
          isFollowUpAllowedForVendedores(row, vendedorIdSet)
        );
        queueStatusSync(candidatas);

        const vendaIds = uniqueCleanStrings(
          candidatas.map((row) => row?.venda_id || getVendaFromRow(row)?.id)
        );

        const avulsas = candidatas.filter((row) => !hasLinkedVenda(row));

        let detalhadas: DashboardFollowUpRow[] = [];
        if (vendaIds.length > 0) {
          const detalheBatches = await Promise.all(
            chunkArray(vendaIds).flatMap((vendaBatch) =>
              companyBatches
                .flatMap((companyBatch) => [
                  async () => {
                    const { data, error: detalhadasError } = await applyCommonFilters(
                      buildBaseQuery(detailLimit),
                      {
                        companyBatch,
                        vendaBatch,
                        usePeriod: false
                      }
                    );
                    if (detalhadasError) throw detalhadasError;
                    return (data || []) as DashboardFollowUpRow[];
                  }
                ])
                .map((run) => run())
            )
          );
          const detalheRows = dedupeFollowUpRows(detalheBatches.flat());
          detalhadas = detalheRows.filter((row) =>
            isFollowUpAllowedForVendedores(row, vendedorIdSet)
          );
          queueStatusSync(detalhadas);
        }

        const grupos = new Map<string, DashboardFollowUpGroupRow>();

        for (const sourceItem of [...detalhadas, ...avulsas]) {
          const item: DashboardFollowUpGroupRow = {
            ...sourceItem,
            venda: getVendaFromRow(sourceItem),
            cliente: getClienteFromRow(sourceItem)
          };
          const key = String(item?.venda_id || item?.venda?.id || item?.id || '').trim();
          if (!key) continue;

          const fechado = item?.follow_up_fechado === true;
          const existing = grupos.get(key);

          if (!existing) {
            grupos.set(key, {
              ...item,
              __allClosed: fechado,
              __viagemIds: item.id ? [String(item.id)] : []
            });
            continue;
          }

          addGroupViagemId(existing, item.id);
          existing.__allClosed = Boolean(existing.__allClosed) && fechado;
          if (
            item?.data_inicio &&
            (!existing.data_inicio || item.data_inicio < existing.data_inicio)
          ) {
            existing.data_inicio = item.data_inicio;
          }
          if (item?.data_fim && (!existing.data_fim || item.data_fim > existing.data_fim)) {
            const savedStart = existing.data_inicio;
            const allClosed = existing.__allClosed;
            const viagemIds = existing.__viagemIds;
            Object.assign(existing, item);
            existing.data_inicio = savedStart;
            existing.__allClosed = allClosed;
            existing.__viagemIds = viagemIds;
          }
          if (!existing.follow_up_text && item?.follow_up_text) {
            existing.follow_up_text = item.follow_up_text;
          }
          if (!existing.updated_at && item?.updated_at) {
            existing.updated_at = item.updated_at;
          }
        }

        const gruposFiltrados = Array.from(grupos.values())
          .filter((item) => {
            if (statusFilter === 'abertos') return item.__allClosed !== true;
            if (statusFilter === 'fechados') return item.__allClosed === true;
            return true;
          })
          .filter((item) => {
            const retorno = String(item?.data_fim || item?.venda?.data_final || '').trim();
            return Boolean(retorno) && retorno >= inicio && retorno <= fim;
          })
          .sort((a, b) => String(b?.data_fim || '').localeCompare(String(a?.data_fim || '')));

        const passageirosByViagem = await fetchPassageirosByViagemIds(
          client,
          gruposFiltrados.flatMap((item) => item.__viagemIds ?? [])
        );

        const items = gruposFiltrados
          .flatMap((item) => {
            const clientes = resolveClientesForFollowUp(item, passageirosByViagem);
            return clientes.map((cliente, index) => ({
              row_key: `${String(item.id || 'viagem')}:${cliente.id || `cliente-${index}`}`,
              id: String(item.id),
              venda_id: item?.venda_id
                ? String(item.venda_id)
                : item?.venda?.id
                  ? String(item.venda.id)
                  : null,
              cliente_id: cliente.id ? String(cliente.id) : null,
              cliente_nome: String(cliente.nome || 'Cliente sem nome'),
              cliente_email: cliente.email ? String(cliente.email) : null,
              cliente_whatsapp: cliente.whatsapp ? String(cliente.whatsapp) : null,
              cliente_telefone: cliente.telefone ? String(cliente.telefone) : null,
              destino_nome: item?.venda?.destino_cidade?.nome
                ? String(item.venda.destino_cidade.nome)
                : item?.destino
                  ? String(item.destino)
                  : null,
              data_inicio: item?.data_inicio ? String(item.data_inicio) : null,
              data_fim: item?.data_fim ? String(item.data_fim) : null,
              data_embarque: item?.venda?.data_embarque ? String(item.venda.data_embarque) : null,
              data_final: item?.venda?.data_final ? String(item.venda.data_final) : null,
              vendedor_id: item?.venda?.vendedor_id
                ? String(item.venda.vendedor_id)
                : item?.responsavel_user_id
                  ? String(item.responsavel_user_id)
                  : null,
              follow_up_fechado: item.__allClosed === true,
              follow_up_text: item?.follow_up_text ? String(item.follow_up_text) : null,
              updated_at: item?.updated_at ? String(item.updated_at) : null
            }));
          })
          .slice(0, outputLimit);

        return { inicio, fim, items };
      }
    });

    return json(payload, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar follow-ups.');
  }
}
