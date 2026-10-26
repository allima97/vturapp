// Migrado para Hono de src/routes/api/v1/convites/send/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAdminClient, isUuid, logServerError, requireAuthenticatedUser, resolveUserScope } from '$lib/server/v1';
import { renderEmailHtml, renderEmailText } from '$lib/server/emailMarkdown';
import { buildFromEmails, resolveFromEmails, resolveResendApiKey } from '$lib/server/emailSettings';
import { fetchWithTimeout } from '$lib/server/fetchWithTimeout';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_CONVITE_SEND_BODY_BYTES = 64 * 1024;
const TITLE_CASE_SMALL_WORDS = new Set(["de", "da", "do", "dos", "das", "e", "o", "a", "os", "as", "um", "uma", "uns", "umas"]);

type IdRow = { id?: string | null };
type UserTypeNameRow = { name?: string | null };
type UserProfileNameRow = IdRow & { nome_completo?: string | null };
type CompanyNameRow = { nome_fantasia?: string | null };
type SharedGestorRow = { gestor_base_id?: string | null };
type AuthLinkData = {
  properties?: { action_link?: string | null } | null;
  user?: { id?: string | null } | null;
};
type InvitePayload = {
  invited_user_id?: string | null;
  invited_email?: string;
  company_id?: string | null;
  user_type_id?: string;
  invited_by?: string;
  invited_by_role?: "ADMIN" | "MASTER" | "GESTOR";
  uso_individual?: boolean;
  status?: "pending";
  expires_at?: string;
  cancelled_at?: string | null;
};
type UserUpdatePayload = {
  email: string;
  nome_completo?: string;
  active?: boolean;
  created_by_gestor?: boolean;
};
type GestorVendedorPayload = {
  gestor_id: string;
  vendedor_id: string;
  ativo: boolean;
};
type EmailDeliveryResult =
  | { ok: true; status: string; id?: string }
  | { ok: false; status: string; error?: unknown };

function noStoreJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) headers.set(key, value);
  return json(data, { ...init, headers });
}

function titleCaseWithExceptions(input: string): string {
  if (!input) return "";
  const words = input.split(/\s+/);
  return words
    .map((word, idx) => {
      if (!word) return "";
      const isSmall = TITLE_CASE_SMALL_WORDS.has(word.toLowerCase());
      const isFirst = idx === 0;
      if (isFirst || !isSmall) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word.toLowerCase();
    })
    .join(" ");
}

function readErrorField(error: unknown, field: string) {
  return error && typeof error === "object"
    ? (error as Record<string, unknown>)[field]
    : undefined;
}

function errorMessage(error: unknown) {
  return String(readErrorField(error, "message") || error || "");
}

function isTableMissing(error: unknown) {
  const code = String(readErrorField(error, "code") || "");
  const message = errorMessage(error).toLowerCase();
  return code === "42P01" || message.includes("does not exist");
}

function isMissingColumn(error: unknown, column: string) {
  const code = String(readErrorField(error, "code") || "");
  const message = errorMessage(error).toLowerCase();
  return code === "42703" && message.includes(column.toLowerCase());
}

function isAuthAlreadyRegisteredError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("already exists") ||
    message.includes("user already registered")
  );
}

function providerPayloadMessage(payload: unknown) {
  if (!payload) return "";
  if (typeof payload === "string") return payload.slice(0, 240);
  const errorsValue = readErrorField(payload, "errors");
  const errors = Array.isArray(errorsValue)
    ? errorsValue
        .map((item: unknown) =>
          readErrorField(item, "message") || readErrorField(item, "field") || readErrorField(item, "help")
        )
        .filter(Boolean)
        .join("; ")
    : "";
  return String(
    readErrorField(payload, "message") ||
      readErrorField(payload, "error") ||
      readErrorField(payload, "name") ||
      errors ||
      ""
  ).slice(0, 240);
}

function providerErrorStatus(provider: string, status?: string | number, payload?: unknown) {
  const detail = providerPayloadMessage(payload);
  return detail ? `${provider}:${status || "erro"}:${detail}` : `${provider}:${status || "erro"}`;
}

function readAuthLinkData(data: unknown) {
  const linkData = data as AuthLinkData | null;
  return {
    actionLink: String(linkData?.properties?.action_link || ""),
    authUserId: String(linkData?.user?.id || "") || null
  };
}

async function getUserTypeNameById(client: ReturnType<typeof getAdminClient>, userTypeId: string) {
  const { data, error } = await client
    .from("user_types")
    .select("name")
    .eq("id", userTypeId)
    .maybeSingle();
  if (error) throw error;
  return String((data as UserTypeNameRow | null)?.name || "").toUpperCase();
}

async function isRestrictedUserType(client: ReturnType<typeof getAdminClient>, userTypeId: string) {
  const nome = await getUserTypeNameById(client, userTypeId);
  return nome.includes("ADMIN") || nome.includes("MASTER");
}

async function masterCanAccessCompany(client: ReturnType<typeof getAdminClient>, masterId: string, companyId: string) {
  const { data, error } = await client
    .from("master_empresas")
    .select("id")
    .eq("master_id", masterId)
    .eq("company_id", companyId)
    .neq("status", "rejected")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function enviarEmailResend(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  fromEmail?: string;
  apiKey?: string;
}): Promise<EmailDeliveryResult> {
  const fromEmail = params.fromEmail;
  const key = params.apiKey;
  if (!key || !fromEmail) {
    return { ok: false, status: "resend_not_configured" };
  }
  let resp: Response;
  try {
    resp = await fetchWithTimeout("https://api.resend.com/emails", {
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
  } catch (err: unknown) {
    logServerError("[convites/send] excecao no Resend", err);
    return {
      ok: false,
      status: readErrorField(err, "name") === "AbortError" ? "resend_timeout" : "resend_exception",
      error: readErrorField(err, "message") || err
    };
  }
  const data = (await resp.json().catch(() => ({}))) as { id?: string };
  if (!resp.ok) {
    logServerError("[convites/send] falha no Resend", new Error("Resend provider error"), {
      status: resp.status,
      message: providerPayloadMessage(data)
    });
    return { ok: false, status: String(resp.status), error: data };
  }
  if (!data?.id) {
    logServerError("[convites/send] Resend sem id de mensagem", new Error("Resend invalid response"), {
      status: resp.status,
      message: providerPayloadMessage(data)
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
}): Promise<EmailDeliveryResult> {
  const apiKey = String(env.SENDGRID_API_KEY || "").trim();
  const fromEmail = params.fromEmail || env.SENDGRID_FROM_EMAIL || env.ALERTA_FROM_EMAIL || env.ADMIN_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return { ok: false, status: "sendgrid_not_configured" };
  }

  let resp: Response;
  try {
    resp = await fetchWithTimeout("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: params.to.map((dest) => ({ to: [{ email: dest }] })),
        from: { email: fromEmail },
        subject: params.subject,
        content: [
          { type: "text/plain", value: params.text },
          { type: "text/html", value: params.html },
        ],
      }),
    }, 12_000);
  } catch (err: unknown) {
    logServerError("[convites/send] excecao no SendGrid", err);
    return {
      ok: false,
      status: readErrorField(err, "name") === "AbortError" ? "sendgrid_timeout" : "sendgrid_exception",
      error: readErrorField(err, "message") || err
    };
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    logServerError("[convites/send] falha no SendGrid", new Error("SendGrid provider error"), {
      status: resp.status,
      message: providerPayloadMessage(errText),
    });
    return { ok: false, status: String(resp.status || "sendgrid_error"), error: errText };
  }

  return { ok: true, status: String(resp.status || 202) };
}

export const handleConvitesSendPost = async (event: RequestEvent) => {
  try {
    const { request } = event;
    const originError = rejectCrossOriginRequest(request);
    if (originError) return originError;

    const user = await requireAuthenticatedUser(event);
    const adminClient = getAdminClient();

    const rl = await checkPersistentRateLimit('convites-send', user.id, { max: 10, windowMs: 60_000 });
    if (!rl.allowed) {
      return noStoreJson(
        { error: 'Muitas requisicoes. Tente novamente em instantes.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const bodyResult = await readJsonBodyLimited(request, MAX_CONVITE_SEND_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.data && typeof bodyResult.data === 'object'
      ? (bodyResult.data as Record<string, unknown>)
      : {};
    const email = String(body.email || "").trim().toLowerCase();
    const companyId = String(body.company_id || "").trim();
    const userTypeId = String(body.user_type_id || "").trim();
    const nomeCompletoRaw = String(body.nome_completo || "").trim();
    const activeRaw = body.active;
    const usoIndividual = Boolean(body.uso_individual);

    if (!email) return noStoreJson({ error: "E-mail e obrigatorio." }, { status: 400 });
    if (!usoIndividual && !companyId) return noStoreJson({ error: "Empresa e obrigatoria." }, { status: 400 });
    if (!userTypeId) return noStoreJson({ error: "Cargo e obrigatorio." }, { status: 400 });
    if (!usoIndividual && !isUuid(companyId)) return noStoreJson({ error: "Empresa invalida." }, { status: 400 });
    if (!isUuid(userTypeId)) return noStoreJson({ error: "Cargo invalido." }, { status: 400 });

    const scope = await resolveUserScope(adminClient, user.id);
    if (!scope.isAdmin && !scope.isMaster && !scope.isGestor) {
      return noStoreJson({ error: "Sem permissao para enviar convites." }, { status: 403 });
    }

    if (!scope.isAdmin) {
      if (usoIndividual) {
        return noStoreJson({ error: "Somente ADMIN pode convidar usuario de uso individual." }, { status: 403 });
      }

      if (await isRestrictedUserType(adminClient, userTypeId)) {
        return noStoreJson({ error: "Tipo de usuario nao permitido." }, { status: 403 });
      }
    }

    const tipoNome = await getUserTypeNameById(adminClient, userTypeId);
    if (usoIndividual && tipoNome.includes("FINANCEIRO")) {
      return noStoreJson(
        { error: "Usuario financeiro deve ser corporativo e vinculado a empresa." },
        { status: 400 }
      );
    }

    if (scope.isMaster && !usoIndividual) {
      const podeAcessar =
        (scope.companyId && scope.companyId === companyId) ||
        (await masterCanAccessCompany(adminClient, user.id, companyId));
      if (!podeAcessar) return noStoreJson({ error: "Empresa fora do seu portfolio." }, { status: 403 });
    }

    if (scope.isGestor && !usoIndividual) {
      if (!scope.companyId || scope.companyId !== companyId) {
        return noStoreJson({ error: "Gestor so pode convidar usuarios da propria empresa." }, { status: 403 });
      }
      if (!tipoNome.includes("VENDEDOR")) {
        return noStoreJson({ error: "Gestor so pode convidar usuarios do tipo VENDEDOR." }, { status: 403 });
      }
    }

    const invitedByRole = scope.isAdmin
      ? "ADMIN"
      : scope.isMaster
        ? "MASTER"
        : "GESTOR";

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    let existingInviteQuery = adminClient
      .from("user_convites")
      .select("id, status")
      .eq("uso_individual", usoIndividual)
      .ilike("invited_email", email)
      .eq("status", "pending")
      .limit(1);

    existingInviteQuery = usoIndividual
      ? existingInviteQuery.is("company_id", null)
      : existingInviteQuery.eq("company_id", companyId);

    const { data: existingInvite, error: existingErr } = await existingInviteQuery.maybeSingle();

    if (existingErr) {
      if (isTableMissing(existingErr)) {
        return noStoreJson(
          { error: "Tabela public.user_convites nao existe. Aplique a migration." },
          { status: 500 }
        );
      }
      throw existingErr;
    }

    let inviteId = String((existingInvite as IdRow | null)?.id || "");
    if (inviteId) {
      const inviteUpdatePayload: InvitePayload = {
        company_id: usoIndividual ? null : companyId,
        user_type_id: userTypeId,
        invited_by: user.id,
        invited_by_role: invitedByRole,
        uso_individual: usoIndividual,
        expires_at: expiresAt,
        cancelled_at: null,
      };
      const { error: updateErr } = await adminClient
        .from("user_convites")
        .update(inviteUpdatePayload)
        .eq("id", inviteId);
      if (updateErr) {
        if (isMissingColumn(updateErr, "expires_at")) {
          return noStoreJson(
            { error: "Coluna public.user_convites.expires_at ausente. Aplique a migration." },
            { status: 500 }
          );
        }
        throw updateErr;
      }
    } else {
      const inviteInsertPayload: InvitePayload = {
        invited_user_id: null,
        invited_email: email,
        company_id: usoIndividual ? null : companyId,
        user_type_id: userTypeId,
        invited_by: user.id,
        invited_by_role: invitedByRole,
        uso_individual: usoIndividual,
        status: "pending",
        expires_at: expiresAt,
      };
      const { data: createdInvite, error: insertErr } = await adminClient
        .from("user_convites")
        .insert(inviteInsertPayload)
        .select("id")
        .single();
      if (insertErr) {
        if (isMissingColumn(insertErr, "expires_at")) {
          return noStoreJson(
            { error: "Coluna public.user_convites.expires_at ausente. Aplique a migration." },
            { status: 500 }
          );
        }
        throw insertErr;
      }
      inviteId = String((createdInvite as IdRow | null)?.id || "");
    }

    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/auth/convite?invite=${encodeURIComponent(inviteId)}`;

    let actionLink = "";
    let authUserId: string | null = null;

    try {
      const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo },
      });

      if (inviteErr && isAuthAlreadyRegisteredError(inviteErr)) {
        const { data: magicData, error: magicErr } = await adminClient.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo },
        });
        if (magicErr) throw magicErr;
        ({ actionLink, authUserId } = readAuthLinkData(magicData));
      } else {
        if (inviteErr) throw inviteErr;
        ({ actionLink, authUserId } = readAuthLinkData(inviteData));
      }
    } catch (err: unknown) {
      logServerError("[convites/send] falha ao gerar link de convite", err);
      return noStoreJson({ error: "Falha ao gerar link de convite." }, { status: 500 });
    }

    if (!actionLink) {
      return noStoreJson({ error: "Falha ao gerar link de convite." }, { status: 500 });
    }

    if (authUserId) {
      const { data: profileRow } = await adminClient
        .from("users")
        .select("id, nome_completo")
        .eq("id", authUserId)
        .maybeSingle();
      if (profileRow?.id) {
        await adminClient
          .from("user_convites")
          .update({ invited_user_id: authUserId } satisfies InvitePayload)
          .eq("id", inviteId);

        const updates: UserUpdatePayload = { email };
        const normalizedNome = titleCaseWithExceptions(nomeCompletoRaw);
        if (normalizedNome && !String((profileRow as UserProfileNameRow | null)?.nome_completo || "").trim()) {
          updates.nome_completo = normalizedNome;
        }
        if (typeof activeRaw === "boolean") {
          updates.active = activeRaw;
        }
        if (scope.isGestor) {
          updates.created_by_gestor = true;
        }
        if (Object.keys(updates).length > 0) {
          await adminClient.from("users").update(updates).eq("id", authUserId);
        }
      }
    }

    let companyName = "uso individual";
    if (!usoIndividual) {
      const { data: companyRow } = await adminClient
        .from("companies")
        .select("nome_fantasia")
        .eq("id", companyId)
        .maybeSingle();
      companyName = String((companyRow as CompanyNameRow | null)?.nome_fantasia || "sua empresa");
    }

    const roleName = tipoNome;

    const raw = [
      `Voce recebeu um convite para acessar o vtur (${companyName}).`,
      roleName ? `Cargo: ${roleName}.` : "",
      "",
      "Clique no link abaixo para definir sua senha e concluir o acesso (expira em 1 hora):",
      actionLink,
      "",
      "Se voce nao reconhece este convite, ignore este e-mail.",
    ]
      .filter(Boolean)
      .join("\n");

    const subject = `Convite de acesso - ${companyName}`;
    const text = renderEmailText(raw);
    const html = renderEmailHtml(raw);

    const fromEmails = await resolveFromEmails();
    const resendApiKey = await resolveResendApiKey();
    const fromEmail = fromEmails.avisos || fromEmails.default;

    const to = [email];
    const resendResp = await enviarEmailResend({
      to,
      subject,
      html,
      text,
      fromEmail,
      apiKey: resendApiKey,
    });
    if (!resendResp.ok) {
      const sendgridResp = await enviarEmailSendGrid({ to, subject, html, text, fromEmail });
      if (!sendgridResp.ok) {
        return noStoreJson(
          {
            error: "Convite criado, mas falha ao enviar e-mail. Verifique a chave do Resend/SendGrid e o remetente configurado.",
            delivery: {
              resend: providerErrorStatus("resend", resendResp.status, resendResp.error),
              sendgrid: providerErrorStatus("sendgrid", sendgridResp.status, sendgridResp.error),
            },
          },
          { status: 500 }
        );
      }
    }

    if (scope.isGestor && authUserId) {
      try {
        let gestorEquipeId = user.id;
        const { data: sharedRow, error: sharedErr } = await adminClient
          .from("gestor_equipe_compartilhada")
          .select("gestor_base_id")
          .eq("gestor_id", user.id)
          .maybeSingle();
        const sharedGestorBaseId = (sharedRow as SharedGestorRow | null)?.gestor_base_id;
        if (!sharedErr && sharedGestorBaseId) {
          gestorEquipeId = String(sharedGestorBaseId);
        }

        await adminClient
          .from("gestor_vendedor")
          .delete()
          .eq("gestor_id", gestorEquipeId)
          .eq("vendedor_id", authUserId);
        await adminClient
          .from("gestor_vendedor")
          .insert({ gestor_id: gestorEquipeId, vendedor_id: authUserId, ativo: true } satisfies GestorVendedorPayload);
      } catch (relErr) {
        logServerError("[convites/send] falha ao pre-atribuir vendedor na equipe", relErr);
      }
    }

    return noStoreJson(
      {
        id: inviteId,
        expires_at: expiresAt,
      }
    );
  } catch (error: unknown) {
    logServerError("[convites/send] falha ao enviar convite", error);
    return noStoreJson({ error: "Erro interno ao enviar convite." }, { status: 500 });
  }
};
