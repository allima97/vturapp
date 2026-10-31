/**
 * Suíte X — M11: Dashboard, ranking e evolução mensal (Workers / D1 real)
 *
 * Empresa dedicada: EMPRESA_X = 22 (evita colisão com outras suítes).
 * Semeia vendas com diferentes vendedores, clientes e datas para
 * validar KPIs, rankings e série temporal com isolamento de tenant.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { applyD1Migrations } from 'cloudflare:test';

vi.mock('$lib/brand', () => ({ default: '' }));

import { getDb } from '$lib/server/db/client';
import { criarVenda } from '$lib/server/vendas/service';
import type { VendaNormalizada } from '$lib/server/vendas/validation';
import {
  kpiVendas,
  rankingVendedores,
  rankingProdutos,
  rankingClientes,
  evolucaoMensal,
} from '$lib/server/dashboard/service';

const EMPRESA_X = 22;
const USER_X1 = 'user-x1';
const USER_X2 = 'user-x2';

describe('Suíte X — M11: Dashboard', () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    const MIGRATIONS = (env as unknown as Record<string, unknown>).TEST_MIGRATIONS as Parameters<
      typeof applyD1Migrations
    >[1];
    await applyD1Migrations(env.DB, MIGRATIONS);
    db = getDb(env.DB);

    // Seed empresa
    await db.run(
      `INSERT OR IGNORE INTO empresas (id, nome, cnpj, criado_em, atualizado_em)
       VALUES (${EMPRESA_X}, 'Empresa X', NULL, '2026-01-01', '2026-01-01')`
    );

    // Seed usuários
    for (const uid of [USER_X1, USER_X2]) {
      await db.run(
        `INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at)
         VALUES ('${uid}', 'Vendedor ${uid}', '${uid}@test.com', 1, 1735689600, 1735689600)`
      );
      await db.run(
        `INSERT OR IGNORE INTO membros_empresa (empresa_id, user_id, papel, ativo, criado_em, atualizado_em)
         VALUES (${EMPRESA_X}, '${uid}', 'operador', 1, '2026-01-01', '2026-01-01')`
      );
    }

    // Seed cliente
    await db.run(
      `INSERT OR IGNORE INTO clientes (id, empresa_id, nome, tipo_pessoa, documento, telefone, ativo, criado_em, atualizado_em)
       VALUES (100, ${EMPRESA_X}, 'Cliente X Teste', 'PF', '00000000000', '00000000000', 1, '2026-01-01', '2026-01-01')`
    );

    // Helper para criar VendaNormalizada com defaults
    function venda(overrides: Partial<VendaNormalizada>): VendaNormalizada {
      return {
        vendedor_id: null,
        cliente_id: null,
        produto_id: null,
        data_venda: '2026-01-15',
        data_lancamento: '2026-01-15',
        data_embarque: null,
        data_final: null,
        desconto_comercial_aplicado: false,
        desconto_comercial_centavos: 0,
        valor_bruto_centavos: 100_000,
        valor_taxas_centavos: 0,
        valor_total_centavos: 100_000,
        valor_nao_comissionado_centavos: 0,
        notas: null,
        chave_idempotencia: null,
        itens: [],
        pagamentos: [],
        ...overrides,
      };
    }

    // Janeiro: vendedor X1 = R$ 5.000, X2 = R$ 3.000
    await criarVenda(db, EMPRESA_X, USER_X1, venda({
      data_venda: '2026-01-15',
      vendedor_id: USER_X1,
      valor_bruto_centavos: 500_000,
      valor_total_centavos: 500_000,
      itens: [{
        produto_id: null,
        descricao: 'Pacote Cancún',
        tipo: 'pacote',
        moeda: 'BRL',
        cambio_centavos: 10000,
        valor_neto_centavos: 300_000,
        valor_bruto_centavos: 500_000,
        valor_taxas_centavos: 0,
        valor_total_centavos: 500_000,
        pax: 2,
        paga_comissao: true,
        data_servico: null,
        data_fim_servico: null,
        numero_recibo: null,
        numero_reserva: null,
      }],
    }));

    await criarVenda(db, EMPRESA_X, USER_X2, venda({
      data_venda: '2026-01-20',
      vendedor_id: USER_X2,
      cliente_id: 100,
      valor_bruto_centavos: 300_000,
      valor_total_centavos: 300_000,
      itens: [{
        produto_id: null,
        descricao: 'Pacote Europa',
        tipo: 'pacote',
        moeda: 'BRL',
        cambio_centavos: 10000,
        valor_neto_centavos: 300_000,
        valor_bruto_centavos: 300_000,
        valor_taxas_centavos: 0,
        valor_total_centavos: 300_000,
        pax: 1,
        paga_comissao: false,
        notas: null,
        data_servico: null,
        data_fim_servico: null,
        numero_recibo: null,
        numero_reserva: null,
      }],
    }));

    // Fevereiro: vendedor X1 = R$ 2.000
    await criarVenda(db, EMPRESA_X, USER_X1, venda({
      data_venda: '2026-02-10',
      vendedor_id: USER_X1,
      valor_bruto_centavos: 200_000,
      valor_total_centavos: 200_000,
      itens: [{
        produto_id: null,
        descricao: 'Passeio Rio',
        tipo: 'pacote',
        moeda: 'BRL',
        cambio_centavos: 10000,
        valor_neto_centavos: 200_000,
        valor_bruto_centavos: 200_000,
        valor_taxas_centavos: 0,
        valor_total_centavos: 200_000,
        pax: 1,
        paga_comissao: false,
        notas: null,
        data_servico: null,
        data_fim_servico: null,
        numero_recibo: null,
        numero_reserva: null,
      }],
    }));
  });

  // ── X1: KPIs gerais ───────────────────────────────────────────────────────
  it('X1. kpiVendas — totalVendas = 3, receitaBruta = 1.000.000 centavos', async () => {
    const kpis = await kpiVendas(db, EMPRESA_X);
    expect(kpis.totalVendas).toBe(3);
    expect(kpis.totalCanceladas).toBe(0);
    expect(kpis.receitaBrutaCentavos).toBe(1_000_000);
    expect(kpis.valorPagoCentavos).toBe(0);
    expect(kpis.valorEmAbertoCentavos).toBe(1_000_000);
    expect(kpis.pctAdimplencia).toBe(0);
    expect(kpis.ticketMedioCentavos).toBeCloseTo(333_333, -2);
  });

  // ── X2: KPIs com filtro de período ───────────────────────────────────────
  it('X2. kpiVendas com filtro — apenas janeiro: 2 vendas, R$ 8.000', async () => {
    const kpis = await kpiVendas(db, EMPRESA_X, {
      dataInicio: '2026-01-01',
      dataFim:    '2026-01-31',
    });
    expect(kpis.totalVendas).toBe(2);
    expect(kpis.receitaBrutaCentavos).toBe(800_000);
  });

  // ── X3: Isolamento de tenant ─────────────────────────────────────────────
  it('X3. kpiVendas — empresa inexistente retorna zeros', async () => {
    const kpis = await kpiVendas(db, 99_999);
    expect(kpis.totalVendas).toBe(0);
    expect(kpis.receitaBrutaCentavos).toBe(0);
    expect(kpis.pctAdimplencia).toBe(100); // sem receita → 100% adimplente (edge)
  });

  // ── X4: Ranking de vendedores ────────────────────────────────────────────
  it('X4. rankingVendedores — X1 lidera em receita', async () => {
    const ranking = await rankingVendedores(db, EMPRESA_X);
    expect(ranking.length).toBeGreaterThanOrEqual(2);
    expect(ranking[0].vendedorId).toBe(USER_X1);
    expect(ranking[0].receitaCentavos).toBe(700_000); // 500k + 200k
    expect(ranking[1].vendedorId).toBe(USER_X2);
    expect(ranking[1].receitaCentavos).toBe(300_000);
  });

  // ── X5: Ranking de vendedores com filtro ─────────────────────────────────
  it('X5. rankingVendedores filtrado — fevereiro: apenas X1', async () => {
    const ranking = await rankingVendedores(db, EMPRESA_X, {
      dataInicio: '2026-02-01',
      dataFim:    '2026-02-28',
    });
    expect(ranking.length).toBe(1);
    expect(ranking[0].vendedorId).toBe(USER_X1);
    expect(ranking[0].receitaCentavos).toBe(200_000);
  });

  // ── X6: Ranking de produtos ──────────────────────────────────────────────
  it('X6. rankingProdutos — retorna "Pacote Cancún" com maior receita', async () => {
    const ranking = await rankingProdutos(db, EMPRESA_X);
    expect(ranking.length).toBeGreaterThan(0);
    expect(ranking[0].descricao).toBe('Pacote Cancún');
    expect(ranking[0].receitaCentavos).toBe(500_000);
    expect(ranking[0].tipo).toBe('pacote');
  });

  // ── X7: Ranking de clientes ──────────────────────────────────────────────
  it('X7. rankingClientes — cliente 100 com R$ 3.000', async () => {
    const ranking = await rankingClientes(db, EMPRESA_X);
    const c100 = ranking.find((r) => r.clienteId === 100);
    expect(c100).toBeDefined();
    expect(c100!.receitaCentavos).toBe(300_000);
    expect(c100!.nome).toBe('Cliente X Teste');
  });

  // ── X8: Evolução mensal ──────────────────────────────────────────────────
  it('X8. evolucaoMensal — 2 meses: jan e fev', async () => {
    const serie = await evolucaoMensal(db, EMPRESA_X);
    expect(serie.length).toBe(2);
    expect(serie[0].mes).toBe('2026-01');
    expect(serie[0].totalVendas).toBe(2);
    expect(serie[0].receitaCentavos).toBe(800_000);
    expect(serie[1].mes).toBe('2026-02');
    expect(serie[1].totalVendas).toBe(1);
    expect(serie[1].receitaCentavos).toBe(200_000);
  });

  // ── X9: Evolução mensal com filtro ──────────────────────────────────────
  it('X9. evolucaoMensal filtrado — apenas jan: 1 mês na série', async () => {
    const serie = await evolucaoMensal(db, EMPRESA_X, {
      dataInicio: '2026-01-01',
      dataFim:    '2026-01-31',
    });
    expect(serie.length).toBe(1);
    expect(serie[0].mes).toBe('2026-01');
  });

  // ── X10: ticket médio ────────────────────────────────────────────────────
  it('X10. kpiVendas — ticketMedio = receitaBruta / totalVendas', async () => {
    const kpis = await kpiVendas(db, EMPRESA_X);
    const esperado = Math.round(kpis.receitaBrutaCentavos / kpis.totalVendas);
    expect(kpis.ticketMedioCentavos).toBe(esperado);
  });
});
