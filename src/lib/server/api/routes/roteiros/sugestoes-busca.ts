// Migrado para Hono de src/routes/api/v1/roteiros/sugestoes-busca/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  sanitizePostgrestSearchTerm,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';

export async function handleRoteirosSugestoesBuscaGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    const companyId = scope.companyId;
    const tipo =
      String(event.url.searchParams.get('tipo') || '')
        .trim()
        .slice(0, 60) || null;
    const q = sanitizePostgrestSearchTerm(event.url.searchParams.get('q'), 80);

    let query = client
      .from('roteiro_sugestoes')
      .select('tipo, valor')
      .order('uso_count', { ascending: false })
      .limit(200);

    if (companyId) {
      query = query.eq('company_id', companyId);
    } else {
      query = query.is('company_id', null);
    }

    if (tipo) query = query.eq('tipo', tipo);
    if (q.length >= 2) query = query.ilike('valor', `%${q}%`);

    const { data, error } = await query;
    if (error) throw error;

    // Agrupa por tipo
    const sugestoes: Record<string, string[]> = {};
    for (const row of data || []) {
      if (!sugestoes[row.tipo]) sugestoes[row.tipo] = [];
      sugestoes[row.tipo].push(row.valor);
    }

    return json({ sugestoes }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao buscar sugestoes.');
  }
}
