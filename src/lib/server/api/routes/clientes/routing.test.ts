/**
 * Roteamento de /api/v1/clientes/* no Hono (gerado por gen_routing_test.py).
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

vi.mock('./id-acompanhantes-acompanhanteId', () => ({
  handleClientesIdAcompanhantesAcompanhanteIdPatch: spy(
    'handleClientesIdAcompanhantesAcompanhanteIdPatch'
  ),
  handleClientesIdAcompanhantesAcompanhanteIdDelete: spy(
    'handleClientesIdAcompanhantesAcompanhanteIdDelete'
  )
}));
vi.mock('./root', () => ({ handleClientesGet: spy('handleClientesGet') }));
vi.mock('./id', () => ({
  handleClientesIdGet: spy('handleClientesIdGet'),
  handleClientesIdPatch: spy('handleClientesIdPatch'),
  handleClientesIdDelete: spy('handleClientesIdDelete')
}));
vi.mock('./id-acompanhantes', () => ({
  handleClientesIdAcompanhantesGet: spy('handleClientesIdAcompanhantesGet'),
  handleClientesIdAcompanhantesPost: spy('handleClientesIdAcompanhantesPost')
}));
vi.mock('./avisos-history', () => ({
  handleClientesAvisosHistoryGet: spy('handleClientesAvisosHistoryGet')
}));
vi.mock('./avisos-send', () => ({
  handleClientesAvisosSendGet: spy('handleClientesAvisosSendGet'),
  handleClientesAvisosSendPost: spy('handleClientesAvisosSendPost')
}));
vi.mock('./avisos-templates', () => ({
  handleClientesAvisosTemplatesGet: spy('handleClientesAvisosTemplatesGet')
}));
vi.mock('./create', () => ({ handleClientesCreatePost: spy('handleClientesCreatePost') }));
vi.mock('./delete', () => ({ handleClientesDeleteDelete: spy('handleClientesDeleteDelete') }));
vi.mock('./historico', () => ({ handleClientesHistoricoGet: spy('handleClientesHistoricoGet') }));
vi.mock('./list', () => ({ handleClientesListGet: spy('handleClientesListGet') }));
vi.mock('./resolve-import', () => ({
  handleClientesResolveImportPost: spy('handleClientesResolveImportPost')
}));
vi.mock('./template-dispatches', () => ({
  handleClientesTemplateDispatchesGet: spy('handleClientesTemplateDispatchesGet'),
  handleClientesTemplateDispatchesPost: spy('handleClientesTemplateDispatchesPost')
}));
vi.mock('./templates-send', () => ({
  handleClientesTemplatesSendPost: spy('handleClientesTemplatesSendPost')
}));

import { apiApp } from '../../app';
import * as catchAll from '../../../../../routes/api/v1/[...path]/+server';

const CASES: Array<[string, string, string, Record<string, string>]> = [
  [
    'PATCH',
    '/api/v1/clientes/id-123/acompanhantes/ac-9',
    'handleClientesIdAcompanhantesAcompanhanteIdPatch',
    { id: 'id-123', acompanhanteId: 'ac-9' }
  ],
  [
    'DELETE',
    '/api/v1/clientes/id-123/acompanhantes/ac-9',
    'handleClientesIdAcompanhantesAcompanhanteIdDelete',
    { id: 'id-123', acompanhanteId: 'ac-9' }
  ],
  ['GET', '/api/v1/clientes', 'handleClientesGet', {}],
  ['GET', '/api/v1/clientes/id-123', 'handleClientesIdGet', { id: 'id-123' }],
  ['PATCH', '/api/v1/clientes/id-123', 'handleClientesIdPatch', { id: 'id-123' }],
  ['DELETE', '/api/v1/clientes/id-123', 'handleClientesIdDelete', { id: 'id-123' }],
  [
    'GET',
    '/api/v1/clientes/id-123/acompanhantes',
    'handleClientesIdAcompanhantesGet',
    { id: 'id-123' }
  ],
  [
    'POST',
    '/api/v1/clientes/id-123/acompanhantes',
    'handleClientesIdAcompanhantesPost',
    { id: 'id-123' }
  ],
  ['GET', '/api/v1/clientes/avisos/history', 'handleClientesAvisosHistoryGet', {}],
  ['GET', '/api/v1/clientes/avisos/send', 'handleClientesAvisosSendGet', {}],
  ['POST', '/api/v1/clientes/avisos/send', 'handleClientesAvisosSendPost', {}],
  ['GET', '/api/v1/clientes/avisos/templates', 'handleClientesAvisosTemplatesGet', {}],
  ['POST', '/api/v1/clientes/create', 'handleClientesCreatePost', {}],
  ['DELETE', '/api/v1/clientes/delete', 'handleClientesDeleteDelete', {}],
  ['GET', '/api/v1/clientes/historico', 'handleClientesHistoricoGet', {}],
  ['GET', '/api/v1/clientes/list', 'handleClientesListGet', {}],
  ['POST', '/api/v1/clientes/resolve-import', 'handleClientesResolveImportPost', {}],
  ['GET', '/api/v1/clientes/template-dispatches', 'handleClientesTemplateDispatchesGet', {}],
  ['POST', '/api/v1/clientes/template-dispatches', 'handleClientesTemplateDispatchesPost', {}],
  ['POST', '/api/v1/clientes/templates/send', 'handleClientesTemplatesSendPost', {}]
];

const SEM_HANDLER: Array<[string, string]> = [
  ['PUT', '/api/v1/clientes'],
  ['PUT', '/api/v1/clientes/id-123'],
  ['PUT', '/api/v1/clientes/id-123/acompanhantes'],
  ['PUT', '/api/v1/clientes/avisos/history'],
  ['PUT', '/api/v1/clientes/avisos/send'],
  ['PUT', '/api/v1/clientes/avisos/templates'],
  ['PUT', '/api/v1/clientes/create'],
  ['PUT', '/api/v1/clientes/delete'],
  ['PUT', '/api/v1/clientes/historico'],
  ['PUT', '/api/v1/clientes/list'],
  ['PUT', '/api/v1/clientes/resolve-import'],
  ['PUT', '/api/v1/clientes/template-dispatches'],
  ['PUT', '/api/v1/clientes/templates/send']
];

function ev(method: string, path: string) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url: new URL(request.url), params: {}, locals: {}, platform: undefined } as any;
}

beforeEach(() => {
  calls.length = 0;
});

describe('clientes → handler', () => {
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
