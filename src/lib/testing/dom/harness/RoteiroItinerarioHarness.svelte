<!-- Página mínima de teste: usa a aba Itinerário do roteiro com bind:, como a página real. -->
<script lang="ts">
  import AbaItinerario from '../../../../routes/(app)/orcamentos/roteiros/[id]/_components/AbaItinerario.svelte';
  import type { RotDia } from '../../../../routes/(app)/orcamentos/roteiros/[id]/_components/tipos';
  let { expose }: { expose: (get: () => unknown) => void } = $props();
  let dias: RotDia[] = $state([]);
  let diasImportError: string | null = $state('erro antigo');
  let diasImportMsg: string | null = $state('msg antiga');
  let showDiasBusca = $state(false);
  let showDiasImport = $state(false);
  let sugestoes: Record<string, string[]> = $state({});
  // svelte-ignore state_referenced_locally
  const e = expose;
  e(() => ({ dias, diasImportError, diasImportMsg, showDiasBusca, showDiasImport }));
</script>

<AbaItinerario
  bind:dias
  bind:diasImportError
  bind:diasImportMsg
  bind:showDiasBusca
  bind:showDiasImport
  {sugestoes}
/>
