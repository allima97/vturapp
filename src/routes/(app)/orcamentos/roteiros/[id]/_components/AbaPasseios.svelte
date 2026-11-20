<script lang="ts">
  import { FieldDatalistInput, FieldInput, FieldSelect, FieldTextarea } from '$lib/components/ui';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import TrainSegments from '$lib/components/orcamentos/TrainSegments.svelte';
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';
  import { calcularTotaisItem, diasItem } from '$lib/quote/detalhesItem';
  import {
    type RotPasseio,
    type RotPasseioDetalhes,
    addItem,
    newPasseio,
    removeItem,
    reorder
  } from './tipos';
  import { ChevronDown, ChevronUp, Plus, Trash2 } from '$lib/icons';
  import CidadeRoteiro from './CidadeRoteiro.svelte';
  import {
    chaveCidadeCatalogo,
    consultarCatalogoCidade,
    type CidadeCatalogo
  } from '$lib/catalogoOpcionaisBusca';
  import { chaveNomeOpcional } from '$lib/importarOpcionais';
  import { toUserMessage } from '$lib/utils/errors';

  let {
    PASSEIO_TIPO_OPTIONS,
    apenasTipos,
    excetoTipos,
    tituloCard = 'Passeios e Serviços',
    rotuloAdicionar = 'Adicionar passeio',
    handleImportPasseioText,
    passeioImportError,
    passeioImportMsg,
    passeioImportText = $bindable(),
    passeios = $bindable(),
    sugestoes
  }: {
    PASSEIO_TIPO_OPTIONS: string[];
    apenasTipos?: string[];
    excetoTipos?: string[];
    tituloCard?: string;
    rotuloAdicionar?: string;
    handleImportPasseioText: () => void;
    passeioImportError: string | null;
    passeioImportMsg: string | null;
    passeioImportText: string;
    passeios: RotPasseio[];
    sugestoes: Record<string, string[]>;
  } = $props();

  type CatalogoPasseios = {
    estado: 'carregando' | 'pronto' | 'erro';
    nomes: string[];
    erro?: string;
  };
  let catalogosPasseios: Record<string, CatalogoPasseios> = $state({});

  async function consultarCatalogo(cidade: CidadeCatalogo) {
    const items = await consultarCatalogoCidade(cidade);
    return [
      ...new Map(
        items
          .map((item) => String(item.nome ?? '').trim())
          .filter(Boolean)
          .map((nome) => [chaveNomeOpcional(nome), nome])
      ).values()
    ];
  }

  async function buscarCatalogo(cidade: CidadeCatalogo) {
    const chave = chaveCidadeCatalogo(cidade);
    const existente = catalogosPasseios[chave];
    if (existente && existente.estado !== 'erro') return;
    catalogosPasseios[chave] = { estado: 'carregando', nomes: [] };
    try {
      catalogosPasseios[chave] = {
        estado: 'pronto',
        nomes: await consultarCatalogo(cidade)
      };
    } catch (err) {
      catalogosPasseios[chave] = {
        estado: 'erro',
        nomes: [],
        erro: toUserMessage(err, 'Erro ao carregar sugestões de passeios.')
      };
    }
  }

  function opcoesIngressos(valor: string) {
    const opcoes = [
      { value: 'Incluído', label: 'Incluído' },
      { value: 'Não incluído', label: 'Não incluído' }
    ];
    if (valor && !opcoes.some((opcao) => opcao.value === valor))
      opcoes.unshift({ value: valor, label: valor });
    return opcoes;
  }

  // ─── Tipos com campos detalhados (mesmos do Orçamento) ─────────────────────
  const TIPOS_DETALHADOS = ['Trem', 'Show', 'Ingresso', 'Aluguel de Carro', 'Seguro Viagem'];
  const MAPA_TIPO_ITEM: Record<string, string> = {
    Trem: 'trem',
    Show: 'show',
    Ingresso: 'ingresso',
    'Aluguel de Carro': 'aluguel_carro',
    'Seguro Viagem': 'seguro'
  };
  const CATEGORIAS_SERVICO = [
    { value: 'Serviço Compartilhado', label: 'Serviço Compartilhado' },
    { value: 'Serviço Privativo', label: 'Serviço Privativo' }
  ];
  const ITENS_CARRO = ['KM Livre', 'CDW', 'LDW', 'Tanque Cheio', '2º motorista'];
  const LOCADORAS = [
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
  const ASSENTOS_VEICULO = ['2', '4', '5', '7', '8', '9', '12', '15'].map((quantidade) => ({
    value: `${quantidade} assentos`,
    label: `${quantidade} assentos`
  }));
  const PORTAS_VEICULO = ['2', '3', '4', '5'].map((quantidade) => ({
    value: `${quantidade} portas`,
    label: `${quantidade} portas`
  }));
  const MALAS_VEICULO = [
    '1 mala pequena',
    '1 mala grande',
    '1 mala grande + 1 pequena',
    '2 malas grandes',
    '2 malas grandes + 1 pequena',
    '3 malas grandes',
    '4 ou mais malas'
  ].map((nome) => ({ value: nome, label: nome }));
  const COMBUSTIVEIS_VEICULO = [
    { value: 'Gasolina', label: 'Gasolina' },
    { value: 'Flex', label: 'Flex (etanol/gasolina)' },
    { value: 'Diesel', label: 'Diesel' },
    { value: 'Elétrico', label: 'Elétrico' },
    { value: 'Híbrido', label: 'Híbrido' },
    { value: 'Híbrido plug-in', label: 'Híbrido plug-in' }
  ];
  const CAMBIOS = [
    { value: 'Manual', label: 'Manual' },
    { value: 'Automático', label: 'Automático' }
  ];

  function ehTipoDetalhado(tipo: string) {
    return TIPOS_DETALHADOS.includes(tipo);
  }

  // ─── Filtro por tipo (abas dedicadas a Trem / Aluguel de Carro) ────────────
  const tipoNovoPasseio = $derived(apenasTipos?.[0] ?? 'Passeio');

  function tipoVisivel(tipo: string) {
    if (apenasTipos && !apenasTipos.includes(tipo)) return false;
    if (excetoTipos?.includes(tipo)) return false;
    return true;
  }

  const passeiosVisiveis = $derived.by(() => {
    const lista: { passeio: RotPasseio; index: number; posicao: number }[] = [];
    passeios.forEach((passeio, index) => {
      if (tipoVisivel(passeio.tipo)) lista.push({ passeio, index, posicao: lista.length });
    });
    return lista;
  });

  function moverPasseioVisivel(index: number, direcao: -1 | 1) {
    let alvo = index + direcao;
    while (alvo >= 0 && alvo < passeios.length) {
      if (tipoVisivel(passeios[alvo].tipo)) break;
      alvo += direcao;
    }
    if (alvo < 0 || alvo >= passeios.length) return;
    const next = [...passeios];
    [next[index], next[alvo]] = [next[alvo], next[index]];
    passeios = reorder(next);
  }

  type DetalheTexto =
    | 'categoria'
    | 'cambio'
    | 'locadora'
    | 'cidade_devolucao'
    | 'hora_retirada'
    | 'hora_devolucao'
    | 'loja_retirada'
    | 'loja_devolucao'
    | 'assentos'
    | 'portas'
    | 'malas'
    | 'combustivel';

  function detalhesDe(passeio: RotPasseio): RotPasseioDetalhes {
    const atual = passeio.detalhes;
    if (!atual || typeof atual !== 'object' || Array.isArray(atual)) {
      passeio.detalhes = { incluidos: [], segmentos: [] };
      return passeio.detalhes;
    }
    if (!Array.isArray(atual.incluidos)) atual.incluidos = [];
    if (!Array.isArray(atual.segmentos)) atual.segmentos = [];
    return atual;
  }

  function totaisPasseio(passeio: RotPasseio) {
    const detalhes = passeio.detalhes;
    const ehCarro = passeio.tipo === 'Aluguel de Carro';
    const totais = calcularTotaisItem({
      item_type: MAPA_TIPO_ITEM[passeio.tipo] ?? '',
      quantity: ehCarro ? Number(detalhes?.quantidade) || 1 : 1,
      unit_price: Number(passeio.valor_original) || 0,
      adultos: passeio.qtd_adultos,
      adultos_valor: Number(detalhes?.adultos_valor) || 0,
      criancas: passeio.qtd_criancas,
      criancas_valor: Number(detalhes?.criancas_valor) || 0,
      infant: detalhes?.infant ?? null,
      infant_valor: Number(detalhes?.infant_valor) || 0,
      senior: detalhes?.senior ?? null,
      senior_valor: Number(detalhes?.senior_valor) || 0,
      quantidade_apartamentos: null
    });
    // Seguro legado (formulário antigo, sem valores por passageiro): preserva o valor_final salvo.
    const semValoresPassageiros =
      detalhes?.adultos_valor === undefined &&
      detalhes?.criancas_valor === undefined &&
      detalhes?.infant_valor === undefined &&
      detalhes?.senior_valor === undefined;
    if (passeio.tipo === 'Seguro Viagem' && semValoresPassageiros && totais.total_amount === 0) {
      return { ...totais, total_amount: Number(passeio.valor_final) || 0 };
    }
    return totais;
  }

  function formatTotal(value: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      value || 0
    );
  }

  function rotuloDataInicio(tipo: string) {
    if (tipo === 'Trem') return 'Data de saída';
    if (tipo === 'Aluguel de Carro') return 'Data retirada';
    if (ehTipoDetalhado(tipo)) return 'Data inicial';
    return 'Data início';
  }

  function rotuloDataFim(tipo: string) {
    if (tipo === 'Trem') return 'Data de chegada';
    if (tipo === 'Aluguel de Carro') return 'Data devolução';
    if (ehTipoDetalhado(tipo)) return 'Data final';
    return 'Data fim';
  }

  function alterarQuantidadePasseio(
    passeio: RotPasseio,
    campo: 'qtd_adultos' | 'qtd_criancas',
    event: Event
  ) {
    const raw = (event.currentTarget as HTMLInputElement).value;
    passeio[campo] = raw === '' ? null : Number(raw);
  }

  function alterarDetalheTexto(passeio: RotPasseio, campo: DetalheTexto, event: Event) {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    detalhesDe(passeio)[campo] = target.value;
  }

  function alterarDetalheNumero(
    passeio: RotPasseio,
    campo: 'infant' | 'senior' | 'quantidade',
    event: Event
  ) {
    const raw = (event.currentTarget as HTMLInputElement).value;
    const valor = raw === '' ? null : Number(raw);
    detalhesDe(passeio)[campo] = valor;
  }

  function alterarDetalheValor(
    passeio: RotPasseio,
    campo: 'adultos_valor' | 'criancas_valor' | 'infant_valor' | 'senior_valor',
    event: CustomEvent<string | number>
  ) {
    detalhesDe(passeio)[campo] = Number(event.detail) || 0;
  }

  function alterarIncluidoCarro(passeio: RotPasseio, event: Event) {
    const checkbox = event.target as HTMLInputElement;
    const detalhes = detalhesDe(passeio);
    const incluidos = new Set(detalhes.incluidos ?? []);
    if (checkbox.checked) incluidos.add(checkbox.value);
    else incluidos.delete(checkbox.value);
    detalhes.incluidos = [
      ...ITENS_CARRO.filter((incluido) => incluidos.has(incluido)),
      ...[...incluidos].filter((incluido) => !ITENS_CARRO.includes(incluido))
    ];
  }

  function opcoesComValorSalvo(
    opcoes: Array<{ value: string; label: string }>,
    valor: string | undefined
  ) {
    const salvo = String(valor ?? '').trim();
    return salvo && !opcoes.some((opcao) => opcao.value === salvo)
      ? [...opcoes, { value: salvo, label: salvo }]
      : opcoes;
  }

  $effect(() => {
    passeios.forEach((passeio, index) => {
      if (!ehTipoDetalhado(passeio.tipo)) return;
      detalhesDe(passeio);
      const total = totaisPasseio(passeio).total_amount;
      if (Number(passeio.valor_final) !== total) {
        passeio.valor_final = total;
      }
    });
  });

  $effect(() => {
    const cidades = [
      ...new Map(
        passeios
          .map(
            (passeio) =>
              [
                chaveCidadeCatalogo(passeio),
                { cidade: String(passeio.cidade ?? '').trim(), cidade_id: passeio.cidade_id }
              ] as const
          )
          .filter(([chave]) => chave)
      ).values()
    ];
    const timer = setTimeout(() => {
      for (const cidade of cidades) void buscarCatalogo(cidade);
    }, 350);
    return () => clearTimeout(timer);
  });
</script>

<Card title={tituloCard} color="clientes">
  <div class="mb-3 flex flex-wrap gap-2">
    <Button
      type="button"
      variant="secondary"
      size="sm"
      on:click={() => {
        passeios = addItem(passeios, (ordem) => newPasseio(ordem, tipoNovoPasseio));
      }}
    >
      <Plus size={13} class="mr-1" />
      {rotuloAdicionar}
    </Button>
  </div>

  {#snippet campoDescricao(item: RotPasseio, classe = 'col-span-2')}
    <div class={classe}>
      <FieldDatalistInput
        label={ehTipoDetalhado(item.tipo) ? 'Descrição' : 'Passeio / Serviço'}
        bind:value={item.passeio}
        placeholder={ehTipoDetalhado(item.tipo) ? 'Ex.: Roma / Milão' : 'Nome do passeio'}
        class_name="w-full"
        options={catalogosPasseios[chaveCidadeCatalogo(item)]?.nomes ?? []}
        helper={(() => {
          const catalogo = catalogosPasseios[chaveCidadeCatalogo(item)];
          if (catalogo?.estado === 'carregando') return 'Carregando sugestões da cidade...';
          if (catalogo?.estado === 'erro') return catalogo.erro ?? 'Erro ao carregar sugestões.';
          return null;
        })()}
      />
    </div>
  {/snippet}

  {#snippet campoIngressos(item: RotPasseio)}
    <div class="col-span-2">
      <FieldSelect
        label="Ingressos"
        bind:value={item.ingressos}
        options={opcoesIngressos(item.ingressos)}
        placeholder={null}
        class_name="w-full"
      />
    </div>
  {/snippet}

  {#if passeiosVisiveis.length === 0}
    <p class="py-6 text-center text-sm text-slate-400">Nenhum passeio adicionado.</p>
  {:else}
    <div class="space-y-3">
      {#each passeiosVisiveis as { passeio, index, posicao } (passeio)}
        <div class="relative rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div class="mb-2 flex gap-1 sm:absolute sm:top-3 sm:right-3 sm:mb-0">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class_name="text-slate-400 hover:text-slate-600"
              disabled={posicao === 0}
              ariaLabel="Mover passeio para cima"
              title="Mover passeio para cima"
              on:click={() => {
                moverPasseioVisivel(index, -1);
              }}
            >
              <ChevronUp size={13} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class_name="text-slate-400 hover:text-slate-600"
              disabled={posicao === passeiosVisiveis.length - 1}
              ariaLabel="Mover passeio para baixo"
              title="Mover passeio para baixo"
              on:click={() => {
                moverPasseioVisivel(index, 1);
              }}
            >
              <ChevronDown size={13} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class_name="text-slate-400 hover:text-red-600"
              ariaLabel="Remover passeio"
              title="Remover passeio"
              on:click={() => {
                passeios = removeItem(passeios, index);
              }}
            >
              <Trash2 size={13} />
            </Button>
          </div>

          <details>
            <summary
              class="flex cursor-pointer list-none items-center justify-between gap-3 pr-28 text-sm font-semibold"
            >
              <span class="truncate"
                >{String(passeio.passeio ?? '').trim() || `Passeio ${posicao + 1}`}</span
              >
              <span aria-hidden="true" class="text-lg">
                <span class="indicador-mais">+</span><span class="indicador-menos">−</span>
              </span>
            </summary>
            <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
              {#if PASSEIO_TIPO_OPTIONS.length > 1}
                <div class="col-span-2">
                  <FieldSelect
                    label="Tipo"
                    bind:value={passeio.tipo}
                    options={PASSEIO_TIPO_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                    placeholder={null}
                    class_name="w-full"
                  />
                </div>
              {/if}
              {#if passeio.tipo === 'Aluguel de Carro'}
                {@const dCarro = detalhesDe(passeio)}
                <div class="col-span-full grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {@render campoDescricao(passeio, '')}
                  <div>
                    <FieldSelect
                      label="Locadora"
                      value={dCarro.locadora ?? ''}
                      options={opcoesComValorSalvo(LOCADORAS, dCarro.locadora)}
                      placeholder="Selecione"
                      class_name="w-full"
                      on:change={(e) => alterarDetalheTexto(passeio, 'locadora', e)}
                    />
                  </div>
                  <div>
                    <p class="mb-1 block text-xs font-medium text-slate-500">Total de dias</p>
                    <div
                      class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      {diasItem('aluguel_carro', passeio.data_inicio, passeio.data_fim) ?? '—'}
                    </div>
                  </div>
                </div>
                <div class="col-span-full grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div>
                    <CidadeRoteiro
                      bind:destino={passeios[index]}
                      fieldId={`passeio-cidade-${index}`}
                      label="Cidade de Retirada"
                    />
                  </div>
                  <div>
                    <FieldInput
                      label="Loja Retirada"
                      value={dCarro.loja_retirada ?? ''}
                      placeholder="Ex.: Loja Aeroporto"
                      class_name="w-full"
                      on:input={(e) => alterarDetalheTexto(passeio, 'loja_retirada', e)}
                    />
                  </div>
                  <div>
                    <FieldInput
                      label="Data retirada"
                      type="date"
                      bind:value={passeio.data_inicio}
                      class_name="w-full"
                    />
                  </div>
                  <div>
                    <FieldInput
                      label="Hora retirada"
                      type="time"
                      value={dCarro.hora_retirada ?? ''}
                      class_name="w-full"
                      on:input={(e) => alterarDetalheTexto(passeio, 'hora_retirada', e)}
                    />
                  </div>
                </div>
                <div class="col-span-full grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div>
                    <CidadeDestinoAutocomplete
                      id={`passeio-devolucao-${index}`}
                      label="Cidade de Devolução"
                      bind:value={dCarro.cidade_devolucao}
                      placeholder="Cidade"
                      class_name="w-full"
                    />
                  </div>
                  <div>
                    <FieldInput
                      label="Loja Devolução"
                      value={dCarro.loja_devolucao ?? ''}
                      placeholder="Ex.: Loja Downtown"
                      class_name="w-full"
                      on:input={(e) => alterarDetalheTexto(passeio, 'loja_devolucao', e)}
                    />
                  </div>
                  <div>
                    <FieldInput
                      label="Data devolução"
                      type="date"
                      bind:value={passeio.data_fim}
                      class_name="w-full"
                    />
                  </div>
                  <div>
                    <FieldInput
                      label="Hora devolução"
                      type="time"
                      value={dCarro.hora_devolucao ?? ''}
                      class_name="w-full"
                      on:input={(e) => alterarDetalheTexto(passeio, 'hora_devolucao', e)}
                    />
                  </div>
                </div>
                <div class="col-span-full">
                  <p class="mb-1 block text-xs font-semibold text-slate-600">
                    Informações do veículo
                  </p>
                </div>
                <div class="col-span-full grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <FieldSelect
                    label="Assentos"
                    value={dCarro.assentos ?? ''}
                    options={opcoesComValorSalvo(ASSENTOS_VEICULO, dCarro.assentos)}
                    placeholder="Selecione"
                    class_name="w-full"
                    on:change={(e) => alterarDetalheTexto(passeio, 'assentos', e)}
                  />
                  <FieldSelect
                    label="Portas"
                    value={dCarro.portas ?? ''}
                    options={opcoesComValorSalvo(PORTAS_VEICULO, dCarro.portas)}
                    placeholder="Selecione"
                    class_name="w-full"
                    on:change={(e) => alterarDetalheTexto(passeio, 'portas', e)}
                  />
                  <FieldSelect
                    label="Malas"
                    value={dCarro.malas ?? ''}
                    options={opcoesComValorSalvo(MALAS_VEICULO, dCarro.malas)}
                    placeholder="Selecione"
                    class_name="w-full"
                    on:change={(e) => alterarDetalheTexto(passeio, 'malas', e)}
                  />
                  <FieldSelect
                    label="Combustível"
                    value={dCarro.combustivel ?? ''}
                    options={opcoesComValorSalvo(COMBUSTIVEIS_VEICULO, dCarro.combustivel)}
                    placeholder="Selecione"
                    class_name="w-full"
                    on:change={(e) => alterarDetalheTexto(passeio, 'combustivel', e)}
                  />
                  <FieldSelect
                    label="Câmbio"
                    value={dCarro.cambio ?? ''}
                    options={CAMBIOS}
                    placeholder="Selecione"
                    class_name="w-full"
                    on:change={(e) => alterarDetalheTexto(passeio, 'cambio', e)}
                  />
                </div>
                <div class="col-span-full">
                  <p class="mb-2 block text-xs font-medium text-slate-500">Incluídos</p>
                  <div class="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                    {#each ITENS_CARRO as incluido}
                      <label class="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          value={incluido}
                          checked={dCarro.incluidos.includes(incluido)}
                          class="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          onchange={(e) => alterarIncluidoCarro(passeio, e)}
                        />
                        {incluido}
                      </label>
                    {/each}
                  </div>
                </div>
                <div class="col-span-2">
                  <FieldInput
                    money
                    label="Valor Unit."
                    type="number"
                    value={passeio.valor_original ?? ''}
                    min="0"
                    step="0.01"
                    class_name="w-full"
                    on:moneyInput={(e) => {
                      passeio.valor_original = Number(e.detail) || null;
                    }}
                  />
                </div>
                <div class="col-span-2">
                  <FieldInput
                    label="Qtd. Carros"
                    type="number"
                    value={dCarro.quantidade ?? ''}
                    min="1"
                    step="1"
                    class_name="w-full"
                    on:input={(e) => alterarDetalheNumero(passeio, 'quantidade', e)}
                  />
                </div>
                <div class="col-span-2">
                  <p class="mb-1 block text-xs font-medium text-slate-500">Total</p>
                  <div
                    class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-800"
                  >
                    {formatTotal(totaisPasseio(passeio).total_amount)}
                  </div>
                </div>
              {:else}
                {#if passeio.tipo === 'Trem'}
                  <div class="col-span-full grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <CidadeRoteiro
                        bind:destino={passeios[index]}
                        fieldId={`passeio-cidade-${index}`}
                      />
                    </div>
                    {@render campoDescricao(passeio, '')}
                    <div>
                      <FieldInput
                        label="Data de saída"
                        type="date"
                        bind:value={passeio.data_inicio}
                        class_name="w-full"
                      />
                    </div>
                    <div>
                      <FieldInput
                        label="Data de chegada"
                        type="date"
                        bind:value={passeio.data_fim}
                        class_name="w-full"
                      />
                    </div>
                  </div>
                {:else}
                  <div class="col-span-2">
                    <CidadeRoteiro
                      bind:destino={passeios[index]}
                      fieldId={`passeio-cidade-${index}`}
                    />
                  </div>
                  {@render campoDescricao(passeio)}
                  {#if !ehTipoDetalhado(passeio.tipo) || passeio.tipo === 'Seguro Viagem'}
                    <div class="col-span-2">
                      <FieldInput
                        label="Fornecedor"
                        bind:value={passeio.fornecedor}
                        placeholder={passeio.tipo === 'Seguro Viagem'
                          ? 'Ex.: Assist Card'
                          : 'Fornecedor'}
                        class_name="w-full"
                      />
                    </div>
                  {/if}
                  <div class="col-span-2">
                    <FieldInput
                      label={rotuloDataInicio(passeio.tipo)}
                      type="date"
                      bind:value={passeio.data_inicio}
                      class_name="w-full"
                    />
                  </div>
                  <div class="col-span-2">
                    <FieldInput
                      label={rotuloDataFim(passeio.tipo)}
                      type="date"
                      bind:value={passeio.data_fim}
                      class_name="w-full"
                    />
                  </div>
                {/if}
                {#if ehTipoDetalhado(passeio.tipo)}
                  {@const d = detalhesDe(passeio)}
                  {#if passeio.tipo === 'Trem'}
                    <div class="col-span-full">
                      <TrainSegments
                        idPrefix={`passeio-trem-${index}`}
                        bind:segments={d.segmentos}
                      />
                    </div>
                  {/if}
                  {#if passeio.tipo === 'Show'}
                    <div class="col-span-2">
                      <FieldSelect
                        label="Categoria"
                        value={d.categoria ?? ''}
                        options={CATEGORIAS_SERVICO}
                        placeholder="Selecione"
                        class_name="w-full"
                        on:change={(e) => alterarDetalheTexto(passeio, 'categoria', e)}
                      />
                    </div>
                    {@render campoIngressos(passeio)}
                  {/if}
                  {#if passeio.tipo === 'Ingresso'}
                    <div class="col-span-2">
                      <FieldInput
                        label="Categoria"
                        value={d.categoria ?? ''}
                        placeholder="Ex.: Inteira, Meia"
                        class_name="w-full"
                        on:input={(e) => alterarDetalheTexto(passeio, 'categoria', e)}
                      />
                    </div>
                    {@render campoIngressos(passeio)}
                  {/if}
                  {#if passeio.tipo === 'Seguro Viagem'}
                    <div class="col-span-2">
                      <p class="mb-1 block text-xs font-medium text-slate-500">Total de dias</p>
                      <div
                        class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        {diasItem('seguro', passeio.data_inicio, passeio.data_fim) ?? '—'}
                      </div>
                    </div>
                  {/if}
                  {#if passeio.tipo !== 'Trem' || d.segmentos.length > 0}
                    <div class="col-span-2 grid grid-cols-2 gap-2">
                      <FieldInput
                        label="Adultos"
                        type="number"
                        value={passeio.qtd_adultos ?? ''}
                        min="0"
                        step="1"
                        class_name="w-full"
                        on:input={(e) => alterarQuantidadePasseio(passeio, 'qtd_adultos', e)}
                      />
                      <FieldInput
                        label="Valor Adulto"
                        type="number"
                        money
                        value={d.adultos_valor ?? 0}
                        min="0"
                        step="0.01"
                        class_name="w-full"
                        on:moneyInput={(e) => alterarDetalheValor(passeio, 'adultos_valor', e)}
                      />
                    </div>
                    {#if passeio.tipo === 'Seguro Viagem'}
                      <div class="col-span-2 grid grid-cols-2 gap-2">
                        <FieldInput
                          label="Senior"
                          type="number"
                          value={d.senior ?? ''}
                          min="0"
                          step="1"
                          class_name="w-full"
                          on:input={(e) => alterarDetalheNumero(passeio, 'senior', e)}
                        />
                        <FieldInput
                          label="Valor Senior"
                          type="number"
                          money
                          value={d.senior_valor ?? 0}
                          min="0"
                          step="0.01"
                          class_name="w-full"
                          on:moneyInput={(e) => alterarDetalheValor(passeio, 'senior_valor', e)}
                        />
                      </div>
                    {/if}
                    <div class="col-span-2 grid grid-cols-2 gap-2">
                      <FieldInput
                        label="Crianças"
                        type="number"
                        value={passeio.qtd_criancas ?? ''}
                        min="0"
                        step="1"
                        class_name="w-full"
                        on:input={(e) => alterarQuantidadePasseio(passeio, 'qtd_criancas', e)}
                      />
                      <FieldInput
                        label="Valor Criança"
                        type="number"
                        money
                        value={d.criancas_valor ?? 0}
                        min="0"
                        step="0.01"
                        class_name="w-full"
                        on:moneyInput={(e) => alterarDetalheValor(passeio, 'criancas_valor', e)}
                      />
                    </div>
                    <div class="col-span-2 grid grid-cols-2 gap-2">
                      <FieldInput
                        label="Infant"
                        type="number"
                        value={d.infant ?? ''}
                        min="0"
                        step="1"
                        class_name="w-full"
                        on:input={(e) => alterarDetalheNumero(passeio, 'infant', e)}
                      />
                      <FieldInput
                        label="Valor Infant"
                        type="number"
                        money
                        value={d.infant_valor ?? 0}
                        min="0"
                        step="0.01"
                        class_name="w-full"
                        on:moneyInput={(e) => alterarDetalheValor(passeio, 'infant_valor', e)}
                      />
                    </div>
                    <div class="col-span-2">
                      <p class="mb-1 block text-xs font-medium text-slate-500">Total</p>
                      <div
                        class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-800"
                      >
                        {formatTotal(totaisPasseio(passeio).total_amount)}
                      </div>
                    </div>
                  {/if}
                {:else}
                  <div class="col-span-2 grid grid-cols-2 gap-2">
                    <FieldInput
                      label="Adultos"
                      type="number"
                      value={passeio.qtd_adultos ?? ''}
                      class_name="w-full"
                      on:input={(e) => alterarQuantidadePasseio(passeio, 'qtd_adultos', e)}
                    />
                    <FieldInput
                      label="Crianças"
                      type="number"
                      value={passeio.qtd_criancas ?? ''}
                      class_name="w-full"
                      on:input={(e) => alterarQuantidadePasseio(passeio, 'qtd_criancas', e)}
                    />
                  </div>
                  {#if passeio.tipo === 'Passeio'}
                    {@render campoIngressos(passeio)}
                    <div class="col-span-2 grid grid-cols-2 gap-2">
                      <FieldInput
                        money
                        label="Valor original (R$)"
                        type="number"
                        value={passeio.valor_original ?? ''}
                        class_name="w-full"
                        on:moneyInput={(e) => {
                          passeio.valor_original = Number(e.detail) || null;
                        }}
                      />
                      <FieldInput
                        money
                        label="Valor final (R$)"
                        type="number"
                        value={passeio.valor_final ?? ''}
                        class_name="w-full"
                        on:moneyInput={(e) => {
                          passeio.valor_final = Number(e.detail) || null;
                        }}
                      />
                    </div>
                  {:else}
                    <div class="col-span-2">
                      <FieldInput
                        money
                        label="Valor original (R$)"
                        type="number"
                        value={passeio.valor_original ?? ''}
                        class_name="w-full"
                        on:moneyInput={(e) => {
                          passeio.valor_original = Number(e.detail) || null;
                        }}
                      />
                    </div>
                    <div class="col-span-2">
                      <FieldInput
                        money
                        label="Valor final (R$)"
                        type="number"
                        value={passeio.valor_final ?? ''}
                        class_name="w-full"
                        on:moneyInput={(e) => {
                          passeio.valor_final = Number(e.detail) || null;
                        }}
                      />
                    </div>
                  {/if}
                {/if}
              {/if}
            </div>
          </details>
        </div>
      {/each}
    </div>
    <div class="mt-3 flex flex-wrap gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        on:click={() => {
          passeios = addItem(passeios, (ordem) => newPasseio(ordem, tipoNovoPasseio));
        }}
      >
        <Plus size={13} class="mr-1" />
        {rotuloAdicionar}
      </Button>
    </div>
  {/if}

  {#if !apenasTipos}
    <div class="mt-6 rounded-xl border border-dashed border-slate-300 p-4">
      <p class="mb-2 text-sm font-medium text-slate-600">Importar passeios por texto</p>
      <FieldTextarea
        bind:value={passeioImportText}
        rows={4}
        class_name="w-full"
        monospace={true}
        placeholder="Cole o texto com dados dos passeios (um por linha ou texto livre)…"
      />
      <div class="mt-2 flex items-center gap-3">
        <Button type="button" variant="secondary" size="sm" on:click={handleImportPasseioText}
          >Importar</Button
        >
        {#if passeioImportMsg}<span class="text-xs text-green-600">{passeioImportMsg}</span>{/if}
        {#if passeioImportError}<span class="text-xs text-red-600">{passeioImportError}</span>{/if}
      </div>
    </div>
  {/if}
</Card>

<style>
  details > summary .indicador-menos,
  details[open] > summary .indicador-mais {
    display: none;
  }
  details[open] > summary .indicador-menos {
    display: inline;
  }
</style>
