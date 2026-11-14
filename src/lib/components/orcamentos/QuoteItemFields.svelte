<script lang="ts">
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';
  import DestinoOperacional from '$lib/components/DestinoOperacional.svelte';
  import FlightSegments from '$lib/components/orcamentos/FlightSegments.svelte';
  import { FieldInput, FieldSelect } from '$lib/components/ui';
  import {
    calcularTotaisItem,
    diasItem,
    recalcularTotaisItem,
    tiposItem,
    type ItemOrcamento
  } from '$lib/quote/detalhesItem';

  export let item: ItemOrcamento;
  export let prefix: string;
  export let currency = 'BRL';
  export let onChange: () => void = () => {};

  const categoriasServico = [
    { value: 'Serviço Compartilhado', label: 'Serviço Compartilhado' },
    { value: 'Serviço Privativo', label: 'Serviço Privativo' }
  ];
  const itensCarro = ['KM Livre', 'CDW', 'LDW', 'Tanque Cheio'];

  function atualizarItem() {
    recalcularTotaisItem(item);
    onChange();
  }

  function alterarTipo() {
    if (item.item_type === 'passagem') {
      item.city_name = '';
      item.destino_geografico_id = '';
    }
    atualizarItem();
  }

  function atualizarCambio(event: Event) {
    event.stopPropagation();
    item = {
      ...item,
      cambio: (event.target as HTMLSelectElement).value
    };
    atualizarItem();
  }

  function alterarIncluido(event: Event) {
    event.stopPropagation();
    const checkbox = event.target as HTMLInputElement;
    const incluidos = new Set(item.incluidos);
    if (checkbox.checked) incluidos.add(checkbox.value);
    else incluidos.delete(checkbox.value);
    item = {
      ...item,
      incluidos: [
        ...itensCarro.filter((incluido) => incluidos.has(incluido)),
        ...[...incluidos].filter((incluido) => !itensCarro.includes(incluido))
      ]
    };
    atualizarItem();
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value || 0);
  }

  function alterarValor(
    campo: 'unit_price' | 'adultos_valor' | 'criancas_valor' | 'infant_valor' | 'senior_valor',
    event: CustomEvent<string | number>
  ) {
    item[campo] = Number(event.detail) || 0;
    atualizarItem();
  }

  function alterarQuantidade(
    campo: 'adultos' | 'criancas' | 'infant' | 'senior' | 'quantidade_apartamentos',
    event: Event
  ) {
    const raw = (event.currentTarget as HTMLInputElement).value;
    const valor = raw === '' ? null : Number(raw);
    if (campo === 'adultos') item.adultos = valor;
    else if (campo === 'criancas') item.criancas = valor;
    else if (campo === 'infant') item.infant = valor;
    else if (campo === 'senior') item.senior = valor;
    else item.quantidade_apartamentos = valor;
    atualizarItem();
  }
</script>

<div
  class="grid grid-cols-1 gap-3 md:grid-cols-12"
  on:input={atualizarItem}
  on:change={atualizarItem}
>
  <div class="md:col-span-3">
    <FieldSelect
      id={`${prefix}-tipo`}
      label="Tipo"
      bind:value={item.item_type}
      options={tiposItem}
      placeholder={null}
      class_name="w-full"
      on:change={alterarTipo}
    />
  </div>

  {#if item.item_type !== 'passagem'}
    <div class="md:col-span-4">
      <DestinoOperacional
        fieldId={`${prefix}-destino`}
        label="Destino"
        bind:value={item.city_name}
        bind:destinoId={item.destino_geografico_id}
      >
        <CidadeDestinoAutocomplete
          id={`${prefix}-destino`}
          label="Destino"
          bind:value={item.city_name}
          placeholder="Cidade"
          class_name="w-full"
        />
      </DestinoOperacional>
    </div>
  {/if}

  <div class={item.item_type === 'passagem' ? 'md:col-span-9' : 'md:col-span-5'}>
    <FieldInput
      id={`${prefix}-descricao`}
      label="Descrição"
      bind:value={item.title}
      placeholder="Ex.: Passagem aérea ida e volta"
      class_name="w-full"
      required
    />
  </div>

  {#if item.item_type === 'hotel'}
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-checkin`}
        label="Check-in"
        type="date"
        bind:value={item.start_date}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-checkout`}
        label="Check-out"
        type="date"
        bind:value={item.end_date}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-2">
      <p class="mb-1 block text-xs font-medium text-slate-500">Total de noites</p>
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
        {diasItem(item.item_type, item.start_date, item.end_date) ?? '—'}
      </div>
    </div>
    <div class="md:col-span-4">
      <FieldInput
        id={`${prefix}-categoria`}
        label="Categoria"
        bind:value={item.categoria}
        placeholder="Ex.: 4 estrelas"
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-2">
      <FieldInput
        id={`${prefix}-adultos`}
        label="Adultos"
        type="number"
        value={item.adultos ?? ''}
        min="0"
        step="1"
        class_name="w-full"
        on:input={(event) => alterarQuantidade('adultos', event)}
      />
    </div>
    <div class="md:col-span-2">
      <FieldInput
        id={`${prefix}-criancas`}
        label="Crianças"
        type="number"
        value={item.criancas ?? ''}
        min="0"
        step="1"
        class_name="w-full"
        on:input={(event) => alterarQuantidade('criancas', event)}
      />
    </div>
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-apartamento`}
        label="Tipo de apartamento"
        bind:value={item.tipo_apartamento}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-2">
      <FieldInput
        id={`${prefix}-quantidade-apartamentos`}
        label="Qtd. Aptos"
        type="number"
        value={item.quantidade_apartamentos ?? ''}
        min="1"
        step="1"
        class_name="w-full"
        on:input={(event) => alterarQuantidade('quantidade_apartamentos', event)}
      />
    </div>
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-regime`}
        label="Regime"
        bind:value={item.regime}
        placeholder="Ex.: Café da manhã"
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-valor-unitario`}
        label="Valor Unit."
        type="number"
        money
        value={item.unit_price}
        min="0"
        step="0.01"
        class_name="w-full"
        on:moneyInput={(event) => alterarValor('unit_price', event)}
      />
    </div>
    <div class="md:col-span-2">
      <p class="mb-1 block text-xs font-medium text-slate-500">Total</p>
      <div
        class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-800"
      >
        {formatCurrency(calcularTotaisItem(item).total_amount)}
      </div>
    </div>
  {:else if item.item_type === 'aluguel_carro'}
    <div class="md:col-span-3">
      <FieldSelect
        id={`${prefix}-cambio`}
        label="Câmbio"
        value={item.cambio}
        options={[
          { value: 'Manual', label: 'Manual' },
          { value: 'Automático', label: 'Automático' }
        ]}
        placeholder="Selecione"
        class_name="w-full"
        on:change={atualizarCambio}
      />
    </div>
    <div class="md:col-span-9">
      <p class="mb-2 block text-xs font-medium text-slate-500">Incluídos</p>
      <div class="flex flex-wrap gap-x-5 gap-y-2 pt-1">
        {#each itensCarro as incluido}
          <label class="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              value={incluido}
              checked={item.incluidos.includes(incluido)}
              class="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              on:change={alterarIncluido}
            />
            {incluido}
          </label>
        {/each}
      </div>
    </div>
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-data-inicial`}
        label="Data inicial"
        type="date"
        bind:value={item.start_date}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-data-final`}
        label="Data final"
        type="date"
        bind:value={item.end_date}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-2">
      <p class="mb-1 block text-xs font-medium text-slate-500">Total de dias</p>
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
        {diasItem(item.item_type, item.start_date, item.end_date) ?? '—'}
      </div>
    </div>
    <div class="md:col-span-2">
      <FieldInput
        id={`${prefix}-valor-unitario`}
        label="Valor Unit."
        type="number"
        money
        value={item.unit_price}
        min="0"
        step="0.01"
        class_name="w-full"
        on:moneyInput={(event) => alterarValor('unit_price', event)}
      />
    </div>
    <div class="md:col-span-2">
      <FieldInput
        id={`${prefix}-quantidade-carros`}
        label="Qtd. Carros"
        type="number"
        bind:value={item.quantity}
        min="1"
        step="1"
        class_name="w-full"
        on:input={atualizarItem}
      />
    </div>
    <div class="md:col-span-2">
      <p class="mb-1 block text-xs font-medium text-slate-500">Total</p>
      <div
        class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-800"
      >
        {formatCurrency(calcularTotaisItem(item).total_amount)}
      </div>
    </div>
  {:else if item.item_type === 'passagem'}
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-data-saida`}
        label="Data de saída"
        type="date"
        bind:value={item.start_date}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-data-chegada`}
        label="Data de chegada"
        type="date"
        bind:value={item.end_date}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-12">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div class="grid grid-cols-2 gap-2">
          <FieldInput
            id={`${prefix}-adultos`}
            label="Adultos"
            type="number"
            value={item.adultos ?? ''}
            min="0"
            step="1"
            class_name="w-full"
            on:input={(event) => alterarQuantidade('adultos', event)}
          />
          <FieldInput
            id={`${prefix}-valor-adultos`}
            label="Valor Adulto"
            type="number"
            money
            value={item.adultos_valor}
            min="0"
            step="0.01"
            class_name="w-full"
            on:moneyInput={(event) => alterarValor('adultos_valor', event)}
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <FieldInput
            id={`${prefix}-criancas`}
            label="Crianças"
            type="number"
            value={item.criancas ?? ''}
            min="0"
            step="1"
            class_name="w-full"
            on:input={(event) => alterarQuantidade('criancas', event)}
          />
          <FieldInput
            id={`${prefix}-valor-criancas`}
            label="Valor Criança"
            type="number"
            money
            value={item.criancas_valor}
            min="0"
            step="0.01"
            class_name="w-full"
            on:moneyInput={(event) => alterarValor('criancas_valor', event)}
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <FieldInput
            id={`${prefix}-infant`}
            label="Infant"
            type="number"
            value={item.infant ?? ''}
            min="0"
            step="1"
            class_name="w-full"
            on:input={(event) => alterarQuantidade('infant', event)}
          />
          <FieldInput
            id={`${prefix}-valor-infant`}
            label="Valor Infant"
            type="number"
            money
            value={item.infant_valor}
            min="0"
            step="0.01"
            class_name="w-full"
            on:moneyInput={(event) => alterarValor('infant_valor', event)}
          />
        </div>
      </div>
    </div>
    <div class="md:col-span-12">
      <p class="mb-1 block text-xs font-medium text-slate-500">Total</p>
      <div
        class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-800"
      >
        {formatCurrency(calcularTotaisItem(item).total_amount)}
      </div>
    </div>
    <FlightSegments idPrefix={`${prefix}-voo`} bind:segments={item.flightSegments} />
  {:else if ['servico', 'passeio', 'show', 'transfer'].includes(item.item_type)}
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-data-inicial`}
        label="Data inicial"
        type="date"
        bind:value={item.start_date}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-data-final`}
        label="Data final"
        type="date"
        bind:value={item.end_date}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-6">
      <FieldSelect
        id={`${prefix}-categoria`}
        label="Categoria"
        bind:value={item.categoria}
        options={categoriasServico}
        placeholder="Selecione"
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-12">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div class="grid grid-cols-2 gap-2">
          <FieldInput
            id={`${prefix}-adultos`}
            label="Adultos"
            type="number"
            value={item.adultos ?? ''}
            min="0"
            step="1"
            class_name="w-full"
            on:input={(event) => alterarQuantidade('adultos', event)}
          />
          <FieldInput
            id={`${prefix}-valor-adultos`}
            label="Valor Adulto"
            type="number"
            money
            value={item.adultos_valor}
            min="0"
            step="0.01"
            class_name="w-full"
            on:moneyInput={(event) => alterarValor('adultos_valor', event)}
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <FieldInput
            id={`${prefix}-criancas`}
            label="Crianças"
            type="number"
            value={item.criancas ?? ''}
            min="0"
            step="1"
            class_name="w-full"
            on:input={(event) => alterarQuantidade('criancas', event)}
          />
          <FieldInput
            id={`${prefix}-valor-criancas`}
            label="Valor Criança"
            type="number"
            money
            value={item.criancas_valor}
            min="0"
            step="0.01"
            class_name="w-full"
            on:moneyInput={(event) => alterarValor('criancas_valor', event)}
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <FieldInput
            id={`${prefix}-infant`}
            label="Infant"
            type="number"
            value={item.infant ?? ''}
            min="0"
            step="1"
            class_name="w-full"
            on:input={(event) => alterarQuantidade('infant', event)}
          />
          <FieldInput
            id={`${prefix}-valor-infant`}
            label="Valor Infant"
            type="number"
            money
            value={item.infant_valor}
            min="0"
            step="0.01"
            class_name="w-full"
            on:moneyInput={(event) => alterarValor('infant_valor', event)}
          />
        </div>
      </div>
    </div>
    <div class="md:col-span-12">
      <p class="mb-1 block text-xs font-medium text-slate-500">Total</p>
      <div
        class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-800"
      >
        {formatCurrency(calcularTotaisItem(item).total_amount)}
      </div>
    </div>
  {:else if item.item_type === 'ingresso'}
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-data-inicial`}
        label="Data inicial"
        type="date"
        bind:value={item.start_date}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-data-final`}
        label="Data final"
        type="date"
        bind:value={item.end_date}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-6">
      <FieldInput
        id={`${prefix}-categoria`}
        label="Categoria"
        bind:value={item.categoria}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-12">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div class="grid grid-cols-2 gap-2">
          <FieldInput
            id={`${prefix}-adultos`}
            label="Adultos"
            type="number"
            value={item.adultos ?? ''}
            min="0"
            step="1"
            class_name="w-full"
            on:input={(event) => alterarQuantidade('adultos', event)}
          />
          <FieldInput
            id={`${prefix}-valor-adultos`}
            label="Valor Adulto"
            type="number"
            money
            value={item.adultos_valor}
            min="0"
            step="0.01"
            class_name="w-full"
            on:moneyInput={(event) => alterarValor('adultos_valor', event)}
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <FieldInput
            id={`${prefix}-criancas`}
            label="Crianças"
            type="number"
            value={item.criancas ?? ''}
            min="0"
            step="1"
            class_name="w-full"
            on:input={(event) => alterarQuantidade('criancas', event)}
          />
          <FieldInput
            id={`${prefix}-valor-criancas`}
            label="Valor Criança"
            type="number"
            money
            value={item.criancas_valor}
            min="0"
            step="0.01"
            class_name="w-full"
            on:moneyInput={(event) => alterarValor('criancas_valor', event)}
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <FieldInput
            id={`${prefix}-infant`}
            label="Infant"
            type="number"
            value={item.infant ?? ''}
            min="0"
            step="1"
            class_name="w-full"
            on:input={(event) => alterarQuantidade('infant', event)}
          />
          <FieldInput
            id={`${prefix}-valor-infant`}
            label="Valor Infant"
            type="number"
            money
            value={item.infant_valor}
            min="0"
            step="0.01"
            class_name="w-full"
            on:moneyInput={(event) => alterarValor('infant_valor', event)}
          />
        </div>
      </div>
    </div>
    <div class="md:col-span-12">
      <p class="mb-1 block text-xs font-medium text-slate-500">Total</p>
      <div
        class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-800"
      >
        {formatCurrency(calcularTotaisItem(item).total_amount)}
      </div>
    </div>
  {:else if item.item_type === 'seguro'}
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-data-inicial`}
        label="Data inicial"
        type="date"
        bind:value={item.start_date}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-data-final`}
        label="Data final"
        type="date"
        bind:value={item.end_date}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-2">
      <p class="mb-1 block text-xs font-medium text-slate-500">Total de dias</p>
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
        {diasItem(item.item_type, item.start_date, item.end_date) ?? '—'}
      </div>
    </div>
    <div class="md:col-span-12">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2">
        <div class="grid grid-cols-2 gap-2">
          <FieldInput
            id={`${prefix}-adultos`}
            label="Adultos"
            type="number"
            value={item.adultos ?? ''}
            min="0"
            step="1"
            class_name="w-full"
            on:input={(event) => alterarQuantidade('adultos', event)}
          />
          <FieldInput
            id={`${prefix}-valor-adultos`}
            label="Valor Adulto"
            type="number"
            money
            value={item.adultos_valor}
            min="0"
            step="0.01"
            class_name="w-full"
            on:moneyInput={(event) => alterarValor('adultos_valor', event)}
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <FieldInput
            id={`${prefix}-senior`}
            label="Senior"
            type="number"
            value={item.senior ?? ''}
            min="0"
            step="1"
            class_name="w-full"
            on:input={(event) => alterarQuantidade('senior', event)}
          />
          <FieldInput
            id={`${prefix}-valor-senior`}
            label="Valor Senior"
            type="number"
            money
            value={item.senior_valor}
            min="0"
            step="0.01"
            class_name="w-full"
            on:moneyInput={(event) => alterarValor('senior_valor', event)}
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <FieldInput
            id={`${prefix}-criancas`}
            label="Crianças"
            type="number"
            value={item.criancas ?? ''}
            min="0"
            step="1"
            class_name="w-full"
            on:input={(event) => alterarQuantidade('criancas', event)}
          />
          <FieldInput
            id={`${prefix}-valor-criancas`}
            label="Valor Criança"
            type="number"
            money
            value={item.criancas_valor}
            min="0"
            step="0.01"
            class_name="w-full"
            on:moneyInput={(event) => alterarValor('criancas_valor', event)}
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <FieldInput
            id={`${prefix}-infant`}
            label="Infant"
            type="number"
            value={item.infant ?? ''}
            min="0"
            step="1"
            class_name="w-full"
            on:input={(event) => alterarQuantidade('infant', event)}
          />
          <FieldInput
            id={`${prefix}-valor-infant`}
            label="Valor Infant"
            type="number"
            money
            value={item.infant_valor}
            min="0"
            step="0.01"
            class_name="w-full"
            on:moneyInput={(event) => alterarValor('infant_valor', event)}
          />
        </div>
      </div>
    </div>
    <div class="md:col-span-12">
      <p class="mb-1 block text-xs font-medium text-slate-500">Total</p>
      <div
        class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-800"
      >
        {formatCurrency(calcularTotaisItem(item).total_amount)}
      </div>
    </div>
  {:else}
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-data-inicial`}
        label="Data inicial"
        type="date"
        bind:value={item.start_date}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-data-final`}
        label="Data final"
        type="date"
        bind:value={item.end_date}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-6">
      <FieldInput
        id={`${prefix}-categoria`}
        label="Categoria"
        bind:value={item.categoria}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-2">
      <FieldInput
        id={`${prefix}-adultos`}
        label="Adultos"
        type="number"
        value={item.adultos ?? ''}
        min="0"
        step="1"
        class_name="w-full"
        on:input={(event) => alterarQuantidade('adultos', event)}
      />
    </div>
    <div class="md:col-span-2">
      <FieldInput
        id={`${prefix}-criancas`}
        label="Crianças"
        type="number"
        value={item.criancas ?? ''}
        min="0"
        step="1"
        class_name="w-full"
        on:input={(event) => alterarQuantidade('criancas', event)}
      />
    </div>
    <div class="md:col-span-2">
      <FieldInput
        id={`${prefix}-quantidade`}
        label="Qtd"
        type="number"
        bind:value={item.quantity}
        min="1"
        step="1"
        class_name="w-full"
        on:input={atualizarItem}
      />
    </div>
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-valor-unitario`}
        label="Valor Unit."
        type="number"
        money
        value={item.unit_price}
        min="0"
        step="0.01"
        class_name="w-full"
        on:moneyInput={(event) => alterarValor('unit_price', event)}
      />
    </div>
    <div class="md:col-span-3">
      <p class="mb-1 block text-xs font-medium text-slate-500">Total</p>
      <div
        class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-800"
      >
        {formatCurrency(calcularTotaisItem(item).total_amount)}
      </div>
    </div>
  {/if}
</div>
