// Migrado para Hono de src/routes/api/v1/admin/auth/mfa-status/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { ensureCanManageUsers, loadManagedUser } from '$lib/server/admin';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_MFA_STATUS_USERS = 200;
const MAX_MFA_STATUS_BODY_BYTES = 16 * 1024;

function normalizeUserIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.map((item) => String(item || '').trim()).filter((item) => /^[0-9a-f-]{36}$/i.test(item))
    )
  ).slice(0, MAX_MFA_STATUS_USERS);
}

export async function handleAdminAuthMfaStatusPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_MFA_STATUS_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};

    ensureCanManageUsers(scope);

    const userIds = normalizeUserIds(body.user_ids);
    const statuses: Record<
      string,
      { enabled: boolean; verified_count: number; factor_count: number }
    > = {};

    for (const userId of userIds) {
      await loadManagedUser(client, scope, userId);

      const { data, error: factorsError } = await client.auth.admin.mfa.listFactors({ userId });
      if (factorsError) {
        statuses[userId] = { enabled: false, verified_count: 0, factor_count: 0 };
        continue;
      }

      const factors = (data?.factors || []) as Array<{ status?: string | null }>;
      const verifiedCount = factors.reduce(
        (total, factor) => total + (String(factor.status || '') === 'verified' ? 1 : 0),
        0
      );

      statuses[userId] = {
        enabled: verifiedCount > 0,
        verified_count: verifiedCount,
        factor_count: factors.length
      };
    }

    return json({ available: true, statuses }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar status de MFA.');
  }
}
