<script lang="ts">
  import SeletorDestinoGeografico from '$lib/components/SeletorDestinoGeografico.svelte';
  import { untrack } from 'svelte';
  let { initialId = '', initialValue = '' }: { initialId?: string; initialValue?: string } =
    $props();
  let destinoId = $state(untrack(() => initialId));
  let value = $state(untrack(() => initialValue));
</script>

<SeletorDestinoGeografico fieldId="destino" bind:destinoId bind:value idioma="pt-BR" required />
<output data-id>{destinoId}</output>
<output data-value>{value}</output>
