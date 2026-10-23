/**
 * GET  /api/v1/lgpd/admin/solicitacoes — listar solicitações (admin)
 * PATCH /api/v1/lgpd/admin/solicitacoes/:id — responder/atualizar status
 *
 * LGPD Art. 18: prazo de 15 dias para resposta.
 * Requer role admin (isAdmin).
 */
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getAdminClient, requireAuthenticatedUser, resolveUserScope, logServerError } from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited } from '$lib/server/requestGuards';

const STATUS_VALIDOS = ['em_analise', 'concluida', 'recusada'] as const;
type StatusSolicitacao = typeof STATUS_VALIDOS[number];

export async function handleLgpdSolicitacoesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      return json({ error: 'Acesso restrito a administradores.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const url = event.url;
    const status = url.searchParams.get('status') || null;
    const pagina = Math.max(1, parseInt(url.searchParams.get('pagina') || '1', 10));
    const porPagina = 50;
    const offset = (pagina - 1) * porPagina;

    let query = client
      .from('lgpd_solicitacoes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + porPagina - 1);

    if (status) query = query.eq('status', status);

    const { data, count, error } = await query;
    if (error) throw error;

    // Identifica solicitações com prazo vencido (> 15 dias sem resposta)
    const agora = new Date().toISOString();
    const items = (data ?? []).map((s) => ({
      ...s,
      prazo_vencido: s.status === 'recebida' || s.status === 'em_analise'
        ? s.prazo_legal < agora
        : false
    }));

    return json({
      items,
      total: count ?? 0,
      pagina,
      por_pagina: porPagina
    }, { headers: NO_STORE_HEADERS });

  } catch (err) {
    logServerError('[lgpd/admin/solicitacoes] erro', err);
    return json({ error: 'Erro ao listar solicitações.' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function handleLgpdSolicitacaoAtualizar(event: RequestEvent, id: string) {
  try {
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      return json({ error: 'Acesso restrito a administradores.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const bodyResult = await readJsonBodyLimited(event.request, 8 * 1024);
    if (!bodyResult.ok) return bodyResult.response;

    const body = bodyResult.data as Record<string, unknown>;
    const novoStatus = String(body.status ?? '').trim();
    const resposta = String(body.resposta ?? '').trim().slice(0, 5000);

    if (!STATUS_VALIDOS.includes(novoStatus as StatusSolicitacao)) {
      return json(
        { error: `Status inválido. Valores aceitos: ${STATUS_VALIDOS.join(', ')}` },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!resposta) {
      return json({ error: 'Resposta é obrigatória.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data, error: updateErr } = await client
      .from('lgpd_solicitacoes')
      .update({
        status: novoStatus,
        resposta,
        respondido_por: user.id,
        respondido_em: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return json({ ok: true, solicitacao: data }, { headers: NO_STORE_HEADERS });

  } catch (err) {
    logServerError('[lgpd/admin/solicitacoes/atualizar] erro', err);
    return json({ error: 'Erro ao atualizar solicitação.' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
