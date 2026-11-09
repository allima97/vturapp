<script lang="ts">
  import CidadeGeograficaAutocomplete from '$lib/components/vendas/CidadeGeograficaAutocomplete.svelte';
  import { criarEstadoCidadeGeografica } from '$lib/features/vendas/cidadeGeograficaEstado';
  import { untrack } from 'svelte';
  let { initialValue = '' }: { initialValue?: string } = $props();
  let value = $state(untrack(() => initialValue));
  let estado = $state(criarEstadoCidadeGeografica());
  let cities = $state<{ id: string; nome?: string | null; label?: string | null }[]>([]);
</script>

<CidadeGeograficaAutocomplete
  id="cidade"
  bind:value
  {cities}
  bind:estado
  on:loaded={(event) => (cities = [...cities, ...event.detail])}
/>
<output data-id>{value}</output>
<output data-pending>{String(estado.pendente)}</output>
