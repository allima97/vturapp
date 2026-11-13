<script lang="ts">
  import { FieldInput, FieldSelect } from '$lib/components/ui';
  import type { DetalhesItem } from '$lib/quote/detalhesItem';

  export let item: DetalhesItem & { item_type: string };
  export let prefixo: string;

  const regimes = [
    'Café da manhã',
    'Meia pensão',
    'Pensão completa',
    'All-inclusive',
    'Apenas hospedagem'
  ].map((value) => ({ value, label: value }));
</script>

<div class="md:col-span-2">
  <FieldInput
    id={`${prefixo}-inicio`}
    label={item.item_type === 'hotel' ? 'Check-in' : 'Data inicial'}
    type="date"
    required
    bind:value={item.start_date}
    class_name="w-full"
  />
</div>
<div class="md:col-span-2">
  <FieldInput
    id={`${prefixo}-fim`}
    label={item.item_type === 'hotel' ? 'Check-out' : 'Data final'}
    type="date"
    required
    bind:value={item.end_date}
    class_name="w-full"
  />
</div>
<div class="md:col-span-2">
  <FieldInput
    id={`${prefixo}-categoria`}
    label="Categoria"
    required
    bind:value={item.categoria}
    placeholder={item.item_type === 'hotel' ? 'Ex: 4 estrelas' : 'Ex: Standard'}
    class_name="w-full"
  />
</div>
<div class="md:col-span-1">
  <FieldInput
    id={`${prefixo}-adultos`}
    label="Adultos"
    type="number"
    min="0"
    step="1"
    value={item.adultos ?? ''}
    required
    on:input={(event) => {
      const value = (event.target as HTMLInputElement).value;
      item.adultos = value === '' ? null : Number(value);
    }}
    class_name="w-full"
  />
</div>
<div class="md:col-span-1">
  <FieldInput
    id={`${prefixo}-criancas`}
    label="Crianças"
    type="number"
    min="0"
    step="1"
    value={item.criancas ?? ''}
    required
    on:input={(event) => {
      const value = (event.target as HTMLInputElement).value;
      item.criancas = value === '' ? null : Number(value);
    }}
    class_name="w-full"
  />
</div>
{#if item.item_type === 'hotel'}
  <div class="md:col-span-2">
    <FieldInput
      id={`${prefixo}-apto`}
      label="Tipo de apartamento"
      required
      bind:value={item.tipo_apartamento}
      placeholder="Ex: Duplo"
      class_name="w-full"
    />
  </div>
  <div class="md:col-span-2">
    <FieldInput
      id={`${prefixo}-qtd-apto`}
      label="Quantidade de apartamentos"
      type="number"
      min="1"
      step="1"
      value={item.quantidade_apartamentos ?? ''}
      required
      on:input={(event) => {
        const value = (event.target as HTMLInputElement).value;
        item.quantidade_apartamentos = value === '' ? null : Number(value);
      }}
      class_name="w-full"
    />
  </div>
  <div class="md:col-span-2">
    <FieldSelect
      id={`${prefixo}-regime`}
      label="Regime"
      required
      bind:value={item.regime}
      options={regimes}
      class_name="w-full"
    />
  </div>
{/if}
