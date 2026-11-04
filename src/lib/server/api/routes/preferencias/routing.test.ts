/**
 * Roteamento de /api/v1/preferencias/* no Hono (gerado por gen_routing_test.py).
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

vi.mock('./base', () => ({ handlePreferenciasBaseGet: spy('handlePreferenciasBaseGet') }));
vi.mock('./cidades-busca', () => ({
  handlePreferenciasCidadesBuscaGet: spy('handlePreferenciasCidadesBuscaGet')
}));
vi.mock('./delete', () => ({ handlePreferenciasDeletePost: spy('handlePreferenciasDeletePost') }));
vi.mock('./list', () => ({ handlePreferenciasListGet: spy('handlePreferenciasListGet') }));
vi.mock('./save', () => ({ handlePreferenciasSavePost: spy('handlePreferenciasSavePost') }));
vi.mock('./share', () => ({ handlePreferenciasSharePost: spy('handlePreferenciasSharePost') }));
vi.mock('./share-accept', () => ({
  handlePreferenciasShareAcceptPost: spy('handlePreferenciasShareAcceptPost')
}));
vi.mock('./share-revoke', () => ({
  handlePreferenciasShareRevokePost: spy('handlePreferenciasShareRevokePost')
}));

import { apiApp } from '../../app';
import * as catchAll from '../../../../../routes/api/v1/[...path]/+server';

const CASES: Array<[string, string, string, Record<string, string>]> = [
  ['GET', '/api/v1/preferencias/base', 'handlePreferenciasBaseGet', {}],
  ['GET', '/api/v1/preferencias/cidades-busca', 'handlePreferenciasCidadesBuscaGet', {}],
  ['POST', '/api/v1/preferencias/delete', 'handlePreferenciasDeletePost', {}],
  ['GET', '/api/v1/preferencias/list', 'handlePreferenciasListGet', {}],
  ['POST', '/api/v1/preferencias/save', 'handlePreferenciasSavePost', {}],
  ['POST', '/api/v1/preferencias/share', 'handlePreferenciasSharePost', {}],
  ['POST', '/api/v1/preferencias/share-accept', 'handlePreferenciasShareAcceptPost', {}],
  ['POST', '/api/v1/preferencias/share-revoke', 'handlePreferenciasShareRevokePost', {}]
];

const SEM_HANDLER: Array<[string, string]> = [
  ['PUT', '/api/v1/preferencias/base'],
  ['PUT', '/api/v1/preferencias/cidades-busca'],
  ['PUT', '/api/v1/preferencias/delete'],
  ['PUT', '/api/v1/preferencias/list'],
  ['PUT', '/api/v1/preferencias/save'],
  ['PUT', '/api/v1/preferencias/share'],
  ['PUT', '/api/v1/preferencias/share-accept'],
  ['PUT', '/api/v1/preferencias/share-revoke']
];

function ev(method: string, path: string) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url: new URL(request.url), params: {}, locals: {}, platform: undefined } as any;
}

beforeEach(() => {
  calls.length = 0;
});

describe('preferencias → handler', () => {
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
