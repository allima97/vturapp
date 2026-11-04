import { createAuth } from "$lib/auth";
import { NO_STORE_HEADERS } from "$lib/server/httpCache";
import { checkPersistentRateLimit } from "$lib/server/persistentRateLimit";
import {
  readJsonBodyLimited,
  rejectCrossOriginRequest,
} from "$lib/server/requestGuards";
import { verifyTurnstileToken } from "$lib/server/turnstile";
import { logServerError } from "$lib/server/v1";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

const MAX_LOGIN_BODY_BYTES = 8 * 1024;

function readLoginBody(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  return {
    email: typeof body.email === "string" ? body.email : undefined,
    password: typeof body.password === "string" ? body.password : undefined,
    turnstile_token:
      typeof body.turnstile_token === "string"
        ? body.turnstile_token
        : undefined,
    turnstileToken:
      typeof body.turnstileToken === "string" ? body.turnstileToken : undefined,
  };
}

function applyAuthCookies(
  response: Response,
  cookies: Parameters<RequestHandler>[0]["cookies"],
) {
  const rows =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  for (const raw of rows) {
    const [pair, ...attrs] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq < 1) continue;
    const name = pair.slice(0, eq).trim();
    const value = decodeURIComponent(pair.slice(eq + 1).trim());
    const options: {
      path: string;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: "lax" | "strict" | "none";
      maxAge?: number;
    } = { path: "/" };
    for (const attr of attrs) {
      const [key, rawValue] = attr.trim().split("=");
      const normalized = key.toLowerCase();
      if (normalized === "httponly") options.httpOnly = true;
      else if (normalized === "secure") options.secure = true;
      else if (normalized === "samesite")
        options.sameSite = rawValue?.toLowerCase() as "lax";
      else if (normalized === "max-age") options.maxAge = Number(rawValue);
    }
    cookies.set(name, value, options);
  }
}

export const POST: RequestHandler = async ({
  request,
  cookies,
  getClientAddress,
  platform,
  url,
}) => {
  try {
    const originError = rejectCrossOriginRequest(request, "Origem inválida.");
    if (originError) return originError;

    let remoteIp: string | null = null;
    try {
      remoteIp = getClientAddress();
    } catch {
      remoteIp = null;
    }

    const bodyResult = await readJsonBodyLimited(request, MAX_LOGIN_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;
    const body = readLoginBody(bodyResult.data);
    if (!body?.email || !body.password) {
      return json(
        { error: "Email e senha obrigatorios." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const rateLimit = await checkPersistentRateLimit(
      "auth-login",
      `${remoteIp || "unknown"}:${body.email.toLowerCase()}`,
      { max: 12, windowMs: 60_000 },
      platform?.env?.DB,
    );
    if (!rateLimit.allowed) {
      return json(
        { error: "Muitas tentativas de login. Tente novamente em instantes." },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    const turnstile = await verifyTurnstileToken(
      String(body.turnstile_token || body.turnstileToken || "").trim(),
      remoteIp,
    );
    if (!turnstile.ok) {
      return json(
        { error: turnstile.message, codes: turnstile.codes ?? [] },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    if (!platform?.env?.DB || !platform.env.BETTER_AUTH_SECRET) {
      return json(
        { error: "Autenticacao indisponivel." },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    const auth = createAuth(
      platform.env.DB,
      platform.env.BETTER_AUTH_SECRET,
      url.origin,
      platform.env.RESEND_API_KEY,
    );
    const response = await auth.api.signInEmail({
      body: { email: body.email.trim(), password: body.password },
      headers: request.headers,
      asResponse: true,
    });
    if (!response.ok) {
      return json(
        { error: "Email ou senha incorretos." },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }
    applyAuthCookies(response, cookies);
    const payload = (await response.json()) as {
      token?: string;
      user?: { id: string; email: string; name?: string };
    };
    const user = payload.user
      ? {
          id: payload.user.id,
          email: payload.user.email,
          aud: "authenticated",
          role: "authenticated",
        }
      : null;
    return json(
      {
        user,
        session: user
          ? {
              access_token: payload.token || "cookie",
              refresh_token: "cookie",
              user,
            }
          : null,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    logServerError("[auth/login] falha", err);
    return json(
      { error: "Erro ao fazer login." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
};
