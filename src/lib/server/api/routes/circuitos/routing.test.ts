/**
 * Roteamento de /api/v1/circuitos/* no Hono (gerado por gen_routing_test.py).
 *
 * Os handlers foram movidos SEM alteração dos +server.ts originais (identidade
 * textual verificada na migração). Este teste garante que cada método + URL
 * chega no handler certo, com os mesmos params, tanto pelo app quanto pelo
 * catch-all, e que método não exportado antes continua sem handler (404).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as Array<{ name: string; params: Record<string, unknown> }>);
const spy = vi.hoisted(
  () => (name: string) => async (event: { params: Record<string, unknown> }) => {
    calls.push({ name, params: { ...event.params } });
    return new Response(name, { status: 200 });
  }
);

vi.mock('./root', () => ({
  handleCircuitosGet: spy('handleCircuitosGet'),
  handleCircuitosPost: spy('handleCircuitosPost')
}));
vi.mock('./id', () => ({
  handleCircuitosIdGet: spy('handleCircuitosIdGet'),
  handleCircuitosIdPatch: spy('handleCircuitosIdPatch'),
  handleCircuitosIdDelete: spy('handleCircuitosIdDelete')
}));

import { apiApp } from '../../app';
import * as catchAll from '../../../../../routes/api/v1/[...path]/+server';

const CASES: Array<[string, string, string, Record<string, string>]> = [
  ['GET', '/api/v1/circuitos', 'handleCircuitosGet', {}],
  ['POST', '/api/v1/circuitos', 'handleCircuitosPost', {}],
  ['GET', '/api/v1/circuitos/id-123', 'handleCircuitosIdGet', { id: 'id-123' }],
  ['PATCH', '/api/v1/circuitos/id-123', 'handleCircuitosIdPatch', { id: 'id-123' }],
  ['DELETE', '/api/v1/circuitos/id-123', 'handleCircuitosIdDelete', { id: 'id-123' }]
];

const SEM_HANDLER: Array<[string, string]> = [
  ['PUT', '/api/v1/circuitos'],
  ['PUT', '/api/v1/circuitos/id-123']
];

function ev(method: string, path: string) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url: new URL(request.url), params: {}, locals: {}, platform: undefined } as any;
}

beforeEach(() => {
  calls.length = 0;
});

describe('circuitos → handler', () => {
  it.each(CASES)('%s %s → %s', async (method, path, handler, params) => {
    const e = ev(method, path);
    const res = await apiApp.fetch(e.request, { event: e });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(handler);
    expect(calls).toEqual([{ name: handler, params }]);
  });

  it('catch-all também encaminha', async () => {
    for (const [method, path, handler, params] of CASES) {
      calls.length = 0;
      const fn = (catchAll as Record<string, (e: unknown) => Promise<Response>>)[method];
      const res = await fn(ev(method, path));
      expect(await res.text()).toBe(handler);
      expect(calls).toEqual([{ name: handler, params }]);
    }
  });

  it('método que não existia continua sem handler', async () => {
    for (const [method, path] of SEM_HANDLER) {
      const e = ev(method, path);
      const res = await apiApp.fetch(e.request, { event: e });
      expect(res.status).toBe(404);
    }
    expect(calls).toEqual([]);
  });
});
