/**
 * M01 — Rotas v2: empresas e membros da equipe (D1 / Hono).
 *
 * Empresa:  GET /empresa, PATCH /empresa
 * Membros:  GET /membros, GET /membros/:id,
 *           PATCH /membros/:id/papel, DELETE /membros/:id
 */
import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { resolveAuthContext } from '$lib/server/auth/context';
import { can } from '$lib/server/policy';
import { getDb } from '$lib/server/db/client';
import {
  obterEmpresa,
  editarEmpresa,
  listarMembros,
  obterMembro,
  alterarPapelMembro,
  revogarMembroM01,
  EmpresaError,
} from '$lib/server/equipe-m01/service';
import { PAPEIS, type Papel } from '$lib/server/db/schema';

export const equipeV2Routes = new Hono<ApiEnv>();

async function resolveCtx(c: Parameters<typeof equipeV2Routes.get>[1] extends (c: infer C) => unknown ? C : never) {
  const { DB, BETTER_AUTH_SECRET } = c.env;
  const baseURL = new URL(c.req.url).origin;
  const authCtx = await resolveAuthContext(c.req.raw.headers, DB, BETTER_AUTH_SECRET, baseURL);
  return { authCtx, db: getDb(DB) };
}

function erroEmpresa(c: Parameters<typeof equipeV2Routes.get>[1] extends (c: infer C) => unknown ? C : never, err: unknown) {
  if (err instanceof EmpresaError) {
    const status = err.code === 'NAO_ENCONTRADO' ? 404 : err.code === 'SEM_PERMISSAO' ? 403 : 400;
    return c.json({ error: err.message }, status);
  }
  console.error('[equipe-v2]', err);
  return c.json({ error: 'Erro interno.' }, 500);
}

equipeV2Routes
  .get('/empresa', async (c) => {
    const { authCtx, db } = await resolveCtx(c);
    if (!authCtx) return c.json({ error: 'Nao autenticado.' }, 401);
    if (!can(authCtx.papel, 'empresa', 'ler')) return c.json({ error: 'Sem permissao.' }, 403);
    try {
      return c.json({ empresa: await obterEmpresa(db, authCtx.empresaId) });
    } catch (e) { return erroEmpresa(c, e); }
  })

  .patch('/empresa', async (c) => {
    const { authCtx, db } = await resolveCtx(c);
    if (!authCtx) return c.json({ error: 'Nao autenticado.' }, 401);
    if (!can(authCtx.papel, 'empresa', 'editar')) return c.json({ error: 'Sem permissao.' }, 403);
    let body: { nome?: string; timezone?: string; slug?: string } = {};
    try { body = await c.req.json(); } catch { /**/ }
    try {
      return c.json({ empresa: await editarEmpresa(db, authCtx.empresaId, body) });
    } catch (e) { return erroEmpresa(c, e); }
  })

  .get('/membros', async (c) => {
    const { authCtx, db } = await resolveCtx(c);
    if (!authCtx) return c.json({ error: 'Nao autenticado.' }, 401);
    if (!can(authCtx.papel, 'usuarios', 'ler')) return c.json({ error: 'Sem permissao.' }, 403);
    const inativos = c.req.query('inativos') === 'true';
    return c.json({ membros: await listarMembros(db, authCtx.empresaId, { somenteAtivos: !inativos }) });
  })

  .get('/membros/:id', async (c) => {
    const { authCtx, db } = await resolveCtx(c);
    if (!authCtx) return c.json({ error: 'Nao autenticado.' }, 401);
    if (!can(authCtx.papel, 'usuarios', 'ler')) return c.json({ error: 'Sem permissao.' }, 403);
    const id = parseInt(c.req.param('id'), 10);
    if (!id) return c.json({ error: 'ID invalido.' }, 400);
    try {
      return c.json({ membro: await obterMembro(db, authCtx.empresaId, id) });
    } catch (e) { return erroEmpresa(c, e); }
  })

  .patch('/membros/:id/papel', async (c) => {
    const { authCtx, db } = await resolveCtx(c);
    if (!authCtx) return c.json({ error: 'Nao autenticado.' }, 401);
    if (!can(authCtx.papel, 'usuarios', 'gerenciar')) return c.json({ error: 'Sem permissao.' }, 403);
    const id = parseInt(c.req.param('id'), 10);
    if (!id) return c.json({ error: 'ID invalido.' }, 400);
    let body: { papel?: string } = {};
    try { body = await c.req.json(); } catch { /**/ }
    if (!body.papel || !PAPEIS.includes(body.papel as Papel)) {
      return c.json({ error: 'Papel invalido. Valores aceitos: ' + PAPEIS.join(', ') }, 422);
    }
    try {
      return c.json({ membro: await alterarPapelMembro(db, authCtx.empresaId, id, body.papel as Papel) });
    } catch (e) { return erroEmpresa(c, e); }
  })

  .delete('/membros/:id', async (c) => {
    const { authCtx, db } = await resolveCtx(c);
    if (!authCtx) return c.json({ error: 'Nao autenticado.' }, 401);
    if (!can(authCtx.papel, 'usuarios', 'gerenciar')) return c.json({ error: 'Sem permissao.' }, 403);
    const id = parseInt(c.req.param('id'), 10);
    if (!id) return c.json({ error: 'ID invalido.' }, 400);
    try {
      return c.json({ membro: await revogarMembroM01(db, authCtx.empresaId, id) });
    } catch (e) { return erroEmpresa(c, e); }
  });
