<script lang="ts">
  import { Alert } from './flowbite-legacy';
  import type { Component } from 'svelte';
  import Button from './Button.svelte';
  import {
    InfoCircleSolid,
    CheckCircleSolid,
    ExclamationCircleSolid,
    CloseCircleSolid
  } from 'flowbite-svelte-icons';

  type AlertVariant = 'error' | 'success' | 'info' | 'warning';

  export let variant: AlertVariant = 'info';
  export let message = '';
  export let dismissable = false;
  export let title: string | null = null;

  let dismissed = false;

  const colorMap: Record<AlertVariant, 'blue' | 'green' | 'yellow' | 'red'> = {
    info: 'blue',
    success: 'green',
    warning: 'yellow',
    error: 'red'
  };

  const IconMap: Record<AlertVariant, Component> = {
    info: InfoCircleSolid,
    success: CheckCircleSolid,
    warning: ExclamationCircleSolid,
    error: CloseCircleSolid
  };

  $: color = colorMap[variant];
  $: Icon = IconMap[variant];
</script>

{#if (message || $$slots.default) && !dismissed}
  <Alert {color} class="mb-3 flex items-start gap-3 text-sm">
    <svelte:component this={Icon} slot="icon" class="h-5 w-5 shrink-0" />
    <div class="min-w-0 flex-1">
      {#if title}
        <p class="mb-0.5 font-semibold">{title}</p>
      {/if}
      {#if message}<p class="m-0">{message}</p>{/if}
      <slot />
    </div>
    {#if dismissable}
      <Button
        type="button"
        variant="unstyled"
        size="xs"
        class_name="-mr-1 ml-auto shrink-0 rounded-lg! p-1! transition-colors hover:bg-black/10"
        ariaLabel="Fechar"
        on:click={() => (dismissed = true)}
      >
        <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path
            fill-rule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
      </Button>
    {/if}
  </Alert>
{/if}
