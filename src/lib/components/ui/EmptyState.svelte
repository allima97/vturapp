<script lang="ts">
  import type { Component, ComponentType, SvelteComponent } from 'svelte';
  import Button from './Button.svelte';

  type IconProps = { class?: string; size?: number | string };
  type IconComponent = Component<IconProps> | ComponentType<SvelteComponent<IconProps>>;

  export let title = 'Nenhum resultado encontrado';
  export let message = 'Não há dados para exibir no momento.';
  export let icon: IconComponent | null = null; // componente Lucide opcional

  // Ações opcionais — totalmente retrocompatível; sem estas props o componente
  // se comporta exatamente como antes (slot continua funcionando).
  export let actionLabel: string | undefined = undefined;
  export let onAction: (() => void) | undefined = undefined;
  export let secondaryActionLabel: string | undefined = undefined;
  export let onSecondaryAction: (() => void) | undefined = undefined;
  export let className = '';
</script>

<div class="flex flex-col items-center justify-center px-6 py-14 text-center {className}">
  <!-- Ícone com fundo suave -->
  <div class="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
    {#if icon}
      <svelte:component this={icon} size={36} class="text-slate-400" />
    {:else}
      <!-- Inbox vazio — ícone genérico de caixa -->
      <svg
        class="h-9 w-9 text-slate-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
        />
      </svg>
    {/if}
  </div>

  <h3 class="mb-1.5 text-base font-semibold text-slate-800">{title}</h3>
  <p class="mb-5 max-w-sm text-sm leading-relaxed text-slate-500">{message}</p>

  <!-- Botões de ação (novos, opcionais) -->
  {#if actionLabel && onAction}
    <div class="flex flex-wrap items-center justify-center gap-3">
      <Button variant="primary" size="sm" on:click={onAction}>
        {actionLabel}
      </Button>
      {#if secondaryActionLabel && onSecondaryAction}
        <Button variant="outline" size="sm" on:click={onSecondaryAction}>
          {secondaryActionLabel}
        </Button>
      {/if}
    </div>
  {/if}

  <!-- Slot legado — mantido para não quebrar usos existentes -->
  <slot />
</div>
