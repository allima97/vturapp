// Migrado para Hono de src/routes/api/v1/operacao/documentos-viagens/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  NO_MATCH_COMPANY_ID,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { cleanStringSet, chunkArray, dedupeById, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

type DocumentoViagemRow = {
  id?: string | null;
  created_at?: string | null;
  file_name?: string | null;
  display_name?: string | null;
  title?: string | null;
};

export async function handleOperacaoDocumentosViagensGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['operacao_documentos_viagens', 'documentos_viagens', 'operacao'],
        1,
        'Sem acesso a Documentos de Viagens.'
      );
    }
    const allowedCompanyIds = resolveScopedCompanyIds(scope);

    const { searchParams } = event.url;
    const q = String(searchParams.get('q') || searchParams.get('busca') || '').trim();

    const buildQuery = (companyIdsFilter?: string[]) => {
      let query = client
        .from('documentos_viagens')
        .select(
          `
          id, file_name, display_name, title, template_text, template_fields, storage_bucket, storage_path, mime_type, size_bytes, created_at,
          uploader:users!uploaded_by(id, nome_completo, email)
        `
        )
        .order('created_at', { ascending: false })
        .limit(200);

      if (companyIdsFilter && companyIdsFilter.length > 0) {
        query = query.in('company_id', companyIdsFilter);
      }

      return query;
    };

    const fetchRows = async () => {
      if (scope.isAdmin) return buildQuery();
      if (allowedCompanyIds[0] === NO_MATCH_COMPANY_ID) return { data: [], error: null };
      if (allowedCompanyIds.length <= QUERY_IN_BATCH_SIZE) return buildQuery(allowedCompanyIds);

      const rows: DocumentoViagemRow[] = [];
      for (const batch of chunkArray(allowedCompanyIds)) {
        const result = await buildQuery(batch);
        if (result.error) return { data: null, error: result.error } as typeof result;
        rows.push(...(result.data || []));
      }

      return {
        data: dedupeById(rows)
          .sort((left, right) =>
            String(right?.created_at || '').localeCompare(String(left?.created_at || ''))
          )
          .slice(0, 200),
        error: null
      };
    };

    const { data, error: queryError } = await fetchRows();
    if (queryError) throw queryError;

    let items = data || [];
    if (q) {
      const qLower = q.toLowerCase();
      items = items.filter((item: DocumentoViagemRow) =>
        [item.file_name, item.display_name, item.title].join(' ').toLowerCase().includes(qLower)
      );
    }

    return json({ items }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar documentos de viagens.');
  }
}

export async function handleOperacaoDocumentosViagensDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['operacao_documentos_viagens', 'documentos_viagens', 'operacao'],
        4,
        'Sem permissão para excluir documentos.'
      );
    }

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    // Busca o documento para deletar do storage também
    const { data: doc, error: fetchErr } = await client
      .from('documentos_viagens')
      .select('company_id, storage_bucket, storage_path')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!doc)
      return json(
        { error: 'Documento não encontrado.' },
        { status: 404, headers: NO_STORE_HEADERS }
      );

    if (!scope.isAdmin) {
      const targetCompanyId = String(
        (doc as { company_id?: string | null })?.company_id || ''
      ).trim();
      const allowedCompanyIds = resolveScopedCompanyIds(scope, targetCompanyId);
      const allowedCompanySet = cleanStringSet(allowedCompanyIds);
      if (
        !targetCompanyId ||
        allowedCompanyIds[0] === NO_MATCH_COMPANY_ID ||
        !allowedCompanySet.has(targetCompanyId)
      ) {
        return json(
          { error: 'Documento fora do escopo da empresa.' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }
    }

    if (doc?.storage_bucket && doc?.storage_path) {
      await client.storage.from(doc.storage_bucket).remove([doc.storage_path]);
    }

    const { error: deleteError } = await client.from('documentos_viagens').delete().eq('id', id);
    if (deleteError) throw deleteError;

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir documento.');
  }
}
