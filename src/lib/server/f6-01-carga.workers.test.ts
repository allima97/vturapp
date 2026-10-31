/**
 * Suíte P — F6-01: Teste de carga com volume representativo
 *
 * Executa operações reais no runtime Workers (workerd + D1 efêmero)
 * com dados em escala próxima ao máximo de 1 ano:
 *   - 5 empresas simultâneas
 *   - 100 vendas por empresa (cada uma com 1 item + 2 parcelas)
 *   - Mede p50 e p95 de: criarVenda, listarVendas, resumoVendas
 *
 * Limites aceitáveis documentados (ADR-007, D1 Free tier):
 *   - criarVenda p95   < 200 ms
 *   - listarVendas p95 < 150 ms
 *   - resumoVendas p95 < 150 ms
 *
 * Estes limites são para o banco local (Miniflare) — produção com D1
 * tem latência de rede adicional (~5–30 ms dependendo da região).
 */

/// <reference types="@cloudflare/vitest-pool-workers" />

import type { ApiEnv } from '$lib/server/api/types';
type WorkerBindings = ApiEnv['Bindings'];
declare module 'cloudflare:test' {
  interface ProvidedEnv extends WorkerBindings {}
}

import { vi } from 'vitest';
vi.mock('$lib/brand', () => ({
  VTUR_LOGO_URL: 'data:image/png;base64,stub',
  VTUR_LOGO_PATH: '/brand/vtur-symbol.png',
}));

import { env } from 'cloudflare:test';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { getDb } from '$lib/server/db/client';
import { criarVenda, listarVendas, resumoVendas } from '$lib/server/vendas/service';
import type { VendaNormalizada } from '$lib/server/vendas/validation';

const MIGRATIONS = import.meta.glob('/drizzle/*.sql', { query: '?raw', import: 'default', eager: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function vendaSimples(empresaId: number, usuarioId: string): VendaNormalizada {
  return {
    destino: `Destino-${empresaId}`,
    data_venda: '2024-06-01',
    vendedor_id: usuarioId,
    chave_idempotencia: `${empresaId}-${usuarioId}-${Date.now()}-${Math.random()}`,
    itens: [
      {
        descricao: 'Pacote básico',
        quantidade: 1,
        valor_unitario_centavos: 150000,
        paga_comissao: false,
        parcelas_qtd: 2,
        valor_bruto_centavos: 150000,
        desconto_centavos: 0,
        valor_total_centavos: 150000,
        plano: '2x',
        parcelas_valor_centavos: 75000,
        parcelas: [
          { numero: 1, valor_centavos: 75000, vencimento: '2024-07-01' },
          { numero: 2, valor_centavos: 75000, vencimento: '2024-08-01' },
        ],
      },
    ],
  };
}

// ── Seed ──────────────────────────────────────────────────────────────────────

const N_EMPRESAS = 5;
const N_VENDAS_POR_EMPRESA = 100;

// IDs provisionados no beforeAll
const EMPRESA_IDS: number[] = Array.from({ length: N_EMPRESAS }, (_, i) => 100 + i);
const USUARIO_IDS: string[] = EMPRESA_IDS.map((e) => `usr-perf-${e}`);

beforeAll(async () => {
  await applyD1Migrations(env.DB, MIGRATIONS);

  const agora = new Date().toISOString();
  const ts = Date.now();
  const db = env.DB;

  // Inserir empresas e usuários em lote
  await db.batch(
    EMPRESA_IDS.map((id) =>
      db
        .prepare('INSERT INTO empresas (id, nome, criado_em, atualizado_em) VALUES (?, ?, ?, ?)')
        .bind(id, `Empresa-${id}`, agora, agora)
    )
  );
  await db.batch(
    USUARIO_IDS.map((uid, i) =>
      db
        .prepare(
          'INSERT INTO user (id, name, email, email_verified, empresa_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(uid, `User ${uid}`, `${uid}@test.com`, 1, EMPRESA_IDS[i], ts, ts)
    )
  );
  await db.batch(
    EMPRESA_IDS.map((eid, i) =>
      db
        .prepare(
          'INSERT INTO membros_empresa (empresa_id, user_id, papel, ativo, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(eid, USUARIO_IDS[i], 'admin', 1, agora, agora)
    )
  );
}, 120_000);

// ── Suíte P ───────────────────────────────────────────────────────────────────

describe('Suíte P — F6-01: carga com volume representativo', () => {
  // P1 ──────────────────────────────────────────────────────────────────────
  it(
    'P1. criarVenda: p95 < 200 ms com 100 inserções por empresa (500 no total)',
    async () => {
      const tempos: number[] = [];

      for (const [i, empresaId] of EMPRESA_IDS.entries()) {
        const drizzleDb = getDb(env.DB);
        for (let n = 0; n < N_VENDAS_POR_EMPRESA; n++) {
          const t0 = performance.now();
          await criarVenda(drizzleDb, empresaId, USUARIO_IDS[i], vendaSimples(empresaId, USUARIO_IDS[i]), env.DB);
          tempos.push(performance.now() - t0);
        }
      }

      tempos.sort((a, b) => a - b);
      const p50 = percentile(tempos, 50);
      const p95 = percentile(tempos, 95);
      const p99 = percentile(tempos, 99);

      console.log(`[P1] criarVenda  n=${tempos.length}  p50=${p50.toFixed(1)}ms  p95=${p95.toFixed(1)}ms  p99=${p99.toFixed(1)}ms`);

      expect(p95, `p95 de criarVenda deve ser < 200 ms (foi ${p95.toFixed(1)} ms)`).toBeLessThan(200);
    },
    180_000
  );

  // P2 ──────────────────────────────────────────────────────────────────────
  it(
    'P2. listarVendas: p95 < 150 ms com 100 registros por empresa (dados frios)',
    async () => {
      const tempos: number[] = [];

      for (const [i, empresaId] of EMPRESA_IDS.entries()) {
        const drizzleDb = getDb(env.DB);
        // 10 chamadas por empresa com cursores diferentes (simula navegação)
        for (let page = 0; page < 10; page++) {
          const t0 = performance.now();
          await listarVendas(drizzleDb, empresaId, { limite: 20 });
          tempos.push(performance.now() - t0);
        }

        // Coletar resultado para validar isolamento de tenant
        const resultado = await listarVendas(getDb(env.DB), empresaId, { limite: 200 });
        expect(resultado.items.every((v) => v.empresaId === empresaId)).toBe(true);
      }

      tempos.sort((a, b) => a - b);
      const p50 = percentile(tempos, 50);
      const p95 = percentile(tempos, 95);

      console.log(`[P2] listarVendas  n=${tempos.length}  p50=${p50.toFixed(1)}ms  p95=${p95.toFixed(1)}ms`);

      expect(p95, `p95 de listarVendas deve ser < 150 ms (foi ${p95.toFixed(1)} ms)`).toBeLessThan(150);
    },
    60_000
  );

  // P3 ──────────────────────────────────────────────────────────────────────
  it(
    'P3. resumoVendas: p95 < 150 ms com 100 registros por empresa',
    async () => {
      const tempos: number[] = [];

      for (const empresaId of EMPRESA_IDS) {
        const drizzleDb = getDb(env.DB);
        for (let r = 0; r < 10; r++) {
          const t0 = performance.now();
          await resumoVendas(drizzleDb, empresaId, {});
          tempos.push(performance.now() - t0);
        }
      }

      tempos.sort((a, b) => a - b);
      const p50 = percentile(tempos, 50);
      const p95 = percentile(tempos, 95);

      console.log(`[P3] resumoVendas  n=${tempos.length}  p50=${p50.toFixed(1)}ms  p95=${p95.toFixed(1)}ms`);

      expect(p95, `p95 de resumoVendas deve ser < 150 ms (foi ${p95.toFixed(1)} ms)`).toBeLessThan(150);
    },
    60_000
  );

  // P4 ──────────────────────────────────────────────────────────────────────
  it('P4. isolamento de tenant: nenhuma empresa vê vendas de outra após carga', async () => {
    for (const [i, empresaId] of EMPRESA_IDS.entries()) {
      const resultado = await listarVendas(getDb(env.DB), empresaId, { limite: 200 });
      const vazamento = resultado.items.filter((v) => v.empresaId !== empresaId);
      expect(
        vazamento.length,
        `Empresa ${empresaId} viu ${vazamento.length} vendas de outras empresas`
      ).toBe(0);
      // Cada empresa deve ter ~100 vendas
      expect(resultado.items.length).toBeGreaterThanOrEqual(N_VENDAS_POR_EMPRESA * 0.95);
    }
  }, 30_000);

  // P5 ──────────────────────────────────────────────────────────────────────
  it('P5. resumoVendas: totais são consistentes com os registros inseridos', async () => {
    for (const empresaId of EMPRESA_IDS) {
      const db = getDb(env.DB);
      const resumo = await resumoVendas(db, empresaId, {});
      const lista = await listarVendas(db, empresaId, { limite: 200 });

      // Total de vendas no resumo deve bater com a lista
      expect(resumo.totalVendas).toBe(lista.items.length);
      // Valor bruto total = soma dos itens (cada venda tem 1 item de 150000)
      const esperado = lista.items.length * 150000;
      expect(resumo.totalBrutoCentavos).toBe(esperado);
    }
  }, 30_000);
}, );
