/**
 * Rotas Hono para dashboards — /api/v2/dashboard (M11).
 *
 * Todos os dados são isolados por empresa_id do usuário autenticado.
 * Apenas leitura. Qualquer papel autenticado pode acessar.
 *
 * Endpoints:
 *   GET /api/v2/dashboard/kpis              — KPIs gerais (vendas, receita, ticket médio)
 *   GET /api/v2/dashboard/ranking/vendedores — Top vendedores por receita
 *   GET /api/v2/dashboard/ranking/produtos   — Top produtos por receita (via itens)
 *   GET /api/v2/dashboard/ranking/clientes   — Top clientes por receita
 *   GET /api/v2/dashboard/evolucao-mensal    — Receita por mês (série temporal)
 */

import { Hono, type Context } from 'hono';
import type { ApiEnv } from '../../types';
import { resolveAuthContext } from '$lib/server/auth/context';
import { getDb } from '$lib/server/db/client';
import {
  kpiVendas,
  rankingVendedores,
  rankingProdutos,
  rankingClientes,
  evolucaoMensal,
  type FiltrosPeriodo,
} from '$lib/server/dashboard/service';

export const dashboardV2Routes = new Hono<ApiEnv>();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function contexto(c: Context<ApiEnv>) {
  const { DB, BETTER_AUTH_SECRET, PUBLIC_APP_URL, PUBLIC_ENVIRONMENT } = c.env;
  if (!DB || !BETTER_AUTH_SECRET) return { res: c.json({ error: 'Serviço indisponível.' }, 503) };
  const baseURL =
    PUBLIC_ENVIRONMENT === 'production'
      ? 'https://vturapp.com.br'
      : PUBLIC_APP_URL ?? 'http://localhost:5173';
  const ctx = await resolveAuthContext(c.req.raw.headers, DB, BETTER_AUTH_SECRET, baseURL);
  if (!ctx) return { res: c.json({ error: 'Não autenticado.' }, 401) };
  return { ctx, db: getDb(DB) };
}

function filtrosDoPeriodo(c: Context<ApiEnv>): FiltrosPeriodo {
  const dataInicio = c.req.query('data_inicio') ?? undefined;
  const dataFim    = c.req.query('data_fim')    ?? undefined;
  return { dataInicio, dataFim };
}

function parseLimite(c: Context<ApiEnv>, padrao = 10): number {
  const v = Number(c.req.query('limite') ?? padrao);
  return Number.isInteger(v) && v > 0 ? Math.min(v, 50) : padrao;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /kpis
// ─────────────────────────────────────────────────────────────────────────────

dashboardV2Routes.get('/kpis', async (c) => {
  const result = await contexto(c);
  if ('res' in result) return result.res;
  const { ctx, db } = result;

  const kpis = await kpiVendas(db, ctx.empresaId, filtrosDoPeriodo(c));
  return c.json(kpis);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /ranking/vendedores
// ─────────────────────────────────────────────────────────────────────────────

dashboardV2Routes.get('/ranking/vendedores', async (c) => {
  const result = await contexto(c);
  if ('res' in result) return result.res;
  const { ctx, db } = result;

  const lista = await rankingVendedores(db, ctx.empresaId, filtrosDoPeriodo(c), parseLimite(c));
  return c.json({ ranking: lista });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /ranking/produtos
// ─────────────────────────────────────────────────────────────────────────────

dashboardV2Routes.get('/ranking/produtos', async (c) => {
  const result = await contexto(c);
  if ('res' in result) return result.res;
  const { ctx, db } = result;

  const lista = await rankingProdutos(db, ctx.empresaId, filtrosDoPeriodo(c), parseLimite(c));
  return c.json({ ranking: lista });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /ranking/clientes
// ─────────────────────────────────────────────────────────────────────────────

dashboardV2Routes.get('/ranking/clientes', async (c) => {
  const result = await contexto(c);
  if ('res' in result) return result.res;
  const { ctx, db } = result;

  const lista = await rankingClientes(db, ctx.empresaId, filtrosDoPeriodo(c), parseLimite(c));
  return c.json({ ranking: lista });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /evolucao-mensal
// ─────────────────────────────────────────────────────────────────────────────

dashboardV2Routes.get('/evolucao-mensal', async (c) => {
  const result = await contexto(c);
  if ('res' in result) return result.res;
  const { ctx, db } = result;

  const serie = await evolucaoMensal(db, ctx.empresaId, filtrosDoPeriodo(c));
  return c.json({ serie });
});
