<script lang="ts">
  import { dev } from '$app/environment';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import { BottomSheet, FieldInput, FieldSelect, LoadingState } from '$lib/components/ui';
  import { apiDelete, apiGet, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import {
    Plus,
    Route,
    MapPin,
    Calendar,
    DollarSign,
    Search,
    SlidersHorizontal,
    Trash2
  } from '$lib/icons';
  import { toast } from '$lib/stores/ui';

  interface Circuito {
    id: string;
    codigo: string;
    nome: string;
    tipo: 'nacional' | 'internacional';
    dias: number;
    noites: number;
    destinos: string[];
    destinos_str: string;
    preco_base: number;
    vagas?: number;
    guia?: boolean;
    ativo: boolean;
    saidas?: string;
    descricao?: string;
    created_at: string;
  }

  interface CircuitoApiItem extends Omit<Circuito, 'destinos' | 'destinos_str'> {
    destinos?: string[] | string | null;
  }

  interface CircuitosResponse {
    items?: CircuitoApiItem[] | null;
  }

  let circuitos: Circuito[] = [];
  let loading = true;
  let showDeleteDialog = false;
  let circuitoToDelete: Circuito | null = null;
  let filtroTipo = '';
  let filtroDias = '';
  let filtroStatus = '';
  let searchQuery = '';
  let showFilterSheet = false;
  const loadGuard = createLoadGuard();
  const BRL_INTEGER_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  });

  const columns = [
    { key: 'codigo', label: 'Código', sortable: true, width: '90px' },
    { key: 'nome', label: 'Nome', sortable: true },
    {
      key: 'tipo',
      label: 'Tipo',
      sortable: true,
      width: '110px',
      formatter: (v: string) => getTipoBadge(v)
    },
    {
      key: 'dias',
      label: 'Duração',
      sortable: true,
      width: '100px',
      formatter: (v: number, row: Circuito) => `${v}d/${row.noites}n`
    },
    { key: 'destinos_str', label: 'Destinos', sortable: false },
    {
      key: 'preco_base',
      label: 'Preço',
      sortable: true,
      align: 'right' as const,
      width: '110px',
      formatter: (v: number) => formatCurrency(v)
    },
    {
      key: 'ativo',
      label: 'Status',
      sortable: true,
      width: '90px',
      formatter: (v: boolean) => getStatusBadge(v)
    }
  ];

  onMount(async () => {
    await carregarCircuitos();
  });

  async function carregarCircuitos() {
    const request = loadGuard.next();
    loading = true;
    try {
      const data = await apiGet<CircuitosResponse>(
        '/api/v1/circuitos',
        {
          tipo: filtroTipo || undefined,
          ativo: filtroStatus ? filtroStatus === 'ativo' : undefined
        },
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      circuitos = (data.items || []).map(
        (c): Circuito => ({
          ...c,
          destinos: Array.isArray(c.destinos) ? c.destinos : c.destinos ? [c.destinos] : [],
          destinos_str: Array.isArray(c.destinos) ? c.destinos.join(', ') : c.destinos || ''
        })
      );
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (dev) console.error('Erro ao carregar circuitos:', err);
      toast.error('Erro ao carregar circuitos');
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function getTipoBadge(tipo: string): string {
    if (tipo === 'nacional') {
      return `<span class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700"><span class="w-2 h-2 rounded-full bg-green-500"></span>Nacional</span>`;
    }
    return `<span class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700"><span class="w-2 h-2 rounded-full bg-blue-500"></span>Internacional</span>`;
  }

  function getStatusBadge(ativo: boolean): string {
    if (ativo) {
      return `<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Ativo</span>`;
    }
    return `<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-slate-200 text-slate-600">Inativo</span>`;
  }

  function formatCurrency(value: number): string {
    return BRL_INTEGER_CURRENCY_FORMATTER.format(value || 0);
  }

  async function confirmDelete() {
    if (!circuitoToDelete) return;

    try {
      await apiDelete(`/api/v1/circuitos/${circuitoToDelete.id}`);
      toast.success('Circuito excluído com sucesso!');
      await carregarCircuitos();
    } catch (err) {
      toast.error('Erro ao excluir circuito');
    } finally {
      showDeleteDialog = false;
      circuitoToDelete = null;
    }
  }

  $: normalizedSearchQuery = searchQuery.toLowerCase();

  $: filteredCircuitos = circuitos.filter((c) => {
    if (filtroDias === 'curto' && c.dias > 5) return false;
    if (filtroDias === 'medio' && (c.dias <= 5 || c.dias > 10)) return false;
    if (filtroDias === 'longo' && c.dias <= 10) return false;
    if (
      normalizedSearchQuery &&
      !c.nome.toLowerCase().includes(normalizedSearchQuery) &&
      !c.codigo.toLowerCase().includes(normalizedSearchQuery)
    )
      return false;
    return true;
  });

  $: stats = (() => {
    const resumo = circuitos.reduce(
      (acc, c) => {
        acc.total += 1;
        if (c.ativo) acc.ativos += 1;
        if (c.tipo === 'nacional') acc.nacionais += 1;
        if (c.tipo === 'internacional') acc.internacionais += 1;
        acc.precoTotal += c.preco_base || 0;
        return acc;
      },
      { total: 0, ativos: 0, nacionais: 0, internacionais: 0, precoTotal: 0 }
    );

    return {
      total: resumo.total,
      ativos: resumo.ativos,
      nacionais: resumo.nacionais,
      internacionais: resumo.internacionais,
      precoMedio: resumo.total > 0 ? resumo.precoTotal / resumo.total : 0
    };
  })();
</script>

<svelte:head>
  <title>Circuitos | VTUR</title>
</svelte:head>

<PageHeader
  title="Circuitos"
  subtitle="Gerenciamento de roteiros e pacotes combinados"
  color="financeiro"
  breadcrumbs={[{ label: 'Cadastros', href: '/cadastros' }, { label: 'Circuitos' }]}
  actions={[
    {
      label: 'Novo Circuito',
      onClick: () => goto('/cadastros/circuitos/novo'),
      variant: 'primary',
      icon: Plus
    }
  ]}
/>

{#if loading}
  <LoadingState />
{:else}
  <!-- Stats -->
  <div class="vtur-kpi-grid vtur-kpi-grid-5 mb-6">
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-500">
        <Route size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Total</p>
        <p class="text-2xl font-bold text-slate-900">{stats.total}</p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
        <Calendar size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Ativos</p>
        <p class="text-2xl font-bold text-slate-900">{stats.ativos}</p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-500">
        <MapPin size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Nacionais</p>
        <p class="text-2xl font-bold text-slate-900">{stats.nacionais}</p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
        <MapPin size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Internacionais</p>
        <p class="text-2xl font-bold text-slate-900">{stats.internacionais}</p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
        <DollarSign size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Preço Médio</p>
        <p class="text-2xl font-bold text-slate-900">{formatCurrency(stats.precoMedio)}</p>
      </div>
    </div>
  </div>

  <!-- Mobile: botão de filtros -->
  <div class="mb-4 sm:hidden">
    <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
      <SlidersHorizontal size={16} class="mr-2" />
      Filtros
      {#if searchQuery.trim() || filtroTipo || filtroDias || filtroStatus}
        <span class="bg-financeiro-500 ml-2 inline-flex h-2 w-2 rounded-full"></span>
      {/if}
    </Button>
  </div>

  <!-- Filtros -->
  <Card color="financeiro" class="mb-6 hidden sm:block">
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <FieldInput
        id="filtro-circuito-busca"
        label="Busca"
        placeholder="Nome ou código..."
        bind:value={searchQuery}
        icon={Search}
        class_name="w-full"
      />
      <FieldSelect
        id="filtro-tipo"
        label="Tipo"
        bind:value={filtroTipo}
        options={[
          { value: 'nacional', label: 'Nacional' },
          { value: 'internacional', label: 'Internacional' }
        ]}
        placeholder="Todos"
        class_name="w-full"
        on:change={carregarCircuitos}
      />
      <FieldSelect
        id="filtro-dias"
        label="Duração"
        bind:value={filtroDias}
        options={[
          { value: 'curto', label: 'Curto (até 5 dias)' },
          { value: 'medio', label: 'Médio (6-10 dias)' },
          { value: 'longo', label: 'Longo (11+ dias)' }
        ]}
        placeholder="Todas"
        class_name="w-full"
      />
      <FieldSelect
        id="filtro-status"
        label="Status"
        bind:value={filtroStatus}
        options={[
          { value: 'ativo', label: 'Ativo' },
          { value: 'inativo', label: 'Inativo' }
        ]}
        placeholder="Todos"
        class_name="w-full"
        on:change={carregarCircuitos}
      />
    </div>
  </Card>

  <!-- Tabela -->
  <DataTable
    {columns}
    data={filteredCircuitos}
    color="financeiro"
    {loading}
    title="Lista de Circuitos"
    searchable={true}
    onRowClick={(row) => goto(`/cadastros/circuitos/${row.id}/editar`)}
    emptyMessage="Nenhum circuito encontrado"
  >
    <svelte:fragment slot="row-actions" let:row>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        ariaLabel="Excluir circuito"
        class_name="h-8 w-8 p-0! text-slate-400 hover:bg-red-50! hover:text-red-600!"
        on:click={(event) => {
          event.stopPropagation();
          circuitoToDelete = row;
          showDeleteDialog = true;
        }}
      >
        <Trash2 size={15} />
      </Button>
    </svelte:fragment>
  </DataTable>
{/if}

<BottomSheet bind:open={showFilterSheet} title="Filtrar circuitos">
  <div class="space-y-4">
    <FieldInput
      id="filtro-circuito-busca-mobile"
      placeholder="Nome ou código..."
      bind:value={searchQuery}
      icon={Search}
      class_name="w-full"
    />
    <FieldSelect
      id="filtro-tipo-mobile"
      label="Tipo"
      bind:value={filtroTipo}
      options={[
        { value: 'nacional', label: 'Nacional' },
        { value: 'internacional', label: 'Internacional' }
      ]}
      placeholder="Todos"
      class_name="w-full"
      on:change={carregarCircuitos}
    />
    <FieldSelect
      id="filtro-dias-mobile"
      label="Duração"
      bind:value={filtroDias}
      options={[
        { value: 'curto', label: 'Curto (até 5 dias)' },
        { value: 'medio', label: 'Médio (6-10 dias)' },
        { value: 'longo', label: 'Longo (11+ dias)' }
      ]}
      placeholder="Todas"
      class_name="w-full"
    />
    <FieldSelect
      id="filtro-status-mobile"
      label="Status"
      bind:value={filtroStatus}
      options={[
        { value: 'ativo', label: 'Ativo' },
        { value: 'inativo', label: 'Inativo' }
      ]}
      placeholder="Todos"
      class_name="w-full"
      on:change={carregarCircuitos}
    />
  </div>
  <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}
    >Aplicar filtros</Button
  >
</BottomSheet>

<!-- Dialog de confirmação -->
<Dialog
  bind:open={showDeleteDialog}
  title="Confirmar Exclusão"
  size="sm"
  color="financeiro"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText="Excluir"
  onConfirm={confirmDelete}
  onCancel={() => (showDeleteDialog = false)}
>
  <p class="text-slate-600">
    Tem certeza que deseja excluir o circuito <strong>{circuitoToDelete?.nome}</strong>? Esta ação
    não pode ser desfeita.
  </p>
</Dialog>
