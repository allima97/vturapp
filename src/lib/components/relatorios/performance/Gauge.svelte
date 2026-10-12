<!-- Medidor em meia-lua (0% a 100%), para o percentual de atingimento da meta. -->
<script lang="ts">
  import { percentual } from './formato';
  export let titulo: string;
  export let valor = 0;

  $: frac = Math.max(0, Math.min(1, (Number(valor) || 0) / 100));
  // Arco de 180° com raio 40, centro (50,50).
  $: angulo = Math.PI * (1 - frac);
  $: x = 50 + 40 * Math.cos(angulo);
  $: y = 50 - 40 * Math.sin(angulo);
  $: cor = frac >= 1 ? '#16a34a' : frac >= 0.8 ? '#f59e0b' : '#dc2626';
</script>

<div class="vtur-card flex h-full flex-col items-center justify-center p-4 text-center">
  <p class="text-xs font-medium text-slate-500">{titulo}</p>
  <svg viewBox="0 0 100 58" class="mt-1 w-full max-w-[180px]" role="img" aria-label={`${titulo}: ${percentual(valor)}`}>
    <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="#e2e8f0" stroke-width="12" />
    {#if frac > 0}
      <path d={`M10 50 A40 40 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`} fill="none" stroke={cor} stroke-width="12" />
    {/if}
    <text x="50" y="47" text-anchor="middle" font-size="15" font-weight="700" fill="#0f172a">{percentual(valor)}</text>
  </svg>
  <div class="flex w-full max-w-[180px] justify-between text-[11px] text-slate-500"><span>0%</span><span>100%</span></div>
</div>
