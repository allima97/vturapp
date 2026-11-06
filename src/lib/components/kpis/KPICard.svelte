<script lang="ts">
  import { TrendingUp, TrendingDown } from '$lib/icons';
  import type { ComponentType } from 'svelte';

  export let title: string;
  export let value: string | number = '';
  export let subtitle: string = '';
  export let loading: boolean = false;
  export let icon: ComponentType | null = null;
  export let color:
    | 'blue'
    | 'green'
    | 'orange'
    | 'teal'
    | 'violet'
    | 'slate'
    | 'clientes'
    | 'vendas'
    | 'financeiro'
    | 'operacao'
    | 'orcamentos'
    | 'comissoes' = 'blue';

  /**
   * Indicador de tendência — opcional.
   * Ex: trend={{ value: 12.5, isPositive: true }} → "+12,5% vs. período anterior"
   */
  export let trend: { value: number; isPositive: boolean; label?: string } | undefined = undefined;

  /*
   * Ícone: fundo suave + cor do ícone — unificados em slate/indigo para
   * visual limpo. A prop `color` é aceita mas não gera cores vibrantes
   * diferentes por módulo — todos usam o mesmo fundo neutro levemente colorido.
   */
  const iconStyle: Record<string, { bg: string; fg: string }> = {
    blue: { bg: 'bg-indigo-50', fg: 'text-indigo-500' },
    violet: { bg: 'bg-indigo-50', fg: 'text-indigo-500' },
    clientes: { bg: 'bg-indigo-50', fg: 'text-indigo-500' },
    orcamentos: { bg: 'bg-indigo-50', fg: 'text-indigo-500' },
    green: { bg: 'bg-emerald-50', fg: 'text-emerald-500' },
    vendas: { bg: 'bg-emerald-50', fg: 'text-emerald-500' },
    orange: { bg: 'bg-amber-50', fg: 'text-amber-500' },
    financeiro: { bg: 'bg-amber-50', fg: 'text-amber-500' },
    comissoes: { bg: 'bg-amber-50', fg: 'text-amber-500' },
    teal: { bg: 'bg-teal-50', fg: 'text-teal-500' },
    operacao: { bg: 'bg-teal-50', fg: 'text-teal-500' },
    slate: { bg: 'bg-slate-100', fg: 'text-slate-500' }
  };

  $: style = iconStyle[color] ?? iconStyle.blue;
</script>

<!--
  KPI Card — layout horizontal limpo (sem border-t colorida).
  Estrutura: [ícone] [texto (título + valor + tendência)]
-->
<div class="vtur-kpi-card flex items-start gap-3 text-left">
  {#if loading}
    <div class="flex w-full flex-col gap-2">
      <div class="h-3 w-24 animate-pulse rounded-sm bg-slate-100"></div>
      <div class="h-7 w-16 animate-pulse rounded-sm bg-slate-100"></div>
      <div class="h-2.5 w-28 animate-pulse rounded-sm bg-slate-100"></div>
    </div>
    <div class="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-slate-100"></div>
  {:else}
    <!-- Ícone -->
    {#if icon}
      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl {style.bg}">
        <svelte:component this={icon} size={18} strokeWidth={2} class={style.fg} />
      </div>
    {/if}

    <!-- Texto -->
    <div class="min-w-0 flex-1">
      <p
        class="mb-1 text-[0.68rem] font-semibold tracking-widest text-slate-500 uppercase sm:text-[0.72rem]"
      >
        {title}
      </p>
      <p
        class="truncate text-lg leading-none font-bold tracking-tight text-slate-900 sm:text-[1.6rem]"
      >
        {value}
      </p>
      {#if subtitle}
        <p class="mt-1 truncate text-xs text-slate-400">{subtitle}</p>
      {/if}

      <!-- Tendência -->
      {#if trend}
        <div class="mt-1.5 flex items-center gap-1">
          {#if trend.isPositive}
            <TrendingUp size={12} class="shrink-0 text-emerald-500" />
            <span class="text-xs font-semibold text-emerald-600">
              +{trend.value.toFixed(1).replace('.', ',')}%
            </span>
          {:else}
            <TrendingDown size={12} class="shrink-0 text-red-500" />
            <span class="text-xs font-semibold text-red-600">
              {trend.value.toFixed(1).replace('.', ',')}%
            </span>
          {/if}
          <span class="text-[0.68rem] text-slate-400">{trend.label ?? 'vs. período anterior'}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>
