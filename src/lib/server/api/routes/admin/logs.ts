// Migrado para Hono de src/routes/api/v1/admin/logs/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';

export async function handleAdminLogsGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      return json(
        { error: 'Somente administradores podem acessar logs.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const { searchParams } = event.url;
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = Math.min(100, Number(searchParams.get('pageSize') || 50));
    const tipo = String(searchParams.get('tipo') || '').trim();
    const userId = String(searchParams.get('user_id') || '').trim();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = client
      .from('logs')
      .select(
        'id, modulo, acao, detalhes, user_id, ip, created_at, usuario:users!user_id(nome_completo, email)',
        {
          count: 'exact'
        }
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (tipo) query = query.eq('modulo', tipo);
    if (userId) query = query.eq('user_id', userId);

    const { data, count, error: queryError } = await query;
    if (queryError) throw queryError;

    return json(
      { items: data || [], total: Number(count || 0), page, pageSize },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar logs.');
  }
}
