/**
 * Roteamento de /api/v1/orcamentos/* no Hono (gerado por gen_routing_test.py).
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
  },
);

vi.mock('./id', () => ({ handleOrcamentosIdGet: spy('handleOrcamentosIdGet'), handleOrcamentosIdPatch: spy('handleOrcamentosIdPatch'), handleOrcamentosIdDelete: spy('handleOrcamentosIdDelete') }));
vi.mock('./id-resumo-venda', () => ({ handleOrcamentosIdResumoVendaGet: spy('handleOrcamentosIdResumoVendaGet') }));
vi.mock('./cidades-busca', () => ({ handleOrcamentosCidadesBuscaGet: spy('handleOrcamentosCidadesBuscaGet') }));
vi.mock('./cliente-create', () => ({ handleOrcamentosClienteCreatePost: spy('handleOrcamentosClienteCreatePost') }));
vi.mock('./clientes', () => ({ handleOrcamentosClientesGet: spy('handleOrcamentosClientesGet') }));
vi.mock('./create', () => ({ handleOrcamentosCreatePost: spy('handleOrcamentosCreatePost') }));
vi.mock('./delete', () => ({ handleOrcamentosDeletePost: spy('handleOrcamentosDeletePost') }));
vi.mock('./interacao', () => ({ handleOrcamentosInteracaoPost: spy('handleOrcamentosInteracaoPost'), handleOrcamentosInteracaoGet: spy('handleOrcamentosInteracaoGet') }));
vi.mock('./list', () => ({ handleOrcamentosListGet: spy('handleOrcamentosListGet') }));
vi.mock('./produtos', () => ({ handleOrcamentosProdutosGet: spy('handleOrcamentosProdutosGet') }));
vi.mock('./save', () => ({ handleOrcamentosSavePost: spy('handleOrcamentosSavePost') }));
vi.mock('./status', () => ({ handleOrcamentosStatusPatch: spy('handleOrcamentosStatusPatch') }));
vi.mock('./tipos', () => ({ handleOrcamentosTiposGet: spy('handleOrcamentosTiposGet') }));

import { apiApp } from '../../app';
import * as catchAll from '../../../../../routes/api/v1/[...path]/+server';

const CASES: Array<[string, string, string, Record<string, string>]> = [
  ['GET', '/api/v1/orcamentos/id-123', 'handleOrcamentosIdGet', {"id": "id-123"}],
  ['PATCH', '/api/v1/orcamentos/id-123', 'handleOrcamentosIdPatch', {"id": "id-123"}],
  ['DELETE', '/api/v1/orcamentos/id-123', 'handleOrcamentosIdDelete', {"id": "id-123"}],
  ['GET', '/api/v1/orcamentos/id-123/resumo-venda', 'handleOrcamentosIdResumoVendaGet', {"id": "id-123"}],
  ['GET', '/api/v1/orcamentos/cidades-busca', 'handleOrcamentosCidadesBuscaGet', {}],
  ['POST', '/api/v1/orcamentos/cliente-create', 'handleOrcamentosClienteCreatePost', {}],
  ['GET', '/api/v1/orcamentos/clientes', 'handleOrcamentosClientesGet', {}],
  ['POST', '/api/v1/orcamentos/create', 'handleOrcamentosCreatePost', {}],
  ['POST', '/api/v1/orcamentos/delete', 'handleOrcamentosDeletePost', {}],
  ['POST', '/api/v1/orcamentos/interacao', 'handleOrcamentosInteracaoPost', {}],
  ['GET', '/api/v1/orcamentos/interacao', 'handleOrcamentosInteracaoGet', {}],
  // apelido (antes: orcamentos/interaction/+server.ts reexportava ../interacao)
  ['GET', '/api/v1/orcamentos/interaction', 'handleOrcamentosInteracaoGet', {}],
  ['POST', '/api/v1/orcamentos/interaction', 'handleOrcamentosInteracaoPost', {}],
  ['GET', '/api/v1/orcamentos/list', 'handleOrcamentosListGet', {}],
  ['GET', '/api/v1/orcamentos/produtos', 'handleOrcamentosProdutosGet', {}],
  ['POST', '/api/v1/orcamentos/save', 'handleOrcamentosSavePost', {}],
  ['PATCH', '/api/v1/orcamentos/status', 'handleOrcamentosStatusPatch', {}],
  ['GET', '/api/v1/orcamentos/tipos', 'handleOrcamentosTiposGet', {}],
];

const SEM_HANDLER: Array<[string, string]> = [
  ['PUT', '/api/v1/orcamentos/id-123'],
  ['PUT', '/api/v1/orcamentos/id-123/resumo-venda'],
  ['PUT', '/api/v1/orcamentos/cidades-busca'],
  ['PUT', '/api/v1/orcamentos/cliente-create'],
  ['PUT', '/api/v1/orcamentos/clientes'],
  ['PUT', '/api/v1/orcamentos/create'],
  ['PUT', '/api/v1/orcamentos/delete'],
  ['PUT', '/api/v1/orcamentos/interacao'],
  ['PUT', '/api/v1/orcamentos/list'],
  ['PUT', '/api/v1/orcamentos/produtos'],
  ['PUT', '/api/v1/orcamentos/save'],
  ['PUT', '/api/v1/orcamentos/status'],
  ['PUT', '/api/v1/orcamentos/tipos'],
];

function ev(method: string, path: string) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url: new URL(request.url), params: {}, locals: {}, platform: undefined } as any;
}

beforeEach(() => {
  calls.length = 0;
});

describe('orcamentos → handler', () => {
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
