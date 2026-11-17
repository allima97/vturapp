<script lang="ts">
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';
  let cidade = $state('');
</script>

<CidadeDestinoAutocomplete
  bind:value={cidade}
  endpoint="/api/v1/roteiros/cidades-busca"
  exigirSelecao
/>
<output>{cidade}</output>
