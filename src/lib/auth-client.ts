/**
 * Better Auth — cliente Svelte para uso nos componentes.
 *
 * Importar em componentes .svelte ou código client-side:
 *   import { authClient } from '$lib/auth-client';
 *
 * Exemplos de uso:
 *   // Login
 *   await authClient.signIn.email({ email, password });
 *
 *   // Registro
 *   await authClient.signUp.email({ email, password, name });
 *
 *   // Logout
 *   await authClient.signOut();
 *
 *   // Sessão reativa (Svelte store)
 *   const session = authClient.useSession();
 *   // $session.data?.user.name
 *
 * Nota: o cliente detecta automaticamente o baseURL a partir da URL atual.
 * Para forçar um baseURL diferente (ex.: em SSR), passar baseURL explícito.
 *
 * Referência: docs/f1/F1-04-better-auth.md
 */

import { createAuthClient } from 'better-auth/svelte';
import { twoFactorClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  // baseURL é opcional quando o client está no mesmo domínio.
  // Em F2-02 configurar via PUBLIC_APP_URL se necessário.

  plugins: [
    /**
     * Plugin cliente para 2FA (TOTP).
     * Expõe: authClient.twoFactor.getTotpUri(), authClient.twoFactor.verify()
     */
    twoFactorClient(),
  ],
});

/** Re-exportar tipos úteis para uso nos componentes */
export type AuthSession = Awaited<ReturnType<typeof authClient.getSession>>;
