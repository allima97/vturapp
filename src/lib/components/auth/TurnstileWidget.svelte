<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { env as publicEnv } from '$env/dynamic/public';

  export let token = '';
  export let disabled = false;
  export let action = 'auth';
  type TurnstileTheme = 'light' | 'dark' | 'auto';

  export let theme: TurnstileTheme = 'light';
  export let class_name = '';

  let container: HTMLDivElement | null = null;
  let widgetId: string | number | null = null;
  let loading = false;
  let widgetError: string | null = null;

  type TurnstileWidgetId = string | number;
  type TurnstileApi = {
    render: (
      container: HTMLElement,
      options: {
        sitekey: string;
        action: string;
        theme: TurnstileTheme;
        callback: (value: string) => void;
        'expired-callback': () => void;
        'error-callback': () => void;
      }
    ) => TurnstileWidgetId;
    reset: (widgetId: TurnstileWidgetId) => void;
    remove: (widgetId: TurnstileWidgetId) => void;
  };

  type WindowWithTurnstile = Window & {
    turnstile?: TurnstileApi;
  };

  const siteKey = String(publicEnv.PUBLIC_TURNSTILE_SITE_KEY || '').trim();
  const enabled = Boolean(siteKey);

  function getTurnstile() {
    return browser ? (window as WindowWithTurnstile).turnstile || null : null;
  }

  function loadScript(): Promise<void> {
    if (!browser || getTurnstile()) return Promise.resolve();

    const scriptId = 'cloudflare-turnstile-script';
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existing) {
      return new Promise((resolve, reject) => {
        if (getTurnstile()) {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error('Falha ao carregar Turnstile.')),
          {
            once: true
          }
        );
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar Turnstile.'));
      document.head.appendChild(script);
    });
  }

  async function renderWidget() {
    if (!enabled || !container || widgetId !== null) return;
    loading = true;
    widgetError = null;

    try {
      await loadScript();
      const turnstile = getTurnstile();
      if (!turnstile || !container) throw new Error('Turnstile indisponível.');

      widgetId = turnstile.render(container, {
        sitekey: siteKey,
        action,
        theme,
        callback: (value: string) => {
          token = value;
          widgetError = null;
        },
        'expired-callback': () => {
          token = '';
        },
        'error-callback': () => {
          token = '';
          widgetError = 'Não foi possível validar o desafio. Tente novamente.';
        }
      });
    } catch {
      widgetError = 'Não foi possível carregar a verificação de segurança.';
    } finally {
      loading = false;
    }
  }

  export function reset() {
    token = '';
    const turnstile = getTurnstile();
    if (turnstile && widgetId !== null) {
      try {
        turnstile.reset(widgetId);
      } catch {
        // widget pode ter sido removido pelo Turnstile; a próxima montagem recria.
      }
    }
  }

  onMount(() => {
    void renderWidget();
  });

  onDestroy(() => {
    const turnstile = getTurnstile();
    if (turnstile && widgetId !== null) {
      try {
        turnstile.remove(widgetId);
      } catch {
        // não interrompe desmontagem
      }
    }
    widgetId = null;
  });
</script>

{#if enabled}
  <div class={class_name}>
    <div class:opacity-60={disabled} class:pointer-events-none={disabled}>
      <div bind:this={container}></div>
    </div>
    {#if loading}
      <p class="mt-1 text-xs text-slate-400">Carregando verificação de segurança...</p>
    {/if}
    {#if widgetError}
      <p class="mt-1 text-xs text-red-600">{widgetError}</p>
    {/if}
  </div>
{/if}
