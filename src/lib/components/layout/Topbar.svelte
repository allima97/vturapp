<script lang="ts">
  import { onDestroy } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { Dropdown, DropdownItem, DropdownDivider, Tooltip } from '$lib/components/ui';
  import { auth } from '$lib/stores/auth';
  import { sidebar, isMobile, toast } from '$lib/stores/ui';
  import { Bell, Calendar, Calculator, LogOut, Search, User, Settings, Shield } from '$lib/icons';
  import CommandPalette from './CommandPalette.svelte';
  import { toUserMessage } from '$lib/utils/errors';

  let loggingOut = false;
  let userDropdownOpen = false;
  let showCalculator = false;
  let showBusca = false;
  // Fase 5.1: no Mac o atalho é ⌘K; nos demais, Ctrl+K.
  const atalhoBusca =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K';
  let CalculatorModalComponent: typeof import('$lib/components/modais/CalculatorModal.svelte').default | null = null;
  let calculatorLoadPromise: Promise<boolean> | null = null;
  let logoutController: AbortController | null = null;

  $: currentUser = $auth.user;
  $: userDisplayName =
    currentUser?.user_metadata?.nome_completo ||
    currentUser?.user_metadata?.nome ||
    currentUser?.email?.split('@')[0] ||
    'Usuario';
  $: userEmail = currentUser?.email || 'Sem email';
  $: userInitials = (userDisplayName.match(/[^ ]+/g) || [])
    .slice(0, 2)
    .map((part: string) => part[0])
    .join('')
    .toUpperCase();

  function openRecadosInfo() {
    toast.info('Mural de recados será portado na próxima etapa.');
  }

  async function ensureCalculatorLoaded() {
    if (CalculatorModalComponent) return true;
    if (calculatorLoadPromise) return calculatorLoadPromise;

    calculatorLoadPromise = import('$lib/components/modais/CalculatorModal.svelte')
      .then((module) => {
        CalculatorModalComponent = module.default;
        return true;
      })
      .catch((err) => {
        toast.error(toUserMessage(err, 'Erro ao carregar calculadora.'));
        return false;
      })
      .finally(() => {
        calculatorLoadPromise = null;
      });

    return calculatorLoadPromise;
  }

  async function openCalculator() {
    showCalculator = await ensureCalculatorLoaded();
  }

  async function handleLogout() {
    if (loggingOut) return;
    loggingOut = true;
    logoutController?.abort();
    logoutController = new AbortController();
    try {
      const response = await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: logoutController.signal
      });
      if (!response.ok) throw new Error('logout_failed');
      // Usa window.location.assign em vez de goto() para evitar uncaught promise
      // quando o Supabase dispara SIGNED_OUT via BroadcastChannel ao mesmo tempo
      window.location.assign('/auth/login');
    } catch {
      toast.error('Erro ao fazer logout.');
      loggingOut = false;
    }
  }

  onDestroy(() => {
    logoutController?.abort();
  });
</script>

<header class="vtur-topbar">
  <div class="vtur-topbar__inner">
    <!-- Esquerda: brand (mobile: só logo; desktop: logo + nome) -->
    <div class="vtur-topbar__left">
      <a href="/" class="vtur-topbar__brand" aria-label="VTUR, página inicial">
        <img src="/brand/vtur-symbol.png?v=9" alt="VTUR" class="vtur-topbar__brand-image" />
        {#if !$isMobile}
          <div class="vtur-topbar__brand-copy">
            <span class="vtur-topbar__brand-wordmark">VTUR</span>
            <span class="vtur-topbar__brand-tagline">CRM para agências de viagens</span>
          </div>
        {/if}
      </a>
    </div>

    <!-- Direita: ações + avatar -->
    <div class="vtur-topbar__actions">
      <!-- Busca rápida no menu (Fase 5.1) -->
      {#if $isMobile}
        <Button
          id="topbar-btn-busca"
          type="button"
          variant="unstyled"
          size="sm"
          class_name="vtur-icon-button h-10! w-10! rounded-xl! p-0!"
          ariaLabel="Buscar tela"
          ariaHaspopup="dialog"
          on:click={() => (showBusca = true)}
        >
          <Search size={18} />
        </Button>
      {:else}
        <Button
          id="topbar-btn-busca"
          type="button"
          variant="unstyled"
          size="sm"
          class_name="vtur-icon-button h-10! w-auto! gap-2 rounded-xl! px-3! text-sm font-medium"
          ariaLabel={`Buscar tela (${atalhoBusca})`}
          ariaHaspopup="dialog"
          on:click={() => (showBusca = true)}
        >
          <Search size={16} />
          <span>Buscar</span>
          <kbd class="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-sans text-[11px] opacity-80" aria-hidden="true">{atalhoBusca}</kbd>
        </Button>
      {/if}

      {#if !$isMobile}
        <!-- Calculadora -->
        <Button
          id="topbar-btn-calc"
          type="button"
          variant="unstyled"
          size="sm"
          class_name="vtur-icon-button h-10! w-10! rounded-xl! p-0!"
          ariaLabel="Calculadora"
          on:click={openCalculator}
        >
          <Calculator size={18} />
        </Button>
        <Tooltip triggeredBy="#topbar-btn-calc" placement="bottom">Calculadora</Tooltip>

        <!-- Agenda -->
        <Button
          id="topbar-btn-agenda"
          href="/operacao/agenda"
          variant="unstyled"
          size="sm"
          class_name="vtur-icon-button h-10! w-10! rounded-xl! p-0!"
          ariaLabel="Ir para Agenda"
        >
          <Calendar size={18} />
        </Button>
        <Tooltip triggeredBy="#topbar-btn-agenda" placement="bottom">Agenda</Tooltip>

        <!-- Recados -->
        <Button
          id="topbar-btn-bell"
          type="button"
          variant="unstyled"
          size="sm"
          class_name="vtur-icon-button relative h-10! w-10! rounded-xl! p-0!"
          on:click={openRecadosInfo}
          ariaLabel="Recados"
        >
          <Bell size={18} />
        </Button>
        <Tooltip triggeredBy="#topbar-btn-bell" placement="bottom">Recados</Tooltip>
      {/if}

      <!-- Avatar com dropdown (sempre visível) -->
      <div class="relative">
        <Button
          id="user-menu-btn"
          type="button"
          variant="unstyled"
          class_name="vtur-user-chip cursor-pointer transition-all hover:shadow-md focus:outline-hidden focus:ring-2 focus:ring-blue-200"
          ariaLabel="Menu do usuário"
          ariaHaspopup="true"
          ariaExpanded={userDropdownOpen}
          on:click={() => (userDropdownOpen = !userDropdownOpen)}
        >
          <div class="vtur-user-chip__avatar">{userInitials || 'VT'}</div>
          {#if !$isMobile}
            <div class="vtur-user-chip__copy">
              <span class="vtur-user-chip__name">{userDisplayName}</span>
              <span class="vtur-user-chip__email">{userEmail}</span>
            </div>
          {/if}
        </Button>

        <Dropdown
          triggeredBy="#user-menu-btn"
          bind:open={userDropdownOpen}
          class_name="z-1100 min-w-[200px]"
        >
          <div class="px-4 py-3">
            <p class="truncate text-xs font-medium text-slate-800">{userDisplayName}</p>
            <p class="truncate text-xs text-slate-500">{userEmail}</p>
          </div>
          <DropdownDivider />
          <DropdownItem href="/perfil" on:click={() => (userDropdownOpen = false)}>
            <User size={15} class="mr-2 text-slate-500" />
            Meu Perfil
          </DropdownItem>
          <DropdownItem href="/operacao/agenda" on:click={() => (userDropdownOpen = false)}>
            <Calendar size={15} class="mr-2 text-slate-500" />
            Minha Agenda
          </DropdownItem>
          <DropdownItem href="/perfil/mfa" on:click={() => (userDropdownOpen = false)}>
            <Shield size={15} class="mr-2 text-slate-500" />
            Autenticação 2FA
          </DropdownItem>
          <DropdownItem href="/parametros" on:click={() => (userDropdownOpen = false)}>
            <Settings size={15} class="mr-2 text-slate-500" />
            Parâmetros
          </DropdownItem>
          <DropdownDivider />
          <DropdownItem
            on:click={() => { userDropdownOpen = false; handleLogout(); }}
            class_name="text-red-600 hover:bg-red-50"
          >
            <LogOut size={15} class="mr-2" />
            {loggingOut ? 'Saindo...' : 'Sair'}
          </DropdownItem>
        </Dropdown>
      </div>
    </div>
  </div>
</header>

{#if CalculatorModalComponent}
  <svelte:component
    this={CalculatorModalComponent}
    bind:open={showCalculator}
    onClose={() => (showCalculator = false)}
  />
{/if}

<CommandPalette bind:open={showBusca} />
