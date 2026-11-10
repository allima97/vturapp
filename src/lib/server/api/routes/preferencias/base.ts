// Migrado para Hono de src/routes/api/v1/preferencias/base/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import {
  buildJsonResponse,
  buildNoStoreTextResponse,
  fetchPreferenciasBase,
  logServerError,
  requirePreferenciasScope
} from '../../../../../routes/api/v1/preferencias/_shared';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';

export async function handlePreferenciasBaseGet(event: RequestEvent) {
  try {
    const { client, user, scope } = await requirePreferenciasScope(event, 1);
    const payload = await getCachedReadModel({
      key: buildReadModelCacheKey('preferencias:base', {
        userId: user.id,
        companyId: scope.companyId
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
      loader: () => fetchPreferenciasBase(client, scope, user.id)
    });
    return buildJsonResponse(payload, 200, 30);
  } catch (err) {
    logServerError('[preferencias/base] falha ao carregar base', err);
    return buildNoStoreTextResponse('Erro ao carregar base.', 500);
  }
}
