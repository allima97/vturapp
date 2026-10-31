/**
 * M08 — Rotas v2: agenda (eventos) e tarefas (D1 / Hono).
 *
 * Agenda:  GET/POST /agenda, GET/PATCH/DELETE /agenda/:id
 * Tarefas: GET/POST /tarefas, GET/PATCH /tarefas/:id, POST /tarefas/:id/concluir
 */
import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { resolveAuthContext } from '../../middleware/auth-context';
import { getDb } from '$lib/server/db/client';
import { can } from '$lib/server/policy';
import {
  criarEvento,
  editarEvento,
  excluirItem,
  listarEventos,
  obterItem,
  criarTarefa,
  editarTarefa,
  concluirTarefa,
  listarTarefas,
  AgendaError,
} from '$lib/server/agenda-m08/service';

export const agendaV2Routes = new Hono<ApiEnv>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function contexto(c: Parameters<typeof agendaV2Routes.get>[1] extends (c: infer C) => unknown ? C : never) {
  const ctx = await resolveAuthContext(c.env.event, c.env.DB);
  if (!ctx) return { res: c.json({ error: 'Não autenticado.' }, 401) };
  const db = getDb(c.env.DB);
  return { ctx, db };
}

function respostaErro(c: Parameters<typeof agendaV2Routes.get>[1] extends (c: infer C) => unknown ? C : never, err: unknown) {
  if (err instanceof AgendaError) {
    const status = err.code === 'NAO_ENCONTRADO' ? 404 : err.code === 'SEM_PERMISSAO' ? 403 : 400;
    return c.json({ error: err.message }, status);
  }
  console.error('[agenda-v2]', err);
  return c.json({ error: 'Erro interno.' }, 500);
}

function parseId(raw: string): number {
  const n = parseInt(raw, 10);
  return isNaN(n) ? 0 : n;
}

// ─── Eventos ─────────────────────────────────────────────────────────────────

// GET /agenda?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
agendaV2Routes.get('/eventos', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'agenda', 'ler')) return c.json({ error: 'Sem permissão.' }, 403);

  const inicio = c.req.query('inicio') ?? undefined;
  const fim = c.req.query('fim') ?? undefined;
  // Operador vê somente seus próprios; gerente/dono vê todos
  const somenteProprио = r.ctx.papel === 'operador';
  const userId = somenteProprио ? r.ctx.userId : (c.req.query('user_id') ?? undefined);

  try {
    const items = await listarEventos(r.db, r.ctx.empresaId, { inicio, fim, userId });
    return c.json({ items });
  } catch (err) {
    return respostaErro(c, err);
  }
});

// POST /agenda/eventos
agendaV2Routes.post('/eventos', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'agenda', 'criar')) return c.json({ error: 'Sem permissão.' }, 403);

  try {
    const body = await c.req.json();
    const item = await criarEvento(r.db, r.ctx.empresaId, r.ctx.userId, body);
    return c.json({ item }, 201);
  } catch (err) {
    return respostaErro(c, err);
  }
});

// GET /agenda/eventos/:id
agendaV2Routes.get('/eventos/:id', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'agenda', 'ler')) return c.json({ error: 'Sem permissão.' }, 403);

  try {
    const item = await obterItem(r.db, r.ctx.empresaId, parseId(c.req.param('id')));
    return c.json({ item });
  } catch (err) {
    return respostaErro(c, err);
  }
});

// PATCH /agenda/eventos/:id
agendaV2Routes.patch('/eventos/:id', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'agenda', 'editar')) return c.json({ error: 'Sem permissão.' }, 403);

  try {
    const body = await c.req.json();
    const item = await editarEvento(r.db, r.ctx.empresaId, parseId(c.req.param('id')), body);
    return c.json({ item });
  } catch (err) {
    return respostaErro(c, err);
  }
});

// DELETE /agenda/eventos/:id
agendaV2Routes.delete('/eventos/:id', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'agenda', 'excluir')) return c.json({ error: 'Sem permissão.' }, 403);

  try {
    await excluirItem(r.db, r.ctx.empresaId, parseId(c.req.param('id')));
    return c.json({ ok: true });
  } catch (err) {
    return respostaErro(c, err);
  }
});

// ─── Tarefas ─────────────────────────────────────────────────────────────────

// GET /agenda/tarefas
agendaV2Routes.get('/tarefas', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'agenda', 'ler')) return c.json({ error: 'Sem permissão.' }, 403);

  const status = c.req.query('status') ?? undefined;
  const prioridade = c.req.query('prioridade') ?? undefined;
  const incluirConcluidas = c.req.query('incluir_concluidas') === 'true';
  const somenteProprио = r.ctx.papel === 'operador';
  const userId = somenteProprио ? r.ctx.userId : (c.req.query('user_id') ?? undefined);

  try {
    const items = await listarTarefas(r.db, r.ctx.empresaId, { status, prioridade, userId, incluirConcluidas });
    return c.json({ items });
  } catch (err) {
    return respostaErro(c, err);
  }
});

// POST /agenda/tarefas
agendaV2Routes.post('/tarefas', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'agenda', 'criar')) return c.json({ error: 'Sem permissão.' }, 403);

  try {
    const body = await c.req.json();
    const item = await criarTarefa(r.db, r.ctx.empresaId, r.ctx.userId, body);
    return c.json({ item }, 201);
  } catch (err) {
    return respostaErro(c, err);
  }
});

// GET /agenda/tarefas/:id
agendaV2Routes.get('/tarefas/:id', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'agenda', 'ler')) return c.json({ error: 'Sem permissão.' }, 403);

  try {
    const item = await obterItem(r.db, r.ctx.empresaId, parseId(c.req.param('id')));
    return c.json({ item });
  } catch (err) {
    return respostaErro(c, err);
  }
});

// PATCH /agenda/tarefas/:id
agendaV2Routes.patch('/tarefas/:id', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'agenda', 'editar')) return c.json({ error: 'Sem permissão.' }, 403);

  try {
    const body = await c.req.json();
    const item = await editarTarefa(r.db, r.ctx.empresaId, parseId(c.req.param('id')), body);
    return c.json({ item });
  } catch (err) {
    return respostaErro(c, err);
  }
});

// POST /agenda/tarefas/:id/concluir
agendaV2Routes.post('/tarefas/:id/concluir', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'agenda', 'editar')) return c.json({ error: 'Sem permissão.' }, 403);

  try {
    const item = await concluirTarefa(r.db, r.ctx.empresaId, parseId(c.req.param('id')));
    return c.json({ item });
  } catch (err) {
    return respostaErro(c, err);
  }
});
