<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { page } from '$app/stores';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldInput } from '$lib/components/ui';
  import type { ModuleColor } from '$lib/theme/colors';
  import { MODULE_COLORS } from '$lib/theme/colors';
  import { Menu, Bell, Search, User } from '$lib/icons';

  export let moduleColor: ModuleColor = 'default';

  const dispatch = createEventDispatcher();

  $: colors = MODULE_COLORS[moduleColor];

  // Título da página baseado na rota
  $: pageTitle = (() => {
    const path = $page.url.pathname;
    if (path === '/') return 'Dashboard';
    if (path.startsWith('/clientes')) return 'Clientes';
    if (path.startsWith('/vendas')) return 'Vendas';
    if (path.startsWith('/financeiro')) return 'Financeiro';
    if (path.startsWith('/parametros')) return 'Parâmetros';
    return 'VTUR';
  })();
</script>

<header
  class="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-6"
>
  <!-- Left: Menu button + Title -->
  <div class="flex items-center">
    <Button
      variant="ghost"
      size="sm"
      class_name="mr-3 lg:hidden p-2"
      ariaLabel="Abrir menu lateral"
      on:click={() => dispatch('toggleSidebar')}
    >
      <Menu size={20} />
    </Button>

    <h1 class="text-lg font-semibold text-gray-900" style="color: {colors.primary}">
      {pageTitle}
    </h1>
  </div>

  <!-- Right: Actions -->
  <div class="flex items-center space-x-4">
    <!-- Search (desktop) -->
    <div class="hidden w-64 md:block">
      <FieldInput id="header-search" placeholder="Buscar..." icon={Search} class_name="w-full" />
    </div>

    <!-- Notifications -->
    <Button
      variant="ghost"
      size="sm"
      class_name="relative p-2 rounded-full"
      ariaLabel="Notificações"
    >
      <Bell size={20} />
      <span
        class="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"
      ></span>
    </Button>

    <!-- User menu -->
    <Button
      variant="ghost"
      size="sm"
      class_name="flex items-center space-x-2 p-1 rounded-full"
      ariaLabel="Menu do usuário"
    >
      <div
        class="flex h-8 w-8 items-center justify-center rounded-full text-white"
        style="background-color: {colors.primary}"
      >
        <User size={16} />
      </div>
    </Button>
  </div>
</header>
