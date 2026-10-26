// Migrado para Hono de src/routes/api/v1/welcome-email/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getAdminClient, logServerError, requireAuthenticatedUser } from '$lib/server/v1';
import { renderEmailHtml, renderEmailText } from '$lib/server/emailMarkdown';
import { resolveResendApiKey, resolveFromEmails, resolveSmtpConfig } from '$lib/server/emailSettings';
import { fetchWithTimeout } from '$lib/server/fetchWithTimeout';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { rejectCrossOriginRequest, rejectLargePayload } from '$lib/server/requestGuards';

const MAX_WELCOME_EMAIL_BODY_BYTES = 8 * 1024;

const TEMPLATE_NOME = "Bem-Vindo!";
const TEMPLATE_ASSUNTO = "Bem-Vindo!";
const errorResponse = (message: string, status: number) =>
  json({ error: message }, { status, headers: NO_STORE_HEADERS });

function limparDigitos(valor?: string | null) {
  return (valor || "").replace(/\D/g, "");
}

function validarCpf(valor?: string | null) {
  const digitos = limparDigitos(valor);
  if (digitos.length !== 11) return false;
  if (/^(\d)\1+$/.test(digitos)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i += 1) {
    soma += Number(digitos[i]) * (10 - i);
  }
  let resto = soma % 11;
  const digito1 = resto < 2 ? 0 : 11 - resto;
  soma = 0;
  for (let i = 0; i < 10; i += 1) {
    soma += Number(digitos[i]) * (11 - i);
  }
  resto = soma % 11;
  const digito2 = resto < 2 ? 0 : 11 - resto;
  return digito1 === Number(digitos[9]) && digito2 === Number(digitos[10]);
}

function validarData(valor?: string | null) {
  if (!valor) return false;
  const timestamp = Date.parse(valor);
  return !Number.isNaN(timestamp);
}

function validarCep(valor?: string | null) {
  const digits = limparDigitos(valor);
  return digits.length === 8;
}

function validarTelefone(valor?: string | null) {
  const digits = limparDigitos(valor);
  return digits.length >= 10;
}

function validarNumero(valor?: string | null) {
  return Boolean(valor && valor.trim());
}

function perfilCompleto(perfil: {
  nome_completo?: string | null;
  cpf?: string | null;
  data_nascimento?: string | null;
  cep?: string | null;
  numero?: string | null;
  telefone?: string | null;
  cidade?: string | null;
  estado?: string | null;
  uso_individual?: boolean | null;
}) {
  if (!perfil.nome_completo?.trim()) return false;
  if (!validarCpf(perfil.cpf)) return false;
  if (!validarData(perfil.data_nascimento)) return false;
  if (!validarCep(perfil.cep)) return false;
  if (!validarNumero(perfil.numero)) return false;
  if (!validarTelefone(perfil.telefone)) return false;
  if (!perfil.cidade?.trim()) return false;
  if (!perfil.estado?.trim()) return false;
  if (typeof perfil.uso_individual !== "boolean") return false;
  return true;
}

function applyTemplate(text: string, vars: Record<string, string>) {
  return text
    .replace(/{{\s*nome\s*}}/gi, vars.nome || "")
    .replace(/{{\s*email\s*}}/gi, vars.email || "")
    .replace(/{{\s*empresa\s*}}/gi, vars.empresa || "");
}

function providerPayloadMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') return '';
  const value = payload as { message?: unknown; error?: unknown; name?: unknown };
  return String(value.message || value.error || value.name || '').slice(0, 240);
}

async function enviarEmailResend(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  fromEmail?: string;
  apiKey?: string;
}) {
  const fromEmail = params.fromEmail;
  const key = params.apiKey;
  if (!key || !fromEmail) {
    return { ok: false, status: "resend_not_configured" };
  }
  const resp = await fetchWithTimeout("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  }, 12_000);
  const data = (await resp.json().catch(() => ({}))) as { id?: string };
  if (!resp.ok) {
    logServerError("[welcome-email] falha no Resend", new Error("Resend provider error"), {
      status: resp.status,
      message: providerPayloadMessage(data),
    });
    return { ok: false, status: String(resp.status), error: data };
  }
  if (!data?.id) {
    logServerError("[welcome-email] Resend sem id de mensagem", new Error("Resend invalid response"), {
      status: resp.status,
      message: providerPayloadMessage(data),
    });
    return { ok: false, status: "resend_invalid_response", error: data };
  }
  return { ok: true, status: String(resp.status), id: data?.id };
}

async function enviarEmailSendGrid(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  fromEmail?: string;
}) {
  return { ok: false, status: "sendgrid_not_implemented" };
}

async function marcarEmailEnviado(userId: string) {
  const adminClient = getAdminClient();
  const { error } = await adminClient
    .from("users")
    .update({ welcome_email_sent: true })
    .eq("id", userId);
  if (error) {
    logServerError("Falha ao marcar welcome_email_sent", error);
  }
}

export const handleWelcomeEmailPost = async (event: RequestEvent) => {
  try {
    const { request, locals } = event;
    const originError = rejectCrossOriginRequest(request);
    if (originError) return originError;
    const payloadError = rejectLargePayload(request, MAX_WELCOME_EMAIL_BODY_BYTES);
    if (payloadError) return payloadError;

    const user = await requireAuthenticatedUser(event);
    const client = locals.supabase;

    const rl = await checkPersistentRateLimit('welcome-email', user.id, { max: 5, windowMs: 60_000 });
    if (!rl.allowed) {
      return json(
        { error: 'Muitas requisicoes. Tente novamente em instantes.' },
        { status: 429, headers: { ...NO_STORE_HEADERS, 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select(
        "id, nome_completo, cpf, data_nascimento, telefone, cep, numero, cidade, estado, uso_individual, email, welcome_email_sent, companies(nome_fantasia)"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (perfilErr) {
      logServerError("[welcome-email] falha ao carregar perfil", perfilErr);
      return errorResponse("Falha ao carregar perfil.", 500);
    }

    if (!perfil) {
      return errorResponse("Usuário não encontrado.", 404);
    }

    if (perfil.welcome_email_sent) {
      return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
    }

    if (!perfilCompleto(perfil)) {
      return errorResponse("Perfil incompleto.", 400);
    }

    let recipientEmail = (perfil.email || user.email || "").trim().toLowerCase();
    if (!recipientEmail) {
      try {
        const adminClient = getAdminClient();
        const authResp = await adminClient.auth.admin.getUserById(user.id);
        recipientEmail = String(authResp.data?.user?.email || "").trim().toLowerCase();
        if (recipientEmail) {
          await client.from("users").update({ email: recipientEmail }).eq("id", user.id);
        }
      } catch (err) {
        logServerError("[welcome-email] falha ao recuperar email via auth admin", err);
      }
    }

    if (!recipientEmail) {
      return errorResponse("Usuário sem e-mail cadastrado.", 400);
    }

    let templateResp = await client
      .from("admin_avisos_templates")
      .select("id, nome, assunto, mensagem, ativo, sender_key")
      .eq("nome", TEMPLATE_NOME)
      .limit(1)
      .maybeSingle();

    if (!templateResp.data) {
      templateResp = await client
        .from("admin_avisos_templates")
        .select("id, nome, assunto, mensagem, ativo, sender_key")
        .eq("assunto", TEMPLATE_ASSUNTO)
        .limit(1)
        .maybeSingle();
    }

    if (templateResp.error) {
      logServerError("[welcome-email] falha ao carregar template", templateResp.error);
      return errorResponse("Falha ao carregar template.", 500);
    }

    const template = templateResp.data;
    if (!template) {
      return errorResponse("Template Bem-Vindo! não encontrado.", 404);
    }
    if (!template.ativo) {
      return errorResponse("Template Bem-Vindo! está inativo.", 400);
    }

    const vars = {
      nome: perfil.nome_completo || "",
      email: recipientEmail,
      empresa: perfil.companies?.[0]?.nome_fantasia || "",
    };

    const subject = applyTemplate(template.assunto, vars);
    const raw = applyTemplate(template.mensagem, vars);
    const text = renderEmailText(raw);
    const html = renderEmailHtml(raw);

    const smtpConfig = await resolveSmtpConfig();
    const fromEmails = (await resolveFromEmails()) || {};
    const resendApiKey = await resolveResendApiKey();

    const senderKey = String(template?.sender_key || "avisos").toLowerCase();
    const fromEmail =
      (senderKey === "financeiro"
        ? fromEmails.financeiro
        : senderKey === "suporte"
          ? fromEmails.suporte
          : senderKey === "admin"
            ? fromEmails.admin
            : fromEmails.avisos) || fromEmails.default || smtpConfig.from;

    const to = [recipientEmail];

    const resendResp = await enviarEmailResend({
      to,
      subject,
      html,
      text,
      fromEmail,
      apiKey: resendApiKey,
    });

    if (resendResp.ok) {
      await marcarEmailEnviado(user.id);
      return json(
        { status: "sent", provider: "resend", id: resendResp.id },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    const sendgridResp = await enviarEmailSendGrid({ to, subject, html, text, fromEmail });
    if (sendgridResp.ok) {
      await marcarEmailEnviado(user.id);
      return json(
        { status: "sent", provider: "sendgrid" },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    return errorResponse("Nenhum provedor de e-mail configurado.", 500);
  } catch (error: unknown) {
    logServerError("[welcome-email] falha ao enviar boas-vindas", error);
    return errorResponse("Erro interno ao enviar e-mail de boas-vindas.", 500);
  }
};
