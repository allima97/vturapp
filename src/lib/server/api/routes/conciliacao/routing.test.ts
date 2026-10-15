/**
 * Roteamento das rotas de conciliação no Hono (Fase 2.2).
 *
 * Handlers movidos SEM alteração dos +server.ts originais (identidade textual
 * verificada na migração). Aqui garantimos que cada URL + método chega no
 * handler certo — pela ponte específica e pelo catch-all — e que método não
 * exportado antes continua sem resposta (404 do Hono / 405 do SvelteKit).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => [] as string[]);
const spy = vi.hoisted(
  () => (name: string) => async () => {
    calls.push(name);
    return new Response(name, { status: 200 });
  },
);

vi.mock('./root', () => ({ handleConciliacaoGet: spy('handleConciliacaoGet') }));
vi.mock('./assign', () => ({ handleConciliacaoAssignPost: spy('handleConciliacaoAssignPost') }));
vi.mock('./changes', () => ({ handleConciliacaoChangesGet: spy('handleConciliacaoChangesGet') }));
vi.mock('./delete', () => ({ handleConciliacaoDeleteDelete: spy('handleConciliacaoDeleteDelete') }));
vi.mock('./executions', () => ({ handleConciliacaoExecutionsGet: spy('handleConciliacaoExecutionsGet') }));
vi.mock('./existing', () => ({ handleConciliacaoExistingPost: spy('handleConciliacaoExistingPost') }));
vi.mock('./fix-vinculos', () => ({ handleConciliacaoFixVinculosPost: spy('handleConciliacaoFixVinculosPost') }));
vi.mock('./import', () => ({ handleConciliacaoImportPost: spy('handleConciliacaoImportPost') }));
vi.mock('./list', () => ({ handleConciliacaoListGet: spy('handleConciliacaoListGet') }));
vi.mock('./lookup', () => ({ handleConciliacaoLookupPost: spy('handleConciliacaoLookupPost') }));
vi.mock('./options', () => ({ handleConciliacaoOptionsGet: spy('handleConciliacaoOptionsGet') }));
vi.mock('./rateio-info', () => ({ handleConciliacaoRateioInfoGet: spy('handleConciliacaoRateioInfoGet') }));
vi.mock('./revert', () => ({ handleConciliacaoRevertPost: spy('handleConciliacaoRevertPost') }));
vi.mock('./run', () => ({ handleConciliacaoRunPost: spy('handleConciliacaoRunPost') }));
vi.mock('./sem-movimento', () => ({ handleConciliacaoSemMovimentoGet: spy('handleConciliacaoSemMovimentoGet'), handleConciliacaoSemMovimentoPost: spy('handleConciliacaoSemMovimentoPost'), handleConciliacaoSemMovimentoDelete: spy('handleConciliacaoSemMovimentoDelete') }));
vi.mock('./status-cronologico', () => ({ handleConciliacaoStatusCronologicoGet: spy('handleConciliacaoStatusCronologicoGet') }));
vi.mock('./summary', () => ({ handleConciliacaoSummaryGet: spy('handleConciliacaoSummaryGet') }));
vi.mock('./update-valores', () => ({ handleConciliacaoUpdateValoresPost: spy('handleConciliacaoUpdateValoresPost') }));

import { apiApp } from '../../app';
import { GET as catchAllGET, POST as catchAllPOST, DELETE as catchAllDELETE, PUT as catchAllPUT } from '../../../../../routes/api/v1/[...path]/+server';

const CASES: Array<[string, string, string]> = [
  ['GET', '/api/v1/conciliacao', 'handleConciliacaoGet'],
  ['POST', '/api/v1/conciliacao/assign', 'handleConciliacaoAssignPost'],
  ['GET', '/api/v1/conciliacao/changes', 'handleConciliacaoChangesGet'],
  ['DELETE', '/api/v1/conciliacao/delete', 'handleConciliacaoDeleteDelete'],
  ['GET', '/api/v1/conciliacao/executions', 'handleConciliacaoExecutionsGet'],
  ['POST', '/api/v1/conciliacao/existing', 'handleConciliacaoExistingPost'],
  ['POST', '/api/v1/conciliacao/fix-vinculos', 'handleConciliacaoFixVinculosPost'],
  ['POST', '/api/v1/conciliacao/import', 'handleConciliacaoImportPost'],
  ['GET', '/api/v1/conciliacao/list', 'handleConciliacaoListGet'],
  ['POST', '/api/v1/conciliacao/lookup', 'handleConciliacaoLookupPost'],
  ['GET', '/api/v1/conciliacao/options', 'handleConciliacaoOptionsGet'],
  ['GET', '/api/v1/conciliacao/rateio-info', 'handleConciliacaoRateioInfoGet'],
  ['POST', '/api/v1/conciliacao/revert', 'handleConciliacaoRevertPost'],
  ['POST', '/api/v1/conciliacao/run', 'handleConciliacaoRunPost'],
  ['GET', '/api/v1/conciliacao/sem-movimento', 'handleConciliacaoSemMovimentoGet'],
  ['POST', '/api/v1/conciliacao/sem-movimento', 'handleConciliacaoSemMovimentoPost'],
  ['DELETE', '/api/v1/conciliacao/sem-movimento', 'handleConciliacaoSemMovimentoDelete'],
  ['GET', '/api/v1/conciliacao/status-cronologico', 'handleConciliacaoStatusCronologicoGet'],
  ['GET', '/api/v1/conciliacao/summary', 'handleConciliacaoSummaryGet'],
  ['POST', '/api/v1/conciliacao/update-valores', 'handleConciliacaoUpdateValoresPost'],
];

function ev(method: string, path: string) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url: new URL(request.url), params: {}, locals: {}, platform: undefined } as any;
}

beforeEach(() => {
  calls.length = 0;
});

describe('conciliacao → handler', () => {
  it.each(CASES)('%s %s → %s', async (method, path, handler) => {
    const e = ev(method, path);
    const res = await apiApp.fetch(e.request, { event: e });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(handler);
    expect(calls).toEqual([handler]);
  });

  it('catch-all também encaminha', async () => {
    const byMethod: Record<string, typeof catchAllGET> = {
      GET: catchAllGET, POST: catchAllPOST, DELETE: catchAllDELETE,
    };
    for (const [method, path, handler] of CASES) {
      calls.length = 0;
      const res = await byMethod[method](ev(method, path));
      expect(await res.text()).toBe(handler);
    }
  });

  it('método que não existia continua sem handler', async () => {
    for (const [method, path] of [['POST', '/api/v1/conciliacao/list'], ['GET', '/api/v1/conciliacao/delete'], ['PUT', '/api/v1/conciliacao/sem-movimento']]) {
      const res = await catchAllPUT(ev(method, path));
      expect(res.status).toBe(404);
    }
    expect(calls).toEqual([]);
  });
});
