/**
 * M08 — Agenda e tarefas (D1 / Drizzle).
 *
 * Isolamento de tenant: todas as operações filtram por empresaId.
 * Operador vê apenas seus próprios itens; gerente vê todos da empresa.
 */
import { and, eq, gte, lte, ne, sql } from 'drizzle-orm';
import type { DrizzleDb } from '$lib/server/db/client';
import { agendaItens } from '$lib/server/db/schema';
import type { AgendaItem } from '$lib/server/db/schema';

// ─── Tipos de input ──────────────────────────────────────────────────────────

export interface EventoInput {
  titulo: string;
  descricao?: string | null;
  startDate: string;        // YYYY-MM-DD
  endDate?: string | null;  // YYYY-MM-DD, default = startDate
  startAt?: string | null;  // HH:MM
  endAt?: string | null;    // HH:MM
  allDay?: boolean;
}

export interface TarefaInput {
  titulo: string;
  descricao?: string | null;
  vencimento?: string | null;
  status?: 'pendente' | 'em_andamento' | 'concluida' | 'cancelada';
  prioridade?: 'baixa' | 'normal' | 'alta' | 'urgente';
}

export interface ListarEventosOpts {
  inicio?: string;   // YYYY-MM-DD
  fim?: string;      // YYYY-MM-DD
  userId?: string;   // filtrar por usuário (gerente pode omitir para ver todos)
}

export interface ListarTarefasOpts {
  status?: string;
  prioridade?: string;
  userId?: string;   // filtrar por usuário (gerente pode omitir para ver todos)
  incluirConcluidas?: boolean;
}

// ─── Erro de domínio ─────────────────────────────────────────────────────────

export class AgendaError extends Error {
  constructor(
    message: string,
    public readonly code: 'VALIDACAO' | 'NAO_ENCONTRADO' | 'SEM_PERMISSAO'
  ) {
    super(message);
    this.name = 'AgendaError';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{2}:\d{2}$/;
const STATUSES_TAREFA = ['pendente', 'em_andamento', 'concluida', 'cancelada'] as const;
const PRIORIDADES = ['baixa', 'normal', 'alta', 'urgente'] as const;

function validarEvento(dados: Partial<EventoInput>, exigirTitulo = true): string[] {
  const erros: string[] = [];
  if (exigirTitulo && !dados.titulo?.trim()) erros.push('titulo é obrigatório.');
  if (dados.titulo && dados.titulo.trim().length > 200) erros.push('titulo: máximo 200 caracteres.');
  if (dados.startDate !== undefined && dados.startDate !== null && !ISO_DATE.test(dados.startDate))
    erros.push('start_date deve estar no formato YYYY-MM-DD.');
  if (dados.endDate !== undefined && dados.endDate !== null && !ISO_DATE.test(dados.endDate))
    erros.push('end_date deve estar no formato YYYY-MM-DD.');
  if (dados.startAt !== undefined && dados.startAt !== null && !HORA_RE.test(dados.startAt))
    erros.push('start_at deve estar no formato HH:MM.');
  if (dados.endAt !== undefined && dados.endAt !== null && !HORA_RE.test(dados.endAt))
    erros.push('end_at deve estar no formato HH:MM.');
  return erros;
}

function validarTarefa(dados: Partial<TarefaInput>, exigirTitulo = true): string[] {
  const erros: string[] = [];
  if (exigirTitulo && !dados.titulo?.trim()) erros.push('titulo é obrigatório.');
  if (dados.titulo && dados.titulo.trim().length > 200) erros.push('titulo: máximo 200 caracteres.');
  if (dados.status && !(STATUSES_TAREFA as readonly string[]).includes(dados.status))
    erros.push(`status inválido. Use: ${STATUSES_TAREFA.join(', ')}.`);
  if (dados.prioridade && !(PRIORIDADES as readonly string[]).includes(dados.prioridade))
    erros.push(`prioridade inválida. Use: ${PRIORIDADES.join(', ')}.`);
  if (dados.vencimento !== undefined && dados.vencimento !== null && !ISO_DATE.test(dados.vencimento))
    erros.push('vencimento deve estar no formato YYYY-MM-DD.');
  return erros;
}

function agora() {
  return new Date().toISOString();
}

// ─── Eventos ─────────────────────────────────────────────────────────────────

export async function criarEvento(
  db: DrizzleDb,
  empresaId: number,
  userId: string,
  dados: EventoInput
): Promise<AgendaItem> {
  const erros = validarEvento(dados);
  if (erros.length) throw new AgendaError(erros.join(' '), 'VALIDACAO');

  const endDate = dados.endDate ?? dados.startDate;
  const allDay = dados.allDay ?? !dados.startAt;
  const ts = agora();

  const [item] = await db
    .insert(agendaItens)
    .values({
      empresaId,
      userId,
      tipo: 'evento',
      titulo: dados.titulo.trim(),
      descricao: dados.descricao?.trim() ?? null,
      startDate: dados.startDate,
      endDate,
      startAt: dados.startAt ?? null,
      endAt: dados.endAt ?? null,
      allDay,
      criadoPor: userId,
      criadoEm: ts,
      atualizadoEm: ts,
    })
    .returning();

  return item;
}

export async function obterItem(
  db: DrizzleDb,
  empresaId: number,
  id: number
): Promise<AgendaItem> {
  const [item] = await db
    .select()
    .from(agendaItens)
    .where(and(eq(agendaItens.id, id), eq(agendaItens.empresaId, empresaId)));

  if (!item) throw new AgendaError('Item não encontrado.', 'NAO_ENCONTRADO');
  return item;
}

export async function editarEvento(
  db: DrizzleDb,
  empresaId: number,
  id: number,
  dados: Partial<EventoInput>
): Promise<AgendaItem> {
  const erros = validarEvento(dados, false);
  if (erros.length) throw new AgendaError(erros.join(' '), 'VALIDACAO');

  await obterItem(db, empresaId, id); // valida existência

  const upd: Partial<NovoAgendaItem> = { atualizadoEm: agora() };
  if (dados.titulo !== undefined) upd.titulo = dados.titulo.trim();
  if ('descricao' in dados) upd.descricao = dados.descricao?.trim() ?? null;
  if (dados.startDate !== undefined) upd.startDate = dados.startDate;
  if ('endDate' in dados) upd.endDate = dados.endDate ?? null;
  if ('startAt' in dados) upd.startAt = dados.startAt ?? null;
  if ('endAt' in dados) upd.endAt = dados.endAt ?? null;
  if (dados.allDay !== undefined) upd.allDay = dados.allDay;

  const [updated] = await db
    .update(agendaItens)
    .set(upd)
    .where(and(eq(agendaItens.id, id), eq(agendaItens.empresaId, empresaId)))
    .returning();

  return updated;
}

export async function excluirItem(
  db: DrizzleDb,
  empresaId: number,
  id: number
): Promise<void> {
  await obterItem(db, empresaId, id);
  await db
    .delete(agendaItens)
    .where(and(eq(agendaItens.id, id), eq(agendaItens.empresaId, empresaId)));
}

export async function listarEventos(
  db: DrizzleDb,
  empresaId: number,
  opts: ListarEventosOpts = {}
): Promise<AgendaItem[]> {
  const conds = [
    eq(agendaItens.empresaId, empresaId),
    eq(agendaItens.tipo, 'evento'),
  ];

  if (opts.userId) conds.push(eq(agendaItens.userId, opts.userId));

  if (opts.inicio && opts.fim) {
    // Filtra por startDate dentro do range usando SQL raw para garantir comparação textual ISO
    conds.push(sql`${agendaItens.startDate} >= ${opts.inicio}`);
    conds.push(sql`${agendaItens.startDate} <= ${opts.fim}`);
  } else if (opts.inicio) {
    conds.push(sql`${agendaItens.startDate} >= ${opts.inicio}`);
  } else if (opts.fim) {
    conds.push(sql`${agendaItens.startDate} <= ${opts.fim}`);
  }

  return db
    .select()
    .from(agendaItens)
    .where(and(...conds))
    .orderBy(agendaItens.startDate, agendaItens.startAt);
}

// ─── Tarefas ─────────────────────────────────────────────────────────────────

export async function criarTarefa(
  db: DrizzleDb,
  empresaId: number,
  userId: string,
  dados: TarefaInput
): Promise<AgendaItem> {
  const erros = validarTarefa(dados);
  if (erros.length) throw new AgendaError(erros.join(' '), 'VALIDACAO');

  const ts = agora();
  const [item] = await db
    .insert(agendaItens)
    .values({
      empresaId,
      userId,
      tipo: 'tarefa',
      titulo: dados.titulo.trim(),
      descricao: dados.descricao?.trim() ?? null,
      vencimento: dados.vencimento ?? null,
      status: dados.status ?? 'pendente',
      prioridade: dados.prioridade ?? 'normal',
      done: false,
      criadoPor: userId,
      criadoEm: ts,
      atualizadoEm: ts,
    })
    .returning();

  return item;
}

export async function editarTarefa(
  db: DrizzleDb,
  empresaId: number,
  id: number,
  dados: Partial<TarefaInput>
): Promise<AgendaItem> {
  const erros = validarTarefa(dados, false);
  if (erros.length) throw new AgendaError(erros.join(' '), 'VALIDACAO');

  await obterItem(db, empresaId, id);

  const upd: Partial<NovoAgendaItem> = { atualizadoEm: agora() };
  if (dados.titulo !== undefined) upd.titulo = dados.titulo.trim();
  if ('descricao' in dados) upd.descricao = dados.descricao?.trim() ?? null;
  if ('vencimento' in dados) upd.vencimento = dados.vencimento ?? null;
  if (dados.status !== undefined) upd.status = dados.status;
  if (dados.prioridade !== undefined) upd.prioridade = dados.prioridade;

  const [updated] = await db
    .update(agendaItens)
    .set(upd)
    .where(and(eq(agendaItens.id, id), eq(agendaItens.empresaId, empresaId)))
    .returning();

  return updated;
}

export async function concluirTarefa(
  db: DrizzleDb,
  empresaId: number,
  id: number
): Promise<AgendaItem> {
  await obterItem(db, empresaId, id);

  const [updated] = await db
    .update(agendaItens)
    .set({ done: true, status: 'concluida', atualizadoEm: agora() })
    .where(and(eq(agendaItens.id, id), eq(agendaItens.empresaId, empresaId)))
    .returning();

  return updated;
}

export async function listarTarefas(
  db: DrizzleDb,
  empresaId: number,
  opts: ListarTarefasOpts = {}
): Promise<AgendaItem[]> {
  const conds = [
    eq(agendaItens.empresaId, empresaId),
    eq(agendaItens.tipo, 'tarefa'),
  ];

  if (opts.userId) conds.push(eq(agendaItens.userId, opts.userId));
  if (opts.status) conds.push(eq(agendaItens.status, opts.status));
  if (opts.prioridade) conds.push(eq(agendaItens.prioridade, opts.prioridade));
  if (!opts.incluirConcluidas) {
    conds.push(ne(agendaItens.status, 'concluida'));
    conds.push(ne(agendaItens.status, 'cancelada'));
  }

  return db
    .select()
    .from(agendaItens)
    .where(and(...conds))
    .orderBy(agendaItens.prioridade, agendaItens.vencimento);
}

// Re-export tipos auxiliares
type NovoAgendaItem = typeof agendaItens.$inferInsert;
