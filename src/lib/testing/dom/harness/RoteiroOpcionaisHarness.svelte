<script lang="ts">
  import AbaOpcionais from '../../../../routes/(app)/orcamentos/roteiros/[id]/_components/AbaOpcionais.svelte';
  import type { RoteiroOpcionalCidade } from '$lib/roteiroOpcionais';
  let { expose }: { expose: (get: () => RoteiroOpcionalCidade[]) => void } = $props();
  let opcionais: RoteiroOpcionalCidade[] = $state([]);
  // svelte-ignore state_referenced_locally
  expose(() => opcionais);
</script>
<AbaOpcionais bind:opcionais />
