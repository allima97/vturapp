// Migrado para Hono de src/routes/api/v1/preferencias/save/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { isUuid } from '$lib/server/v1';
import { readTextBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  buildNoStoreJsonResponse,
  buildNoStoreTextResponse,
  logServerError,
  requirePreferenciasScope,
  safeJsonParse
} from '../../../../../routes/api/v1/preferencias/_shared';
import { invalidatePreferenceReadModels } from '$lib/server/readModelCache';
import { complementoDestinoOperacional } from '$lib/server/destinoOperacional';

const MAX_PREFERENCIAS_SAVE_BODY_BYTES = 64 * 1024;

export async function handlePreferenciasSavePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const textResult = await readTextBodyLimited(event.request, MAX_PREFERENCIAS_SAVE_BODY_BYTES);
    if (!textResult.ok) return textResult.response;

    const rawBody = textResult.text;
    if (rawBody.length > MAX_PREFERENCIAS_SAVE_BODY_BYTES) {
      return buildNoStoreTextResponse('Payload muito grande.', 413);
    }
    const body = safeJsonParse(rawBody) as Record<string, unknown>;
    const id = String(body?.id || '').trim();
    const isUpdate = Boolean(id);
    const { client, user, scope } = await requirePreferenciasScope(event, isUpdate ? 3 : 2);

    const companyId = scope.companyId;
    if (!companyId && !scope.usoIndividual && !scope.isAdmin)
      return buildNoStoreTextResponse('Empresa inválida.', 400);

    const nome = String(body?.nome || '').trim();
    if (!nome) return buildNoStoreTextResponse('nome obrigatorio.', 400);

    const cidadeRaw = String(body?.cidade_id || '').trim();
    const tipoProdutoRaw = String(body?.tipo_produto_id || '').trim();
    const cidadeId = isUuid(cidadeRaw) ? cidadeRaw : null;
    const tipoProdutoId = isUuid(tipoProdutoRaw) ? tipoProdutoRaw : null;

    const destinoGeografico = await complementoDestinoOperacional(
      body as object,
      event.platform?.env?.DB,
      event.platform?.env?.GEO_DB
    );
    if (!destinoGeografico.ok)
      return buildNoStoreJsonResponse({ error: destinoGeografico.error }, destinoGeografico.status);
    const payload: Record<string, unknown> = {
      tipo_produto_id: tipoProdutoId,
      cidade_id: cidadeId,
      ...destinoGeografico.campos,
      nome,
      localizacao: String(body?.localizacao || '').trim() || null,
      classificacao: String(body?.classificacao || '').trim() || null,
      observacao: String(body?.observacao || '').trim() || null,
      updated_at: new Date().toISOString(),
      updated_by: user.id
    };

    if (!isUpdate) {
      const insertPayload = {
        ...payload,
        company_id: companyId,
        created_by: user.id,
        updated_at: null,
        updated_by: null
      };
      const { data, error } = await client
        .from('minhas_preferencias')
        .insert(insertPayload)
        .select(
          'id, company_id, created_by, tipo_produto_id, cidade_id, nome, localizacao, classificacao, observacao, created_at, updated_at'
        )
        .single();
      if (error) throw error;

      invalidatePreferenceReadModels({
        companyIds: companyId ? [companyId] : [],
        userId: user.id
      });
      return buildNoStoreJsonResponse({ ok: true, item: data });
    }

    if (!isUuid(id)) return buildNoStoreTextResponse('id invalido.', 400);

    let updateQuery = client.from('minhas_preferencias').update(payload).eq('id', id);
    if (!scope.isAdmin) updateQuery = updateQuery.eq('created_by', user.id);

    const { data, error } = await updateQuery
      .select(
        'id, company_id, created_by, tipo_produto_id, cidade_id, nome, localizacao, classificacao, observacao, created_at, updated_at'
      )
      .maybeSingle();
    if (error) throw error;
    if (!data) return buildNoStoreTextResponse('Preferência não encontrada.', 404);

    invalidatePreferenceReadModels({
      companyIds: companyId ? [companyId] : [],
      userId: user.id
    });
    return buildNoStoreJsonResponse({ ok: true, item: data });
  } catch (err) {
    logServerError('[preferencias/save] falha ao salvar preferencia', err);
    return buildNoStoreTextResponse('Erro ao salvar preferência.', 500);
  }
}
