// Migrado para Hono de src/routes/api/v1/admin/auth/set-password/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureCanManageUsers,
  findAuthUserIdByEmail,
  loadManagedUser
} from '$lib/server/admin';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_SET_PASSWORD_BODY_BYTES = 8 * 1024;

export async function handleAdminAuthSetPasswordPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_SET_PASSWORD_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};

    ensureCanManageUsers(scope);
    const rateLimit = await checkPersistentRateLimit('admin-set-password', user.id, {
      max: 20,
      windowMs: 60_000
    }, event.platform?.env?.DB);
    if (!rateLimit.allowed) {
      return json(
        { error: 'Muitas alterações de senha. Aguarde e tente novamente.' },
        {
          status: 429,
          headers: { ...NO_STORE_HEADERS, 'Retry-After': String(rateLimit.retryAfterSeconds) }
        }
      );
    }

    let userId = String(body.user_id || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const confirmEmail = body.confirm_email !== false;

    if (!password || password.length < 8) {
      return json(
        { error: 'Senha obrigatoria com pelo menos 8 caracteres.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!userId && email) {
      userId = (await findAuthUserIdByEmail(client, email)) || '';
    }

    if (!userId) {
      return json({ error: 'Usuario alvo nao informado.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    await loadManagedUser(client, scope, userId);

    const { data, error: updateError } = await client.auth.admin.updateUserById(userId, {
      password,
      email_confirm: confirmEmail
    });

    if (updateError) throw updateError;

    return json(
      {
        ok: true,
        user_id: userId,
        email: data.user?.email || null,
        updated_at: data.user?.updated_at || null
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao redefinir senha.');
  }
}
