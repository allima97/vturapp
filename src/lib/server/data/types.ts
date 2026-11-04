export type QueryError = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

export type QueryResult<T = unknown> = {
  data: T;
  error: QueryError | null;
  count?: number | null;
};

export type AuthUser = {
  id: string;
  email?: string | null;
  aud?: string;
  role?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: AuthUser;
};

export type DataCookies = {
  get: (name: string) => string | undefined;
  set: (name: string, value: string, options?: Record<string, unknown>) => void;
  delete: (name: string, options?: Record<string, unknown>) => void;
};

export type DataContext = {
  db: D1Database;
  r2: R2Bucket | null;
  secret: string;
  origin: string;
  headers: Headers;
  cookies?: DataCookies;
};

export interface DataClient {
  from: (table: string) => any;
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<QueryResult<any>>;
  storage: any;
  auth: any;
  channel: (name: string) => any;
  removeChannel: (channel?: unknown) => void;
}

export interface QueryBuilder extends PromiseLike<QueryResult> {
  select: (
    columns?: string,
    options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
  ) => QueryBuilder;
  insert: (
    values: Record<string, unknown> | Array<Record<string, unknown>>,
  ) => QueryBuilder;
  update: (values: Record<string, unknown>) => QueryBuilder;
  upsert: (
    values: Record<string, unknown> | Array<Record<string, unknown>>,
    options?: { onConflict?: string },
  ) => QueryBuilder;
  delete: () => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  neq: (column: string, value: unknown) => QueryBuilder;
  gt: (column: string, value: unknown) => QueryBuilder;
  gte: (column: string, value: unknown) => QueryBuilder;
  lt: (column: string, value: unknown) => QueryBuilder;
  lte: (column: string, value: unknown) => QueryBuilder;
  like: (column: string, value: string) => QueryBuilder;
  ilike: (column: string, value: string) => QueryBuilder;
  in: (column: string, values: unknown[]) => QueryBuilder;
  is: (column: string, value: unknown) => QueryBuilder;
  not: (column: string, operator: string, value: unknown) => QueryBuilder;
  or: (filters: string) => QueryBuilder;
  match: (filters: Record<string, unknown>) => QueryBuilder;
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  range: (from: number, to: number) => QueryBuilder;
  single: () => Promise<QueryResult>;
  maybeSingle: () => Promise<QueryResult>;
}

export interface StorageBucket {
  upload: (
    path: string,
    body: unknown,
    options?: { contentType?: string; upsert?: boolean; cacheControl?: string },
  ) => Promise<QueryResult>;
  download: (path: string) => Promise<QueryResult>;
  remove: (paths: string[]) => Promise<QueryResult>;
  createSignedUrl: (
    path: string,
    expiresIn: number,
  ) => Promise<QueryResult<{ signedUrl: string }>>;
  getPublicUrl: (path: string) => { data: { publicUrl: string } };
}

export interface AuthApi {
  getSession: () => Promise<{
    data: { session: AuthSession | null };
    error: QueryError | null;
  }>;
  getUser: () => Promise<{
    data: { user: AuthUser | null };
    error: QueryError | null;
  }>;
  signOut: () => Promise<{ error: QueryError | null }>;
  signInWithPassword: (credentials: {
    email: string;
    password: string;
  }) => Promise<{
    data: { session: AuthSession | null; user: AuthUser | null };
    error: QueryError | null;
  }>;
  updateUser: (values: {
    password?: string;
  }) => Promise<{ data: { user: AuthUser | null }; error: QueryError | null }>;
  resetPasswordForEmail: (
    email: string,
    options?: { redirectTo?: string },
  ) => Promise<{ data: Record<string, never>; error: QueryError | null }>;
  exchangeCodeForSession: (
    code: string,
  ) => Promise<{
    data: { session: AuthSession | null; user: AuthUser | null };
    error: QueryError | null;
  }>;
  setSession: (tokens: {
    access_token: string;
    refresh_token: string;
  }) => Promise<{
    data: { session: AuthSession | null };
    error: QueryError | null;
  }>;
  verifyOtp: (params: {
    token_hash?: string;
    type?: string;
  }) => Promise<{
    data: { session: AuthSession | null; user: AuthUser | null };
    error: QueryError | null;
  }>;
  mfa: {
    listFactors: () => Promise<{
      data: {
        totp: Array<Record<string, unknown>>;
        all: Array<Record<string, unknown>>;
      };
      error: QueryError | null;
    }>;
    getAuthenticatorAssuranceLevel: () => Promise<{
      data: { currentLevel: string; nextLevel: string };
      error: QueryError | null;
    }>;
    enroll: (params?: {
      factorType?: string;
      friendlyName?: string;
    }) => Promise<{
      data: { id: string; totp: { qr_code: string; secret: string } };
      error: QueryError | null;
    }>;
    challenge: (params: {
      factorId: string;
    }) => Promise<{ data: { id: string }; error: QueryError | null }>;
    verify: (params: {
      factorId: string;
      challengeId: string;
      code: string;
    }) => Promise<{
      data: { user: AuthUser | null };
      error: QueryError | null;
    }>;
    unenroll: (params: {
      factorId: string;
    }) => Promise<{ error: QueryError | null }>;
  };
  admin: {
    listUsers: (params?: {
      page?: number;
      perPage?: number;
    }) => Promise<{ data: { users: AuthUser[] }; error: QueryError | null }>;
    getUserById: (
      userId: string,
    ) => Promise<{ data: { user: AuthUser | null }; error: QueryError | null }>;
    createUser: (params: {
      email: string;
      password: string;
      email_confirm?: boolean;
    }) => Promise<{
      data: { user: AuthUser | null };
      error: QueryError | null;
    }>;
    updateUserById: (
      userId: string,
      values: { password?: string; email?: string },
    ) => Promise<{ data: { user: AuthUser | null }; error: QueryError | null }>;
    deleteUser: (userId: string) => Promise<{ error: QueryError | null }>;
    generateLink: (params: {
      type: string;
      email: string;
      options?: { redirectTo?: string };
    }) => Promise<{
      data: {
        properties: { action_link: string; hashed_token?: string };
        user: AuthUser | null;
      };
      error: QueryError | null;
    }>;
    mfa: {
      listFactors: (params: {
        userId: string;
      }) => Promise<{
        data: {
          totp: Array<Record<string, unknown>>;
          factors?: Array<Record<string, unknown>>;
        };
        error: QueryError | null;
      }>;
      deleteFactor: (params: {
        userId: string;
        id: string;
      }) => Promise<{ error: QueryError | null }>;
    };
  };
  onAuthStateChange: (
    callback: (event: string, session: AuthSession | null) => void,
  ) => { data: { subscription: { unsubscribe: () => void } } };
}

export interface RealtimeChannel {
  on: (...args: unknown[]) => RealtimeChannel;
  subscribe: (callback?: (status: string) => void) => RealtimeChannel;
}
