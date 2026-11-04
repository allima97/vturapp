import { serializeSignedCookie } from "better-call";
import { hashPassword } from "better-auth/crypto";
import { createAuth } from "$lib/auth";
import { otpauthUri, qrDataUrl } from "./qr";
import type { AuthSession, AuthUser, DataContext, QueryError } from "./types";

const AAL_COOKIE = "vtur_aal";

function emptyError(message: string, code = "auth"): QueryError {
  return { message, code, details: null, hint: null };
}

function mapUser(row: {
  id: string;
  email?: string | null;
  name?: string | null;
}): AuthUser {
  return {
    id: row.id,
    email: row.email || null,
    aud: "authenticated",
    role: "authenticated",
    user_metadata: { nome: row.name || row.email || "" },
    app_metadata: {},
  };
}

function sessionFor(user: AuthUser, token = "cookie"): AuthSession {
  return {
    access_token: token,
    refresh_token: "cookie",
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    user,
  };
}

function authFor(context: DataContext) {
  return createAuth(
    context.db,
    context.secret || "dev-only-auth-secret-32-chars-min",
    context.origin,
  );
}

async function ensureLegacyUser(
  db: D1Database,
  user: { id: string; email?: string | null; name?: string | null },
) {
  await db
    .prepare(
      `
    INSERT INTO legado_users (id, email, nome_completo, active)
    VALUES (?1, ?2, ?3, 1)
    ON CONFLICT (id) DO UPDATE SET email = excluded.email
  `,
    )
    .bind(user.id, user.email || "", user.name || user.email || "Usuario")
    .run();
}

function base32(bytes: Uint8Array) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/=+$/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function totpCode(secret: string, at = Date.now()) {
  const counter = Math.floor(at / 30000);
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setUint32(4, counter);
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, buffer),
  );
  const offset = signature[signature.length - 1] & 15;
  const binary =
    ((signature[offset] & 127) << 24) |
    (signature[offset + 1] << 16) |
    (signature[offset + 2] << 8) |
    signature[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
}

async function codeMatches(secret: string, code: string) {
  const now = Date.now();
  const checks = await Promise.all(
    [-1, 0, 1].map((step) => totpCode(secret, now + step * 30000)),
  );
  return checks.includes(code);
}

async function signAal(secret: string, userId: string, exp: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret || "dev"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${userId}.${exp}`),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function writeAal(context: DataContext, userId: string) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const signature = await signAal(context.secret, userId, exp);
  context.cookies?.set(AAL_COOKIE, `${userId}.${exp}.${signature}`, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
  });
}

async function readAal(context: DataContext, userId: string) {
  const raw = context.cookies?.get(AAL_COOKIE) || "";
  const [cookieUser, exp, signature] = raw.split(".");
  if (
    !cookieUser ||
    cookieUser !== userId ||
    Number(exp) < Math.floor(Date.now() / 1000) ||
    !signature
  )
    return false;
  return signature === (await signAal(context.secret, userId, Number(exp)));
}

async function factorsFor(db: D1Database, userId: string) {
  const rows = await db
    .prepare(
      "SELECT id, friendly_name, status FROM mfa_fatores WHERE user_id = ?1 ORDER BY created_at DESC",
    )
    .bind(userId)
    .all<{ id: string; friendly_name: string | null; status: string }>();
  const totp = (rows.results || []).map((row) => ({
    id: row.id,
    friendly_name: row.friendly_name,
    factor_type: "totp",
    status: row.status,
  }));
  return { totp, all: totp };
}

export async function openUserSession(context: DataContext, userId: string) {
  const token =
    crypto.randomUUID().replace(/-/g, "") +
    crypto.randomUUID().replace(/-/g, "");
  const now = Date.now();
  await context.db
    .prepare(
      `
    INSERT INTO session (id, user_id, token, expires_at, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?5)
  `,
    )
    .bind(
      crypto.randomUUID(),
      userId,
      token,
      now + 30 * 24 * 60 * 60 * 1000,
      now,
    )
    .run();
  const cookie = await serializeSignedCookie(
    "better-auth.session_token",
    token,
    context.secret || "dev-only-auth-secret-32-chars-min",
    {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
    },
  );
  const separator = cookie.indexOf("=");
  const name = cookie.slice(0, separator);
  const value = decodeURIComponent(cookie.slice(separator + 1).split(";")[0]);
  context.cookies?.set(name, value, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
  });
  return token;
}

export function createAuthApi(context: DataContext) {
  async function currentUser() {
    if (!context.db || !context.secret) return null;
    const auth = authFor(context);
    const session = await auth.api.getSession({ headers: context.headers });
    if (!session?.user) return null;
    return session.user;
  }

  return {
    async getSession() {
      const user = await currentUser();
      if (!user) return { data: { session: null }, error: null };
      return { data: { session: sessionFor(mapUser(user)) }, error: null };
    },
    async getUser() {
      const user = await currentUser();
      return { data: { user: user ? mapUser(user) : null }, error: null };
    },
    async signOut() {
      context.cookies?.delete("better-auth.session_token", { path: "/" });
      context.cookies?.delete("__Secure-better-auth.session_token", {
        path: "/",
      });
      context.cookies?.delete(AAL_COOKIE, { path: "/" });
      return { error: null };
    },
    async signInWithPassword({
      email,
      password,
    }: {
      email: string;
      password: string;
    }) {
      const auth = authFor(context);
      const response = await auth.api.signInEmail({
        body: { email, password },
        headers: context.headers,
        asResponse: true,
      });
      if (!response.ok)
        return {
          data: { session: null, user: null },
          error: emptyError(
            "Email ou senha incorretos.",
            "invalid_credentials",
          ),
        };
      const payload = (await response.json()) as {
        user?: { id: string; email: string; name?: string };
        token?: string;
      };
      if (payload.user) await ensureLegacyUser(context.db, payload.user);
      const user = payload.user ? mapUser(payload.user) : null;
      return {
        data: {
          user,
          session: user ? sessionFor(user, payload.token || "cookie") : null,
        },
        error: null,
      };
    },
    async updateUser(values: { password?: string }) {
      const user = await currentUser();
      if (!user)
        return { data: { user: null }, error: emptyError("sem sessao", "401") };
      if (values.password) {
        const password = await hashPassword(values.password);
        await context.db
          .prepare(
            `UPDATE account SET password = ?1, updated_at = ?2 WHERE user_id = ?3 AND provider_id = 'credential'`,
          )
          .bind(password, Date.now(), user.id)
          .run();
      }
      return { data: { user: mapUser(user) }, error: null };
    },
    async resetPasswordForEmail(
      email: string,
      options?: { redirectTo?: string },
    ) {
      const auth = authFor(context);
      await auth.api
        .requestPasswordReset({
          body: { email, redirectTo: options?.redirectTo },
          headers: context.headers,
        })
        .catch(() => undefined);
      return { data: {}, error: null };
    },
    async exchangeCodeForSession(code: string) {
      const row = await context.db
        .prepare("SELECT value FROM verification WHERE identifier = ?1")
        .bind(`reset:${code}`)
        .first<{ value: string }>();
      if (!row?.value)
        return {
          data: { session: null, user: null },
          error: emptyError("codigo invalido"),
        };
      const user = await context.db
        .prepare("SELECT id, email, name FROM user WHERE id = ?1")
        .bind(row.value)
        .first<{ id: string; email: string; name: string }>();
      if (!user)
        return {
          data: { session: null, user: null },
          error: emptyError("usuario nao encontrado"),
        };
      await openUserSession(context, user.id);
      return {
        data: { session: sessionFor(mapUser(user)), user: mapUser(user) },
        error: null,
      };
    },
    async setSession() {
      return this.getSession();
    },
    async verifyOtp() {
      return {
        data: { session: null, user: null },
        error: emptyError("fluxo de codigo substituido pela sessao local"),
      };
    },
    mfa: {
      async listFactors() {
        const user = await currentUser();
        if (!user)
          return {
            data: { totp: [], all: [] },
            error: emptyError("sem sessao", "401"),
          };
        return { data: await factorsFor(context.db, user.id), error: null };
      },
      async getAuthenticatorAssuranceLevel() {
        const user = await currentUser();
        if (!user)
          return {
            data: { currentLevel: "aal1", nextLevel: "aal1" },
            error: null,
          };
        const factors = await factorsFor(context.db, user.id);
        const verified = factors.totp.some(
          (factor) => factor.status === "verified",
        );
        const elevated = verified && (await readAal(context, user.id));
        return {
          data: {
            currentLevel: elevated ? "aal2" : "aal1",
            nextLevel: verified ? "aal2" : "aal1",
          },
          error: null,
        };
      },
      async enroll(params?: { friendlyName?: string }) {
        const user = await currentUser();
        if (!user)
          return {
            data: { id: "", totp: { qr_code: "", secret: "" } },
            error: emptyError("sem sessao", "401"),
          };
        const secret = base32(crypto.getRandomValues(new Uint8Array(20)));
        const id = crypto.randomUUID();
        await context.db
          .prepare(
            `
          INSERT INTO mfa_fatores (id, user_id, secret, friendly_name, status, created_at)
          VALUES (?1, ?2, ?3, ?4, 'unverified', ?5)
        `,
          )
          .bind(
            id,
            user.id,
            secret,
            params?.friendlyName || "Autenticador VTUR",
            new Date().toISOString(),
          )
          .run();
        return {
          data: {
            id,
            totp: {
              qr_code: qrDataUrl(
                otpauthUri(user.email || user.name || user.id, secret),
              ),
              secret,
            },
          },
          error: null,
        };
      },
      async challenge(params: { factorId: string }) {
        return { data: { id: params.factorId }, error: null };
      },
      async verify(params: { factorId: string; code: string }) {
        const user = await currentUser();
        if (!user)
          return {
            data: { user: null },
            error: emptyError("sem sessao", "401"),
          };
        const factor = await context.db
          .prepare(
            "SELECT secret, status FROM mfa_fatores WHERE id = ?1 AND user_id = ?2",
          )
          .bind(params.factorId, user.id)
          .first<{ secret: string; status: string }>();
        if (!factor || !(await codeMatches(factor.secret, params.code))) {
          return { data: { user: null }, error: emptyError("invalid code") };
        }
        await context.db
          .prepare(`UPDATE mfa_fatores SET status = 'verified' WHERE id = ?1`)
          .bind(params.factorId)
          .run();
        await context.db
          .prepare("UPDATE user SET two_factor_enabled = 1 WHERE id = ?1")
          .bind(user.id)
          .run();
        await writeAal(context, user.id);
        return { data: { user: mapUser(user) }, error: null };
      },
      async unenroll(params: { factorId: string }) {
        const user = await currentUser();
        if (!user) return { error: emptyError("sem sessao", "401") };
        await context.db
          .prepare("DELETE FROM mfa_fatores WHERE id = ?1 AND user_id = ?2")
          .bind(params.factorId, user.id)
          .run();
        context.cookies?.delete(AAL_COOKIE, { path: "/" });
        return { error: null };
      },
    },
    admin: {
      async listUsers(params?: { page?: number; perPage?: number }) {
        const page = Math.max(1, params?.page || 1);
        const perPage = Math.max(1, params?.perPage || 200);
        const rows = await context.db
          .prepare(
            "SELECT id, email, name FROM user ORDER BY created_at DESC LIMIT ?1 OFFSET ?2",
          )
          .bind(perPage, (page - 1) * perPage)
          .all<{ id: string; email: string; name: string }>();
        return {
          data: { users: (rows.results || []).map(mapUser) },
          error: null,
        };
      },
      async getUserById(userId: string) {
        const row = await context.db
          .prepare("SELECT id, email, name FROM user WHERE id = ?1")
          .bind(userId)
          .first<{ id: string; email: string; name: string }>();
        return { data: { user: row ? mapUser(row) : null }, error: null };
      },
      async createUser(params: { email: string; password: string }) {
        const email = params.email.trim().toLowerCase();
        const existing = await context.db
          .prepare("SELECT id, email, name FROM user WHERE lower(email) = ?1")
          .bind(email)
          .first<{ id: string; email: string; name: string }>();
        if (existing)
          return {
            data: { user: mapUser(existing) },
            error: emptyError("usuario ja existe", "email_exists"),
          };
        const id = crypto.randomUUID();
        const now = Date.now();
        const password = await hashPassword(params.password);
        await context.db.batch([
          context.db
            .prepare(
              "INSERT INTO user (id, name, email, email_verified, two_factor_enabled, created_at, updated_at) VALUES (?1, ?2, ?3, 1, 0, ?4, ?4)",
            )
            .bind(id, email, email, now),
          context.db
            .prepare(
              `INSERT INTO account (id, user_id, account_id, provider_id, password, created_at, updated_at) VALUES (?1, ?2, ?3, 'credential', ?4, ?5, ?5)`,
            )
            .bind(crypto.randomUUID(), id, id, password, now),
        ]);
        await ensureLegacyUser(context.db, { id, email, name: email });
        return {
          data: { user: mapUser({ id, email, name: email }) },
          error: null,
        };
      },
      async updateUserById(
        userId: string,
        values: { password?: string; email?: string },
      ) {
        if (values.email)
          await context.db
            .prepare(
              "UPDATE user SET email = ?1, updated_at = ?2 WHERE id = ?3",
            )
            .bind(values.email, Date.now(), userId)
            .run();
        if (values.password) {
          const password = await hashPassword(values.password);
          await context.db
            .prepare(
              `UPDATE account SET password = ?1, updated_at = ?2 WHERE user_id = ?3 AND provider_id = 'credential'`,
            )
            .bind(password, Date.now(), userId)
            .run();
        }
        return this.getUserById(userId);
      },
      async deleteUser(userId: string) {
        await context.db
          .prepare("DELETE FROM user WHERE id = ?1")
          .bind(userId)
          .run();
        await context.db
          .prepare("DELETE FROM legado_users WHERE id = ?1")
          .bind(userId)
          .run();
        return { error: null };
      },
      async generateLink(params: {
        type: string;
        email: string;
        options?: { redirectTo?: string };
      }) {
        const email = params.email.trim().toLowerCase();
        let row = await context.db
          .prepare("SELECT id, email, name FROM user WHERE lower(email) = ?1")
          .bind(email)
          .first<{ id: string; email: string; name: string }>();
        if (!row && params.type === "invite") {
          const created = await this.createUser({
            email,
            password: crypto.randomUUID(),
          });
          row = created.data.user
            ? { id: created.data.user.id, email, name: email }
            : null;
        }
        if (!row)
          return {
            data: { properties: { action_link: "" }, user: null },
            error: emptyError("usuario nao encontrado", "user_not_found"),
          };
        const code = crypto.randomUUID();
        await context.db
          .prepare(
            "INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
          )
          .bind(
            crypto.randomUUID(),
            `reset:${code}`,
            row.id,
            Date.now() + 60 * 60 * 1000,
            Date.now(),
          )
          .run();
        const redirect =
          params.options?.redirectTo || `${context.origin}/auth/nova-senha`;
        const joiner = redirect.includes("?") ? "&" : "?";
        return {
          data: {
            properties: {
              action_link: `${redirect}${joiner}code=${code}`,
              hashed_token: code,
            },
            user: mapUser(row),
          },
          error: null,
        };
      },
      mfa: {
        async listFactors(params: { userId: string }) {
          const data = await factorsFor(context.db, params.userId);
          return { data: { totp: data.totp, factors: data.all }, error: null };
        },
        async deleteFactor(params: { userId: string; id: string }) {
          await context.db
            .prepare("DELETE FROM mfa_fatores WHERE id = ?1 AND user_id = ?2")
            .bind(params.id, params.userId)
            .run();
          return { error: null };
        },
      },
    },
    onAuthStateChange(
      callback: (event: string, session: AuthSession | null) => void,
    ) {
      void currentUser().then((user) =>
        callback(
          user ? "SIGNED_IN" : "SIGNED_OUT",
          user ? sessionFor(mapUser(user)) : null,
        ),
      );
      return { data: { subscription: { unsubscribe() {} } } };
    },
  };
}
