/**
 * Roteamento das rotas de vendas no Hono (Fase 2.2).
 *
 * Os handlers são módulos movidos SEM alteração dos +server.ts originais
 * (identidade textual verificada na migração). Este teste garante a outra
 * metade: cada URL + método chega exatamente no handler certo, inclusive
 * `event.params.id` — tanto pela rota específica quanto pelo catch-all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as Array<{ name: string; params: Record<string, unknown> }>);
const spy = vi.hoisted(
  () => (name: string) => async (event: { params: Record<string, unknown> }) => {
    calls.push({ name, params: { ...event.params } });
    return new Response(name, { status: 200 });
  },
);

vi.mock('./root', () => ({ handleVendasGet: spy("handleVendasGet") }));
vi.mock('./cadastro-base', () => ({ handleVendasCadastroBaseGet: spy("handleVendasCadastroBaseGet") }));
vi.mock('./cadastro-save', () => ({ handleVendasCadastroSavePost: spy("handleVendasCadastroSavePost") }));
vi.mock('./cancel', () => ({ handleVendasCancelPost: spy("handleVendasCancelPost") }));
vi.mock('./cidades-busca', () => ({ handleVendasCidadesBuscaGet: spy("handleVendasCidadesBuscaGet") }));
vi.mock('./complementares', () => ({ handleVendasComplementaresGet: spy("handleVendasComplementaresGet") }));
vi.mock('./create', () => ({ handleVendasCreatePost: spy("handleVendasCreatePost") }));
vi.mock('./gestor-equipe', () => ({ handleVendasGestorEquipeGet: spy("handleVendasGestorEquipeGet") }));
vi.mock('./list', () => ({ handleVendasListGet: spy("handleVendasListGet") }));
vi.mock('./merge', () => ({ handleVendasMergePost: spy("handleVendasMergePost") }));
vi.mock('./merge-candidates', () => ({ handleVendasMergeCandidatesGet: spy("handleVendasMergeCandidatesGet") }));
vi.mock('./recibo-complementar-link', () => ({ handleVendasReciboComplementarLinkPost: spy("handleVendasReciboComplementarLinkPost") }));
vi.mock('./recibo-complementar-remove', () => ({ handleVendasReciboComplementarRemovePost: spy("handleVendasReciboComplementarRemovePost") }));
vi.mock('./recibo-delete', () => ({ handleVendasReciboDeletePost: spy("handleVendasReciboDeletePost") }));
vi.mock('./recibo-edit', () => ({ handleVendasReciboEditPatch: spy("handleVendasReciboEditPatch") }));
vi.mock('./recibo-notas', () => ({ handleVendasReciboNotasGet: spy("handleVendasReciboNotasGet") }));
vi.mock('./recibo-principal', () => ({ handleVendasReciboPrincipalPost: spy("handleVendasReciboPrincipalPost") }));
vi.mock('./id-ranking-recibos', () => ({ handleVendasIdRankingRecibosGet: spy("handleVendasIdRankingRecibosGet") }));
vi.mock('./id', () => ({ handleVendasIdGet: spy("handleVendasIdGet"), handleVendasIdPatch: spy("handleVendasIdPatch"), handleVendasIdDelete: spy("handleVendasIdDelete") }));
vi.mock('./kpis', () => ({ handleVendasKpis: spy('handleVendasKpis') }));
vi.mock('./status', () => ({ handleVendasStatusPatch: spy('handleVendasStatusPatch') }));

import { apiApp } from '../../app';

const ID = '33333333-3333-4333-8333-333333333333';

function call(method: string, path: string, params: Record<string, string> = {}) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  const event = { request, url: new URL(request.url), params, locals: {}, platform: undefined };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return apiApp.fetch(request, { event: event as any });
}

beforeEach(() => {
  calls.length = 0;
});

describe('rotas /api/v1/vendas no Hono', () => {
  it.each(['/api/v1/vendas/importar-contrato', '/api/v1/importar-vendas', '/api/v1/orcamentos/importar'])(
    'recusa POST no endpoint removido %s', async (path) => {
      const res = await call('POST', path);
      expect(res.status).toBe(404);
      expect(calls).toHaveLength(0);
    }
  );
  it.each([
  ["GET", "/api/v1/vendas", "handleVendasGet"],
  ["GET", "/api/v1/vendas/cadastro-base", "handleVendasCadastroBaseGet"],
  ["POST", "/api/v1/vendas/cadastro-save", "handleVendasCadastroSavePost"],
  ["POST", "/api/v1/vendas/cancel", "handleVendasCancelPost"],
  ["GET", "/api/v1/vendas/cidades-busca", "handleVendasCidadesBuscaGet"],
  ["GET", "/api/v1/vendas/complementares", "handleVendasComplementaresGet"],
  ["POST", "/api/v1/vendas/create", "handleVendasCreatePost"],
  ["GET", "/api/v1/vendas/gestor-equipe", "handleVendasGestorEquipeGet"],
  ["GET", "/api/v1/vendas/list", "handleVendasListGet"],
  ["POST", "/api/v1/vendas/merge", "handleVendasMergePost"],
  ["GET", "/api/v1/vendas/merge-candidates", "handleVendasMergeCandidatesGet"],
  ["POST", "/api/v1/vendas/recibo-complementar-link", "handleVendasReciboComplementarLinkPost"],
  ["POST", "/api/v1/vendas/recibo-complementar-remove", "handleVendasReciboComplementarRemovePost"],
  ["POST", "/api/v1/vendas/recibo-delete", "handleVendasReciboDeletePost"],
  ["PATCH", "/api/v1/vendas/recibo-edit", "handleVendasReciboEditPatch"],
  ["GET", "/api/v1/vendas/recibo-notas", "handleVendasReciboNotasGet"],
  ["POST", "/api/v1/vendas/recibo-principal", "handleVendasReciboPrincipalPost"],
  ["GET", "/api/v1/vendas/33333333-3333-4333-8333-333333333333/ranking-recibos", "handleVendasIdRankingRecibosGet"],
  ["GET", "/api/v1/vendas/33333333-3333-4333-8333-333333333333", "handleVendasIdGet"],
  ["PATCH", "/api/v1/vendas/33333333-3333-4333-8333-333333333333", "handleVendasIdPatch"],
  ["DELETE", "/api/v1/vendas/33333333-3333-4333-8333-333333333333", "handleVendasIdDelete"],
    ['GET', '/api/v1/vendas/kpis', 'handleVendasKpis'],
    ['PATCH', '/api/v1/vendas/status', 'handleVendasStatusPatch'],
  ])('%s %s → %s', async (method, path, handler) => {
    const res = await call(method, path);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(handler);
    expect(calls).toHaveLength(1);
  });

  it('rotas estáticas não são capturadas por /:id', async () => {
    await call('GET', '/api/v1/vendas/list');
    await call('PATCH', '/api/v1/vendas/status');
    await call('PATCH', '/api/v1/vendas/recibo-edit');
    expect(calls.map((c) => c.name)).toEqual([
      'handleVendasListGet',
      'handleVendasStatusPatch',
      'handleVendasReciboEditPatch',
    ]);
  });

  it('params.id vem da rota Hono (vale também quando chega pelo catch-all)', async () => {
    await call('GET', `/api/v1/vendas/${ID}`, { path: `vendas/${ID}` });
    await call('DELETE', `/api/v1/vendas/${ID}`, { id: ID });
    await call('GET', `/api/v1/vendas/${ID}/ranking-recibos`, { path: 'x' });
    expect(calls).toEqual([
      { name: 'handleVendasIdGet', params: { path: `vendas/${ID}`, id: ID } },
      { name: 'handleVendasIdDelete', params: { id: ID } },
      { name: 'handleVendasIdRankingRecibosGet', params: { path: 'x', id: ID } },
    ]);
  });

  it('método não suportado → 404 do Hono', async () => {
    const res = await call('PUT', '/api/v1/vendas/list');
    expect(res.status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});
