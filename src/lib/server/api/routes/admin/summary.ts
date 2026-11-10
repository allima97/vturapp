// Migrado para Hono de src/routes/api/v1/admin/summary/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  canManageCompanies,
  canManageUsers,
  loadAvisoTemplates,
  loadEmailSettings,
  loadManagedCompanies,
  loadManagedUserTypes,
  listManagedUsers
} from '$lib/server/admin';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { chunkArray, uniqueCleanStrings } from '$lib/utils/array';

const TEXT_NO_STORE_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  ...NO_STORE_HEADERS
};

type ActiveRow = {
  active?: boolean | null;
};

type AtivoRow = {
  ativo?: boolean | null;
};

type CompanyRow = ActiveRow & {
  id?: string | null;
};

type BillingRow = {
  company_id?: string | null;
  status?: string | null;
  valor_mensal?: number | string | null;
  proximo_vencimento?: string | null;
};

export async function handleAdminSummaryGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!canManageUsers(scope) && !canManageCompanies(scope)) {
      return new Response('Sem acesso ao resumo administrativo.', {
        status: 403,
        headers: TEXT_NO_STORE_HEADERS
      });
    }

    const loadPlanos = async () => {
      if (!scope.isAdmin) return [];
      try {
        const { data, error } = await client.from('plans').select('id, ativo');
        if (error) throw error;
        return data || [];
      } catch {
        return [];
      }
    };

    const cacheCompanyIds = uniqueCleanStrings([
      ...(scope.companyIds || []),
      scope.companyId || ''
    ]);
    const payload = await getCachedReadModel({
      key: buildReadModelCacheKey('admin-summary', {
        userId: user.id,
        papel: scope.papel,
        isAdmin: scope.isAdmin,
        companyIds: cacheCompanyIds
      }),
      tags: [
        READ_MODEL_TAGS.dashboard,
        READ_MODEL_TAGS.users,
        READ_MODEL_TAGS.catalog,
        READ_MODEL_TAGS.finance,
        ...scopeCacheTags({ companyIds: cacheCompanyIds, userId: user.id })
      ],
      ttlMs: 20_000,
      staleTtlMs: 120_000,
      loader: async () => {
        const [usuarios, empresas, tipos, templates, emailSettings, planos] = await Promise.all([
          listManagedUsers(client, scope),
          loadManagedCompanies(client, scope).catch(() => []),
          loadManagedUserTypes(client, scope).catch(() => []),
          loadAvisoTemplates(client).catch(() => []),
          loadEmailSettings(client).catch(() => null),
          loadPlanos()
        ]);

        let pendingMasterLinks = 0;
        try {
          if (!scope.isAdmin) {
            const companyIds = (scope.companyIds || []).filter(Boolean);
            if (scope.companyId) companyIds.push(scope.companyId);
            const uniqueIds = uniqueCleanStrings(companyIds);
            if (!uniqueIds.length) {
              pendingMasterLinks = 0;
            } else {
              for (const batch of chunkArray(uniqueIds)) {
                const { count } = await client
                  .from('master_empresas')
                  .select('id', { count: 'exact', head: true })
                  .eq('status', 'pending')
                  .in('company_id', batch);
                pendingMasterLinks += Number(count || 0);
              }
            }
          } else {
            const { count } = await client
              .from('master_empresas')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending');
            pendingMasterLinks = Number(count || 0);
          }
        } catch {
          pendingMasterLinks = 0;
        }

        const usuariosRows = usuarios as ActiveRow[];
        const empresasRows = empresas as CompanyRow[];
        const planosRows = planos as AtivoRow[];

        const usuariosAtivos = usuariosRows.reduce(
          (total, item) => total + (item.active !== false ? 1 : 0),
          0
        );
        const usuariosInativos = usuariosRows.length - usuariosAtivos;
        const empresasAtivas = empresasRows.reduce(
          (total, item) => total + (item.active !== false ? 1 : 0),
          0
        );
        const empresasInativas = empresasRows.length - empresasAtivas;
        const planosAtivos = planosRows.reduce(
          (total, item) => total + (item.ativo !== false ? 1 : 0),
          0
        );
        const planosInativos = planosRows.length - planosAtivos;
        const templatesAtivos = (templates as AtivoRow[]).reduce(
          (total, item) => total + (item.ativo !== false ? 1 : 0),
          0
        );
        const emailConfigured = Boolean(
          emailSettings?.resend_api_key ||
          (emailSettings?.smtp_host && emailSettings?.smtp_user && emailSettings?.smtp_pass)
        );

        const companyIds: string[] = [];
        for (const empresa of empresasRows) {
          const companyId = String(empresa.id || '').trim();
          if (companyId) companyIds.push(companyId);
        }
        let billingRows: BillingRow[] = [];
        if (companyIds.length > 0) {
          try {
            if (scope.isAdmin) {
              const { data, error } = await client
                .from('company_billing')
                .select('company_id, status, valor_mensal, proximo_vencimento');
              if (error) throw error;
              billingRows = (data || []) as BillingRow[];
            } else {
              const rows: BillingRow[] = [];
              for (const batch of chunkArray(companyIds)) {
                const { data, error } = await client
                  .from('company_billing')
                  .select('company_id, status, valor_mensal, proximo_vencimento')
                  .in('company_id', batch);
                if (error) throw error;
                rows.push(...((data || []) as BillingRow[]));
              }
              billingRows = rows;
            }
          } catch {
            billingRows = [];
          }
        }

        const billingStatusByCompany = new Map<string, string>();
        for (const row of billingRows) {
          const companyId = String(row.company_id || '').trim();
          if (!companyId) continue;
          billingStatusByCompany.set(
            companyId,
            String(row.status || 'trial')
              .trim()
              .toLowerCase() || 'trial'
          );
        }

        const billingCounts = {
          active: 0,
          trial: 0,
          past_due: 0,
          suspended: 0,
          canceled: 0
        };

        for (const companyId of companyIds) {
          const status = billingStatusByCompany.get(companyId) || 'trial';
          if (status in billingCounts) {
            billingCounts[status as keyof typeof billingCounts] += 1;
          }
        }

        return {
          counts: {
            usuarios_total: usuariosRows.length,
            usuarios_ativos: usuariosAtivos,
            usuarios_inativos: usuariosInativos,
            empresas_total: empresasRows.length,
            empresas_ativas: empresasAtivas,
            empresas_inativas: empresasInativas,
            tipos_total: tipos.length,
            planos_total: planosRows.length,
            planos_ativos: planosAtivos,
            planos_inativos: planosInativos,
            cobrancas_ativas: billingCounts.active,
            cobrancas_trial: billingCounts.trial,
            cobrancas_atrasadas: billingCounts.past_due,
            cobrancas_suspensas: billingCounts.suspended,
            cobrancas_canceladas: billingCounts.canceled,
            avisos_ativos: templatesAtivos,
            vinculos_master_pendentes: pendingMasterLinks
          },
          indicators: {
            email_configurado: emailConfigured,
            escopo: scope.papel,
            scope_company_ids: scope.companyIds
          }
        };
      }
    });

    return json(payload, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar resumo administrativo.');
  }
}
