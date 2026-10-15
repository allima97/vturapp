// Migrado para Hono de src/routes/api/v1/conciliacao/changes/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { ensureModuloAccess, getAdminClient, requireAuthenticatedUser, resolveScopedCompanyIds, resolveUserScope, toErrorResponse } from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';

export async function handleConciliacaoChangesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(scope, ['operacao_conciliacao', 'conciliacao'], 1, 'Sem acesso à Conciliação.');
    }

    const requestedCompanyId = event.url.searchParams.get('company_id');
    const companyIds = resolveScopedCompanyIds(scope, requestedCompanyId);
    const companyId = companyIds[0] || null;
    if (!companyId) return json([], { headers: DYNAMIC_READ_HEADERS });

    const somentePendentes = event.url.searchParams.get('pending') === '1';
    const month = event.url.searchParams.get('month') || null;
    const day = event.url.searchParams.get('day') || null;

    let query = client
      .from('conciliacao_recibo_changes')
      .select(
        'id, company_id, conciliacao_recibo_id, venda_id, venda_recibo_id, numero_recibo, field, old_value, new_value, actor, changed_by, changed_at, reverted_at, reverted_by, revert_reason, changed_by_user:users!conciliacao_recibo_changes_changed_by_fkey(nome_completo, email), reverted_by_user:users!conciliacao_recibo_changes_reverted_by_fkey(nome_completo, email)'
      )
      .eq('company_id', companyId)
      .order('changed_at', { ascending: false })
      .limit(500);

    if (somentePendentes) query = query.is('reverted_at', null);
    if (day) {
      query = query.gte('changed_at', `${day}T00:00:00`).lte('changed_at', `${day}T23:59:59`);
    } else if (month) {
      const [y, m] = month.split('-');
      const start = `${y}-${m}-01T00:00:00`;
      const nextMonth =
        Number(m) === 12 ? `${Number(y) + 1}-01-01T00:00:00` : `${y}-${String(Number(m) + 1).padStart(2, '0')}-01T00:00:00`;
      query = query.gte('changed_at', start).lt('changed_at', nextMonth);
    }

    const { data, error } = await query;
    if (error) throw error;

    return json(data || [], { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao listar alteracoes.');
  }
}
