/**
 * Roteamento de /api/v1/mural/* no Hono (gerado por gen_routing_test.py).
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

vi.mock('./bootstrap', () => ({ handleMuralBootstrapGet: spy('handleMuralBootstrapGet') }));
vi.mock('./company', () => ({ handleMuralCompanyGet: spy('handleMuralCompanyGet') }));
vi.mock('./read', () => ({ handleMuralReadPost: spy('handleMuralReadPost') }));
vi.mock('./recados', () => ({
  handleMuralRecadosGet: spy('handleMuralRecadosGet'),
  handleMuralRecadosPost: spy('handleMuralRecadosPost'),
  handleMuralRecadosDelete: spy('handleMuralRecadosDelete')
}));

import { apiApp } from '../../app';
import * as catchAll from '../../../../../routes/api/v1/[...path]/+server';

const CASES: Array<[string, string, string, Record<string, string>]> = [
  ['GET', '/api/v1/mural/bootstrap', 'handleMuralBootstrapGet', {}],
  ['GET', '/api/v1/mural/company', 'handleMuralCompanyGet', {}],
  ['POST', '/api/v1/mural/read', 'handleMuralReadPost', {}],
  ['GET', '/api/v1/mural/recados', 'handleMuralRecadosGet', {}],
  ['POST', '/api/v1/mural/recados', 'handleMuralRecadosPost', {}],
  ['DELETE', '/api/v1/mural/recados', 'handleMuralRecadosDelete', {}]
];

const SEM_HANDLER: Array<[string, string]> = [
  ['PUT', '/api/v1/mural/bootstrap'],
  ['PUT', '/api/v1/mural/company'],
  ['PUT', '/api/v1/mural/read'],
  ['PUT', '/api/v1/mural/recados']
];

function ev(method: string, path: string) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url: new URL(request.url), params: {}, locals: {}, platform: undefined } as any;
}

beforeEach(() => {
  calls.length = 0;
});

describe('mural → handler', () => {
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
