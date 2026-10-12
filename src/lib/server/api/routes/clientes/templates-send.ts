// Migrado para Hono de src/routes/api/v1/clientes/templates/send/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from "@sveltejs/kit";
import {
  ensureModuloAccess,
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse,
} from "$lib/server/v1";
import { fetchWithTimeout } from "$lib/server/fetchWithTimeout";
import { escapeHtml } from "$lib/utils/html";
import { env } from "$env/dynamic/private";
import { NO_STORE_HEADERS } from "$lib/server/httpCache";
import { checkPersistentRateLimit } from "$lib/server/persistentRateLimit";
import { readJsonBodyLimited, rejectCrossOriginRequest } from "$lib/server/requestGuards";
import { resolveThemeAssetMeta } from "$lib/cards/themeAssetMeta";

const MAX_CLIENTE_TEMPLATE_SEND_BODY_BYTES = 128 * 1024;

type Body = {
  clienteId?: string;
  templateId?: string;
  canal?: "email" | "whatsapp";
  nomeDestinatario?: string;
  emailDestinatario?: string;
  themeId?: string | null;
  subject?: string | null;
  mensagem?: string | null;
  footerLead?: string | null;
  textColor?: string | null;
  textOffsetX?: number | string | null;
  textOffsetY?: number | string | null;
};

type MessageTemplateRow = {
  id: string;
  user_id: string | null;
  company_id: string | null;
  scope: string | null;
  nome: string | null;
  assunto: string | null;
  titulo: string | null;
  corpo: string | null;
  assinatura: string | null;
  ativo: boolean | null;
  theme_id: string | null;
  title_style: unknown;
  body_style: unknown;
  signature_style: unknown;
};

type PlainObject = Record<string, unknown>;

type ThemeSelectionRow = {
  id: string;
  user_id: string | null;
  company_id: string | null;
  scope: string | null;
  nome: string | null;
  asset_url?: string | null;
  storage_path?: string | null;
};


type ScopeValue = "system" | "master" | "gestor" | "user";

function normalizeScope(value?: string | null): ScopeValue {
  const scope = String(value || "")
    .trim()
    .toLowerCase();
  if (
    scope === "system" ||
    scope === "master" ||
    scope === "gestor" ||
    scope === "user"
  )
    return scope;
  return "system";
}

function inCompany(companyId: string | null, allowed: Set<string>) {
  const key = String(companyId || "").trim();
  return key ? allowed.has(key) : false;
}

function canAccessScopedRow(params: {
  isAdmin: boolean;
  userId: string;
  companyIds: Set<string>;
  rowUserId?: string | null;
  rowCompanyId?: string | null;
  rowScope?: string | null;
}) {
  const { isAdmin, userId, companyIds, rowUserId, rowCompanyId, rowScope } =
    params;
  if (isAdmin) return true;
  if (String(rowUserId || "") === userId) return true;
  const scope = normalizeScope(rowScope);
  if (scope === "system") return true;
  if (scope === "user") return false;
  return inCompany(rowCompanyId || null, companyIds);
}

function isPlainObject(value: unknown): value is PlainObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isEmailLike(value?: string | null) {
  const raw = String(value || "").trim();
  return raw.includes("@") ? raw : "";
}

function looksLikeResendSmtpCompat(settings?: PlainObject | null) {
  const host = String(settings?.smtp_host || "")
    .trim()
    .toLowerCase();
  const user = String(settings?.smtp_user || "")
    .trim()
    .toLowerCase();
  return host === "smtp.resend.com" && user === "resend";
}

function parseBodyOffset(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-240, Math.min(240, Math.round(parsed)));
}

function extractSignatureTextConfig(signatureStyle?: unknown) {
  const content =
    isPlainObject(signatureStyle) && isPlainObject(signatureStyle.content)
      ? signatureStyle.content
      : null;
  const hasFooterLead =
    !!content && Object.prototype.hasOwnProperty.call(content, "footerLead");
  const hasConsultantRole =
    !!content &&
    Object.prototype.hasOwnProperty.call(content, "consultantRole");

  return {
    footerLead: String(content?.footerLead || "").trim(),
    consultantRole: String(content?.consultantRole || "").trim(),
    hasFooterLead,
    hasConsultantRole,
  };
}

async function enviarEmailResend(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  fromEmail?: string;
  apiKey?: string;
}) {
  if (!params.apiKey || !params.fromEmail) {
    return { ok: false, status: "resend_not_configured" };
  }
  const resp = await fetchWithTimeout("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.fromEmail,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  }, 12_000);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.id) {
    return {
      ok: false,
      status: String(resp.status || "resend_error"),
      error: data,
    };
  }
  return { ok: true, status: String(resp.status), id: data.id };
}

async function enviarEmailSendGrid(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  fromEmail?: string;
}) {
  const SENDGRID_API_KEY = env.SENDGRID_API_KEY;
  const SENDGRID_FROM_EMAIL = env.SENDGRID_FROM_EMAIL;
  const ALERTA_FROM_EMAIL = env.ALERTA_FROM_EMAIL;
  const fromEmail =
    params.fromEmail || SENDGRID_FROM_EMAIL || ALERTA_FROM_EMAIL;
  if (!SENDGRID_API_KEY || !fromEmail) {
    return { ok: false, status: "sendgrid_not_configured" };
  }
  const personalizations = params.to.map((dest) => ({ to: [{ email: dest }] }));
  const resp = await fetchWithTimeout("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations,
      from: { email: fromEmail },
      subject: params.subject,
      content: [
        { type: "text/plain", value: params.text },
        { type: "text/html", value: params.html },
      ],
    }),
  }, 12_000);
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    return {
      ok: false,
      status: String(resp.status || "sendgrid_error"),
      error: errText,
    };
  }
  return { ok: true, status: String(resp.status || 202) };
}

async function enviarEmailSMTP(
  params: { to: string[]; subject: string; html: string; text: string },
  smtpConfig: {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
    from?: string;
  },
  fromEmail?: string,
) {
  if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
    return { ok: false, status: "smtp_not_configured" };
  }
  return { ok: false, status: "smtp_not_supported" };
}

export const handleClientesTemplatesSendPost = async (event: RequestEvent) => {
  try {
    const { request, url } = event;
    const originError = rejectCrossOriginRequest(request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(request, MAX_CLIENTE_TEMPLATE_SEND_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const userScope = await resolveUserScope(client, user.id);
    const isAdmin = Boolean(userScope.isAdmin);
    const companyIds = new Set<string>();
    if (userScope.companyId) companyIds.add(String(userScope.companyId));
    if (userScope.papel === "MASTER") {
      const { data: vinculos } = await client
        .from("master_empresas")
        .select("company_id, status")
        .eq("master_id", user.id);
      for (const row of vinculos || []) {
        const status = String(row?.status || "").toLowerCase();
        const companyId = String(row?.company_id || "").trim();
        if (!companyId || status === "rejected") continue;
        companyIds.add(companyId);
      }
    }
    const dataClient = client;

    const body =
      bodyResult.data && typeof bodyResult.data === "object"
        ? (bodyResult.data as Body)
        : ({} as Body);

    const templateId = String(body.templateId || "").trim();
    const clienteId = String(body.clienteId || "").trim();
    const canal = body.canal || "email";
    if (!templateId || !clienteId)
      return json(
        { error: "templateId e clienteId sao obrigatorios." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    if (canal !== "email")
      return json({ error: "Canal invalido para esta rota." }, { status: 400, headers: NO_STORE_HEADERS });

    const { data: userRow } = await client
      .from("users")
      .select("id, nome_completo")
      .eq("id", user.id)
      .maybeSingle();
    const { data: brandingRow } = await client
      .from("quote_print_settings")
      .select("consultor_nome")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    const assinaturaPadrao = String(
      brandingRow?.consultor_nome ||
        userRow?.nome_completo ||
        user.user_metadata?.name ||
        "",
    ).trim();

    const { data: templateRow, error: tplErr } = await dataClient
      .from("user_message_templates")
      .select(
        "id, user_id, company_id, scope, nome, assunto, titulo, corpo, assinatura, ativo, theme_id, title_style, body_style, signature_style",
      )
      .eq("id", templateId)
      .maybeSingle();
    if (tplErr || !templateRow)
      return json({ error: "Template nao encontrado." }, { status: 404, headers: NO_STORE_HEADERS });
    const tpl = templateRow as MessageTemplateRow;
    if (
      !canAccessScopedRow({
        isAdmin,
        userId: user.id,
        companyIds,
        rowUserId: tpl.user_id || null,
        rowCompanyId: tpl.company_id || null,
        rowScope: tpl.scope || null,
      })
    ) {
      return json({ error: "Template nao encontrado." }, { status: 404, headers: NO_STORE_HEADERS });
    }
    if (!tpl.ativo)
      return json({ error: "Template inativo." }, { status: 400, headers: NO_STORE_HEADERS });

    const nomeDestinatario =
      String(body.nomeDestinatario || "").trim() || "Cliente";
    const emailDestinatario = String(body.emailDestinatario || "")
      .trim()
      .toLowerCase();
    if (!emailDestinatario)
      return json({ error: "Destinatario sem e-mail." }, { status: 400, headers: NO_STORE_HEADERS });

    const assinatura = tpl.assinatura || assinaturaPadrao;
    const assuntoPadrao = String(
      tpl.assunto || tpl.titulo || tpl.nome || "Aviso",
    );
    const origin = url.origin;
    const requestedThemeId = String(body.themeId || "").trim();
    const selectedThemeId =
      requestedThemeId || String(tpl.theme_id || "").trim();
    let selectedTheme: ThemeSelectionRow | null = null;
    if (selectedThemeId) {
      let themeResp = await client
        .from("user_message_template_themes")
        .select("id, user_id, company_id, scope, nome, asset_url, storage_path")
        .eq("id", selectedThemeId)
        .maybeSingle();
      const { data: themeRow, error: themeError } = themeResp;
      if (themeError) throw themeError;
      if (
        themeRow &&
        canAccessScopedRow({
          isAdmin,
          userId: user.id,
          companyIds,
          rowUserId: themeRow.user_id,
          rowCompanyId: themeRow.company_id,
          rowScope: themeRow.scope,
        })
      ) {
        selectedTheme = themeRow as ThemeSelectionRow;
      }
    }
    const textOffsetX = parseBodyOffset(body.textOffsetX);
    const textOffsetY = parseBodyOffset(body.textOffsetY);
    const signatureTextConfig = extractSignatureTextConfig(tpl.signature_style);

    const cardParams = new URLSearchParams({
      theme_name: "",
      nome: nomeDestinatario,
      titulo: String(tpl.titulo || ""),
      corpo: String(body.mensagem || tpl.corpo || tpl.titulo || tpl.nome || ""),
      assinatura,
      style_overrides: "{}",
      v: String(Date.now()),
    });
    if (selectedTheme) {
      const themeAsset = resolveThemeAssetMeta(selectedTheme);
      cardParams.set("theme_name", String(selectedTheme.nome || ""));
      if (themeAsset.asset_url) cardParams.set("theme_asset_url", themeAsset.asset_url);
    }

    const cardUrlPng = `${origin}/api/v1/cards/render.png?${cardParams.toString()}`;
    const cardUrlSvg = `${origin}/api/v1/cards/render.svg?${cardParams.toString()}`;

    const corpo = [
      String(body.mensagem || tpl.corpo || ""),
      assinatura,
      `Cartao PNG: ${cardUrlPng}`,
      `Cartao SVG: ${cardUrlSvg}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const text = corpo;
    const html = `<pre>${escapeHtml(corpo)}</pre>`;

    const ALERTA_FROM_EMAIL = env.ALERTA_FROM_EMAIL;
    const fromEmail = ALERTA_FROM_EMAIL || "noreply@vtur.com.br";

    const rl = await checkPersistentRateLimit(
      "email-template-send",
      user.id,
      { max: 10, windowMs: 60_000 },
    );
    if (!rl.allowed) {
      return json(
        { error: "Muitas requisicoes de envio de e-mail. Tente novamente em instantes." },
        { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(rl.retryAfterSeconds) } },
      );
    }

    let sentProvider: "resend" | "sendgrid" | "smtp" | null = null;

    const resendResp = await enviarEmailResend({
      to: [emailDestinatario],
      subject: String(body.subject || assuntoPadrao),
      html,
      text,
      fromEmail,
      apiKey: env.RESEND_API_KEY,
    });
    if (resendResp.ok) {
      sentProvider = "resend";
    } else {
      const sendgridResp = await enviarEmailSendGrid({
        to: [emailDestinatario],
        subject: String(body.subject || assuntoPadrao),
        html,
        text,
        fromEmail,
      });
      if (sendgridResp.ok) {
        sentProvider = "sendgrid";
      } else {
        const smtpResp = await enviarEmailSMTP(
          {
            to: [emailDestinatario],
            subject: String(body.subject || assuntoPadrao),
            html,
            text,
          },
          {},
          fromEmail,
        );
        if (smtpResp.ok) {
          sentProvider = "smtp";
        } else {
          return json(
            {
              status: "failed",
              message:
                "Falha no envio de e-mail. Verifique as configuracoes de provider.",
              providers: {
                resend: resendResp.status,
                sendgrid: sendgridResp.status,
                smtp: smtpResp.status,
              },
            },
            { status: 200, headers: NO_STORE_HEADERS },
          );
        }
      }
    }

    return json({ status: "sent", provider: sentProvider, clienteId }, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    return toErrorResponse(e, "Erro ao enviar template.");
  }
};
