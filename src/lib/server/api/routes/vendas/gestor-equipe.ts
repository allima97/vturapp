// Migrado para Hono de src/routes/api/v1/vendas/gestor-equipe/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler mudou). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  fetchGestorEquipeIdsComGestor,
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import { chunkArray } from '$lib/utils/array';

const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

type GestorEquipeUserRow = {
  id?: string | null;
  nome_completo?: string | null;
};

export async function handleVendasGestorEquipeGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isGestor && !scope.isAdmin) {
      return json({ items: [] }, { headers: DYNAMIC_READ_HEADERS });
    }

    const equipeIds = await fetchGestorEquipeIdsComGestor(client, user.id);
    if (equipeIds.length === 0) {
      return json({ items: [] }, { headers: DYNAMIC_READ_HEADERS });
    }

    const rows: GestorEquipeUserRow[] = [];
    for (const batch of chunkArray(equipeIds)) {
      const { data, error: queryError } = await client
        .from('users')
        .select('id, nome_completo, uso_individual')
        .in('id', batch)
        .eq('uso_individual', false)
        .order('nome_completo', { ascending: true });

      if (queryError) throw queryError;
      rows.push(...((data || []) as GestorEquipeUserRow[]));
    }

    const rowsById = new Map<string, GestorEquipeUserRow>();
    for (const row of rows) {
      rowsById.set(String(row?.id || ''), row);
    }

    const data = Array.from(rowsById.values()).sort((left, right) =>
      PT_BR_COLLATOR.compare(String(left?.nome_completo || ''), String(right?.nome_completo || ''))
    );

    return json(
      {
        items: data.map((row) => ({
          id: row.id,
          nome_completo: row.nome_completo || ''
        }))
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar equipe do gestor.');
  }
}
