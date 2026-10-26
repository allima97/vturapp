/** Relatório de Performance: escopo de acesso e montagem dos dados a partir do banco (banco falso). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '$lib/server/testing/fakeSupabase';

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const U2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const V1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const V2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const R1 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const R2 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const CID_BR = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const CID_PT = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
const SUB_BR = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const SUB_PT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
const P_BR = 'ffffffff-ffff-4fff-8fff-fffffffffff1';
const P_PT = 'ffffffff-ffff-4fff-8fff-fffffffffff2';

const st = vi.hoisted(() => ({
  db: null as unknown,
  scope: null as Record<string, unknown> | null,
  contrib: vi.fn(),
}));

vi.mock('$lib/server/v1', async (orig) => {
  const actual = await orig<typeof import('$lib/server/v1')>();
  return {
    ...actual,
    getAdminClient: () => st.db,
    requireAuthenticatedUser: async () => ({ id: U1 }),
    resolveUserScope: async () => st.scope,
    fetchRankingVendedoresByCompanyIds: async () => [{ id: U1, nome_completo: 'Ana', company_id: C1 }, { id: U2, nome_completo: 'Bruno', company_id: C1 }],
  };
});
vi.mock('$lib/server/vendas-kpis', () => ({ fetchVendasKpiReciboContributions: (...a: unknown[]) => st.contrib(...a) }));
vi.mock('$lib/server/readModelRebuild', () => ({ getPlatformExecutionContext: () => undefined }));
vi.mock('$lib/date', async (orig) => ({ ...(await orig<typeof import('$lib/date')>()), todayISODateLocal: () => '2026-09-25' }));

import { handleRelatoriosPerformanceGet } from './performance';

const scopeBase = { userId: U1, isAdmin: false, isMaster: false, isGestor: true, isFinanceiro: false, isVendedor: false, companyId: C1, companyIds: [C1], permissoes: { relatorios: 'view' }, papel: 'GESTOR', tipoNome: 'GESTOR', usoIndividual: false };

function db() {
  return createFakeSupabase({
    companies: [{ id: C1, nome_fantasia: 'LOJA SHOPPING CENTER NORTE', owner_user_id: U2 }],
    users: [{ id: U1, nome_completo: 'Ana', company_id: C1 }, { id: U2, nome_completo: 'Katia Nishida', company_id: C1 }],
    parametros_comissao: [{ company_id: C1, usar_taxas_na_meta: true, foco_valor: 'bruto' }],
    metas_vendedor: [
      { vendedor_id: U1, meta_geral: 20000, periodo: '2026-09-01', ativo: true },
      { vendedor_id: U2, meta_geral: 10000, periodo: '2026-09-01', ativo: true },
    ],
    vendas: [
      { id: V1, destino_cidade_id: CID_BR, data_embarque: '2026-12-01' },
      { id: V2, destino_cidade_id: CID_PT, data_embarque: '2027-01-10' },
    ],
    vendas_recibos: [
      { id: R1, destino_cidade_id: null, data_inicio: null },
      { id: R2, destino_cidade_id: null, data_inicio: null },
    ],
    cidades: [{ id: CID_BR, nome: 'Maceió', subdivisao_id: SUB_BR }, { id: CID_PT, nome: 'Lisboa', subdivisao_id: SUB_PT }],
    subdivisoes: [{ id: SUB_BR, pais_id: P_BR }, { id: SUB_PT, pais_id: P_PT }],
    paises: [{ id: P_BR, nome: 'Brasil' }, { id: P_PT, nome: 'Portugal' }],
    viagens: [{ id: '99999999-0000-4000-8000-000000000001', venda_id: V1 }, { id: '99999999-0000-4000-8000-000000000002', venda_id: V1 }, { id: '99999999-0000-4000-8000-000000000003', venda_id: V2 }],
    viagem_passageiros: [
      { viagem_id: '99999999-0000-4000-8000-000000000001', cliente_id: '88888888-0000-4000-8000-000000000001' }, { viagem_id: '99999999-0000-4000-8000-000000000002', cliente_id: '88888888-0000-4000-8000-000000000001' }, { viagem_id: '99999999-0000-4000-8000-000000000001', cliente_id: '88888888-0000-4000-8000-000000000002' },
      { viagem_id: '99999999-0000-4000-8000-000000000003', cliente_id: '88888888-0000-4000-8000-000000000003' },
    ],
    clientes: [{ id: '88888888-0000-4000-8000-000000000001', nascimento: '1960-05-01' }, { id: '88888888-0000-4000-8000-000000000002', nascimento: '1995-01-01' }, { id: '88888888-0000-4000-8000-000000000003', nascimento: '1980-01-01' }],
    vendas_pagamentos: [{ venda_id: V1, forma_nome: 'Mastercard', valor_total: 6000 }, { venda_id: V2, forma_nome: 'Visa', valor_total: 4000 }],
    quote: [
      { id: '77777777-0000-4000-8000-000000000001', created_by: U1, created_at: '2026-09-10T10:00:00', status: 'CONFIRMED', status_negociacao: 'Fechado', destino_cidade_id: CID_BR, data_embarque: '2026-12-01' },
      { id: '77777777-0000-4000-8000-000000000002', created_by: U2, created_at: '2026-09-11T10:00:00', status: 'CONFIRMED', status_negociacao: 'Enviado', destino_cidade_id: null, data_embarque: null },
      { id: '77777777-0000-4000-8000-000000000003', created_by: 'outro', created_at: '2026-09-11T10:00:00', status: 'CONFIRMED', status_negociacao: 'Enviado', destino_cidade_id: CID_BR },
      { id: '77777777-0000-4000-8000-000000000004', created_by: U1, created_at: '2026-08-11T10:00:00', status: 'CONFIRMED', status_negociacao: 'Enviado', destino_cidade_id: CID_BR },
    ],
    quote_item: [
      { quote_id: '77777777-0000-4000-8000-000000000001', item_type: 'Hotel', cidade_id: CID_BR, order_index: 0 },
      { quote_id: '77777777-0000-4000-8000-000000000002', item_type: 'Seguro viagem', cidade_id: CID_PT, order_index: 0 },
      { quote_id: '77777777-0000-4000-8000-000000000004', item_type: 'Hotel', cidade_id: CID_BR, order_index: 0 },
    ],
  });
}

function evento(query: string) {
  const url = `https://vtur.app/api/v1/relatorios/performance?${query}`;
  return { url: new URL(url), request: new Request(url), locals: {}, platform: null } as never;
}

beforeEach(() => {
  st.db = db();
  st.scope = { ...scopeBase };
  st.contrib.mockReset();
  st.contrib.mockImplementation(async (_c: unknown, p: { dataInicio: string }) => ({
    contributions: p.dataInicio.startsWith('2026')
      ? [
          { vendaId: V1, vendaKey: V1, reciboId: R1, reciboNumero: '1001', vendedorId: U1, produtoNome: 'Terrestre', bruto: 6000, taxas: 0 },
          { vendaId: V2, vendaKey: V2, reciboId: R2, reciboNumero: 'REXTUR', vendedorId: U2, produtoNome: 'Passagem Facial', bruto: 4000, taxas: 0 },
        ]
      : [{ vendaId: V1, vendaKey: V1, reciboId: R1, reciboNumero: '9', vendedorId: U1, produtoNome: 'Terrestre', bruto: 8000, taxas: 0 }],
  }));
});

describe('GET /api/v1/relatorios/performance', () => {
  it('gestor: própria empresa, dados até D-1 e mesmo período do ano anterior', async () => {
    const res = await handleRelatoriosPerformanceGet(evento('mes=2026-09'));
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(st.contrib.mock.calls.map((c) => [c[1].dataInicio, c[1].dataFim, c[1].companyIds])).toEqual([
      ['2026-09-01', '2026-09-24', [C1]],
      ['2025-09-01', '2025-09-24', [C1]],
    ]);
    expect(body.empresa).toEqual({ id: C1, nome: 'LOJA SHOPPING CENTER NORTE', responsavel: 'Katia Nishida' });
    expect(body.dadosAte).toBe('2026-09-24');
    expect(body.vendas).toMatchObject({ vendaMes: 10000, metaMes: 30000, metaAteCorte: 24000, passageiros: 3, variacaoAnoAnterior: 25 });
    expect(body.business.map((b: any) => [b.nome, b.pct])).toEqual([['Nacional', 60], ['Internacional', 0], ['Marítimo', 0], ['Consolidadora', 40]]);
    expect(body.topDestinosNacional[0]).toMatchObject({ nome: 'MACEIÓ', pct: 100 });
    expect(body.topDestinosInternacional[0]).toMatchObject({ nome: 'LISBOA', pct: 100 });
    expect(body.formasPagamento.map((f: any) => [f.nome, f.pct])).toEqual([['Mastercard', 60], ['Visa', 40]]);
    expect(body.topVendedores.map((v: any) => v.nome)).toEqual(['Ana', 'Bruno']);
    // Orçamentos só de usuários da empresa (q3 é de outra); q4 é do mês anterior.
    expect(body.orcamentos.total).toBe(2);
    expect(body.orcamentos.totais.total).toMatchObject({ quantidade: 2, conversao: 50, variacaoMesAnterior: 100 });
    expect(body.orcamentos.business).toEqual([{ nome: 'Nacional', pct: 50 }, { nome: 'Internacional', pct: 50 }]);
  });

  it('gestor não vê outra empresa; vendedor não vê o relatório', async () => {
    let res = await handleRelatoriosPerformanceGet(evento(`company_id=${C2}`));
    expect(res.status).toBe(400);
    st.scope = { ...scopeBase, isGestor: false, isVendedor: true };
    res = await handleRelatoriosPerformanceGet(evento(''));
    expect(res.status).toBe(403);
  });

  it('master escolhe a empresa do seu escopo', async () => {
    st.scope = { ...scopeBase, isGestor: false, isMaster: true, companyIds: [C1, C2] };
    let res = await handleRelatoriosPerformanceGet(evento(`company_id=${C1}&mes=2026-09`));
    expect(res.status).toBe(200);
    res = await handleRelatoriosPerformanceGet(evento('mes=2026-09'));
    expect(res.status).toBe(400); // várias empresas: precisa escolher uma
  });

  it('mês passado vai até o último dia', async () => {
    const res = await handleRelatoriosPerformanceGet(evento('mes=2026-08'));
    const body: any = await res.json();
    expect(body.dadosAte).toBe('2026-08-31');
    expect(body.vendas.metaAteCorte).toBe(body.vendas.metaMes);
  });
});
