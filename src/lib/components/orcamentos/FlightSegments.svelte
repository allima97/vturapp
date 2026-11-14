<script lang="ts">
  import { FieldInput, FieldSelect } from '$lib/components/ui';
  import Button from '$lib/components/ui/Button.svelte';
  import { Plus, Trash2 } from '$lib/icons';
  import { newQuoteFlightSegment, type QuoteFlightSegment } from '$lib/quote/flights';

  let {
    idPrefix,
    segments = $bindable()
  }: {
    idPrefix: string;
    segments: QuoteFlightSegment[];
  } = $props();

  function addSegment() {
    segments = [...segments, newQuoteFlightSegment()];
  }

  function removeSegment(index: number) {
    segments = segments.filter((_, segmentIndex) => segmentIndex !== index);
  }
</script>

<div class="md:col-span-12">
  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
    <h3 class="text-sm font-semibold text-slate-800">Dados dos trechos aéreos</h3>
    <Button type="button" variant="secondary" size="sm" on:click={addSegment}>
      <Plus size={14} class="mr-1" />
      Adicionar trecho
    </Button>
  </div>

  {#if segments.length === 0}
    <p class="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
      Adicione os trechos para incluir companhia, voo, horários, aeroportos, classe e tarifa.
    </p>
  {:else}
    <div class="space-y-3">
      {#each segments as segment, index}
        <div class="rounded-lg border border-slate-200 bg-white p-3">
          <div class="mb-3 flex items-center justify-between">
            <p class="text-sm font-medium text-slate-700">Trecho {index + 1}</p>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class_name="text-slate-400 hover:text-red-600"
              ariaLabel={`Remover trecho ${index + 1}`}
              title={`Remover trecho ${index + 1}`}
              on:click={() => removeSegment(index)}
            >
              <Trash2 size={14} />
            </Button>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FieldSelect
              id={`${idPrefix}-tipo-voo-${index}`}
              label="Tipo de voo"
              bind:value={segment.tipo_voo}
              options={[
                { value: 'Internacional', label: 'Internacional' },
                { value: 'Nacional', label: 'Nacional / voo interno' }
              ]}
              placeholder={null}
              class_name="w-full"
            />
            <FieldInput
              id={`${idPrefix}-trecho-${index}`}
              label="Trecho"
              bind:value={segment.trecho}
              placeholder="Ex.: GRU → FCO"
              class_name="w-full"
            />
            <FieldInput
              id={`${idPrefix}-cia-aerea-${index}`}
              label="Companhia aérea"
              bind:value={segment.cia_aerea}
              placeholder="Ex.: LATAM Airlines"
              class_name="w-full"
            />
            <FieldInput
              id={`${idPrefix}-numero-voo-${index}`}
              label="Número do voo"
              bind:value={segment.numero_voo}
              placeholder="Ex.: LA 8120"
              class_name="w-full"
            />
            <FieldInput
              id={`${idPrefix}-data-voo-${index}`}
              label="Data de saída"
              type="date"
              bind:value={segment.data_voo}
              class_name="w-full"
            />
            <FieldInput
              id={`${idPrefix}-hora-saida-${index}`}
              label="Hora de saída"
              type="time"
              bind:value={segment.hora_saida}
              class_name="w-full"
            />
            <FieldInput
              id={`${idPrefix}-aeroporto-saida-${index}`}
              label="Aeroporto de saída"
              bind:value={segment.aeroporto_saida}
              placeholder="Ex.: GRU"
              class_name="w-full"
            />
            <FieldInput
              id={`${idPrefix}-duracao-${index}`}
              label="Duração do voo"
              bind:value={segment.duracao_voo}
              placeholder="Ex.: 11h20"
              class_name="w-full"
            />
            <FieldInput
              id={`${idPrefix}-data-chegada-${index}`}
              label="Data de chegada"
              type="date"
              bind:value={segment.data_fim}
              class_name="w-full"
            />
            <FieldInput
              id={`${idPrefix}-hora-chegada-${index}`}
              label="Hora de chegada"
              type="time"
              bind:value={segment.hora_chegada}
              class_name="w-full"
            />
            <FieldInput
              id={`${idPrefix}-aeroporto-chegada-${index}`}
              label="Aeroporto de chegada"
              bind:value={segment.aeroporto_chegada}
              placeholder="Ex.: FCO"
              class_name="w-full"
            />
            <FieldInput
              id={`${idPrefix}-classe-${index}`}
              label="Classe de reserva"
              bind:value={segment.classe_reserva}
              placeholder="Ex.: Econômica"
              class_name="w-full"
            />
            <FieldInput
              id={`${idPrefix}-tarifa-${index}`}
              label="Tarifa"
              bind:value={segment.tarifa_nome}
              placeholder="Ex.: FULL"
              class_name="w-full"
            />
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
