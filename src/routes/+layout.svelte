<script lang="ts">
  import '../app.css';
  import '$lib/styles/reescrita.css';
  import { onMount } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import { browser, dev } from '$app/environment';
  import { supabase } from '$lib/db/supabase';
  import { abortInFlightApiReads } from '$lib/services/api';
  import { auth, sessionSynced } from '$lib/stores/auth';
  import { toast } from '$lib/stores/ui';
  import type { LayoutData } from './$types';
  import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

  type RootLayoutData = LayoutData & {
    session?: Session | null;
    user?: User | null;
  };

  export let data: RootLayoutData;

  let isRedirecting = false;
  let lastSessionAt = 0;
  let checkingSession = false;
  let pendingRedirectTimer: number | null = null;
  const SESSION_SYNC_TIMEOUT_MS = 12_000;
  // Intervalo da checagem periódica de sessão (só com a aba visível). getSession()
  // é local e, se o token venceu, tenta renovar — se a renovação falhar (sessão
  // revogada/expirada pelo sistema), não há sessão e o usuário vai para o login.
  const SESSION_POLL_MS = 60_000;

  if (browser) {
    beforeNavigate(() => {
      abortInFlightApiReads();
    });
  }

  function isPublicRoute(path: string): boolean {
    // A área da reescrita usa Better Auth; não pode depender da sessão Supabase
    // que protege o aplicativo legado. Os dados seguem protegidos pela API v2.
    return path.startsWith('/auth/') || path === '/reescrita' || path.startsWith('/reescrita/') || path === '/negado';
  }

  function redirectToLogin(reason: string) {
    if (!browser || isRedirecting || isPublicRoute(window.location.pathname)) return;

    // Se uma sessão acabou de ser estabelecida (ex.: refresh de token em
    // andamento), não descarta o aviso: confere de novo em instantes. Antes o
    // pedido era simplesmente ignorado e o usuário ficava "preso" na tela.
    const sinceSession = Date.now() - lastSessionAt;
    if (sinceSession < 5000) {
      if (pendingRedirectTimer === null) {
        pendingRedirectTimer = window.setTimeout(() => {
          pendingRedirectTimer = null;
          void verifySessionOrRedirect(reason);
        }, 5000 - sinceSession + 200);
      }
      return;
    }

    isRedirecting = true;
    if (dev) console.warn(`[Auth] ${reason}. Redirecionando para login.`);
    auth.clear();
    const next = `${window.location.pathname}${window.location.search || ''}`;
    // Navegação completa (não goto): descarta todo o estado da tela anterior.
    window.location.assign(`/auth/login?session_expired=1&next=${encodeURIComponent(next)}`);
  }

  // Fonte da verdade é a sessão do cliente Supabase — NÃO o auth store, que já
  // é limpo no SIGNED_OUT (antes a checagem exigia get(auth).user, que nesse
  // momento era sempre null, e por isso o redirecionamento nunca acontecia).
  async function verifySessionOrRedirect(reason: string) {
    if (!browser || isRedirecting || isPublicRoute(window.location.pathname)) return;
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (session && !error) {
        lastSessionAt = Date.now();
        return;
      }
    } catch (err) {
      // Falha ao ler a sessão (ex.: rede) não é prova de logout: tenta de novo depois.
      if (dev) console.warn('[Auth] Falha ao verificar sessão:', err);
      return;
    }
    redirectToLogin(reason);
  }

  async function syncServerSession(
    session: { access_token: string; refresh_token: string } | null,
    source: string
  ) {
    if (!session) {
      sessionSynced.set(true);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SESSION_SYNC_TIMEOUT_MS);
    try {
      const result = await fetch('/api/auth/set-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        })
      });

      if (!result.ok) {
        if (dev) console.warn(`[Auth] Falha ao sincronizar sessão (${source}) status:`, result.status);
      }

      sessionSynced.set(true);
    } catch (syncErr) {
      if (dev) console.warn(`[Auth] Erro ao sincronizar sessão (${source}):`, syncErr);
      sessionSynced.set(true);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  // Inicializa auth store com dados do servidor
  $: if (data.session) {
    auth.setAuth(data.user ?? data.session.user ?? null, data.session);
    sessionSynced.set(true);
  }

  onMount(() => {
    if (!browser) return;

    let cancelled = false;
    let unsubscribe = () => {};
    const hasServerSession = Boolean(data.session);

    (async () => {
      const {
        data: { subscription }
      } = supabase.auth.onAuthStateChange(
        async (event: AuthChangeEvent, session: Session | null) => {
          if (
            (event === 'SIGNED_IN' ||
              event === 'TOKEN_REFRESHED' ||
              event === 'USER_UPDATED' ||
              event === 'PASSWORD_RECOVERY' ||
              event === 'MFA_CHALLENGE_VERIFIED') &&
            session
          ) {
            lastSessionAt = Date.now();
            isRedirecting = false; // cancela redirecionamento pendente
            auth.setAuth(session.user, session);
            await syncServerSession(session, event);
          } else if (event === 'SIGNED_OUT') {
            auth.clear();
            sessionSynced.set(true);
            // Aguarda um momento para confirmar que realmente não há sessão
            // (pode ser uma race condition durante refresh automático do token).
            // Em rota pública (ex.: logout intencional) não faz nada.
            setTimeout(() => {
              if (cancelled) return;
              void verifySessionOrRedirect('Sessão encerrada (SIGNED_OUT)');
            }, 800);
          }
        }
      );

      unsubscribe = () => subscription.unsubscribe();

      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session) {
        lastSessionAt = Date.now();
        if (hasServerSession) {
          sessionSynced.set(true);
        } else {
          await syncServerSession(session, 'mount');
        }
      } else {
        sessionSynced.set(true);
        // Sem sessão no navegador em rota protegida: vai para o login.
        if (!isPublicRoute(window.location.pathname)) {
          redirectToLogin(
            hasServerSession
              ? 'Sessão inconsistente entre servidor e navegador'
              : 'Sem sessão ativa'
          );
        }
      }
    })();

    const checkSession = async (reason: string) => {
      if (document.visibilityState !== 'visible' || isRedirecting || checkingSession) return;
      checkingSession = true;
      try {
        await verifySessionOrRedirect(reason);
      } finally {
        // Delay antes de permitir nova checagem para evitar lock contention
        setTimeout(() => {
          checkingSession = false;
        }, 2000);
      }
    };

    // Verifica sessão quando a aba volta ao primeiro plano, quando a janela
    // ganha foco e periodicamente — cobre a sessão encerrada pelo sistema
    // enquanto o usuário está parado na mesma tela.
    const handleVisibilityChange = () => void checkSession('Sessão expirada enquanto a aba estava inativa');
    const handleFocus = () => void checkSession('Sessão expirada (foco na janela)');
    const pollTimer = window.setInterval(
      () => void checkSession('Sessão expirada (checagem periódica)'),
      SESSION_POLL_MS
    );
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(pollTimer);
      if (pendingRedirectTimer !== null) window.clearTimeout(pendingRedirectTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  });
</script>

<slot />
