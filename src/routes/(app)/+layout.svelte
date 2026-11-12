<script lang="ts">
  import { onMount } from 'svelte';
  import { dev } from '$app/environment';
  import { get } from 'svelte/store';
  import Sidebar from '$lib/components/layout/Sidebar.svelte';
  import Topbar from '$lib/components/layout/Topbar.svelte';
  import AtribuicaoGeoNames from '$lib/components/AtribuicaoGeoNames.svelte';
  import GlobalConfirmDialog from '$lib/components/ui/GlobalConfirmDialog.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
  import { sidebar, isMobile } from '$lib/stores/ui';
  import { sessionSynced, auth } from '$lib/stores/auth';
  import { permissoes } from '$lib/stores/permissoes';
  import { toUserMessage } from '$lib/utils/errors';
  import { createBrowserDataClient } from '$lib/db/browserData';

  let appReady = false;
  let permsInitialized = false;

  function handleResize() {
    sidebar.setMobile(window.innerWidth < 1024);
  }

  async function initPermissoes() {
    try {
      const dados = createBrowserDataClient();
      await permissoes.init(dados);
    } catch (err) {
      if (dev) console.error('[AppLayout] Erro ao inicializar permissoes:', err);
      const message = toUserMessage(err, '').toLowerCase();
      if (
        message.includes('sessao invalida') ||
        message.includes('login novamente') ||
        message.includes('permission denied') ||
        message.includes('row-level security') ||
        message.includes('jwt')
      ) {
        try {
          const dados = createBrowserDataClient();
          // Erro de permissão não é sessão inválida: só desloga se não houver sessão.
          const {
            data: { session }
          } = await dados.auth.getSession();
          if (session) return;
          await dados.auth.signOut();
        } catch {
          // Sem confirmar a ausência de sessão, não desloga o usuário.
          return;
        }
        const next = `${window.location.pathname}${window.location.search || ''}`;
        window.location.assign(`/auth/login?session_expired=1&next=${encodeURIComponent(next)}`);
      }
    }
  }

  onMount(() => {
    handleResize();

    const startApp = () => {
      // Libera a tela imediatamente — permissões carregam em background.
      // Aguardar initPermissoes() aqui bloqueava appReady por 4+ queries Dados,
      // causando tela branca após navegações client-side.
      appReady = true;
      const currentState = get(auth);
      if (currentState.user && !permsInitialized) {
        permsInitialized = true;
        void initPermissoes();
      }
    };

    if (get(sessionSynced)) {
      startApp();
      return;
    }

    const timeout = setTimeout(() => {
      appReady = true;
    }, 3000);

    const unsub = sessionSynced.subscribe((ready) => {
      if (ready) {
        clearTimeout(timeout);
        unsub();
        startApp();
      }
    });

    return () => {
      clearTimeout(timeout);
      unsub();
    };
  });

  // Reinicializa permissões quando o usuário muda (ex: após troca de conta)
  $: if ($auth.user && $auth.user.id && appReady && !$permissoes.ready && !$permissoes.loading) {
    void initPermissoes();
  }
</script>

<svelte:window on:resize={handleResize} />

<ToastContainer />
<GlobalConfirmDialog />

<div class="vtur-app-shell">
  <a href="#conteudo-principal" class="vtur-skip-link">Pular para o conteúdo</a>
  <Topbar />
  <Sidebar />

  <main
    id="conteudo-principal"
    tabindex="-1"
    class="vtur-layout"
    style={$isMobile
      ? 'margin-left:0;padding-top:calc(var(--vtur-topbar-height) + 1rem);padding-left:0.75rem;padding-right:0.75rem;padding-bottom:calc(72px + env(safe-area-inset-bottom,0px));'
      : ''}
  >
    <div class="vtur-page-wrap">
      {#if appReady}
        <slot />
      {:else}
        <LoadingState className="min-h-[60vh]" />
      {/if}
    </div>
    <footer aria-label="Créditos de dados geográficos" class="mt-8 pb-4 text-right">
      <AtribuicaoGeoNames />
    </footer>
  </main>
</div>
