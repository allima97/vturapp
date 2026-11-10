// Migrado para Hono de src/routes/api/v1/orcamentos/status/+server.ts — corpo IDÊNTICO ao original
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
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateQuoteReadModels } from '$lib/server/readModelCache';
import { isQuoteCreatorAllowed, resolveQuoteCreatorScope } from '$lib/server/orcamentos';

const MAX_ORCAMENTO_STATUS_BODY_BYTES = 16 * 1024;

type OrcamentoStatusBody = {
  status?: unknown;
  status_negociacao?: unknown;
  observacoes?: unknown;
};

type OrcamentoStatusUpdate = {
  updated_at: string;
  status?: unknown;
  status_negociacao?: unknown;
  last_interaction_notes?: unknown;
  last_interaction_at?: string;
};

export async function handleOrcamentosStatusPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_ORCAMENTO_STATUS_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Orcamentos'], 2, 'Sem permissao para alterar status.');
    }

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!id || !isUuid(id)) {
      return json({ error: 'ID invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as OrcamentoStatusBody)
        : {};

    const quoteScope = await resolveQuoteCreatorScope(client, scope, {
      companyId:
        event.url.searchParams.get('company_id') || event.url.searchParams.get('empresa_id'),
      vendedorRaw: event.url.searchParams.get('vendedor_id')
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

    const updateData: OrcamentoStatusUpdate = { updated_at: new Date().toISOString() };
    if (body.status_negociacao !== undefined) updateData.status_negociacao = body.status_negociacao;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.observacoes) {
      updateData.last_interaction_notes = body.observacoes;
      updateData.last_interaction_at = new Date().toISOString();
    }

    const { data, error } = await client
      .from('quote')
      .update(updateData)
      .eq('id', id)
      .select(
        'id, status, status_negociacao, last_interaction_notes, last_interaction_at, updated_at'
      )
      .single();
    if (error) throw error;

    invalidateQuoteReadModels({
      companyIds: quoteScope.companyIds,
      vendedorIds: quoteScope.creatorIds.length > 0 ? quoteScope.creatorIds : [user.id],
      userId: user.id
    });

    return json({ success: true, item: data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar status.');
  }
}
