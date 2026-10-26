// Migrado para Hono de src/routes/api/v1/admin/avisos/send/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { applyTemplate, buildFromEmails, loadAvisoTemplates, loadEmailSettings, loadManagedUser } from '$lib/server/admin';
import { fetchWithTimeout } from '$lib/server/fetchWithTimeout';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { escapeHtml } from '$lib/utils/html';
import {
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_AVISO_SEND_BODY_BYTES = 16 * 1024;

function canSendAvisos(scope: Awaited<ReturnType<typeof resolveUserScope>>) {
  return scope.isAdmin || scope.isMaster || scope.isGestor || Boolean(scope.permissoes.admin_users);
}

function renderHtml(text: string) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => `<p>${line ? escapeHtml(line) : '&nbsp;'}</p>`)
    .join('');
}

export async function handleAdminAvisosSendPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_AVISO_SEND_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const rateLimit = await checkPersistentRateLimit(
      'admin-avisos-send',
      `${event.getClientAddress?.() || 'unknown'}:${user.id}`,
      { max: 20, windowMs: 60_000 }
    );
    if (!rateLimit.allowed) {
      return new Response('Muitas tentativas de envio. Aguarde alguns segundos.', {
        status: 429,
        headers: { ...NO_STORE_HEADERS, 'Retry-After': String(rateLimit.retryAfterSeconds) }
      });
    }

    const scope = await resolveUserScope(client, user.id);
    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};

    if (!canSendAvisos(scope)) {
      return new Response('Sem acesso para disparar avisos.', { status: 403, headers: NO_STORE_HEADERS });
    }

    const userId = String(body.user_id || '').trim();
    const templateId = String(body.template_id || '').trim();

    if (!userId || !templateId) {
      return new Response('Usuario e template sao obrigatorios.', { status: 400, headers: NO_STORE_HEADERS });
    }

    const targetUser = await loadManagedUser(client, scope, userId);
    if (!targetUser.email) {
      return new Response('Usuario sem e-mail cadastrado.', { status: 400, headers: NO_STORE_HEADERS });
    }

    const templates = await loadAvisoTemplates(client);
    const template = templates.find((item) => String(item.id) === templateId);
    if (!template) {
      return new Response('Template nao encontrado.', { status: 404, headers: NO_STORE_HEADERS });
    }

    const settings = await loadEmailSettings(client);
    const apiKey = String(settings?.resend_api_key || '').trim();
    if (!apiKey) {
      return new Response('Resend nao configurado para disparo de avisos.', { status: 400, headers: NO_STORE_HEADERS });
    }

    const fromEmails = buildFromEmails(settings);
    const senderKey = String(template.sender_key || 'avisos').trim().toLowerCase();
    const fromEmail =
      senderKey === 'financeiro'
        ? fromEmails.financeiro
        : senderKey === 'suporte'
          ? fromEmails.suporte
          : senderKey === 'admin'
            ? fromEmails.admin
            : fromEmails.avisos;

    const companyName = (() => {
      const company = Array.isArray(targetUser.companies) ? targetUser.companies[0] : targetUser.companies;
      return String(company?.nome_fantasia || company?.nome_empresa || '').trim();
    })();

    const vars = {
      nome: targetUser.nome_completo || '',
      email: targetUser.email || '',
      empresa: companyName
    };

    const subject = applyTemplate(String(template.assunto || ''), vars);
    const message = applyTemplate(String(template.mensagem || ''), vars);

    const response = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [targetUser.email],
        subject,
        html: renderHtml(message),
        text: message
      })
    }, 12_000);

    const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string; id?: string };
    if (!response.ok) {
      logServerError('[admin/avisos/send] Falha no provedor de e-mail', {
        status: response.status,
        providerMessage: String(payload?.message || payload?.error || '')
      });
      return new Response('Falha ao enviar aviso.', { status: 502, headers: NO_STORE_HEADERS });
    }

    return json({
      ok: true,
      provider: 'resend',
      id: payload?.id || null
    }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao enviar aviso.');
  }
}
