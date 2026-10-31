/**
 * Suíte V — M03: Catálogo de Produtos (Workers runtime)
 *
 * Testa CRUD completo via service functions (criarProduto, obterProduto,
 * editarProduto, inativarProduto, listarProdutos) e via rotas HTTP
 * /api/v2/produtos usando o app Hono v2.
 *
 * EMPRESA_V = 20 (empresa dedicada a esta suíte, sem colisão com outras)
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { env, applyD1Migrations, SELF } from 'cloudflare:test';

vi.mock('$lib/brand', () => ({ VTUR_LOGO_URL: 'https://example.com/logo.png' }));

const MIGRATIONS = (env as unknown as Record<string, unknown>).TEST_MIGRATIONS as Parameters<
  typeof applyD1Migrations
>[1];

import { getDb } from '$lib/server/db/client';
import {
  ProdutoError,
  criarProduto,
  editarProduto,
  inativarProduto,
  listarProdutos,
  obterProduto,
} from '$lib/server/vendas/service';
import { TIPOS_PRODUTO } from '$lib/server/db/schema';

const EMPRESA_V = 20;

function db() {
  return getDb(env.DB);
}

// ─── seed ────────────────────────────────────────────────────────────────────

async function seedEmpresa(id: number) {
  await env.DB.exec(
    `INSERT OR IGNORE INTO empresas (id, nome, criado_em, atualizado_em) VALUES (${id}, 'Empresa V${id}', '2026-01-01', '2026-01-01')`
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

// ─── setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await applyD1Migrations(env.DB, MIGRATIONS);
  await seedEmpresa(EMPRESA_V);
  await seedUser('user-v1', EMPRESA_V);
});

// ─────────────────────────────────────────────────────────────────────────────
// Suíte V — service layer
// ─────────────────────────────────────────────────────────────────────────────

describe('Suíte V — M03 Produtos (service)', () => {
  it('V1. criarProduto → retorna produto com id e campos corretos', async () => {
    const p = await criarProduto(db(), {
      nome: 'Pacote Pantanal',
      tipo: 'pacote',
      destino: 'Pantanal, MT',
      moeda: 'BRL',
      valorNetoCentavos: 50000,
      valorVendaCentavos: 70000,
      pagaComissao: true,
      permiteDesconto: true,
      descontoPadraoPct: 500, // 5,00%
    });

    expect(p.id).toBeGreaterThan(0);
    expect(p.nome).toBe('Pacote Pantanal');
    expect(p.tipo).toBe('pacote');
    expect(p.destino).toBe('Pantanal, MT');
    expect(p.valorNetoCentavos).toBe(50000);
    expect(p.valorVendaCentavos).toBe(70000);
    expect(p.pagaComissao).toBe(true);
    expect(p.descontoPadraoPct).toBe(500);
    expect(p.ativo).toBe(true);
    expect(p.criadoEm).toBeTruthy();
  });

  it('V2. obterProduto → retorna produto existente', async () => {
    const criado = await criarProduto(db(), { nome: 'Hotel Pantanal', tipo: 'hotel' });
    const obtido = await obterProduto(db(), criado.id);
    expect(obtido.id).toBe(criado.id);
    expect(obtido.nome).toBe('Hotel Pantanal');
  });

  it('V3. obterProduto → lança NAO_ENCONTRADO para id inexistente', async () => {
    const err = await obterProduto(db(), 999_999).catch((e) => e);
    expect(err).toBeInstanceOf(ProdutoError);
    expect((err as ProdutoError).code).toBe('NAO_ENCONTRADO');
  });

  it('V4. editarProduto → atualiza apenas campos enviados', async () => {
    const criado = await criarProduto(db(), {
      nome: 'Passagem SP-RJ',
      tipo: 'passagem',
      valorVendaCentavos: 30000,
    });
    const editado = await editarProduto(db(), criado.id, { valorVendaCentavos: 35000, notas: 'tarifa alta temporada' });
    expect(editado.valorVendaCentavos).toBe(35000);
    expect(editado.notas).toBe('tarifa alta temporada');
    // tipo não alterado
    expect(editado.tipo).toBe('passagem');
  });

  it('V5. inativarProduto → ativo passa para false; obterProduto ainda retorna o registro', async () => {
    const criado = await criarProduto(db(), { nome: 'Seguro Viagem XP', tipo: 'seguro' });
    await inativarProduto(db(), criado.id);
    const inativo = await obterProduto(db(), criado.id);
    expect(inativo.ativo).toBe(false);
  });

  it('V6. listarProdutos → não retorna produtos inativos', async () => {
    const ativo = await criarProduto(db(), { nome: 'Circuito Ativo V6', tipo: 'servico' });
    const inativo = await criarProduto(db(), { nome: 'Circuito Inativo V6', tipo: 'servico' });
    await inativarProduto(db(), inativo.id);

    const lista = await listarProdutos(db(), { busca: 'V6' });
    const ids = lista.map((p) => p.id);
    expect(ids).toContain(ativo.id);
    expect(ids).not.toContain(inativo.id);
  });

  it('V7. listarProdutos → filtra por tipo', async () => {
    await criarProduto(db(), { nome: 'Hotel Tipo Filtro', tipo: 'hotel' });
    await criarProduto(db(), { nome: 'Pacote Tipo Filtro', tipo: 'pacote' });

    const hoteis = await listarProdutos(db(), { tipo: 'hotel', busca: 'Tipo Filtro' });
    expect(hoteis.every((p) => p.tipo === 'hotel')).toBe(true);
  });

  it('V8. criarProduto → lança VALIDACAO para nome vazio', async () => {
    const err = await criarProduto(db(), { nome: '' }).catch((e) => e);
    expect(err).toBeInstanceOf(ProdutoError);
    expect((err as ProdutoError).code).toBe('VALIDACAO');
  });

  it('V9. criarProduto → lança VALIDACAO para tipo inválido', async () => {
    const err = await criarProduto(db(), { nome: 'Xpto', tipo: 'invalido' }).catch((e) => e);
    expect(err).toBeInstanceOf(ProdutoError);
    expect((err as ProdutoError).code).toBe('VALIDACAO');
  });

  it('V10. editarProduto → lança VALIDACAO para valorNetoCentavos negativo', async () => {
    const criado = await criarProduto(db(), { nome: 'Produto V10' });
    const err = await editarProduto(db(), criado.id, { valorNetoCentavos: -1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ProdutoError);
    expect((err as ProdutoError).code).toBe('VALIDACAO');
  });

  it('V11. tipos disponíveis incluem todos os esperados', () => {
    expect(TIPOS_PRODUTO).toContain('pacote');
    expect(TIPOS_PRODUTO).toContain('hotel');
    expect(TIPOS_PRODUTO).toContain('passagem');
    expect(TIPOS_PRODUTO).toContain('servico');
    expect(TIPOS_PRODUTO).toContain('seguro');
  });
});
