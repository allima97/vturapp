import type { DataClient } from '$lib/server/data';
/**
 * readModelRebuild.ts
 *
 * Módulo central de reconstrução do read model de ranking/KPIs.
 *
 * O banco de dados mantém a tabela ranking_read_model_status com os campos:
 *   status: 'dirty' | 'rebuilding' | 'ready' | 'error'
 *   dirty_at: quando foi marcado dirty (via trigger no banco — vendas, vendas_recibos,
 *             vendas_recibos_rateio, conciliacao_recibos, vendas_recibos_complementares —
 *             e também pela aplicação em invalidateSalesReadModels)
 *   rebuilt_at: quando foi reconstruído com sucesso
 *
 * Este módulo:
 *   1. Detecta entradas dirty no banco
 *   2. Reconstrói o read model empresa por empresa, mês a mês
 *   3. Expõe triggerRebuildAsync() para fire-and-forget após save de venda
 *   4. Expõe rebuildReadModelForCompanyMonth() para o endpoint/cron
 */

import { getAdminClient, logServerError } from '$lib/server/v1';
import { fetchVendasKpiReciboContributionsRaw } from '$lib/server/vendas-kpis';
import { chunkArray, uniqueCleanStrings } from '$lib/utils/array';
import { guardContributionRowsForeignKeys } from '$lib/server/readModelRowGuard';

// Unificado com o dashboard (reciboContribuicoesReadModel.ts): os dois módulos
// gravam as MESMAS linhas na MESMA tabela ranking_recibo_contribuicoes, a partir
// da mesma função (fetchVendasKpiReciboContributionsRaw). Antes este módulo usava
// o status 'recibo_contribuicoes_v1', que o dashboard nunca lê — por isso o cron
// e o rebuild pós-venda não destravavam o dashboard. Agora ambos usam o v4, que
// também é marcado dirty por trigger no banco (migration 20260924184114).
const MODEL_NAME = 'recibo_contribuicoes_v4';
// Linha em 'rebuilding' há mais que isso é considerada presa (Worker encerrado
// no meio do rebuild) e volta a ser elegível para o cron.
const STALE_REBUILDING_MS = 15 * 60 * 1000;
// Mês em 'error' só é tentado de novo pelo cron depois deste intervalo. Antes era
// a cada 5 min: um mês que falha recalculava o mês inteiro 12x por hora à toa.
const ERROR_RETRY_MS = 60 * 60 * 1000;
const TABLE_STATUS = 'ranking_read_model_status';
const TABLE_CONTRIBUICOES = 'ranking_recibo_contribuicoes';
const INSERT_CHUNK_SIZE = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Throttle: evita múltiplos rebuilds simultâneos para a mesma empresa/mês
const inProgressKeys = new Set<string>();

// Últimos parâmetros agendados para fire-and-forget
let pendingRebuildParams: { companyIds: string[]; monthKeys: string[] } | null = null;
let rebuildScheduled = false;

export type ExecutionContextLike = { waitUntil: (p: Promise<unknown>) => void };

type ErrorWithMessage = {
  message?: string | null;
};

type DirtyStatusRow = {
  company_id?: string | null;
  mes?: string | null;
  status?: string | null;
};

type ReciboContributionRow = {
  companyId?: string | null;
  vendedorId?: string | null;
  vendaKey?: string | null;
  reciboId?: string | null;
  reciboNumero?: string | null;
  reciboDate?: string | null;
  factor?: number | string | null;
  bruto?: number | string | null;
  taxas?: number | string | null;
  clienteId?: string | null;
  vendaId?: string | null;
  produtoId?: string | null;
  produtoNome?: string | null;
  destinoNome?: string | null;
  isSeguro?: boolean | null;
  sourceBruto?: number | string | null;
  sourceTaxas?: number | string | null;
  origem?: string | null;
};

type RankingReadModelRow = {
  source_key: string;
  company_id: string;
  mes: string;
  data_recibo: string;
  vendedor_id: string;
  cliente_id: string | null;
  venda_id: string | null;
  recibo_id: string | null;
  venda_key: string;
  recibo_numero: string | null;
  produto_id: string | null;
  produto_nome: string | null;
  destino_nome: string | null;
  valor_bruto: number;
  valor_taxas: number;
  valor_seguro: number;
  is_seguro: boolean;
  fator: number;
  source_bruto: number;
  source_taxas: number;
  origem: string;
  built_at: string;
};

function isExecutionContextLike(value: unknown): value is ExecutionContextLike {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { waitUntil?: unknown }).waitUntil === 'function'
  );
}

export function getPlatformExecutionContext(platform: unknown): ExecutionContextLike | null {
  const ctx = platform && typeof platform === 'object' ? (platform as { ctx?: unknown }).ctx : null;
  return isExecutionContextLike(ctx) ? ctx : null;
}

function monthStartFromKey(monthKey: string) {
  return `${monthKey}-01`;
}

function monthEndFromKey(monthKey: string) {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthStartFromKey(monthKey);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function monthKeyFromDate(date: string) {
  return `${date.slice(0, 4)}-${date.slice(5, 7)}`;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function previousMonthKey() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function toUuidOrNull(value?: string | null): string | null {
  if (!value) return null;
  const v = String(value).trim();
  return UUID_PATTERN.test(v) ? v : null;
}

function buildSourceKey(
  contribution: ReciboContributionRow,
  companyId: string,
  mes: string
): string {
  return [
    companyId,
    mes,
    contribution.vendedorId,
    contribution.vendaKey,
    contribution.reciboId || contribution.reciboNumero || 'sem-recibo',
    contribution.reciboDate,
    contribution.factor,
    contribution.bruto,
    contribution.taxas
  ]
    .map((p) => String(p ?? '').replace(/\|/g, '/'))
    .join('|');
}

async function fetchDirtyEntries(
  client: DataClient,
  companyIds: string[],
  monthKeys: string[]
): Promise<Array<{ company_id: string; mes: string; monthKey: string }>> {
  let query = client
    .from(TABLE_STATUS)
    .select('company_id, mes, status')
    .eq('modelo', MODEL_NAME)
    // dirty + error (no máximo 1x por hora) + 'rebuilding' preso (Worker encerrado no meio do rebuild)
    .or(
      `status.eq.dirty,and(status.eq.error,updated_at.lt.${new Date(
        Date.now() - ERROR_RETRY_MS
      ).toISOString()}),and(status.eq.rebuilding,updated_at.lt.${new Date(
        Date.now() - STALE_REBUILDING_MS
      ).toISOString()})`
    );

  if (companyIds.length > 0) query = query.in('company_id', companyIds);

  if (monthKeys.length > 0) {
    const monthStarts = monthKeys.map(monthStartFromKey);
    query = query.in('mes', monthStarts);
  }

  // Limitar para evitar sobrecarga — processar no máximo 50 por rodada
  query = query.order('dirty_at', { ascending: true }).limit(50);

  const { data, error } = await query;
  if (error) throw error;

  return ((data || []) as DirtyStatusRow[]).map((row) => ({
    company_id: String(row.company_id),
    mes: String(row.mes).slice(0, 10),
    monthKey: monthKeyFromDate(String(row.mes).slice(0, 10))
  }));
}

/**
 * Marca o mês como 'ready' SOMENTE se ele ainda estiver em 'rebuilding'.
 *
 * Se durante o rebuild chegou uma escrita nova (trigger do banco ou
 * invalidateSalesReadModels marcaram 'dirty'), o status não é sobrescrito —
 * senão essa escrita seria perdida e o dashboard ficaria desatualizado até a
 * próxima alteração. Nesse caso o mês continua 'dirty' e é reconstruído de novo
 * no próximo acesso/cron.
 */
export async function finishRebuildIfUnchanged(
  client: DataClient,
  modelo: string,
  companyId: string,
  mes: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from(TABLE_STATUS)
    .update({
      status: 'ready',
      dirty_at: null,
      rebuilt_at: now,
      last_error: null,
      updated_at: now
    })
    .eq('modelo', modelo)
    .eq('company_id', companyId)
    .eq('mes', mes)
    .eq('status', 'rebuilding')
    .select('id');
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function upsertStatus(
  client: DataClient,
  companyId: string,
  mes: string,
  values: Record<string, unknown>
) {
  const { error } = await client.from(TABLE_STATUS).upsert(
    {
      modelo: MODEL_NAME,
      company_id: companyId,
      mes,
      ...values,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'modelo,company_id,mes' }
  );
  if (error) throw error;
}

async function rebuildOneMonth(
  client: DataClient,
  companyId: string,
  monthKey: string
): Promise<{ rebuilt: boolean; rows: number; error?: string }> {
  const progressKey = `${companyId}|${monthKey}`;
  if (inProgressKeys.has(progressKey)) {
    return { rebuilt: false, rows: 0 };
  }

  inProgressKeys.add(progressKey);
  const mes = monthStartFromKey(monthKey);
  const dataInicio = mes;
  const dataFim = monthEndFromKey(monthKey);

  try {
    // Marcar como rebuilding para evitar dupla execução entre instâncias
    await upsertStatus(client, companyId, mes, {
      status: 'rebuilding',
      dirty_at: null,
      rebuilt_at: null,
      last_error: null
    });

    // Calcular contribuições usando o pipeline raw (sem cache do read model)
    const payload = await fetchVendasKpiReciboContributionsRaw(client, {
      dataInicio,
      dataFim,
      companyIds: [companyId],
      vendedorIds: [],
      accessibleClientIds: []
    });

    // Converter contributions para linhas da tabela
    const builtRows = ((payload.contributions || []) as ReciboContributionRow[])
      .map((contribution) => {
        const cId = String(contribution.companyId || companyId).trim() || companyId;
        if (!cId || !contribution.vendedorId) return null;
        const bruto = Number(Number(contribution.bruto).toFixed(2));
        const taxas = Number(Number(contribution.taxas).toFixed(2));
        return {
          source_key: buildSourceKey(contribution, cId, mes),
          company_id: cId,
          mes,
          data_recibo: contribution.reciboDate || mes,
          vendedor_id: contribution.vendedorId,
          cliente_id: toUuidOrNull(contribution.clienteId),
          venda_id: toUuidOrNull(contribution.vendaId),
          recibo_id: toUuidOrNull(contribution.reciboId),
          venda_key: contribution.vendaKey || 'sem-venda',
          recibo_numero: contribution.reciboNumero || null,
          produto_id: toUuidOrNull(contribution.produtoId),
          produto_nome: contribution.produtoNome || null,
          destino_nome: contribution.destinoNome || null,
          valor_bruto: bruto,
          valor_taxas: taxas,
          valor_seguro: contribution.isSeguro ? bruto : 0,
          is_seguro: Boolean(contribution.isSeguro),
          fator: Number(Number(contribution.factor).toFixed(6)),
          source_bruto: Number(Number(contribution.sourceBruto).toFixed(2)),
          source_taxas: Number(Number(contribution.sourceTaxas).toFixed(2)),
          origem: contribution.origem || 'ranking_ts',
          built_at: new Date().toISOString()
        };
      })
      .filter((row): row is RankingReadModelRow => Boolean(row));

    // recibo_id que não existe em vendas_recibos (recibo só da conciliação) vira null,
    // sem mudar nenhuma contagem — ver readModelRowGuard.ts. Roda ANTES de apagar o mês.
    const { rows } = await guardContributionRowsForeignKeys(client, builtRows);

    // Substituir atomicamente: deletar o mês e reinserir
    const { error: deleteError } = await client
      .from(TABLE_CONTRIBUICOES)
      .delete()
      .eq('company_id', companyId)
      .eq('mes', mes);

    if (deleteError) throw deleteError;

    for (const chunk of chunkArray(rows, INSERT_CHUNK_SIZE)) {
      if (chunk.length === 0) continue;
      const { error: upsertError } = await client
        .from(TABLE_CONTRIBUICOES)
        .upsert(chunk, { onConflict: 'source_key' });
      if (upsertError) throw upsertError;
    }

    await finishRebuildIfUnchanged(client, MODEL_NAME, companyId, mes);

    return { rebuilt: true, rows: rows.length };
  } catch (err) {
    const error = err as ErrorWithMessage;
    const errMsg = String(error?.message || err).slice(0, 500);
    logServerError(`[read-model] rebuild falhou para ${companyId} / ${monthKey}`, err);

    await upsertStatus(client, companyId, mes, {
      status: 'error',
      dirty_at: new Date().toISOString(),
      rebuilt_at: null,
      last_error: errMsg
    }).catch(() => undefined);

    return { rebuilt: false, rows: 0, error: errMsg };
  } finally {
    inProgressKeys.delete(progressKey);
  }
}

/**
 * Reconstrução completa: detecta dirty e reconstrói tudo.
 * Usada pelo endpoint POST/GET e pelo cron.
 */
export async function rebuildReadModelForCompanyMonth(
  client: DataClient,
  params: {
    companyIds: string[];
    monthKeys: string[];
    rebuildAll?: boolean;
  }
): Promise<{
  processed: number;
  rebuilt: number;
  errors: number;
  skipped: number;
  details: Array<{ company_id: string; month: string; status: string; rows?: number }>;
}> {
  const dirtyEntries = await fetchDirtyEntries(client, params.companyIds, params.monthKeys);

  // Se não há dirty mas foram passados company_ids + month_keys explícitos,
  // forçar rebuild mesmo sem status dirty (útil para rebuild manual)
  const explicitEntries: Array<{ company_id: string; mes: string; monthKey: string }> = [];
  if (params.companyIds.length > 0 && params.monthKeys.length > 0 && dirtyEntries.length === 0) {
    for (const companyId of params.companyIds) {
      for (const monthKey of params.monthKeys) {
        explicitEntries.push({ company_id: companyId, mes: monthStartFromKey(monthKey), monthKey });
      }
    }
  }

  const entries = dirtyEntries.length > 0 ? dirtyEntries : explicitEntries;

  const details: Array<{ company_id: string; month: string; status: string; rows?: number }> = [];
  let rebuilt = 0;
  let errors = 0;
  let skipped = 0;

  for (const entry of entries) {
    const progressKey = `${entry.company_id}|${entry.monthKey}`;
    if (inProgressKeys.has(progressKey)) {
      skipped++;
      details.push({
        company_id: entry.company_id,
        month: entry.monthKey,
        status: 'skipped_in_progress'
      });
      continue;
    }

    const result = await rebuildOneMonth(client, entry.company_id, entry.monthKey);
    if (result.rebuilt) {
      rebuilt++;
      details.push({
        company_id: entry.company_id,
        month: entry.monthKey,
        status: 'rebuilt',
        rows: result.rows
      });
    } else if (result.error) {
      errors++;
      details.push({ company_id: entry.company_id, month: entry.monthKey, status: 'error' });
    } else {
      skipped++;
      details.push({ company_id: entry.company_id, month: entry.monthKey, status: 'skipped' });
    }
  }

  return {
    processed: entries.length,
    rebuilt,
    errors,
    skipped,
    details
  };
}

/**
 * triggerRebuildAsync — fire-and-forget após save de venda.
 *
 * Não bloqueia a resposta ao usuário. Agenda a reconstrução para
 * o(s) mês(es) afetado(s) usando queueMicrotask para rodar após
 * a resposta ser enviada.
 *
 * Em Cloudflare Workers, usar event.waitUntil() é mais robusto —
 * mas como não temos acesso ao ExecutionContext aqui, usamos
 * queueMicrotask + setTimeout como fallback compatível.
 */
export function triggerRebuildAsync(params: {
  companyIds: string[];
  dataVenda?: string | null;
  executionContext?: ExecutionContextLike | null;
}) {
  const companyIds: string[] = [];
  for (const companyId of params.companyIds) {
    if (companyId) companyIds.push(companyId);
  }
  if (companyIds.length === 0) return;

  const monthKey = params.dataVenda ? monthKeyFromDate(params.dataVenda) : currentMonthKey();

  // Sempre incluir o mês anterior caso a venda caia na virada
  const prevMonth = previousMonthKey();
  const monthKeys = uniqueCleanStrings([monthKey, prevMonth]);

  // Acumular parâmetros para coalescing: múltiplas vendas salvas em rápida
  // sucessão geram apenas um rebuild em vez de vários simultâneos
  if (!pendingRebuildParams) {
    pendingRebuildParams = { companyIds: [...companyIds], monthKeys };
  } else {
    const pendingCompanyIds = new Set(pendingRebuildParams.companyIds);
    for (const id of companyIds) {
      if (!pendingCompanyIds.has(id)) {
        pendingRebuildParams.companyIds.push(id);
        pendingCompanyIds.add(id);
      }
    }
    const pendingMonthKeys = new Set(pendingRebuildParams.monthKeys);
    for (const mk of monthKeys) {
      if (!pendingMonthKeys.has(mk)) {
        pendingRebuildParams.monthKeys.push(mk);
        pendingMonthKeys.add(mk);
      }
    }
  }

  if (rebuildScheduled) return;
  rebuildScheduled = true;

  const runRebuild = async () => {
    const toProcess = pendingRebuildParams;
    pendingRebuildParams = null;
    rebuildScheduled = false;

    if (!toProcess) return;

    try {
      const client = getAdminClient();

      // Marcar entradas como dirty explicitamente para os meses afetados
      // (os triggers do banco já fazem isso, mas a marcação explícita garante
      // que o rebuild rode mesmo se o trigger não disparou ainda)
      for (const companyId of toProcess.companyIds) {
        for (const mk of toProcess.monthKeys) {
          const mes = monthStartFromKey(mk);
          await upsertStatus(client, companyId, mes, {
            status: 'dirty',
            dirty_at: new Date().toISOString()
          }).catch(() => undefined);
        }
      }

      await rebuildReadModelForCompanyMonth(client, {
        companyIds: toProcess.companyIds,
        monthKeys: toProcess.monthKeys,
        rebuildAll: false
      });
    } catch (err) {
      logServerError('[read-model] triggerRebuildAsync falhou', err);
    }
  };

  const rebuildPromise = new Promise<void>((resolve) => {
    // Pequeno delay para coalescing: aguarda 200ms acumulando mais saves
    setTimeout(() => {
      resolve();
    }, 200);
  }).then(runRebuild);

  // Se o Cloudflare ExecutionContext estiver disponível, registrar o
  // promise para garantir que o Worker não seja encerrado antes do rebuild
  if (params.executionContext?.waitUntil) {
    params.executionContext.waitUntil(rebuildPromise);
  }
}

/**
 * markDirtyForCompany — marca um mês como dirty diretamente.
 * Útil quando o trigger do banco pode não ter coberto a operação.
 */
export async function markDirtyForCompany(
  client: DataClient,
  companyId: string,
  dataVenda: string
) {
  const monthKey = monthKeyFromDate(dataVenda);
  const mes = monthStartFromKey(monthKey);
  try {
    await upsertStatus(client, companyId, mes, {
      status: 'dirty',
      dirty_at: new Date().toISOString()
    });
  } catch (err) {
    logServerError('[read-model] markDirtyForCompany falhou', err);
  }
}

// ─── Rodada noturna ──────────────────────────────────────────────────────────
// Cron diário (wrangler.toml) que deixa os meses anteriores prontos antes do
// expediente: marca como 'dirty' os meses que podem estar desatualizados, e o
// cron de 5 em 5 minutos reconstrói tudo durante a madrugada. O dashboard, de
// manhã, só lê o resumo pronto.

/** Expressão do cron noturno (03:07 em Brasília = 06:07 UTC). Igual ao wrangler.toml. */
export const NIGHTLY_READ_MODEL_CRON = '7 6 * * *';
/** Quantos meses para trás a rodada noturna garante prontos (além do atual). */
export const NIGHTLY_MONTHS_BACK = 12;
/** Mês atual e os N anteriores são sempre refeitos (conciliação e ajustes tardios). */
export const NIGHTLY_ALWAYS_REFRESH_MONTHS = 3;

type NightlyStatusRow = {
  company_id: string;
  mes: string;
  status: string | null;
  rebuilt_at: string | null;
};

/** Mês corrente em Brasília (YYYY-MM-01). */
export function currentMonthStartBrazil(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value || '1970';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  return `${year}-${month}-01`;
}

/** Lista YYYY-MM-01 do mês atual para trás (índice 0 = mês atual). */
export function monthStartsBack(currentMonthStart: string, monthsBack: number): string[] {
  const [year, month] = currentMonthStart.split('-').map(Number);
  const result: string[] = [];
  for (let offset = 0; offset <= monthsBack; offset += 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    result.push(date.toISOString().slice(0, 10));
  }
  return result;
}

/** Instante em que o mês termina em Brasília (início do mês seguinte, 00:00 -03:00). */
export function monthEndInstantBrazil(monthStart: string): number {
  const [year, month] = monthStart.split('-').map(Number);
  return Date.UTC(year, month, 1, 3, 0, 0);
}

/**
 * Decide quais (empresa, mês) a rodada noturna marca como 'dirty'. Função pura.
 *  - mês atual e os 2 anteriores: sempre (conciliação/ajustes chegam atrasados);
 *  - mês sem status: nunca foi montado → montar;
 *  - mês 'ready' montado ANTES de terminar (ex.: julho montado em 01/07, vazio);
 *  - 'dirty', 'error' e 'rebuilding' ficam como estão (o cron já cuida).
 */
export function selectNightlyDirtyMonths(params: {
  companyIds: string[];
  monthStarts: string[];
  statuses: NightlyStatusRow[];
  alwaysRefreshMonths?: number;
}): Array<{ company_id: string; mes: string }> {
  const alwaysRefresh = new Set(
    params.monthStarts.slice(0, params.alwaysRefreshMonths ?? NIGHTLY_ALWAYS_REFRESH_MONTHS)
  );
  const statusMap = new Map(
    params.statuses.map((row) => [`${row.company_id}|${String(row.mes).slice(0, 10)}`, row])
  );
  const selected: Array<{ company_id: string; mes: string }> = [];
  for (const companyId of params.companyIds) {
    for (const mes of params.monthStarts) {
      const status = statusMap.get(`${companyId}|${mes}`);
      const state = String(status?.status || '');
      if (state === 'dirty' || state === 'error' || state === 'rebuilding') continue;
      const rebuiltAt = status?.rebuilt_at ? Date.parse(status.rebuilt_at) : NaN;
      const builtBeforeMonthEnded =
        state === 'ready' &&
        (!Number.isFinite(rebuiltAt) || rebuiltAt < monthEndInstantBrazil(mes));
      if (alwaysRefresh.has(mes) || !status || builtBeforeMonthEnded) {
        selected.push({ company_id: companyId, mes });
      }
    }
  }
  return selected;
}

/** Rodada noturna: marca os meses como 'dirty'. A reconstrução fica com o cron de 5 min. */
export async function markNightlyReadModelMonthsDirty(
  client: DataClient,
  now: Date = new Date()
): Promise<{ companies: number; marked: number }> {
  const { data: companies, error: companiesError } = await client
    .from('companies')
    .select('id')
    .eq('active', true);
  if (companiesError) throw companiesError;
  const companyIds = uniqueCleanStrings(
    ((companies || []) as Array<{ id?: string | null }>).map((row) => row?.id)
  ).filter(isUuidLike);
  if (companyIds.length === 0) return { companies: 0, marked: 0 };

  const monthStarts = monthStartsBack(currentMonthStartBrazil(now), NIGHTLY_MONTHS_BACK);
  const statuses: NightlyStatusRow[] = [];
  for (const batch of chunkArray(companyIds)) {
    const { data, error } = await client
      .from(TABLE_STATUS)
      .select('company_id, mes, status, rebuilt_at')
      .eq('modelo', MODEL_NAME)
      .in('company_id', batch)
      .in('mes', monthStarts);
    if (error) throw error;
    statuses.push(...((data || []) as NightlyStatusRow[]));
  }

  const selected = selectNightlyDirtyMonths({ companyIds, monthStarts, statuses });
  if (selected.length === 0) return { companies: companyIds.length, marked: 0 };

  const nowIso = now.toISOString();
  for (const chunk of chunkArray(selected, INSERT_CHUNK_SIZE)) {
    const { error } = await client.from(TABLE_STATUS).upsert(
      chunk.map((entry) => ({
        modelo: MODEL_NAME,
        company_id: entry.company_id,
        mes: entry.mes,
        status: 'dirty',
        dirty_at: nowIso,
        updated_at: nowIso
      })),
      { onConflict: 'modelo,company_id,mes' }
    );
    if (error) throw error;
  }
  return { companies: companyIds.length, marked: selected.length };
}

function isUuidLike(value: string) {
  return UUID_PATTERN.test(value);
}
