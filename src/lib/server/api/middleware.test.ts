import { describe, expect, it } from 'vitest';
import { apiApp } from './app';
import { resolveRequestId } from './middleware';

function fakeEvent(path: string, headers: Record<string, string> = {}) {
  const request = new Request(`https://vturapp.test${path}`, { headers });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url: new URL(request.url), locals: {}, platform: undefined } as any;
}

describe('resolveRequestId', () => {
  it('reaproveita x-request-id seguro, depois cf-ray, senão gera', () => {
    expect(resolveRequestId(new Headers({ 'x-request-id': 'abc-123' }))).toBe('abc-123');
    expect(resolveRequestId(new Headers({ 'x-request-id': 'com espaço', 'cf-ray': '8a1b-GRU' }))).toBe('8a1b-GRU');
    expect(resolveRequestId(new Headers())).toMatch(/[0-9a-f-]{8,}/);
  });
});

describe('app Hono /api/v1', () => {
  it('acrescenta x-request-id e server-timing sem mudar status/corpo', async () => {
    const ev = fakeEvent('/api/v1/health', { 'x-request-id': 'req-1' });
    const res = await apiApp.fetch(ev.request, { event: ev });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBe('req-1');
    expect(res.headers.get('server-timing')).toMatch(/^app;dur=\d+$/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });

  it('rota inexistente (via catch-all) → 404 JSON', async () => {
    const ev = fakeEvent('/api/v1/nao-existe');
    const res = await apiApp.fetch(ev.request, { event: ev });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Rota não encontrada.' });
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('método não registrado numa rota migrada → 404 (não cai em outro handler)', async () => {
    const ev = fakeEvent('/api/v1/health');
    const req = new Request(ev.request.url, { method: 'DELETE' });
    const res = await apiApp.fetch(req, { event: { ...ev, request: req } });
    expect(res.status).toBe(404);
  });
});
