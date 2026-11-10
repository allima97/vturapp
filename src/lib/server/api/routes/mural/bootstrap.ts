// Migrado para Hono de src/routes/api/v1/mural/bootstrap/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import {
  privateJsonResponse,
  requireMuralScope,
  fetchRecados,
  fetchUsuariosEmpresa,
  noStoreTextResponse
} from '../../../../../routes/api/v1/mural/_shared';
import { isUuid, logServerError } from '$lib/server/v1';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { uniqueCleanStrings } from '$lib/utils/array';

type CompanyOption = {
  id: string;
  nome_fantasia: string;
  status: string;
};

type CompanyRow = {
  id?: string | null;
  nome_fantasia?: string | null;
};

export async function handleMuralBootstrapGet(event: RequestEvent) {
  try {
    const { client, user, scope } = await requireMuralScope(event);
    const queryCompanyId = String(event.url.searchParams.get('company_id') || '').trim();

    let empresas: CompanyOption[] = [];
    const allowedCompanyIds = uniqueCleanStrings(scope.companyIds || []).filter(isUuid);
    let selectedCompanyId = String(scope.companyId || allowedCompanyIds[0] || '').trim();

    if (!scope.isAdmin && allowedCompanyIds.length > 0) {
      const { data: rows, error } = await client
        .from('companies')
        .select('id, nome_fantasia')
        .in('id', allowedCompanyIds)
        .order('nome_fantasia', { ascending: true });
      if (error) throw error;

      empresas = ((rows || []) as CompanyRow[])
        .map((v) => ({
          id: String(v?.id || ''),
          nome_fantasia: String(v?.nome_fantasia || 'Empresa'),
          status: 'approved'
        }))
        .filter((e) => e.id);

      const approvedIds = new Set<string>();
      for (const empresa of empresas) {
        approvedIds.add(empresa.id);
      }
      if (queryCompanyId && approvedIds.has(queryCompanyId)) {
        selectedCompanyId = queryCompanyId;
      } else if (!selectedCompanyId || !approvedIds.has(selectedCompanyId)) {
        selectedCompanyId = empresas[0]?.id || '';
      }
    }

    const payload = await getCachedReadModel({
      key: buildReadModelCacheKey('mural:bootstrap', {
        userId: user.id,
        selectedCompanyId
      }),
      tags: [
        READ_MODEL_TAGS.mural,
        READ_MODEL_TAGS.users,
        ...scopeCacheTags({
          userId: user.id,
          companyIds: selectedCompanyId ? [selectedCompanyId] : []
        })
      ],
      ttlMs: 30_000,
      staleTtlMs: 120_000,
      loader: async () => {
        let usuariosEmpresa: unknown[] = [];
        let recados: unknown[] = [];
        let supportsAttachments = true;

        if (selectedCompanyId) {
          const [usuarios, recadosResp] = await Promise.all([
            fetchUsuariosEmpresa(client, selectedCompanyId),
            fetchRecados(client, selectedCompanyId)
          ]);
          usuariosEmpresa = usuarios;
          recados = recadosResp.recados;
          supportsAttachments = recadosResp.supportsAttachments;
        }

        return {
          userId: user.id,
          userTypeName: scope.tipoNome,
          companyId: selectedCompanyId || null,
          empresas,
          usuariosEmpresa,
          recados,
          supportsAttachments
        };
      }
    });

    return privateJsonResponse(payload);
  } catch (e: unknown) {
    logServerError('[mural/bootstrap] falha ao carregar mural', e);
    return noStoreTextResponse('Erro ao carregar mural.', 500);
  }
}
