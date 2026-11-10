// Migrado para Hono de src/routes/api/v1/cards/render.svg/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { logServerError } from '$lib/server/v1';
import { renderCardSvg } from '../../../../../routes/api/v1/cards/_render';

const CARD_SVG_HEADERS = {
  'Content-Type': 'image/svg+xml; charset=utf-8',
  'Cache-Control': 'private, max-age=60, no-transform',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff'
} as const;

const CARD_ERROR_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  ...NO_STORE_HEADERS
} as const;

export async function handleCardsRenderSvgGet(event: import('@sveltejs/kit').RequestEvent) {
  try {
    const rateLimit = await checkPersistentRateLimit(
      'cards-render-svg',
      event.getClientAddress?.() || 'unknown',
      {
        max: 240,
        windowMs: 60_000
      },
      event.platform?.env?.DB
    );
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: 'rate_limited',
          message: 'Muitas requisições. Tente novamente em instantes.'
        }),
        {
          status: 429,
          headers: {
            ...CARD_ERROR_HEADERS,
            'Retry-After': String(rateLimit.retryAfterSeconds)
          }
        }
      );
    }

    const { svg } = await renderCardSvg(event);
    return new Response(svg, {
      status: 200,
      headers: CARD_SVG_HEADERS
    });
  } catch (e: unknown) {
    logServerError('[cards/render.svg] falha ao renderizar cartão', e);
    return new Response(
      JSON.stringify({
        error: 'card_render_error',
        message: 'Erro ao renderizar cartão.'
      }),
      {
        status: 500,
        headers: CARD_ERROR_HEADERS
      }
    );
  }
}
