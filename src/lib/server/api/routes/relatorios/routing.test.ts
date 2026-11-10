/**
 * Roteamento de /api/v1/relatorios/* no Hono (gerado por gen_routing_test.py).
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

vi.mock('./base', () => ({ handleRelatoriosBaseGet: spy('handleRelatoriosBaseGet') }));
vi.mock('./cidades-busca', () => ({
  handleRelatoriosCidadesBuscaGet: spy('handleRelatoriosCidadesBuscaGet')
}));
vi.mock('./clientes', () => ({ handleRelatoriosClientesGet: spy('handleRelatoriosClientesGet') }));
vi.mock('./destinos', () => ({ handleRelatoriosDestinosGet: spy('handleRelatoriosDestinosGet') }));
vi.mock('./produtos', () => ({ handleRelatoriosProdutosGet: spy('handleRelatoriosProdutosGet') }));
vi.mock('./produtos-recibos', () => ({
  handleRelatoriosProdutosRecibosGet: spy('handleRelatoriosProdutosRecibosGet')
}));
vi.mock('./ranking', () => ({ handleRelatoriosRankingGet: spy('handleRelatoriosRankingGet') }));
vi.mock('./ranking-debug', () => ({
  handleRelatoriosRankingDebugGet: spy('handleRelatoriosRankingDebugGet'),
  handleRelatoriosRankingDebugPost: spy('handleRelatoriosRankingDebugPost')
}));
vi.mock('./ranking-vendas', () => ({
  handleRelatoriosRankingVendasGet: spy('handleRelatoriosRankingVendasGet')
}));
vi.mock('./vendas', () => ({ handleRelatoriosVendasGet: spy('handleRelatoriosVendasGet') }));
vi.mock('./vendas-por-cliente', () => ({
  handleRelatoriosVendasPorClienteGet: spy('handleRelatoriosVendasPorClienteGet')
}));
vi.mock('./vendas-por-destino', () => ({
  handleRelatoriosVendasPorDestinoGet: spy('handleRelatoriosVendasPorDestinoGet')
}));
vi.mock('./vendas-por-produto', () => ({
  handleRelatoriosVendasPorProdutoGet: spy('handleRelatoriosVendasPorProdutoGet')
}));

import { apiApp } from '../../app';
import * as catchAll from '../../../../../routes/api/v1/[...path]/+server';

const CASES: Array<[string, string, string, Record<string, string>]> = [
  ['GET', '/api/v1/relatorios/base', 'handleRelatoriosBaseGet', {}],
  ['GET', '/api/v1/relatorios/cidades-busca', 'handleRelatoriosCidadesBuscaGet', {}],
  ['GET', '/api/v1/relatorios/clientes', 'handleRelatoriosClientesGet', {}],
  ['GET', '/api/v1/relatorios/destinos', 'handleRelatoriosDestinosGet', {}],
  ['GET', '/api/v1/relatorios/produtos', 'handleRelatoriosProdutosGet', {}],
  ['GET', '/api/v1/relatorios/produtos-recibos', 'handleRelatoriosProdutosRecibosGet', {}],
  ['GET', '/api/v1/relatorios/ranking', 'handleRelatoriosRankingGet', {}],
  ['GET', '/api/v1/relatorios/ranking-debug', 'handleRelatoriosRankingDebugGet', {}],
  ['POST', '/api/v1/relatorios/ranking-debug', 'handleRelatoriosRankingDebugPost', {}],
  ['GET', '/api/v1/relatorios/ranking-vendas', 'handleRelatoriosRankingVendasGet', {}],
  ['GET', '/api/v1/relatorios/vendas', 'handleRelatoriosVendasGet', {}],
  ['GET', '/api/v1/relatorios/vendas-por-cliente', 'handleRelatoriosVendasPorClienteGet', {}],
  ['GET', '/api/v1/relatorios/vendas-por-destino', 'handleRelatoriosVendasPorDestinoGet', {}],
  ['GET', '/api/v1/relatorios/vendas-por-produto', 'handleRelatoriosVendasPorProdutoGet', {}]
];

const SEM_HANDLER: Array<[string, string]> = [
  ['PUT', '/api/v1/relatorios/base'],
  ['PUT', '/api/v1/relatorios/cidades-busca'],
  ['PUT', '/api/v1/relatorios/clientes'],
  ['PUT', '/api/v1/relatorios/destinos'],
  ['PUT', '/api/v1/relatorios/produtos'],
  ['PUT', '/api/v1/relatorios/produtos-recibos'],
  ['PUT', '/api/v1/relatorios/ranking'],
  ['PUT', '/api/v1/relatorios/ranking-debug'],
  ['PUT', '/api/v1/relatorios/ranking-vendas'],
  ['PUT', '/api/v1/relatorios/vendas'],
  ['PUT', '/api/v1/relatorios/vendas-por-cliente'],
  ['PUT', '/api/v1/relatorios/vendas-por-destino'],
  ['PUT', '/api/v1/relatorios/vendas-por-produto']
];

function ev(method: string, path: string) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url: new URL(request.url), params: {}, locals: {}, platform: undefined } as any;
}

beforeEach(() => {
  calls.length = 0;
});

describe('relatorios → handler', () => {
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
