// Migrado para Hono de src/routes/api/v1/clientes/avisos/history/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { ensureClienteModuloAccess } from '$lib/server/clientes';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';

export async function handleClientesAvisosHistoryGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureClienteModuloAccess(scope, 1, 'Sem acesso ao historico de avisos.');
    }

    const clienteId = String(event.url.searchParams.get('cliente_id') || '').trim();
    if (!clienteId || !isUuid(clienteId)) {
      return json({ error: 'Cliente invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data, error } = await client
      .from('cliente_avisos_historico')
      .select(
        'id, cliente_id, template_id, canal, assunto, mensagem, status, provider, provider_id, destinatario, enviado_por, created_at'
      )
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      const message = String(error.message || '').toLowerCase();
      if (message.includes('does not exist') || message.includes('schema cache')) {
        return json({ items: [], unavailable: true }, { headers: DYNAMIC_READ_HEADERS });
      }
      throw error;
    }

    return json({ items: data || [] }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar historico de avisos.');
  }
}
