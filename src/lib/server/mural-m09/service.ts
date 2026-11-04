/**
 * M09 — Mural de recados (D1 / Drizzle).
 *
 * Isolamento de tenant: todas as operações filtram por empresaId.
 * Estratégia de tempo real: polling com cursor (ADR-008).
 * Destinatário NULL = mensagem para toda a empresa.
 */
import { and, eq, gte, isNull, or, desc } from 'drizzle-orm';
import type { DrizzleDb } from '$lib/server/db/client';
import { muralRecados } from '$lib/server/db/schema';
import type { MuralRecado } from '$lib/server/db/schema';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface RecadoInput {
  assunto?: string;          // default ''
  conteudo: string;
  destinatarioId?: string | null;  // null = para toda a empresa
}

export interface ListarRecadosOpts {
  since?: string;             // ISO timestamp; retorna apenas criados >= since
  userId?: string;            // filtra por destinatário (null = para toda empresa)
  limit?: number;             // default 50
}

// ─── Erro de domínio ─────────────────────────────────────────────────────────

export class MuralError extends Error {
  constructor(
    message: string,
    public readonly code: 'VALIDACAO' | 'NAO_ENCONTRADO' | 'SEM_PERMISSAO'
  ) {
    super(message);
    this.name = 'MuralError';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function agora() {
  return new Date().toISOString();
}

// ─── Operações ───────────────────────────────────────────────────────────────

export async function criarRecado(
  db: DrizzleDb,
  empresaId: number,
  remetenteId: string,
  dados: RecadoInput
): Promise<MuralRecado> {
  const conteudo = dados.conteudo?.trim() ?? '';
  if (!conteudo) throw new MuralError('conteudo é obrigatório.', 'VALIDACAO');
  if (conteudo.length > 64_000) throw new MuralError('conteudo: máximo 64 000 caracteres.', 'VALIDACAO');

  const assunto = (dados.assunto ?? '').trim().slice(0, 200);
  const ts = agora();

  const [recado] = await db
    .insert(muralRecados)
    .values({
      empresaId,
      remetenteId,
      destinatarioId: dados.destinatarioId ?? null,
      assunto,
      conteudo,
      criadoEm: ts,
      atualizadoEm: ts,
    })
    .returning();

  return recado;
}

export async function obterRecado(
  db: DrizzleDb,
  empresaId: number,
  id: number
): Promise<MuralRecado> {
  const [recado] = await db
    .select()
    .from(muralRecados)
    .where(and(eq(muralRecados.id, id), eq(muralRecados.empresaId, empresaId)));

  if (!recado) throw new MuralError('Recado não encontrado.', 'NAO_ENCONTRADO');
  return recado;
}

export async function excluirRecado(
  db: DrizzleDb,
  empresaId: number,
  id: number,
  userId: string,
  papel: string
): Promise<void> {
  const recado = await obterRecado(db, empresaId, id);
  // Apenas remetente ou admin podem excluir
  if (recado.remetenteId !== userId && papel !== 'admin') {
    throw new MuralError('Sem permissão para excluir este recado.', 'SEM_PERMISSAO');
  }
  await db
    .delete(muralRecados)
    .where(and(eq(muralRecados.id, id), eq(muralRecados.empresaId, empresaId)));
}

/**
 * Lista recados visíveis para um usuário: mensagens para toda a empresa
 * (destinatarioId IS NULL) ou endereçadas especificamente a ele.
 * Suporta cursor (since) para polling eficiente — ADR-008.
 */
export async function listarRecados(
  db: DrizzleDb,
  empresaId: number,
  userId: string,
  opts: ListarRecadosOpts = {}
): Promise<MuralRecado[]> {
  const limit = Math.min(opts.limit ?? 50, 200);

  const conds = [
    eq(muralRecados.empresaId, empresaId),
    // Mensagens para toda empresa OU endereçadas ao usuário
    or(isNull(muralRecados.destinatarioId), eq(muralRecados.destinatarioId, userId))!,
  ];

  if (opts.since) {
    conds.push(gte(muralRecados.criadoEm, opts.since));
  }

  return db
    .select()
    .from(muralRecados)
    .where(and(...conds))
    .orderBy(desc(muralRecados.criadoEm))
    .limit(limit);
}

/**
 * Lista todos os recados da empresa (sem filtro de destinatário).
 * Usado por admin/gerente para painel de recados.
 */
export async function listarTodosRecados(
  db: DrizzleDb,
  empresaId: number,
  opts: { since?: string; limit?: number } = {}
): Promise<MuralRecado[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const conds = [eq(muralRecados.empresaId, empresaId)];
  if (opts.since) conds.push(gte(muralRecados.criadoEm, opts.since));

  return db
    .select()
    .from(muralRecados)
    .where(and(...conds))
    .orderBy(desc(muralRecados.criadoEm))
    .limit(limit);
}
