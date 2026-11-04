// Migrado para Hono de src/routes/api/v1/orcamentos/delete/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateQuoteReadModels } from '$lib/server/readModelCache';
import { isQuoteCreatorAllowed, resolveQuoteCreatorScope } from '$lib/server/orcamentos';

const MAX_ORCAMENTO_DELETE_BODY_BYTES = 8 * 1024;

type OrcamentoDeleteBody = {
  id?: unknown;
};

export async function handleOrcamentosDeletePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_ORCAMENTO_DELETE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Orcamentos'], 4, 'Sem acesso para excluir Orcamentos.');
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as OrcamentoDeleteBody)
        : {};
    const id = String(body?.id || '').trim();
    if (!id || !isUuid(id)) {
      return json({ error: 'ID invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const quoteScope = await resolveQuoteCreatorScope(client, scope, {
      companyId:
        event.url.searchParams.get('company_id') || event.url.searchParams.get('empresa_id')
    });

    const { data: quote, error: quoteError } = await client
      .from('quote')
      .select('id, created_by')
      .eq('id', id)
      .maybeSingle();
    if (quoteError) throw quoteError;
    if (!quote || !isQuoteCreatorAllowed(quoteScope, quote.created_by)) {
      return json(
        { error: 'Orcamento nao encontrado.' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const { error } = await client.from('quote').delete().eq('id', id);
    if (error) throw error;

    invalidateQuoteReadModels({
      companyIds: quoteScope.companyIds,
      vendedorIds: quoteScope.creatorIds.length > 0 ? quoteScope.creatorIds : [user.id],
      userId: user.id
    });

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir orcamento.');
  }
}
