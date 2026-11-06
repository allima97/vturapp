// Migrado para Hono de src/routes/api/v1/relatorios/base/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  fetchVendedorIdsByCompanyIds,
  getAdminClient,
  isRankingEligibleUser,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { SHORT_DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { chunkArray } from '$lib/utils/array';

const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

type CompanyFilterRow = {
  id?: string | null;
  nome_fantasia?: string | null;
  nome_empresa?: string | null;
  active?: boolean | null;
};

type UserTypeFilterRow = {
  name?: string | null;
};

type UserCompanyFilterRow = {
  nome_fantasia?: string | null;
  nome_empresa?: string | null;
};

type UserFilterRow = {
  id?: string | null;
  nome_completo?: string | null;
  email?: string | null;
  company_id?: string | null;
  active?: boolean | null;
  uso_individual?: boolean | null;
  user_types?: UserTypeFilterRow | UserTypeFilterRow[] | null;
  companies?: UserCompanyFilterRow | UserCompanyFilterRow[] | null;
};

export async function handleRelatoriosBaseGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        [
          'relatorios',
          'relatorios_vendas',
          'relatorios_destinos',
          'relatorios_produtos',
          'relatorios_clientes',
          'relatorios_ranking_vendas',
          'dashboard',
          'vendas'
        ],
        1,
        'Sem acesso aos filtros analíticos.'
      );
    }

    const { searchParams } = event.url;
    const requestedCompanyId = String(searchParams.get('empresa_id') || '').trim();
    const tipoNome = String(scope.tipoNome || '').toUpperCase();
    const isAdminByType = tipoNome.includes('ADMIN');
    const isGestorByType = tipoNome.includes('GESTOR');
    const isMasterByType = tipoNome.includes('MASTER');

    let scopedTeamIds: string[] = [];
    let companyIdsForUsers: string[] = [];
    let enforceCorporateOnly = false;

    if (isAdminByType) {
      companyIdsForUsers = requestedCompanyId ? [requestedCompanyId] : [];
    } else if (isGestorByType) {
      companyIdsForUsers = scope.companyId
        ? [scope.companyId]
        : resolveScopedCompanyIds(scope, requestedCompanyId);
      scopedTeamIds = await fetchVendedorIdsByCompanyIds(client, companyIdsForUsers);
    } else if (isMasterByType) {
      companyIdsForUsers = resolveScopedCompanyIds(scope, requestedCompanyId);
      enforceCorporateOnly = true;
    } else {
      companyIdsForUsers = resolveScopedCompanyIds(scope, requestedCompanyId);
      scopedTeamIds = [scope.userId];
    }

    const fetchCompanies = async () => {
      const rows: CompanyFilterRow[] = [];
      const companyBatches =
        !scope.isAdmin && scope.companyIds.length > 0 ? chunkArray(scope.companyIds) : [null];

      const batchRows = await Promise.all(
        companyBatches.map(async (companyBatch) => {
          let query = client
            .from('companies')
            .select('id, nome_fantasia, nome_empresa, active')
            .order('nome_fantasia', { ascending: true })
            .limit(500);

          if (companyBatch) query = query.in('id', companyBatch);

          const { data, error } = await query;
          if (error) throw error;
          return (data || []) as CompanyFilterRow[];
        })
      );
      rows.push(...batchRows.flat());
      return rows;
    };

    const fetchUsers = async () => {
      const rows: UserFilterRow[] = [];
      const runQuery = async (filters?: {
        ids?: string[] | null;
        companyIds?: string[] | null;
      }) => {
        let query = client
          .from('users')
          .select(
            `
            id,
            nome_completo,
            email,
            company_id,
            active,
            uso_individual,
            user_types (name),
            companies (nome_fantasia, nome_empresa)
          `
          )
          .eq('active', true)
          .limit(1000);

        if (filters?.ids && filters.ids.length > 0) query = query.in('id', filters.ids);
        if (filters?.companyIds && filters.companyIds.length > 0)
          query = query.in('company_id', filters.companyIds);

        if (enforceCorporateOnly) query = query.eq('uso_individual', false);

        const { data, error } = await query;
        if (error) throw error;
        rows.push(...((data || []) as UserFilterRow[]));
      };

      if (!scope.isAdmin && scopedTeamIds.length > 0) {
        await Promise.all(chunkArray(scopedTeamIds).map((idBatch) => runQuery({ ids: idBatch })));
      } else if (!scope.isAdmin && companyIdsForUsers.length > 0) {
        await Promise.all(
          chunkArray(companyIdsForUsers).map((companyBatch) =>
            runQuery({ companyIds: companyBatch })
          )
        );
      } else {
        await runQuery();
      }

      return rows;
    };

    const payload = await getCachedReadModel({
      key: buildReadModelCacheKey('relatorios:base', {
        userId: user.id,
        requestedCompanyId,
        scopeCompanyIds: scope.companyIds,
        companyIdsForUsers,
        scopedTeamIds,
        isAdminByType,
        isGestorByType,
        isMasterByType,
        enforceCorporateOnly
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
        const [companiesRows, usersRows] = await Promise.all([fetchCompanies(), fetchUsers()]);

        const empresas = companiesRows.map((row) => ({
          id: String(row.id || ''),
          nome: String(row.nome_fantasia || row.nome_empresa || 'Empresa sem nome'),
          active: row.active !== false
        }));

        const vendedores = usersRows
          .filter((row) => {
            if (row?.active === false) return false;
            if (row?.uso_individual === true && String(row?.id || '') !== user.id) return false;
            if (isGestorByType && scopedTeamIds.length > 0) return true;
            if (String(row?.id || '') === user.id && scope.isVendedor) return true;
            return isRankingEligibleUser(row);
          })
          .map((row) => {
            const userType = Array.isArray(row?.user_types) ? row.user_types[0] : row?.user_types;
            const company = Array.isArray(row?.companies) ? row.companies[0] : row?.companies;

            return {
              id: String(row.id || ''),
              nome: String(row.nome_completo || row.email || 'Usuário sem nome'),
              company_id: String(row.company_id || ''),
              company_name: String(company?.nome_fantasia || company?.nome_empresa || ''),
              papel: String(userType?.name || '')
            };
          })
          .filter((row) => row.id)
          .sort((left, right) => PT_BR_COLLATOR.compare(left.nome, right.nome));

        return {
          empresas,
          vendedores,
          statusVendas: [
            { value: 'confirmada', label: 'Confirmada' },
            { value: 'pendente', label: 'Pendente' },
            { value: 'concluida', label: 'Concluída' },
            { value: 'cancelada', label: 'Cancelada' }
          ]
        };
      }
    });

    return json(payload, { headers: SHORT_DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar base analítica.');
  }
}
