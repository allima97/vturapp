// Migrado para Hono de src/routes/api/v1/dashboard/base/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  fetchRankingVendedoresByCompanyIds,
  getAdminClient,
  hasModuloAccess,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { CONFIG_READ_HEADERS, DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { chunkArray } from '$lib/utils/array';

const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

type DashboardScope = Awaited<ReturnType<typeof resolveUserScope>>;

type DashboardCompanyRow = {
  id: string | null;
  nome_fantasia: string | null;
  nome_empresa: string | null;
  active: boolean | null;
};

type DashboardCompanyOption = {
  id: string;
  nome: string;
  active: boolean;
};

type DashboardVendedorRow = {
  id?: string | null;
  nome_completo?: string | null;
  email?: string | null;
  company_id?: string | null;
};

function companyLabel(row: DashboardCompanyRow) {
  return String(row?.nome_fantasia || row?.nome_empresa || 'Empresa sem nome');
}

function vendedorLabel(row: DashboardVendedorRow) {
  return String(row?.nome_completo || row?.email || 'Usuario sem nome');
}

function canUseDashboardFilters(scope: DashboardScope) {
  return (
    scope?.isAdmin ||
    scope?.isMaster ||
    scope?.isFinanceiro ||
    scope?.isGestor ||
    hasModuloAccess(scope, ['dashboard'], 1)
  );
}

export async function handleDashboardBaseGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!canUseDashboardFilters(scope)) {
      return json(
        { error: 'Sem acesso aos filtros do dashboard.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const requestedCompanyId = String(event.url.searchParams.get('empresa_id') || '').trim();
    const includeVendedores =
      String(event.url.searchParams.get('include_vendedores') || '1').trim() !== '0';

    let scopedCompanyIds = resolveScopedCompanyIds(scope, requestedCompanyId);
    if (scope.isGestor && scope.companyId) {
      scopedCompanyIds = [scope.companyId];
    }

    const empresas = await getCachedReadModel<DashboardCompanyOption[]>({
      key: buildReadModelCacheKey('dashboard:base:empresas', {
        scopeCompanyIds: scope.companyIds,
        requestedCompanyId,
        scopedCompanyIds,
        isAdmin: scope.isAdmin,
        userId: user.id
      }),
      tags: [
        READ_MODEL_TAGS.dashboard,
        READ_MODEL_TAGS.users,
        READ_MODEL_TAGS.catalog,
        ...scopeCacheTags({ companyIds: scope.companyIds, userId: user.id })
      ],
      ttlMs: 300_000,
      staleTtlMs: 1_800_000,
      loader: async () => {
        const rows: DashboardCompanyRow[] = [];
        const companyBatches =
          !scope.isAdmin && scope.companyIds.length > 0 ? chunkArray(scope.companyIds) : [null];

        const batchRows = await Promise.all(
          companyBatches.map(async (companyBatch) => {
            let companiesQuery = client
              .from('companies')
              .select('id, nome_fantasia, nome_empresa, active')
              .order('nome_fantasia', { ascending: true })
              .limit(500);

            if (companyBatch) companiesQuery = companiesQuery.in('id', companyBatch);

            const { data: companiesData, error: companiesError } = await companiesQuery;
            if (companiesError) throw companiesError;
            return (companiesData || []) as DashboardCompanyRow[];
          })
        );
        rows.push(...batchRows.flat());

        return rows
          .map((row) => ({
            id: String(row?.id || ''),
            nome: companyLabel(row),
            active: row?.active !== false
          }))
          .filter((row) => row.id);
      }
    });

    const companyIdsForVendedores = (() => {
      if (scopedCompanyIds.length > 0) return scopedCompanyIds;
      if (scope.isAdmin) {
        const companyIds: string[] = [];
        for (const row of empresas) {
          if (isUuid(row.id)) companyIds.push(row.id);
        }
        return companyIds;
      }
      return scope.companyIds;
    })();

    let vendedores: DashboardVendedorRow[] = [];
    if (
      includeVendedores &&
      (scope.isAdmin || scope.isMaster || scope.isFinanceiro || scope.isGestor)
    ) {
      vendedores = await getCachedReadModel<DashboardVendedorRow[]>({
        key: buildReadModelCacheKey('dashboard:base:vendedores', {
          userId: user.id,
          companyIdsForVendedores,
          isAdmin: scope.isAdmin,
          isMaster: scope.isMaster,
          isFinanceiro: scope.isFinanceiro,
          isGestor: scope.isGestor
        }),
        tags: [
          READ_MODEL_TAGS.dashboard,
          READ_MODEL_TAGS.users,
          ...scopeCacheTags({
            companyIds: companyIdsForVendedores,
            userId: user.id
          })
        ],
        ttlMs: 300_000,
        staleTtlMs: 1_800_000,
        loader: () => fetchRankingVendedoresByCompanyIds(client, companyIdsForVendedores)
      });
    } else if (
      !includeVendedores &&
      (scope.isAdmin || scope.isMaster || scope.isFinanceiro || scope.isGestor)
    ) {
      vendedores = [];
    } else {
      const { data: currentUser, error: userError } = await client
        .from('users')
        .select('id, nome_completo, email, company_id')
        .eq('id', scope.userId)
        .maybeSingle();
      if (userError) throw userError;
      vendedores = currentUser ? [currentUser] : [];
    }

    const companyNameById = new Map<string, string | null>();
    for (const row of empresas) {
      companyNameById.set(row.id, row.nome);
    }
    const vendedoresFiltro = vendedores
      .map((row) => ({
        id: String(row?.id || ''),
        nome: vendedorLabel(row),
        company_id: String(row?.company_id || ''),
        company_name: companyNameById.get(String(row?.company_id || '')) || ''
      }))
      .filter((row) => row.id)
      .sort((left, right) => PT_BR_COLLATOR.compare(left.nome, right.nome));

    return json(
      {
        empresas,
        vendedores: vendedoresFiltro
      },
      { headers: CONFIG_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar filtros do dashboard.');
  }
}
