/**
 * F4-05 — Testes de acesso à rota GET /api/v2/vendas/:id/pdf
 * (workerd via Miniflare — runtime real).
 *
 * Suíte L (contract / acesso):
 *   L1. 200 text/html — venda existente, usuário autorizado
 *   L2. Conteúdo: número da venda presente no HTML retornado
 *   L3. Conteúdo: logo VTUR presente (data-URL)
 *   L4. 404 — venda de outra empresa (isolamento de tenant)
 *   L5. 401 — sem autenticação
 *   L6. 403 — papel sem permissão de leitura de vendas
 *   L7. 400 — id inválido (letras)
 *   L8. 404 — venda inexistente
 *   L9. Venda cancelada: retorna 200 com banner de cancelamento no HTML
 *
 * Executar:
 *   npx vitest run --project workers src/lib/server/vendas/vendas-pdf.workers.test.ts
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
import { criarVenda, cancelarVenda, obterVenda } from './service';
import type { VendaNormalizada } from './validation';

// ─────────────────────────────────────────────────────────────────────────────
// Infra de autenticação simulada (mesmo padrão dos demais workers tests)
// ─────────────────────────────────────────────────────────────────────────────

const MIGRATIONS = (env as Record<string, unknown>).TEST_MIGRATIONS as Parameters<
  typeof applyD1Migrations
>[1];

const EMPRESA_A = 1;
const EMPRESA_B = 2;
const USUARIO_A = 'usr-a';

// ─── stub de auth embutido no token ──────────────────────────────────────────
// A rota usa resolveAuthContext que valida o token via Better Auth.
// Para testes de acesso usamos a rota diretamente via app Hono importado,
// injetando o contexto de auth via stub (mesmo padrão de outros contract tests).
import { vendasV2Routes } from '$lib/server/api/routes/vendas-v2/index';
import { resolveAuthContext } from '$lib/server/auth/context';
import { vi } from 'vitest';

// Stub global de resolveAuthContext
vi.mock('$lib/server/auth/context', () => ({
  resolveAuthContext: vi.fn(),
}));

// Stub de brand — o Workers runtime não suporta importação de assets Vite (?raw)
vi.mock('$lib/brand', () => ({
  VTUR_LOGO_URL: 'data:image/png;base64,VTUR-LOGO-STUB',
  VTUR_LOGO_PATH: '/brand/vtur-symbol.png',
}));

const mockAuth = resolveAuthContext as ReturnType<typeof vi.fn>;

function fakeEnv(d1 = env.DB) {
  return {
    DB: d1,
    BETTER_AUTH_SECRET: 'test-secret',
    PUBLIC_APP_URL: 'http://localhost:5173',
    PUBLIC_ENVIRONMENT: 'test',
  } as unknown as ApiEnv['Bindings'];
}

async function callPdf(id: string | number, authCtx: object | null = {
  userId: USUARIO_A, userEmail: 'a@a.com', empresaId: EMPRESA_A, papel: 'operador',
}) {
  mockAuth.mockResolvedValueOnce(authCtx);
  // vendasV2Routes está montado em /vendas pelo app-v2; chamamos com caminho relativo ao router
  const req = new Request(`http://localhost/${id}/pdf`);
  // @ts-ignore — Hono fetch aceita minimal env
  return vendasV2Routes.fetch(req, fakeEnv());
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function vendaMinima(): VendaNormalizada {
  return {
    vendedor_id: USUARIO_A,
    cliente_id: null,
    produto_id: null,
    data_venda: '2024-11-01',
    data_lancamento: '2024-11-01',
    data_embarque: '2024-12-20',
    data_final: '2024-12-27',
    destino: 'Cancún',
    cancelada: false,
    desconto_comercial_aplicado: false,
    desconto_comercial_centavos: 0,
    valor_bruto_centavos: 600000,
    valor_taxas_centavos: 5000,
    valor_total_centavos: 605000,
    valor_nao_comissionado_centavos: 0,
    notas: null,
    chave_idempotencia: null,
    itens: [{
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
    }],
    pagamentos: [{
      forma_id: null,
      forma_nome: 'Cartão de Crédito',
      operacao: 'debito',
      plano: '1x',
      valor_bruto_centavos: 605000,
      desconto_centavos: 0,
      valor_total_centavos: 605000,
      parcelas_qtd: 1,
      parcelas_valor_centavos: 605000,
      paga_comissao: true,
      parcelas: [
        { numero: 1, valor_centavos: 605000, vencimento: '2024-12-01' },
      ],
    }],
  } as VendaNormalizada;
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await applyD1Migrations(env.DB, MIGRATIONS);
});

beforeEach(async () => {
  // Limpa entre testes (ordem: FK dependentes primeiro)
  for (const t of [
    'venda_parcelas', 'venda_pagamentos', 'venda_itens', 'vendas',
    'membros_empresa', 'session', 'user', 'empresas',
  ]) {
    await env.DB.exec(`DELETE FROM ${t}`);
  }

  const agora = new Date().toISOString();
  const ts = Date.now();

  // Seed: empresas e usuários (requeridos por FKs em vendas)
  await env.DB.batch([
    env.DB.prepare('INSERT INTO empresas (id, nome, criado_em, atualizado_em) VALUES (?, ?, ?, ?)')
      .bind(EMPRESA_A, 'Agência Alfa', agora, agora),
    env.DB.prepare('INSERT INTO empresas (id, nome, criado_em, atualizado_em) VALUES (?, ?, ?, ?)')
      .bind(EMPRESA_B, 'Agência Beta', agora, agora),
  ]);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO user (id, name, email, email_verified, empresa_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(USUARIO_A, 'Admin Alfa', 'admin@alfa.com', 1, EMPRESA_A, ts, ts),
  ]);

  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Suíte L — acesso à rota /:id/pdf
// ─────────────────────────────────────────────────────────────────────────────

describe('L. GET /api/v2/vendas/:id/pdf — controle de acesso e conteúdo', () => {

  // ── L1. 200 com text/html ──
  it('L1. retorna 200 text/html para venda existente', async () => {
    const db = getDb(env.DB);
    const v = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);

    const res = await callPdf(v.id);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch('text/html');
  });

  // ── L2. Conteúdo: número da venda no HTML ──
  it('L2. HTML contém número da venda', async () => {
    const db = getDb(env.DB);
    const v = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);

    const res = await callPdf(v.id);
    const html = await res.text();
    // numeroVenda pode ser null; id sempre está presente no <title>
    expect(html).toContain(String(v.id));
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  // ── L3. Conteúdo: logo VTUR no HTML ──
  it('L3. HTML contém logo VTUR como data-URL', async () => {
    const db = getDb(env.DB);
    const v = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);

    const res = await callPdf(v.id);
    const html = await res.text();
    expect(html).toMatch(/src="data:image\//);
  });

  // ── L4. 404 — venda de outra empresa ──
  it('L4. empresa B não acessa venda da empresa A (404)', async () => {
    const db = getDb(env.DB);
    const v = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);

    const res = await callPdf(v.id, {
      userId: 'usr-b', userEmail: 'b@b.com', empresaId: EMPRESA_B, papel: 'operador',
    });
    expect(res.status).toBe(404);
  });

  // ── L5. 401 — sem autenticação ──
  it('L5. sem autenticação retorna 401', async () => {
    const res = await callPdf(999, null);
    expect(res.status).toBe(401);
  });

  // ── L6. 200 — visualizador tem vendas:ler (menor privilégio com acesso) ──
  it('L6. visualizador (menor privilégio) também acessa PDF com 200', async () => {
    // Todos os papéis têm vendas:ler (admin, operador, visualizador).
    // Confirmamos que o papel de menor privilégio também pode acessar o comprovante.
    const db = getDb(env.DB);
    const v = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);

    const res = await callPdf(v.id, {
      userId: 'usr-v', userEmail: 'v@v.com', empresaId: EMPRESA_A, papel: 'visualizador',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch('text/html');
  });

  // ── L7. 400 — id inválido ──
  it('L7. id inválido (letras) retorna 400', async () => {
    const res = await callPdf('abc');
    expect(res.status).toBe(400);
  });

  // ── L8. 404 — venda inexistente ──
  it('L8. venda inexistente retorna 404', async () => {
    const res = await callPdf(99999);
    expect(res.status).toBe(404);
  });

  // ── L9. Venda cancelada — banner no HTML ──
  it('L9. venda cancelada retorna 200 com banner de cancelamento', async () => {
    const db = getDb(env.DB);
    const v = await criarVenda(db, EMPRESA_A, USUARIO_A, vendaMinima(), env.DB);
    await cancelarVenda(db, EMPRESA_A, v.id, 1);

    const res = await callPdf(v.id);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('VENDA CANCELADA');
  });
});
