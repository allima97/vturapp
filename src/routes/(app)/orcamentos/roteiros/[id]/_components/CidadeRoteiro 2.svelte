<script lang="ts">
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';
  import SeletorDestinoGeografico from '$lib/components/SeletorDestinoGeografico.svelte';
  import { roteiroGeograficoAtivo } from '$lib/config/destinosGeograficos';

  export let destino: {
    cidade: string;
    cidade_id?: string | null;
    cidade_pendente?: boolean;
    cidade_modo_geografico?: boolean;
  };
  export let fieldId: string;
  export let required = false;

  let valido = false;
  let validando = false;
  const validarInicial = destino.cidade_pendente !== false;
  if (roteiroGeograficoAtivo && destino.cidade_modo_geografico === undefined)
    destino.cidade_modo_geografico = Boolean(destino.cidade_id || !destino.cidade.trim());
  $: geografico = roteiroGeograficoAtivo && destino.cidade_modo_geografico === true;
  $: if (geografico) destino.cidade_pendente = !valido && !validando;
</script>

{#if geografico}
  <SeletorDestinoGeografico
    {fieldId}
    label="Cidade"
    bind:value={destino.cidade}
    bind:destinoId={destino.cidade_id}
    bind:valid={valido}
    bind:validando
    {validarInicial}
    {required}
  />
{:else}
  <CidadeDestinoAutocomplete
    id={fieldId}
    label="Cidade"
    bind:value={destino.cidade}
    placeholder="Cidade"
    class_name="w-full"
    endpoint="/api/v1/roteiros/cidades-busca"
    exigirSelecao
    {required}
    onInput={(cidade) => {
      if (destino.cidade_id) destino.cidade_id = undefined;
      destino.cidade_pendente = Boolean(cidade.trim());
    }}
    onSelect={(cidade) => {
      if (cidade) destino.cidade_pendente = false;
    }}
  />
  {#if roteiroGeograficoAtivo}
    <button
      type="button"
      class="mt-1 text-xs text-indigo-700 underline"
      on:click={() => {
        destino.cidade_modo_geografico = true;
      }}>Selecionar destino geográfico</button
    >
  {/if}
{/if}
