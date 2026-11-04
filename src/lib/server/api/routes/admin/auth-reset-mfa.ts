// Migrado para Hono de src/routes/api/v1/admin/auth/reset-mfa/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { ensureCanManageUsers, findAuthUserIdByEmail, loadManagedUser } from '$lib/server/admin';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_RESET_MFA_BODY_BYTES = 8 * 1024;

type MfaFactorRow = {
  id?: string | null;
};

export async function handleAdminAuthResetMfaPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_RESET_MFA_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};

    ensureCanManageUsers(scope);
    const rateLimit = await checkPersistentRateLimit(
      'admin-reset-mfa',
      user.id,
      {
        max: 20,
        windowMs: 60_000
      },
      event.platform?.env?.DB
    );
    if (!rateLimit.allowed) {
      return json(
        { error: 'Muitas redefinicoes de MFA. Aguarde e tente novamente.' },
        {
          status: 429,
          headers: { ...NO_STORE_HEADERS, 'Retry-After': String(rateLimit.retryAfterSeconds) }
        }
      );
    }

    let userId = String(body.user_id || '').trim();
    const email = String(body.email || '')
      .trim()
      .toLowerCase();

    if (!userId && email) {
      userId = (await findAuthUserIdByEmail(client, email)) || '';
    }

    if (!userId) {
      return json(
        { error: 'Usuario alvo nao informado.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    await loadManagedUser(client, scope, userId);

    const { data: factorsData, error: factorsError } = await client.auth.admin.mfa.listFactors({
      userId
    });
    if (factorsError) throw factorsError;

    let deletedCount = 0;
    for (const factor of factorsData?.factors || []) {
      const factorId = String((factor as MfaFactorRow).id || '').trim();
      if (!factorId) continue;
      const { error: deleteError } = await client.auth.admin.mfa.deleteFactor({
        userId,
        id: factorId
      });
      if (deleteError) throw deleteError;
      deletedCount += 1;
    }

    return json(
      {
        ok: true,
        user_id: userId,
        deleted_count: deletedCount
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao resetar MFA.');
  }
}
