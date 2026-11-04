// Migrado para Hono de src/routes/api/v1/preferencias/list/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import {
  buildJsonResponse,
  buildNoStoreTextResponse,
  logServerError,
  matchesBusca,
  normalizeTerm,
  requirePreferenciasScope
} from '../../../../../routes/api/v1/preferencias/_shared';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';

type PreferenciaShareUser = {
  id?: unknown;
  nome_completo?: unknown;
  email?: unknown;
};

type PreferenciaShareRow = {
  id?: unknown;
  preferencia_id?: unknown;
  status?: unknown;
  created_at?: unknown;
  accepted_at?: unknown;
  revoked_at?: unknown;
  shared_with_user?: PreferenciaShareUser | null;
};

type PreferenciaShareSummary = {
  id: string;
  status: string;
  created_at: unknown;
  accepted_at: unknown;
  revoked_at: unknown;
  shared_with: {
    id: string;
    nome_completo: string;
    email: string;
  } | null;
};

type PreferenciaOwnedRow = Record<string, unknown> & {
  id?: unknown;
};

type PreferenciaSharedToMeRow = {
  id?: unknown;
  status?: unknown;
  created_at?: unknown;
  accepted_at?: unknown;
  revoked_at?: unknown;
  shared_by_user?: PreferenciaShareUser | null;
  preferencia?: unknown;
};

type PreferenciaListItem = {
  preferencia?: (Record<string, unknown> & { created_at?: unknown }) | null;
};

function getPreferenciaCreatedAt(item: PreferenciaListItem) {
  const preferencia = item?.preferencia;
  if (!preferencia || typeof preferencia !== 'object') return 0;
  return preferencia.created_at || 0;
}

export async function handlePreferenciasListGet(event: RequestEvent) {
  try {
    const { client, user, scope } = await requirePreferenciasScope(event, 1);
    const busca = normalizeTerm(event.url.searchParams.get('busca'));

    const prefSelect =
      'id, company_id, created_by, tipo_produto_id, cidade_id, nome, localizacao, classificacao, observacao, created_at, updated_at, cidade:cidades!cidade_id(id, nome), tipo_produto:tipo_produtos!tipo_produto_id(id, nome)';

    const payload = await getCachedReadModel({
      key: buildReadModelCacheKey('preferencias:list', {
        userId: user.id,
        companyId: scope.companyId,
        busca
      }),
      tags: [
        READ_MODEL_TAGS.preferences,
        READ_MODEL_TAGS.catalog,
        READ_MODEL_TAGS.users,
        ...scopeCacheTags({
          userId: user.id,
          companyIds: scope.companyId ? [scope.companyId] : []
        })
      ],
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        const [ownedResp, sharesToMeResp, sharesByMeResp] = await Promise.all([
          client
            .from('minhas_preferencias')
            .select(prefSelect)
            .eq('created_by', user.id)
            .order('created_at', { ascending: false })
            .limit(500),
          client
            .from('minhas_preferencias_shares')
            .select(
              `id, company_id, preferencia_id, shared_by, shared_with, status, created_at, accepted_at, revoked_at, shared_by_user:shared_by(id, nome_completo, email), preferencia:preferencia_id(${prefSelect})`
            )
            .eq('shared_with', user.id)
            .in('status', ['pending', 'accepted'])
            .order('created_at', { ascending: false })
            .limit(500),
          client
            .from('minhas_preferencias_shares')
            .select(
              'id, preferencia_id, shared_with, status, created_at, accepted_at, revoked_at, shared_with_user:shared_with(id, nome_completo, email)'
            )
            .eq('shared_by', user.id)
            .in('status', ['pending', 'accepted'])
            .order('created_at', { ascending: false })
            .limit(1000)
        ]);

        if (ownedResp.error) throw ownedResp.error;
        if (sharesToMeResp.error) throw sharesToMeResp.error;
        if (sharesByMeResp.error) throw sharesByMeResp.error;

        const sharesByPref = new Map<string, PreferenciaShareSummary[]>();
        for (const row of (sharesByMeResp.data || []) as PreferenciaShareRow[]) {
          const pid = String(row?.preferencia_id || '');
          if (!pid) continue;
          const list = sharesByPref.get(pid) || [];
          list.push({
            id: String(row?.id || ''),
            status: String(row?.status || ''),
            created_at: row?.created_at || null,
            accepted_at: row?.accepted_at || null,
            revoked_at: row?.revoked_at || null,
            shared_with: row?.shared_with_user
              ? {
                  id: String(row?.shared_with_user?.id || ''),
                  nome_completo: String(row?.shared_with_user?.nome_completo || ''),
                  email: String(row?.shared_with_user?.email || '')
                }
              : null
          });
          sharesByPref.set(pid, list);
        }

        const owned = ((ownedResp.data || []) as PreferenciaOwnedRow[]).map((p) => ({
          scope: 'owned' as const,
          preferencia: p,
          shares: sharesByPref.get(String(p?.id || '')) || []
        }));

        const shared = ((sharesToMeResp.data || []) as PreferenciaSharedToMeRow[]).map((s) => ({
          scope: 'shared' as const,
          share: {
            id: String(s?.id || ''),
            status: String(s?.status || ''),
            created_at: s?.created_at || null,
            accepted_at: s?.accepted_at || null,
            revoked_at: s?.revoked_at || null,
            shared_by: s?.shared_by_user
              ? {
                  id: String(s?.shared_by_user?.id || ''),
                  nome_completo: String(s?.shared_by_user?.nome_completo || ''),
                  email: String(s?.shared_by_user?.email || '')
                }
              : null
          },
          preferencia: s?.preferencia || null
        }));

        const all = ([...owned, ...shared] as PreferenciaListItem[])
          .filter((row) => matchesBusca(row?.preferencia, busca))
          .sort(
            (a, b) =>
              new Date(getPreferenciaCreatedAt(b) as string | number | Date).getTime() -
              new Date(getPreferenciaCreatedAt(a) as string | number | Date).getTime()
          );

        return { items: all };
      }
    });

    return buildJsonResponse(payload);
  } catch (err) {
    logServerError('[preferencias/list] falha ao listar preferencias', err);
    return buildNoStoreTextResponse('Erro ao listar preferências.', 500);
  }
}
