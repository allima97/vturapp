<script lang="ts">
  import { ChevronRight, Home } from '$lib/icons';
  import type { Component, ComponentType, SvelteComponent } from 'svelte';
  import Button from './Button.svelte';

  type IconProps = { class?: string; size?: number | string };
  type IconComponent = Component<IconProps> | ComponentType<SvelteComponent<IconProps>>;

  interface Breadcrumb {
    label: string;
    href?: string;
  }

  interface Action {
    label: string;
    onClick?: (e: MouseEvent) => void;
    href?: string;
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    icon?: IconComponent;
    loading?: boolean;
  }

  export let title: string;
  export let subtitle: string | null = null;
  export let breadcrumbs: Breadcrumb[] = [];
  export let actions: Action[] = [];
  export let color: string | null = null;

  const accentClasses = {
    clientes: 'from-blue-600 to-cyan-500',
    vendas: 'from-green-600 to-emerald-500',
    financeiro: 'from-orange-600 to-amber-500',
    operacao: 'from-teal-600 to-cyan-500',
    orcamentos: 'from-blue-600 to-indigo-500',
    crm: 'from-purple-600 to-fuchsia-500',
    blue: 'from-blue-600 to-cyan-500',
    green: 'from-green-600 to-emerald-500',
    orange: 'from-orange-600 to-amber-500',
    teal: 'from-teal-600 to-cyan-500'
  };

  type AccentColor = keyof typeof accentClasses;

  function resolveAccentClass(value: string | null): string {
    if (value && value in accentClasses) {
      return accentClasses[value as AccentColor];
    }

    return 'from-slate-900 to-slate-500';
  }

  $: accentClass = resolveAccentClass(color);
</script>

<div class="vtur-page-header mb-4 sm:mb-6">
  {#if breadcrumbs.length > 0}
    <nav
      aria-label="Trilha de navegação"
      class="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-slate-500"
    >
      <a
        href="/"
        class="rounded-sm transition-colors hover:text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-300"
        aria-label="Início"
        title="Início"
      >
        <Home size={14} aria-hidden="true" />
      </a>
      {#each breadcrumbs as crumb, i}
        <ChevronRight size={14} class="text-slate-400" aria-hidden="true" />
        {#if crumb.href && i < breadcrumbs.length - 1}
          <a
            href={crumb.href}
            class="rounded-sm transition-colors hover:text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            {crumb.label}
          </a>
        {:else}
          <span
            class="font-medium text-slate-900"
            aria-current={i === breadcrumbs.length - 1 ? 'page' : undefined}>{crumb.label}</span
          >
        {/if}
      {/each}
    </nav>
  {/if}

  <div class="vtur-card px-4 py-3 sm:px-5 sm:py-4">
    <div
      class="mb-3 h-1 w-14 rounded-full bg-gradient-to-r {accentClass} sm:mb-4 sm:h-1.5 sm:w-20"
    ></div>

    <div class="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="min-w-0 flex-1">
        <h1
          class="text-xl leading-tight font-semibold tracking-tight text-slate-900 sm:text-[1.7rem]"
        >
          {title}
        </h1>
        {#if subtitle}
          <p
            class="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 sm:line-clamp-none sm:text-sm sm:leading-6"
          >
            {subtitle}
          </p>
        {/if}
      </div>

      {#if actions.length > 0}
        <div
          class="flex flex-col items-stretch gap-2 sm:shrink-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"
        >
          {#each actions as action}
            {#if action.href}
              <Button
                href={action.href}
                variant={action.variant || 'primary'}
                size="sm"
                class_name="min-h-[40px] w-full sm:min-h-0 sm:w-auto"
              >
                {#if action.icon}
                  <svelte:component this={action.icon} size={16} class="mr-1.5" />
                {/if}
                {action.label}
              </Button>
            {:else}
              <Button
                on:click={(e) => action.onClick?.(e)}
                variant={action.variant || 'primary'}
                size="sm"
                loading={action.loading || false}
                class_name="min-h-[40px] w-full sm:min-h-0 sm:w-auto"
              >
                {#if action.icon}
                  <svelte:component this={action.icon} size={16} class="mr-1.5" />
                {/if}
                {action.label}
              </Button>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
