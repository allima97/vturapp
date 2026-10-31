/**
 * Suíte Z — M09: Mural de recados (Workers / D1 real)
 *
 * Empresa dedicada: EMPRESA_Z = 24.
 * Cada it() é self-contained (storage isolado por teste em vitest-pool-workers).
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { applyD1Migrations } from 'cloudflare:test';

vi.mock('$lib/brand', () => ({ default: '' }));

import { getDb } from '$lib/server/db/client';
import {
  criarRecado,
  excluirRecado,
  listarRecados,
  listarTodosRecados,
  MuralError,
} from '$lib/server/mural-m09/service';

const EMPRESA_Z = 24;
const USER_Z1 = 'user-z1';
const USER_Z2 = 'user-z2';
const USER_Z3 = 'user-z3';

describe('Suíte Z — M09: Mural de recados', () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    const MIGRATIONS = (env as unknown as Record<string, unknown>).TEST_MIGRATIONS as Parameters<
      typeof applyD1Migrations
    >[1];
    await applyD1Migrations(env.DB, MIGRATIONS);
    db = getDb(env.DB);

    await db.run(
      `INSERT OR IGNORE INTO empresas (id, nome, cnpj, criado_em, atualizado_em)
       VALUES (${EMPRESA_Z}, 'Empresa Z', NULL, '2026-01-01', '2026-01-01')`
    );
    for (const uid of [USER_Z1, USER_Z2, USER_Z3]) {
      await db.run(
        `INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at)
         VALUES ('${uid}', 'User ${uid}', '${uid}@test.com', 1, 1735689600, 1735689600)`
      );
    }
  });

  // ── Criar ──────────────────────────────────────────────────────────────────

  it('Z1. criarRecado broadcast — destinatarioId=null, retorna recado', async () => {
    const r = await criarRecado(db, EMPRESA_Z, USER_Z1, {
      assunto: 'Aviso geral',
      conteudo: 'Reunião amanhã às 9h.',
    });
    expect(r.id).toBeGreaterThan(0);
    expect(r.remetenteId).toBe(USER_Z1);
    expect(r.destinatarioId).toBeNull();
    expect(r.assunto).toBe('Aviso geral');
    expect(r.conteudo).toBe('Reunião amanhã às 9h.');
  });

  it('Z2. criarRecado endereçado — destinatarioId preenchido', async () => {
    const r = await criarRecado(db, EMPRESA_Z, USER_Z1, {
      assunto: 'Direto para Z2',
      conteudo: 'Oi Z2!',
      destinatarioId: USER_Z2,
    });
    expect(r.destinatarioId).toBe(USER_Z2);
  });

  it('Z3. criarRecado sem assunto — assunto default vazio', async () => {
    const r = await criarRecado(db, EMPRESA_Z, USER_Z1, { conteudo: 'Sem assunto.' });
    expect(r.assunto).toBe('');
  });

  // ── Listagem ────────────────────────────────────────────────────────────────

  it('Z4. listarRecados para USER_Z2 — vê broadcasts e os seus', async () => {
    // Cria: broadcast + direto para Z2 + direto para Z3 (Z2 não deve ver)
    await criarRecado(db, EMPRESA_Z, USER_Z1, { conteudo: 'Broadcast Z4' });
    const r2 = await criarRecado(db, EMPRESA_Z, USER_Z1, {
      conteudo: 'Só para Z2',
      destinatarioId: USER_Z2,
    });
    await criarRecado(db, EMPRESA_Z, USER_Z1, {
      conteudo: 'Só para Z3',
      destinatarioId: USER_Z3,
    });

    const recados = await listarRecados(db, EMPRESA_Z, USER_Z2, {});
    // deve ver broadcast e o seu, mas NÃO o de Z3
    expect(recados.some((r) => r.destinatarioId === null)).toBe(true);
    expect(recados.some((r) => r.id === r2.id)).toBe(true);
    expect(recados.some((r) => r.conteudo === 'Só para Z3')).toBe(false);
  });

  it('Z5. listarTodosRecados — retorna broadcast e diretos', async () => {
    await criarRecado(db, EMPRESA_Z, USER_Z1, { conteudo: 'Broadcast Z5' });
    await criarRecado(db, EMPRESA_Z, USER_Z1, {
      conteudo: 'Direto Z5',
      destinatarioId: USER_Z2,
    });
    const todos = await listarTodosRecados(db, EMPRESA_Z, {});
    expect(todos.length).toBeGreaterThanOrEqual(2);
    expect(todos.some((r) => r.conteudo === 'Broadcast Z5')).toBe(true);
    expect(todos.some((r) => r.conteudo === 'Direto Z5')).toBe(true);
  });

  it('Z6. polling com cursor since — retorna só recados novos', async () => {
    // Cria recado "antigo"
    const antigo = await criarRecado(db, EMPRESA_Z, USER_Z1, { conteudo: 'Antigo Z6' });
    const cursor = antigo.criadoEm; // timestamp do antigo

    // Espera 1ms para garantir timestamp maior
    await new Promise((r) => setTimeout(r, 2));

    const novo = await criarRecado(db, EMPRESA_Z, USER_Z1, { conteudo: 'Novo Z6' });
    expect(novo.criadoEm > cursor).toBe(true);

    // Polling com since=cursor: deve retornar o novo mas não o antigo
    const recentes = await listarRecados(db, EMPRESA_Z, USER_Z1, { since: novo.criadoEm });
    expect(recentes.some((r) => r.conteudo === 'Novo Z6')).toBe(true);
    expect(recentes.some((r) => r.conteudo === 'Antigo Z6')).toBe(false);
  });

  it('Z7. listarRecados com limit=1 — respeita limite', async () => {
    await criarRecado(db, EMPRESA_Z, USER_Z1, { conteudo: 'R1 Z7' });
    await criarRecado(db, EMPRESA_Z, USER_Z1, { conteudo: 'R2 Z7' });
    const recados = await listarRecados(db, EMPRESA_Z, USER_Z1, { limit: 1 });
    expect(recados.length).toBe(1);
  });

  // ── Exclusão ────────────────────────────────────────────────────────────────

  it('Z8. excluirRecado pelo remetente — remove; obterRecado lança NAO_ENCONTRADO', async () => {
    const r = await criarRecado(db, EMPRESA_Z, USER_Z1, { conteudo: 'Para excluir Z8' });
    await excluirRecado(db, EMPRESA_Z, r.id, USER_Z1, 'operador');
    await expect(
      import('$lib/server/mural-m09/service').then(({ obterRecado }) =>
        obterRecado(db, EMPRESA_Z, r.id)
      )
    ).rejects.toThrow(MuralError);
  });

  it('Z9. excluirRecado por admin — pode excluir recado alheio', async () => {
    const r = await criarRecado(db, EMPRESA_Z, USER_Z1, { conteudo: 'Admin excluindo Z9' });
    // USER_Z2 é o admin tentando excluir recado de Z1
    await expect(excluirRecado(db, EMPRESA_Z, r.id, USER_Z2, 'admin')).resolves.toBeUndefined();
  });

  it('Z10. excluirRecado por terceiro (não remetente, não admin) — SEM_PERMISSAO', async () => {
    const r = await criarRecado(db, EMPRESA_Z, USER_Z1, { conteudo: 'Não excluir Z10' });
    await expect(
      excluirRecado(db, EMPRESA_Z, r.id, USER_Z2, 'operador')
    ).rejects.toThrow(MuralError);
  });

  // ── Validações ─────────────────────────────────────────────────────────────

  it('Z11. criarRecado conteudo vazio — VALIDACAO', async () => {
    await expect(
      criarRecado(db, EMPRESA_Z, USER_Z1, { conteudo: '' })
    ).rejects.toThrow(MuralError);
  });

  it('Z12. criarRecado conteudo só espaços — VALIDACAO', async () => {
    await expect(
      criarRecado(db, EMPRESA_Z, USER_Z1, { conteudo: '   ' })
    ).rejects.toThrow(MuralError);
  });
});
