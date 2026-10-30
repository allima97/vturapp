/**
 * F4-01 / F4-02 — Testes de integração de vendas no runtime Workers real
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
 *   H. Edição (PATCH): substituição atômica + recálculo de totais
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
  editarVenda,
  resumoVendas,
  listarParcelas,
  derivarStatus,
} from './service';
import type { VendaNormalizada, VendaEdicaoNormalizada } from './validation';

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
    valor_bruto_centavos: 600000,
    valor_taxas_centavos: 5000,
    valor_total_centavos: 605000,
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

// ─────────────────────────────────────────────────────────────────────────────
// H. Edição — PATCH /vendas/:id (F4-02)
// ─────────────────────────────────────────────────────────────────────────────

describe('H. Edição de venda (editarVenda)', () => {
  // ── H1. Happy path: substituição completa de itens e pagamentos ──
  it('H1. substitui itens e pagamentos, recalcula totais e incrementa versao', async () => {
    const db = getDb(env.DB);
    const original = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    expect(original.versao).toBe(1);
    expect(original.valorTotalCentavos).toBe(605000);
    expect(original.itens).toHaveLength(1);
    expect(original.pagamentos).toHaveLength(1);

    // Novo item com valor diferente
    const novosItens: VendaEdicaoNormalizada['itens'] = [
      {
        produto_id: null,
        numero_recibo: 'REC-002',
        numero_reserva: null,
        data_servico: '2024-12-22',
        data_fim_servico: null,
        pax: 1,
        descricao: 'Passagem aérea GRU-CUN',
        tipo: 'passagem',
        moeda: 'BRL',
        cambio_centavos: 10000,
        valor_neto_centavos: 80000,
        valor_bruto_centavos: 120000,
        valor_taxas_centavos: 8000,
        valor_total_centavos: 128000,
        paga_comissao: true,
        notas: null,
      },
    ];
    const novosPagamentos: VendaEdicaoNormalizada['pagamentos'] = [
      {
        forma_id: null,
        forma_nome: 'PIX',
        operacao: null,
        plano: null,
        valor_bruto_centavos: 128000,
        desconto_centavos: 0,
        valor_total_centavos: 128000,
        parcelas_qtd: 1,
        parcelas_valor_centavos: 128000,
        paga_comissao: true,
        parcelas: [{ numero: 1, valor_centavos: 128000, vencimento: null }],
      },
    ];

    const editada = await editarVenda(db, EMPRESA_A, original.id, 1, {
      itens: novosItens,
      pagamentos: novosPagamentos,
    }, env.DB);

    expect(editada.versao).toBe(2);
    expect(editada.itens).toHaveLength(1);
    expect(editada.itens[0].descricao).toBe('Passagem aérea GRU-CUN');
    expect(editada.valorTotalCentavos).toBe(128000);
    expect(editada.valorPagoCentavos).toBe(128000);
    expect(editada.pagamentos).toHaveLength(1);
    expect(editada.pagamentos[0].formaNome).toBe('PIX');
    expect(editada.pagamentos[0].parcelas).toHaveLength(1);
  });

  // ── H2. Edição parcial: apenas campos do cabeçalho (sem itens/pagamentos) ──
  it('H2. edição parcial do cabeçalho não remove itens/pagamentos existentes', async () => {
    const db = getDb(env.DB);
    const original = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);

    const editada = await editarVenda(db, EMPRESA_A, original.id, 1, {
      notas: 'Notas atualizadas via PATCH',
      data_embarque: '2024-12-20',
    }, env.DB);

    expect(editada.versao).toBe(2);
    expect(editada.notas).toBe('Notas atualizadas via PATCH');
    expect(editada.dataEmbarque).toBe('2024-12-20');
    // Itens e pagamentos permanecem inalterados
    expect(editada.itens).toHaveLength(1);
    expect(editada.itens[0].descricao).toBe('Pacote Cancún 7 noites');
    expect(editada.pagamentos).toHaveLength(1);
    // Totais mantidos
    expect(editada.valorTotalCentavos).toBe(605000);
  });

  // ── H3. Substituição apenas de pagamentos (mantém itens) ──
  it('H3. substituição apenas de pagamentos mantém itens intactos', async () => {
    const db = getDb(env.DB);
    const original = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);

    const novosPagamentos: VendaEdicaoNormalizada['pagamentos'] = [
      {
        forma_id: null,
        forma_nome: 'Transferência',
        operacao: null,
        plano: null,
        valor_bruto_centavos: 605000,
        desconto_centavos: 0,
        valor_total_centavos: 605000,
        parcelas_qtd: 1,
        parcelas_valor_centavos: 605000,
        paga_comissao: false,
        parcelas: [{ numero: 1, valor_centavos: 605000, vencimento: '2024-12-01' }],
      },
    ];

    const editada = await editarVenda(db, EMPRESA_A, original.id, 1, {
      pagamentos: novosPagamentos,
    }, env.DB);

    expect(editada.versao).toBe(2);
    // Itens inalterados
    expect(editada.itens).toHaveLength(1);
    expect(editada.itens[0].descricao).toBe('Pacote Cancún 7 noites');
    // Novo pagamento
    expect(editada.pagamentos).toHaveLength(1);
    expect(editada.pagamentos[0].formaNome).toBe('Transferência');
    expect(editada.pagamentos[0].parcelas[0].vencimento).toBe('2024-12-01');
    // valor_pago recalculado
    expect(editada.valorPagoCentavos).toBe(605000);
  });

  // ── H4. Conflito de versão ──
  it('H4. versao desatualizada → CONFLITO_VERSAO', async () => {
    const db = getDb(env.DB);
    const original = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);

    // Simular que outra sessão editou antes (versão 1 → 2)
    await editarVenda(db, EMPRESA_A, original.id, 1, { notas: 'primeira edição' }, env.DB);

    // Segunda edição com versão antiga (1) deve falhar
    await expect(
      editarVenda(db, EMPRESA_A, original.id, 1, { notas: 'conflito' }, env.DB)
    ).rejects.toThrow(VendaError);

    try {
      await editarVenda(db, EMPRESA_A, original.id, 1, { notas: 'conflito' }, env.DB);
    } catch (err) {
      expect(err).toBeInstanceOf(VendaError);
      expect((err as VendaError).code).toBe('CONFLITO_VERSAO');
    }
  });

  // ── H5. Venda cancelada não pode ser editada ──
  it('H5. venda cancelada → CANCELADA', async () => {
    const db = getDb(env.DB);
    const original = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    await cancelarVenda(db, EMPRESA_A, original.id, 1);

    await expect(
      editarVenda(db, EMPRESA_A, original.id, 2, { notas: 'editar cancelada' }, env.DB)
    ).rejects.toMatchObject({ code: 'CANCELADA' });
  });

  // ── H6. Isolamento de tenant: empresa B não edita venda da empresa A ──
  it('H6. empresa B não edita venda da empresa A → NAO_ENCONTRADA', async () => {
    const db = getDb(env.DB);
    const vendaA = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);

    await expect(
      editarVenda(db, EMPRESA_B, vendaA.id, 1, { notas: 'hack' }, env.DB)
    ).rejects.toMatchObject({ code: 'NAO_ENCONTRADA' });
  });

  // ── H7. Edição idempotente: mesma versão reeditada retorna o estado atual ──
  it('H7. após edição bem-sucedida, versao incrementada fica persistida', async () => {
    const db = getDb(env.DB);
    const original = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    expect(original.versao).toBe(1);

    const editada1 = await editarVenda(db, EMPRESA_A, original.id, 1, { notas: 'v2' }, env.DB);
    expect(editada1.versao).toBe(2);

    const editada2 = await editarVenda(db, EMPRESA_A, original.id, 2, { notas: 'v3' }, env.DB);
    expect(editada2.versao).toBe(3);
    expect(editada2.notas).toBe('v3');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// I. Resumo financeiro e reconciliação (F4-03)
// ══════════════════════════════════════════════════════════════════════════════

describe('I. resumoVendas — dashboard e reconciliação', () => {
  // ── I1. Resumo vazio retorna zeros ──
  it('I1. empresa sem vendas → totais zero e reconciliação verdadeira', async () => {
    const db = getDb(env.DB);
    const resumo = await resumoVendas(db, EMPRESA_A);
    expect(resumo.totalVendas).toBe(0);
    expect(resumo.valorTotalCentavos).toBe(0);
    expect(resumo.valorPagoCentavos).toBe(0);
    expect(resumo.valorAReceberCentavos).toBe(0);
    expect(resumo.somaItensTotalCentavos).toBe(0);
    expect(resumo.somaPagamentosTotalCentavos).toBe(0);
    expect(resumo.itensReconciliam).toBe(true);
    expect(resumo.pagamentosReconciliam).toBe(true);
  });

  // ── I2. Invariante de reconciliação após criação ──
  it('I2. após criar venda, itens e pagamentos reconciliam com cabeçalho', async () => {
    const db = getDb(env.DB);
    await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);

    const resumo = await resumoVendas(db, EMPRESA_A);
    expect(resumo.totalVendas).toBe(1);
    // Invariante central: soma dos itens = valor_total da venda
    expect(resumo.itensReconciliam).toBe(true);
    // Invariante central: soma dos pagamentos = valor_pago da venda
    expect(resumo.pagamentosReconciliam).toBe(true);
    // a_receber calculado corretamente
    expect(resumo.valorAReceberCentavos).toBe(
      resumo.valorTotalCentavos - resumo.valorPagoCentavos
    );
  });

  // ── I3. Múltiplas vendas — totais somados corretamente ──
  it('I3. múltiplas vendas — totais agregam corretamente', async () => {
    const db = getDb(env.DB);
    await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);

    const resumo = await resumoVendas(db, EMPRESA_A);
    expect(resumo.totalVendas).toBe(2);
    expect(resumo.valorTotalCentavos).toBe(2 * 605000);
    expect(resumo.itensReconciliam).toBe(true);
    expect(resumo.pagamentosReconciliam).toBe(true);
  });

  // ── I4. Isolamento de tenant ──
  it('I4. empresa A não vê totais da empresa B', async () => {
    const db = getDb(env.DB);
    await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    await criarVenda(db, EMPRESA_B, USUARIO_B, vendaMinima({ vendedor_id: USUARIO_B }), env.DB);

    const resumoA = await resumoVendas(db, EMPRESA_A);
    const resumoB = await resumoVendas(db, EMPRESA_B);
    expect(resumoA.totalVendas).toBe(1);
    expect(resumoB.totalVendas).toBe(1);
  });

  // ── I5. Vendas canceladas excluídas por padrão ──
  it('I5. venda cancelada é excluída do resumo por padrão', async () => {
    const db = getDb(env.DB);
    const v = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    await cancelarVenda(db, EMPRESA_A, v.id, v.versao);

    const resumo = await resumoVendas(db, EMPRESA_A);
    expect(resumo.totalVendas).toBe(0);
    expect(resumo.valorTotalCentavos).toBe(0);
  });

  // ── I6. incluirCanceladas inclui venda cancelada ──
  it('I6. incluirCanceladas=true inclui vendas canceladas nos totais', async () => {
    const db = getDb(env.DB);
    const v = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    await cancelarVenda(db, EMPRESA_A, v.id, v.versao);

    const resumoSem = await resumoVendas(db, EMPRESA_A, { incluirCanceladas: false });
    const resumoCom = await resumoVendas(db, EMPRESA_A, { incluirCanceladas: true });
    expect(resumoSem.totalVendas).toBe(0);
    expect(resumoCom.totalVendas).toBe(1);
    expect(resumoCom.itensReconciliam).toBe(true);
  });

  // ── I7. Filtro por período data_venda ──
  it('I7. filtro data_venda_de/ate retorna apenas vendas no intervalo', async () => {
    const db = getDb(env.DB);
    await criarVenda(db, EMPRESA_A, USUARIO_A, { ...vendaMinima(), data_venda: '2024-01-15' }, env.DB);
    await criarVenda(db, EMPRESA_A, USUARIO_A, { ...vendaMinima(), data_venda: '2024-06-20' }, env.DB);
    await criarVenda(db, EMPRESA_A, USUARIO_A, { ...vendaMinima(), data_venda: '2024-12-01' }, env.DB);

    const resumoQ1 = await resumoVendas(db, EMPRESA_A, {
      dataVendaDe: '2024-01-01',
      dataVendaAte: '2024-03-31',
    });
    expect(resumoQ1.totalVendas).toBe(1);

    const resumoAno = await resumoVendas(db, EMPRESA_A, {
      dataVendaDe: '2024-01-01',
      dataVendaAte: '2024-12-31',
    });
    expect(resumoAno.totalVendas).toBe(3);
    expect(resumoAno.itensReconciliam).toBe(true);
    expect(resumoAno.pagamentosReconciliam).toBe(true);
  });

  // ── I8. Reconciliação mantida após edição com novos itens ──
  it('I8. após editarVenda com novos itens, reconciliação se mantém', async () => {
    const db = getDb(env.DB);
    const original = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);

    // Editar com novos itens de valores diferentes
    const novosItens = [
      {
        produto_id: null,
        numero_recibo: null,
        numero_reserva: null,
        data_servico: null,
        data_fim_servico: null,
        notas: null,
        descricao: 'Hotel Novo',
        tipo: 'hospedagem' as const,
        pax: 2,
        moeda: 'BRL' as const,
        cambio_centavos: 10000,
        valor_neto_centavos: 80000,
        valor_bruto_centavos: 100000,
        valor_taxas_centavos: 3000,
        valor_total_centavos: 103000,
        paga_comissao: true,
        parcelas: [],
      },
    ];

    await editarVenda(db, EMPRESA_A, original.id, 1, { itens: novosItens }, env.DB);

    const resumo = await resumoVendas(db, EMPRESA_A);
    expect(resumo.totalVendas).toBe(1);
    expect(resumo.valorTotalCentavos).toBe(103000);
    expect(resumo.itensReconciliam).toBe(true);
    expect(resumo.pagamentosReconciliam).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// J. Parcelas (F4-03)
// ══════════════════════════════════════════════════════════════════════════════

describe('J. listarParcelas — agenda de recebíveis', () => {
  // Helper: venda com parcelas explícitas
  function vendaComParcelas(dataVencimento1: string, dataVencimento2: string): VendaNormalizada {
    return {
      ...vendaMinima(),
      pagamentos: [
        {
          forma_id: null,
          forma_nome: 'Cartão',
          operacao: null,
          plano: null,
          valor_bruto_centavos: 605000,
          desconto_centavos: 0,
          valor_total_centavos: 605000,
          parcelas_qtd: 2,
          parcelas_valor_centavos: 302500,
          paga_comissao: true,
          parcelas: [
            { numero: 1, valor_centavos: 302500, vencimento: dataVencimento1 },
            { numero: 2, valor_centavos: 302500, vencimento: dataVencimento2 },
          ],
        },
      ],
    };
  }

  // ── J1. Lista parcelas criadas ──
  it('J1. retorna parcelas de venda criada', async () => {
    const db = getDb(env.DB);
    await criarVenda(db, EMPRESA_A, USUARIO_A, vendaComParcelas('2024-03-01', '2024-04-01'), env.DB);

    const { parcelas, temMais } = await listarParcelas(db, EMPRESA_A);
    expect(parcelas).toHaveLength(2);
    expect(temMais).toBe(false);
    // Verifica campos básicos
    expect(parcelas[0].formaNome).toBe('Cartão');
    expect(parcelas[0].cancelada).toBe(false);
    expect(parcelas.every((p) => p.valorCentavos === 302500)).toBe(true);
  });

  // ── J2. Isolamento de tenant ──
  it('J2. empresa A não vê parcelas da empresa B', async () => {
    const db = getDb(env.DB);
    await criarVenda(db, EMPRESA_A, USUARIO_A, vendaComParcelas('2024-03-01', '2024-04-01'), env.DB);
    await criarVenda(db, EMPRESA_B, USUARIO_B, {
      ...vendaComParcelas('2024-03-01', '2024-04-01'),
      vendedor_id: USUARIO_B,
    }, env.DB);

    const { parcelas: parcelasA } = await listarParcelas(db, EMPRESA_A);
    const { parcelas: parcelasB } = await listarParcelas(db, EMPRESA_B);
    expect(parcelasA).toHaveLength(2);
    expect(parcelasB).toHaveLength(2);
    expect(parcelasA.every((p) => p.vendaId !== parcelasB[0].vendaId)).toBe(true);
  });

  // ── J3. somenteAtivas exclui parcelas de vendas canceladas ──
  it('J3. parcelas de venda cancelada excluídas quando somenteAtivas=true', async () => {
    const db = getDb(env.DB);
    const v = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaComParcelas('2024-03-01', '2024-04-01'), env.DB);
    await cancelarVenda(db, EMPRESA_A, v.id, v.versao);

    const { parcelas: comCanceladas } = await listarParcelas(db, EMPRESA_A, { somenteAtivas: false });
    const { parcelas: semCanceladas } = await listarParcelas(db, EMPRESA_A, { somenteAtivas: true });

    expect(comCanceladas).toHaveLength(2);
    expect(semCanceladas).toHaveLength(0);
  });

  // ── J4. Filtro por vencimento ──
  it('J4. filtro vencimento_de/ate retorna apenas parcelas no período', async () => {
    const db = getDb(env.DB);
    await criarVenda(db, EMPRESA_A, USUARIO_A, vendaComParcelas('2024-03-01', '2024-09-01'), env.DB);

    const { parcelas: t1 } = await listarParcelas(db, EMPRESA_A, {
      vencimentoDe: '2024-01-01',
      vencimentoAte: '2024-06-30',
    });
    expect(t1).toHaveLength(1);
    expect(t1[0].vencimento).toBe('2024-03-01');

    const { parcelas: todas } = await listarParcelas(db, EMPRESA_A, {
      vencimentoDe: '2024-01-01',
      vencimentoAte: '2024-12-31',
    });
    expect(todas).toHaveLength(2);
  });

  // ── J5. Keyset cursor pagination ──
  it('J5. cursor retorna próxima página', async () => {
    const db = getDb(env.DB);
    // Criar 4 parcelas (2 vendas × 2 parcelas)
    await criarVenda(db, EMPRESA_A, USUARIO_A, vendaComParcelas('2024-03-01', '2024-04-01'), env.DB);
    await criarVenda(db, EMPRESA_A, USUARIO_A, vendaComParcelas('2024-05-01', '2024-06-01'), env.DB);

    const { parcelas: pag1, temMais: tm1 } = await listarParcelas(db, EMPRESA_A, { limite: 2 });
    expect(pag1).toHaveLength(2);
    expect(tm1).toBe(true);

    const cursor = pag1[pag1.length - 1].id;
    const { parcelas: pag2, temMais: tm2 } = await listarParcelas(db, EMPRESA_A, { limite: 2, cursor });
    expect(pag2).toHaveLength(2);
    expect(tm2).toBe(false);

    // Sem duplicatas entre páginas
    const ids1 = pag1.map((p) => p.id);
    const ids2 = pag2.map((p) => p.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });

  // ── J6. Venda padrão (3 parcelas) — verifica campos e ordem ──
  it('J6. vendaMinima gera 3 parcelas; campos formaNome e vendaId corretos', async () => {
    const db = getDb(env.DB);
    const v = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);

    const { parcelas, temMais } = await listarParcelas(db, EMPRESA_A);
    expect(parcelas).toHaveLength(3);
    expect(temMais).toBe(false);
    // Campos de contexto vindos do JOIN
    expect(parcelas.every((p) => p.vendaId === v.id)).toBe(true);
    expect(parcelas.every((p) => p.formaNome === 'Cartão de Crédito')).toBe(true);
    expect(parcelas.every((p) => p.cancelada === false)).toBe(true);
    // Números das parcelas cobrem 1, 2, 3
    const numeros = parcelas.map((p) => p.numero).sort((a, b) => a - b);
    expect(numeros).toEqual([1, 2, 3]);
  });
});
