<script lang="ts">
  import Tabs from '$lib/components/ui/Tabs.svelte';

  const items = [
    { key: 'itinerario', label: 'Itinerário' },
    { key: 'hoteis', label: 'Hotéis' }
  ];
  let abaAtiva = $state('itinerario');

  function selecionarAba(key: string) {
    abaAtiva = key;
  }
</script>

<Tabs {items} activeKey={abaAtiva} onSelect={selecionarAba} />
<div data-testid="aba-atual">{abaAtiva}</div>
