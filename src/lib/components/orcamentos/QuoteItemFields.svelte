<script lang="ts">
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';
  import DestinoOperacional from '$lib/components/DestinoOperacional.svelte';
  import FlightSegments from '$lib/components/orcamentos/FlightSegments.svelte';
  import TrainSegments from '$lib/components/orcamentos/TrainSegments.svelte';
  import { FieldInput, FieldSelect } from '$lib/components/ui';
  import {
    calcularTotaisItem,
    diasItem,
    formatarDescricaoItem,
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
  const itensCarro = ['KM Livre', 'CDW', 'LDW', 'Tanque Cheio', '2º motorista'];
  const locadoras = [
    'Álamo',
    'Avis',
    'Budget',
    'Dollar',
    'Enterprise',
    'Europcar',
    'Foco',
    'Hertz',
    'Localiza',
    'Movida',
    'National',
    'Sixt',
    'Thrifty',
    'Unidas'
  ].map((nome) => ({ value: nome, label: nome }));

  const regimes = [
    'Só Hospedagem',
    'Café da manhã',
    'Meia Pensão',
    'Pensão Completa',
    'ALL Inclusive'
  ].map((nome) => ({ value: nome, label: nome }));
  const categoriasHotel = [
    '1 estrela',
    '2 estrelas',
    '3 estrelas',
    '4 estrelas',
    '5 estrelas',
    'Resort',
    'Pousada',
    'Apart Hotel',
    'Hostel'
  ].map((nome) => ({ value: nome, label: nome }));
  const assentosVeiculo = ['2', '4', '5', '7', '8', '9', '12', '15'].map((quantidade) => ({
    value: `${quantidade} assentos`,
    label: `${quantidade} assentos`
  }));
  const portasVeiculo = ['2', '3', '4', '5'].map((quantidade) => ({
    value: `${quantidade} portas`,
    label: `${quantidade} portas`
  }));
  const malasVeiculo = [
    '1 mala pequena',
    '1 mala grande',
    '1 mala grande + 1 pequena',
    '2 malas grandes',
    '2 malas grandes + 1 pequena',
    '3 malas grandes',
    '4 ou mais malas'
  ].map((nome) => ({ value: nome, label: nome }));
  const combustiveisVeiculo = [
    { value: 'Gasolina', label: 'Gasolina' },
    { value: 'Flex', label: 'Flex (etanol/gasolina)' },
    { value: 'Diesel', label: 'Diesel' },
    { value: 'Elétrico', label: 'Elétrico' },
    { value: 'Híbrido', label: 'Híbrido' },
    { value: 'Híbrido plug-in', label: 'Híbrido plug-in' }
  ];
  const tiposApartamento = [
    'Individual',
    'Duplo',
    'Triplo',
    'Quádruplo',
    'Quíntuplo',
    'Família',
    '1 Quarto c/ 1 Banheiro',
    '2 Quartos c/ 1 Banheiro',
    '2 Quartos c/ 2 Banheiros'
  ].map((nome) => ({ value: nome, label: nome }));
  $: opcoesRegime =
    item.regime && !regimes.some((opcao) => opcao.value === item.regime)
      ? [...regimes, { value: item.regime, label: item.regime }]
      : regimes;
  $: opcoesCategoriaHotel = opcoesComValorSalvo(categoriasHotel, item.categoria);
  $: opcoesApartamento = opcoesComValorSalvo(tiposApartamento, item.tipo_apartamento);
  $: opcoesAssentos = opcoesComValorSalvo(assentosVeiculo, item.assentos);
  $: opcoesPortas = opcoesComValorSalvo(portasVeiculo, item.portas);
  $: opcoesMalas = opcoesComValorSalvo(malasVeiculo, item.malas);
  $: opcoesCombustivel = opcoesComValorSalvo(combustiveisVeiculo, item.combustivel);

  function opcoesComValorSalvo(opcoes: Array<{ value: string; label: string }>, valor: string) {
    const salvo = valor.trim();
    return salvo && !opcoes.some((opcao) => opcao.value === salvo)
      ? [...opcoes, { value: salvo, label: salvo }]
      : opcoes;
  }

  function atualizarItem() {
    recalcularTotaisItem(item);
    onChange();
  }

  function atualizarInput(event: Event) {
    // O valor dos selects é sincronizado no change, após o input nativo.
    if (event.target instanceof HTMLSelectElement) return;
    atualizarItem();
  }

  function alterarTipo() {
    if (item.item_type === 'passagem') {
      item.city_name = '';
      item.destino_geografico_id = '';
    }
    if (item.item_type === 'hotel') {
      if (!item.hora_checkin) item.hora_checkin = '15:00';
      if (!item.hora_checkout) item.hora_checkout = '11:00';
    }
    if (item.item_type === 'passagem' || item.item_type === 'trem') {
      item.title = formatarDescricaoItem(item.item_type, item.title);
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
  on:input={atualizarInput}
  on:change={atualizarItem}
>
  <div class={item.item_type === 'trem' ? 'min-w-0 md:col-span-12 xl:col-span-2' : 'md:col-span-3'}>
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

  {#if item.item_type !== 'passagem' && item.item_type !== 'aluguel_carro'}
    <div
      class={item.item_type === 'trem'
        ? 'min-w-0 md:col-span-12 xl:col-span-3'
        : item.item_type === 'seguro'
          ? 'md:col-span-3'
          : 'md:col-span-4'}
    >
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

  {#if item.item_type === 'seguro'}
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-fornecedor`}
        label="Fornecedor"
        bind:value={item.fornecedor}
        placeholder="Ex.: Assist Card"
        class_name="w-full"
      />
    </div>
  {/if}

  <div
    class={item.item_type === 'passagem'
      ? 'md:col-span-9'
      : item.item_type === 'trem'
        ? 'min-w-0 md:col-span-12 xl:col-span-3'
        : item.item_type === 'seguro'
          ? 'md:col-span-3'
          : item.item_type === 'aluguel_carro'
            ? 'md:col-span-9'
            : 'md:col-span-5'}
  >
    <FieldInput
      id={`${prefix}-descricao`}
      label="Descrição"
      bind:value={item.title}
      placeholder={item.item_type === 'trem'
        ? 'Ex.: Roma / Milão'
        : 'Ex.: Passagem aérea ida e volta'}
      class_name="w-full"
      required
      on:blur={() => {
        item.title = formatarDescricaoItem(item.item_type, item.title);
        atualizarItem();
      }}
    />
  </div>

  {#if item.item_type === 'aluguel_carro'}
    <div class="grid grid-cols-1 gap-3 md:col-span-12 md:grid-cols-12">
      <div class="md:col-span-4">
        <DestinoOperacional
          fieldId={`${prefix}-destino`}
          label="Cidade de Retirada"
          bind:value={item.city_name}
          bind:destinoId={item.destino_geografico_id}
        >
          <CidadeDestinoAutocomplete
            id={`${prefix}-destino`}
            label="Cidade de Retirada"
            bind:value={item.city_name}
            placeholder="Cidade"
            class_name="w-full"
          />
        </DestinoOperacional>
      </div>
      <div class="md:col-span-2">
        <FieldInput
          id={`${prefix}-hora-retirada`}
          label="Hora retirada"
          type="time"
          bind:value={item.hora_retirada}
          class_name="w-full"
        />
      </div>
      <div class="md:col-span-6">
        <FieldInput
          id={`${prefix}-loja-retirada`}
          label="Loja"
          bind:value={item.loja_retirada}
          placeholder="Ex.: Loja Aeroporto LAX"
          class_name="w-full"
        />
      </div>
      <div class="md:col-span-4">
        <CidadeDestinoAutocomplete
          id={`${prefix}-cidade-devolucao`}
          label="Cidade de Devolução"
          bind:value={item.cidade_devolucao}
          placeholder="Cidade"
          class_name="w-full"
        />
      </div>
      <div class="md:col-span-2">
        <FieldInput
          id={`${prefix}-hora-devolucao`}
          label="Hora devolução"
          type="time"
          bind:value={item.hora_devolucao}
          class_name="w-full"
        />
      </div>
      <div class="md:col-span-6">
        <FieldInput
          id={`${prefix}-loja-devolucao`}
          label="Loja"
          bind:value={item.loja_devolucao}
          placeholder="Ex.: Loja Downtown (Figueroa St)"
          class_name="w-full"
        />
      </div>
    </div>
  {/if}

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
    <div class="md:col-span-2">
      <FieldInput
        id={`${prefix}-hora-checkin`}
        label="Hora check-in"
        type="time"
        bind:value={item.hora_checkin}
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
      <FieldInput
        id={`${prefix}-hora-checkout`}
        label="Hora check-out"
        type="time"
        bind:value={item.hora_checkout}
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
      <FieldSelect
        id={`${prefix}-categoria`}
        label="Categoria"
        bind:value={item.categoria}
        options={opcoesCategoriaHotel}
        placeholder="Selecione"
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
      <FieldSelect
        id={`${prefix}-apartamento`}
        label="Tipo de apartamento"
        bind:value={item.tipo_apartamento}
        options={opcoesApartamento}
        placeholder="Selecione"
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
      <FieldSelect
        id={`${prefix}-regime`}
        label="Regime"
        bind:value={item.regime}
        options={opcoesRegime}
        placeholder="Selecione"
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
        id={`${prefix}-locadora`}
        label="Locadora"
        bind:value={item.locadora}
        options={locadoras}
        placeholder="Selecione"
        class_name="w-full"
      />
    </div>
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
    <div class="md:col-span-12">
      <p class="mb-1 block text-xs font-semibold text-slate-600">Informações do veículo</p>
    </div>
    <div class="md:col-span-3">
      <FieldSelect
        id={`${prefix}-assentos`}
        label="Assentos"
        bind:value={item.assentos}
        options={opcoesAssentos}
        placeholder="Selecione"
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-3">
      <FieldSelect
        id={`${prefix}-portas`}
        label="Portas"
        bind:value={item.portas}
        options={opcoesPortas}
        placeholder="Selecione"
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-3">
      <FieldSelect
        id={`${prefix}-malas`}
        label="Malas"
        bind:value={item.malas}
        options={opcoesMalas}
        placeholder="Selecione"
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-3">
      <FieldSelect
        id={`${prefix}-combustivel`}
        label="Combustível"
        bind:value={item.combustivel}
        options={opcoesCombustivel}
        placeholder="Selecione"
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-6">
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
        label="Data de retirada"
        type="date"
        bind:value={item.start_date}
        class_name="w-full"
      />
    </div>
    <div class="md:col-span-3">
      <FieldInput
        id={`${prefix}-data-final`}
        label="Data de devolução"
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
  {:else if item.item_type === 'passagem' || item.item_type === 'trem'}
    <div
      class={item.item_type === 'trem' ? 'min-w-0 md:col-span-12 xl:col-span-2' : 'md:col-span-3'}
    >
      <FieldInput
        id={`${prefix}-data-saida`}
        label="Data de saída"
        type="date"
        bind:value={item.start_date}
        class_name="w-full"
      />
    </div>
    <div
      class={item.item_type === 'trem' ? 'min-w-0 md:col-span-12 xl:col-span-2' : 'md:col-span-3'}
    >
      <FieldInput
        id={`${prefix}-data-chegada`}
        label="Data de chegada"
        type="date"
        bind:value={item.end_date}
        class_name="w-full"
      />
    </div>
    {#if item.item_type === 'trem'}
      <TrainSegments idPrefix={`${prefix}-trem`} bind:segments={item.flightSegments} />
    {/if}
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
    {#if item.item_type === 'passagem'}
      <FlightSegments idPrefix={`${prefix}-voo`} bind:segments={item.flightSegments} />
    {/if}
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
