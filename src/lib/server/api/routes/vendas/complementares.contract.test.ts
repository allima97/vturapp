/**
 * Contrato de GET /api/v1/vendas/complementares (Fase 3.7).
 *
 * Os snapshots foram gerados com a implementação ANTERIOR (consultas em fila).
 * A versão com consultas em paralelo precisa devolver exatamente o mesmo
 * status, o mesmo corpo e fazer o mesmo conjunto de consultas.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDados, sortedQueryLog, type FakeDados } from '$lib/server/testing/fakeDados';

const state = vi.hoisted(() => ({
  db: null as unknown,
  scope: null as Record<string, unknown> | null,
  vendedorIds: [] as string[],
  sale: null as Record<string, unknown> | null,
}));

vi.mock('$lib/server/v1', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/server/v1')>();
  return {
    ...actual,
    getAdminClient: () => state.db,
    requireAuthenticatedUser: async () => ({ id: 'u-1' }),
    resolveUserScope: async () => state.scope,
    resolveScopedVendedorIds: async () => state.vendedorIds,
  };
});

vi.mock('$lib/server/salesScope', () => ({
  fetchSaleForScope: async () => state.sale,
}));

import { handleVendasComplementaresGet } from './complementares';

const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const V3 = '33333333-3333-4333-8333-333333333333';
const V4 = '44444444-4444-4444-8444-444444444444';

const adminScope = {
  userId: 'u-1', isAdmin: true, isMaster: false, isGestor: false, isFinanceiro: false, isVendedor: false,
  companyId: 'c-1', companyIds: ['c-1'], permissoes: {},
};
const EMPRESA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const vendedorScope = {
  ...adminScope, isAdmin: false, isVendedor: true,
  companyId: EMPRESA, companyIds: [EMPRESA],
  permissoes: { vendas: 'edit' },
};

const saleNested = (id: string, cliente: string, destino: string, cidade: string, vendedor = 'u-1') => ({
  id, cliente_id: `cli-${id.slice(0, 2)}`, vendedor_id: vendedor, company_id: 'c-1',
  clientes: [{ nome: cliente }], destinos: [{ nome: destino }], destino_cidade: [{ nome: cidade }],
});

const EMPRESA_FIXTURE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function tables() {
  return {
    vendas_recibos: [
      { id: 'r-11', venda_id: V1, numero_recibo: '1001', valor_total: 1500, produto_resolvido: [{ nome: 'Aéreo' }], vendas: [saleNested(V1, 'Ana', 'Lisboa pacote', 'Lisboa')], 'vendas.company_id': EMPRESA_FIXTURE, 'vendas.vendedor_id': 'u-1' },
      { id: 'r-12', venda_id: V1, numero_recibo: '1002', valor_total: 300, produto_resolvido: [{ nome: 'Seguro' }], vendas: [saleNested(V1, 'Ana', 'Lisboa pacote', 'Lisboa')], 'vendas.company_id': EMPRESA_FIXTURE, 'vendas.vendedor_id': 'u-1' },
      { id: 'r-21', venda_id: V2, numero_recibo: '2001', valor_total: 800, produto_resolvido: [{ nome: 'Hotel' }], vendas: [saleNested(V2, 'Bruno', 'Rio hotel', 'Rio de Janeiro')], 'vendas.company_id': EMPRESA_FIXTURE, 'vendas.vendedor_id': 'u-1' },
      { id: 'r-22', venda_id: V2, numero_recibo: '2002', valor_total: 50, produto_resolvido: null, vendas: [saleNested(V2, 'Bruno', 'Rio hotel', 'Rio de Janeiro')], 'vendas.company_id': EMPRESA_FIXTURE, 'vendas.vendedor_id': 'u-1' },
      { id: 'r-31', venda_id: V3, numero_recibo: '3001', valor_total: 999.9, produto_resolvido: [{ nome: 'Cruzeiro' }], vendas: [saleNested(V3, 'Carla', 'Caribe', 'Miami', 'u-2')], 'vendas.company_id': EMPRESA_FIXTURE, 'vendas.vendedor_id': 'u-2' },
      { id: 'r-41', venda_id: V4, numero_recibo: '4001', valor_total: 10, produto_resolvido: [{ nome: 'Ingresso' }], vendas: [saleNested(V4, 'Anabela', 'Orlando', 'Orlando')], 'vendas.company_id': 'c-2', 'vendas.vendedor_id': 'u-9' },
    ],
    vendas_recibos_complementares: [
      { id: 'l-1', venda_id: V1, recibo_id: 'r-21' },
      { id: 'l-2', venda_id: V2, recibo_id: 'r-11' },
      { id: 'l-3', venda_id: V1, recibo_id: 'r-31' },
      { id: 'l-4', venda_id: V3, recibo_id: 'r-12' },
      { id: 'l-5', venda_id: V2, recibo_id: 'r-99' },
    ],
    vendas: [
      { id: V2, cliente_id: 'cli-2', destino_id: 'p-2', destino_cidade_id: 'cid-rio', clientes: [{ nome: 'Bruno' }], destinos: [{ nome: 'Rio hotel' }], destino_cidade: [{ nome: 'Rio de Janeiro' }] },
      { id: V3, cliente_id: 'cli-3', destino_id: 'p-3', destino_cidade_id: null, clientes: { nome: 'Carla' }, destinos: [{ nome: 'Caribe' }], destino_cidade: null },
    ],
  };
}

async function call(query: string) {
  const event = { url: new URL(`https://x/api/v1/vendas/complementares?${query}`) };
  const res = await handleVendasComplementaresGet(event as never);
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* texto */ }
  return { status: res.status, body };
}

type Cenario = [string, string, Record<string, unknown>, string[], boolean];
const cenarios: Cenario[] = [
  ['admin, venda com 2 vínculos, sem busca', `venda_id=${V1}`, adminScope, [], true],
  ['admin, busca "ana"', `venda_id=${V1}&q=ana`, adminScope, [], true],
  ['vendedor com escopo, busca "bruno"', `venda_id=${V3}&q=bruno`, vendedorScope, ['u-1'], true],
  ['busca curta (1 letra) não pesquisa', `venda_id=${V2}&q=a`, adminScope, [], true],
  ['venda sem vínculos', `venda_id=${V4}&q=rio`, adminScope, [], true],
  ['venda fora do escopo → 404', `venda_id=${V1}`, adminScope, [], false],
  ['venda_id inválido → 400', 'venda_id=abc', adminScope, [], true],
];

describe('GET /api/v1/vendas/complementares: contrato', () => {
  let db: FakeDados;
  beforeEach(() => {
    db = createFakeDados(tables());
    state.db = db;
  });

  it.each(cenarios)('%s', async (_nome, query, scope, vendedorIds, found) => {
    state.scope = scope;
    state.vendedorIds = vendedorIds;
    state.sale = found ? { id: 'x' } : null;
    const result = await call(query);
    expect({ result, consultas: sortedQueryLog(db.log) }).toMatchSnapshot();
  });

  it('consultas independentes rodam juntas (antes era uma por vez)', async () => {
    state.scope = adminScope;
    state.vendedorIds = [];
    state.sale = { id: 'x' };
    await call(`venda_id=${V1}&q=ana`);
    expect(db.stats.maxInFlight).toBeGreaterThanOrEqual(3);
    console.log(`[complementares] maxInFlight=${db.stats.maxInFlight}`);
  });
});
