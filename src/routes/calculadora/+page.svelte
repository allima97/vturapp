<script lang="ts">
  import { dev } from '$app/environment';
  import { onMount } from 'svelte';
  import { Calculator, TrendingDown, Download, Smartphone, X } from '$lib/icons';
  import CalculatorBody from '$lib/components/calculadora/CalculatorBody.svelte';
  import ConcorrenciaTab from '$lib/components/modais/ConcorrenciaTab.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Tabs from '$lib/components/ui/Tabs.svelte';

  type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
  };

  let abaAtiva = 'calculadora';
  let showInstallHint = false;
  let isInstalled = false;
  let canGoBack = false;
  let deferredPrompt: BeforeInstallPromptEvent | null = null;

  const abas = [
    { key: 'calculadora', label: 'Calculadora', icon: Calculator },
    { key: 'concorrencia', label: 'Concorrência', icon: TrendingDown }
  ];

  onMount(() => {
    canGoBack = window.history.length > 1;

    // Detecta se já está instalado (standalone ou fullscreen)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      isInstalled = true;
    }

    // Captura o evento beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      showInstallHint = true;
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      isInstalled = true;
      showInstallHint = false;
    });

    // Registra Service Worker dedicado da calculadora
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw-calculadora.js', { scope: '/calculadora' })
        .then((reg) => {
          if (dev) console.info('[SW Calculadora] registrado:', reg.scope);
        })
        .catch((err) => {
          if (dev) console.error('[SW Calculadora] erro:', err);
        });
    }
  });

  async function installPwa() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      deferredPrompt = null;
    }
  }

  function closeStandaloneCalculator() {
    if (canGoBack) {
      window.history.back();
      return;
    }
    window.location.assign('/');
  }
</script>

<svelte:head>
  <title>VTUR Calculadora</title>
  <meta name="description" content="Calculadora e análise de concorrência VTUR" />
  <meta name="theme-color" content="#1e1b4b" />
  <link rel="manifest" href="/manifest-calculadora.webmanifest?v=9" />
</svelte:head>

<div class="bg-slate-200 px-3 py-3 sm:px-4 sm:py-6">
  <!-- Container: max-w-2xl para calculadora, max-w-5xl para concorrência -->
  <main
    class="mx-auto w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl transition-all duration-200"
    class:max-w-2xl={abaAtiva === 'calculadora'}
    class:max-w-5xl={abaAtiva === 'concorrencia'}
  >
    <div class="vtur-modal-header bg-vendas-50 border-b border-slate-100">
      <div class="vtur-modal-header__lead">
        <div class="vtur-modal-header__icon bg-vendas-100">
          <Calculator size={24} class="text-vendas-600" />
        </div>
        <div class="vtur-modal-header__copy">
          <h1 class="vtur-modal-header__title">Calculadora</h1>
          <p class="vtur-modal-header__subtitle">Operações rápidas no padrão visual do sistema</p>
        </div>
      </div>
      {#if !isInstalled && showInstallHint}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class_name="vtur-modal-header__close p-2 text-vendas-700 hover:bg-vendas-100"
          ariaLabel="Instalar calculadora"
          on:click={installPwa}
        >
          <Download size={14} />
          <span class="hidden sm:inline">Instalar</span>
        </Button>
      {/if}
    </div>

    <div class="vtur-modal-tabs">
      <Tabs items={abas} bind:activeKey={abaAtiva} />
    </div>

    <div
      class="vtur-modal-body-dense"
      style={abaAtiva === 'calculadora'
        ? 'padding: 0.875rem 1rem; max-height: none; overflow: visible;'
        : undefined}
    >
      {#if !isInstalled && showInstallHint}
        <div
          class="mb-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
        >
          <Smartphone size={16} class="mt-0.5 shrink-0" />
          <div class="flex-1">
            <p class="font-medium">Instale no seu celular ou computador</p>
            <p class="mt-0.5 text-xs text-amber-700">
              <span class="hidden sm:inline"
                >Clique em Instalar no cabeçalho ou use o menu do navegador.</span
              >
              <span class="sm:hidden"
                >Toque em ⋮ (Chrome) ou Compartilhar e depois Adicionar à Tela de Início (Safari).</span
              >
            </p>
          </div>
          <Button
            type="button"
            variant="unstyled"
            size="xs"
            class_name="p-0 text-amber-500 hover:text-amber-700"
            ariaLabel="Fechar dica de instalação"
            on:click={() => (showInstallHint = false)}
          >
            <X size={14} />
          </Button>
        </div>
      {/if}

      {#if abaAtiva === 'concorrencia'}
        <ConcorrenciaTab />
      {:else}
        <CalculatorBody />
      {/if}
    </div>

    <div class="vtur-modal-footer vtur-modal-footer--between border-t border-slate-100 bg-white">
      <div class="text-xs text-slate-500">VTUR - Calculadora e Concorrência</div>
      <div class="vtur-modal-footer__actions">
        <span class="text-xs text-slate-500">Funciona offline após a primeira visita</span>
        <Button type="button" variant="secondary" on:click={closeStandaloneCalculator}>
          {canGoBack ? 'Voltar' : 'Fechar'}
        </Button>
      </div>
    </div>
  </main>
</div>
