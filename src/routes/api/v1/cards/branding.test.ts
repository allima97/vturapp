import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { renderCardSvg } from './_render';
import { VTUR_LOGO_URL } from '$lib/brand';

afterEach(() => vi.unstubAllGlobals());

describe('identidade dos cartões', () => {
  it('usa VTur e ignora parâmetros de logo externo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const event = {
      request: new Request('https://vtur.test/api/v1/cards/render?logo_url=https://example.com/old.png&logo_path=old/logo.png'),
      locals: { safeGetSession: async () => ({ user: null }) },
    } as unknown as RequestEvent;
    const { svg } = await renderCardSvg(event);
    expect(svg).toContain(VTUR_LOGO_URL);
    expect(svg).not.toContain('old.png');
    expect(svg).not.toContain('old/logo.png');
  });
});
