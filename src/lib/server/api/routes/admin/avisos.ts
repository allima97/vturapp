// Migrado para Hono de src/routes/api/v1/admin/avisos/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { loadAvisoTemplates } from '$lib/server/admin';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_AVISO_TEMPLATE_BODY_BYTES = 64 * 1024;

type AvisoTemplateBody = {
  action?: unknown;
  id?: unknown;
  nome?: unknown;
  assunto?: unknown;
  mensagem?: unknown;
  ativo?: unknown;
  sender_key?: unknown;
};

function readAvisoTemplateBody(value: unknown): AvisoTemplateBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    action: body.action,
    id: body.id,
    nome: body.nome,
    assunto: body.assunto,
    mensagem: body.mensagem,
    ativo: body.ativo,
    sender_key: body.sender_key
  };
}

function canManageTemplates(scope: Awaited<ReturnType<typeof resolveUserScope>>) {
  return (
    scope.isAdmin ||
    scope.isMaster ||
    scope.isGestor ||
    Boolean(scope.permissoes.admin) ||
    Boolean(scope.permissoes.admin_users)
  );
}

export async function handleAdminAvisosGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!canManageTemplates(scope)) {
      return new Response('Sem acesso aos templates de aviso.', {
        status: 403,
        headers: NO_STORE_HEADERS
      });
    }

    const templates = await loadAvisoTemplates(client);
    return json({ items: templates }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar templates de aviso.');
  }
}

export async function handleAdminAvisosPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_AVISO_TEMPLATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const body = readAvisoTemplateBody(bodyResult.data);

    if (!canManageTemplates(scope)) {
      return new Response('Sem acesso aos templates de aviso.', {
        status: 403,
        headers: NO_STORE_HEADERS
      });
    }

    const action = String(body.action || 'save')
      .trim()
      .toLowerCase();
    const id = String(body.id || '').trim();

    if (action === 'delete') {
      if (!id)
        return new Response('Template nao informado.', { status: 400, headers: NO_STORE_HEADERS });
      const { error: deleteError } = await client
        .from('admin_avisos_templates')
        .delete()
        .eq('id', id);
      if (deleteError) throw deleteError;
      return json({ id, deleted: true }, { headers: NO_STORE_HEADERS });
    }

    const payload = {
      nome: String(body.nome || '').trim(),
      assunto: String(body.assunto || '').trim(),
      mensagem: String(body.mensagem || '').trim(),
      ativo: body.ativo !== false,
      sender_key: String(body.sender_key || 'avisos').trim() || 'avisos'
    };

    if (!payload.nome || !payload.assunto || !payload.mensagem) {
      return new Response('Nome, assunto e mensagem sao obrigatorios.', {
        status: 400,
        headers: NO_STORE_HEADERS
      });
    }

    if (id) {
      const { error: updateError } = await client
        .from('admin_avisos_templates')
        .update(payload)
        .eq('id', id);
      if (updateError) throw updateError;
      return json({ id, updated: true }, { headers: NO_STORE_HEADERS });
    }

    const { data, error: insertError } = await client
      .from('admin_avisos_templates')
      .insert(payload)
      .select('id')
      .single();
    if (insertError) throw insertError;

    return json({ id: data.id, created: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar template de aviso.');
  }
}
