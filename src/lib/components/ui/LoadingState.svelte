<script lang="ts">
  import type { ComponentType } from 'svelte';

  export let title = 'Carregando registros';
  export let message = 'Aguarde enquanto o sistema busca os dados da tabela.';
  export let icon: ComponentType | null = null;
  export let compact = false;
  export let className = '';
  export let rows: number | null = null;
  export let variant: 'page' | 'table' | 'cards' | 'form' = 'page';

  $: icon;
  $: skeletonRows = rows ?? (compact ? 3 : variant === 'table' ? 6 : 4);
  $: accessibleLabel = `${title}. ${message}`;

  const widths = ['w-2/3', 'w-1/2', 'w-5/6', 'w-3/5', 'w-4/5', 'w-2/5'];
</script>

<div
  class={`w-full ${compact ? 'px-3 py-3' : 'px-4 py-6'} ${className}`.trim()}
  role="status"
  aria-live="polite"
  aria-label={accessibleLabel}
>
  <span class="sr-only">{accessibleLabel}</span>

  {#if compact}
    <div
      class="mx-auto w-full max-w-xl animate-pulse rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-xs"
    >
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 shrink-0 rounded-xl bg-slate-100"></div>
        <div class="min-w-0 flex-1 space-y-2">
          <div class="h-3 w-1/2 rounded-full bg-slate-100"></div>
          <div class="h-3 w-4/5 rounded-full bg-slate-100"></div>
        </div>
      </div>
    </div>
  {:else if variant === 'table'}
    <div
      class="w-full animate-pulse overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xs"
    >
      <div class="grid grid-cols-5 gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3">
        {#each Array(5) as _, index}
          <div class={`h-3 rounded-full bg-slate-200 ${widths[index % widths.length]}`}></div>
        {/each}
      </div>
      <div class="divide-y divide-slate-100">
        {#each Array(skeletonRows) as _, rowIndex}
          <div class="grid grid-cols-5 gap-4 px-5 py-4">
            {#each Array(5) as _, colIndex}
              <div
                class={`h-3 rounded-full bg-slate-100 ${widths[(rowIndex + colIndex) % widths.length]}`}
              ></div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {:else if variant === 'cards'}
    <div class="grid w-full animate-pulse grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {#each Array(skeletonRows) as _, index}
        <div class="rounded-xl border border-slate-100 bg-white p-4 shadow-xs">
          <div class="mb-4 h-10 w-10 rounded-xl bg-slate-100"></div>
          <div class="space-y-2">
            <div class={`h-3 rounded-full bg-slate-100 ${widths[index % widths.length]}`}></div>
            <div class="h-6 w-24 rounded-full bg-slate-100"></div>
            <div class="h-3 w-3/5 rounded-full bg-slate-100"></div>
          </div>
        </div>
      {/each}
    </div>
  {:else if variant === 'form'}
    <div class="w-full animate-pulse rounded-xl border border-slate-100 bg-white p-5 shadow-xs">
      <div class="mb-6 h-5 w-48 rounded-full bg-slate-100"></div>
      <div class="grid gap-4 md:grid-cols-2">
        {#each Array(skeletonRows) as _, index}
          <div class="space-y-2">
            <div class={`h-3 rounded-full bg-slate-100 ${widths[index % widths.length]}`}></div>
            <div class="h-10 rounded-lg bg-slate-100"></div>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="w-full animate-pulse space-y-5">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {#each Array(4) as _, index}
          <div class="rounded-xl border border-slate-100 bg-white p-4 shadow-xs">
            <div class="flex items-start gap-3">
              <div class="h-10 w-10 shrink-0 rounded-xl bg-slate-100"></div>
              <div class="min-w-0 flex-1 space-y-2">
                <div class={`h-3 rounded-full bg-slate-100 ${widths[index % widths.length]}`}></div>
                <div class="h-6 w-20 rounded-full bg-slate-100"></div>
                <div class="h-3 w-3/5 rounded-full bg-slate-100"></div>
              </div>
            </div>
          </div>
        {/each}
      </div>

      <div class="rounded-xl border border-slate-100 bg-white p-5 shadow-xs">
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div class="h-5 w-44 rounded-full bg-slate-100"></div>
          <div class="h-9 w-36 rounded-lg bg-slate-100"></div>
        </div>
        <div class="space-y-3">
          {#each Array(skeletonRows) as _, rowIndex}
            <div
              class="grid grid-cols-1 gap-3 rounded-lg border border-slate-50 px-4 py-3 sm:grid-cols-4"
            >
              {#each Array(4) as _, colIndex}
                <div
                  class={`h-3 rounded-full bg-slate-100 ${widths[(rowIndex + colIndex) % widths.length]}`}
                ></div>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
