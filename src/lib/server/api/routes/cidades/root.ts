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
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_CIDADES_BODY_BYTES = 64 * 1024;

type CidadeBody = {
  id?: unknown;
  nome?: unknown;
  descricao?: unknown;
  subdivisao_id?: unknown;
};

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

function readCidadeBody(value: unknown): CidadeBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    id: body.id,
    nome: body.nome,
    descricao: body.descricao,
    subdivisao_id: body.subdivisao_id
  };
}

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

export async function handleCidadesPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CIDADES_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Cidades'], 2, 'Sem permissão para salvar cidades.');
    }

    const body = readCidadeBody(bodyResult.data);
    const { nome, descricao } = body;
    const id = String(body.id || '').trim();
    const subdivisaoId = String(body.subdivisao_id || '').trim();

    if (!String(nome || '').trim())
      return json({ error: 'Nome obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });
    if (!subdivisaoId || !isUuid(subdivisaoId))
      return json(
        { error: 'Estado/Subdivisão obrigatório.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );

    const payload = {
      nome: String(nome).trim(),
      subdivisao_id: subdivisaoId,
      descricao: String(descricao || '').trim() || null
    };

    let result;
    if (id && isUuid(id)) {
      const { data, error: updateError } = await client
        .from('cidades')
        .update(payload)
        .eq('id', id)
        .select('id')
        .single();
      if (updateError) throw updateError;
      result = data;
      registrarLog(event, {
        userId: user.id,
        modulo: 'Cadastros',
        acao: 'cidade_editada',
        detalhes: { id, payload }
      });
    } else {
      const { data, error: insertError } = await client
        .from('cidades')
        .insert(payload)
        .select('id')
        .single();
      if (insertError) throw insertError;
      result = data;
      registrarLog(event, {
        userId: user.id,
        modulo: 'Cadastros',
        acao: 'cidade_criada',
        detalhes: { ...payload }
      });
    }

    invalidateCatalogReadModels({ userId: user.id });
    return json({ ok: true, id: result?.id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar cidade.');
  }
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
