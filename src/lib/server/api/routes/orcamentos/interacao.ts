// Migrado para Hono de src/routes/api/v1/orcamentos/interacao/+server.ts — corpo IDÊNTICO ao original
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
import { invalidateQuoteReadModels } from '$lib/server/readModelCache';
import { isQuoteCreatorAllowed, resolveQuoteCreatorScope } from '$lib/server/orcamentos';

const MAX_ORCAMENTO_INTERACAO_BODY_BYTES = 32 * 1024;
const errorResponse = (message: string, status: number) =>
  json({ error: message }, { status, headers: NO_STORE_HEADERS });

type OrcamentoInteracaoBody = {
  observacoes?: unknown;
  notas?: unknown;
  status?: unknown;
};

type OrcamentoInteracaoUpdate = {
  last_interaction_at: string;
  last_interaction_notes: unknown | null;
  updated_at: string;
  status_negociacao?: unknown;
};

export async function handleOrcamentosInteracaoPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_ORCAMENTO_INTERACAO_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Orcamentos'], 2, 'Sem permissao para registrar interacoes.');
    }

    const quoteId = String(event.url.searchParams.get('quote_id') || '').trim();
    if (!quoteId || !isUuid(quoteId)) {
      return errorResponse('Quote ID invalido.', 400);
    }

    const quoteScope = await resolveQuoteCreatorScope(client, scope, {
      companyId:
        event.url.searchParams.get('company_id') || event.url.searchParams.get('empresa_id')
    });

    const { data: quote, error: quoteError } = await client
      .from('quote')
      .select('id, created_by')
      .eq('id', quoteId)
      .maybeSingle();
    if (quoteError) throw quoteError;
    if (!quote || !isQuoteCreatorAllowed(quoteScope, quote.created_by)) {
      return errorResponse('Orcamento nao encontrado.', 404);
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as OrcamentoInteracaoBody)
        : {};
    const updateData: OrcamentoInteracaoUpdate = {
      last_interaction_at: new Date().toISOString(),
      last_interaction_notes: body.observacoes || body.notas || null,
      updated_at: new Date().toISOString()
    };
    if (body.status) updateData.status_negociacao = body.status;

    const { data, error } = await client
      .from('quote')
      .update(updateData)
      .eq('id', quoteId)
      .select('id, status_negociacao, last_interaction_at, last_interaction_notes')
      .single();
    if (error) throw error;

    invalidateQuoteReadModels({
      companyIds: quoteScope.companyIds,
      vendedorIds: quoteScope.creatorIds.length > 0 ? quoteScope.creatorIds : [user.id],
      userId: user.id
    });

    return json({ success: true, interacao: data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao registrar interacao.');
  }
}

export async function handleOrcamentosInteracaoGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Orcamentos'], 1, 'Sem acesso a interacoes.');
    }

    const quoteId = String(event.url.searchParams.get('quote_id') || '').trim();
    if (!quoteId || !isUuid(quoteId)) {
      return errorResponse('Quote ID invalido.', 400);
    }

    const quoteScope = await resolveQuoteCreatorScope(client, scope, {
      companyId:
        event.url.searchParams.get('company_id') || event.url.searchParams.get('empresa_id')
    });

    const { data, error } = await client
      .from('quote')
      .select(
        'id, created_by, status_negociacao, last_interaction_at, last_interaction_notes, updated_at'
      )
      .eq('id', quoteId)
      .maybeSingle();
    if (error) throw error;
    if (!data || !isQuoteCreatorAllowed(quoteScope, data.created_by)) {
      return json({ success: true, interacoes: [] }, { headers: DYNAMIC_READ_HEADERS });
    }

    const interacoes = data?.last_interaction_at
      ? [
          {
            id: data.id,
            quote_id: quoteId,
            tipo: 'status',
            observacoes: data.last_interaction_notes,
            status: data.status_negociacao,
            created_at: data.last_interaction_at
          }
        ]
      : [];

    return json({ success: true, interacoes }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar interacoes.');
  }
}
