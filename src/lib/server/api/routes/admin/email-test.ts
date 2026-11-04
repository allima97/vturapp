// Migrado para Hono de src/routes/api/v1/admin/email/test/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import { buildFromEmails, loadEmailSettings } from '$lib/server/admin';
import { fetchWithTimeout } from '$lib/server/fetchWithTimeout';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import {
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_EMAIL_TEST_BODY_BYTES = 4 * 1024;
const MASKED = '••••••';

type AdminEmailTestBody = {
  to?: unknown;
  smtp_host?: unknown;
  smtp_port?: unknown;
  smtp_secure?: unknown;
  smtp_user?: unknown;
  smtp_pass?: unknown;
  resend_api_key?: unknown;
  alerta_from_email?: unknown;
  admin_from_email?: unknown;
  avisos_from_email?: unknown;
  financeiro_from_email?: unknown;
  suporte_from_email?: unknown;
};

function cleanText(value: unknown) {
  return String(value || '').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readAdminEmailTestBody(value: unknown): AdminEmailTestBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const body = value as Record<string, unknown>;
  return {
    to: body.to,
    smtp_host: body.smtp_host,
    smtp_port: body.smtp_port,
    smtp_secure: body.smtp_secure,
    smtp_user: body.smtp_user,
    smtp_pass: body.smtp_pass,
    resend_api_key: body.resend_api_key,
    alerta_from_email: body.alerta_from_email,
    admin_from_email: body.admin_from_email,
    avisos_from_email: body.avisos_from_email,
    financeiro_from_email: body.financeiro_from_email,
    suporte_from_email: body.suporte_from_email
  };
}

function providerPayloadMessage(payload: unknown) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload.slice(0, 400);
  if (!isRecord(payload)) return '';

  const errors = Array.isArray(payload.errors)
    ? payload.errors
        .filter(isRecord)
        .map((item) => item.message || item.field || item.help)
        .filter(Boolean)
        .join('; ')
    : '';
  return String(payload.message || payload.error || payload.name || errors || '').slice(0, 400);
}

function looksLikeResendSmtp(settings?: Record<string, unknown> | null) {
  const host = cleanText(settings?.smtp_host).toLowerCase();
  const user = cleanText(settings?.smtp_user).toLowerCase();
  return host === 'smtp.resend.com' && user === 'resend';
}

export async function handleAdminEmailTestPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_EMAIL_TEST_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const rateLimit = await checkPersistentRateLimit(
      'admin-email-test',
      `${event.getClientAddress?.() || 'unknown'}:${user.id}`,
      { max: 10, windowMs: 60_000 },
      event.platform?.env?.DB,
    );
    if (!rateLimit.allowed) {
      return new Response('Muitas tentativas de envio. Aguarde alguns segundos.', {
        status: 429,
        headers: { ...NO_STORE_HEADERS, 'Retry-After': String(rateLimit.retryAfterSeconds) }
      });
    }

    const scope = await resolveUserScope(client, user.id);
    const body = readAdminEmailTestBody(bodyResult.data);

    if (!scope.isAdmin) {
      return new Response('Somente ADMIN pode enviar teste de e-mail.', { status: 403, headers: NO_STORE_HEADERS });
    }

    const to = String(body.to || '').trim();
    if (!to) {
      return new Response('Informe o e-mail de destino.', { status: 400, headers: NO_STORE_HEADERS });
    }

    const savedSettings = await loadEmailSettings(client);
    const bodySettings = {
      smtp_host: cleanText(body.smtp_host) || savedSettings?.smtp_host || null,
      smtp_port: body.smtp_port === '' || body.smtp_port == null ? savedSettings?.smtp_port : Number(body.smtp_port),
      smtp_secure: typeof body.smtp_secure === 'boolean' ? body.smtp_secure : savedSettings?.smtp_secure,
      smtp_user: cleanText(body.smtp_user) || savedSettings?.smtp_user || null,
      smtp_pass:
        cleanText(body.smtp_pass) === MASKED
          ? savedSettings?.smtp_pass || null
          : cleanText(body.smtp_pass) || savedSettings?.smtp_pass || null,
      resend_api_key:
        cleanText(body.resend_api_key) === MASKED
          ? savedSettings?.resend_api_key || null
          : cleanText(body.resend_api_key) || savedSettings?.resend_api_key || null,
      alerta_from_email: cleanText(body.alerta_from_email) || savedSettings?.alerta_from_email || null,
      admin_from_email: cleanText(body.admin_from_email) || savedSettings?.admin_from_email || null,
      avisos_from_email: cleanText(body.avisos_from_email) || savedSettings?.avisos_from_email || null,
      financeiro_from_email: cleanText(body.financeiro_from_email) || savedSettings?.financeiro_from_email || null,
      suporte_from_email: cleanText(body.suporte_from_email) || savedSettings?.suporte_from_email || null
    };

    const apiKey =
      cleanText(bodySettings.resend_api_key) ||
      (looksLikeResendSmtp(bodySettings) ? cleanText(bodySettings.smtp_pass) : '');
    if (!apiKey) {
      return new Response('Resend nao configurado.', { status: 400, headers: NO_STORE_HEADERS });
    }

    const fromEmails = buildFromEmails(bodySettings);
    const fromEmail = fromEmails.admin || fromEmails.default;
    if (!fromEmail) {
      return new Response('Remetente nao configurado.', { status: 400, headers: NO_STORE_HEADERS });
    }

    let response: Response;
    try {
      response = await fetchWithTimeout('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject: 'Teste de configuracao VTUR',
          html: '<p>Configuracao de e-mail validada com sucesso.</p>',
          text: 'Configuracao de e-mail validada com sucesso.'
        })
      }, 45_000);
    } catch (err) {
      logServerError('[admin/email/test] timeout/excecao no Resend', err);
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? 'Tempo limite ao chamar o Resend. Verifique conectividade do servidor e tente novamente.'
          : 'Falha de conexao ao chamar o Resend.';
      return new Response(message, { status: 504, headers: NO_STORE_HEADERS });
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      logServerError('[admin/email/test] falha no provedor de e-mail', new Error('Resend provider error'), {
        status: response.status,
        message: providerPayloadMessage(payload)
      });
      const detail = providerPayloadMessage(payload);
      return new Response(
        detail ? `Falha no Resend (${response.status}): ${detail}` : `Falha no Resend (${response.status}).`,
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    return json({
      ok: true,
      provider: 'resend',
      id: isRecord(payload) ? payload.id || null : null
    }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao enviar teste de e-mail.');
  }
}
