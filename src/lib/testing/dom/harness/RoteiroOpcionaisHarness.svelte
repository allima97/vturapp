<script lang="ts">
  import AbaOpcionais from '../../../../routes/(app)/orcamentos/roteiros/[id]/_components/AbaOpcionais.svelte';
  import type { RoteiroOpcionalCidade } from '$lib/roteiroOpcionais';
  let {
    expose,
    inicial = []
  }: { expose: (get: () => RoteiroOpcionalCidade[]) => void; inicial?: RoteiroOpcionalCidade[] } =
    $props();
  // svelte-ignore state_referenced_locally
  let opcionais: RoteiroOpcionalCidade[] = $state(inicial);
  // svelte-ignore state_referenced_locally
  expose(() => opcionais);
</script>

<AbaOpcionais bind:opcionais />
