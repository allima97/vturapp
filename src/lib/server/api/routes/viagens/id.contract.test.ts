/**
 * Contrato de GET /api/v1/viagens/:id (Fase 3.4).
 *
 * Os snapshots foram gerados com a implementação ANTERIOR (consultas em fila).
 * A versão com consultas em paralelo precisa devolver exatamente o mesmo
 * status, o mesmo corpo e fazer o mesmo conjunto de consultas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, sortedQueryLog, type FakeSupabase } from '$lib/server/testing/fakeSupabase';

const state = vi.hoisted(() => ({
  db: null as unknown,
  scope: null as Record<string, unknown> | null,
  userId: 'u-admin',
}));

vi.mock('$lib/server/v1', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/server/v1')>();
  return {
    ...actual,
    getAdminClient: () => state.db,
    requireAuthenticatedUser: async () => ({ id: state.userId }),
    resolveUserScope: async () => state.scope,
    resolveScopedVendedorIds: async () => ['u-vend', 'u-outro'],
  };
});

import { handleViagensIdGet } from './id';

const EMPRESA = 'c-1';
const baseScope = {
  userId: 'u-admin',
  nome: 'Admin',
  email: 'a@x',
  tipoNome: 'ADMIN',
  usoIndividual: false,
  papel: 'ADMIN',
  companyId: EMPRESA,
  companyIds: [EMPRESA],
  permissoes: { operacao_viagens: 4 },
  isAdmin: true,
  isMaster: false,
  isFinanceiro: false,
  isGestor: false,
  isVendedor: false,
};
const vendedorScope = {
  ...baseScope,
  userId: 'u-vend',
  tipoNome: 'VENDEDOR',
  papel: 'VENDEDOR',
  isAdmin: false,
  isVendedor: true,
  permissoes: { operacao_viagens: 4, viagens: 4, operacao: 4 },
};

function tables() {
  return {
    viagens: [
      {
        id: 'v-1', venda_id: 'venda-1', orcamento_id: null, cliente_id: 'cli-1', company_id: EMPRESA,
        responsavel_user_id: 'u-outro', origem: 'São Paulo', destino: 'Lisboa',
        data_inicio: '2026-01-10', data_fim: '2026-01-20', status: 'planejada',
        observacoes: 'obs', follow_up_text: null, follow_up_fechado: false, recibo_id: 'rec-1',
        created_at: '2025-12-01T00:00:00Z', updated_at: '2025-12-01T00:00:00Z',
      },
      {
        id: 'v-2', venda_id: null, orcamento_id: null, cliente_id: null, company_id: EMPRESA,
        responsavel_user_id: 'u-admin', origem: null, destino: 'Rio',
        data_inicio: '2027-03-01', data_fim: '2027-03-05', status: 'planejada',
        observacoes: null, follow_up_text: null, follow_up_fechado: false, recibo_id: null,
        created_at: '2025-12-01T00:00:00Z', updated_at: '2025-12-01T00:00:00Z',
      },
    ],
    clientes: [
      { id: 'cli-1', nome: 'Maria', email: 'm@x', telefone: '11', whatsapp: '11', created_by: 'u-outro' },
    ],
    vendas: [
      { id: 'venda-1', valor_total: 1000, valor_total_pago: 400, status: 'confirmada', data_venda: '2025-11-30', vendedor_id: 'u-vend', cliente_id: 'cli-1' },
    ],
    vendas_recibos: [
      { id: 'rec-1', venda_id: 'venda-1', produto_id: 'p-1', produto_resolvido_id: null, numero_recibo: 'R1', numero_reserva: 'X1', tipo_pacote: null, valor_total: 600, valor_taxas: 10, data_inicio: '2026-01-10', data_fim: '2026-01-20', contrato_url: null },
      { id: 'rec-2', venda_id: 'venda-1', produto_id: null, produto_resolvido_id: 'p-2', numero_recibo: 'R2', numero_reserva: 'X2', tipo_pacote: 'aereo', valor_total: 400, valor_taxas: 0, data_inicio: null, data_fim: null, contrato_url: null },
    ],
    produtos: [
      { id: 'p-1', nome: 'Hotel Lisboa' },
    ],
    vouchers: [
      { id: 'vo-1', viagem_id: 'v-1', nome: 'Voucher 1', provider: 'vtur', codigo_systur: 'S1', codigo_fornecedor: 'F1', data_inicio: '2026-01-10', data_fim: '2026-01-20', ativo: true },
    ],
    viagem_passageiros: [
      { id: 'pa-1', viagem_id: 'v-1', cliente_id: 'cli-1', papel: 'titular', observacoes: null, created_at: '2025-12-01T00:00:00Z', cliente: { id: 'cli-1', nome: 'Maria', cpf: '1', telefone: '11', data_nascimento: '1990-01-01' } },
    ],
  };
}

function event(id: string) {
  const url = new URL(`https://vturapp.test/api/v1/viagens/${id}`);
  return { params: { id }, url, request: new Request(url), locals: {} } as never;
}

async function call(id: string, scope: Record<string, unknown>, userId: string) {
  const db: FakeSupabase = createFakeSupabase(tables());
  state.db = db;
  state.scope = scope;
  state.userId = userId;
  const response = await handleViagensIdGet(event(id));
  return { status: response.status, body: await response.json(), queries: sortedQueryLog(db.log), maxInFlight: db.stats.maxInFlight };
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  state.db = null;
});

describe('GET /api/v1/viagens/:id — contrato', () => {
  it('admin: viagem completa (cliente, venda com recibos/produtos, recibo, vouchers, passageiros)', async () => {
    const result = await call('v-1', baseScope, 'u-admin');
    expect({ status: result.status, body: result.body, queries: result.queries }).toMatchSnapshot();
  });

  it('vendedor com acesso pela venda', async () => {
    const result = await call('v-1', vendedorScope, 'u-vend');
    expect({ status: result.status, body: result.body, queries: result.queries }).toMatchSnapshot();
  });

  it('vendedor sem acesso → 403', async () => {
    const result = await call('v-1', { ...vendedorScope, userId: 'u-x' }, 'u-x');
    expect({ status: result.status, body: result.body, queries: result.queries }).toMatchSnapshot();
  });

  it('viagem inexistente → 404', async () => {
    const result = await call('v-9', baseScope, 'u-admin');
    expect({ status: result.status, body: result.body, queries: result.queries }).toMatchSnapshot();
  });

  it('viagem sem venda, sem cliente e sem recibo', async () => {
    const result = await call('v-2', baseScope, 'u-admin');
    expect({ status: result.status, body: result.body, queries: result.queries }).toMatchSnapshot();
  });

  it('as leituras rodam em paralelo (antes: uma por vez)', async () => {
    const result = await call('v-1', baseScope, 'u-admin');
    // status, cliente, venda, recibo, vouchers e passageiros abertos ao mesmo tempo
    expect(result.maxInFlight).toBeGreaterThanOrEqual(5);
  });
});
