// Migrado para Hono de src/routes/api/v1/dashboard/widgets/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import { readTextBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  ensureModuloAccess,
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope
} from '$lib/server/v1';
import { NO_STORE_HEADERS, SHORT_DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import { safeJsonParse } from '$lib/utils/json';
import { toUserMessage } from '$lib/utils/errors';

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

type WidgetInput = {
  widget: string;
  visivel?: boolean;
  settings?: unknown;
};

const CACHE_TTL_MS = 900_000;
const CACHE_MAX_ENTRIES = 300;
const MAX_DASHBOARD_WIDGETS_BODY_BYTES = 64 * 1024;
const cache = new Map<string, CacheEntry>();
const NO_STORE_TEXT_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  ...NO_STORE_HEADERS
};

function readCache(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.payload;
}

function writeCache(key: string, payload: unknown) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readErrorMessage(error: unknown) {
  const recordMessage = isRecord(error) && typeof error.message === 'string' ? error.message : '';
  return toUserMessage(error, recordMessage);
}

function normalizeItems(input: unknown): WidgetInput[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw) => {
      if (!isRecord(raw)) return null;
      const widget = String(raw.widget || '').trim();
      if (!widget) return null;
      const visivel = raw.visivel;
      const settings = raw.settings;
      return {
        widget,
        visivel: typeof visivel === 'boolean' ? visivel : undefined,
        settings: settings === undefined ? undefined : settings
      } satisfies WidgetInput;
    })
    .filter(Boolean) as WidgetInput[];
}

export async function handleDashboardWidgetsGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['dashboard'], 1, 'Sem acesso ao Dashboard.');
    }

    const cacheKey = ['v1', 'dashWidgets', user.id].join('|');
    const cached = readCache(cacheKey);
    if (cached) {
      return json(cached, { headers: SHORT_DYNAMIC_READ_HEADERS });
    }

    const { data, error } = await client
      .from('dashboard_widgets')
      .select('widget, ordem, visivel, settings')
      .eq('usuario_id', user.id)
      .order('ordem', { ascending: true });

    if (error) throw error;

    const payload = { items: data || [] };
    writeCache(cacheKey, payload);

    return json(payload, { headers: SHORT_DYNAMIC_READ_HEADERS });
  } catch (err) {
    logServerError('[dashboard/widgets] falha ao carregar widgets', err);
    return new Response('Erro ao carregar widgets.', {
      status: 500,
      headers: NO_STORE_TEXT_HEADERS
    });
  }
}

export async function handleDashboardWidgetsPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const textResult = await readTextBodyLimited(event.request, MAX_DASHBOARD_WIDGETS_BODY_BYTES);
    if (!textResult.ok) return textResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['dashboard'], 1, 'Sem acesso ao Dashboard.');
    }

    const rawBody = textResult.text;
    if (rawBody.length > MAX_DASHBOARD_WIDGETS_BODY_BYTES) {
      return new Response('Payload muito grande.', { status: 413, headers: NO_STORE_TEXT_HEADERS });
    }
    const body = safeJsonParse(rawBody);
    const items = normalizeItems(isRecord(body) ? body.items : undefined);

    if (!items.length) {
      return new Response('items obrigatorio.', { status: 400, headers: NO_STORE_TEXT_HEADERS });
    }

    const rows = items.slice(0, 80).map((item, idx) => ({
      usuario_id: user.id,
      widget: item.widget,
      ordem: idx,
      visivel: item.visivel !== false,
      settings: item.settings ?? null
    }));

    const cacheKey = ['v1', 'dashWidgets', user.id].join('|');

    await client.from('dashboard_widgets').delete().eq('usuario_id', user.id);

    try {
      const { error: insertError } = await client.from('dashboard_widgets').insert(rows);
      if (insertError) throw insertError;
    } catch (err: unknown) {
      const msg = readErrorMessage(err);
      if (msg.toLowerCase().includes('settings')) {
        const payloadSemSettings = rows.map(({ settings: _settings, ...row }) => row);
        const { error: retryError } = await client
          .from('dashboard_widgets')
          .insert(payloadSemSettings);
        if (retryError) throw retryError;
      } else {
        throw err;
      }
    }

    cache.delete(cacheKey);

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logServerError('[dashboard/widgets] falha ao salvar widgets', err);
    return new Response('Erro ao salvar widgets.', { status: 500, headers: NO_STORE_TEXT_HEADERS });
  }
}
