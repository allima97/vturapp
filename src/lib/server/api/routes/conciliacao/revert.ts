// Migrado para Hono de src/routes/api/v1/conciliacao/revert/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { invalidateSalesReadModels } from '$lib/server/readModelCache';
import { chunkArray, uniqueCleanStrings } from '$lib/utils/array';

const MAX_CONCILIACAO_REVERT_BODY_BYTES = 64 * 1024;
type ConciliacaoChangeLookupRow = {
  id?: string | null;
  venda_recibo_id?: string | null;
  changed_at?: string | null;
};
type ConciliacaoRevertBody = {
  companyId?: unknown;
  revertAll?: unknown;
  limit?: unknown;
  changeIds?: unknown;
};

type ParsedConciliacaoRevertBody = {
  companyId?: string;
  revertAll?: boolean;
  limit?: number | string;
  changeIds?: unknown[];
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function diff(a: number, b: number) {
  return round2(a - b);
}

function matches(a: number, b: number) {
  return Math.abs(a - b) <= 0.01;
}

function collectChangeIds(rows: ConciliacaoChangeLookupRow[]) {
  const ids: string[] = [];
  for (const row of rows) {
    const id = String(row?.id || '');
    if (id) ids.push(id);
  }
  return ids;
}

function readConciliacaoRevertBody(value: unknown): ParsedConciliacaoRevertBody {
  if (!value || typeof value !== 'object') return {};

  const body = value as ConciliacaoRevertBody;
  const parsed: ParsedConciliacaoRevertBody = {};

  if (typeof body.companyId === 'string') parsed.companyId = body.companyId;
  if (typeof body.revertAll === 'boolean') parsed.revertAll = body.revertAll;
  if (typeof body.limit === 'number' || typeof body.limit === 'string') parsed.limit = body.limit;
  if (Array.isArray(body.changeIds)) parsed.changeIds = body.changeIds;

  return parsed;
}

export async function handleConciliacaoRevertPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CONCILIACAO_REVERT_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(scope, ['operacao_conciliacao', 'conciliacao'], 3, 'Sem acesso à Conciliação.');
    }

    const body = readConciliacaoRevertBody(bodyResult.data);
    const requestedCompanyId = body.companyId || null;
    const companyIds = resolveScopedCompanyIds(scope, requestedCompanyId);
    const companyId = companyIds[0] || null;
    if (!companyId) return json({ error: 'Company invalida.' }, { status: 400, headers: NO_STORE_HEADERS });

    const revertAll = Boolean(body?.revertAll);
    const limit = Math.max(1, Math.min(500, Number(body?.limit || 200)));
    const ids = Array.isArray(body.changeIds)
      ? body.changeIds
          .map((v: unknown) => String(v || '').trim())
          .filter((v: string) => isUuid(v))
      : [];

    if (!revertAll && ids.length === 0) {
      return json({ error: 'Nenhuma alteracao selecionada.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    let targetReciboIds: string[] = [];
    let changeIdsParaReverter: string[] = [];

    if (revertAll) {
      const { data, error } = await client
        .from('conciliacao_recibo_changes')
        .select('id, venda_recibo_id')
        .eq('company_id', companyId)
        .is('reverted_at', null)
        .limit(limit);
      if (error) throw error;
      const rows: ConciliacaoChangeLookupRow[] = data || [];
      targetReciboIds = uniqueCleanStrings(rows.map((r) => r?.venda_recibo_id));
      changeIdsParaReverter = collectChangeIds(rows);
    } else {
      const rows: ConciliacaoChangeLookupRow[] = [];
      for (const batch of chunkArray(ids.slice(0, 500))) {
        const { data, error } = await client
          .from('conciliacao_recibo_changes')
          .select('id, venda_recibo_id')
          .in('id', batch)
          .eq('company_id', companyId)
          .is('reverted_at', null);
        if (error) throw error;
        rows.push(...(data || []));
      }
      targetReciboIds = uniqueCleanStrings(rows.map((r) => r?.venda_recibo_id));
      // Somente os IDs confirmados pelo banco (company_id validado acima)
      changeIdsParaReverter = collectChangeIds(rows);
    }

    if (targetReciboIds.length === 0) {
      return json({ ok: true, attempted: 0, reverted: 0, errored: 0, total: 0 }, { headers: NO_STORE_HEADERS });
    }

    // Busca detalhes das alterações para agrupar os changeIds por recibo
    const pendingChanges: ConciliacaoChangeLookupRow[] = [];
    for (const batch of chunkArray(changeIdsParaReverter)) {
      const { data, error } = await client
        .from('conciliacao_recibo_changes')
        .select('id, venda_recibo_id, changed_at')
        .eq('company_id', companyId)
        .in('id', batch)
        .is('reverted_at', null)
        .order('changed_at', { ascending: true })
        .limit(2000);
      if (error) throw error;
      pendingChanges.push(...(data || []));
    }

    // Agrupa changeIds por recibo (apenas para contagem e agrupamento do audit trail)
    const changesByRecibo = new Map<string, { changeIds: string[] }>();
    for (const row of pendingChanges || []) {
      const reciboId = String(row?.venda_recibo_id || '').trim();
      if (!reciboId) continue;
      const bucket = changesByRecibo.get(reciboId) || { changeIds: [] };
      bucket.changeIds.push(String(row.id));
      changesByRecibo.set(reciboId, bucket);
    }

    let attempted = 0;
    let reverted = 0;
    let errored = 0;
    const nowIso = new Date().toISOString();

    // Os recibos originais (vendas_recibos) NÃO são mais alterados pela conciliação.
    // O revert apenas marca o audit trail como revertido — o estado do recibo original
    // nunca foi modificado, portanto nada precisa ser restaurado nele.
    for (const [, meta] of changesByRecibo.entries()) {
      attempted += 1;

      // Marca como revertido os registros de audit desta série
      let hasError = false;
      for (const batch of chunkArray(meta.changeIds)) {
        const { error: revErr } = await client
          .from('conciliacao_recibo_changes')
          .update({
            reverted_at: nowIso,
            reverted_by: user.id,
            revert_reason: 'manual'
          })
          .eq('company_id', companyId)
          .in('id', batch);

        if (revErr) {
          hasError = true;
          break;
        }
      }

      if (hasError) {
        errored += 1;
        continue;
      }

      reverted += 1;
    }

    if (reverted > 0) {
      invalidateSalesReadModels({ companyIds: [companyId], userId: user.id });
    }
    return json({ ok: true, attempted, reverted, errored, total: changesByRecibo.size }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao reverter alteracoes.');
  }
}
