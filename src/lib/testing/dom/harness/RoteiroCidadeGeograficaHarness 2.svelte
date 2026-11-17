<script lang="ts">
  import CidadeRoteiro from '../../../../routes/(app)/orcamentos/roteiros/[id]/_components/CidadeRoteiro.svelte';

  let {
    inicial,
    expose
  }: {
    inicial: { cidade: string; cidade_id?: string | null };
    expose: (get: () => typeof inicial & { cidade_pendente?: boolean }) => void;
  } = $props();
  // svelte-ignore state_referenced_locally
  let destino = $state({ ...inicial });
  let visivel = $state(true);
  // svelte-ignore state_referenced_locally
  expose(() => destino);
</script>

<button type="button" onclick={() => (visivel = !visivel)}>Trocar aba</button>
{#if visivel}<CidadeRoteiro bind:destino fieldId="cidade-teste" />{/if}
