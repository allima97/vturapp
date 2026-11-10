// Migrado para Hono de src/routes/api/v1/cards/render.png/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { isWasmCodegenBlockedError, renderSvgToPng } from '$lib/cards/svgToPng';
import { logServerError } from '$lib/server/v1';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { renderCardSvg } from '../../../../../routes/api/v1/cards/_render';

const CARD_IMAGE_HEADERS = {
  'Cache-Control': 'private, max-age=60, no-transform',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff'
} as const;

const CARD_ERROR_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  ...NO_STORE_HEADERS
} as const;

export async function handleCardsRenderPngGet(event: import('@sveltejs/kit').RequestEvent) {
  try {
    const rateLimit = await checkPersistentRateLimit(
      'cards-render-png',
      event.getClientAddress?.() || 'unknown',
      {
        max: 80,
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
    try {
      const png = await renderSvgToPng(svg, event.request);
      return new Response(png, {
        status: 200,
        headers: {
          ...CARD_IMAGE_HEADERS,
          'Content-Type': 'image/png'
        }
      });
    } catch (error) {
      if (isWasmCodegenBlockedError(error)) {
        logServerError('[cards/render.png] PNG indisponível no runtime', error);
        return new Response(
          JSON.stringify({
            error: 'png_render_unavailable',
            message: 'PNG rendering unavailable in current runtime.'
          }),
          {
            status: 503,
            headers: {
              ...CARD_ERROR_HEADERS,
              'X-Card-Render-Error': 'png_render_unavailable'
            }
          }
        );
      }
      throw error;
    }
  } catch (e: unknown) {
    logServerError('[cards/render.png] falha ao renderizar cartão', e);
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
