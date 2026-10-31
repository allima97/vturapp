/**
 * M12 — Testes Workers: auditoria, privacidade e administração operacional
 *
 * Suíte U — usa D1 real efêmero (Miniflare/vitest-pool-workers).
 *
 * Cada it() é autocontido: aplica migrations, insere fixtures, valida.
 *
 * Empresas:
 *   EMPRESA_U = 40  (admin USER_U1, operador USER_U2, visualizador USER_U3)
 *   EMPRESA_V = 41  (isolamento de tenant)
 *
 * Executar: npx vitest run --project workers src/lib/server/m12-auditoria.workers.test.ts
 */

/// <reference types="@cloudflare/vitest-pool-workers" />

import type { ApiEnv } from '$lib/server/api/types';
type WorkerBindings = ApiEnv['Bindings'];

declare module 'cloudflare:test' {
  interface ProvidedEnv extends WorkerBindings {}
}

import { env, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '$lib/server/db/client';
import { empresas, membrosEmpresa, user, auditLogs } from '$lib/server/db/schema';
import {
  gravarAudit,
  listarAuditLogs,
  exportarDadosTitular,
  anonimizarTitularAuditLogs,
} from '$lib/server/m12-auditoria/service';

const MIGRATIONS = (env as unknown as Record<string, unknown>).TEST_MIGRATIONS as Parameters<
  typeof applyD1Migrations
>[1];

const EMPRESA_U = 40;
const EMPRESA_V = 41;
const USER_U1 = 'user-u1';
const USER_U2 = 'user-u2';

async function setupFixtures() {
  await applyD1Migrations(env.DB, MIGRATIONS);
  const db = getDb(env.DB);

  // Empresas
  await db.insert(empresas).values([
    { id: EMPRESA_U, nome: 'Empresa U', slug: 'empresa-u', ativo: true },
    { id: EMPRESA_V, nome: 'Empresa V', slug: 'empresa-v', ativo: true },
  ]);

  // Usuários
  await db.insert(user).values([
    { id: USER_U1, name: 'Admin U', email: 'admin-u@test.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
    { id: USER_U2, name: 'Operador U', email: 'op-u@test.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
  ]);

  // Membros
  await db.insert(membrosEmpresa).values([
    { empresaId: EMPRESA_U, userId: USER_U1, papel: 'admin', ativo: true },
    { empresaId: EMPRESA_U, userId: USER_U2, papel: 'operador', ativo: true },
  ]);

  return db;
}

describe('M12 — auditoria (Suíte U)', () => {

  // U1: gravarAudit — persiste registro com campos corretos
  it('U1: gravarAudit persiste log na tabela audit_logs', async () => {
    const db = await setupFixtures();

    await gravarAudit(db, {
      empresaId: EMPRESA_U,
      userId:    USER_U1,
      modulo:    'Vendas',
      acao:      'venda_criada',
      detalhes:  { vendaId: 99, valor: 1500 },
      ip:        '10.0.0.1',
      userAgent: 'vitest',
    });

    const logs = await db.select().from(auditLogs).where();
    expect(logs).toHaveLength(1);
    expect(logs[0].modulo).toBe('Vendas');
    expect(logs[0].acao).toBe('venda_criada');
    expect(logs[0].userId).toBe(USER_U1);
    expect(logs[0].ip).toBe('10.0.0.1');
    const det = JSON.parse(logs[0].detalhes ?? '{}');
    expect(det.vendaId).toBe(99);
  });

  // U2: gravarAudit — campos sensíveis são redactados
  it('U2: gravarAudit sanitiza campos sensíveis (LGPD Art. 46)', async () => {
    const db = await setupFixtures();

    await gravarAudit(db, {
      empresaId: EMPRESA_U,
      userId:    USER_U1,
      modulo:    'Clientes',
      acao:      'cliente_criado',
      detalhes:  { nome: 'João', cpf: '123.456.789-00', senha: 's3cr3t' },
    });

    const [log] = await db.select().from(auditLogs);
    const det = JSON.parse(log.detalhes ?? '{}');
    expect(det.nome).toBe('João');
    expect(det.cpf).toBe('[REDACTED]');
    expect(det.senha).toBe('[REDACTED]');
  });

  // U3: gravarAudit — nunca lança exceção mesmo com dados inválidos
  it('U3: gravarAudit não lança exceção em caso de erro interno', async () => {
    // Sem migrations — DB vazio; deve ser silencioso
    const db = getDb(env.DB);
    await expect(
      gravarAudit(db, { empresaId: 999, modulo: 'Vendas', acao: 'venda_criada' }),
    ).resolves.toBeUndefined();
  });

  // U4: listarAuditLogs — retorna logs da empresa com join de usuário
  it('U4: listarAuditLogs retorna logs com nome e email do usuário', async () => {
    const db = await setupFixtures();

    await gravarAudit(db, { empresaId: EMPRESA_U, userId: USER_U1, modulo: 'Vendas', acao: 'venda_criada', detalhes: { id: 1 } });
    await gravarAudit(db, { empresaId: EMPRESA_U, userId: USER_U2, modulo: 'Clientes', acao: 'cliente_editado' });

    const { logs } = await listarAuditLogs(db, EMPRESA_U);
    expect(logs).toHaveLength(2);
    const adminLog = logs.find((l) => l.userId === USER_U1);
    expect(adminLog?.userNome).toBe('Admin U');
    expect(adminLog?.userEmail).toBe('admin-u@test.com');
  });

  // U5: listarAuditLogs — isolamento de tenant
  it('U5: listarAuditLogs não retorna logs de outra empresa', async () => {
    const db = await setupFixtures();

    await gravarAudit(db, { empresaId: EMPRESA_U, userId: USER_U1, modulo: 'Vendas', acao: 'venda_criada' });
    await gravarAudit(db, { empresaId: EMPRESA_V, userId: USER_U1, modulo: 'Vendas', acao: 'venda_criada' });

    const { logs } = await listarAuditLogs(db, EMPRESA_U);
    expect(logs).toHaveLength(1);
    expect(logs.every((l) => l.userId === USER_U1)).toBe(true);
  });

  // U6: listarAuditLogs — filtro por módulo
  it('U6: listarAuditLogs filtra por módulo', async () => {
    const db = await setupFixtures();

    await gravarAudit(db, { empresaId: EMPRESA_U, modulo: 'Vendas', acao: 'venda_criada' });
    await gravarAudit(db, { empresaId: EMPRESA_U, modulo: 'Clientes', acao: 'cliente_criado' });

    const { logs } = await listarAuditLogs(db, EMPRESA_U, { modulo: 'Vendas' });
    expect(logs).toHaveLength(1);
    expect(logs[0].modulo).toBe('Vendas');
  });

  // U7: listarAuditLogs — filtro por userId
  it('U7: listarAuditLogs filtra por userId', async () => {
    const db = await setupFixtures();

    await gravarAudit(db, { empresaId: EMPRESA_U, userId: USER_U1, modulo: 'Vendas', acao: 'venda_criada' });
    await gravarAudit(db, { empresaId: EMPRESA_U, userId: USER_U2, modulo: 'Vendas', acao: 'venda_criada' });

    const { logs } = await listarAuditLogs(db, EMPRESA_U, { userId: USER_U1 });
    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(USER_U1);
  });

  // U8: listarAuditLogs — paginação keyset
  it('U8: listarAuditLogs pagina com cursor keyset', async () => {
    const db = await setupFixtures();

    // Inserir 3 logs
    for (let i = 0; i < 3; i++) {
      await gravarAudit(db, { empresaId: EMPRESA_U, modulo: 'Vendas', acao: `acao_${i}` });
    }

    const pagina1 = await listarAuditLogs(db, EMPRESA_U, { limite: 2 });
    expect(pagina1.logs).toHaveLength(2);
    expect(pagina1.proximo).not.toBeNull();

    const pagina2 = await listarAuditLogs(db, EMPRESA_U, { limite: 2, cursor: pagina1.proximo! });
    expect(pagina2.logs).toHaveLength(1);
    expect(pagina2.proximo).toBeNull();
  });

  // U9: exportarDadosTitular — retorna sumário LGPD
  it('U9: exportarDadosTitular retorna sumário do titular', async () => {
    const db = await setupFixtures();

    await gravarAudit(db, { empresaId: EMPRESA_U, userId: USER_U1, modulo: 'Vendas', acao: 'venda_criada' });
    await gravarAudit(db, { empresaId: EMPRESA_U, userId: USER_U1, modulo: 'Clientes', acao: 'cliente_editado' });

    const dados = await exportarDadosTitular(db, EMPRESA_U, USER_U1);
    expect(dados.usuario?.email).toBe('admin-u@test.com');
    expect(dados.totalAuditLogs).toBe(2);
    expect(dados.totalVendas).toBe(0);
    expect(dados.totalClientes).toBe(0);
  });

  // U10: exportarDadosTitular — usuário inexistente retorna usuario null
  it('U10: exportarDadosTitular com userId inexistente retorna usuario null', async () => {
    const db = await setupFixtures();

    const dados = await exportarDadosTitular(db, EMPRESA_U, 'nao-existe');
    expect(dados.usuario).toBeNull();
    expect(dados.totalAuditLogs).toBe(0);
  });

  // U11: anonimizarTitularAuditLogs — substitui user_id por null
  it('U11: anonimizarTitularAuditLogs substitui user_id por null', async () => {
    const db = await setupFixtures();

    await gravarAudit(db, { empresaId: EMPRESA_U, userId: USER_U1, modulo: 'Vendas', acao: 'venda_criada' });
    await gravarAudit(db, { empresaId: EMPRESA_U, userId: USER_U1, modulo: 'Clientes', acao: 'cliente_criado' });

    const result = await anonimizarTitularAuditLogs(db, EMPRESA_U, USER_U1);
    expect(result.anonimizados).toBe(2);

    const { logs } = await listarAuditLogs(db, EMPRESA_U);
    expect(logs.every((l) => l.userId === null)).toBe(true);
  });

  // U12: anonimizarTitularAuditLogs — isolamento de tenant (não anon logs de outra empresa)
  it('U12: anonimizarTitularAuditLogs respeita isolamento de tenant', async () => {
    const db = await setupFixtures();

    await gravarAudit(db, { empresaId: EMPRESA_U, userId: USER_U1, modulo: 'Vendas', acao: 'venda_criada' });
    await gravarAudit(db, { empresaId: EMPRESA_V, userId: USER_U1, modulo: 'Vendas', acao: 'venda_criada' });

    await anonimizarTitularAuditLogs(db, EMPRESA_U, USER_U1);

    // Log da empresa V deve permanecer com userId
    const [logV] = await db.select().from(auditLogs).where();
    // filtra manualmente
    const { logs: logsU } = await listarAuditLogs(db, EMPRESA_U);
    expect(logsU.every((l) => l.userId === null)).toBe(true);

    // empresa V: USER_U1 ainda tem userId
    const { logs: logsV } = await listarAuditLogs(db, EMPRESA_V);
    expect(logsV.some((l) => l.userId === USER_U1)).toBe(true);
    void logV;
  });

});
