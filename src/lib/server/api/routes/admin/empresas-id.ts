// Migrado para Hono de src/routes/api/v1/admin/empresas/[id]/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import {
  ensureCanManageCompanies,
  getAccessibleCompanyIds,
  loadManagedCompanies
} from '$lib/server/admin';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { cleanStringSet } from '$lib/utils/array';

const MAX_ADMIN_COMPANY_BODY_BYTES = 32 * 1024;
const ADMIN_COMPANY_ALLOWED_UPDATE_FIELDS = [
  'nome_empresa',
  'nome_fantasia',
  'cnpj',
  'telefone',
  'endereco',
  'cidade',
  'estado',
  'active'
] as const;

type PlanRow = {
  id: string;
  nome?: string | null;
  ativo?: boolean | null;
};

type UserTypeRelation = { name?: string | null } | Array<{ name?: string | null }> | null;

type MasterUserRow = {
  id: string;
  nome_completo?: string | null;
  email?: string | null;
  user_types?: UserTypeRelation;
};

type MasterCompanyLinkRow = {
  id: string;
  master_id?: string | null;
  company_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
};

function relationTypeName(value: UserTypeRelation | undefined) {
  return String(Array.isArray(value) ? value[0]?.name || '' : value?.name || '');
}

export async function handleAdminEmpresasIdGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const companyId = String(event.params.id || '').trim();

    ensureCanManageCompanies(scope);

    const accessibleCompanySet = cleanStringSet(getAccessibleCompanyIds(scope));
    if (!scope.isAdmin && !accessibleCompanySet.has(companyId)) {
      return new Response('Empresa fora do escopo permitido.', {
        status: 403,
        headers: NO_STORE_HEADERS
      });
    }

    const { data: companyRow, error: companyError } = await client
      .from('companies')
      .select('id, nome_empresa, nome_fantasia, cnpj, telefone, endereco, cidade, estado, active')
      .eq('id', companyId)
      .maybeSingle();

    if (companyError || !companyRow) {
      return new Response('Empresa nao encontrada.', { status: 404, headers: NO_STORE_HEADERS });
    }

    let billing = null;
    let plans: PlanRow[] = [];
    try {
      const [billingRes, plansRes] = await Promise.all([
        client
          .from('company_billing')
          .select('id, status, plan_id, valor_mensal, ultimo_pagamento, proximo_vencimento')
          .eq('company_id', companyId)
          .maybeSingle(),
        client.from('plans').select('id, nome, ativo').order('nome', { ascending: true })
      ]);
      if (!billingRes.error) billing = billingRes.data || null;
      if (!plansRes.error) plans = (plansRes.data || []) as PlanRow[];
    } catch {
      billing = null;
      plans = [];
    }

    const [linksRes, mastersRes] = await Promise.all([
      client
        .from('master_empresas')
        .select('id, master_id, company_id, status, created_at, approved_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
      client
        .from('users')
        .select('id, nome_completo, email, user_types(name)')
        .order('nome_completo', { ascending: true })
    ]);

    if (linksRes.error) throw linksRes.error;
    if (mastersRes.error) throw mastersRes.error;

    const masterRows = ((mastersRes.data || []) as MasterUserRow[]).filter((row) =>
      relationTypeName(row.user_types).toUpperCase().includes('MASTER')
    );

    const mastersMap = new Map(
      masterRows.map((row) => [
        String(row.id),
        {
          id: row.id,
          nome_completo: row.nome_completo || row.email || 'Usuario sem nome',
          email: row.email || null
        }
      ])
    );

    return json({
      empresa: companyRow,
      billing,
      plans,
      master_links: ((linksRes.data || []) as MasterCompanyLinkRow[]).map((row) => ({
        ...row,
        master: mastersMap.get(String(row.master_id)) || null
      })),
      masters_disponiveis: Array.from(mastersMap.values())
    });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar detalhe da empresa.');
  }
}

export async function handleAdminEmpresasIdPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_ADMIN_COMPANY_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const companyId = String(event.params.id || '').trim();

    ensureCanManageCompanies(scope);

    const accessibleCompanySet = cleanStringSet(getAccessibleCompanyIds(scope));
    if (!scope.isAdmin && !accessibleCompanySet.has(companyId)) {
      return json(
        { error: 'Empresa fora do escopo permitido.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};

    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    // Apenas campos que existem na tabela companies
    for (const field of ADMIN_COMPANY_ALLOWED_UPDATE_FIELDS) {
      if (body[field] !== undefined) updatePayload[field] = body[field];
    }

    if (Object.keys(updatePayload).length === 1) {
      return json(
        { error: 'Nenhum campo para atualizar.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { data, error } = await client
      .from('companies')
      .update(updatePayload)
      .eq('id', companyId)
      .select('id, nome_empresa, nome_fantasia, cnpj, telefone, endereco, cidade, estado, active')
      .maybeSingle();

    if (error) throw error;
    if (!data)
      return json({ error: 'Empresa não encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });

    return json({ ok: true, empresa: data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar empresa.');
  }
}
