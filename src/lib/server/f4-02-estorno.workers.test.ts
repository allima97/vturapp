/**
 * F4-02 — Estorno de pagamento e invariantes (Workers runtime / D1 real).
 *
 * Suíte O: operações de estorno financeiro com DB efêmero.
 *
 * Executar:
 *   npx vitest run --project workers src/lib/server/f4-02-estorno.workers.test.ts
 */

/// <reference types="@cloudflare/vitest-pool-workers" />

import type { ApiEnv } from '$lib/server/api/types';
type WorkerBindings = ApiEnv['Bindings'];
declare module 'cloudflare:test' {
  interface ProvidedEnv extends WorkerBindings {}
}

// Suprime import ?raw do brand (Workers não resolve Vite ?raw)
import { vi } from 'vitest';
vi.mock('$lib/brand', () => ({
  VTUR_LOGO_URL: 'https://example.com/logo.png',
  VTUR_NOME: 'VTUR',
  VTUR_CNPJ: '00.000.000/0001-00',
}));

import { env } from 'cloudflare:test';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '$lib/server/db/client';
import { criarVenda, estornarPagamento, obterVenda, VendaError } from '$lib/server/vendas/service';
import type { VendaNormalizada } from '$lib/server/vendas/validation';

const MIGRATIONS = (env as unknown as Record<string, unknown>).TEST_MIGRATIONS as Parameters<
  typeof applyD1Migrations
>[1];

const EMPRESA_O = 10; // empresa dedicada a esta suíte

function db() {
  return getDb(env.DB);
}

// ── seed helpers ──────────────────────────────────────────────────────────────

async function seedEmpresa(id: number) {
  await env.DB.exec(
    `INSERT OR IGNORE INTO empresas (id, nome, cnpj, criado_em, atualizado_em) VALUES (${id}, 'Empresa O${id}', NULL, '2026-01-01', '2026-01-01')`
  );
}

async function seedUser(userId: string, empresaId: number) {
  await env.DB.exec(
    `INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('${userId}', 'User ${userId}', '${userId}@test.com', 1, 1735689600, 1735689600)`
  );
  await env.DB.exec(
    `INSERT OR IGNORE INTO membros_empresa (empresa_id, user_id, papel, ativo, criado_em, atualizado_em) VALUES (${empresaId}, '${userId}', 'admin', 1, '2026-01-01', '2026-01-01')`
  );
}

const vendaBase: VendaNormalizada = {
  data_venda: '2026-11-01',
  data_lancamento: '2026-11-01',
  data_embarque: '2026-12-01',
  data_final: '2026-12-10',
  vendedor_id: 'user-o1',
  cliente_id: null,
  produto_id: null,
  desconto_comercial_aplicado: false,
  desconto_comercial_centavos: 0,
  valor_nao_comissionado_centavos: 0,
  valor_bruto_centavos: 10_000,
  valor_taxas_centavos: 0,
  valor_total_centavos: 10_000,
  notas: null,
  chave_idempotencia: null,
  itens: [
    {
      produto_id: null,
      numero_recibo: null,
      numero_reserva: null,
      data_servico: '2026-12-01',
      data_fim_servico: '2026-12-10',
      pax: 2,
      descricao: 'Pacote de teste',
      tipo: 'pacote',
      moeda: 'BRL',
      cambio_centavos: 10000,
      valor_neto_centavos: 8000,
      valor_bruto_centavos: 10_000,
      valor_taxas_centavos: 0,
      valor_total_centavos: 10_000,
      paga_comissao: true,
      notas: null,
    },
  ],
  pagamentos: [
    {
      forma_id: null,
      forma_nome: 'Cartão',
      operacao: 'crédito',
      plano: '1x',
      valor_bruto_centavos: 10_000,
      desconto_centavos: 0,
      valor_total_centavos: 10_000,
      parcelas_qtd: 1,
      parcelas_valor_centavos: 10_000,
      paga_comissao: true,
      parcelas: [{ numero: 1, valor_centavos: 10_000, vencimento: '2026-12-01' }],
    },
  ],
};

// ── setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await applyD1Migrations(env.DB, MIGRATIONS);
  await seedEmpresa(EMPRESA_O);
  await seedUser('user-o1', EMPRESA_O);
});

// ─────────────────────────────────────────────────────────────────────────────
// O. Estorno financeiro
// ─────────────────────────────────────────────────────────────────────────────

describe('O. estornarPagamento — estorno financeiro', () => {

  // O1. Cria uma venda com pagamento e registra estorno parcial
  it('O1. estorno parcial: valor_pago reduz e nova linha de pagamento é inserida', async () => {
    const venda = await criarVenda(db(), EMPRESA_O, 'user-o1', vendaBase);
    expect(venda.valorPagoCentavos).toBe(10_000);
    expect(venda.versao).toBe(1);

    const resultado = await estornarPagamento(db(), EMPRESA_O, venda.id, {
      formaNome: 'Cartão',
      valorCentavos: 3_000,
      motivo: 'devolução parcial',
      versaoAtual: 1,
    });

    // valor_pago cai do estorno
    expect(resultado.valorPagoCentavos).toBe(7_000);
    // versão incrementa
    expect(resultado.versao).toBe(2);
    // a venda continua ativa (não cancelada)
    expect(resultado.cancelada).toBe(false);
    // nova linha de pagamento com valor negativo
    const estorno = resultado.pagamentos.find((p) => p.operacao?.startsWith('estorno'));
    expect(estorno).toBeDefined();
    expect(estorno!.valorTotalCentavos).toBe(-3_000);
    expect(estorno!.valorBrutoCentavos).toBe(-3_000);
  });

  // O2. Estorno total: valor_pago chega a zero
  it('O2. estorno total: valor_pago = 0', async () => {
    const venda = await criarVenda(db(), EMPRESA_O, 'user-o1', {
      ...vendaBase,
      chave_idempotencia: 'o2-' + Date.now(),
    });

    const resultado = await estornarPagamento(db(), EMPRESA_O, venda.id, {
      formaNome: 'Pix',
      valorCentavos: 10_000,
      versaoAtual: venda.versao,
    });

    expect(resultado.valorPagoCentavos).toBe(0);
    expect(resultado.versao).toBe(venda.versao + 1);
  });

  // O3. Conflito de versão
  it('O3. versaoAtual errada → VendaError CONFLITO_VERSAO', async () => {
    const venda = await criarVenda(db(), EMPRESA_O, 'user-o1', {
      ...vendaBase,
      chave_idempotencia: 'o3-' + Date.now(),
    });

    await expect(
      estornarPagamento(db(), EMPRESA_O, venda.id, {
        formaNome: 'Cartão',
        valorCentavos: 1_000,
        versaoAtual: 99, // errado
      })
    ).rejects.toSatisfy((e: unknown) => (e as VendaError).code === 'CONFLITO_VERSAO');
  });

  // O4. Venda inexistente → NAO_ENCONTRADA
  it('O4. venda inexistente → VendaError NAO_ENCONTRADA', async () => {
    await expect(
      estornarPagamento(db(), EMPRESA_O, 999_999, {
        formaNome: 'Cartão',
        valorCentavos: 1_000,
        versaoAtual: 1,
      })
    ).rejects.toSatisfy((e: unknown) => (e as VendaError).code === 'NAO_ENCONTRADA');
  });

  // O5. Venda cancelada não aceita estorno
  it('O5. venda cancelada → VendaError CANCELADA', async () => {
    const { cancelarVenda } = await import('$lib/server/vendas/service');
    const venda = await criarVenda(db(), EMPRESA_O, 'user-o1', {
      ...vendaBase,
      chave_idempotencia: 'o5-' + Date.now(),
    });
    await cancelarVenda(db(), EMPRESA_O, venda.id, venda.versao);

    await expect(
      estornarPagamento(db(), EMPRESA_O, venda.id, {
        formaNome: 'Cartão',
        valorCentavos: 1_000,
        versaoAtual: venda.versao + 1,
      })
    ).rejects.toSatisfy((e: unknown) => (e as VendaError).code === 'CANCELADA');
  });

  // O6. Valor zero → VendaError VALIDACAO
  it('O6. valor_centavos = 0 → VendaError VALIDACAO', async () => {
    const venda = await criarVenda(db(), EMPRESA_O, 'user-o1', {
      ...vendaBase,
      chave_idempotencia: 'o6-' + Date.now(),
    });

    await expect(
      estornarPagamento(db(), EMPRESA_O, venda.id, {
        formaNome: 'Cartão',
        valorCentavos: 0,
        versaoAtual: venda.versao,
      })
    ).rejects.toSatisfy((e: unknown) => (e as VendaError).code === 'VALIDACAO');
  });

  // O7. Isolamento de tenant: empresa errada não consegue estornar
  it('O7. empresa errada → VendaError NAO_ENCONTRADA', async () => {
    const venda = await criarVenda(db(), EMPRESA_O, 'user-o1', {
      ...vendaBase,
      chave_idempotencia: 'o7-' + Date.now(),
    });

    await expect(
      estornarPagamento(db(), EMPRESA_O + 99, venda.id, {
        formaNome: 'Cartão',
        valorCentavos: 1_000,
        versaoAtual: venda.versao,
      })
    ).rejects.toSatisfy((e: unknown) => (e as VendaError).code === 'NAO_ENCONTRADA');
  });

  // O8. Estornos sequenciais preservam versão incremental
  it('O8. dois estornos sequenciais incrementam versão corretamente', async () => {
    const venda = await criarVenda(db(), EMPRESA_O, 'user-o1', {
      ...vendaBase,
      chave_idempotencia: 'o8-' + Date.now(),
    });
    const v1 = venda.versao;

    const ap1 = await estornarPagamento(db(), EMPRESA_O, venda.id, {
      formaNome: 'Dinheiro',
      valorCentavos: 2_000,
      versaoAtual: v1,
    });
    expect(ap1.versao).toBe(v1 + 1);

    const ap2 = await estornarPagamento(db(), EMPRESA_O, venda.id, {
      formaNome: 'Dinheiro',
      valorCentavos: 3_000,
      versaoAtual: v1 + 1,
    });
    expect(ap2.versao).toBe(v1 + 2);
    expect(ap2.valorPagoCentavos).toBe(10_000 - 2_000 - 3_000);
  });
});
