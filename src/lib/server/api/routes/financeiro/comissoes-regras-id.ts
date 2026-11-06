// Migrado para Hono de src/routes/api/v1/financeiro/comissoes/regras/[id]/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateCommissionReadModels } from '$lib/server/readModelCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { cleanStringSet } from '$lib/utils/array';

const MAX_COMMISSION_RULE_BODY_BYTES = 64 * 1024;

type JsonBody = Record<string, unknown>;
type CommissionTierPayload = {
  faixa?: string | null;
  de_pct?: number | string | null;
  ate_pct?: number | string | null;
  inc_pct_meta?: number | string | null;
  inc_pct_comissao?: number | string | null;
};

function canAccessCompany(
  scope: Awaited<ReturnType<typeof resolveUserScope>>,
  companyId: string | null | undefined,
  scopedCompanySet: Set<string>
) {
  if (scope.isAdmin) return true;
  const normalized = String(companyId || '').trim();
  if (!normalized) return false;
  return scopedCompanySet.has(normalized);
}

function invalidateCommissionRuleReadModels(params?: {
  companyIds?: string[] | null;
  userId?: string | null;
}) {
  invalidateCommissionReadModels(params);
}

export async function handleFinanceiroComissoesRegrasIdGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const scopedCompanySet = cleanStringSet(scope.companyIds);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['RegrasComissao', 'Comissionamento', 'parametros'],
        1,
        'Sem acesso.'
      );
    }

    const { id } = event.params;

    const { data, error } = await client
      .from('commission_rule')
      .select(
        'id, nome, descricao, tipo, meta_nao_atingida, meta_atingida, super_meta, ativo, company_id, created_at, updated_at, commission_tier(id, faixa, de_pct, ate_pct, inc_pct_meta, inc_pct_comissao, ativo)'
      )
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data)
      return json({ error: 'Regra não encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });
    if (!canAccessCompany(scope, data.company_id, scopedCompanySet)) {
      return json(
        { error: 'Sem acesso a esta regra.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    return json({ ...data, tiers: data.commission_tier || [] }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar regra.');
  }
}

export async function handleFinanceiroComissoesRegrasIdPut(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_COMMISSION_RULE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const scopedCompanySet = cleanStringSet(scope.companyIds);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['RegrasComissao', 'Comissionamento', 'parametros'],
        3,
        'Sem permissão.'
      );
    }

    const { id } = event.params;
    const body =
      bodyResult.data && typeof bodyResult.data === 'object' ? (bodyResult.data as JsonBody) : {};

    const { data: current, error: currentError } = await client
      .from('commission_rule')
      .select('id, company_id')
      .eq('id', id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current)
      return json({ error: 'Regra não encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });
    if (!canAccessCompany(scope, current.company_id, scopedCompanySet)) {
      return json(
        { error: 'Sem acesso a esta regra.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const updateData: Record<string, unknown> = {};
    if ('nome' in body) updateData.nome = body.nome;
    if ('descricao' in body) updateData.descricao = body.descricao;
    if ('tipo' in body) updateData.tipo = body.tipo;
    if ('meta_nao_atingida' in body) updateData.meta_nao_atingida = Number(body.meta_nao_atingida);
    if ('meta_atingida' in body) updateData.meta_atingida = Number(body.meta_atingida);
    if ('super_meta' in body) updateData.super_meta = Number(body.super_meta);
    if ('ativo' in body) updateData.ativo = body.ativo;

    const { data, error } = await client
      .from('commission_rule')
      .update(updateData)
      .eq('id', id)
      .eq(scope.isAdmin ? 'id' : 'company_id', scope.isAdmin ? id : current.company_id)
      .select(
        'id, nome, descricao, tipo, meta_nao_atingida, meta_atingida, super_meta, ativo, company_id, created_at, updated_at'
      )
      .single();
    if (error) throw error;

    if (body.tiers !== undefined) {
      await client.from('commission_tier').delete().eq('rule_id', id);
      if (Array.isArray(body.tiers) && body.tiers.length > 0) {
        await client.from('commission_tier').insert(
          (body.tiers as CommissionTierPayload[]).map((t) => ({
            rule_id: id,
            faixa: t.faixa === 'POS' ? 'POS' : 'PRE',
            de_pct: Number(t.de_pct) || 0,
            ate_pct: Number(t.ate_pct) || 100,
            inc_pct_meta: Number(t.inc_pct_meta) || 0,
            inc_pct_comissao: Number(t.inc_pct_comissao) || 0,
            ativo: true
          }))
        );
      }
    }

    invalidateCommissionRuleReadModels({
      companyIds: current.company_id ? [current.company_id] : [],
      userId: user.id
    });
    return json({ success: true, data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar regra.');
  }
}

export async function handleFinanceiroComissoesRegrasIdDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const scopedCompanySet = cleanStringSet(scope.companyIds);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['RegrasComissao', 'Comissionamento', 'parametros'],
        4,
        'Sem permissão.'
      );
    }

    const { id } = event.params;

    const { data: current, error: currentError } = await client
      .from('commission_rule')
      .select('id, company_id')
      .eq('id', id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current)
      return json({ error: 'Regra não encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });
    if (!canAccessCompany(scope, current.company_id, scopedCompanySet)) {
      return json(
        { error: 'Sem acesso a esta regra.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    await client.from('commission_tier').delete().eq('rule_id', id);
    let query = client.from('commission_rule').delete().eq('id', id);
    if (!scope.isAdmin) query = query.eq('company_id', current.company_id);
    const { error } = await query;
    if (error) throw error;

    invalidateCommissionRuleReadModels({
      companyIds: current.company_id ? [current.company_id] : [],
      userId: user.id
    });
    return json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir regra.');
  }
}
