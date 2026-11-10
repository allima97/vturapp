// Migrado para Hono de src/routes/api/v1/user/context/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { chunkArray, dedupeById, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

type CompanyContextRow = {
  id: string | null;
  nome_fantasia: string | null;
  nome_empresa: string | null;
};

export async function handleUserContextGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    const fetchEmpresas = async () => {
      if (scope.companyIds.length === 0) return { data: [], error: null };
      if (scope.companyIds.length <= QUERY_IN_BATCH_SIZE) {
        return client
          .from('companies')
          .select('id, nome_fantasia, nome_empresa')
          .in('id', scope.companyIds)
          .order('nome_fantasia', { ascending: true });
      }

      const batchRows = await Promise.all(
        chunkArray(scope.companyIds).map(async (batch) => {
          const result = await client
            .from('companies')
            .select('id, nome_fantasia, nome_empresa')
            .in('id', batch)
            .order('nome_fantasia', { ascending: true });
          if (result.error) return result;
          return { data: result.data || [], error: null };
        })
      );

      const failedBatch = batchRows.find((result) => result.error);
      if (failedBatch) return failedBatch;
      const rows = batchRows.flatMap((result) => result.data || []);

      return {
        data: dedupeById(rows).sort((left, right) =>
          PT_BR_COLLATOR.compare(
            String(left?.nome_fantasia || left?.nome_empresa || ''),
            String(right?.nome_fantasia || right?.nome_empresa || '')
          )
        ),
        error: null
      };
    };

    const payload = await getCachedReadModel({
      key: buildReadModelCacheKey('user-context', {
        userId: user.id,
        companyId: scope.companyId,
        companyIds: scope.companyIds,
        papel: scope.papel
      }),
      tags: [
        READ_MODEL_TAGS.users,
        ...scopeCacheTags({ companyIds: scope.companyIds, userId: user.id })
      ],
      ttlMs: 60_000,
      staleTtlMs: 300_000,
      loader: async () => {
        const empresas = await fetchEmpresas();

        if (empresas.error) throw empresas.error;

        return {
          success: true,
          user_id: user.id,
          company_id: scope.companyId,
          company_ids: scope.companyIds,
          empresas: (empresas.data || []).map((row: any) => ({
            id: String(row.id || ''),
            nome: String(row.nome_fantasia || row.nome_empresa || 'Empresa sem nome')
          })),
          nome: scope.nome,
          email: scope.email,
          papel: scope.papel,
          isAdmin: scope.isAdmin,
          isMaster: scope.isMaster,
          isFinanceiro: scope.isFinanceiro,
          isGestor: scope.isGestor,
          isVendedor: scope.isVendedor
        };
      }
    });

    return json(payload, { headers: DYNAMIC_READ_HEADERS });
  } catch (err: unknown) {
    return toErrorResponse(err, 'Erro ao carregar contexto do usuário.');
  }
}
