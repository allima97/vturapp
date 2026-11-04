// Migrado para Hono de src/routes/api/v1/operacao/campanhas/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  ensureModuloAccess,
  getAdminClient,
  hasModuloAccess,
  isUuid,
  requireAuthenticatedUser,
  NO_MATCH_COMPANY_ID,
  resolveScopedCompanyId,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { cleanStringSet, chunkArray, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

const MAX_CAMPANHA_BODY_BYTES = 128 * 1024;

type JsonBody = Record<string, unknown>;
type CampanhaRow = {
  id?: string | null;
  data_campanha?: string | null;
  [key: string]: unknown;
};
type ExistingCampanhaRow = {
  company_id?: string | null;
};

function canManageCampanhas(scope: Awaited<ReturnType<typeof resolveUserScope>>) {
  return Boolean(
    scope.isAdmin ||
      scope.isMaster ||
      scope.isGestor ||
      (scope.isFinanceiro && hasModuloAccess(scope, ['Campanhas'], 2))
  );
}

export async function handleOperacaoCampanhasGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Campanhas'], 1, 'Sem acesso a Campanhas.');
    }

    const { searchParams } = event.url;
    const status = String(searchParams.get('status') || '').trim();
    const companyIds = resolveScopedCompanyIds(
      scope,
      searchParams.get('company_id') || searchParams.get('empresa_id')
    );

    if (!scope.isAdmin && companyIds.length === 0) {
      return json({ items: [], can_write: false }, { headers: DYNAMIC_READ_HEADERS });
    }

    const buildQuery = (companyIdsFilter?: string[]) => {
      let query = client
        .from('campanhas')
        .select('id, company_id, titulo, imagem_url, imagem_path, link_url, link_instagram, link_facebook, data_campanha, validade_ate, regras, status, created_at, arquivada_em')
        .order('data_campanha', { ascending: false })
        .limit(200);

      if (!scope.isAdmin && companyIdsFilter && companyIdsFilter.length === 1) query = query.eq('company_id', companyIdsFilter[0]);
      else if (!scope.isAdmin && companyIdsFilter && companyIdsFilter.length > 1) query = query.in('company_id', companyIdsFilter);
      if (status) query = query.eq('status', status);

      return query;
    };

    const fetchItems = async () => {
      if (scope.isAdmin || companyIds.length <= QUERY_IN_BATCH_SIZE) {
        const { data, error: queryError } = await buildQuery(companyIds);
        if (queryError) throw queryError;
        return data || [];
      }

      const rows: CampanhaRow[] = [];
      for (const batch of chunkArray(companyIds)) {
        const { data, error: queryError } = await buildQuery(batch);
        if (queryError) throw queryError;
        rows.push(...(data || []));
      }

      const rowsById = new Map<string, CampanhaRow>();
      for (const row of rows) {
        rowsById.set(String(row?.id || ''), row);
      }

      return Array.from(rowsById.values())
        .sort((left, right) =>
          String(right?.data_campanha || '').localeCompare(String(left?.data_campanha || ''))
        )
        .slice(0, 200);
    };

    return json({
      items: await fetchItems(),
      can_write: canManageCampanhas(scope) && (scope.isAdmin || hasModuloAccess(scope, ['Campanhas'], 2))
    }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar campanhas.');
  }
}

export async function handleOperacaoCampanhasPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CAMPANHA_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Campanhas'], 2, 'Sem permissão para salvar campanhas.');
    }

    if (!canManageCampanhas(scope)) {
      return json({ error: 'Somente gestor/master podem gerenciar campanhas.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as JsonBody)
        : {};
    const { id, titulo, imagem_url, link_url, link_instagram, link_facebook, data_campanha, validade_ate, regras, status } = body;
    const requestedCompanyId = String(body?.company_id || body?.empresa_id || '').trim();
    const companyIds = resolveScopedCompanyIds(scope, requestedCompanyId || null);
    const companyIdSet = cleanStringSet(companyIds);

    if (!String(titulo || '').trim()) return json({ error: 'Título obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });
    if (!String(data_campanha || '').trim()) return json({ error: 'Data da campanha obrigatória.' }, { status: 400, headers: NO_STORE_HEADERS });
    if (!scope.isAdmin && (companyIds.length === 0 || companyIds[0] === NO_MATCH_COMPANY_ID)) {
      return json({ error: 'Empresa fora do escopo.' }, { status: 403, headers: NO_STORE_HEADERS });
    }
    const idValue = String(id || '').trim();
    if (!scope.isAdmin && !idValue && !requestedCompanyId && companyIds.length > 1) {
      return json({ error: 'Selecione a empresa para criar a campanha.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    let companyId = scope.isAdmin
      ? requestedCompanyId || scope.companyId
      : resolveScopedCompanyId(scope, requestedCompanyId || null);

    if (!scope.isAdmin && isUuid(idValue)) {
      const { data: existing, error: existingError } = await client
        .from('campanhas')
        .select('id, company_id')
        .eq('id', idValue)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return json({ error: 'Campanha não encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });
      const existingCompanyId = String((existing as ExistingCampanhaRow)?.company_id || '').trim();
      if (!existingCompanyId || !companyIdSet.has(existingCompanyId)) {
        return json({ error: 'Campanha fora do escopo da empresa.' }, { status: 403, headers: NO_STORE_HEADERS });
      }
      companyId = existingCompanyId;
    }

    if (!companyId) {
      return json({ error: 'Empresa obrigatória para salvar campanha.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const payload = {
      company_id: companyId,
      titulo: String(titulo).trim(),
      imagem_url: String(imagem_url || '').trim() || null,
      link_url: String(link_url || '').trim() || null,
      link_instagram: String(link_instagram || '').trim() || null,
      link_facebook: String(link_facebook || '').trim() || null,
      data_campanha: String(data_campanha).trim(),
      validade_ate: String(validade_ate || '').trim() || null,
      regras: String(regras || '').trim() || null,
      status: String(status || 'ativa').trim()
    };

    let result;
    if (isUuid(idValue)) {
      const { data, error: updateError } = await client.from('campanhas').update(payload).eq('id', idValue).select('id').single();
      if (updateError) throw updateError;
      result = data;
    } else {
      const { data, error: insertError } = await client.from('campanhas').insert(payload).select('id').single();
      if (insertError) throw insertError;
      result = data;
    }

    return json({ ok: true, id: result?.id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar campanha.');
  }
}

export async function handleOperacaoCampanhasDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Campanhas'], 4, 'Sem permissão para excluir campanhas.');
    }

    if (!canManageCampanhas(scope)) {
      return json({ error: 'Sem permissão.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id)) return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const companyIds = resolveScopedCompanyIds(
      scope,
      event.url.searchParams.get('company_id') || event.url.searchParams.get('empresa_id')
    );
    const companyIdSet = cleanStringSet(companyIds);

    const { data: existing, error: existingError } = await client
      .from('campanhas')
      .select('id, company_id')
      .eq('id', id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return json({ error: 'Campanha não encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });

    const existingCompanyId = String((existing as ExistingCampanhaRow)?.company_id || '').trim();
    if (!scope.isAdmin && (!existingCompanyId || !companyIdSet.has(existingCompanyId))) {
      return json({ error: 'Campanha fora do escopo da empresa.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const { error: deleteError } = await client.from('campanhas').delete().eq('id', id);
    if (deleteError) throw deleteError;

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir campanha.');
  }
}
