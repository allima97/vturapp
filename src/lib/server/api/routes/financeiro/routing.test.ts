/**
 * Roteamento de /api/v1/financeiro/* no Hono (gerado por gen_routing_test.py).
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

vi.mock('./comissoes-regras-id', () => ({
  handleFinanceiroComissoesRegrasIdGet: spy('handleFinanceiroComissoesRegrasIdGet'),
  handleFinanceiroComissoesRegrasIdPut: spy('handleFinanceiroComissoesRegrasIdPut'),
  handleFinanceiroComissoesRegrasIdDelete: spy('handleFinanceiroComissoesRegrasIdDelete')
}));
vi.mock('./ajustes-vendas', () => ({
  handleFinanceiroAjustesVendasGet: spy('handleFinanceiroAjustesVendasGet'),
  handleFinanceiroAjustesVendasPost: spy('handleFinanceiroAjustesVendasPost')
}));
vi.mock('./ajustes-vendas-list', () => ({
  handleFinanceiroAjustesVendasListGet: spy('handleFinanceiroAjustesVendasListGet')
}));
vi.mock('./ajustes-vendas-save', () => ({
  handleFinanceiroAjustesVendasSavePost: spy('handleFinanceiroAjustesVendasSavePost')
}));
vi.mock('./caixa', () => ({
  handleFinanceiroCaixaGet: spy('handleFinanceiroCaixaGet'),
  handleFinanceiroCaixaPost: spy('handleFinanceiroCaixaPost')
}));
vi.mock('./comissoes', () => ({
  handleFinanceiroComissoesGet: spy('handleFinanceiroComissoesGet')
}));
vi.mock('./comissoes-calcular', () => ({
  handleFinanceiroComissoesCalcularPost: spy('handleFinanceiroComissoesCalcularPost'),
  handleFinanceiroComissoesCalcularGet: spy('handleFinanceiroComissoesCalcularGet')
}));
vi.mock('./comissoes-pagamento', () => ({
  handleFinanceiroComissoesPagamentoPost: spy('handleFinanceiroComissoesPagamentoPost'),
  handleFinanceiroComissoesPagamentoPut: spy('handleFinanceiroComissoesPagamentoPut'),
  handleFinanceiroComissoesPagamentoDelete: spy('handleFinanceiroComissoesPagamentoDelete')
}));
vi.mock('./comissoes-regras', () => ({
  handleFinanceiroComissoesRegrasGet: spy('handleFinanceiroComissoesRegrasGet'),
  handleFinanceiroComissoesRegrasPost: spy('handleFinanceiroComissoesRegrasPost'),
  handleFinanceiroComissoesRegrasPut: spy('handleFinanceiroComissoesRegrasPut'),
  handleFinanceiroComissoesRegrasDelete: spy('handleFinanceiroComissoesRegrasDelete')
}));
vi.mock('./comissoes-vendedores', () => ({
  handleFinanceiroComissoesVendedoresGet: spy('handleFinanceiroComissoesVendedoresGet'),
  handleFinanceiroComissoesVendedoresPost: spy('handleFinanceiroComissoesVendedoresPost')
}));
vi.mock('./formas-pagamento', () => ({
  handleFinanceiroFormasPagamentoGet: spy('handleFinanceiroFormasPagamentoGet'),
  handleFinanceiroFormasPagamentoPost: spy('handleFinanceiroFormasPagamentoPost'),
  handleFinanceiroFormasPagamentoPatch: spy('handleFinanceiroFormasPagamentoPatch'),
  handleFinanceiroFormasPagamentoDelete: spy('handleFinanceiroFormasPagamentoDelete')
}));

import { apiApp } from '../../app';
import * as catchAll from '../../../../../routes/api/v1/[...path]/+server';

const CASES: Array<[string, string, string, Record<string, string>]> = [
  [
    'GET',
    '/api/v1/financeiro/comissoes/regras/id-123',
    'handleFinanceiroComissoesRegrasIdGet',
    { id: 'id-123' }
  ],
  [
    'PUT',
    '/api/v1/financeiro/comissoes/regras/id-123',
    'handleFinanceiroComissoesRegrasIdPut',
    { id: 'id-123' }
  ],
  [
    'DELETE',
    '/api/v1/financeiro/comissoes/regras/id-123',
    'handleFinanceiroComissoesRegrasIdDelete',
    { id: 'id-123' }
  ],
  ['GET', '/api/v1/financeiro/ajustes-vendas', 'handleFinanceiroAjustesVendasGet', {}],
  ['POST', '/api/v1/financeiro/ajustes-vendas', 'handleFinanceiroAjustesVendasPost', {}],
  ['GET', '/api/v1/financeiro/ajustes-vendas/list', 'handleFinanceiroAjustesVendasListGet', {}],
  ['POST', '/api/v1/financeiro/ajustes-vendas/save', 'handleFinanceiroAjustesVendasSavePost', {}],
  ['GET', '/api/v1/financeiro/caixa', 'handleFinanceiroCaixaGet', {}],
  ['POST', '/api/v1/financeiro/caixa', 'handleFinanceiroCaixaPost', {}],
  ['GET', '/api/v1/financeiro/comissoes', 'handleFinanceiroComissoesGet', {}],
  ['POST', '/api/v1/financeiro/comissoes/calcular', 'handleFinanceiroComissoesCalcularPost', {}],
  ['GET', '/api/v1/financeiro/comissoes/calcular', 'handleFinanceiroComissoesCalcularGet', {}],
  ['POST', '/api/v1/financeiro/comissoes/pagamento', 'handleFinanceiroComissoesPagamentoPost', {}],
  ['PUT', '/api/v1/financeiro/comissoes/pagamento', 'handleFinanceiroComissoesPagamentoPut', {}],
  [
    'DELETE',
    '/api/v1/financeiro/comissoes/pagamento',
    'handleFinanceiroComissoesPagamentoDelete',
    {}
  ],
  ['GET', '/api/v1/financeiro/comissoes/regras', 'handleFinanceiroComissoesRegrasGet', {}],
  ['POST', '/api/v1/financeiro/comissoes/regras', 'handleFinanceiroComissoesRegrasPost', {}],
  ['PUT', '/api/v1/financeiro/comissoes/regras', 'handleFinanceiroComissoesRegrasPut', {}],
  ['DELETE', '/api/v1/financeiro/comissoes/regras', 'handleFinanceiroComissoesRegrasDelete', {}],
  ['GET', '/api/v1/financeiro/comissoes/vendedores', 'handleFinanceiroComissoesVendedoresGet', {}],
  [
    'POST',
    '/api/v1/financeiro/comissoes/vendedores',
    'handleFinanceiroComissoesVendedoresPost',
    {}
  ],
  ['GET', '/api/v1/financeiro/formas-pagamento', 'handleFinanceiroFormasPagamentoGet', {}],
  ['POST', '/api/v1/financeiro/formas-pagamento', 'handleFinanceiroFormasPagamentoPost', {}],
  ['PATCH', '/api/v1/financeiro/formas-pagamento', 'handleFinanceiroFormasPagamentoPatch', {}],
  ['DELETE', '/api/v1/financeiro/formas-pagamento', 'handleFinanceiroFormasPagamentoDelete', {}]
];

const SEM_HANDLER: Array<[string, string]> = [
  ['PUT', '/api/v1/financeiro/ajustes-vendas'],
  ['PUT', '/api/v1/financeiro/ajustes-vendas/list'],
  ['PUT', '/api/v1/financeiro/ajustes-vendas/save'],
  ['PUT', '/api/v1/financeiro/caixa'],
  ['PUT', '/api/v1/financeiro/comissoes'],
  ['PUT', '/api/v1/financeiro/comissoes/calcular'],
  ['PATCH', '/api/v1/financeiro/comissoes/pagamento'],
  ['PATCH', '/api/v1/financeiro/comissoes/regras'],
  ['PUT', '/api/v1/financeiro/comissoes/vendedores'],
  ['PUT', '/api/v1/financeiro/formas-pagamento']
];

function ev(method: string, path: string) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url: new URL(request.url), params: {}, locals: {}, platform: undefined } as any;
}

beforeEach(() => {
  calls.length = 0;
});

describe('financeiro → handler', () => {
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
