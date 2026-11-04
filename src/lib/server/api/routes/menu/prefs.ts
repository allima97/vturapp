// Migrado para Hono de src/routes/api/v1/menu/prefs/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readTextBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { getAdminClient, logServerError, requireAuthenticatedUser } from '$lib/server/v1';
import { normalizeMenuPrefs, type MenuPrefsV1 } from '$lib/server/menuPrefs';
import { DEFAULT_HIDDEN_MENU_KEYS } from '$lib/config/menuDefaults';
import { safeJsonParse } from '$lib/utils/json';

const JSON_NO_STORE_HEADERS = {
  'Content-Type': 'application/json',
  ...NO_STORE_HEADERS
};

const TEXT_NO_STORE_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  ...NO_STORE_HEADERS
};

const MAX_PREFS_BODY_BYTES = 16 * 1024;

type MenuPrefsPayload = {
  user_id: string;
  prefs: MenuPrefsV1;
  updated_at: string;
};

export async function handleMenuPrefsGet(event: RequestEvent) {
  try {
    const user = await requireAuthenticatedUser(event);
    const client = getAdminClient();

    const { data, error } = await client
      .from('menu_prefs')
      .select('prefs, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;

    // `data` só é null quando o usuário nunca salvou preferências (nenhuma
    // linha em menu_prefs) -- diferente de uma preferência explícita salva
    // como `hidden: []`, que preserva `data` (com updated_at preenchido).
    // Só aplicamos o padrão "oculto por padrão" nesse caso de "nunca salvou",
    // para nunca sobrescrever uma escolha explícita do usuário.
    const prefs = data
      ? normalizeMenuPrefs(data.prefs)
      : { ...normalizeMenuPrefs(undefined), hidden: [...DEFAULT_HIDDEN_MENU_KEYS] };

    return new Response(JSON.stringify({ prefs, updated_at: data?.updated_at ?? null }), {
      status: 200,
      headers: JSON_NO_STORE_HEADERS
    });
  } catch (err: unknown) {
    logServerError('[menu/prefs] falha ao carregar preferencias', err);
    return new Response('Erro ao carregar preferencias do menu.', {
      status: 500,
      headers: TEXT_NO_STORE_HEADERS
    });
  }
}

export async function handleMenuPrefsPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const user = await requireAuthenticatedUser(event);
    const client = getAdminClient();

    const textResult = await readTextBodyLimited(event.request, MAX_PREFS_BODY_BYTES);
    if (!textResult.ok) {
      return new Response('Payload muito grande.', { status: 413, headers: TEXT_NO_STORE_HEADERS });
    }

    const rawBody = textResult.text;
    if (rawBody.length > MAX_PREFS_BODY_BYTES) {
      return new Response('Payload muito grande.', { status: 413, headers: TEXT_NO_STORE_HEADERS });
    }

    const body = safeJsonParse(rawBody) as { prefs?: unknown } | null;
    const nextPrefs = normalizeMenuPrefs(body?.prefs);

    const payload: MenuPrefsPayload = {
      user_id: user.id,
      prefs: nextPrefs,
      updated_at: new Date().toISOString()
    };

    const { error } = await client.from('menu_prefs').upsert(payload, {
      onConflict: 'user_id'
    });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: JSON_NO_STORE_HEADERS
    });
  } catch (err: unknown) {
    logServerError('[menu/prefs] falha ao salvar preferencias', err);
    return new Response('Erro ao salvar preferencias do menu.', {
      status: 500,
      headers: TEXT_NO_STORE_HEADERS
    });
  }
}
