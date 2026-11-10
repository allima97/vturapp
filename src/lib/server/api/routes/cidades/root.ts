// Migrado para Hono de src/routes/api/v1/cidades/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { registrarLog } from '$lib/server/auditLog';
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  parseIntSafe,
  requireAuthenticatedUser,
  resolveUserScope,
  sanitizePostgrestSearchTerm,
  toErrorResponse
} from '$lib/server/v1';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  invalidateCatalogReadModels,
  READ_MODEL_TAGS
} from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { rejectCrossOriginRequest } from '$lib/server/requestGuards';

type CidadeListRow = {
  id: string;
  nome: string | null;
  subdivisao_id: string | null;
  descricao: string | null;
  created_at: string | null;
  subdivisao?:
    | {
        id: string;
        nome: string | null;
        pais_id: string | null;
      }[]
    | null;
};

export async function handleCidadesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Cidades'], 1, 'Sem acesso a Cidades.');
    }

    const { searchParams } = event.url;
    const rawQ = sanitizePostgrestSearchTerm(searchParams.get('q'), 80);
    const q = rawQ.length >= 2 ? rawQ : '';
    const subdivisaoId = String(searchParams.get('subdivisao_id') || '').trim();
    const page = Math.max(1, parseIntSafe(searchParams.get('page'), 1));
    const pageSize = Math.min(5000, Math.max(1, parseIntSafe(searchParams.get('pageSize'), 200)));

    if (subdivisaoId && !isUuid(subdivisaoId)) {
      return json({ error: 'subdivisao_id inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    // Na listagem usamos apenas campos da própria tabela + subdivisao simples (sem join de pais)
    // para evitar queries lentas com joins aninhados. O join completo só é feito por ID.
    const selectFields = `id, nome, subdivisao_id, descricao, created_at,
        subdivisao:subdivisoes!subdivisao_id(id, nome, pais_id)`;

    const { items, total } = await getCachedReadModel<{ items: CidadeListRow[]; total: number }>({
      key: buildReadModelCacheKey('cidades:list', {
        q,
        subdivisaoId,
        page,
        pageSize
      }),
      tags: [READ_MODEL_TAGS.catalog],
      ttlMs: 300_000,
      staleTtlMs: 1_800_000,
      loader: async () => {
        let query = client
          .from('cidades')
          .select(selectFields)
          .order('nome')
          .range((page - 1) * pageSize, page * pageSize - 1);

        if (subdivisaoId) query = query.eq('subdivisao_id', subdivisaoId);
        if (q) {
          query = query.or(`nome.ilike.%${q}%,descricao.ilike.%${q}%`);
        }

        const { data, error: queryError } = await query;
        if (queryError) throw queryError;

        const rows = data || [];
        return {
          items: rows,
          total: rows.length
        };
      }
    });

    return json({ items, total, page, pageSize }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar cidades.');
  }
}

export function handleCidadesPost(_event: RequestEvent) {
  return json(
    {
      error:
        'O cadastro de cidades passou a ser feito como destino personalizado, com uma localidade do GeoNames.'
    },
    { status: 410, headers: NO_STORE_HEADERS }
  );
}

export async function handleCidadesDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Cidades'], 4, 'Sem permissão para excluir cidades.');
    }

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { error: deleteError } = await client.from('cidades').delete().eq('id', id);
    if (deleteError) throw deleteError;
    registrarLog(event, {
      userId: user.id,
      modulo: 'Cadastros',
      acao: 'cidade_excluida',
      detalhes: { id }
    });

    invalidateCatalogReadModels({ userId: user.id });
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir cidade.');
  }
}
