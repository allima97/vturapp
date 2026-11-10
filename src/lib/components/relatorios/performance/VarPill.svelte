<script lang="ts">
  import { percentual } from './formato';
  /** Variação em % (null = sem base de comparação). */
  export let valor: number | null = null;
  /** Texto pronto (ex.: gap "-925K"); quando dado, a cor segue `negativo`. */
  export let texto: string | null = null;
  export let negativo: boolean | null = null;
  export let legenda = '';

  $: neg = negativo ?? (valor != null && valor < 0);
  $: rotulo = texto ?? (valor == null ? 's/ base' : `${valor > 0 ? '+' : ''}${percentual(valor)}`);
</script>

<div class="mt-2 flex items-center gap-2 text-xs text-slate-500">
  <span
    class="rounded-full px-2.5 py-1 text-sm font-bold {valor == null && texto == null
      ? 'bg-slate-100 text-slate-500'
      : neg
        ? 'bg-red-100 text-red-700'
        : 'bg-emerald-100 text-emerald-700'}">{rotulo}</span
  >
  {#if legenda}<span>{legenda}</span>{/if}
</div>
