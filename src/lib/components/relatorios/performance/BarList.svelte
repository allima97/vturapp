<!-- Lista de barras horizontais com rótulo e percentual (Top vendedores, destinos, formas de pagamento...). -->
<script lang="ts">
  import { percentual } from './formato';
  export let titulo: string;
  export let itens: Array<{ nome: string; pct: number; extra?: string }> = [];
  export let cor = 'bg-amber-400';
  export let vazio = 'Sem dados no período.';
  export let subtitulo = '';

  $: maior = Math.max(1, ...itens.map((i) => Math.abs(i.pct)));
</script>

<section class="vtur-card h-full p-4" aria-label={titulo}>
  <h3 class="text-sm font-semibold text-slate-800">{titulo}</h3>
  {#if subtitulo}<p class="text-xs text-slate-500">{subtitulo}</p>{/if}
  {#if itens.length === 0}
    <p class="mt-3 text-sm text-slate-500">{vazio}</p>
  {:else}
    <ol class="mt-3 space-y-1.5">
      {#each itens as item}
        <li class="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs">
          <span class="truncate text-right text-slate-700" title={item.nome}>{item.nome}</span>
          <span class="h-3.5 rounded-sm bg-slate-100" aria-hidden="true">
            <span
              class="block h-3.5 rounded-sm {cor}"
              style={`width:${Math.max(0, (Math.abs(item.pct) / maior) * 100).toFixed(1)}%`}
            ></span>
          </span>
          <span
            class="min-w-[3rem] text-right font-medium whitespace-nowrap text-slate-700 tabular-nums"
            >{item.extra ?? percentual(item.pct)}</span
          >
        </li>
      {/each}
    </ol>
  {/if}
</section>
