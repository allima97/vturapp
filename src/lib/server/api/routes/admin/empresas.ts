// Migrado para Hono de src/routes/api/v1/admin/empresas/+server.ts — corpo IDÊNTICO ao original
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
import { validateOptionalCNPJ } from '$lib/utils/validation';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { cleanStringSet, chunkArray, dedupeById, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

const MAX_ADMIN_COMPANY_BODY_BYTES = 32 * 1024;
const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

type BillingPlanRow = {
  id?: string | null;
  nome?: string | null;
};

type CompanyBillingRow = {
  id?: string | null;
  status?: string | null;
  valor_mensal?: number | null;
  ultimo_pagamento?: string | null;
  proximo_vencimento?: string | null;
  plan?: BillingPlanRow | BillingPlanRow[] | null;
};

type CompanyListRow = {
  id: string;
  nome_fantasia?: string | null;
  nome_empresa?: string | null;
  cnpj?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  estado?: string | null;
  active?: boolean | null;
  billing?: CompanyBillingRow | CompanyBillingRow[] | null;
};

type MasterCompanyLinkCountRow = {
  company_id?: string | null;
};

async function loadCompaniesWithBilling(
  client: ReturnType<typeof getAdminClient>,
  companyIds: string[] | null
) {
  // companies schema: id, nome_fantasia, nome_empresa, cnpj, telefone, endereco, cidade, estado, active
  const buildBillingQuery = (idsFilter: string[] | null) => {
    const queryWithBilling = client
      .from('companies')
      .select(
        `
          id,
          nome_fantasia,
          nome_empresa,
          cnpj,
          telefone,
          endereco,
          cidade,
          estado,
          active,
          billing:company_billing (
            id,
            status,
            valor_mensal,
            ultimo_pagamento,
            proximo_vencimento,
            plan:plans (id, nome)
          )
        `
      )
      .order('nome_fantasia', { ascending: true });

    return idsFilter && idsFilter.length > 0
      ? queryWithBilling.in('id', idsFilter)
      : queryWithBilling;
  };

  const loadWithBilling = async () => {
    if (!companyIds || companyIds.length <= QUERY_IN_BATCH_SIZE) {
      const withBilling = await buildBillingQuery(companyIds);
      if (withBilling.error) throw withBilling.error;
      return withBilling.data || [];
    }

    const rows: CompanyListRow[] = [];
    for (const batch of chunkArray(companyIds)) {
      const withBilling = await buildBillingQuery(batch);
      if (withBilling.error) throw withBilling.error;
      rows.push(...((withBilling.data || []) as CompanyListRow[]));
    }
    return dedupeById(rows).sort((left, right) =>
      PT_BR_COLLATOR.compare(String(left?.nome_fantasia || ''), String(right?.nome_fantasia || ''))
    );
  };

  try {
    return await loadWithBilling();
  } catch (withBillingError: unknown) {
    const message = String(
      (withBillingError as { message?: unknown })?.message || ''
    ).toLowerCase();
    if (!message.includes('company_billing') && !message.includes('plans')) {
      throw withBillingError;
    }
  }

  const fallback = await client
    .from('companies')
    .select('id, nome_fantasia, nome_empresa, cnpj, telefone, endereco, cidade, estado, active')
    .order('nome_fantasia', { ascending: true });

  if (fallback.error) throw fallback.error;
  const rows = (fallback.data || []) as CompanyListRow[];
  if (!companyIds || !companyIds.length) return rows;
  const companyIdSet = cleanStringSet(companyIds);
  return rows.filter((row) => companyIdSet.has(String(row.id).trim()));
}

export async function handleAdminEmpresasGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    ensureCanManageCompanies(scope);

    const accessibleCompanyIds = scope.isAdmin ? null : getAccessibleCompanyIds(scope);
    const rows = await loadCompaniesWithBilling(client, accessibleCompanyIds);

    const companyIds = rows.map((row: any) => row.id);
    let masterLinkCounts = new Map<string, number>();

    try {
      for (const batch of chunkArray(companyIds)) {
        const masterLinksRes =
          batch.length > 0
            ? await client.from('master_empresas').select('company_id').in('company_id', batch)
            : { data: [], error: null };
        if (masterLinksRes.error) throw masterLinksRes.error;

        for (const row of (masterLinksRes.data || []) as MasterCompanyLinkCountRow[]) {
          const companyId = String(row.company_id || '').trim();
          if (!companyId) continue;
          masterLinkCounts.set(companyId, Number(masterLinkCounts.get(companyId) || 0) + 1);
        }
      }
    } catch {
      masterLinkCounts = new Map<string, number>();
    }

    return json({
      items: rows.map((row: any) => ({
        id: row.id,
        nome_fantasia: row.nome_fantasia || '',
        nome_empresa: row.nome_empresa || '',
        nome: row.nome_fantasia || row.nome_empresa || '',
        cnpj: row.cnpj || '',
        cidade: row.cidade || '',
        estado: row.estado || '',
        telefone: row.telefone || '',
        endereco: row.endereco || '',
        active: row.active !== false,
        ativo: row.active !== false,
        billing: Array.isArray(row.billing) ? row.billing[0] || null : row.billing || null,
        master_links: Number(masterLinkCounts.get(String(row.id)) || 0)
      }))
    });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar empresas.');
  }
}

export async function handleAdminEmpresasPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_ADMIN_COMPANY_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};

    ensureCanManageCompanies(scope);

    const id = String(body.id || '').trim();
    if ('cnpj' in body && !validateOptionalCNPJ(body.cnpj)) {
      return json(
        { error: 'CNPJ inválido. Confira os dígitos informados.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const payload = {
      nome_fantasia: String(body.nome_fantasia || body.nome || '').trim() || null,
      nome_empresa: String(body.nome_empresa || '').trim() || null,
      cnpj: String(body.cnpj || '').trim() || null,
      telefone: String(body.telefone || '').trim() || null,
      endereco: String(body.endereco || '').trim() || null,
      cidade: String(body.cidade || '').trim() || null,
      estado: String(body.estado || '').trim() || null,
      active: body.active !== false && body.ativo !== false
    };

    if (!payload.nome_fantasia) {
      return new Response('Informe o nome da empresa.', { status: 400, headers: NO_STORE_HEADERS });
    }

    let companyId = id;
    if (companyId) {
      const accessibleCompanySet = cleanStringSet(getAccessibleCompanyIds(scope));
      if (!scope.isAdmin && !accessibleCompanySet.has(companyId)) {
        return new Response('Empresa fora do escopo permitido.', {
          status: 403,
          headers: NO_STORE_HEADERS
        });
      }
      const { error: updateError } = await client
        .from('companies')
        .update(payload)
        .eq('id', companyId);
      if (updateError) throw updateError;
    } else {
      if (!scope.isAdmin) {
        return new Response('Somente ADMIN pode criar empresas.', {
          status: 403,
          headers: NO_STORE_HEADERS
        });
      }
      const { data, error: insertError } = await client
        .from('companies')
        .insert(payload)
        .select('id')
        .single();
      if (insertError) throw insertError;
      companyId = data.id;
    }

    if ('billing_status' in body || 'billing_plan_id' in body || 'billing_valor_mensal' in body) {
      try {
        const billingPayload = {
          company_id: companyId,
          status: String(body.billing_status || 'active').trim() || 'active',
          plan_id: String(body.billing_plan_id || '').trim() || null,
          valor_mensal:
            body.billing_valor_mensal === '' || body.billing_valor_mensal == null
              ? null
              : Number(body.billing_valor_mensal),
          ultimo_pagamento: String(body.billing_ultimo_pagamento || '').trim() || null,
          proximo_vencimento: String(body.billing_proximo_vencimento || '').trim() || null
        };

        const existingBilling = await client
          .from('company_billing')
          .select('id')
          .eq('company_id', companyId)
          .maybeSingle();

        if (existingBilling.error) throw existingBilling.error;

        if (existingBilling.data?.id) {
          const { error: billingUpdateError } = await client
            .from('company_billing')
            .update(billingPayload)
            .eq('id', existingBilling.data.id);
          if (billingUpdateError) throw billingUpdateError;
        } else {
          const { error: billingInsertError } = await client
            .from('company_billing')
            .insert(billingPayload);
          if (billingInsertError) throw billingInsertError;
        }
      } catch {
        // Billing is optional in environments where the table is not present.
      }
    }

    return json({ id: companyId, saved: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar empresa.');
  }
}
