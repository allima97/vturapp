<script lang="ts">
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';
  import SeletorDestinoGeografico from '$lib/components/SeletorDestinoGeografico.svelte';
  import { modulosOperacionaisGeograficosAtivos } from '$lib/config/destinosGeograficos';

  export let fieldId: string;
  export let label: string;
  export let value: string;
  export let destinoId: string;
  export let onChange: (value: string, id: string) => void;
</script>

<div data-train-city>
  {#if modulosOperacionaisGeograficosAtivos}
    <SeletorDestinoGeografico
      {fieldId}
      {label}
      bind:value
      bind:destinoId
      permitirValorLegado
      on:edit={() => onChange(value, '')}
      on:select={(event) => onChange(event.detail.label, event.detail.id)}
    />
  {:else}
    <CidadeDestinoAutocomplete
      id={fieldId}
      {label}
      {value}
      exigirSelecao
      onInput={(city) => onChange(city, '')}
      onSelect={(city) => {
        if (city) onChange(city, '');
      }}
    />
  {/if}
</div>
