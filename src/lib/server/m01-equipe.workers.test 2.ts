/**
 * Suíte W — M01: Empresas, usuários, vínculos e permissões (Workers / D1 real)
 *
 * Empresa dedicada: EMPRESA_W = 30.
 * Testa gestão de empresa e membros: CRUD, isolamento de tenant,
 * alteração de papel, revogação de acesso.
 *
 * Cada `it()` é independente (isolated storage — vitest-pool-workers 0.8+).
 *
 * Executar:
 *   npx vitest run --project workers src/lib/server/m01-equipe.workers.test.ts
 */

/// <reference types="@cloudflare/vitest-pool-workers" />

import type { ApiEnv } from '$lib/server/api/types';
type WorkerBindings = ApiEnv['Bindings'];

declare module 'cloudflare:test' {
  interface ProvidedEnv extends WorkerBindings {}
}

import { vi } from 'vitest';
vi.mock('$lib/brand', () => ({ default: '' }));

import { describe, it, expect, beforeAll } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db/client';
import { syncTenantAccessProfile } from '$lib/server/auth/tenant-access-profile';
import { resolveLegacyAccessScope } from '$lib/server/auth/legacy-scope';
import { canForContext } from '$lib/server/policy';
import type { AuthContext } from '$lib/server/auth/context';
import { convites, membrosEmpresa, user } from '$lib/server/db/schema';
import { aceitarConvite } from '$lib/server/invites/service';
import type { AuthInstance } from '$lib/auth';
import {
  obterEmpresa,
  editarEmpresa,
  listarMembros,
  obterMembro,
  alterarPapelMembro,
  revogarMembroM01,
  EmpresaError
} from '$lib/server/equipe-m01/service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const EMPRESA_W = 30;
const EMPRESA_X = 31; // empresa de outro tenant (isolamento)

const USER_W1 = 'user-w1'; // admin
const USER_W2 = 'user-w2'; // operador
const USER_W3 = 'user-w3'; // visualizador
const USER_X1 = 'user-x1'; // outro tenant

// ─── Helper para seed ────────────────────────────────────────────────────────

async function seedEmpresa(db: ReturnType<typeof getDb>) {
  const agora = new Date().toISOString();
  // Inserir empresas
  await db.run(
    `INSERT OR IGNORE INTO empresas (id, nome, plano, limite_usuarios, timezone, ativo, criado_em, atualizado_em)
     VALUES (${EMPRESA_W}, 'Empresa W Teste', 'trial', 5, 'America/Sao_Paulo', 1, '${agora}', '${agora}'),
            (${EMPRESA_X}, 'Empresa X Outro', 'trial', 5, 'America/Sao_Paulo', 1, '${agora}', '${agora}')`
  );
  // Inserir usuários
  await db.run(
    `INSERT OR IGNORE INTO user (id, name, email, email_verified, two_factor_enabled, empresa_id, created_at, updated_at)
     VALUES
       ('${USER_W1}', 'Admin W',       'admin.w@teste.com',  0, 0, ${EMPRESA_W}, ${Date.now()}, ${Date.now()}),
       ('${USER_W2}', 'Operador W',    'oper.w@teste.com',   0, 0, ${EMPRESA_W}, ${Date.now()}, ${Date.now()}),
       ('${USER_W3}', 'Visualiz W',    'viz.w@teste.com',    0, 0, ${EMPRESA_W}, ${Date.now()}, ${Date.now()}),
       ('${USER_X1}', 'Admin X',       'admin.x@teste.com',  0, 0, ${EMPRESA_X}, ${Date.now()}, ${Date.now()})`
  );
}

async function inserirMembro(
  db: ReturnType<typeof getDb>,
  empresaId: number,
  userId: string,
  papel: string
) {
  const agora = new Date().toISOString();
  const res = await db.run(
    `INSERT INTO membros_empresa (empresa_id, user_id, papel, ativo, criado_em, atualizado_em)
     VALUES (${empresaId}, '${userId}', '${papel}', 1, '${agora}', '${agora}')`
  );
  return res.meta.last_row_id as number;
}

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('Suíte W — M01: Empresas e Membros', () => {
  beforeAll(async () => {
    const MIGRATIONS = (env as unknown as Record<string, unknown>).TEST_MIGRATIONS as Parameters<
      typeof applyD1Migrations
    >[1];
    await applyD1Migrations(env.DB, MIGRATIONS);
  });

  // ─── Empresa ──────────────────────────────────────────────────────────────

  it('W1. obterEmpresa — retorna dados da empresa', async () => {
    const db = getDb(env.DB);
    await seedEmpresa(db);

    const empresa = await obterEmpresa(db, EMPRESA_W);
    expect(empresa.id).toBe(EMPRESA_W);
    expect(empresa.nome).toBe('Empresa W Teste');
    expect(empresa.timezone).toBe('America/Sao_Paulo');
  });

  it('W2. obterEmpresa — lança NAO_ENCONTRADO para empresa inexistente', async () => {
    const db = getDb(env.DB);
    await seedEmpresa(db);

    await expect(obterEmpresa(db, 99999)).rejects.toThrowError(EmpresaError);
    try {
      await obterEmpresa(db, 99999);
    } catch (e) {
      expect(e).toBeInstanceOf(EmpresaError);
      expect((e as EmpresaError).code).toBe('NAO_ENCONTRADO');
    }
  });

  it('W3. editarEmpresa — atualiza nome e timezone', async () => {
    const db = getDb(env.DB);
    await seedEmpresa(db);

    const atualizada = await editarEmpresa(db, EMPRESA_W, {
      nome: 'Empresa W Renomeada',
      timezone: 'America/Manaus'
    });
    expect(atualizada.nome).toBe('Empresa W Renomeada');
    expect(atualizada.timezone).toBe('America/Manaus');
  });

  it('W4. editarEmpresa — nome vazio lança VALIDACAO', async () => {
    const db = getDb(env.DB);
    await seedEmpresa(db);

    await expect(editarEmpresa(db, EMPRESA_W, { nome: '   ' })).rejects.toThrowError(EmpresaError);
    try {
      await editarEmpresa(db, EMPRESA_W, { nome: '' });
    } catch (e) {
      expect((e as EmpresaError).code).toBe('VALIDACAO');
    }
  });

  // ─── Membros ──────────────────────────────────────────────────────────────

  it('W5. listarMembros — retorna apenas membros ativos da empresa', async () => {
    const db = getDb(env.DB);
    await seedEmpresa(db);
    await inserirMembro(db, EMPRESA_W, USER_W1, 'admin');
    await inserirMembro(db, EMPRESA_W, USER_W2, 'operador');
    await inserirMembro(db, EMPRESA_X, USER_X1, 'admin'); // outro tenant

    const membros = await listarMembros(db, EMPRESA_W);
    const userIds = membros.map((m) => m.userId);
    expect(userIds).toContain(USER_W1);
    expect(userIds).toContain(USER_W2);
    expect(userIds).not.toContain(USER_X1); // isolamento de tenant
  });

  it('W6. listarMembros — inclui email e nome do usuário via JOIN', async () => {
    const db = getDb(env.DB);
    await seedEmpresa(db);
    await inserirMembro(db, EMPRESA_W, USER_W1, 'admin');

    const membros = await listarMembros(db, EMPRESA_W);
    const membro = membros.find((m) => m.userId === USER_W1);
    expect(membro).toBeDefined();
    expect(membro?.email).toBe('admin.w@teste.com');
    expect(membro?.nome).toBe('Admin W');
  });

  it('W7. obterMembro — retorna membro por id dentro do tenant', async () => {
    const db = getDb(env.DB);
    await seedEmpresa(db);
    const membroId = await inserirMembro(db, EMPRESA_W, USER_W2, 'operador');

    const membro = await obterMembro(db, EMPRESA_W, membroId);
    expect(membro.id).toBe(membroId);
    expect(membro.papel).toBe('operador');
    expect(membro.userId).toBe(USER_W2);
  });

  it('W8. obterMembro — isolamento: não retorna membro de outro tenant', async () => {
    const db = getDb(env.DB);
    await seedEmpresa(db);
    const membroIdX = await inserirMembro(db, EMPRESA_X, USER_X1, 'admin');

    // Busca o membro de EMPRESA_X a partir de EMPRESA_W → deve lançar NAO_ENCONTRADO
    await expect(obterMembro(db, EMPRESA_W, membroIdX)).rejects.toThrowError(EmpresaError);
    try {
      await obterMembro(db, EMPRESA_W, membroIdX);
    } catch (e) {
      expect((e as EmpresaError).code).toBe('NAO_ENCONTRADO');
    }
  });

  it('W9. alterarPapelMembro — muda operador para visualizador', async () => {
    const db = getDb(env.DB);
    await seedEmpresa(db);
    const membroId = await inserirMembro(db, EMPRESA_W, USER_W2, 'operador');

    const atualizado = await alterarPapelMembro(db, EMPRESA_W, membroId, 'visualizador');
    expect(atualizado.papel).toBe('visualizador');
    expect(atualizado.ativo).toBe(true);
  });

  it('W10. alterarPapelMembro — papel inválido lança VALIDACAO', async () => {
    const db = getDb(env.DB);
    await seedEmpresa(db);
    const membroId = await inserirMembro(db, EMPRESA_W, USER_W3, 'visualizador');

    await expect(
      alterarPapelMembro(db, EMPRESA_W, membroId, 'superadmin' as 'admin')
    ).rejects.toThrowError(EmpresaError);
    try {
      await alterarPapelMembro(db, EMPRESA_W, membroId, 'superadmin' as 'admin');
    } catch (e) {
      expect((e as EmpresaError).code).toBe('VALIDACAO');
    }
  });

  it('W11. revogarMembroM01 — desativa membro (ativo = false)', async () => {
    const db = getDb(env.DB);
    await seedEmpresa(db);
    const membroId = await inserirMembro(db, EMPRESA_W, USER_W2, 'operador');

    const revogado = await revogarMembroM01(db, EMPRESA_W, membroId);
    expect(revogado.ativo).toBe(false);
    expect(revogado.userId).toBe(USER_W2);
  });

  it('W12. revogarMembroM01 — membro revogado não aparece na listagem de ativos', async () => {
    const db = getDb(env.DB);
    await seedEmpresa(db);
    const membroId = await inserirMembro(db, EMPRESA_W, USER_W2, 'operador');

    // Revogar
    await revogarMembroM01(db, EMPRESA_W, membroId);

    // listarMembros filtra apenas ativos por padrão
    const ativos = await listarMembros(db, EMPRESA_W, { somenteAtivos: true });
    expect(ativos.some((m) => m.userId === USER_W2)).toBe(false);

    // Com somenteAtivos: false deve aparecer
    const todos = await listarMembros(db, EMPRESA_W, { somenteAtivos: false });
    expect(todos.some((m) => m.userId === USER_W2)).toBe(true);
  });

  it('W13. revogarMembroM01 — isolamento: não revoga membro de outro tenant', async () => {
    const db = getDb(env.DB);
    await seedEmpresa(db);
    const membroIdX = await inserirMembro(db, EMPRESA_X, USER_X1, 'admin');

    await expect(revogarMembroM01(db, EMPRESA_W, membroIdX)).rejects.toThrowError(EmpresaError);
    try {
      await revogarMembroM01(db, EMPRESA_W, membroIdX);
    } catch (e) {
      expect((e as EmpresaError).code).toBe('NAO_ENCONTRADO');
    }
  });

  it('W14. perfil D1 — papéis simples viram permissões por recurso sem ADMIN global', async () => {
    const db = getDb(env.DB);
    await seedEmpresa(db);
    await inserirMembro(db, EMPRESA_W, USER_W2, 'operador');
    await syncTenantAccessProfile(env.DB, USER_W2, 'operador');

    const scope = await resolveLegacyAccessScope(env.DB, USER_W2);
    expect(scope?.role).toBe('OUTRO');
    expect(scope?.isAdmin).toBe(false);
    expect(scope?.companyIds).toEqual([EMPRESA_W]);

    const ctx: AuthContext = {
      userId: USER_W2,
      userEmail: 'oper.w@teste.com',
      empresaId: EMPRESA_W,
      papel: 'operador',
      legacyScope: scope ?? undefined
    };
    expect(canForContext(ctx, 'vendas', 'ler')).toBe(true);
    expect(canForContext(ctx, 'vendas', 'criar')).toBe(true);
    expect(canForContext(ctx, 'vendas', 'editar')).toBe(true);
    expect(canForContext(ctx, 'vendas', 'exportar')).toBe(true);
    expect(canForContext(ctx, 'financeiro', 'exportar')).toBe(true);
    expect(canForContext(ctx, 'vendas', 'excluir')).toBe(false);
    expect(canForContext(ctx, 'auditoria', 'ler')).toBe(false);
  });

  it('W15. alteração de papel atualiza as permissões D1 no mesmo batch', async () => {
    const db = getDb(env.DB);
    await seedEmpresa(db);
    const membroId = await inserirMembro(db, EMPRESA_W, USER_W2, 'operador');
    await syncTenantAccessProfile(env.DB, USER_W2, 'operador');

    await alterarPapelMembro(db, EMPRESA_W, membroId, 'visualizador');
    const scope = await resolveLegacyAccessScope(env.DB, USER_W2);
    const ctx: AuthContext = {
      userId: USER_W2,
      userEmail: 'oper.w@teste.com',
      empresaId: EMPRESA_W,
      papel: 'visualizador',
      legacyScope: scope ?? undefined
    };

    expect(canForContext(ctx, 'vendas', 'ler')).toBe(true);
    expect(canForContext(ctx, 'vendas', 'criar')).toBe(false);
    expect(canForContext(ctx, 'vendas', 'exportar')).toBe(false);
    expect(canForContext(ctx, 'agenda', 'criar')).toBe(false);
  });

  it('W16. aceitar convite grava vínculo e perfil de acesso atomically em D1', async () => {
    const db = getDb(env.DB);
    await seedEmpresa(db);
    const token = 'token-operador-w16';
    const agora = new Date().toISOString();
    await db.insert(convites).values({
      empresaId: EMPRESA_W,
      email: 'novo.operador@teste.com',
      papel: 'operador',
      token,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      criadoEm: agora
    });

    const fakeAuth = {
      api: {
        signUpEmail: async () => {
          await db.insert(user).values({
            id: 'user-invite-w16',
            name: 'Novo Operador',
            email: 'novo.operador@teste.com',
            emailVerified: false,
            twoFactorEnabled: false,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          return { user: { id: 'user-invite-w16' } };
        }
      }
    } as unknown as AuthInstance;

    const result = await aceitarConvite(
      env.DB,
      fakeAuth,
      { token, nome: 'Novo Operador', senha: 'senha-de-teste-123' },
      'https://vturapp.test'
    );

    const membership = await db
      .select({ papel: membrosEmpresa.papel })
      .from(membrosEmpresa)
      .where(eq(membrosEmpresa.userId, result.userId))
      .get();
    const scope = await resolveLegacyAccessScope(env.DB, result.userId);

    expect(membership?.papel).toBe('operador');
    expect(scope?.role).toBe('OUTRO');
    expect(scope?.companyIds).toEqual([EMPRESA_W]);
    expect(scope?.modulePermissions['v2:vendas']).toBe('edit');
  });
});
