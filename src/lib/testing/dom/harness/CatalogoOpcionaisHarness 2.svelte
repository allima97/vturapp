<script lang="ts">
  import AbaOpcionais from '../../../../routes/(app)/orcamentos/roteiros/[id]/_components/AbaOpcionais.svelte';
  import type { RoteiroOpcionalCidade } from '$lib/roteiroOpcionais';
  let {
    expose,
    inicial = [],
    cidades = ['Lisboa, Lisboa, Portugal', 'Lisboa, Lisboa, Portugal'],
    passeiosIncorporados = []
  }: {
    expose: (get: () => RoteiroOpcionalCidade[]) => void;
    inicial?: RoteiroOpcionalCidade[];
    cidades?: (string | { cidade: string; cidade_id?: string | null })[];
    passeiosIncorporados?: { cidade: string; cidade_id?: string | null; passeio: string }[];
  } = $props();
  // svelte-ignore state_referenced_locally
  let opcionais: RoteiroOpcionalCidade[] = $state(inicial);
  // svelte-ignore state_referenced_locally
  expose(() => opcionais);
</script>

<AbaOpcionais
  bind:opcionais
  cidadesItinerario={cidades.map((cidade) => (typeof cidade === 'string' ? { cidade } : cidade))}
  {passeiosIncorporados}
/>
