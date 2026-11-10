<script lang="ts">
  import AbaHoteis from '../../../../routes/(app)/orcamentos/roteiros/[id]/_components/AbaHoteis.svelte';
  import AbaPasseios from '../../../../routes/(app)/orcamentos/roteiros/[id]/_components/AbaPasseios.svelte';
  import AbaTransporte from '../../../../routes/(app)/orcamentos/roteiros/[id]/_components/AbaTransporte.svelte';
  import {
    newHotel,
    newPasseio,
    newTransporte,
    type RotPasseio
  } from '../../../../routes/(app)/orcamentos/roteiros/[id]/_components/tipos';

  let {
    expose,
    passeiosIniciais = [{ ...newPasseio(0), passeio: 'Sagrada Família' }]
  }: { expose: (get: () => unknown) => void; passeiosIniciais?: RotPasseio[] } = $props();
  let hoteis = $state([{ ...newHotel(0), hotel: 'Hotel Ciutat Vella' }]);
  // svelte-ignore state_referenced_locally
  let passeios = $state(passeiosIniciais);
  let transportes = $state([{ ...newTransporte(0), trecho: 'GRU → LIS' }]);
  let hotelImportText = $state('');
  let passeioImportText = $state('');
  let aereoImportText = $state('');
  const HOTEL_CATEGORIA_OPTIONS = ['3 estrelas'];
  const HOTEL_REGIME_OPTIONS = ['Café da manhã'];
  const PASSEIO_TIPO_OPTIONS = ['Passeio', 'Ingresso'];
  const TRANSPORTE_TIPO_OPTIONS = ['Aéreo'];
  const TRANSPORTE_TIPO_VOO_OPTIONS = ['Internacional'];
  const onHotelDateChange = () => {};
  const onAereoValorChange = () => {};
  // svelte-ignore state_referenced_locally
  expose(() => ({ hoteis, passeios, transportes }));
</script>

<AbaHoteis
  {HOTEL_CATEGORIA_OPTIONS}
  {HOTEL_REGIME_OPTIONS}
  handleImportHotelText={() => {}}
  bind:hoteis
  hotelImportError={null}
  hotelImportMsg={null}
  bind:hotelImportText
  {onHotelDateChange}
  sugestoes={{}}
/>

<AbaPasseios
  {PASSEIO_TIPO_OPTIONS}
  handleImportPasseioText={() => {}}
  passeioImportError={null}
  passeioImportMsg={null}
  bind:passeioImportText
  bind:passeios
  sugestoes={{}}
/>

<AbaTransporte
  {TRANSPORTE_TIPO_OPTIONS}
  {TRANSPORTE_TIPO_VOO_OPTIONS}
  aereoImportError={null}
  aereoImportMsg={null}
  bind:aereoImportText
  handleImportAereoText={() => {}}
  {onAereoValorChange}
  bind:transportes
/>
