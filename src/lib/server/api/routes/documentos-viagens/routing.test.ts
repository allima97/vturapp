/**
 * Roteamento de /api/v1/documentos-viagens/* no Hono (gerado por gen_routing_test.py).
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

vi.mock('../operacao/documentos-viagens', () => ({
  handleOperacaoDocumentosViagensGet: spy('handleOperacaoDocumentosViagensGet'),
  handleOperacaoDocumentosViagensDelete: spy('handleOperacaoDocumentosViagensDelete')
}));
vi.mock('./create', () => ({
  handleDocumentosViagensCreatePost: spy('handleDocumentosViagensCreatePost')
}));
vi.mock('./delete', () => ({
  handleDocumentosViagensDeletePost: spy('handleDocumentosViagensDeletePost')
}));
vi.mock('./save-template', () => ({
  handleDocumentosViagensSaveTemplatePost: spy('handleDocumentosViagensSaveTemplatePost')
}));
vi.mock('./update', () => ({
  handleDocumentosViagensUpdatePost: spy('handleDocumentosViagensUpdatePost')
}));

import { apiApp } from '../../app';
import * as catchAll from '../../../../../routes/api/v1/[...path]/+server';

const CASES: Array<[string, string, string, Record<string, string>]> = [
  // apelido (antes: documentos-viagens/list/+server.ts reexportava GET de operacao/documentos-viagens)
  ['GET', '/api/v1/documentos-viagens/list', 'handleOperacaoDocumentosViagensGet', {}],
  ['POST', '/api/v1/documentos-viagens/create', 'handleDocumentosViagensCreatePost', {}],
  ['POST', '/api/v1/documentos-viagens/delete', 'handleDocumentosViagensDeletePost', {}],
  [
    'POST',
    '/api/v1/documentos-viagens/save-template',
    'handleDocumentosViagensSaveTemplatePost',
    {}
  ],
  ['POST', '/api/v1/documentos-viagens/update', 'handleDocumentosViagensUpdatePost', {}]
];

const SEM_HANDLER: Array<[string, string]> = [
  ['PUT', '/api/v1/documentos-viagens/create'],
  ['PUT', '/api/v1/documentos-viagens/delete'],
  ['PUT', '/api/v1/documentos-viagens/save-template'],
  ['PUT', '/api/v1/documentos-viagens/update']
];

function ev(method: string, path: string) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url: new URL(request.url), params: {}, locals: {}, platform: undefined } as any;
}

beforeEach(() => {
  calls.length = 0;
});

describe('documentos-viagens → handler', () => {
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
