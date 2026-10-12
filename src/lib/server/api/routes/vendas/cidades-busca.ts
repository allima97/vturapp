// Migrado para Hono de src/routes/api/v1/vendas/cidades-busca/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler mudou). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  sanitizePostgrestSearchTerm,
  toErrorResponse
} from '$lib/server/v1';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS
} from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';

const PT_BR_BASE_COLLATOR = new Intl.Collator('pt-BR', { sensitivity: 'base' });

type CidadeSubdivisaoRow = {
  nome?: string | null;
  codigo_admin1?: string | null;
};

type CidadeBuscaRow = {
  id?: string | null;
  nome?: string | null;
  grau_importancia?: number | string | null;
  subdivisao_nome?: string | null;
  pais_nome?: string | null;
  subdivisao?: CidadeSubdivisaoRow | CidadeSubdivisaoRow[] | null;
};

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  const intVal = Math.trunc(parsed);
  if (intVal <= 0) return 20;
  return Math.min(50, intVal);
}

function normalizeText(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getImportanceRank(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 9999;
}

function getCidadeSearchScore(item: ReturnType<typeof mapCidade>, normalizedQuery: string) {
  const nome = normalizeText(item.nome);
  const label = normalizeText(item.label);
  const subdivisao = normalizeText(item.subdivisao_nome);
  const pais = normalizeText(item.pais_nome);
  const full = `${nome} ${subdivisao} ${pais}`.trim();

  if (!normalizedQuery) return 100;
  if (nome === normalizedQuery) return 0;
  if (label === normalizedQuery) return 1;
  if (nome.startsWith(normalizedQuery)) return 2;
  if (label.startsWith(normalizedQuery)) return 3;
  if (subdivisao && subdivisao.startsWith(normalizedQuery)) return 4;
  if (full.includes(normalizedQuery)) return 5;
  return 10;
}

function mapCidade(row: CidadeBuscaRow) {
  const nome = String(row?.nome || '').trim();
  const subdivisaoNome = String(row?.subdivisao_nome || '').trim();
  const subdivisao = Array.isArray(row?.subdivisao) ? row.subdivisao[0] : row?.subdivisao;
  const subdivisaoSigla = String(subdivisao?.codigo_admin1 || '').trim();
  const subdivisaoLabel = subdivisaoNome || subdivisaoSigla || String(subdivisao?.nome || '').trim();
  const paisNome = String(row?.pais_nome || '').trim();

  return {
    id: String(row?.id || ''),
    nome,
    subdivisao_nome: subdivisaoNome || null,
    pais_nome: paisNome || null,
    estado: subdivisaoLabel || null,
    grau_importancia: row?.grau_importancia == null ? null : Number(row.grau_importancia),
    label: subdivisaoLabel ? `${nome} (${subdivisaoLabel})` : nome
  };
}

export async function handleVendasCidadesBuscaGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster) {
      ensureModuloAccess(
        scope,
        ['vendas_consulta', 'vendas', 'vendas_cadastro'],
        1,
        'Sem acesso a Vendas.'
      );
    }

    const cidadeId = String(event.url.searchParams.get('id') || '').trim();
    const query = sanitizePostgrestSearchTerm(
      event.url.searchParams.get('q') || event.url.searchParams.get('search'),
      120
    );
    const limite = parseLimit(event.url.searchParams.get('limite'));

    if (cidadeId) {
      if (!isUuid(cidadeId)) {
        return json({ error: 'id inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
      }

      const item = await getCachedReadModel<ReturnType<typeof mapCidade> | null>({
        key: buildReadModelCacheKey('vendas:cidades-busca:id', { cidadeId }),
        tags: [READ_MODEL_TAGS.catalog],
        ttlMs: 600_000,
        staleTtlMs: 3_600_000,
        loader: async () => {
          let data: CidadeBuscaRow | null = null;
          const detailed = await client
            .from('cidades')
            .select('id, nome, grau_importancia, subdivisao:subdivisoes(nome, codigo_admin1)')
            .eq('id', cidadeId)
            .maybeSingle();

          if (detailed.error) {
            const fallback = await client
              .from('cidades')
              .select('id, nome, grau_importancia')
              .eq('id', cidadeId)
              .maybeSingle();
            if (fallback.error) throw fallback.error;
            data = fallback.data;
          } else {
            data = detailed.data;
          }

          return data ? mapCidade(data) : null;
        }
      });

      return json(item, { headers: DYNAMIC_READ_HEADERS });
    }

    if (query.length < 2) {
      return json([], { headers: DYNAMIC_READ_HEADERS });
    }

    const filtered = await getCachedReadModel<Array<ReturnType<typeof mapCidade>>>({
      key: buildReadModelCacheKey('vendas:cidades-busca:query', { query, limite }),
      tags: [READ_MODEL_TAGS.catalog],
      ttlMs: 600_000,
      staleTtlMs: 3_600_000,
      loader: async () => {
        let rows: CidadeBuscaRow[] = [];

        try {
          const { data, error } = await client.rpc('buscar_cidades', { q: query, limite });
          if (error) throw error;
          rows = Array.isArray(data) ? (data as CidadeBuscaRow[]) : [];
        } catch {
          const fallbackWithSubdivisao = await client
            .from('cidades')
            .select('id, nome, grau_importancia, subdivisao:subdivisoes(nome, codigo_admin1)')
            .ilike('nome', `%${sanitizePostgrestSearchTerm(query)}%`)
            .order('grau_importancia', { ascending: true, nullsFirst: false })
            .order('nome', { ascending: true })
            .limit(limite);

          if (fallbackWithSubdivisao.error) {
            const fallbackBase = await client
              .from('cidades')
              .select('id, nome, grau_importancia')
              .ilike('nome', `%${sanitizePostgrestSearchTerm(query)}%`)
              .order('grau_importancia', { ascending: true, nullsFirst: false })
              .order('nome', { ascending: true })
              .limit(limite);
            if (fallbackBase.error) throw fallbackBase.error;
            rows = fallbackBase.data || [];
          } else {
            rows = fallbackWithSubdivisao.data || [];
          }
        }

        if (!rows.length) return [];

	        const normalizedQuery = normalizeText(query);
	        const dedup = new Map<string, ReturnType<typeof mapCidade>>();

	        for (const row of rows) {
	          const mapped = mapCidade(row);
	          if (!mapped.id || !mapped.nome) continue;
	          if (!dedup.has(mapped.id)) {
	            dedup.set(mapped.id, mapped);
	          }
	        }

	        return Array.from(dedup.values())
          .filter((item) => normalizeText(`${item.nome} ${item.subdivisao_nome || ''} ${item.pais_nome || ''}`).includes(normalizedQuery))
          .sort((a, b) => {
            const scoreDiff = getCidadeSearchScore(a, normalizedQuery) - getCidadeSearchScore(b, normalizedQuery);
            if (scoreDiff !== 0) return scoreDiff;

            const importanceDiff = getImportanceRank(a.grau_importancia) - getImportanceRank(b.grau_importancia);
            if (importanceDiff !== 0) return importanceDiff;

            const nomeDiff = PT_BR_BASE_COLLATOR.compare(a.nome, b.nome);
            if (nomeDiff !== 0) return nomeDiff;

            return PT_BR_BASE_COLLATOR.compare(String(a.subdivisao_nome || ''), String(b.subdivisao_nome || ''));
          })
          .slice(0, limite);
      }
    });

    return json(filtered, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao buscar cidades.');
  }
}
