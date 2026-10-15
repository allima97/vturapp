// Migrado para Hono de src/routes/api/v1/conciliacao/sem-movimento/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyId,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { invalidateSalesReadModels } from '$lib/server/readModelCache';

const MAX_SEM_MOVIMENTO_BODY_BYTES = 8 * 1024;

type SemMovimentoBody = {
  companyId?: unknown;
  data?: unknown;
  observacao?: unknown;
};

type CountResult = {
  count?: number | null;
};

function readSemMovimentoBody(value: unknown): SemMovimentoBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  const parsed: SemMovimentoBody = {};
  if (typeof body.companyId === 'string') parsed.companyId = body.companyId;
  if (typeof body.data === 'string') parsed.data = body.data;
  if (typeof body.observacao === 'string') parsed.observacao = body.observacao;
  return parsed;
}

function isTableMissingError(error: unknown, tableName: string) {
  const errorRecord = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  const msg = String(errorRecord?.message || error || '').toLowerCase();
  const code = String(errorRecord?.code || '').trim();
  return (
    code === '42P01' ||
    msg.includes('does not exist') ||
    msg.includes('could not find') ||
    msg.includes(tableName.toLowerCase())
  );
}

export async function handleConciliacaoSemMovimentoGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(scope, ['operacao_conciliacao', 'conciliacao'], 3, 'Sem permissão.');
    }

    const url = new URL(event.request.url);
    const companyId = resolveScopedCompanyId(scope, url.searchParams.get('companyId'));

    if (!companyId) return json({ error: 'Selecione uma empresa para listar dias sem movimento.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { data, error } = await client
      .from('conciliacao_dias_sem_movimento')
      .select('id, company_id, data, marcado_por, marcado_em, observacao')
      .eq('company_id', companyId)
      .order('data', { ascending: false })
      .limit(100);

    if (error) {
      if (isTableMissingError(error, 'conciliacao_dias_sem_movimento')) {
        return json({ ok: true, dias: [], tabela_nao_existe: true }, { headers: DYNAMIC_READ_HEADERS });
      }
      throw error;
    }

    return json({ ok: true, dias: data || [] }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao listar dias sem movimento.');
  }
}

export async function handleConciliacaoSemMovimentoPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_SEM_MOVIMENTO_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(scope, ['operacao_conciliacao', 'conciliacao'], 3, 'Sem permissão.');
    }

    const body = readSemMovimentoBody(bodyResult.data);
    const companyId = resolveScopedCompanyId(scope, String(body.companyId || '').trim() || null);
    const dataStr = String(body?.data || '').trim();
    const observacao = String(body?.observacao || '').trim() || null;

    if (!companyId) return json({ error: 'Selecione uma empresa para marcar dia sem movimento.' }, { status: 400, headers: NO_STORE_HEADERS });
    if (!dataStr || !/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
      return json({ error: 'Data inválida. Use formato YYYY-MM-DD.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    // Verifica se já existe importação para essa data
    const { data: existentes, error: errExistentes } = await client
      .from('conciliacao_recibos')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('movimento_data', dataStr);

    if (errExistentes) throw errExistentes;
    const existentesCount = (existentes as CountResult | null)?.count || 0;
    if (existentesCount > 0) {
      return json(
        { error: `Não é possível marcar "sem movimento" para ${dataStr}, pois já existem registros importados para esta data.` },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const { data, error } = await client
      .from('conciliacao_dias_sem_movimento')
      .upsert({
        company_id: companyId,
        data: dataStr,
        marcado_por: user.id,
        marcado_em: new Date().toISOString(),
        observacao
      }, { onConflict: 'company_id,data' })
      .select('id, company_id, data, marcado_por, marcado_em, observacao')
      .single();

    if (error) {
      if (isTableMissingError(error, 'conciliacao_dias_sem_movimento')) {
        return json(
          { error: 'A tabela de dias sem movimento ainda não foi provisionada no ambiente. Execute a migração 20260430_conciliacao_dias_sem_movimento.sql no Supabase.' },
          { status: 503, headers: NO_STORE_HEADERS }
        );
      }
      throw error;
    }

    invalidateSalesReadModels({ companyIds: [companyId], userId: user.id });
    return json({ ok: true, dia: data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao marcar dia sem movimento.');
  }
}

export async function handleConciliacaoSemMovimentoDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_SEM_MOVIMENTO_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(scope, ['operacao_conciliacao', 'conciliacao'], 3, 'Sem permissão.');
    }

    const body = readSemMovimentoBody(bodyResult.data);
    const companyId = resolveScopedCompanyId(scope, String(body.companyId || '').trim() || null);
    const dataStr = String(body?.data || '').trim();

    if (!companyId) return json({ error: 'Selecione uma empresa para remover dia sem movimento.' }, { status: 400, headers: NO_STORE_HEADERS });
    if (!dataStr || !/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
      return json({ error: 'Data inválida.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { error } = await client
      .from('conciliacao_dias_sem_movimento')
      .delete()
      .eq('company_id', companyId)
      .eq('data', dataStr);

    if (error) {
      if (isTableMissingError(error, 'conciliacao_dias_sem_movimento')) {
        return json({ error: 'A tabela de dias sem movimento ainda não foi provisionada no ambiente.' }, { status: 503, headers: NO_STORE_HEADERS });
      }
      throw error;
    }

    invalidateSalesReadModels({ companyIds: [companyId], userId: user.id });
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao remover dia sem movimento.');
  }
}
