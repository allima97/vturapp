<script lang="ts">
  import { FieldInput, FieldSelect } from '$lib/components/ui';
  import TrainCity from '$lib/components/orcamentos/TrainCity.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { Plus, Trash2 } from '$lib/icons';
  import {
    FORNECEDORES_TREM,
    newQuoteFlightSegment,
    trainArrival,
    type QuoteFlightSegment
  } from '$lib/quote/flights';

  let {
    idPrefix,
    segments = $bindable()
  }: {
    idPrefix: string;
    segments: QuoteFlightSegment[];
  } = $props();

  function opcoesFornecedorTrem(atual: string) {
    return atual && !FORNECEDORES_TREM.some((opcao) => opcao.value === atual)
      ? [...FORNECEDORES_TREM, { value: atual, label: atual }]
      : FORNECEDORES_TREM;
  }

  function addSegment() {
    segments = [...segments, newQuoteFlightSegment()];
  }

  function removeSegment(index: number) {
    segments = segments.filter((_, segmentIndex) => segmentIndex !== index);
  }

  function displayTime(value: string) {
    const clean = value.replace(/\s*\(\+\d+\)\s*$/, '');
    const match = clean.match(/(\d{1,2}):?(\d{2})/);
    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
  }

  function updateSegment(event: Event, index: number, field: keyof QuoteFlightSegment) {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    segments = segments.map((segment, segmentIndex) => {
      if (segmentIndex !== index) return segment;
      const updated = { ...segment, [field]: value };
      if (['data_voo', 'hora_saida', 'duracao_voo'].includes(field)) {
        const arrival = trainArrival(updated);
        if (arrival) return { ...updated, ...arrival };
        const previous = trainArrival(segment);
        if (
          previous &&
          segment.data_fim === previous.data_fim &&
          segment.hora_chegada === previous.hora_chegada
        )
          return { ...updated, data_fim: '', hora_chegada: '' };
      }
      return updated;
    });
  }

  function updateCity(
    index: number,
    field: 'aeroporto_saida' | 'aeroporto_chegada',
    value: string,
    id: string
  ) {
    const idField = field === 'aeroporto_saida' ? 'cidade_saida_id' : 'cidade_chegada_id';
    segments = segments.map((segment, segmentIndex) =>
      segmentIndex === index ? { ...segment, [field]: value, [idField]: id } : segment
    );
  }
</script>

<div class="md:col-span-12">
  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
    <h3 class="text-sm font-semibold text-slate-800">Dados dos trechos de trem</h3>
    <Button type="button" variant="secondary" size="sm" on:click={addSegment}>
      <Plus size={14} class="mr-1" />
      Adicionar trecho
    </Button>
  </div>

  {#if segments.length === 0}
    <p class="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
      Adicione os trechos para incluir fornecedor, número do trem, cidades, horários e classe.
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

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
            <div class="min-w-0 lg:col-span-4">
              <FieldSelect
                id={`${idPrefix}-fornecedor-${index}`}
                label="Fornecedor"
                value={segment.cia_aerea}
                options={opcoesFornecedorTrem(segment.cia_aerea)}
                placeholder="Selecione"
                class_name="w-full"
                on:change={(event) => updateSegment(event, index, 'cia_aerea')}
              />
            </div>
            <div class="min-w-0 lg:col-span-4">
              <FieldInput
                id={`${idPrefix}-numero-trem-${index}`}
                label="Número do Trem"
                value={segment.numero_voo}
                placeholder="Ex.: FR 1000"
                class_name="w-full"
                on:input={(event) => updateSegment(event, index, 'numero_voo')}
              />
            </div>
            <div class="min-w-0 lg:col-span-4">
              <FieldSelect
                id={`${idPrefix}-classe-${index}`}
                label="Classe de reserva"
                value={segment.classe_reserva}
                options={[
                  { value: 'Econômica', label: 'Econômica' },
                  { value: 'Econômica Premium', label: 'Econômica Premium' },
                  { value: 'Executiva', label: 'Executiva' },
                  { value: 'Primeira Classe', label: 'Primeira Classe' }
                ]}
                placeholder="Selecione"
                class_name="w-full"
                on:change={(event) => updateSegment(event, index, 'classe_reserva')}
              />
            </div>
            <div class="min-w-0 lg:col-span-3">
              <TrainCity
                fieldId={`${idPrefix}-cidade-saida-${index}`}
                label="Cidade de saída"
                value={segment.aeroporto_saida}
                destinoId={segment.cidade_saida_id}
                onChange={(value, id) => updateCity(index, 'aeroporto_saida', value, id)}
              />
            </div>
            <div class="min-w-0 lg:col-span-3">
              <FieldInput
                id={`${idPrefix}-data-saida-${index}`}
                label="Data de saída"
                type="date"
                value={segment.data_voo}
                class_name="w-full"
                on:input={(event) => updateSegment(event, index, 'data_voo')}
              />
            </div>
            <div class="min-w-0 lg:col-span-3">
              <FieldInput
                id={`${idPrefix}-hora-saida-${index}`}
                label="Hora de saída"
                type="time"
                value={displayTime(segment.hora_saida)}
                class_name="w-full"
                on:input={(event) => updateSegment(event, index, 'hora_saida')}
              />
            </div>
            <div class="min-w-0 lg:col-span-3">
              <FieldInput
                id={`${idPrefix}-duracao-${index}`}
                label="Duração da viagem"
                type="time"
                value={displayTime(segment.duracao_voo)}
                class_name="w-full"
                on:input={(event) => updateSegment(event, index, 'duracao_voo')}
              />
            </div>
            <div class="min-w-0 lg:col-span-3">
              <TrainCity
                fieldId={`${idPrefix}-cidade-chegada-${index}`}
                label="Cidade de chegada"
                value={segment.aeroporto_chegada}
                destinoId={segment.cidade_chegada_id}
                onChange={(value, id) => updateCity(index, 'aeroporto_chegada', value, id)}
              />
            </div>
            <div class="min-w-0 lg:col-span-3">
              <FieldInput
                id={`${idPrefix}-data-chegada-${index}`}
                label="Data de chegada"
                type="date"
                value={segment.data_fim}
                class_name="w-full"
                on:input={(event) => updateSegment(event, index, 'data_fim')}
              />
            </div>
            <div class="min-w-0 lg:col-span-3">
              <FieldInput
                id={`${idPrefix}-hora-chegada-${index}`}
                label="Hora de chegada"
                type="time"
                value={displayTime(segment.hora_chegada)}
                class_name="w-full"
                on:input={(event) => updateSegment(event, index, 'hora_chegada')}
              />
            </div>
            <div class="min-w-0 lg:col-span-3">
              <FieldInput
                id={`${idPrefix}-assentos-${index}`}
                label="Assentos (opcional)"
                value={segment.assentos}
                placeholder="Ex.: 12A, 12B"
                class_name="w-full"
                on:input={(event) => updateSegment(event, index, 'assentos')}
              />
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
