// Migrado para Hono de src/routes/api/v1/financeiro/comissoes/regras/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
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
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateCommissionReadModels } from '$lib/server/readModelCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { cleanStringSet, chunkArray } from '$lib/utils/array';

// Usa commission_rule e commission_tier (tabelas reais do schema)
const MAX_COMMISSION_RULE_BODY_BYTES = 64 * 1024;
const COMMISSION_RULE_COMPANY_BATCH_SIZE = 80;
const PT_BR_COLLATOR = new Intl.Collator('pt-BR');
const COMMISSION_RULE_SELECT =
  'id, nome, descricao, tipo, meta_nao_atingida, meta_atingida, super_meta, ativo, company_id, created_at, updated_at, commission_tier(id, faixa, de_pct, ate_pct, inc_pct_meta, inc_pct_comissao, ativo)';

type CommissionTierPayload = {
  faixa?: string | null;
  de_pct?: number | string | null;
  ate_pct?: number | string | null;
  inc_pct_meta?: number | string | null;
  inc_pct_comissao?: number | string | null;
};

type CommissionRulePayload = {
  id?: string;
  nome?: string;
  descricao?: string | null;
  tipo?: string;
  meta_nao_atingida?: number | string;
  meta_atingida?: number | string;
  super_meta?: number | string;
  ativo?: boolean;
  empresa_id?: string | null;
  company_id?: string | null;
  tiers?: CommissionTierPayload[];
};

type CommissionTierRow = CommissionTierPayload & {
  id?: string;
  ativo?: boolean | null;
};

type CommissionRuleRow = {
  id: string;
  nome?: string | null;
  company_id?: string | null;
  commission_tier?: CommissionTierRow[] | null;
  [key: string]: unknown;
};

type RuleListQuery = PromiseLike<{
  data: CommissionRuleRow[] | null;
  error: unknown;
}> & {
  eq(column: string, value: boolean | string): RuleListQuery;
  order(column: string, options: { ascending: boolean }): RuleListQuery;
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

async function loadRuleCompany(client: ReturnType<typeof getAdminClient>, id: string) {
  const { data, error } = await client
    .from('commission_rule')
    .select('id, company_id')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as { id: string; company_id?: string | null } | null;
}

function invalidateCommissionRuleReadModels(params?: {
  companyIds?: string[] | null;
  userId?: string | null;
}) {
  invalidateCommissionReadModels(params);
}

function applyRuleListFilters(query: unknown, ativo: string | null, tipo: string | null) {
  let builder = query as RuleListQuery;
  if (ativo !== null && ativo !== '') builder = builder.eq('ativo', ativo === 'true');
  if (tipo) builder = builder.eq('tipo', tipo);
  return builder;
}

async function fetchCommissionRulesForScope(params: {
  client: ReturnType<typeof getAdminClient>;
  ativo: string | null;
  tipo: string | null;
  companyIds: string[];
  includeAllCompanies: boolean;
}) {
  const { client, ativo, tipo, companyIds, includeAllCompanies } = params;
  const rows: CommissionRuleRow[] = [];

  const runQuery = async (builder: unknown) => {
    const { data, error } = await applyRuleListFilters(builder, ativo, tipo).order('nome', {
      ascending: true
    });
    if (error) throw error;
    rows.push(...((data || []) as CommissionRuleRow[]));
  };

  if (includeAllCompanies) {
    await runQuery(client.from('commission_rule').select(COMMISSION_RULE_SELECT));
  } else {
    await runQuery(
      client.from('commission_rule').select(COMMISSION_RULE_SELECT).is('company_id', null)
    );

    for (const companyBatch of chunkArray(companyIds, COMMISSION_RULE_COMPANY_BATCH_SIZE)) {
      if (companyBatch.length === 0) continue;
      await runQuery(
        client.from('commission_rule').select(COMMISSION_RULE_SELECT).in('company_id', companyBatch)
      );
    }
  }

  const rowsById = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    rowsById.set(row.id, row);
  }

  return Array.from(rowsById.values()).sort((a, b) =>
    PT_BR_COLLATOR.compare(String(a?.nome || ''), String(b?.nome || ''))
  );
}

export async function handleFinanceiroComissoesRegrasGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['RegrasComissao', 'Comissionamento', 'parametros'],
        1,
        'Sem acesso às regras de comissão.'
      );
    }

    const { searchParams } = event.url;
    const ativo = searchParams.get('ativo');
    const tipo = searchParams.get('tipo');
    const companyIds = resolveScopedCompanyIds(
      scope,
      searchParams.get('empresa_id') || searchParams.get('company_id')
    );
    const scopedCompanySet = cleanStringSet(scope.companyIds);

    const rows = await fetchCommissionRulesForScope({
      client,
      ativo,
      tipo,
      companyIds,
      includeAllCompanies: scope.isAdmin && companyIds.length === 0
    });
    const visibleRows =
      scope.isAdmin || companyIds.length > 0
        ? rows
        : rows.filter((row) => canAccessCompany(scope, row.company_id, scopedCompanySet));

    const items = visibleRows.map((r) => ({
      ...r,
      tiers: r.commission_tier || []
    }));

    return json({ items, total: items.length }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar regras de comissão.');
  }
}

export async function handleFinanceiroComissoesRegrasPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_COMMISSION_RULE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['RegrasComissao', 'Comissionamento', 'parametros'],
        2,
        'Sem permissão para criar regras.'
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as CommissionRulePayload)
        : {};
    const {
      nome,
      descricao,
      tipo = 'GERAL',
      meta_nao_atingida = 0,
      meta_atingida = 0,
      super_meta = 0,
      ativo = true,
      tiers = []
    } = body;
    const companyId = scope.isAdmin
      ? isUuid(body?.empresa_id || body?.company_id)
        ? String(body.empresa_id || body.company_id)
        : null
      : resolveScopedCompanyId(scope, body?.empresa_id || body?.company_id);

    if (!nome?.trim())
      return json({ error: 'Nome obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });
    if (!scope.isAdmin && !companyId) {
      return json(
        { error: 'Selecione uma empresa válida para criar a regra.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { data: regraData, error: regraError } = await client
      .from('commission_rule')
      .insert({
        nome: nome.trim(),
        descricao: descricao?.trim() || null,
        tipo: tipo === 'ESCALONAVEL' ? 'ESCALONAVEL' : 'GERAL',
        meta_nao_atingida: Number(meta_nao_atingida) || 0,
        meta_atingida: Number(meta_atingida) || 0,
        super_meta: Number(super_meta) || 0,
        ativo,
        company_id: companyId
      })
      .select(
        'id, nome, descricao, tipo, meta_nao_atingida, meta_atingida, super_meta, ativo, company_id, created_at, updated_at'
      )
      .single();

    if (regraError) throw regraError;

    if (tipo === 'ESCALONAVEL' && Array.isArray(tiers) && tiers.length > 0) {
      const tiersData = tiers.map((tier) => ({
        rule_id: regraData.id,
        faixa: tier.faixa === 'POS' ? 'POS' : 'PRE',
        de_pct: Number(tier.de_pct) || 0,
        ate_pct: Number(tier.ate_pct) || 100,
        inc_pct_meta: Number(tier.inc_pct_meta) || 0,
        inc_pct_comissao: Number(tier.inc_pct_comissao) || 0,
        ativo: true
      }));
      await client.from('commission_tier').insert(tiersData);
    }

    invalidateCommissionRuleReadModels({
      companyIds: companyId ? [companyId] : [],
      userId: user.id
    });
    return json({ success: true, data: regraData }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao criar regra de comissão.');
  }
}

export async function handleFinanceiroComissoesRegrasPut(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_COMMISSION_RULE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['RegrasComissao', 'Comissionamento', 'parametros'],
        3,
        'Sem permissão.'
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as CommissionRulePayload)
        : {};
    const id = event.url.searchParams.get('id') || body.id;
    if (!id || !isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const rule = await loadRuleCompany(client, id);
    if (!rule)
      return json({ error: 'Regra não encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });
    const scopedCompanySet = cleanStringSet(scope.companyIds);
    if (!canAccessCompany(scope, rule.company_id, scopedCompanySet)) {
      return json(
        { error: 'Sem acesso a esta regra.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const payload: Record<string, unknown> = {};
    if ('nome' in body) payload.nome = body.nome;
    if ('ativo' in body) payload.ativo = body.ativo;
    if ('meta_atingida' in body) payload.meta_atingida = body.meta_atingida;
    if ('meta_nao_atingida' in body) payload.meta_nao_atingida = body.meta_nao_atingida;
    if ('super_meta' in body) payload.super_meta = body.super_meta;

    let query = client.from('commission_rule').update(payload).eq('id', id);
    if (!scope.isAdmin) query = query.eq('company_id', rule.company_id);
    const { error } = await query;
    if (error) throw error;

    invalidateCommissionRuleReadModels({
      companyIds: rule.company_id ? [rule.company_id] : [],
      userId: user.id
    });
    return json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar regra.');
  }
}

export async function handleFinanceiroComissoesRegrasDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['RegrasComissao', 'Comissionamento', 'parametros'],
        4,
        'Sem permissão.'
      );
    }

    const id = event.url.searchParams.get('id');
    if (!id || !isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const rule = await loadRuleCompany(client, id);
    if (!rule)
      return json({ error: 'Regra não encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });
    const scopedCompanySet = cleanStringSet(scope.companyIds);
    if (!canAccessCompany(scope, rule.company_id, scopedCompanySet)) {
      return json(
        { error: 'Sem acesso a esta regra.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    await client.from('commission_tier').delete().eq('rule_id', id);
    let query = client.from('commission_rule').delete().eq('id', id);
    if (!scope.isAdmin) query = query.eq('company_id', rule.company_id);
    const { error } = await query;
    if (error) throw error;

    invalidateCommissionRuleReadModels({
      companyIds: rule.company_id ? [rule.company_id] : [],
      userId: user.id
    });
    return json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir regra.');
  }
}
