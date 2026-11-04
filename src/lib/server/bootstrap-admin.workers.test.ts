/// <reference types="@cloudflare/vitest-pool-workers" />
/// <reference path="../testing/request-store.d.ts" />

import { applyD1Migrations, env } from "cloudflare:test";
import { isRedirect } from "@sveltejs/kit";
import { with_request_store } from "$test/request-store";
import { beforeAll, describe, expect, it } from "vitest";
import { MAPA_MODULOS } from "$lib/config/modulos";
import { createAuth as createRealAuth } from "../auth";
import { resolveAuthContext } from "$lib/server/auth/context";
import { getDataClient, runWithDataContext } from "$lib/server/data";
import { handle } from "../../hooks.server";
import { POST } from "../../routes/api/auth/login/+server";
import {
  BootstrapRefused,
  applyBootstrap,
} from "../../../scripts/bootstrap-admin-lib.mjs";

const SECRET = "bootstrap-test-secret-32chars-minimo";
const RESEND = "re_test_espelha_staging";
const EMAIL = "admin@vtur.com.br";
const PASSWORD = "senha-de-teste-admin-16";
const ORIGIN = "http://localhost";

describe("bootstrap do primeiro administrador", () => {
  let userId = "";
  let accessToken = "";

  beforeAll(async () => {
    const migrations = (
      env as unknown as {
        TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
      }
    ).TEST_MIGRATIONS;
    await applyD1Migrations(env.DB, migrations);
    const created = await applyBootstrap(env.DB, {
      email: EMAIL,
      password: PASSWORD,
      name: "Administrador VTUR",
      modules: Object.values(MAPA_MODULOS),
    });
    userId = created.userId;
    const signedIn = await login(PASSWORD);
    expect(signedIn.response.status, signedIn.text).toBe(200);
    const row = await env.DB.prepare(
      "SELECT token FROM session WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
    )
      .bind(userId)
      .first<{ token: string }>();
    accessToken = String(row?.token || "");
    expect(accessToken).not.toBe("");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }, 120_000);

  async function login(password: string) {
    const jar = new Map<string, string>();
    const request = new Request(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
      },
      body: JSON.stringify({ email: EMAIL, password }),
    });
    const response = await POST({
      request,
      url: new URL(request.url),
      cookies: {
        get: (name: string) => jar.get(name),
        set: (name: string, value: string) => {
          jar.set(name, value);
        },
        delete: (name: string) => {
          jar.delete(name);
        },
      },
      getClientAddress: () => "127.0.0.1",
      platform: {
        env: {
          DB: env.DB,
          BETTER_AUTH_SECRET: SECRET,
          RESEND_API_KEY: RESEND,
        },
      },
    } as unknown as Parameters<typeof POST>[0]);
    const text = await response.text();
    return { response, text, jar };
  }

  it("entra por /api/auth/login com o hash compativel e sem 2FA", async () => {
    const { response, text, jar } = await login(PASSWORD);
    expect(response.status, text).toBe(200);
    expect(text).not.toContain(PASSWORD);
    const payload = JSON.parse(text) as {
      user?: { email?: string };
      session?: { access_token?: string };
      twoFactorRedirect?: boolean;
    };
    expect(payload.twoFactorRedirect).toBeUndefined();
    expect(payload.user?.email).toBe(EMAIL);
    expect(payload.session?.access_token).toBeTruthy();
    expect(payload.session?.access_token).not.toBe(PASSWORD);
    expect(payload.session?.access_token).not.toBe("cookie");

    const cookie = [...jar.entries()]
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join("; ");
    expect(cookie).toContain("better-auth.session_token=");
    const real = createRealAuth(env.DB, SECRET, ORIGIN, RESEND);
    const session = await real.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(session?.user?.email).toBe(EMAIL);

    const factors = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM mfa_fatores",
    ).first<{ total: number }>();
    const totp = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM two_factor",
    ).first<{ total: number }>();
    const profile = await env.DB.prepare(
      "SELECT company_id, must_change_password, uso_individual, active FROM legado_users WHERE id = ?",
    )
      .bind(userId)
      .first<{
        company_id: string | null;
        must_change_password: number;
        uso_individual: number;
        active: number;
      }>();
    expect(factors?.total).toBe(0);
    expect(totp?.total).toBe(0);
    expect(profile).toMatchObject({
      company_id: null,
      must_change_password: 0,
      uso_individual: 0,
      active: 1,
    });
  }, 60_000);

  it("recusa senha errada sem devolver a senha", async () => {
    const wrong = "senha-errada-admin-16";
    const { response, text } = await login(wrong);
    expect(response.status).toBe(401);
    expect(text).not.toContain(wrong);
    expect(text).not.toContain(PASSWORD);
  });

  it("nao pede MFA e manda o admin global para /dashboard/admin", async () => {
    const profile = await runWithDataContext(
      {
        db: env.DB,
        r2: null,
        secret: SECRET,
        origin: ORIGIN,
        headers: new Headers({
          cookie: `better-auth.session_token=${encodeURIComponent(accessToken)}`,
        }),
      },
      async () =>
        getDataClient()
          .from("users")
          .select(
            "id, company_id, nome_completo, telefone, cidade, estado, uso_individual, active, must_change_password, user_types(name)",
          )
          .eq("id", userId)
          .maybeSingle(),
    );
    expect(profile.error).toBeNull();
    expect(profile.data).toMatchObject({
      nome_completo: "Administrador VTUR",
      active: true,
      uso_individual: false,
      must_change_password: false,
      company_id: null,
      user_types: { name: "ADMIN" },
    });
    const home = await navigate("/", accessToken);
    expect(home.status).toBe(303);
    expect(home.location).toContain("/dashboard/admin");
    expect(home.location).not.toContain("/auth/mfa");
    expect(home.location).not.toContain("setup_2fa");
    expect(home.location).not.toContain("onboarding");
    expect(home.location).not.toContain("force_password");

    const dashboard = await navigate("/dashboard/admin", accessToken);
    expect(dashboard.status).toBe(200);
    expect(dashboard.location).toBeNull();
  });

  it("resolve papel admin e escopo global", async () => {
    const ctx = await resolveAuthContext(
      new Headers({
        cookie: `better-auth.session_token=${encodeURIComponent(accessToken)}`,
      }),
      env.DB,
      SECRET,
      ORIGIN,
    );
    expect(ctx?.userEmail).toBe(EMAIL);
    expect(ctx?.papel).toBe("admin");
    expect(ctx?.legacyScope?.role).toBe("ADMIN");
    expect(ctx?.legacyScope?.companyIds).toBeNull();
  });

  it("recusa um segundo administrador e nao troca a senha", async () => {
    const before = await env.DB.prepare(
      "SELECT password FROM account WHERE user_id = ? AND provider_id = 'credential'",
    )
      .bind(userId)
      .first<{ password: string }>();
    await expect(
      applyBootstrap(env.DB, {
        email: "outro@vtur.com.br",
        password: "outra-senha-de-teste-16",
        modules: ["dashboard"],
      }),
    ).rejects.toBeInstanceOf(BootstrapRefused);
    const after = await env.DB.prepare(
      "SELECT password FROM account WHERE user_id = ? AND provider_id = 'credential'",
    )
      .bind(userId)
      .first<{ password: string }>();
    expect(after?.password).toBe(before?.password);
    const others = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM user WHERE email = 'outro@vtur.com.br'",
    ).first<{ total: number }>();
    expect(others?.total).toBe(0);
  });
});

async function navigate(pathname: string, token: string) {
  const request = new Request(`${ORIGIN}${pathname}`, {
    headers: {
      cookie: `better-auth.session_token=${encodeURIComponent(token)}`,
    },
  });
  const jar = new Map<string, string>([["better-auth.session_token", token]]);
  const event = {
    request,
    url: new URL(request.url),
    params: {},
    locals: {},
    platform: {
      env: {
        DB: env.DB,
        R2: env.R2,
        BETTER_AUTH_SECRET: SECRET,
        RESEND_API_KEY: RESEND,
      },
    },
    cookies: {
      get: (name: string) => jar.get(name),
      getAll: () =>
        [...jar.entries()].map(([name, value]) => ({ name, value })),
      set: (name: string, value: string) => jar.set(name, value),
      delete: (name: string) => jar.delete(name),
      serialize: () => "",
    },
    getClientAddress: () => "127.0.0.1",
    isDataRequest: false,
    isSubRequest: false,
    route: { id: null },
    setHeaders: () => undefined,
    fetch: globalThis.fetch.bind(globalThis),
  };
  const state = {
    tracing: {
      record_span: async ({
        fn,
      }: {
        fn: (span: unknown) => Promise<Response>;
      }) => fn({}),
    },
  };
  try {
    const response = await with_request_store({ event, state }, () =>
      handle({
        event,
        resolve: async () =>
          new Response("ok", { headers: { "content-type": "text/html" } }),
      } as unknown as Parameters<typeof handle>[0]),
    );
    return {
      status: response.status,
      location: response.headers.get("location"),
    };
  } catch (error) {
    if (isRedirect(error)) {
      return { status: error.status, location: String(error.location) };
    }
    throw error;
  }
}
