/**
 * Roteamento de /api/v1/roteiros/* no Hono (gerado por gen_routing_test.py).
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
  handleRoteirosGet: spy('handleRoteirosGet'),
  handleRoteirosPost: spy('handleRoteirosPost'),
  handleRoteirosDelete: spy('handleRoteirosDelete'),
  handleRoteirosPatch: spy('handleRoteirosPatch')
}));
vi.mock('./id', () => ({ handleRoteirosIdGet: spy('handleRoteirosIdGet') }));
vi.mock('./delete', () => ({ handleRoteirosDeleteDelete: spy('handleRoteirosDeleteDelete') }));
vi.mock('./dias-busca', () => ({ handleRoteirosDiasBuscaGet: spy('handleRoteirosDiasBuscaGet') }));
vi.mock('./cidades-busca', () => ({
  handleRoteirosCidadesBuscaGet: spy('handleRoteirosCidadesBuscaGet')
}));
vi.mock('./gerar-orcamento', () => ({
  handleRoteirosGerarOrcamentoPost: spy('handleRoteirosGerarOrcamentoPost')
}));
vi.mock('./list', () => ({ handleRoteirosListGet: spy('handleRoteirosListGet') }));
vi.mock('./save', () => ({ handleRoteirosSavePost: spy('handleRoteirosSavePost') }));
vi.mock('./sugestoes-busca', () => ({
  handleRoteirosSugestoesBuscaGet: spy('handleRoteirosSugestoesBuscaGet')
}));
vi.mock('./sugestoes-remover', () => ({
  handleRoteirosSugestoesRemoverPost: spy('handleRoteirosSugestoesRemoverPost')
}));
vi.mock('./sugestoes-salvar', () => ({
  handleRoteirosSugestoesSalvarPost: spy('handleRoteirosSugestoesSalvarPost')
}));

import { apiApp } from '../../app';
import * as catchAll from '../../../../../routes/api/v1/[...path]/+server';

const CASES: Array<[string, string, string, Record<string, string>]> = [
  ['GET', '/api/v1/roteiros', 'handleRoteirosGet', {}],
  ['POST', '/api/v1/roteiros', 'handleRoteirosPost', {}],
  ['DELETE', '/api/v1/roteiros', 'handleRoteirosDelete', {}],
  ['PATCH', '/api/v1/roteiros', 'handleRoteirosPatch', {}],
  ['GET', '/api/v1/roteiros/id-123', 'handleRoteirosIdGet', { id: 'id-123' }],
  ['DELETE', '/api/v1/roteiros/delete', 'handleRoteirosDeleteDelete', {}],
  ['GET', '/api/v1/roteiros/dias-busca', 'handleRoteirosDiasBuscaGet', {}],
  ['GET', '/api/v1/roteiros/cidades-busca', 'handleRoteirosCidadesBuscaGet', {}],
  ['POST', '/api/v1/roteiros/gerar-orcamento', 'handleRoteirosGerarOrcamentoPost', {}],
  ['GET', '/api/v1/roteiros/list', 'handleRoteirosListGet', {}],
  ['POST', '/api/v1/roteiros/save', 'handleRoteirosSavePost', {}],
  ['GET', '/api/v1/roteiros/sugestoes-busca', 'handleRoteirosSugestoesBuscaGet', {}],
  ['POST', '/api/v1/roteiros/sugestoes-remover', 'handleRoteirosSugestoesRemoverPost', {}],
  ['POST', '/api/v1/roteiros/sugestoes-salvar', 'handleRoteirosSugestoesSalvarPost', {}]
];

const SEM_HANDLER: Array<[string, string]> = [
  ['PUT', '/api/v1/roteiros'],
  ['PUT', '/api/v1/roteiros/id-123'],
  ['PUT', '/api/v1/roteiros/delete'],
  ['PUT', '/api/v1/roteiros/dias-busca'],
  ['PUT', '/api/v1/roteiros/gerar-orcamento'],
  ['PUT', '/api/v1/roteiros/list'],
  ['PUT', '/api/v1/roteiros/save'],
  ['PUT', '/api/v1/roteiros/sugestoes-busca'],
  ['PUT', '/api/v1/roteiros/sugestoes-remover'],
  ['PUT', '/api/v1/roteiros/sugestoes-salvar']
];

function ev(method: string, path: string) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url: new URL(request.url), params: {}, locals: {}, platform: undefined } as any;
}

beforeEach(() => {
  calls.length = 0;
});

describe('roteiros → handler', () => {
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
