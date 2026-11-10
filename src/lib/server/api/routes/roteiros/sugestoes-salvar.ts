// Migrado para Hono de src/routes/api/v1/roteiros/sugestoes-salvar/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  sanitizePostgrestSearchTerm,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';

const MAX_ROTEIRO_SUGESTAO_BODY_BYTES = 16 * 1024;

type RoteiroSugestaoBody = {
  tipo?: unknown;
  valor?: unknown;
};

type RoteiroSugestaoRow = {
  id?: string | null;
  uso_count?: number | null;
};

function readRoteiroSugestaoBody(value: unknown): RoteiroSugestaoBody | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  return {
    tipo: body.tipo,
    valor: body.valor
  };
}

export async function handleRoteirosSugestoesSalvarPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_ROTEIRO_SUGESTAO_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    const body = readRoteiroSugestaoBody(bodyResult.data);
    if (!body || !body.tipo || !body.valor) {
      return new Response('Dados invalidos.', { status: 400, headers: NO_STORE_HEADERS });
    }

    const tipo = String(body.tipo).trim().slice(0, 60);
    const valor = String(body.valor).trim().slice(0, 160);
    if (!tipo || !valor)
      return new Response('Dados invalidos.', { status: 400, headers: NO_STORE_HEADERS });
    const valorBusca = sanitizePostgrestSearchTerm(valor, 160);
    if (!valorBusca)
      return new Response('Dados invalidos.', { status: 400, headers: NO_STORE_HEADERS });

    const companyId = scope.companyId;

    // Verifica duplicata (case-insensitive)
    const { data: existing } = await client
      .from('roteiro_sugestoes')
      .select('id, uso_count')
      .eq('company_id', companyId)
      .eq('tipo', tipo)
      .ilike('valor', valorBusca)
      .maybeSingle();

    if (existing) {
      // Já existe – incrementa contagem de uso
      const existingSugestao = existing as RoteiroSugestaoRow;
      await client
        .from('roteiro_sugestoes')
        .update({
          uso_count: (existingSugestao.uso_count || 1) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingSugestao.id);

      return json({ ok: true, novo: false }, { headers: NO_STORE_HEADERS });
    }

    // Insere novo
    const { error } = await client.from('roteiro_sugestoes').insert({
      company_id: companyId,
      tipo,
      valor,
      uso_count: 1
    });
    if (error) throw error;

    return json({ ok: true, novo: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar sugestao.');
  }
}
