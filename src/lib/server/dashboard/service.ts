/**
 * M11 — Dashboards, ranking e relatórios.
 *
 * Todos os dados são isolados por empresa_id.
 * Nenhuma query cruza fronteiras de tenant.
 * Apenas leitura — sem INSERT/UPDATE/DELETE.
 */

import { eq, sql, and, desc, asc, gte, lte } from 'drizzle-orm';
import {
  vendas,
  vendaItens,
  vendaPagamentos,
  clientes,
  produtos,
  user,
  membrosEmpresa,
} from '$lib/server/db/schema';
import type { DrizzleDb } from '$lib/server/db/client';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────────

export interface FiltrosPeriodo {
  dataInicio?: string;  // YYYY-MM-DD
  dataFim?: string;     // YYYY-MM-DD
}

/** KPIs do período (vendas, receita, ticket médio, inadimplência). */
export interface KpiVendas {
  totalVendas: number;
  totalCanceladas: number;
  receitaBrutaCentavos: number;
  receitaLiquidaCentavos: number;  // bruto - canceladas
  valorPagoCentavos: number;
  valorEmAbertoCentavos: number;   // líquido - pago
  ticketMedioCentavos: number;
  pctAdimplencia: number;          // 0–100
}

/** Item do ranking de vendedores. */
export interface RankingVendedor {
  vendedorId: string;
  nome: string;
  totalVendas: number;
  receitaCentavos: number;
}

/** Item do ranking de produtos. */
export interface RankingProduto {
  produtoId: number | null;
  descricao: string;
  tipo: string;
  totalVendas: number;
  receitaCentavos: number;
}

/** Item do ranking de clientes. */
export interface RankingCliente {
  clienteId: number | null;
  nome: string;
  totalVendas: number;
  receitaCentavos: number;
}

/** Evolução mensal de receita (série temporal). */
export interface EvolucaoMensal {
  mes: string;           // YYYY-MM
  totalVendas: number;
  receitaCentavos: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

function condicoesPeriodo(empresaId: number, filtros: FiltrosPeriodo) {
  const conds = [eq(vendas.empresaId, empresaId), eq(vendas.cancelada, false)];
  if (filtros.dataInicio) conds.push(gte(vendas.dataVenda, filtros.dataInicio));
  if (filtros.dataFim)    conds.push(lte(vendas.dataVenda, filtros.dataFim));
  return conds;
}

// ─────────────────────────────────────────────────────────────────────────────
// KPIs gerais
// ─────────────────────────────────────────────────────────────────────────────

export async function kpiVendas(
  db: DrizzleDb,
  empresaId: number,
  filtros: FiltrosPeriodo = {}
): Promise<KpiVendas> {
  // Total (incluindo canceladas) para o mesmo período
  const condsBase = [eq(vendas.empresaId, empresaId)];
  if (filtros.dataInicio) condsBase.push(gte(vendas.dataVenda, filtros.dataInicio));
  if (filtros.dataFim)    condsBase.push(lte(vendas.dataVenda, filtros.dataFim));

  const [totais] = await db
    .select({
      total:       sql<number>`count(*)`,
      canceladas:  sql<number>`sum(case when ${vendas.cancelada} = 1 then 1 else 0 end)`,
      bruto:       sql<number>`coalesce(sum(case when ${vendas.cancelada} = 0 then ${vendas.valorTotalCentavos} else 0 end), 0)`,
      pago:        sql<number>`coalesce(sum(case when ${vendas.cancelada} = 0 then ${vendas.valorPagoCentavos} else 0 end), 0)`,
    })
    .from(vendas)
    .where(and(...condsBase));

  const totalVendas    = totais.total ?? 0;
  const totalCanceladas = totais.canceladas ?? 0;
  const bruto          = totais.bruto ?? 0;
  const pago           = totais.pago ?? 0;
  const emAberto       = Math.max(0, bruto - pago);
  const ativas         = totalVendas - totalCanceladas;

  return {
    totalVendas,
    totalCanceladas,
    receitaBrutaCentavos:    bruto,
    receitaLiquidaCentavos:  bruto,
    valorPagoCentavos:       pago,
    valorEmAbertoCentavos:   emAberto,
    ticketMedioCentavos:     ativas > 0 ? Math.round(bruto / ativas) : 0,
    pctAdimplencia:          bruto > 0 ? Math.round((pago / bruto) * 100) : 100,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranking de vendedores
// ─────────────────────────────────────────────────────────────────────────────

export async function rankingVendedores(
  db: DrizzleDb,
  empresaId: number,
  filtros: FiltrosPeriodo = {},
  limite = 10
): Promise<RankingVendedor[]> {
  const conds = condicoesPeriodo(empresaId, filtros);

  const rows = await db
    .select({
      vendedorId: vendas.vendedorId,
      nome:       user.name,
      total:      sql<number>`count(*)`,
      receita:    sql<number>`coalesce(sum(${vendas.valorTotalCentavos}), 0)`,
    })
    .from(vendas)
    .leftJoin(user, eq(vendas.vendedorId, user.id))
    .where(and(...conds))
    .groupBy(vendas.vendedorId, user.name)
    .orderBy(desc(sql`coalesce(sum(${vendas.valorTotalCentavos}), 0)`))
    .limit(limite);

  return rows.map((r) => ({
    vendedorId: r.vendedorId ?? '(sem vendedor)',
    nome:       r.nome       ?? '(sem nome)',
    totalVendas: r.total,
    receitaCentavos: r.receita,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranking de produtos (por itens de venda)
// ─────────────────────────────────────────────────────────────────────────────

export async function rankingProdutos(
  db: DrizzleDb,
  empresaId: number,
  filtros: FiltrosPeriodo = {},
  limite = 10
): Promise<RankingProduto[]> {
  // Join via vendaItens → vendas (para filtro de período e cancelamento)
  const condsVenda = [eq(vendas.empresaId, empresaId), eq(vendas.cancelada, false)];
  if (filtros.dataInicio) condsVenda.push(gte(vendas.dataVenda, filtros.dataInicio));
  if (filtros.dataFim)    condsVenda.push(lte(vendas.dataVenda, filtros.dataFim));

  const rows = await db
    .select({
      produtoId:  vendaItens.produtoId,
      descricao:  vendaItens.descricao,
      tipo:       vendaItens.tipo,
      total:      sql<number>`count(distinct ${vendaItens.vendaId})`,
      receita:    sql<number>`coalesce(sum(${vendaItens.valorTotalCentavos}), 0)`,
    })
    .from(vendaItens)
    .innerJoin(vendas, eq(vendaItens.vendaId, vendas.id))
    .where(and(...condsVenda))
    .groupBy(vendaItens.produtoId, vendaItens.descricao, vendaItens.tipo)
    .orderBy(desc(sql`coalesce(sum(${vendaItens.valorTotalCentavos}), 0)`))
    .limit(limite);

  return rows.map((r) => ({
    produtoId:      r.produtoId ?? null,
    descricao:      r.descricao,
    tipo:           r.tipo,
    totalVendas:    r.total,
    receitaCentavos: r.receita,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranking de clientes
// ─────────────────────────────────────────────────────────────────────────────

export async function rankingClientes(
  db: DrizzleDb,
  empresaId: number,
  filtros: FiltrosPeriodo = {},
  limite = 10
): Promise<RankingCliente[]> {
  const conds = condicoesPeriodo(empresaId, filtros);

  const rows = await db
    .select({
      clienteId: vendas.clienteId,
      nome:      clientes.nome,
      total:     sql<number>`count(*)`,
      receita:   sql<number>`coalesce(sum(${vendas.valorTotalCentavos}), 0)`,
    })
    .from(vendas)
    .leftJoin(clientes, eq(vendas.clienteId, clientes.id))
    .where(and(...conds))
    .groupBy(vendas.clienteId, clientes.nome)
    .orderBy(desc(sql`coalesce(sum(${vendas.valorTotalCentavos}), 0)`))
    .limit(limite);

  return rows.map((r) => ({
    clienteId:      r.clienteId ?? null,
    nome:           r.nome ?? '(sem cliente)',
    totalVendas:    r.total,
    receitaCentavos: r.receita,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Evolução mensal
// ─────────────────────────────────────────────────────────────────────────────

export async function evolucaoMensal(
  db: DrizzleDb,
  empresaId: number,
  filtros: FiltrosPeriodo = {}
): Promise<EvolucaoMensal[]> {
  const conds = condicoesPeriodo(empresaId, filtros);

  const rows = await db
    .select({
      mes:     sql<string>`substr(${vendas.dataVenda}, 1, 7)`,
      total:   sql<number>`count(*)`,
      receita: sql<number>`coalesce(sum(${vendas.valorTotalCentavos}), 0)`,
    })
    .from(vendas)
    .where(and(...conds))
    .groupBy(sql`substr(${vendas.dataVenda}, 1, 7)`)
    .orderBy(asc(sql`substr(${vendas.dataVenda}, 1, 7)`));

  return rows.map((r) => ({
    mes:             r.mes,
    totalVendas:     r.total,
    receitaCentavos: r.receita,
  }));
}
