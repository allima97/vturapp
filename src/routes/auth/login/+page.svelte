<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { dev } from '$app/environment';
  import { env as publicEnv } from '$env/dynamic/public';
  import { browserData, isMockMode } from '$lib/db/browserData';
  import type { Session, User } from '$lib/stores/auth';
  import { auth } from '$lib/stores/auth';
  import { toUserMessage } from '$lib/utils/errors';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import TurnstileWidget from '$lib/components/auth/TurnstileWidget.svelte';
  import { FieldCheckbox, FieldInput } from '$lib/components/ui';
  import { Mail, Lock, Eye, EyeOff, AlertCircle, TestTube, Clock } from '$lib/icons';

  let email = '';
  let password = '';
  let showPassword = false;
  let loading = false;
  let error: string | null = null;
  let mockMode = false;
  let sessionExpired = false;
  let turnstileToken = '';
  let turnstileWidget: { reset?: () => void } | null = null;
  let redirectTarget = '/';

  $: turnstileEnabled =
    !mockMode && Boolean(String(publicEnv.PUBLIC_TURNSTILE_SITE_KEY || '').trim());

  type LoginSession = {
    access_token: string;
    refresh_token: string;
  };

  type BrowserSessionResult = {
    data: {
      session?: unknown;
      user?: unknown;
    } | null;
    error: Error | null;
  };

  type LoginResponsePayload = {
    session?: Session | null;
    user?: User | null;
    error?: string;
  };

  function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeout));
    });
  }

  async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          'Tempo esgotado ao tentar entrar. Verifique sua conexão e tente novamente.'
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function syncSessionOnServer(session: LoginSession) {
    const response = await fetchWithTimeout(
      '/api/auth/set-session',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        })
      },
      12000
    );
    const payload = (await response.json().catch(() => ({}))) as LoginResponsePayload;

    if (!response.ok) {
      throw new Error(payload.error || 'Login autenticado, mas o servidor não gravou a sessão.');
    }

    return payload;
  }

  async function syncSessionInBrowser(session: LoginSession) {
    const result = await withTimeout(
      browserData.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token
      }) as Promise<BrowserSessionResult>,
      12000,
      'Tempo esgotado ao sincronizar a sessão no navegador.'
    );

    if (result.error) throw result.error;
    return result.data;
  }

  function normalizeRedirectTarget(value: string | null) {
    if (!value) return '/';

    try {
      const url = new URL(value, window.location.origin);
      if (url.origin !== window.location.origin) return '/';

      const target = `${url.pathname}${url.search}${url.hash}`;
      if (!target || target.startsWith('/auth/login')) return '/';
      return target;
    } catch {
      if (value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/auth/login')) {
        return value;
      }
      return '/';
    }
  }

  async function finishLogin() {
    if (typeof window !== 'undefined') {
      window.location.assign(redirectTarget);
      return;
    }

    await goto(redirectTarget, { invalidateAll: true });
  }

  onMount(() => {
    mockMode = dev && isMockMode();
    // Auto-preenchimento somente no dev local; preview/producao nunca exibem credencial padrao.
    if (mockMode) {
      email = 'admin@vtur.com';
      password = 'admin123';
    }

    // Verifica se foi redirecionado por expiração de sessão
    const params = new URLSearchParams(window.location.search);
    redirectTarget = normalizeRedirectTarget(params.get('next'));
    if (params.get('session_expired') === '1') {
      sessionExpired = true;
      // Limpa a query string para não ficar persistindo no histórico
      if (window.history.replaceState) {
        const cleanedUrl =
          redirectTarget === '/'
            ? '/auth/login'
            : `/auth/login?next=${encodeURIComponent(redirectTarget)}`;
        window.history.replaceState({}, '', cleanedUrl);
      }
    }
  });

  async function handleLogin() {
    if (loading) return;

    if (!email || !password) {
      error = 'Preencha email e senha';
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      error = 'Confirme a verificação de segurança para continuar.';
      return;
    }

    loading = true;
    error = null;

    try {
      if (mockMode) {
        const { data, error: authError } = await browserData.auth.signInWithPassword({
          email,
          password
        });

        if (authError) throw authError;

        if (data.session) {
          auth.setAuth(data.user, data.session);

          await syncSessionOnServer(data.session);
          await finishLogin();
        }
        return;
      }

      const res = await fetchWithTimeout(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            turnstile_token: turnstileToken
          })
        },
        20000
      );
      const payload = (await res.json().catch(() => ({}))) as LoginResponsePayload;
      if (!res.ok) {
        if (res.status === 401) throw new Error('Email ou senha incorretos.');
        if (res.status === 403) {
          throw new Error(
            payload.error || 'Não foi possível validar a verificação de segurança. Tente novamente.'
          );
        }
        throw new Error(payload.error || 'Erro ao fazer login. Tente novamente.');
      }

      const session = payload.session;
      if (!session?.access_token || !session?.refresh_token) {
        throw new Error('Sessão não retornada pelo servidor.');
      }

      await syncSessionOnServer(session);

      // Precisa concluir antes de navegar: a página seguinte lê a sessão do storage do navegador.
      try {
        await syncSessionInBrowser(session);
      } catch (browserSyncError) {
        if (dev)
          console.warn(
            '[login] Sessão gravada no servidor, mas o storage do navegador não respondeu:',
            browserSyncError
          );
      }

      auth.setAuth(payload.user ?? null, session);
      await finishLogin();
    } catch (err: unknown) {
      const message = toUserMessage(err, '');
      error = message || 'Erro ao fazer login';
      if (message.includes('Invalid login')) {
        error = 'Email ou senha incorretos';
      }
      if (turnstileEnabled) {
        turnstileWidget?.reset?.();
      }
    } finally {
      loading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleLogin();
    }
  }
</script>

<svelte:head>
  <title>Login | VTUR</title>
  <meta name="description" content="Acesse o sistema VTUR" />
</svelte:head>

<div class="vtur-auth-shell flex min-h-screen items-center justify-center p-4">
  <div class="w-full max-w-md">
    <!-- Logo -->
    <div class="vtur-auth-brand">
      <div class="vtur-auth-brand-lockup flex flex-col items-center">
        <img
          src="/brand/vtur-app-symbol.png?v=9"
          alt="vtur-app"
          class="vtur-auth-brand-logo mb-2 object-contain"
        />
        <div class="flex flex-col items-center gap-0.5">
          <div
            class="flex items-baseline gap-0"
            style="font-size:2rem;font-weight:800;letter-spacing:-0.01em;line-height:1;"
          >
            <span style="color:#ffffff;font-family:'Segoe UI',system-ui,sans-serif;">vtur-</span
            ><span style="color:#22d3ee;font-family:'Segoe UI',system-ui,sans-serif;">app</span>
          </div>
          <p
            style="color:rgba(255,255,255,0.6);font-size:0.65rem;letter-spacing:0.18em;font-weight:500;font-family:'Segoe UI',system-ui,sans-serif;"
          >
            SIMPLIFICA · CONECTA · EVOLUI
          </p>
        </div>
      </div>
    </div>

    <Card padding="lg">
      {#if mockMode}
        <div
          class="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700"
        >
          <TestTube size={18} />
          <span><strong>Modo de Teste:</strong> Qualquer email/senha funcionam</span>
        </div>
      {/if}

      {#if sessionExpired}
        <div
          class="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700"
        >
          <Clock size={18} class="mt-0.5 shrink-0" />
          <span
            ><strong>Sessão expirada:</strong> Por segurança, sua sessão foi encerrada. Faça login novamente
            para continuar.</span
          >
        </div>
      {/if}

      <h2 class="mb-6 text-center text-xl font-bold text-slate-900">Acesse sua conta</h2>

      {#if error}
        <div
          class="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      {/if}

      <form on:submit|preventDefault={handleLogin} class="space-y-4">
        <!-- Email -->
        <FieldInput
          id="email"
          label="Email"
          type="email"
          bind:value={email}
          on:keydown={handleKeydown}
          placeholder="seu@email.com"
          icon={Mail}
          autocomplete="email"
          disabled={loading}
          class_name="w-full"
        />

        <!-- Senha -->
        <FieldInput
          id="password"
          label="Senha"
          type={showPassword ? 'text' : 'password'}
          bind:value={password}
          on:keydown={handleKeydown}
          placeholder="••••••••"
          icon={Lock}
          actionIcon={showPassword ? EyeOff : Eye}
          actionLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          onAction={() => (showPassword = !showPassword)}
          autocomplete="current-password"
          disabled={loading}
          class_name="w-full"
        />

        <!-- Lembrar-me / Esqueci senha -->
        <div class="flex items-center justify-between text-sm">
          <FieldCheckbox label="Lembrar-me" class_name="text-slate-600" />
          <a href="/auth/recuperar-senha" class="font-medium text-blue-600 hover:text-blue-700">
            Esqueceu a senha?
          </a>
        </div>

        <TurnstileWidget
          bind:this={turnstileWidget}
          bind:token={turnstileToken}
          disabled={loading}
          action="login"
        />

        <!-- Botão Login -->
        <Button type="submit" variant="primary" size="lg" {loading} class_name="w-full">
          Entrar
        </Button>
      </form>

      <!-- Convite -->
      <div class="mt-6 text-center text-sm">
        <span class="text-slate-500">Recebeu um convite?</span>
        <a href="/auth/convite" class="ml-1 font-medium text-blue-600 hover:text-blue-700">
          Ativar conta
        </a>
      </div>
    </Card>

    <!-- Footer -->
    <p class="vtur-auth-footer mt-8 text-center text-sm">
      © {new Date().getFullYear()} VTUR. Todos os direitos reservados.
    </p>
  </div>
</div>
