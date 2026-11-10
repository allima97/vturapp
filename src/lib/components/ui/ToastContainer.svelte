<script lang="ts">
  import { fly } from 'svelte/transition';
  import { X } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import type { Toast } from '$lib/stores/ui';
  import Button from './Button.svelte';

  type ToastType = Toast['type'];

  const iconMap: Record<ToastType, string> = {
    success: 'text-green-500',
    error: 'text-red-500',
    warning: 'text-orange-400',
    info: 'text-blue-500'
  };

  const bgMap: Record<ToastType, string> = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-orange-400',
    info: 'bg-blue-500'
  };

  // Ícone SVG inline por tipo
  const svgPaths: Record<ToastType, string> = {
    success:
      'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z',
    error:
      'M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z',
    warning:
      'M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z',
    info: 'M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z'
  };
</script>

<div
  class="pointer-events-none fixed top-[calc(var(--vtur-topbar-height,4.6rem)+0.75rem)] right-4 z-2000 flex flex-col gap-2"
>
  {#each $toast as item (item.id)}
    <div
      class="pointer-events-auto relative flex max-w-xs min-w-[260px] items-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg"
      in:fly={{ x: 60, duration: 220 }}
      out:fly={{ x: 60, duration: 180 }}
      role={item.type === 'error' || item.type === 'warning' ? 'alert' : 'status'}
      aria-live={item.type === 'error' || item.type === 'warning' ? 'assertive' : 'polite'}
    >
      <!-- Ícone colorido -->
      <svg
        class="h-5 w-5 shrink-0 {iconMap[item.type] ?? 'text-blue-500'}"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path fill-rule="evenodd" d={svgPaths[item.type] ?? svgPaths.info} clip-rule="evenodd" />
      </svg>

      <!-- Mensagem -->
      <span class="flex-1 text-sm font-medium text-slate-800">{item.message}</span>

      <!-- Fechar -->
      <Button
        variant="ghost"
        size="xs"
        title="Fechar"
        ariaLabel="Fechar aviso"
        on:click={() => toast.remove(item.id)}
      >
        <X size={14} aria-hidden="true" />
      </Button>

      <!-- Barra colorida de progresso no topo -->
      <div
        class="absolute top-0 left-0 h-1 w-full rounded-t-xl {bgMap[item.type] ??
          'bg-blue-500'} opacity-70"
      ></div>
    </div>
  {/each}
</div>
