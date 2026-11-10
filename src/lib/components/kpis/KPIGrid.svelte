<script lang="ts">
  type KPIGridColumns = 1 | 2 | 3 | 4 | 5 | 6 | 'auto';
  type KPIGridColumnKey = `${KPIGridColumns}`;

  export let columns: KPIGridColumns = 'auto';
  export let className = '';
  export let loading = false;
  export let loadingTitle = 'Carregando registros';
  export let loadingMessage = 'Aguarde enquanto o sistema busca os dados da tabela.';

  const gridClassMap: Record<KPIGridColumnKey, string> = {
    auto: 'vtur-kpi-grid',
    '1': 'vtur-kpi-grid vtur-kpi-grid-1',
    '2': 'vtur-kpi-grid vtur-kpi-grid-2',
    '3': 'vtur-kpi-grid vtur-kpi-grid-3',
    '4': 'vtur-kpi-grid vtur-kpi-grid-4',
    '5': 'vtur-kpi-grid vtur-kpi-grid-5',
    '6': 'vtur-kpi-grid vtur-kpi-grid-6'
  };

  $: columnKey = String(columns) as KPIGridColumnKey;
  $: skeletonCount = columns === 'auto' ? 4 : Math.max(1, Number(columns) || 4);
</script>

<div class={`${gridClassMap[columnKey] ?? gridClassMap.auto} ${className}`.trim()}>
  {#if loading}
    <span class="sr-only">{loadingTitle}. {loadingMessage}</span>
    {#each Array(skeletonCount) as _, index}
      <div class="vtur-kpi-card animate-pulse">
        <div class="flex items-start gap-3">
          <div class="h-10 w-10 shrink-0 rounded-xl bg-slate-100"></div>
          <div class="min-w-0 flex-1 space-y-2">
            <div
              class={`h-3 rounded-full bg-slate-100 ${index % 2 === 0 ? 'w-2/3' : 'w-1/2'}`}
            ></div>
            <div class="h-6 w-24 rounded-full bg-slate-100"></div>
            <div class="h-3 w-3/5 rounded-full bg-slate-100"></div>
          </div>
        </div>
      </div>
    {/each}
  {:else}
    <slot />
  {/if}
</div>
