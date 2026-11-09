// Migrado para Hono de src/routes/api/v1/operacao/preferencias/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { complementoDestinoOperacional } from '$lib/server/destinoOperacional';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  invalidatePreferenceReadModels,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';

const MAX_OPERACAO_PREFERENCIA_BODY_BYTES = 64 * 1024;

type JsonBody = Record<string, unknown>;

function ensurePreferenciasAccess(
  scope: Awaited<ReturnType<typeof resolveUserScope>>,
  minLevel: number
) {
  if (!scope.isAdmin) {
    ensureModuloAccess(
      scope,
      ['operacao_preferencias'],
      minLevel,
      minLevel >= 3
        ? 'Sem permissão para gerenciar preferências.'
        : 'Sem acesso a Minhas Preferências.'
    );
  }
}

export async function handleOperacaoPreferenciasGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    ensurePreferenciasAccess(scope, 1);

    const result = await getCachedReadModel({
      key: buildReadModelCacheKey('operacao:preferencias', {
        userId: scope.userId,
        companyId: scope.companyId
      }),
      tags: [
        READ_MODEL_TAGS.preferences,
        READ_MODEL_TAGS.catalog,
        ...scopeCacheTags({
          userId: scope.userId,
          companyIds: scope.companyId ? [scope.companyId] : []
        })
      ],
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        const { data, error: queryError } = await client
          .from('minhas_preferencias')
          .select(
            `
            id, tipo_produto_id, cidade_id, nome, localizacao, classificacao, observacao, created_at,
            cidade:cidades!cidade_id(id, nome),
            tipo_produto:tipo_produtos!tipo_produto_id(id, nome)
          `
          )
          .eq('created_by', scope.userId)
          .order('nome')
          .limit(200);

        if (queryError) throw queryError;

        const { data: tipos, error: tiposError } = await client
          .from('tipo_produtos')
          .select('id, nome, tipo')
          .eq('ativo', true)
          .order('nome')
          .limit(100);

        if (tiposError) throw tiposError;

        return { items: data || [], tipos: tipos || [] };
      }
    });

    return json(result, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar preferências.');
  }
}

export async function handleOperacaoPreferenciasPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(
      event.request,
      MAX_OPERACAO_PREFERENCIA_BODY_BYTES
    );
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    const body =
      bodyResult.data && typeof bodyResult.data === 'object' ? (bodyResult.data as JsonBody) : {};
    const { id, tipo_produto_id, cidade_id, nome, localizacao, classificacao, observacao } = body;
    const idValue = String(id || '').trim();
    const tipoProdutoId = String(tipo_produto_id || '').trim();
    const cidadeId = String(cidade_id || '').trim();
    ensurePreferenciasAccess(scope, isUuid(idValue) ? 3 : 2);

    if (!scope.companyId && !scope.usoIndividual && !scope.isAdmin)
      return json({ error: 'Empresa inválida.' }, { status: 400, headers: NO_STORE_HEADERS });

    if (!String(nome || '').trim())
      return json({ error: 'Nome obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });

    const destinoGeografico = await complementoDestinoOperacional(
      body,
      event.platform?.env?.DB,
      event.platform?.env?.GEO_DB
    );
    if (!destinoGeografico.ok)
      return json(
        { error: destinoGeografico.error },
        { status: destinoGeografico.status, headers: NO_STORE_HEADERS }
      );
    const payload = {
      created_by: scope.userId,
      company_id: scope.companyId,
      tipo_produto_id: isUuid(tipoProdutoId) ? tipoProdutoId : null,
      cidade_id: isUuid(cidadeId) ? cidadeId : null,
      ...destinoGeografico.campos,
      nome: String(nome).trim(),
      localizacao: String(localizacao || '').trim() || null,
      classificacao: String(classificacao || '').trim() || null,
      observacao: String(observacao || '').trim() || null
    };

    let result;
    if (isUuid(idValue)) {
      const { data, error: updateError } = await client
        .from('minhas_preferencias')
        .update(payload)
        .eq('id', idValue)
        .eq('created_by', scope.userId)
        .select('id')
        .single();
      if (updateError) throw updateError;
      result = data;
    } else {
      const { data, error: insertError } = await client
        .from('minhas_preferencias')
        .insert(payload)
        .select('id')
        .single();
      if (insertError) throw insertError;
      result = data;
    }

    invalidatePreferenceReadModels({
      companyIds: scope.companyId ? [scope.companyId] : [],
      userId: scope.userId
    });
    return json({ ok: true, id: result?.id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar preferência.');
  }
}

export async function handleOperacaoPreferenciasDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    ensurePreferenciasAccess(scope, 4);

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { error: deleteError } = await client
      .from('minhas_preferencias')
      .delete()
      .eq('id', id)
      .eq('created_by', scope.userId);
    if (deleteError) throw deleteError;

    invalidatePreferenceReadModels({
      companyIds: scope.companyId ? [scope.companyId] : [],
      userId: scope.userId
    });
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir preferência.');
  }
}

export async function handleOperacaoPreferenciasPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(
      event.request,
      MAX_OPERACAO_PREFERENCIA_BODY_BYTES
    );
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    const body =
      bodyResult.data && typeof bodyResult.data === 'object' ? (bodyResult.data as JsonBody) : {};
    const { action } = body;
    const actionValue = String(action || '').trim();
    ensurePreferenciasAccess(scope, actionValue === 'accept' ? 1 : 3);

    if (actionValue === 'share') {
      const { preferencia_id, shared_with_email } = body;
      const preferenciaId = String(preferencia_id || '').trim();
      const sharedWithEmail = String(shared_with_email || '').trim();
      if (!isUuid(preferenciaId))
        return json(
          { error: 'preferencia_id invalido.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      if (!sharedWithEmail)
        return json(
          { error: 'shared_with_email obrigatorio.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      if (!scope.companyId)
        return json({ error: 'Empresa inválida.' }, { status: 400, headers: NO_STORE_HEADERS });

      const { data: preferencia, error: preferenciaError } = await client
        .from('minhas_preferencias')
        .select('id')
        .eq('id', preferenciaId)
        .eq('company_id', scope.companyId)
        .eq('created_by', scope.userId)
        .maybeSingle();

      if (preferenciaError) throw preferenciaError;
      if (!preferencia)
        return json(
          { error: 'Preferência não encontrada.' },
          { status: 404, headers: NO_STORE_HEADERS }
        );

      const { data: targetUser } = await client
        .from('users')
        .select('id')
        .eq('email', sharedWithEmail.toLowerCase())
        .eq('company_id', scope.companyId)
        .eq('active', true)
        .maybeSingle();
      if (!targetUser)
        return json(
          { error: 'Usuario nao encontrado.' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      if (String(targetUser.id) === scope.userId)
        return json(
          { error: 'Não é possível compartilhar com você mesmo.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );

      const payload = {
        company_id: scope.companyId,
        preferencia_id: preferenciaId,
        shared_by: scope.userId,
        shared_with: targetUser.id,
        status: 'pending'
      };

      const { error: shareError } = await client.from('minhas_preferencias_shares').insert(payload);
      if (shareError) throw shareError;

      invalidatePreferenceReadModels({
        companyIds: [scope.companyId],
        userId: scope.userId
      });
      return json({ ok: true }, { headers: NO_STORE_HEADERS });
    }

    if (actionValue === 'accept') {
      const { share_id } = body;
      const shareId = String(share_id || '').trim();
      if (!isUuid(shareId))
        return json({ error: 'share_id invalido.' }, { status: 400, headers: NO_STORE_HEADERS });

      const { data, error } = await client
        .from('minhas_preferencias_shares')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', shareId)
        .eq('shared_with', scope.userId)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data)
        return json(
          { error: 'Convite não encontrado.' },
          { status: 404, headers: NO_STORE_HEADERS }
        );

      invalidatePreferenceReadModels({
        companyIds: scope.companyId ? [scope.companyId] : [],
        userId: scope.userId
      });
      return json({ ok: true }, { headers: NO_STORE_HEADERS });
    }

    if (actionValue === 'revoke') {
      const { share_id } = body;
      const shareId = String(share_id || '').trim();
      if (!isUuid(shareId))
        return json({ error: 'share_id invalido.' }, { status: 400, headers: NO_STORE_HEADERS });

      const { data, error } = await client
        .from('minhas_preferencias_shares')
        .update({ status: 'revoked', revoked_at: new Date().toISOString() })
        .eq('id', shareId)
        .eq('shared_by', scope.userId)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data)
        return json(
          { error: 'Compartilhamento não encontrado.' },
          { status: 404, headers: NO_STORE_HEADERS }
        );

      invalidatePreferenceReadModels({
        companyIds: scope.companyId ? [scope.companyId] : [],
        userId: scope.userId
      });
      return json({ ok: true }, { headers: NO_STORE_HEADERS });
    }

    return json({ error: 'Acao invalida.' }, { status: 400, headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao gerenciar compartilhamento.');
  }
}
