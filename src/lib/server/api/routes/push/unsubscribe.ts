// Migrado para Hono de src/routes/api/v1/push/unsubscribe/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { logServerError, requireAuthenticatedUser } from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_PUSH_UNSUBSCRIBE_BODY_BYTES = 8 * 1024;

type PushUnsubscribeBody = {
  endpoint?: string;
};

type PushSubscriptionUpdate = {
  active: boolean;
  updated_at: string;
};

function readPushUnsubscribeBody(value: unknown): PushUnsubscribeBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return typeof body.endpoint === 'string' ? { endpoint: body.endpoint } : {};
}

export const handlePushUnsubscribePost = async (event: RequestEvent) => {
  try {
    const { request, locals } = event;
    const originError = rejectCrossOriginRequest(request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(request, MAX_PUSH_UNSUBSCRIBE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const user = await requireAuthenticatedUser(event);
    const client = locals.dados;

    const body = readPushUnsubscribeBody(bodyResult.data);
    const endpoint = String(body?.endpoint || '').trim();

    if (!endpoint) {
      return json({ error: 'Endpoint invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (endpoint.length > 2048) {
      return json({ error: 'Endpoint muito grande.' }, { status: 413, headers: NO_STORE_HEADERS });
    }
    try {
      const parsedEndpoint = new URL(endpoint);
      if (parsedEndpoint.protocol !== 'https:') {
        return json({ error: 'Endpoint invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
      }
    } catch {
      return json({ error: 'Endpoint invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { error } = await client
      .from('push_subscriptions')
      .update({
        active: false,
        updated_at: new Date().toISOString()
      } satisfies PushSubscriptionUpdate)
      .eq('endpoint', endpoint)
      .eq('user_id', user.id);

    if (error) {
      logServerError('[push/unsubscribe] falha ao desativar subscription', error);
      return json(
        { error: 'Erro ao desativar subscription.' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error: unknown) {
    logServerError('[push/unsubscribe] falha interna', error);
    return json(
      { error: 'Erro interno ao desativar subscription.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
};
