import { writable, derived } from 'svelte/store';

export type User = {
  id: string;
  email?: string | null;
  aud?: string;
  role?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: { [key: string]: string | undefined };
};

export type Session = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: User;
};

// Types
export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

// Store inicial
const initialState: AuthState = {
  user: null,
  session: null,
  loading: true,
  error: null
};

const loggedOutState: AuthState = {
  user: null,
  session: null,
  loading: false,
  error: null
};

// Sinaliza que o cookie de sessão já foi sincronizado com o servidor
// O dashboard e outras páginas devem aguardar isso antes de chamar APIs
export const sessionSynced = writable<boolean>(false);

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(initialState);

  return {
    subscribe,

    // Set user e session
    setAuth: (
      user: { id: string; email?: string | null } | null,
      session: {
        access_token?: string;
        refresh_token?: string;
        user?: { id: string } | null;
      } | null
    ) => {
      update((state) => ({
        ...state,
        user: user as User | null,
        session: session as Session | null,
        loading: false,
        error: null
      }));
    },

    // Set loading
    setLoading: (loading: boolean) => {
      update((state) => ({ ...state, loading }));
    },

    // Set error
    setError: (error: string | null) => {
      update((state) => ({ ...state, error, loading: false }));
    },

    // Clear auth (logout)
    clear: () => {
      set(loggedOutState);
    },

    // Update user
    updateUser: (user: User | null) => {
      update((state) => ({ ...state, user }));
    }
  };
}

export const auth = createAuthStore();

// Derived stores
export const isAuthenticated = derived(auth, ($auth) => !!$auth.user && !!$auth.session);

export const user = derived(auth, ($auth) => $auth.user);

export const isLoading = derived(auth, ($auth) => $auth.loading);

export const userType = derived(user, ($user) => {
  if (!$user) return null;
  return String($user.user_metadata?.tipo_usuario || 'VENDEDOR');
});

export const userEmpresa = derived(user, ($user) => {
  if (!$user) return null;
  return ($user.user_metadata?.empresa_id as string | null | undefined) || null;
});

export const isSystemAdmin = derived(userType, ($type) =>
  String($type || '')
    .toUpperCase()
    .includes('ADMIN')
);

export const isGestor = derived(userType, ($type) => {
  const type = String($type || '').toUpperCase();
  return type.includes('GESTOR') || type.includes('ADMIN');
});

export const isMaster = derived(userType, ($type) =>
  String($type || '')
    .toUpperCase()
    .includes('MASTER')
);

export const isFinanceiro = derived(userType, ($type) =>
  String($type || '')
    .toUpperCase()
    .includes('FINANCEIRO')
);
