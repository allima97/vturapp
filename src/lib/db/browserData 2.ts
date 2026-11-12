import { browser } from '$app/environment';
import { authClient } from '$lib/auth-client';

export type BrowserUser = {
  id: string;
  email?: string | null;
  aud?: string;
  role?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

export type BrowserSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: BrowserUser;
};

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

function mapSession(
  payload: {
    user?: { id: string; email?: string | null; name?: string | null } | null;
  } | null
): BrowserSession | null {
  const user = payload?.user;
  if (!user?.id) return null;
  return {
    access_token: 'cookie',
    refresh_token: 'cookie',
    user: {
      id: user.id,
      email: user.email || null,
      aud: 'authenticated',
      role: 'authenticated',
      user_metadata: { nome: user.name || '' },
      app_metadata: {}
    }
  };
}

async function readSession() {
  const result = await authClient.getSession();
  // Falha de rede/servidor não é prova de logout: propaga para o chamador decidir.
  if (result.error && result.error.status !== 401 && result.error.status !== 403) {
    throw new Error(result.error.message || 'Falha ao ler a sessão.');
  }
  return mapSession(result.data);
}

function storageApi() {
  return {
    from(bucket: string) {
      return {
        async upload(
          path: string,
          file: Blob,
          options?: {
            contentType?: string;
            upsert?: boolean;
            cacheControl?: string;
          }
        ) {
          const body = new FormData();
          body.set('bucket', bucket);
          body.set('path', path);
          body.set('upsert', options?.upsert ? '1' : '0');
          body.set('file', file, path.split('/').pop() || 'arquivo');
          const response = await fetch('/api/arquivos', {
            method: 'POST',
            body,
            credentials: 'same-origin'
          });
          if (!response.ok) return { data: null, error: { message: 'falha no envio' } };
          return { data: { path }, error: null };
        },
        async download(path: string) {
          const response = await fetch(
            `/api/arquivos/baixar?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`,
            { credentials: 'same-origin' }
          );
          if (!response.ok) return { data: null, error: { message: 'arquivo nao encontrado' } };
          return { data: await response.blob(), error: null };
        },
        async createSignedUrl(path: string, expiresIn: number) {
          const response = await fetch('/api/arquivos/assinatura', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ bucket, path, expiresIn })
          });
          const payload = (await response.json().catch(() => ({}))) as {
            signedUrl?: string;
          };
          return {
            data: { signedUrl: payload.signedUrl || '' },
            error: response.ok ? null : { message: 'falha ao assinar' }
          };
        },
        getPublicUrl(path: string) {
          return {
            data: {
              publicUrl: `/api/arquivos/publico/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`
            }
          };
        }
      };
    }
  };
}

export function createBrowserDataClient() {
  if (!browser) throw new Error('createBrowserDataClient so pode ser chamado no browser');

  function from(table: string) {
    const filters: Array<{
      op: string;
      column?: string;
      value?: unknown;
      raw?: string;
    }> = [];
    let columns = '*';
    let mode: 'many' | 'single' | 'maybe' = 'many';
    const order: Array<{ column: string; ascending: boolean }> = [];
    let limit: number | null = null;

    const builder = {
      select(next?: string) {
        columns = next || '*';
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push({ op: 'eq', column, value });
        return builder;
      },
      neq(column: string, value: unknown) {
        filters.push({ op: 'neq', column, value });
        return builder;
      },
      in(column: string, value: unknown[]) {
        filters.push({ op: 'in', column, value });
        return builder;
      },
      is(column: string, value: unknown) {
        filters.push({ op: 'is', column, value });
        return builder;
      },
      ilike(column: string, value: string) {
        filters.push({ op: 'ilike', column, value });
        return builder;
      },
      or(raw: string) {
        filters.push({ op: 'or', raw });
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        order.push({ column, ascending: options?.ascending !== false });
        return builder;
      },
      limit(count: number) {
        limit = count;
        return builder;
      },
      single() {
        mode = 'single';
        return builder.execute();
      },
      maybeSingle() {
        mode = 'maybe';
        return builder.execute();
      },
      then(resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) {
        return builder.execute().then(resolve, reject);
      },
      async execute(): Promise<QueryResult> {
        const response = await fetch('/api/dados/consulta', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ table, columns, filters, order, limit, mode })
        });
        return response.json();
      }
    };
    return builder;
  }

  const listeners = new Set<(event: string, session: BrowserSession | null) => void>();

  return {
    from,
    rpc: async () => ({
      data: null,
      error: { message: 'rotina indisponivel no navegador' }
    }),
    storage: storageApi(),
    channel() {
      const channel = {
        on() {
          return channel;
        },
        subscribe(callback?: (status: string) => void) {
          callback?.('CLOSED');
          return channel;
        }
      };
      return channel;
    },
    removeChannel() {},
    auth: {
      async getSession() {
        const session = await readSession();
        return { data: { session }, error: null as { message: string } | null };
      },
      async getUser() {
        const session = await readSession();
        return { data: { user: session?.user ?? null }, error: null };
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const result = await authClient.signIn.email({ email, password });
        if (result.error)
          return {
            data: { session: null, user: null },
            error: { message: result.error.message || 'falha no login' }
          };
        const session = await readSession();
        listeners.forEach((listener) => listener('SIGNED_IN', session));
        return { data: { session, user: session?.user ?? null }, error: null };
      },
      async signOut() {
        await authClient.signOut();
        listeners.forEach((listener) => listener('SIGNED_OUT', null));
        return { error: null };
      },
      async updateUser(values: { password?: string }) {
        if (values.password) {
          const response = await fetch('/api/auth/senha', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: values.password })
          });
          if (!response.ok)
            return {
              data: { user: null },
              error: { message: 'nao foi possivel alterar a senha' }
            };
        }
        const session = await readSession();
        return { data: { user: session?.user ?? null }, error: null };
      },
      async resetPasswordForEmail(email: string, options?: { redirectTo?: string }) {
        const response = await fetch('/api/auth/request-password-reset', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, redirectTo: options?.redirectTo })
        });
        if (!response.ok) return { data: {}, error: { message: 'falha ao enviar e-mail' } };
        return { data: {}, error: null };
      },
      async exchangeCodeForSession(code: string) {
        const response = await fetch('/api/auth/codigo', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code })
        });
        if (!response.ok)
          return {
            data: { session: null, user: null },
            error: { message: 'codigo invalido' }
          };
        const session = await readSession();
        return { data: { session, user: session?.user ?? null }, error: null };
      },
      async setSession(_tokens?: { access_token?: string; refresh_token?: string }) {
        const session = await readSession();
        return { data: { session }, error: null };
      },
      mfa: {
        async listFactors() {
          const response = await fetch('/api/auth/mfa/fatores', {
            credentials: 'same-origin'
          });
          const data = (await response.json().catch(() => ({ totp: [], all: [] }))) as {
            totp?: Array<{
              id: string;
              status?: string | null;
              friendly_name?: string | null;
              factor_type?: string | null;
            }>;
            all?: Array<{ id: string; status?: string | null }>;
          };
          return {
            data,
            error: response.ok ? null : { message: 'falha ao listar fatores' }
          };
        },
        async getAuthenticatorAssuranceLevel() {
          const response = await fetch('/api/auth/mfa/nivel', {
            credentials: 'same-origin'
          });
          const data = (await response
            .json()
            .catch(() => ({ currentLevel: 'aal1', nextLevel: 'aal1' }))) as {
            currentLevel: string;
            nextLevel: string;
          };
          return { data, error: null };
        },
        async enroll(params?: { factorType?: string; friendlyName?: string }) {
          const response = await fetch('/api/auth/mfa/fatores', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(params || {})
          });
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
            id?: string;
            totp?: { qr_code: string; secret: string };
          };
          return {
            data,
            error: response.ok ? null : { message: data.error || 'falha ao iniciar 2FA' }
          };
        },
        async challenge(params: { factorId: string }) {
          return { data: { id: params.factorId }, error: null };
        },
        async verify(params: { factorId: string; challengeId: string; code: string }) {
          const response = await fetch('/api/auth/mfa/verificar', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(params)
          });
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          return {
            data,
            error: response.ok ? null : { message: data.error || 'invalid code' }
          };
        },
        async unenroll(params: { factorId: string }) {
          const response = await fetch('/api/auth/mfa/fatores', {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(params)
          });
          return {
            error: response.ok ? null : { message: 'falha ao remover fator' }
          };
        }
      },
      onAuthStateChange(
        callback: (event: string, session: BrowserSession | null) => void | Promise<void>
      ) {
        listeners.add(callback);
        void readSession()
          .then((session) => callback(session ? 'SIGNED_IN' : 'INITIAL_SESSION', session))
          .catch(() => {});
        return {
          data: {
            subscription: { unsubscribe: () => listeners.delete(callback) }
          }
        };
      }
    }
  };
}

export const browserData = browser
  ? createBrowserDataClient()
  : (null as unknown as ReturnType<typeof createBrowserDataClient>);
export const isMockMode = () => false;
