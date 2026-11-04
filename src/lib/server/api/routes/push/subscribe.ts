// Migrado para Hono de src/routes/api/v1/push/subscribe/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { logServerError, requireAuthenticatedUser } from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 512;
const MAX_PUSH_SUBSCRIBE_BODY_BYTES = 16 * 1024;

type PushSubscriptionKeysBody = {
  p256dh?: unknown;
  auth?: unknown;
};

type PushSubscriptionBody = {
  endpoint?: unknown;
  keys?: PushSubscriptionKeysBody | null;
};

type PushSubscribeRequestBody = PushSubscriptionBody & {
  subscription?: PushSubscriptionBody | null;
};

type PushSubscriptionUpsert = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  active: boolean;
  updated_at: string;
};

function readPushSubscriptionKeysBody(value: unknown): PushSubscriptionKeysBody | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const keys: PushSubscriptionKeysBody = {};
  if (typeof body.p256dh === 'string') keys.p256dh = body.p256dh;
  if (typeof body.auth === 'string') keys.auth = body.auth;
  return keys;
}

function readPushSubscriptionBody(value: unknown): PushSubscriptionBody | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const subscription: PushSubscriptionBody = {};
  if (typeof body.endpoint === 'string') subscription.endpoint = body.endpoint;
  const keys = readPushSubscriptionKeysBody(body.keys);
  if (keys) subscription.keys = keys;
  return subscription;
}

function readPushSubscribeRequestBody(value: unknown): PushSubscribeRequestBody {
  const subscription = readPushSubscriptionBody(value);
  if (!subscription) return {};

  const body = value as Record<string, unknown>;
  const nestedSubscription = readPushSubscriptionBody(body.subscription);
  return nestedSubscription ? { ...subscription, subscription: nestedSubscription } : subscription;
}

export const handlePushSubscribePost = async (event: RequestEvent) => {
  try {
    const { request, locals } = event;
    const originError = rejectCrossOriginRequest(request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(request, MAX_PUSH_SUBSCRIBE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const user = await requireAuthenticatedUser(event);
    const client = locals.dados;

    const body = readPushSubscribeRequestBody(bodyResult.data);
    const subscription = body.subscription || readPushSubscriptionBody(bodyResult.data);
    const endpoint = String(subscription?.endpoint || '').trim();
    const keys = subscription?.keys || {};
    const p256dh = String(keys?.p256dh || '').trim();
    const auth = String(keys?.auth || '').trim();

    if (!endpoint || !p256dh || !auth) {
      return json({ error: 'Subscription invalida.' }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (
      endpoint.length > MAX_ENDPOINT_LENGTH ||
      String(p256dh).length > MAX_KEY_LENGTH ||
      String(auth).length > MAX_KEY_LENGTH
    ) {
      return json(
        { error: 'Subscription muito grande.' },
        { status: 413, headers: NO_STORE_HEADERS }
      );
    }
    try {
      const parsedEndpoint = new URL(endpoint);
      if (parsedEndpoint.protocol !== 'https:') {
        return json({ error: 'Endpoint invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
      }
    } catch {
      return json({ error: 'Endpoint invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const payload = {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: request.headers.get('user-agent') || null,
      active: true,
      updated_at: new Date().toISOString()
    } satisfies PushSubscriptionUpsert;

    const { error } = await client
      .from('push_subscriptions')
      .upsert(payload, { onConflict: 'endpoint' });

    if (error) {
      logServerError('[push/subscribe] falha ao salvar subscription', error);
      return json(
        { error: 'Erro ao salvar subscription.' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error: unknown) {
    logServerError('[push/subscribe] falha interna', error);
    return json(
      { error: 'Erro interno ao salvar subscription.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
};
