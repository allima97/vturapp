/**
 * Minimal legacy API bridge for Workers integration tests.
 *
 * The v2 Hono middleware imports these two helpers from the v1 module, whose
 * production implementation also initializes Supabase and SvelteKit dynamic
 * environment modules. The Workers project exercises v2 with D1/R2 and does
 * not need those legacy integrations.
 */
import { json } from '@sveltejs/kit';

export function logServerError(context: string, err: unknown, extra?: Record<string, unknown>) {
  console.error(context, { ...extra, error: err instanceof Error ? err.message : String(err) });
}

export function toErrorResponse(err: unknown, fallbackMessage: string) {
  const value = err && typeof err === 'object' ? (err as Record<string, unknown>) : {};
  const status = typeof value.status === 'number' ? value.status : 500;
  const body = value.body && typeof value.body === 'object' ? (value.body as Record<string, unknown>) : {};
  const message = typeof body.message === 'string'
    ? body.message
    : typeof value.message === 'string'
      ? value.message
      : fallbackMessage;
  return json({ error: message }, {
    status,
    headers: {
      'cache-control': 'no-store',
      vary: 'Cookie',
      'x-content-type-options': 'nosniff',
    },
  });
}
