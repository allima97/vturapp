<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import SeletorDestinoGeografico from '$lib/components/SeletorDestinoGeografico.svelte';
  import { toast } from '$lib/stores/ui';
  import { BottomSheet, FieldInput } from '$lib/components/ui';
  import { apiDelete, apiGet, apiPatch, apiPost } from '$lib/services/api';
  import { Edit2, Plus, Trash2, RefreshCw, Search, SlidersHorizontal } from '$lib/icons';
  import { escapeHtml } from '$lib/utils/html';
  import { toUserMessage } from '$lib/utils/errors';
  import { createDebouncedReloader } from '$lib/utils/autoReload';
  import { confirmAction } from '$lib/stores/confirm';

  type Destino = {
    id: string;
    nome: string;
    label: string;
    origem: 'geonames' | 'personalizado';
    referencia_id?: string;
    referencia_indisponivel?: boolean;
    referencia: {
      localidade: string;
      regiao: string | null;
      pais: string;
    };
  };

  type BuscaResponse = {
    items?: Destino[] | null;
    podeHaverMais?: boolean;
  };

  let destinos: Destino[] = [];
  let podeHaverMais = false;
  let loading = false;
  let modalOpen = false;
  let saving = false;
  let deletingId = '';
  let editando: Destino | null = null;
  let busca = '';
  let autoReloadEnabled = false;
  let lastAutoReloadKey = '';
  let showFilterSheet = false;
  let nome = '';
  let referenciaId = '';
  let referenciaValida = false;
  const autoReload = createDebouncedReloader(() => load(), 300);

  function texto(valor: string | null | undefined) {
    const limpo = valor?.trim();
    return escapeHtml(limpo || '—');
  }

  const columns = [
    { key: 'nome', label: 'Nome', sortable: true },
    {
      key: 'origem',
      label: 'Origem',
      sortable: false,
      formatter: (valor: Destino['origem']) =>
        valor === 'personalizado' ? 'Personalizado' : 'GeoNames'
    },
    {
      key: 'cidade',
      label: 'Cidade',
      sortable: false,
      formatter: (_: unknown, row: Destino) => texto(row.referencia.localidade)
    },
    {
      key: 'estado',
      label: 'Estado',
      sortable: false,
      formatter: (_: unknown, row: Destino) => texto(row.referencia.regiao)
    },
    {
      key: 'pais',
      label: 'País',
      sortable: false,
      formatter: (_: unknown, row: Destino) => texto(row.referencia.pais)
    }
  ];

  async function load() {
    const term = busca.trim();
    if (Array.from(term).length < 2) {
      destinos = [];
      podeHaverMais = false;
      loading = false;
      return;
    }

    loading = true;
    try {
      const payload = await apiGet<BuscaResponse>(
        '/api/v1/destinos-geograficos/busca',
        { q: term, idioma: 'pt', limite: 20 },
        undefined,
        30_000
      );
      destinos = Array.isArray(payload?.items) ? payload.items : [];
      podeHaverMais = Boolean(payload?.podeHaverMais);
    } catch (err) {
      destinos = [];
      podeHaverMais = false;
      toast.error(toUserMessage(err, 'Não foi possível buscar destinos. Tente novamente.'));
    } finally {
      loading = false;
    }
  }

  function abrirNovo() {
    editando = null;
    nome = '';
    referenciaId = '';
    referenciaValida = false;
    modalOpen = true;
  }

  function abrirEdicao(destino: Destino) {
    if (destino.origem !== 'personalizado') {
      toast.error('Destinos do GeoNames são somente leitura.');
      return;
    }
    editando = destino;
    nome = destino.nome;
    referenciaId = destino.referencia_id || '';
    referenciaValida = Boolean(referenciaId);
    modalOpen = true;
  }

  function referenciaGeonamesId() {
    if (!referenciaId.startsWith('geonames:')) return null;
    const numero = Number(referenciaId.slice('geonames:'.length));
    return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
  }

  async function salvar() {
    const referencia = referenciaGeonamesId();
    if (!nome.trim()) {
      toast.error('Informe o nome do destino.');
      return;
    }
    if (!referencia) {
      toast.error('Escolha uma localidade do GeoNames como referência.');
      return;
    }
    saving = true;
    try {
      if (editando) {
        await apiPatch('/api/v1/destinos-geograficos', {
          id: editando.id,
          nome,
          referenciaGeoNamesId: referencia
        });
        toast.success('Destino personalizado atualizado.');
      } else {
        await apiPost('/api/v1/destinos-geograficos', {
          nome,
          referenciaGeoNamesId: referencia
        });
        toast.success('Destino personalizado criado.');
      }
      modalOpen = false;
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar o destino.'));
    } finally {
      saving = false;
    }
  }

  async function excluir(destino: Destino) {
    if (destino.origem !== 'personalizado') return;
    if (
      !(await confirmAction(
        'Excluir este destino personalizado? O lugar no GeoNames não será apagado.'
      ))
    )
      return;
    deletingId = destino.id;
    try {
      await apiDelete('/api/v1/destinos-geograficos', { id: destino.id });
      toast.success('Destino personalizado excluído.');
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Não foi possível excluir o destino.'));
    } finally {
      deletingId = '';
    }
  }

  onMount(() => {
    lastAutoReloadKey = busca.trim();
    autoReloadEnabled = true;
  });

  onDestroy(() => {
    autoReload.cancel();
  });

  function agendarBusca() {
    autoReload.schedule();
  }

  $: termoBusca = busca.trim();
  $: if (autoReloadEnabled && termoBusca !== lastAutoReloadKey) {
    lastAutoReloadKey = termoBusca;
    agendarBusca();
  }
</script>

<svelte:head>
  <title>Cidades | VTUR</title>
</svelte:head>

<PageHeader
  title="Cidades"
  subtitle="Busque destinos no GeoNames ou cadastre um nome próprio ligado a uma localidade."
  breadcrumbs={[{ label: 'Cadastros', href: '/cadastros' }, { label: 'Cidades' }]}
  actions={[
    { label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw },
    { label: 'Nova cidade', onClick: abrirNovo, variant: 'primary', icon: Plus }
  ]}
/>

<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Busca
    {#if busca.trim()}
      <span class="ml-2 inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
    {/if}
  </Button>
</div>

<Card class="mb-6 hidden sm:block">
  <FieldInput
    bind:value={busca}
    icon={Search}
    placeholder="Digite pelo menos 2 letras"
    class_name="w-full"
    on:input={(event) => {
      const target = event.target as HTMLInputElement | null;
      busca = target?.value ?? busca;
      agendarBusca();
    }}
  />
</Card>

<BottomSheet bind:open={showFilterSheet} title="Buscar destinos">
  <FieldInput
    id="cid-busca-mobile"
    bind:value={busca}
    icon={Search}
    placeholder="Digite pelo menos 2 letras"
    class_name="w-full"
  />
  <Button variant="primary" class_name="w-full mt-4" on:click={() => (showFilterSheet = false)}>
    Ver resultados
  </Button>
</BottomSheet>

<DataTable
  {columns}
  data={destinos}
  {loading}
  title="Resultados"
  searchable={false}
  emptyMessage={busca.trim().length >= 2
    ? 'Nenhum destino encontrado'
    : 'Digite pelo menos 2 letras para buscar'}
  onRowClick={(row) => abrirEdicao(row)}
  rowActionsAvailable={(row) => row.origem === 'personalizado'}
>
  <svelte:fragment slot="row-actions" let:row>
    {#if row.origem === 'personalizado'}
      <Button
        variant="ghost"
        size="sm"
        class_name="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        title="Editar destino"
        ariaLabel="Editar destino"
        on:click={(event) => {
          event.stopPropagation();
          abrirEdicao(row);
        }}
      >
        <Edit2 size={15} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class_name="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
        disabled={deletingId === row.id}
        title="Excluir destino"
        ariaLabel="Excluir destino"
        on:click={(event) => {
          event.stopPropagation();
          excluir(row);
        }}
      >
        <Trash2 size={15} />
      </Button>
    {/if}
  </svelte:fragment>
</DataTable>

{#if podeHaverMais}
  <p class="mt-3 text-sm text-slate-600">Há mais resultados. Refine o nome para continuar.</p>
{/if}

<Dialog
  bind:open={modalOpen}
  title={editando ? 'Editar destino personalizado' : 'Nova cidade'}
  size="md"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText={editando ? 'Salvar' : 'Criar'}
  loading={saving}
  onConfirm={salvar}
  onCancel={() => (modalOpen = false)}
>
  <div class="space-y-4">
    <FieldInput
      id="cid-nome"
      label="Nome"
      required={true}
      bind:value={nome}
      placeholder="Ex.: Porto de Galinhas"
      class_name="w-full"
    />
    {#if modalOpen}
      <SeletorDestinoGeografico
        fieldId="cid-referencia"
        label="Localidade de referência no GeoNames"
        required={true}
        somenteGeonames={true}
        bind:destinoId={referenciaId}
        bind:valid={referenciaValida}
      />
    {/if}
    <p class="text-xs text-slate-500">
      O nome fica livre. A referência precisa ser um lugar do GeoNames, como Ipojuca-PE. Nada é
      gravado na base GeoNames.
    </p>
    {#if nome.trim() && !referenciaValida}
      <p class="text-xs text-amber-700">Selecione a localidade na lista antes de salvar.</p>
    {/if}
  </div>
</Dialog>
