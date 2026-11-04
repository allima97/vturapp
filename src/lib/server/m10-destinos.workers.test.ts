/**
 * Suíte W — M10: Destinos (Workers / D1 real)
 *
 * Testa o catálogo global de destinos turísticos:
 * criarDestino, obterDestino, editarDestino, inativarDestino, listarDestinos
 * e validações de entrada.
 *
 * Empresa dedicada: EMPRESA_W = 21 (evita colisão com outras suítes).
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { SELF } from 'cloudflare:test';
import { env } from 'cloudflare:test';
import { applyD1Migrations } from 'cloudflare:test';

vi.mock('$lib/brand', () => ({ default: '' }));

import { getDb } from '$lib/server/db/client';
import {
  criarDestino,
  obterDestino,
  editarDestino,
  inativarDestino,
  listarDestinos,
  DestinoError,
} from '$lib/server/destinos/service';

const EMPRESA_W = 21;

async function seedEmpresa(db: ReturnType<typeof getDb>) {
  await db.run(`
    INSERT OR IGNORE INTO empresas (id, nome, cnpj, criado_em, atualizado_em)
    VALUES (${EMPRESA_W}, 'Empresa W', '21000000000121', 1735689600, 1735689600)
  `);
}

async function seedUser(db: ReturnType<typeof getDb>) {
  await db.run(`
    INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at)
    VALUES ('user-w-01', 'Agente W', 'w@test.com', 1, 1735689600, 1735689600)
  `);
}

describe('Suíte W — M10: Destinos', () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    const MIGRATIONS = (env as unknown as Record<string, unknown>).TEST_MIGRATIONS as Parameters<
      typeof applyD1Migrations
    >[1];
    await applyD1Migrations(env.DB, MIGRATIONS);
    db = getDb(env.DB);
    await seedEmpresa(db);
    await seedUser(db);
  });

  // ── W1: criar destino mínimo ─────────────────────────────────────────────
  it('W1. criarDestino — retorna registro com campos esperados', async () => {
    const d = await criarDestino(db, {
      nome: 'Cancún',
      cidade: 'Cancún',
      pais: 'México',
      paisCod: 'MX',
      continente: 'América do Norte',
    });
    expect(d.id).toBeGreaterThan(0);
    expect(d.nome).toBe('Cancún');
    expect(d.paisCod).toBe('MX');
    expect(d.ativo).toBe(true);
    expect(d.criadoEm).toBeTruthy();
  });

  // ── W2: obterDestino existente ───────────────────────────────────────────
  it('W2. obterDestino — retorna destino criado pelo id', async () => {
    const criado = await criarDestino(db, { nome: 'Fernando de Noronha', pais: 'Brasil', paisCod: 'BR' });
    const obtido = await obterDestino(db, criado.id);
    expect(obtido.id).toBe(criado.id);
    expect(obtido.nome).toBe('Fernando de Noronha');
    expect(obtido.paisCod).toBe('BR');
  });

  // ── W3: obterDestino inexistente ─────────────────────────────────────────
  it('W3. obterDestino — lança NAO_ENCONTRADO para id inexistente', async () => {
    await expect(obterDestino(db, 999_999)).rejects.toSatisfy(
      (e: unknown) => (e as DestinoError).code === 'NAO_ENCONTRADO'
    );
  });

  // ── W4: editarDestino — atualiza apenas campos enviados ─────────────────
  it('W4. editarDestino — atualiza nome preservando outros campos', async () => {
    const criado = await criarDestino(db, {
      nome: 'Paris Antiga',
      pais: 'França',
      paisCod: 'FR',
      continente: 'Europa',
    });
    const editado = await editarDestino(db, criado.id, { nome: 'Paris' });
    expect(editado.nome).toBe('Paris');
    expect(editado.paisCod).toBe('FR');         // preservado
    expect(editado.continente).toBe('Europa');   // preservado
  });

  // ── W5: editarDestino — permite limpar campo nullable ───────────────────
  it('W5. editarDestino — permite limpar continente (null)', async () => {
    const criado = await criarDestino(db, {
      nome: 'Roma',
      pais: 'Itália',
      paisCod: 'IT',
      continente: 'Europa',
    });
    const editado = await editarDestino(db, criado.id, { continente: null });
    expect(editado.continente).toBeNull();
    expect(editado.paisCod).toBe('IT'); // preservado
  });

  // ── W6: inativarDestino — ativo vira false ───────────────────────────────
  it('W6. inativarDestino — ativo = false; obterDestino ainda retorna', async () => {
    const criado = await criarDestino(db, { nome: 'Maldivas', paisCod: 'MV' });
    await inativarDestino(db, criado.id);
    const obtido = await obterDestino(db, criado.id);
    expect(obtido.ativo).toBe(false);
  });

  // ── W7: listarDestinos — exclui inativos por padrão ─────────────────────
  it('W7. listarDestinos — exclui destinos inativos', async () => {
    const ativo = await criarDestino(db, { nome: 'Lisboa Ativa', paisCod: 'PT' });
    const inativo = await criarDestino(db, { nome: 'Lisboa Inativa', paisCod: 'PT' });
    await inativarDestino(db, inativo.id);

    const lista = await listarDestinos(db, { busca: 'Lisboa' });
    const ids = lista.map((d) => d.id);
    expect(ids).toContain(ativo.id);
    expect(ids).not.toContain(inativo.id);
  });

  // ── W8: listarDestinos — filtra por país ────────────────────────────────
  it('W8. listarDestinos — filtra por pais_cod', async () => {
    await criarDestino(db, { nome: 'Tokyo-W8', paisCod: 'JP' });
    await criarDestino(db, { nome: 'Osaka-W8', paisCod: 'JP' });
    await criarDestino(db, { nome: 'Seoul-W8', paisCod: 'KR' });

    const lista = await listarDestinos(db, { pais: 'JP', busca: 'W8' });
    expect(lista.length).toBe(2);
    expect(lista.every((d) => d.paisCod === 'JP')).toBe(true);
  });

  // ── W9: validação — nome vazio ───────────────────────────────────────────
  it('W9. criarDestino nome vazio — lança VALIDACAO', async () => {
    await expect(criarDestino(db, { nome: '' })).rejects.toSatisfy(
      (e: unknown) => (e as DestinoError).code === 'VALIDACAO'
    );
  });

  // ── W10: validação — paisCod inválido ────────────────────────────────────
  it('W10. criarDestino paisCod inválido — lança VALIDACAO', async () => {
    await expect(criarDestino(db, { nome: 'Teste', paisCod: 'br' })).rejects.toSatisfy(
      (e: unknown) => (e as DestinoError).code === 'VALIDACAO'
    );
  });

  // ── W11: validação — lat fora do range ──────────────────────────────────
  it('W11. criarDestino lat inválida — lança VALIDACAO', async () => {
    await expect(criarDestino(db, { nome: 'Teste', lat: 999 })).rejects.toSatisfy(
      (e: unknown) => (e as DestinoError).code === 'VALIDACAO'
    );
  });
});
