/**
 * Roteamento de /api/v1/dashboard/* no Hono (gerado por gen_routing_test.py).
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

vi.mock('./aniversariantes', () => ({
  handleDashboardAniversariantesGet: spy('handleDashboardAniversariantesGet')
}));
vi.mock('./base', () => ({ handleDashboardBaseGet: spy('handleDashboardBaseGet') }));
vi.mock('./comparativo-empresas', () => ({
  handleDashboardComparativoEmpresasGet: spy('handleDashboardComparativoEmpresasGet')
}));
vi.mock('./consultorias', () => ({
  handleDashboardConsultoriasGet: spy('handleDashboardConsultoriasGet')
}));
vi.mock('./debug-aggregates', () => ({
  handleDashboardDebugAggregatesGet: spy('handleDashboardDebugAggregatesGet')
}));
vi.mock('./evolucao-anual', () => ({
  handleDashboardEvolucaoAnualGet: spy('handleDashboardEvolucaoAnualGet')
}));
vi.mock('./follow-ups', () => ({
  handleDashboardFollowUpsGet: spy('handleDashboardFollowUpsGet')
}));
vi.mock('./summary', () => ({ handleDashboardSummaryGet: spy('handleDashboardSummaryGet') }));
vi.mock('./ultimas-compras', () => ({
  handleDashboardUltimasComprasGet: spy('handleDashboardUltimasComprasGet')
}));
vi.mock('./viagens', () => ({ handleDashboardViagensGet: spy('handleDashboardViagensGet') }));
vi.mock('./widgets', () => ({
  handleDashboardWidgetsGet: spy('handleDashboardWidgetsGet'),
  handleDashboardWidgetsPost: spy('handleDashboardWidgetsPost')
}));

import { apiApp } from '../../app';
import * as catchAll from '../../../../../routes/api/v1/[...path]/+server';

const CASES: Array<[string, string, string, Record<string, string>]> = [
  ['GET', '/api/v1/dashboard/aniversariantes', 'handleDashboardAniversariantesGet', {}],
  ['GET', '/api/v1/dashboard/base', 'handleDashboardBaseGet', {}],
  ['GET', '/api/v1/dashboard/comparativo-empresas', 'handleDashboardComparativoEmpresasGet', {}],
  ['GET', '/api/v1/dashboard/consultorias', 'handleDashboardConsultoriasGet', {}],
  ['GET', '/api/v1/dashboard/debug-aggregates', 'handleDashboardDebugAggregatesGet', {}],
  ['GET', '/api/v1/dashboard/evolucao-anual', 'handleDashboardEvolucaoAnualGet', {}],
  ['GET', '/api/v1/dashboard/follow-ups', 'handleDashboardFollowUpsGet', {}],
  ['GET', '/api/v1/dashboard/summary', 'handleDashboardSummaryGet', {}],
  ['GET', '/api/v1/dashboard/ultimas-compras', 'handleDashboardUltimasComprasGet', {}],
  ['GET', '/api/v1/dashboard/viagens', 'handleDashboardViagensGet', {}],
  ['GET', '/api/v1/dashboard/widgets', 'handleDashboardWidgetsGet', {}],
  ['POST', '/api/v1/dashboard/widgets', 'handleDashboardWidgetsPost', {}]
];

const SEM_HANDLER: Array<[string, string]> = [
  ['PUT', '/api/v1/dashboard/aniversariantes'],
  ['PUT', '/api/v1/dashboard/base'],
  ['PUT', '/api/v1/dashboard/comparativo-empresas'],
  ['PUT', '/api/v1/dashboard/consultorias'],
  ['PUT', '/api/v1/dashboard/debug-aggregates'],
  ['PUT', '/api/v1/dashboard/evolucao-anual'],
  ['PUT', '/api/v1/dashboard/follow-ups'],
  ['PUT', '/api/v1/dashboard/summary'],
  ['PUT', '/api/v1/dashboard/ultimas-compras'],
  ['PUT', '/api/v1/dashboard/viagens'],
  ['PUT', '/api/v1/dashboard/widgets']
];

function ev(method: string, path: string) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url: new URL(request.url), params: {}, locals: {}, platform: undefined } as any;
}

beforeEach(() => {
  calls.length = 0;
});

describe('dashboard → handler', () => {
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
