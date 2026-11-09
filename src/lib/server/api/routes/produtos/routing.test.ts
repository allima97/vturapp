/**
 * Roteamento de /api/v1/produtos/* no Hono (gerado por gen_routing_test.py).
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

vi.mock('./root', () => ({ handleProdutosGet: spy('handleProdutosGet') }));
vi.mock('./id', () => ({
  handleProdutosIdGet: spy('handleProdutosIdGet'),
  handleProdutosIdPatch: spy('handleProdutosIdPatch'),
  handleProdutosIdDelete: spy('handleProdutosIdDelete')
}));
vi.mock('./base', () => ({ handleProdutosBaseGet: spy('handleProdutosBaseGet') }));
vi.mock('../vendas/cidades-geograficas', async (original) => ({
  ...(await original<typeof import('../vendas/cidades-geograficas')>()),
  handleProdutosCidadesGeograficasGet: spy('handleProdutosCidadesGeograficasGet')
}));
vi.mock('./create', () => ({ handleProdutosCreatePost: spy('handleProdutosCreatePost') }));
vi.mock('./tarifas', () => ({
  handleProdutosTarifasGet: spy('handleProdutosTarifasGet'),
  handleProdutosTarifasPost: spy('handleProdutosTarifasPost')
}));

import { apiApp } from '../../app';
import * as catchAll from '../../../../../routes/api/v1/[...path]/+server';
import * as cidadesGeograficas from '../../../../../routes/api/v1/produtos/cidades-geograficas/+server';

const CASES: Array<[string, string, string, Record<string, string>]> = [
  ['GET', '/api/v1/produtos', 'handleProdutosGet', {}],
  ['GET', '/api/v1/produtos/id-123', 'handleProdutosIdGet', { id: 'id-123' }],
  ['PATCH', '/api/v1/produtos/id-123', 'handleProdutosIdPatch', { id: 'id-123' }],
  ['DELETE', '/api/v1/produtos/id-123', 'handleProdutosIdDelete', { id: 'id-123' }],
  ['GET', '/api/v1/produtos/base', 'handleProdutosBaseGet', {}],
  ['GET', '/api/v1/produtos/cidades-geograficas', 'handleProdutosCidadesGeograficasGet', {}],
  ['POST', '/api/v1/produtos/create', 'handleProdutosCreatePost', {}],
  ['GET', '/api/v1/produtos/tarifas', 'handleProdutosTarifasGet', {}],
  ['POST', '/api/v1/produtos/tarifas', 'handleProdutosTarifasPost', {}]
];

const SEM_HANDLER: Array<[string, string]> = [
  ['PUT', '/api/v1/produtos'],
  ['PUT', '/api/v1/produtos/id-123'],
  ['PUT', '/api/v1/produtos/base'],
  ['PUT', '/api/v1/produtos/create'],
  ['PUT', '/api/v1/produtos/tarifas']
];

function ev(method: string, path: string) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url: new URL(request.url), params: {}, locals: {}, platform: undefined } as any;
}

beforeEach(() => {
  calls.length = 0;
});

describe('produtos → handler', () => {
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

  it('rota específica encaminha a busca de cidades geográficas', async () => {
    const res = await cidadesGeograficas.GET(ev('GET', '/api/v1/produtos/cidades-geograficas'));
    expect(await res.text()).toBe('handleProdutosCidadesGeograficasGet');
    expect(calls).toEqual([{ name: 'handleProdutosCidadesGeograficasGet', params: {} }]);
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
