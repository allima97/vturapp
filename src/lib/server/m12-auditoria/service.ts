/**
 * M12 — Auditoria, privacidade e administração operacional.
 *
 * Serviço para gravação e consulta da trilha de auditoria v2 (D1).
 * Não usa Supabase — totalmente compatível com Workers runtime.
 *
 * LGPD Art. 46: campos sensíveis (CPF, senha, token) são removidos
 * de `detalhes` antes da gravação.
 */

import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { DrizzleDb } from '$lib/server/db/client';
import { auditLogs, clientes, user, vendas } from '$lib/server/db/schema';

// ─── Campos sensíveis a remover dos detalhes (LGPD Art. 46) ──────────────────
const CAMPOS_SENSIVEIS = new Set([
  'senha', 'password', 'cpf', 'token', 'secret', 'hash',
  'credit_card', 'cartao', 'cvv', 'pin',
]);

function sanitizarDetalhes(
  detalhes: Record<string, unknown> | null | undefined,
): string | null {
  if (!detalhes) return null;
  const sanitizado: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detalhes)) {
    sanitizado[k] = CAMPOS_SENSIVEIS.has(k.toLowerCase()) ? '[REDACTED]' : v;
  }
  return JSON.stringify(sanitizado);
}

// ─── Gravação ─────────────────────────────────────────────────────────────────

export interface GravarAuditParams {
  empresaId: number;
  userId?: string | null;
  modulo: string;
  acao: string;
  detalhes?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Grava um evento na trilha de auditoria.
 * Fire-and-forget: nunca lança exceção — falhas são silenciosas
 * (não devem bloquear a operação de negócio).
 */
export async function gravarAudit(
  db: DrizzleDb,
  params: GravarAuditParams,
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      empresaId: params.empresaId,
      userId:    params.userId ?? null,
      modulo:    params.modulo,
      acao:      params.acao,
      detalhes:  sanitizarDetalhes(params.detalhes ?? null),
      ip:        params.ip ?? null,
      userAgent: params.userAgent?.slice(0, 300) ?? null,
      criadoEm:  new Date().toISOString(),
    });
  } catch {
    // silencioso: auditoria nunca bloqueia a operação principal
  }
}

// ─── Consulta ─────────────────────────────────────────────────────────────────

export interface FiltroAudit {
  modulo?: string;
  userId?: string;
  de?: string;  // ISO date
  ate?: string; // ISO date
  cursor?: number; // id do último registro (keyset pagination)
  limite?: number;
}

export interface AuditEntry {
  id: number;
  userId: string | null;
  userNome: string | null;
  userEmail: string | null;
  modulo: string;
  acao: string;
  detalhes: unknown;
  ip: string | null;
  criadoEm: string;
}

/**
 * Lista entradas de auditoria de uma empresa (keyset pagination).
 * Apenas admins chamam esta função (controle feito na rota via RBAC).
 */
export async function listarAuditLogs(
  db: DrizzleDb,
  empresaId: number,
  filtro: FiltroAudit = {},
): Promise<{ logs: AuditEntry[]; proximo: number | null }> {
  const limite = Math.min(filtro.limite ?? 50, 100);

  const conditions = [eq(auditLogs.empresaId, empresaId)];
  if (filtro.modulo) conditions.push(eq(auditLogs.modulo, filtro.modulo));
  if (filtro.userId) conditions.push(eq(auditLogs.userId, filtro.userId));
  if (filtro.de)     conditions.push(gte(auditLogs.criadoEm, filtro.de));
  if (filtro.ate)    conditions.push(lte(auditLogs.criadoEm, filtro.ate + 'T23:59:59Z'));
  if (filtro.cursor) conditions.push(sql`${auditLogs.id} < ${filtro.cursor}`);

  const rows = await db
    .select({
      id:         auditLogs.id,
      userId:     auditLogs.userId,
      userNome:   user.name,
      userEmail:  user.email,
      modulo:     auditLogs.modulo,
      acao:       auditLogs.acao,
      detalhes:   auditLogs.detalhes,
      ip:         auditLogs.ip,
      criadoEm:   auditLogs.criadoEm,
    })
    .from(auditLogs)
    .leftJoin(user, eq(auditLogs.userId, user.id))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.id))
    .limit(limite + 1);

  const temProximo = rows.length > limite;
  const pagina = rows.slice(0, limite);

  return {
    logs: pagina.map((r) => ({
      ...r,
      detalhes: r.detalhes ? JSON.parse(r.detalhes) : null,
    })),
    proximo: temProximo ? (pagina.at(-1)?.id ?? null) : null,
  };
}

// ─── LGPD: exportar e apagar dados pessoais de um titular ────────────────────

export interface DadosTitular {
  usuario: { id: string; nome: string; email: string; criadoEm: string } | null;
  totalVendas: number;
  totalAuditLogs: number;
  totalClientes: number;
}

/**
 * Exporta sumário dos dados pessoais de um titular (Art. 18 LGPD).
 * Retorna contagens — não os dados brutos — para evitar vazamento em payload.
 */
export async function exportarDadosTitular(
  db: DrizzleDb,
  empresaId: number,
  userId: string,
): Promise<DadosTitular> {
  const [titular] = await db
    .select({ id: user.id, nome: user.name, email: user.email, criadoEm: user.createdAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  const [{ totalVendas }] = await db
    .select({ totalVendas: sql<number>`count(*)` })
    .from(vendas)
    .where(and(eq(vendas.empresaId, empresaId), eq(vendas.criadoPor, userId)));

  const [{ totalAuditLogs }] = await db
    .select({ totalAuditLogs: sql<number>`count(*)` })
    .from(auditLogs)
    .where(and(eq(auditLogs.empresaId, empresaId), eq(auditLogs.userId, userId)));

  const [{ totalClientes }] = await db
    .select({ totalClientes: sql<number>`count(*)` })
    .from(clientes)
    .where(and(eq(clientes.empresaId, empresaId), eq(clientes.criadoPor, userId)));

  return {
    usuario: titular
      ? {
          id:       titular.id,
          nome:     titular.nome ?? '',
          email:    titular.email,
          criadoEm: titular.criadoEm ? new Date(titular.criadoEm).toISOString() : '',
        }
      : null,
    totalVendas:    Number(totalVendas),
    totalAuditLogs: Number(totalAuditLogs),
    totalClientes:  Number(totalClientes),
  };
}

/**
 * Anonimiza os dados pessoais de um titular nos audit_logs (Art. 18 LGPD).
 * Não apaga o registro de auditoria — substitui user_id por NULL.
 * Operação irreversível; requer confirmação explícita na rota.
 */
export async function anonimizarTitularAuditLogs(
  db: DrizzleDb,
  empresaId: number,
  userId: string,
): Promise<{ anonimizados: number }> {
  // Conta antes de atualizar (D1 não expõe rowsAffected de forma confiável)
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(auditLogs)
    .where(and(eq(auditLogs.empresaId, empresaId), eq(auditLogs.userId, userId)));

  await db
    .update(auditLogs)
    .set({ userId: null })
    .where(and(eq(auditLogs.empresaId, empresaId), eq(auditLogs.userId, userId)));

  return { anonimizados: Number(total) };
}
