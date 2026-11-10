/**
 * Roteamento de /api/v1/operacao/* no Hono (gerado por gen_routing_test.py).
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

vi.mock('./campanhas', () => ({
  handleOperacaoCampanhasGet: spy('handleOperacaoCampanhasGet'),
  handleOperacaoCampanhasPost: spy('handleOperacaoCampanhasPost'),
  handleOperacaoCampanhasDelete: spy('handleOperacaoCampanhasDelete')
}));
vi.mock('./documentos-viagens', () => ({
  handleOperacaoDocumentosViagensGet: spy('handleOperacaoDocumentosViagensGet'),
  handleOperacaoDocumentosViagensDelete: spy('handleOperacaoDocumentosViagensDelete')
}));
vi.mock('./preferencias', () => ({
  handleOperacaoPreferenciasGet: spy('handleOperacaoPreferenciasGet'),
  handleOperacaoPreferenciasPost: spy('handleOperacaoPreferenciasPost'),
  handleOperacaoPreferenciasDelete: spy('handleOperacaoPreferenciasDelete'),
  handleOperacaoPreferenciasPatch: spy('handleOperacaoPreferenciasPatch')
}));
vi.mock('./recados', () => ({
  handleOperacaoRecadosGet: spy('handleOperacaoRecadosGet'),
  handleOperacaoRecadosPost: spy('handleOperacaoRecadosPost'),
  handleOperacaoRecadosDelete: spy('handleOperacaoRecadosDelete')
}));
vi.mock('./sac', () => ({
  handleOperacaoSacGet: spy('handleOperacaoSacGet'),
  handleOperacaoSacPost: spy('handleOperacaoSacPost'),
  handleOperacaoSacDelete: spy('handleOperacaoSacDelete')
}));

import { apiApp } from '../../app';
import * as catchAll from '../../../../../routes/api/v1/[...path]/+server';

const CASES: Array<[string, string, string, Record<string, string>]> = [
  ['GET', '/api/v1/operacao/campanhas', 'handleOperacaoCampanhasGet', {}],
  ['POST', '/api/v1/operacao/campanhas', 'handleOperacaoCampanhasPost', {}],
  ['DELETE', '/api/v1/operacao/campanhas', 'handleOperacaoCampanhasDelete', {}],
  ['GET', '/api/v1/operacao/documentos-viagens', 'handleOperacaoDocumentosViagensGet', {}],
  ['DELETE', '/api/v1/operacao/documentos-viagens', 'handleOperacaoDocumentosViagensDelete', {}],
  ['GET', '/api/v1/operacao/preferencias', 'handleOperacaoPreferenciasGet', {}],
  ['POST', '/api/v1/operacao/preferencias', 'handleOperacaoPreferenciasPost', {}],
  ['DELETE', '/api/v1/operacao/preferencias', 'handleOperacaoPreferenciasDelete', {}],
  ['PATCH', '/api/v1/operacao/preferencias', 'handleOperacaoPreferenciasPatch', {}],
  ['GET', '/api/v1/operacao/recados', 'handleOperacaoRecadosGet', {}],
  ['POST', '/api/v1/operacao/recados', 'handleOperacaoRecadosPost', {}],
  ['DELETE', '/api/v1/operacao/recados', 'handleOperacaoRecadosDelete', {}],
  ['GET', '/api/v1/operacao/sac', 'handleOperacaoSacGet', {}],
  ['POST', '/api/v1/operacao/sac', 'handleOperacaoSacPost', {}],
  ['DELETE', '/api/v1/operacao/sac', 'handleOperacaoSacDelete', {}]
];

const SEM_HANDLER: Array<[string, string]> = [
  ['PUT', '/api/v1/operacao/campanhas'],
  ['PUT', '/api/v1/operacao/documentos-viagens'],
  ['PUT', '/api/v1/operacao/preferencias'],
  ['PUT', '/api/v1/operacao/recados'],
  ['PUT', '/api/v1/operacao/sac']
];

function ev(method: string, path: string) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url: new URL(request.url), params: {}, locals: {}, platform: undefined } as any;
}

beforeEach(() => {
  calls.length = 0;
});

describe('operacao → handler', () => {
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
