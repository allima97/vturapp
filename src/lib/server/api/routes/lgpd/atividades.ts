/**
 * GET /api/v1/lgpd/admin/atividades
 *
 * Retorna o Registro de Atividades de Tratamento (ROPA).
 * LGPD Art. 37: documentação do tratamento de dados pessoais.
 *
 * Requer role admin (isAdmin).
 */
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getAdminClient, requireAuthenticatedUser, resolveUserScope, toErrorResponse } from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';

export async function handleLgpdAtividadesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      return json({ error: 'Acesso restrito a administradores.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const { data, error: queryErr } = await client
      .from('lgpd_atividades_tratamento')
      .select('*')
      .order('nome', { ascending: true });

    if (queryErr) throw queryErr;

    return json({
      atividades: data ?? [],
      total: (data ?? []).length,
      gerado_em: new Date().toISOString(),
      nota_legal: 'Registro de Atividades de Tratamento — LGPD Art. 37, Lei 13.709/2018'
    }, { headers: DYNAMIC_READ_HEADERS });

  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar atividades de tratamento.');
  }
}
