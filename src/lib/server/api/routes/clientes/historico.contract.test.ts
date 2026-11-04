/**
 * Contrato de GET /api/v1/clientes/historico (Fase 3.7).
 *
 * Os snapshots foram gerados com a implementação ANTERIOR (consultas em fila).
 * A versão com consultas em paralelo precisa devolver exatamente o mesmo
 * status, o mesmo corpo e fazer o mesmo conjunto de consultas.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDados, sortedQueryLog, type FakeDados } from '$lib/server/testing/fakeDados';

const state = vi.hoisted(() => ({
  db: null as unknown,
  filters: { companyIds: [] as string[], vendedorIds: [] as string[], accessibleClientIds: null },
}));

vi.mock('$lib/server/v1', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/server/v1')>();
  return {
    ...actual,
    getAdminClient: () => state.db,
    requireAuthenticatedUser: async () => ({ id: 'u-admin' }),
    resolveUserScope: async () => ({ userId: 'u-admin', isAdmin: true }),
  };
});

vi.mock('$lib/server/clientes', () => ({
  ensureClienteAccess: async () => state.filters,
}));

vi.mock('$lib/server/readModelCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/server/readModelCache')>();
  return {
    ...actual,
    // Sem cache: cada chamada roda o loader (o teste compara o loader).
    getCachedReadModel: async (options: { loader: () => Promise<unknown> }) => options.loader(),
  };
});

import { handleClientesHistoricoGet } from './historico';

const CLI = 'cli-1';

function tables() {
  return {
    vendas: [
      // titular, destino com cidade só no produto
      { id: 'vd-1', cliente_id: CLI, vendedor_id: 'u-v1', company_id: 'c-1', data_lancamento: '2026-03-10', data_embarque: '2026-04-01', destino_cidade_id: null, destino: { nome: 'Pacote Lisboa', cidade_id: 'cid-lis' } },
      // titular, cidade na venda
      { id: 'vd-2', cliente_id: CLI, vendedor_id: 'u-v2', company_id: 'c-2', data_lancamento: '2026-05-02', data_embarque: null, destino_cidade_id: 'cid-rio', destino: { nome: 'Hotel Rio', cidade_id: 'cid-xxx' } },
      // titular e também passageiro (deve continuar 'titular')
      { id: 'vd-3', cliente_id: CLI, vendedor_id: 'u-v1', company_id: 'c-1', data_lancamento: null, data_embarque: null, destino_cidade_id: null, destino: null },
      // só passageiro
      { id: 'vd-4', cliente_id: 'cli-9', vendedor_id: 'u-v1', company_id: 'c-1', data_lancamento: '2026-06-15', data_embarque: '2026-07-01', destino_cidade_id: 'cid-lis', destino: { nome: 'Aéreo', cidade_id: null } },
      // passageiro de outra empresa/vendedor
      { id: 'vd-5', cliente_id: 'cli-8', vendedor_id: 'u-v3', company_id: 'c-3', data_lancamento: '2026-01-01', data_embarque: null, destino_cidade_id: 'cid-sp', destino: { nome: 'SP', cidade_id: 'cid-sp' } },
      // venda de outro cliente, sem vínculo
      { id: 'vd-6', cliente_id: 'cli-7', vendedor_id: 'u-v1', company_id: 'c-1', data_lancamento: '2026-02-01', data_embarque: null, destino_cidade_id: null, destino: null },
    ],
    viagem_passageiros: [
      { viagem_id: 'vg-1', cliente_id: CLI },
      { viagem_id: 'vg-2', cliente_id: CLI },
      { viagem_id: 'vg-2', cliente_id: CLI },
      { viagem_id: 'vg-3', cliente_id: CLI },
      { viagem_id: 'vg-4', cliente_id: CLI },
      { viagem_id: 'vg-9', cliente_id: 'cli-x' },
    ],
    viagens: [
      { id: 'vg-1', venda_id: 'vd-3' },
      { id: 'vg-2', venda_id: 'vd-4' },
      { id: 'vg-3', venda_id: 'vd-5' },
      { id: 'vg-4', venda_id: null },
      { id: 'vg-9', venda_id: 'vd-6' },
    ],
    vendas_recibos: [
      { venda_id: 'vd-1', valor_total: 1000, valor_taxas: 50 },
      { venda_id: 'vd-1', valor_total: '250.5', valor_taxas: null },
      { venda_id: 'vd-4', valor_total: 300, valor_taxas: 10 },
      { venda_id: 'vd-5', valor_total: 999, valor_taxas: 9 },
      { venda_id: 'vd-6', valor_total: 1, valor_taxas: 1 },
    ],
    quote: [
      { id: 'q-1', created_at: '2026-05-01T10:00:00Z', status: 'aberto', status_negociacao: 'negociando', total: 5000, client_id: CLI, created_by: 'u-v1', quote_item: [{ title: 'Cruzeiro', item_type: 'cruzeiro' }] },
      { id: 'q-2', created_at: '2026-04-01T10:00:00Z', status: 'fechado', status_negociacao: null, total: '1200', client_id: CLI, created_by: 'u-v3', quote_item: [{ title: null, item_type: 'hotel' }] },
      { id: 'q-3', created_at: '2026-03-01T10:00:00Z', status: null, status_negociacao: null, total: null, client_id: CLI, created_by: null, quote_item: [] },
      { id: 'q-4', created_at: '2026-02-01T10:00:00Z', status: 'x', status_negociacao: null, total: 1, client_id: 'cli-9', created_by: 'u-v1', quote_item: null },
    ],
    cidades: [
      { id: 'cid-lis', nome: 'Lisboa' },
      { id: 'cid-rio', nome: 'Rio de Janeiro' },
      { id: 'cid-sp', nome: 'São Paulo' },
    ],
    users: [
      { id: 'u-v1', company_id: 'c-1' },
      { id: 'u-v2', company_id: 'c-2' },
      { id: 'u-v3', company_id: 'c-3' },
    ],
  };
}

async function call(query: string) {
  const event = { url: new URL(`https://x/api/v1/clientes/historico?${query}`) };
  const res = await handleClientesHistoricoGet(event as never);
  return { status: res.status, body: await res.json() };
}

const cenarios: Array<[string, string, { companyIds: string[]; vendedorIds: string[] }]> = [
  ['admin sem filtros', `cliente_id=${CLI}`, { companyIds: [], vendedorIds: [] }],
  ['filtro de empresa', `cliente_id=${CLI}`, { companyIds: ['c-1', 'c-2'], vendedorIds: [] }],
  ['filtro de vendedor', `cliente_id=${CLI}`, { companyIds: [], vendedorIds: ['u-v1'] }],
  ['empresa + vendedor', `cliente_id=${CLI}`, { companyIds: ['c-1'], vendedorIds: ['u-v1', 'u-v3'] }],
  ['cliente sem nada', 'cliente_id=cli-vazio', { companyIds: [], vendedorIds: [] }],
];

describe('GET /api/v1/clientes/historico: contrato', () => {
  let db: FakeDados;
  beforeEach(() => {
    db = createFakeDados(tables());
    state.db = db;
  });

  it.each(cenarios)('%s: corpo e consultas iguais aos da versão anterior', async (_nome, query, filters) => {
    state.filters = { ...filters, accessibleClientIds: null };
    const result = await call(query);
    expect({ result, consultas: sortedQueryLog(db.log) }).toMatchSnapshot();
  });

  it('as buscas independentes rodam juntas (antes no máximo 2 ao mesmo tempo)', async () => {
    state.filters = { companyIds: ['c-1', 'c-2'], vendedorIds: [], accessibleClientIds: null };
    const t0 = Date.now();
    await call(`cliente_id=${CLI}`);
    const elapsed = Date.now() - t0;
    expect(db.stats.maxInFlight).toBeGreaterThanOrEqual(3);
    console.log(`[historico] maxInFlight=${db.stats.maxInFlight} tempo=${elapsed}ms (5ms por consulta)`);
  });
});
