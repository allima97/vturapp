<script lang="ts">
  import { modulosOperacionaisGeograficosAtivos } from '$lib/config/destinosGeograficos';
  import SeletorDestinoGeografico from '$lib/components/SeletorDestinoGeografico.svelte';

  export let fieldId: string;
  export let label = 'Destino';
  export let value: string | null = '';
  export let destinoId = '';
  export let required = false;
</script>

{#if modulosOperacionaisGeograficosAtivos}
  <SeletorDestinoGeografico {fieldId} {label} {required} bind:value bind:destinoId />
{:else}
  <slot />
{/if}
