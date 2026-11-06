/**
 * Roteamento de /api/v1/parametros/* no Hono (gerado por gen_routing_test.py).
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

vi.mock('./cambios', () => ({
  handleParametrosCambiosGet: spy('handleParametrosCambiosGet'),
  handleParametrosCambiosPost: spy('handleParametrosCambiosPost'),
  handleParametrosCambiosDelete: spy('handleParametrosCambiosDelete')
}));
vi.mock('./commission-rules', () => ({
  handleParametrosCommissionRulesGet: spy('handleParametrosCommissionRulesGet'),
  handleParametrosCommissionRulesPost: spy('handleParametrosCommissionRulesPost'),
  handleParametrosCommissionRulesPatch: spy('handleParametrosCommissionRulesPatch'),
  handleParametrosCommissionRulesDelete: spy('handleParametrosCommissionRulesDelete')
}));
vi.mock('./empresa', () => ({
  handleParametrosEmpresaGet: spy('handleParametrosEmpresaGet'),
  handleParametrosEmpresaPatch: spy('handleParametrosEmpresaPatch')
}));
vi.mock('./equipe', () => ({
  handleParametrosEquipeGet: spy('handleParametrosEquipeGet'),
  handleParametrosEquipePost: spy('handleParametrosEquipePost')
}));
vi.mock('./escalas', () => ({
  handleParametrosEscalasGet: spy('handleParametrosEscalasGet'),
  handleParametrosEscalasPost: spy('handleParametrosEscalasPost')
}));
vi.mock('./metas', () => ({
  handleParametrosMetasGet: spy('handleParametrosMetasGet'),
  handleParametrosMetasPost: spy('handleParametrosMetasPost'),
  handleParametrosMetasDelete: spy('handleParametrosMetasDelete')
}));
vi.mock('./nao-comissionaveis', () => ({
  handleParametrosNaoComissionaveisGet: spy('handleParametrosNaoComissionaveisGet'),
  handleParametrosNaoComissionaveisPost: spy('handleParametrosNaoComissionaveisPost'),
  handleParametrosNaoComissionaveisDelete: spy('handleParametrosNaoComissionaveisDelete')
}));
vi.mock('./orcamentos-pdf', () => ({
  handleParametrosOrcamentosPdfGet: spy('handleParametrosOrcamentosPdfGet'),
  handleParametrosOrcamentosPdfPost: spy('handleParametrosOrcamentosPdfPost')
}));
vi.mock('./regras-produto', () => ({
  handleParametrosRegrasProdutoGet: spy('handleParametrosRegrasProdutoGet'),
  handleParametrosRegrasProdutoPost: spy('handleParametrosRegrasProdutoPost'),
  handleParametrosRegrasProdutoDelete: spy('handleParametrosRegrasProdutoDelete')
}));
vi.mock('./regras-produto-pacote', () => ({
  handleParametrosRegrasProdutoPacoteGet: spy('handleParametrosRegrasProdutoPacoteGet'),
  handleParametrosRegrasProdutoPacotePost: spy('handleParametrosRegrasProdutoPacotePost'),
  handleParametrosRegrasProdutoPacoteDelete: spy('handleParametrosRegrasProdutoPacoteDelete')
}));
vi.mock('./sistema', () => ({
  handleParametrosSistemaGet: spy('handleParametrosSistemaGet'),
  handleParametrosSistemaPost: spy('handleParametrosSistemaPost')
}));
vi.mock('./tipo-pacotes', () => ({
  handleParametrosTipoPacotesGet: spy('handleParametrosTipoPacotesGet'),
  handleParametrosTipoPacotesPost: spy('handleParametrosTipoPacotesPost'),
  handleParametrosTipoPacotesDelete: spy('handleParametrosTipoPacotesDelete')
}));

import { apiApp } from '../../app';
import * as catchAll from '../../../../../routes/api/v1/[...path]/+server';

const CASES: Array<[string, string, string, Record<string, string>]> = [
  ['GET', '/api/v1/parametros/cambios', 'handleParametrosCambiosGet', {}],
  ['POST', '/api/v1/parametros/cambios', 'handleParametrosCambiosPost', {}],
  ['DELETE', '/api/v1/parametros/cambios', 'handleParametrosCambiosDelete', {}],
  ['GET', '/api/v1/parametros/commission-rules', 'handleParametrosCommissionRulesGet', {}],
  ['POST', '/api/v1/parametros/commission-rules', 'handleParametrosCommissionRulesPost', {}],
  ['PATCH', '/api/v1/parametros/commission-rules', 'handleParametrosCommissionRulesPatch', {}],
  ['DELETE', '/api/v1/parametros/commission-rules', 'handleParametrosCommissionRulesDelete', {}],
  ['GET', '/api/v1/parametros/empresa', 'handleParametrosEmpresaGet', {}],
  ['PATCH', '/api/v1/parametros/empresa', 'handleParametrosEmpresaPatch', {}],
  ['GET', '/api/v1/parametros/equipe', 'handleParametrosEquipeGet', {}],
  ['POST', '/api/v1/parametros/equipe', 'handleParametrosEquipePost', {}],
  ['GET', '/api/v1/parametros/escalas', 'handleParametrosEscalasGet', {}],
  ['POST', '/api/v1/parametros/escalas', 'handleParametrosEscalasPost', {}],
  ['GET', '/api/v1/parametros/metas', 'handleParametrosMetasGet', {}],
  ['POST', '/api/v1/parametros/metas', 'handleParametrosMetasPost', {}],
  ['DELETE', '/api/v1/parametros/metas', 'handleParametrosMetasDelete', {}],
  ['GET', '/api/v1/parametros/nao-comissionaveis', 'handleParametrosNaoComissionaveisGet', {}],
  ['POST', '/api/v1/parametros/nao-comissionaveis', 'handleParametrosNaoComissionaveisPost', {}],
  [
    'DELETE',
    '/api/v1/parametros/nao-comissionaveis',
    'handleParametrosNaoComissionaveisDelete',
    {}
  ],
  ['GET', '/api/v1/parametros/orcamentos-pdf', 'handleParametrosOrcamentosPdfGet', {}],
  ['POST', '/api/v1/parametros/orcamentos-pdf', 'handleParametrosOrcamentosPdfPost', {}],
  ['GET', '/api/v1/parametros/regras-produto', 'handleParametrosRegrasProdutoGet', {}],
  ['POST', '/api/v1/parametros/regras-produto', 'handleParametrosRegrasProdutoPost', {}],
  ['DELETE', '/api/v1/parametros/regras-produto', 'handleParametrosRegrasProdutoDelete', {}],
  ['GET', '/api/v1/parametros/regras-produto-pacote', 'handleParametrosRegrasProdutoPacoteGet', {}],
  [
    'POST',
    '/api/v1/parametros/regras-produto-pacote',
    'handleParametrosRegrasProdutoPacotePost',
    {}
  ],
  [
    'DELETE',
    '/api/v1/parametros/regras-produto-pacote',
    'handleParametrosRegrasProdutoPacoteDelete',
    {}
  ],
  ['GET', '/api/v1/parametros/sistema', 'handleParametrosSistemaGet', {}],
  ['POST', '/api/v1/parametros/sistema', 'handleParametrosSistemaPost', {}],
  ['GET', '/api/v1/parametros/tipo-pacotes', 'handleParametrosTipoPacotesGet', {}],
  ['POST', '/api/v1/parametros/tipo-pacotes', 'handleParametrosTipoPacotesPost', {}],
  ['DELETE', '/api/v1/parametros/tipo-pacotes', 'handleParametrosTipoPacotesDelete', {}]
];

const SEM_HANDLER: Array<[string, string]> = [
  ['PUT', '/api/v1/parametros/cambios'],
  ['PUT', '/api/v1/parametros/commission-rules'],
  ['PUT', '/api/v1/parametros/empresa'],
  ['PUT', '/api/v1/parametros/equipe'],
  ['PUT', '/api/v1/parametros/escalas'],
  ['PUT', '/api/v1/parametros/metas'],
  ['PUT', '/api/v1/parametros/nao-comissionaveis'],
  ['PUT', '/api/v1/parametros/orcamentos-pdf'],
  ['PUT', '/api/v1/parametros/regras-produto'],
  ['PUT', '/api/v1/parametros/regras-produto-pacote'],
  ['PUT', '/api/v1/parametros/sistema'],
  ['PUT', '/api/v1/parametros/tipo-pacotes']
];

function ev(method: string, path: string) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url: new URL(request.url), params: {}, locals: {}, platform: undefined } as any;
}

beforeEach(() => {
  calls.length = 0;
});

describe('parametros → handler', () => {
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
