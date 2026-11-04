import type { DataClient } from '$lib/server/data';
// Migrado para Hono de src/routes/api/v1/parametros/escalas/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { registrarLog } from '$lib/server/auditLog';
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  fetchVendedorIdsByCompanyIds,
  getAdminClient,
  isUuid,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { monthRangeFromKey } from '$lib/date';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  invalidateReadModelCache,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { fetchWithTimeout } from '$lib/server/fetchWithTimeout';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { cleanStringSet, chunkArray, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

const MAX_PARAMETROS_ESCALAS_BODY_BYTES = 512 * 1024;
const PT_BR_COLLATOR = new Intl.Collator('pt-BR');
const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/;
const TIME_PREFIX_PATTERN = /^\d{2}:\d{2}/;

const ESCALA_HORARIO_SELECT =
  'id, company_id, usuario_id, seg_inicio, seg_fim, ter_inicio, ter_fim, qua_inicio, qua_fim, qui_inicio, qui_fim, sex_inicio, sex_fim, sab_inicio, sab_fim, dom_inicio, dom_fim, feriado_inicio, feriado_fim, auto_aplicar, created_at, updated_at';

type EscalaMesRow = {
  id?: unknown;
  periodo?: unknown;
  status?: unknown;
  company_id?: unknown;
};

type EscalaDiaRow = {
  id?: unknown;
  escala_mes_id?: unknown;
  usuario_id?: unknown;
  data?: unknown;
  tipo?: unknown;
  hora_inicio?: unknown;
  hora_fim?: unknown;
  observacao?: unknown;
};

type UsuarioEscalaRow = {
  id?: unknown;
  nome_completo?: unknown;
  email?: unknown;
};

type FeriadoEscalaRow = {
  id?: unknown;
  data?: unknown;
  nome?: unknown;
  tipo?: unknown;
};

type HorarioUsuarioRow = Record<string, unknown>;

type EscalaPostBody = {
  action?: unknown;
  escala_mes_id?: unknown;
  usuario_id?: unknown;
  data?: unknown;
  datas?: unknown;
  tipo?: unknown;
  hora_inicio?: unknown;
  hora_fim?: unknown;
  observacao?: unknown;
  periodo?: unknown;
  horario?: unknown;
};

type HorarioUsuarioInput = Record<string, unknown>;

function normalizePeriod(value: unknown) {
  const raw = String(value || '').trim();
  if (MONTH_KEY_PATTERN.test(raw)) return `${raw}-01`;
  if (ISO_DATE_PATTERN.test(raw)) return `${raw.slice(0, 7)}-01`;
  return '';
}

function normalizeDate(value: unknown) {
  const raw = String(value || '').trim();
  return ISO_DATE_PATTERN.test(raw) ? raw : '';
}

function normalizeTime(value: unknown) {
  const raw = String(value || '').trim();
  return TIME_PREFIX_PATTERN.test(raw) ? raw.slice(0, 5) : null;
}

async function fetchFeriadosNacionais(ano: number, periodo: string) {
  if (!Number.isInteger(ano) || ano < 1900 || ano > 2200) return [];

  try {
    const response = await fetchWithTimeout(
      `https://brasilapi.com.br/api/feriados/v1/${ano}`,
      { headers: { Accept: 'application/json' } },
      4_000
    );
    if (!response.ok) return [];
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) return [];

    const raw = await response.text();
    if (raw.length > 250_000) {
      logServerError(
        '[parametros/escalas] payload de feriados nacionais excedeu limite',
        new Error('BrasilAPI payload too large'),
        {
          ano,
          tamanho: raw.length
        }
      );
      return [];
    }

    const data = JSON.parse(raw);
    return (Array.isArray(data) ? data : [])
      .map((item: unknown) => {
        const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        return {
          id: `nacional-${String(record.date || '').trim()}`,
          data: String(record.date || '').trim(),
          nome: String(record.name || '').trim(),
          tipo: 'nacional'
        };
      })
      .filter((item) => item.data.startsWith(periodo) && item.nome);
  } catch (err) {
    logServerError('[parametros/escalas] falha ao carregar feriados nacionais', err);
    return [];
  }
}

async function resolveEquipeIds(
  client: DataClient,
  scope: Awaited<ReturnType<typeof resolveUserScope>>
) {
  if (scope.isGestor) {
    const companyIds =
      scope.companyIds.length > 0 ? scope.companyIds : scope.companyId ? [scope.companyId] : [];
    return fetchVendedorIdsByCompanyIds(client, companyIds);
  }

  if (scope.isMaster || scope.isAdmin) {
    if (scope.isAdmin) {
      const { data } = await client.from('users').select('id').eq('active', true).limit(1000);
      const ids: string[] = [];
      for (const user of data || []) {
        const id = String(user?.id || '');
        if (id) ids.push(id);
      }
      return ids;
    }

    return fetchVendedorIdsByCompanyIds(client, scope.companyIds);
  }

  return [scope.userId];
}

async function ensureEscalaMes(
  client: DataClient,
  scope: Awaited<ReturnType<typeof resolveUserScope>>,
  periodo: string
) {
  const periodoFull = normalizePeriod(periodo);
  if (!periodoFull) throw new Error('Período inválido.');

  const companyId = scope.companyId || scope.companyIds[0] || null;
  if (!companyId) throw new Error('Empresa não definida para a escala.');

  let gestorId = scope.userId;
  if (scope.isGestor) {
    try {
      const { data } = await client.rpc('gestor_equipe_base_id', { uid: scope.userId });
      if (isUuid(String(data || ''))) gestorId = String(data);
    } catch {
      gestorId = scope.userId;
    }
  }

  const { data: existing, error: existingError } = await client
    .from('escala_mes')
    .select('id')
    .eq('company_id', companyId)
    .eq('gestor_id', gestorId)
    .eq('periodo', periodoFull)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return String(existing.id);

  const { data: inserted, error: insertError } = await client
    .from('escala_mes')
    .insert({
      company_id: companyId,
      gestor_id: gestorId,
      periodo: periodoFull,
      status: 'rascunho'
    })
    .select('id')
    .single();
  if (insertError) throw insertError;
  return String(inserted?.id || '');
}

export async function handleParametrosEscalasGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    // Vendedor pode visualizar escala (incluindo equipe) em modo leitura.
    // Edicao continua bloqueada no POST.
    if (!scope.isAdmin && !scope.isVendedor) {
      ensureModuloAccess(
        scope,
        ['parametros_escalas', 'escalas', 'parametros'],
        1,
        'Sem acesso a Escalas.'
      );
    }

    const { searchParams } = event.url;
    const periodo = String(searchParams.get('periodo') || '').trim(); // YYYY-MM
    const periodoRange = monthRangeFromKey(periodo);

    const equipeIds = await resolveEquipeIds(client, scope);

    const companyIds =
      scope.companyIds.length > 0 ? scope.companyIds : scope.companyId ? [scope.companyId] : [];

    const result = await getCachedReadModel<{
      meses: EscalaMesRow[];
      dias: EscalaDiaRow[];
      usuarios: UsuarioEscalaRow[];
      feriados: FeriadoEscalaRow[];
      horariosUsuario: HorarioUsuarioRow[];
    }>({
      key: buildReadModelCacheKey('parametros:escalas', {
        periodo,
        companyIds,
        equipeIds,
        userId: scope.userId,
        isAdmin: scope.isAdmin
      }),
      tags: [
        READ_MODEL_TAGS.users,
        ...scopeCacheTags({ companyIds, vendedorIds: equipeIds, userId: scope.userId })
      ],
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        // Busca escala_mes
        const buildMesQuery = (companyIdsFilter = scope.companyIds || []) => {
          let mesQuery = client
            .from('escala_mes')
            .select('id, periodo, status, company_id')
            .order('periodo', { ascending: false })
            .limit(24);

          if (!scope.isAdmin) {
            if (companyIdsFilter.length > 0) mesQuery = mesQuery.in('company_id', companyIdsFilter);
            else if (scope.companyId) mesQuery = mesQuery.eq('company_id', scope.companyId);
          }
          if (periodo) mesQuery = mesQuery.eq('periodo', periodo + '-01');
          return mesQuery;
        };

        const fetchMeses = async () => {
          const companyIdsFilter = (scope.companyIds || []).filter(Boolean);
          if (scope.isAdmin || companyIdsFilter.length <= QUERY_IN_BATCH_SIZE) {
            return buildMesQuery(companyIdsFilter);
          }

          const rows: EscalaMesRow[] = [];
          for (const batch of chunkArray(companyIdsFilter)) {
            const result = await buildMesQuery(batch);
            if (result.error) return { data: null, error: result.error } as typeof result;
            rows.push(...(result.data || []));
          }

          return {
            data: rows
              .sort((left, right) =>
                String(right?.periodo || '').localeCompare(String(left?.periodo || ''))
              )
              .slice(0, 24),
            error: null
          };
        };

        const { data: meses, error: mesError } = await fetchMeses();
        if (mesError) {
          // Tabelas de escala podem não existir
          if (
            String(mesError.code || '').includes('42P01') ||
            String(mesError.message || '').includes('does not exist')
          ) {
            return { meses: [], dias: [], usuarios: [], feriados: [], horariosUsuario: [] };
          }
          throw mesError;
        }

        // Busca dias da escala para o período selecionado
        const dias: EscalaDiaRow[] = [];
        if (periodo && meses && meses.length > 0) {
          const mesIds = meses.map((m: any) => String(m.id || '')).filter(Boolean);
          for (const mesBatch of chunkArray(mesIds)) {
            for (const equipeBatch of equipeIds.length > QUERY_IN_BATCH_SIZE
              ? chunkArray(equipeIds)
              : [equipeIds]) {
              let diasQuery = client
                .from('escala_dia')
                .select(
                  'id, escala_mes_id, usuario_id, data, tipo, hora_inicio, hora_fim, observacao, usuario:users!usuario_id(id, nome_completo)'
                )
                .in('escala_mes_id', mesBatch)
                .order('data');

              if (equipeBatch.length > 0) diasQuery = diasQuery.in('usuario_id', equipeBatch);
              const { data: diasData } = await diasQuery.limit(2000);
              dias.push(...(diasData || []));
            }
          }
        }

        // Busca usuários da equipe
        let usuarios: UsuarioEscalaRow[] = [];
        if (equipeIds.length > 0) {
          for (const batch of chunkArray(equipeIds)) {
            const { data: usersData } = await client
              .from('users')
              .select('id, nome_completo, email')
              .in('id', batch)
              .eq('active', true)
              .order('nome_completo')
              .limit(100);
            usuarios.push(...(usersData || []));
          }
          usuarios = usuarios
            .sort((left, right) =>
              PT_BR_COLLATOR.compare(
                String(left?.nome_completo || ''),
                String(right?.nome_completo || '')
              )
            )
            .slice(0, 100);
        }

        // Feriados nacionais + locais do mês
        const anoFeriados = Number(periodo.slice(0, 4));
        const feriadosNacionais = periodoRange
          ? await fetchFeriadosNacionais(anoFeriados, periodo)
          : [];
        const fetchFeriadosLocais = async () => {
          const buildFeriadosQuery = (companyIdsFilter = scope.companyIds || []) => {
            let feriadosQuery = client
              .from('feriados')
              .select('id, data, nome, tipo')
              .order('data')
              .limit(100);
            if (periodoRange) {
              feriadosQuery = feriadosQuery
                .gte('data', periodoRange.inicio)
                .lte('data', periodoRange.fim);
            }
            if (!scope.isAdmin) {
              if (companyIdsFilter.length > 0)
                feriadosQuery = feriadosQuery.in('company_id', companyIdsFilter);
              else if (scope.companyId)
                feriadosQuery = feriadosQuery.eq('company_id', scope.companyId);
            }
            return feriadosQuery;
          };
          const companyIdsFilter = (scope.companyIds || []).filter(Boolean);
          if (scope.isAdmin || companyIdsFilter.length <= QUERY_IN_BATCH_SIZE) {
            const { data } = await buildFeriadosQuery(companyIdsFilter);
            return data || [];
          }

          const rows: FeriadoEscalaRow[] = [];
          for (const batch of chunkArray(companyIdsFilter)) {
            const { data } = await buildFeriadosQuery(batch);
            rows.push(...(data || []));
          }
          return rows;
        };
        const feriadosLocais = await fetchFeriadosLocais();
        const feriados = [...feriadosNacionais, ...(feriadosLocais || [])];

        // Busca horarios do usuario logado
        const horariosUsuario: HorarioUsuarioRow[] = [];
        if (equipeIds.length > 0) {
          for (const batch of chunkArray(equipeIds)) {
            const { data: horariosData } = await client
              .from('escala_horario_usuario')
              .select(ESCALA_HORARIO_SELECT)
              .in('usuario_id', batch)
              .limit(500);
            horariosUsuario.push(...(horariosData || []));
          }
        }

        return {
          meses: meses || [],
          dias,
          usuarios,
          feriados: feriados || [],
          horariosUsuario
        };
      }
    });

    return json(result, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar escalas.');
  }
}

// Auditoria (mesmo formato do histórico da tabela logs): empresa e gestor vêm do mês da escala.
// Lidos em background, depois da resposta, para não atrasar o salvamento.
async function escalaMesAuditInfo(client: DataClient, escalaMesId: string) {
  const { data } = await client
    .from('escala_mes')
    .select('company_id, gestor_id')
    .eq('id', escalaMesId)
    .maybeSingle();
  const gestorId = (data?.gestor_id as string | null) || null;
  return {
    company_id: (data?.company_id as string | null) || null,
    gestor_id: gestorId,
    gestor_raw_id: gestorId,
    escala_mes_id: escalaMesId
  };
}

async function escalaLoteAuditDetalhes(
  client: DataClient,
  scope: Awaited<ReturnType<typeof resolveUserScope>>,
  escalaMesId: string,
  usuarioId: string,
  datas: string[],
  tipo: string | null,
  horaInicio: string | null,
  horaFim: string | null
) {
  return {
    ...(await escalaMesAuditInfo(client, escalaMesId)),
    papel: scope.papel || null,
    usuario_id: usuarioId,
    datas,
    total: datas.length,
    tipo,
    hora_inicio: horaInicio,
    hora_fim: horaFim,
    horario_informado: Boolean(horaInicio || horaFim)
  };
}

export async function handleParametrosEscalasPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_PARAMETROS_ESCALAS_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['parametros_escalas', 'escalas', 'parametros'],
        2,
        'Sem permissão para salvar escalas.'
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as EscalaPostBody)
        : {};
    const { action } = body;

    if (action === 'upsert_dia') {
      const escalaMesId = String(body.escala_mes_id || '').trim();
      const usuarioId = String(body.usuario_id || '').trim();
      const data = String(body.data || '').trim();
      const tipo = body.tipo;
      const tipoNormalizado = String(tipo || '').trim();

      if (!isUuid(escalaMesId) || !isUuid(usuarioId) || !data) {
        return json({ error: 'Dados inválidos.' }, { status: 400, headers: NO_STORE_HEADERS });
      }

      const equipeIds = await resolveEquipeIds(client, scope);
      const equipeIdSet = cleanStringSet(equipeIds);
      if (!scope.isAdmin && !equipeIdSet.has(usuarioId)) {
        return json(
          { error: 'Usuário fora do seu escopo.' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }

      const payload = {
        escala_mes_id: escalaMesId,
        usuario_id: usuarioId,
        data: normalizeDate(data),
        tipo: tipoNormalizado || null,
        hora_inicio: normalizeTime(body.hora_inicio),
        hora_fim: normalizeTime(body.hora_fim),
        observacao: String(body.observacao || '').trim() || null
      };

      // Verifica se já existe
      const { data: existing } = await client
        .from('escala_dia')
        .select('id')
        .eq('escala_mes_id', escalaMesId)
        .eq('usuario_id', usuarioId)
        .eq('data', data)
        .maybeSingle();

      let operacao: 'insert' | 'update' | 'delete' | null = null;
      let escalaDiaId: string | null = existing?.id || null;
      if (existing?.id) {
        if (!tipo) {
          // Remove o registro se tipo vazio
          await client.from('escala_dia').delete().eq('id', existing.id);
          operacao = 'delete';
        } else {
          await client.from('escala_dia').update(payload).eq('id', existing.id);
          operacao = 'update';
        }
      } else if (tipo) {
        const { data: inserted } = await client
          .from('escala_dia')
          .insert(payload)
          .select('id')
          .maybeSingle();
        escalaDiaId = inserted?.id || null;
        operacao = 'insert';
      }

      if (operacao) {
        registrarLog(event, {
          userId: user.id,
          modulo: 'Escalas',
          acao: 'escala_dia_salva',
          detalhes: async () => ({
            ...(await escalaMesAuditInfo(client, escalaMesId)),
            papel: scope.papel || null,
            operacao,
            escala_dia_id: escalaDiaId,
            ...payload
          })
        });
      }

      invalidateReadModelCache({ keyPrefix: 'parametros:escalas:' });
      return json({ ok: true }, { headers: NO_STORE_HEADERS });
    }

    if (action === 'apply_batch') {
      const usuarioId = String(body.usuario_id || '').trim();
      const datasSet = new Set<string>();
      const datasInput = Array.isArray(body.datas) ? body.datas : [];
      for (const data of datasInput) {
        const normalized = normalizeDate(data);
        if (normalized) datasSet.add(normalized);
      }
      const datas = Array.from(datasSet);
      const tipo = String(body.tipo || '').trim() || null;
      const horaInicio = normalizeTime(body.hora_inicio);
      const horaFim = normalizeTime(body.hora_fim);
      const observacao = String(body.observacao || '').trim() || null;

      if (!isUuid(usuarioId) || datas.length === 0) {
        return json({ error: 'Seleção inválida.' }, { status: 400, headers: NO_STORE_HEADERS });
      }

      const equipeIds = await resolveEquipeIds(client, scope);
      const equipeIdSet = cleanStringSet(equipeIds);
      if (!scope.isAdmin && !equipeIdSet.has(usuarioId)) {
        return json(
          { error: 'Usuário fora do seu escopo.' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }

      const periodo = normalizePeriod(body.periodo || datas[0]?.slice(0, 7));
      if (!periodo)
        return json({ error: 'Período inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

      const escalaMesId = String(body.escala_mes_id || '').trim();
      const mesId = isUuid(escalaMesId)
        ? escalaMesId
        : await ensureEscalaMes(client, scope, periodo);

      if (!tipo) {
        const { error: deleteError } = await client
          .from('escala_dia')
          .delete()
          .eq('escala_mes_id', mesId)
          .eq('usuario_id', usuarioId)
          .in('data', datas);
        if (deleteError) throw deleteError;
        registrarLog(event, {
          userId: user.id,
          modulo: 'Escalas',
          acao: 'escala_dia_lote_salvo',
          detalhes: async () =>
            escalaLoteAuditDetalhes(
              client,
              scope,
              mesId,
              usuarioId,
              datas,
              tipo,
              horaInicio,
              horaFim
            )
        });
        invalidateReadModelCache({ keyPrefix: 'parametros:escalas:' });
        return json({ ok: true, removed: datas.length, id: mesId }, { headers: NO_STORE_HEADERS });
      }

      const rows = datas.map((data) => ({
        escala_mes_id: mesId,
        usuario_id: usuarioId,
        data,
        tipo,
        hora_inicio: horaInicio,
        hora_fim: horaFim,
        observacao
      }));

      const { data: saved, error: upsertError } = await client
        .from('escala_dia')
        .upsert(rows, { onConflict: 'escala_mes_id,usuario_id,data' })
        .select('id, escala_mes_id, usuario_id, data, tipo, hora_inicio, hora_fim, observacao');
      if (upsertError) throw upsertError;

      registrarLog(event, {
        userId: user.id,
        modulo: 'Escalas',
        acao: 'escala_dia_lote_salvo',
        detalhes: async () =>
          escalaLoteAuditDetalhes(client, scope, mesId, usuarioId, datas, tipo, horaInicio, horaFim)
      });
      invalidateReadModelCache({ keyPrefix: 'parametros:escalas:' });
      return json({ ok: true, id: mesId, items: saved || [] }, { headers: NO_STORE_HEADERS });
    }

    if (action === 'ensure_mes') {
      const periodo = String(body.periodo || '').trim(); // YYYY-MM
      if (!periodo)
        return json({ error: 'Período inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

      const id = await ensureEscalaMes(client, scope, periodo);
      invalidateReadModelCache({ keyPrefix: 'parametros:escalas:' });
      return json({ ok: true, id }, { headers: NO_STORE_HEADERS });
    }

    if (action === 'upsert_horario_usuario') {
      const horario =
        body.horario && typeof body.horario === 'object'
          ? (body.horario as HorarioUsuarioInput)
          : {};
      const payload = {
        company_id: scope.companyId || null,
        usuario_id: scope.userId,
        seg_inicio: horario.seg_inicio || null,
        seg_fim: horario.seg_fim || null,
        ter_inicio: horario.ter_inicio || null,
        ter_fim: horario.ter_fim || null,
        qua_inicio: horario.qua_inicio || null,
        qua_fim: horario.qua_fim || null,
        qui_inicio: horario.qui_inicio || null,
        qui_fim: horario.qui_fim || null,
        sex_inicio: horario.sex_inicio || null,
        sex_fim: horario.sex_fim || null,
        sab_inicio: horario.sab_inicio || null,
        sab_fim: horario.sab_fim || null,
        dom_inicio: horario.dom_inicio || null,
        dom_fim: horario.dom_fim || null,
        feriado_inicio: horario.feriado_inicio || null,
        feriado_fim: horario.feriado_fim || null,
        auto_aplicar: Boolean(horario.auto_aplicar || false)
      };

      // Verifica se ja existe
      const { data: existing } = await client
        .from('escala_horario_usuario')
        .select('id')
        .eq('usuario_id', scope.userId)
        .maybeSingle();

      if (existing?.id) {
        await client.from('escala_horario_usuario').update(payload).eq('id', existing.id);
        invalidateReadModelCache({ keyPrefix: 'parametros:escalas:' });
        return json({ ok: true, id: existing.id }, { headers: NO_STORE_HEADERS });
      } else {
        const { data: inserted, error: insertError } = await client
          .from('escala_horario_usuario')
          .insert(payload)
          .select('id')
          .single();
        if (insertError) throw insertError;
        invalidateReadModelCache({ keyPrefix: 'parametros:escalas:' });
        return json({ ok: true, id: inserted?.id }, { headers: NO_STORE_HEADERS });
      }
    }

    return json({ error: 'Ação inválida.' }, { status: 400, headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar escala.');
  }
}
