// Migrado para Hono de src/routes/api/v1/parametros/commission-rules/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyId,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateCommissionReadModels } from '$lib/server/readModelCache';
import { readTextBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { cleanStringSet } from '$lib/utils/array';
import { safeJsonParse } from '$lib/utils/json';

const MAX_PARAMETROS_COMMISSION_RULES_BODY_BYTES = 128 * 1024;

type TierPayload = {
  faixa: 'PRE' | 'POS';
  de_pct: number;
  ate_pct: number;
  inc_pct_meta: number;
  inc_pct_comissao: number;
};

type CommissionRuleBody = {
  id?: unknown;
  nome?: unknown;
  descricao?: unknown;
  tipo?: unknown;
  meta_nao_atingida?: unknown;
  meta_atingida?: unknown;
  super_meta?: unknown;
  ativo?: unknown;
  tiers?: unknown;
  empresa_id?: unknown;
  company_id?: unknown;
};

type CommissionRuleRow = {
  id?: unknown;
  nome?: unknown;
  descricao?: unknown;
  tipo?: unknown;
  meta_nao_atingida?: unknown;
  meta_atingida?: unknown;
  super_meta?: unknown;
  ativo?: unknown;
  company_id?: unknown;
  created_by?: unknown;
  commission_tier?: unknown;
};

function parseObjectBody(text: string): CommissionRuleBody {
  const parsed = safeJsonParse(text);
  return parsed && typeof parsed === 'object' ? (parsed as CommissionRuleBody) : {};
}

function normalizeTipo(value: unknown): 'GERAL' | 'ESCALONAVEL' {
  return String(value || '')
    .trim()
    .toUpperCase() === 'ESCALONAVEL'
    ? 'ESCALONAVEL'
    : 'GERAL';
}

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeTiers(value: unknown): TierPayload[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((tier: unknown) => {
      const record = tier && typeof tier === 'object' ? (tier as Record<string, unknown>) : {};
      const faixa = String(record.faixa || '')
        .trim()
        .toUpperCase();
      if (faixa !== 'PRE' && faixa !== 'POS') return null;

      return {
        faixa,
        de_pct: normalizeNumber(record.de_pct, 0),
        ate_pct: normalizeNumber(record.ate_pct, 0),
        inc_pct_meta: normalizeNumber(record.inc_pct_meta, 0),
        inc_pct_comissao: normalizeNumber(record.inc_pct_comissao, 0)
      } as TierPayload;
    })
    .filter((tier): tier is TierPayload => Boolean(tier));
}

function isMissingColumnError(error: unknown) {
  const code = String((error as { code?: string })?.code || '').trim();
  const message = String((error as { message?: string })?.message || '').toLowerCase();

  return code === '42703' || (message.includes('column') && message.includes('does not exist'));
}

async function requireAccess(event: RequestEvent, minLevel: number) {
  const client = getAdminClient();
  const user = await requireAuthenticatedUser(event);
  const scope = await resolveUserScope(client, user.id);

  if (!scope.isAdmin) {
    ensureModuloAccess(
      scope,
      ['parametros_regras_comissao', 'regras_comissao', 'parametros'],
      minLevel,
      'Sem acesso às regras de comissão.'
    );
  }

  return {
    client,
    user,
    scope
  };
}

function canAccessRuleCompany(
  companyId: string | null | undefined,
  allowedCompanySet: Set<string>
) {
  if (!companyId) return true;
  if (allowedCompanySet.size === 0) return true;
  return allowedCompanySet.has(companyId);
}

function getRequestedCompanyId(event: RequestEvent, body?: CommissionRuleBody) {
  return String(
    body?.empresa_id ||
      body?.company_id ||
      event.url.searchParams.get('empresa_id') ||
      event.url.searchParams.get('company_id') ||
      ''
  ).trim();
}

function invalidateCommissionRuleReadModels(params?: {
  companyIds?: string[] | null;
  userId?: string | null;
}) {
  invalidateCommissionReadModels(params);
}

function resolveWritableCompanyId(
  access: Awaited<ReturnType<typeof requireAccess>>,
  requested: string
) {
  if (access.scope.isAdmin) {
    return isUuid(requested) ? requested : null;
  }

  return resolveScopedCompanyId(access.scope, requested);
}

async function getRuleCompanyForWrite(
  client: ReturnType<typeof getAdminClient>,
  id: string
): Promise<{ exists: boolean; companyId: string | null; legacySchema: boolean }> {
  const primary = await client
    .from('commission_rule')
    .select('id, company_id')
    .eq('id', id)
    .maybeSingle();

  if (!primary.error) {
    const rule = primary.data as CommissionRuleRow | null;
    return {
      exists: Boolean(rule),
      companyId: String(rule?.company_id || '').trim() || null,
      legacySchema: false
    };
  }

  if (!isMissingColumnError(primary.error)) {
    throw primary.error;
  }

  const fallback = await client.from('commission_rule').select('id').eq('id', id).maybeSingle();
  if (fallback.error) {
    throw fallback.error;
  }

  return {
    exists: Boolean(fallback.data),
    companyId: null,
    legacySchema: true
  };
}

async function ensureRuleWriteAccess(
  access: Awaited<ReturnType<typeof requireAccess>>,
  id: string
) {
  if (access.scope.isAdmin) {
    return { companyId: null, legacySchema: false };
  }

  const rule = await getRuleCompanyForWrite(access.client, id);
  if (!rule.exists) {
    return {
      error: new Response('Regra não encontrada.', { status: 404, headers: NO_STORE_HEADERS })
    };
  }

  if (rule.legacySchema) {
    return { companyId: null, legacySchema: true };
  }

  if (!rule.companyId) {
    return {
      error: new Response('Regra global só pode ser alterada pelo ADMIN do sistema.', {
        status: 403,
        headers: NO_STORE_HEADERS
      })
    };
  }

  const scopedCompanySet = cleanStringSet(access.scope.companyIds);
  if (!scopedCompanySet.has(rule.companyId)) {
    return {
      error: new Response('Sem acesso a esta regra de comissão.', {
        status: 403,
        headers: NO_STORE_HEADERS
      })
    };
  }

  return { companyId: rule.companyId, legacySchema: false };
}

export async function handleParametrosCommissionRulesGet(event: RequestEvent) {
  try {
    const access = await requireAccess(event, 1);
    const client = access.client;
    const requestedCompanyId = getRequestedCompanyId(event);
    const scopedCompanyIds = resolveScopedCompanyIds(access.scope, requestedCompanyId);
    const scopedCompanySet = cleanStringSet(scopedCompanyIds);

    let data: CommissionRuleRow[] | null = null;
    let error: unknown = null;

    const primary = await client
      .from('commission_rule')
      .select(
        'id, nome, descricao, tipo, meta_nao_atingida, meta_atingida, super_meta, ativo, company_id, created_by, commission_tier(id, faixa, de_pct, ate_pct, inc_pct_meta, inc_pct_comissao, ativo)'
      )
      .order('nome', { ascending: true });

    data = primary.data as CommissionRuleRow[] | null;
    error = primary.error;

    if (error && isMissingColumnError(error)) {
      const fallback = await client
        .from('commission_rule')
        .select(
          'id, nome, descricao, tipo, meta_nao_atingida, meta_atingida, super_meta, ativo, commission_tier(id, faixa, de_pct, ate_pct, inc_pct_meta, inc_pct_comissao, ativo)'
        )
        .order('nome', { ascending: true });

      data = fallback.data as CommissionRuleRow[] | null;
      error = fallback.error;
    }

    if (error) {
      throw error;
    }

    let items = Array.isArray(data) ? data : [];

    if (!access.scope.isAdmin && scopedCompanyIds.length === 0) {
      items = [];
    } else if (!access.scope.isAdmin) {
      items = items.filter((rule) =>
        canAccessRuleCompany(String(rule?.company_id || '').trim() || null, scopedCompanySet)
      );
    } else if (scopedCompanyIds.length > 0) {
      items = items.filter((rule) =>
        canAccessRuleCompany(String(rule?.company_id || '').trim() || null, scopedCompanySet)
      );
    }

    return json(items, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar regras de comissão.');
  }
}

export async function handleParametrosCommissionRulesPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const textResult = await readTextBodyLimited(
      event.request,
      MAX_PARAMETROS_COMMISSION_RULES_BODY_BYTES
    );
    if (!textResult.ok) return textResult.response;

    const access = await requireAccess(event, 3);
    const client = access.client;

    const rawBody = textResult.text;
    const body = parseObjectBody(rawBody);
    const nome = String(body?.nome || '').trim();
    const requestedCompanyId = getRequestedCompanyId(event, body);
    const writableCompanyId = resolveWritableCompanyId(access, requestedCompanyId);

    if (!nome) {
      return new Response('Nome é obrigatório.', { status: 400, headers: NO_STORE_HEADERS });
    }

    if (!access.scope.isAdmin && !writableCompanyId) {
      return new Response('Selecione uma empresa válida para salvar a regra.', {
        status: 400,
        headers: NO_STORE_HEADERS
      });
    }

    const payload = {
      nome,
      descricao: String(body?.descricao || '').trim() || null,
      tipo: normalizeTipo(body?.tipo),
      meta_nao_atingida: normalizeNumber(body?.meta_nao_atingida, 0),
      meta_atingida: normalizeNumber(body?.meta_atingida, 0),
      super_meta: normalizeNumber(body?.super_meta, 0),
      ativo: body?.ativo === undefined ? true : Boolean(body?.ativo)
    };

    const ruleId = String(body?.id || '').trim();
    if (ruleId && !isUuid(ruleId)) {
      return new Response('ID inválido.', { status: 400, headers: NO_STORE_HEADERS });
    }
    let persistedId = ruleId || null;
    const payloadWithScope: Record<string, unknown> = {
      ...payload,
      created_by: access.user.id
    };

    if (!persistedId || requestedCompanyId || !access.scope.isAdmin) {
      payloadWithScope.company_id = writableCompanyId;
    }

    if (persistedId) {
      const writeAccess = await ensureRuleWriteAccess(access, persistedId);
      if (writeAccess.error) return writeAccess.error;
      if (!access.scope.isAdmin && !writeAccess.legacySchema) {
        payloadWithScope.company_id = writeAccess.companyId;
      }

      let query = client.from('commission_rule').update(payloadWithScope).eq('id', persistedId);

      if (!access.scope.isAdmin && writeAccess.companyId) {
        query = query.eq('company_id', writeAccess.companyId);
      }

      let { error } = await query;

      if (error && isMissingColumnError(error)) {
        const fallback = await client.from('commission_rule').update(payload).eq('id', persistedId);
        error = fallback.error;
      }

      if (error) {
        throw error;
      }
    } else {
      let insertResult = await client
        .from('commission_rule')
        .insert(payloadWithScope)
        .select('id')
        .single();

      if (insertResult.error && isMissingColumnError(insertResult.error)) {
        insertResult = await client.from('commission_rule').insert(payload).select('id').single();
      }

      if (insertResult.error) {
        throw insertResult.error;
      }

      persistedId = String(insertResult.data?.id || '').trim() || null;
    }

    if (!persistedId) {
      return new Response('Não foi possível identificar a regra salva.', {
        status: 500,
        headers: NO_STORE_HEADERS
      });
    }

    const tiers = payload.tipo === 'ESCALONAVEL' ? sanitizeTiers(body?.tiers) : [];

    const { error: deleteError } = await client
      .from('commission_tier')
      .delete()
      .eq('rule_id', persistedId);

    if (deleteError) {
      throw deleteError;
    }

    if (tiers.length > 0) {
      const { error: tierError } = await client.from('commission_tier').insert(
        tiers.map((tier) => ({
          rule_id: persistedId,
          faixa: tier.faixa,
          de_pct: tier.de_pct,
          ate_pct: tier.ate_pct,
          inc_pct_meta: tier.inc_pct_meta,
          inc_pct_comissao: tier.inc_pct_comissao,
          ativo: true
        }))
      );

      if (tierError) {
        throw tierError;
      }
    }

    invalidateCommissionRuleReadModels({
      companyIds: writableCompanyId ? [writableCompanyId] : [],
      userId: access.user.id
    });
    return json({ ok: true, id: persistedId }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar regra de comissão.');
  }
}

export async function handleParametrosCommissionRulesPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const textResult = await readTextBodyLimited(
      event.request,
      MAX_PARAMETROS_COMMISSION_RULES_BODY_BYTES
    );
    if (!textResult.ok) return textResult.response;

    const access = await requireAccess(event, 3);
    const client = access.client;

    const rawBody = textResult.text;
    const body = parseObjectBody(rawBody);
    const id = String(body?.id || '').trim();

    if (!isUuid(id)) {
      return new Response('ID inválido.', { status: 400, headers: NO_STORE_HEADERS });
    }

    const writeAccess = await ensureRuleWriteAccess(access, id);
    if (writeAccess.error) return writeAccess.error;

    const payload: Record<string, unknown> = {};

    if ('ativo' in (body || {})) {
      payload.ativo = Boolean(body?.ativo);
    }

    if (Object.keys(payload).length === 0) {
      return new Response('Nenhuma alteração enviada.', { status: 400, headers: NO_STORE_HEADERS });
    }

    let query = client.from('commission_rule').update(payload).eq('id', id);

    if (!access.scope.isAdmin && writeAccess.companyId) {
      query = query.eq('company_id', writeAccess.companyId);
    }

    let { error } = await query;

    if (error && isMissingColumnError(error)) {
      const fallback = await client.from('commission_rule').update(payload).eq('id', id);
      error = fallback.error;
    }

    if (error) {
      throw error;
    }

    invalidateCommissionRuleReadModels({
      companyIds: writeAccess.companyId ? [writeAccess.companyId] : [],
      userId: access.user.id
    });
    return json({ ok: true, id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar regra de comissão.');
  }
}

export async function handleParametrosCommissionRulesDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const textResult = await readTextBodyLimited(
      event.request,
      MAX_PARAMETROS_COMMISSION_RULES_BODY_BYTES
    );
    if (!textResult.ok) return textResult.response;

    const access = await requireAccess(event, 3);
    const client = access.client;

    const rawBody = textResult.text;
    const body = parseObjectBody(rawBody);
    const id = String(body?.id || '').trim();

    if (!isUuid(id)) {
      return new Response('ID inválido.', { status: 400, headers: NO_STORE_HEADERS });
    }

    const writeAccess = await ensureRuleWriteAccess(access, id);
    if (writeAccess.error) return writeAccess.error;

    const { error: tierError } = await client.from('commission_tier').delete().eq('rule_id', id);

    if (tierError) {
      throw tierError;
    }

    let query = client.from('commission_rule').delete().eq('id', id);

    if (!access.scope.isAdmin && writeAccess.companyId) {
      query = query.eq('company_id', writeAccess.companyId);
    }

    let { error } = await query;

    if (error && isMissingColumnError(error)) {
      const fallback = await client.from('commission_rule').delete().eq('id', id);
      error = fallback.error;
    }

    if (error) {
      throw error;
    }

    invalidateCommissionRuleReadModels({
      companyIds: writeAccess.companyId ? [writeAccess.companyId] : [],
      userId: access.user.id
    });
    return json({ ok: true, id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir regra de comissão.');
  }
}
