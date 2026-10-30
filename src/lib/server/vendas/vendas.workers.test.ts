/**
 * F4-01 — Testes de integração de vendas no runtime Workers real
 * (workerd via Miniflare): D1 local efêmero.
 *
 * Cobre:
 *   A. Criação transacional (cabeçalho + itens + pagamentos + parcelas)
 *   B. Idempotência: mesmo chave_idempotencia → retorna venda existente
 *   C. Listagem com cursor pagination e filtros
 *   D. Detalhe: venda com itens e pagamentos completos
 *   E. Cancelamento lógico + concorrência otimista (versao)
 *   F. Isolamento de tenant: empresa B não vê vendas da empresa A
 *   G. Status derivado: pendente / confirmada / concluida / cancelada
 *
 * Executar:
 *   npx vitest run --project workers src/lib/server/vendas/vendas.workers.test.ts
 */

/// <reference types="@cloudflare/vitest-pool-workers" />

import type { ApiEnv } from '$lib/server/api/types';
type WorkerBindings = ApiEnv['Bindings'];

declare module 'cloudflare:test' {
  interface ProvidedEnv extends WorkerBindings {}
}

import { env } from 'cloudflare:test';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '$lib/server/db/client';
import {
  VendaError,
  criarVenda,
  listarVendas,
  obterVenda,
  cancelarVenda,
  derivarStatus,
} from './service';
import type { VendaNormalizada } from './validation';

const MIGRATIONS = (env as Record<string, unknown>).TEST_MIGRATIONS as Parameters<
  typeof applyD1Migrations
>[1];

const EMPRESA_A = 1;
const EMPRESA_B = 2;
const USUARIO_A = 'usr-a';
const USUARIO_B = 'usr-b';

// ─────────────────────────────────────────────────────────────────────────────
// Fixture: venda normalizada mínima e válida
// ─────────────────────────────────────────────────────────────────────────────

function vendaMinima(overrides: Partial<VendaNormalizada> = {}): VendaNormalizada {
  return {
    vendedor_id: USUARIO_A,
    cliente_id: null,
    produto_id: null,
    data_venda: '2024-11-01',
    data_lancamento: '2024-11-01',
    data_embarque: null,
    data_final: null,
    desconto_comercial_aplicado: false,
    desconto_comercial_centavos: 0,
    valor_nao_comissionado_centavos: 0,
    notas: null,
    chave_idempotencia: null,
    itens: [
      {
        produto_id: null,
        numero_recibo: 'REC-001',
        numero_reserva: null,
        data_servico: '2024-12-20',
        data_fim_servico: null,
        pax: 2,
        descricao: 'Pacote Cancún 7 noites',
        tipo: 'pacote',
        moeda: 'BRL',
        cambio_centavos: 10000,
        valor_neto_centavos: 500000,
        valor_bruto_centavos: 600000,
        valor_taxas_centavos: 5000,
        valor_total_centavos: 605000,
        paga_comissao: true,
        notas: null,
      },
    ],
    pagamentos: [
      {
        forma_id: null,
        forma_nome: 'Cartão de Crédito',
        operacao: 'debito',
        plano: '3x',
        valor_bruto_centavos: 605000,
        desconto_centavos: 0,
        valor_total_centavos: 605000,
        parcelas_qtd: 3,
        parcelas_valor_centavos: 201667,
        paga_comissao: true,
        parcelas: [
          { numero: 1, valor_centavos: 201667, vencimento: '2024-12-01' },
          { numero: 2, valor_centavos: 201667, vencimento: '2025-01-01' },
          { numero: 3, valor_centavos: 201666, vencimento: '2025-02-01' },
        ],
      },
    ],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await applyD1Migrations(env.DB, MIGRATIONS);
});

beforeEach(async () => {
  for (const t of [
    'venda_parcelas', 'venda_pagamentos', 'venda_itens', 'vendas',
    'membros_empresa', 'session', 'user', 'empresas',
  ]) {
    await env.DB.exec(`DELETE FROM ${t}`);
  }

  const agora = new Date().toISOString();
  const ts = Date.now();

  await env.DB.batch([
    env.DB.prepare('INSERT INTO empresas (id, nome, criado_em, atualizado_em) VALUES (?, ?, ?, ?)')
      .bind(EMPRESA_A, 'Agência Alfa', agora, agora),
    env.DB.prepare('INSERT INTO empresas (id, nome, criado_em, atualizado_em) VALUES (?, ?, ?, ?)')
      .bind(EMPRESA_B, 'Agência Beta', agora, agora),
  ]);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO user (id, name, email, email_verified, empresa_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(USUARIO_A, 'Admin Alfa', 'admin@alfa.com', 1, EMPRESA_A, ts, ts),
    env.DB.prepare('INSERT INTO user (id, name, email, email_verified, empresa_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(USUARIO_B, 'Admin Beta', 'admin@beta.com', 1, EMPRESA_B, ts, ts),
  ]);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO membros_empresa (empresa_id, user_id, papel, ativo, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(EMPRESA_A, USUARIO_A, 'admin', 1, agora, agora),
    env.DB.prepare('INSERT INTO membros_empresa (empresa_id, user_id, papel, ativo, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(EMPRESA_B, USUARIO_B, 'admin', 1, agora, agora),
  ]);
});

const db = () => getDb(env.DB);

// ─────────────────────────────────────────────────────────────────────────────
// A. Criação transacional
// ─────────────────────────────────────────────────────────────────────────────

describe('A. Criação transacional', () => {
  it('cria venda com itens, pagamentos e parcelas em uma transação', async () => {
    const venda = await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);

    // cabeçalho
    expect(venda.id).toBeGreaterThan(0);
    expect(venda.empresaId).toBe(EMPRESA_A);
    expect(venda.numeroVenda).toMatch(/^VTUR-\d{4}-\d{5}$/);
    expect(venda.cancelada).toBe(false);
    expect(venda.versao).toBe(1);
    expect(venda.criadoPor).toBe(USUARIO_A);

    // totais calculados dos itens
    expect(venda.valorBrutoCentavos).toBe(600000);
    expect(venda.valorTaxasCentavos).toBe(5000);
    expect(venda.valorTotalCentavos).toBe(605000);
    expect(venda.valorPagoCentavos).toBe(605000);

    // itens
    expect(venda.itens).toHaveLength(1);
    const item = venda.itens[0];
    expect(item.descricao).toBe('Pacote Cancún 7 noites');
    expect(item.valorBrutoCentavos).toBe(600000);
    expect(item.valorTotalCentavos).toBe(605000);

    // pagamentos
    expect(venda.pagamentos).toHaveLength(1);
    const pag = venda.pagamentos[0];
    expect(pag.formaNome).toBe('Cartão de Crédito');
    expect(pag.valorTotalCentavos).toBe(605000);
    expect(pag.parcelas).toHaveLength(3);
    expect(pag.parcelas[0].vencimento).toBe('2024-12-01');
  });

  it('gera número de venda sequencial por empresa', async () => {
    const v1 = await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    const v2 = await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    const vB = await criarVenda(db(), EMPRESA_B, USUARIO_B, vendaMinima({
      vendedor_id: USUARIO_B,
    }), env.DB);

    expect(v1.numeroVenda).not.toBe(v2.numeroVenda);
    // empresa B tem sequencial próprio
    expect(vB.numeroVenda).toMatch(/^VTUR-\d{4}-/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Idempotência
// ─────────────────────────────────────────────────────────────────────────────

describe('B. Idempotência', () => {
  it('retorna a venda existente quando chave_idempotencia é reutilizada', async () => {
    const chave = '550e8400-e29b-41d4-a716-446655440000';
    const v1 = await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima({ chave_idempotencia: chave }), env.DB);
    const v2 = await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima({ chave_idempotencia: chave }), env.DB);

    expect(v1.id).toBe(v2.id);
    expect(v1.numeroVenda).toBe(v2.numeroVenda);
  });

  it('chaves distintas por empresa são independentes (UUIDs devem ser únicos globalmente)', async () => {
    // chave_idempotencia tem índice UNIQUE global — UUIDs v4 garantem unicidade global.
    // Cada empresa usa sua própria chave; reutilização global é prevenida pelo design.
    const chaveA = '550e8400-e29b-41d4-a716-446655440011';
    const chaveB = '550e8400-e29b-41d4-a716-446655440012';
    const vA = await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima({ chave_idempotencia: chaveA }), env.DB);
    const vB = await criarVenda(db(), EMPRESA_B, USUARIO_B, vendaMinima({
      vendedor_id: USUARIO_B,
      chave_idempotencia: chaveB,
    }), env.DB);

    expect(vA.id).not.toBe(vB.id);
    // Idempotência funciona por empresa: mesma chave A → retorna vA
    const vA2 = await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima({ chave_idempotencia: chaveA }), env.DB);
    expect(vA2.id).toBe(vA.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Listagem com cursor e filtros
// ─────────────────────────────────────────────────────────────────────────────

describe('C. Listagem com cursor pagination', () => {
  it('lista e pagina vendas da empresa', async () => {
    for (let i = 0; i < 5; i++) {
      await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    }

    const pag1 = await listarVendas(db(), EMPRESA_A, { limite: 3 });
    expect(pag1.itens).toHaveLength(3);
    expect(pag1.proximo_cursor).not.toBeNull();

    const pag2 = await listarVendas(db(), EMPRESA_A, {
      limite: 3,
      cursor: pag1.proximo_cursor!,
    });
    expect(pag2.itens).toHaveLength(2);
    expect(pag2.proximo_cursor).toBeNull();

    // sem duplicatas
    const idsP1 = pag1.itens.map((i) => i.id);
    const idsP2 = pag2.itens.map((i) => i.id);
    expect(new Set([...idsP1, ...idsP2]).size).toBe(5);
  });

  it('filtra por canceladas', async () => {
    const v = await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    await cancelarVenda(db(), EMPRESA_A, v.id, 1);

    const ativas = await listarVendas(db(), EMPRESA_A, { canceladas: false });
    const canceladas = await listarVendas(db(), EMPRESA_A, { canceladas: true });

    expect(ativas.itens.every((i) => !i.cancelada)).toBe(true);
    expect(canceladas.itens.every((i) => i.cancelada)).toBe(true);
    expect(ativas.itens.length + canceladas.itens.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Detalhe
// ─────────────────────────────────────────────────────────────────────────────

describe('D. Detalhe de venda', () => {
  it('obterVenda retorna cabeçalho + itens + pagamentos + parcelas', async () => {
    const criada = await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    const venda = await obterVenda(db(), EMPRESA_A, criada.id);

    expect(venda.id).toBe(criada.id);
    expect(venda.itens).toHaveLength(1);
    expect(venda.pagamentos).toHaveLength(1);
    expect(venda.pagamentos[0].parcelas).toHaveLength(3);
  });

  it('lança NAO_ENCONTRADA para ID inexistente', async () => {
    await expect(obterVenda(db(), EMPRESA_A, 99999)).rejects.toSatisfy(
      (e: VendaError) => e instanceof VendaError && e.code === 'NAO_ENCONTRADA'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Cancelamento lógico + concorrência otimista
// ─────────────────────────────────────────────────────────────────────────────

describe('E. Cancelamento e concorrência', () => {
  it('cancela logicamente (sem exclusão física)', async () => {
    const v = await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    await cancelarVenda(db(), EMPRESA_A, v.id, 1);

    const cancelada = await obterVenda(db(), EMPRESA_A, v.id);
    expect(cancelada.cancelada).toBe(true);
    expect(cancelada.versao).toBe(2);
    expect(cancelada.status).toBe('cancelada');
    // itens e pagamentos preservados
    expect(cancelada.itens).toHaveLength(1);
  });

  it('rejeita cancelamento com versão desatualizada', async () => {
    const v = await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    await expect(cancelarVenda(db(), EMPRESA_A, v.id, 99)).rejects.toSatisfy(
      (e: VendaError) => e instanceof VendaError && e.code === 'CONFLITO_VERSAO'
    );
  });

  it('rejeita cancelar venda já cancelada', async () => {
    const v = await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    await cancelarVenda(db(), EMPRESA_A, v.id, 1);
    await expect(cancelarVenda(db(), EMPRESA_A, v.id, 2)).rejects.toSatisfy(
      (e: VendaError) => e instanceof VendaError && e.code === 'CANCELADA'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Isolamento de tenant
// ─────────────────────────────────────────────────────────────────────────────

describe('F. Isolamento de tenant', () => {
  it('empresa B não lê venda da empresa A', async () => {
    const v = await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);

    await expect(obterVenda(db(), EMPRESA_B, v.id)).rejects.toSatisfy(
      (e: VendaError) => e instanceof VendaError && e.code === 'NAO_ENCONTRADA'
    );
  });

  it('empresa B não cancela venda da empresa A', async () => {
    const v = await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);

    await expect(cancelarVenda(db(), EMPRESA_B, v.id, 1)).rejects.toSatisfy(
      (e: VendaError) => e instanceof VendaError && e.code === 'NAO_ENCONTRADA'
    );
  });

  it('listar retorna apenas vendas da empresa solicitante', async () => {
    await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    await criarVenda(db(), EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    await criarVenda(db(), EMPRESA_B, USUARIO_B, vendaMinima({ vendedor_id: USUARIO_B }), env.DB);

    const vendasA = await listarVendas(db(), EMPRESA_A);
    const vendasB = await listarVendas(db(), EMPRESA_B);

    expect(vendasA.itens).toHaveLength(2);
    expect(vendasB.itens).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. Status derivado
// ─────────────────────────────────────────────────────────────────────────────

describe('G. Status derivado (derivarStatus)', () => {
  const hoje = new Date().toISOString().slice(0, 10);
  const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  it('cancelada → "cancelada"', () => {
    expect(derivarStatus({ cancelada: true, dataEmbarque: amanha, dataFinal: null })).toBe('cancelada');
  });

  it('data_final no passado → "concluida"', () => {
    expect(derivarStatus({ cancelada: false, dataEmbarque: null, dataFinal: ontem })).toBe('concluida');
  });

  it('data_embarque hoje ou futuro → "confirmada"', () => {
    expect(derivarStatus({ cancelada: false, dataEmbarque: hoje, dataFinal: null })).toBe('confirmada');
    expect(derivarStatus({ cancelada: false, dataEmbarque: amanha, dataFinal: null })).toBe('confirmada');
  });

  it('sem datas especiais → "pendente"', () => {
    expect(derivarStatus({ cancelada: false, dataEmbarque: null, dataFinal: null })).toBe('pendente');
  });
});
