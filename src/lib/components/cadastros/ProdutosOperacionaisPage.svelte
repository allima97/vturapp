<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { FieldInput, FieldSelect } from '$lib/components/ui';
  import { Package, MapPin, Globe2, Hotel, Plus } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { apiGet, isCanceledApiError } from '$lib/services/api';
  import { formatDate as formatDateValue } from '$lib/utils/formatters';
  import { createLoadGuard } from '$lib/utils/loadGuard';

  export let mode: 'produtos' | 'destinos' = 'produtos';

  type Produto = {
    id: string;
    nome: string;
    destino?: string | null;
    cidade_id?: string | null;
    tipo_produto?: string | null;
    ativo?: boolean | null;
    fornecedor_id?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    todas_as_cidades?: boolean | null;
  };

  type Option = {
    id: string;
    nome?: string | null;
    tipo?: string | null;
    nome_fantasia?: string | null;
    nome_completo?: string | null;
    subdivisao?: { nome?: string | null; sigla?: string | null } | null;
    subdivisao_nome?: string | null;
    estado?: string | null;
    uf?: string | null;
    pais?: string | null;
  };

  let loading = true;
  let produtos: Produto[] = [];
  let tipos: Option[] = [];
  let cidades: Option[] = [];
  let fornecedores: Option[] = [];
  let search = '';
  let filtroTipo = '';
  let filtroStatus = '';
  let filtroAbrangencia = '';
  const loadGuard = createLoadGuard();
  $: normalizedSearch = search.trim().toLowerCase();

  async function loadBase() {
    const request = loadGuard.next();
    loading = true;
    try {
      const data = await apiGet<{
        produtos?: Produto[];
        tipos?: Option[];
        cidades?: Option[];
        fornecedores?: Option[];
      }>('/api/v1/produtos/base', { all: 1, page: 1, pageSize: 500 }, request.signal);
      if (!loadGuard.isCurrent(request.seq)) return;
      produtos = data.produtos || [];
      tipos = data.tipos || [];
      cidades = data.cidades || [];
      fornecedores = data.fornecedores || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error('Erro ao carregar base de produtos.');
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  onMount(loadBase);

  function formatCidade(cidadeId?: string | null) {
    if (!cidadeId) return '-';
    const cidade = cidades.find((item) => item.id === cidadeId);
    if (!cidade) return '-';
    const estado =
      cidade.estado ||
      cidade.uf ||
      cidade.subdivisao_nome ||
      cidade.subdivisao?.sigla ||
      cidade.subdivisao?.nome ||
      '';
    return estado ? `${cidade.nome} (${estado})` : cidade.nome || '-';
  }

  function formatTipo(tipoId?: string | null) {
    const tipo = tipos.find((item) => item.id === tipoId);
    return tipo?.nome || tipo?.tipo || '-';
  }

  function formatFornecedor(fornecedorId?: string | null) {
    const fornecedor = fornecedores.find((item) => item.id === fornecedorId);
    return fornecedor?.nome_fantasia || fornecedor?.nome_completo || '-';
  }

  function formatDate(value?: string | null) {
    return formatDateValue(value);
  }

  function statusBadge(value?: boolean | null) {
    return value !== false
      ? '<span class="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">Ativo</span>'
      : '<span class="inline-flex rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-600">Inativo</span>';
  }

  function abrangenciaBadge(row: Produto) {
    return row.todas_as_cidades
      ? '<span class="inline-flex rounded-full bg-sky-100 px-2 py-1 text-xs font-medium text-sky-700">Global</span>'
      : '<span class="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">Por cidade</span>';
  }

  $: rows = produtos.map((produto) => ({
    ...produto,
    tipo_nome: formatTipo(produto.tipo_produto),
    cidade_nome: formatCidade(produto.cidade_id),
    fornecedor_nome: formatFornecedor(produto.fornecedor_id)
  }));

  $: filteredRows = rows.filter((produto) => {
    if (normalizedSearch) {
      const haystack = [
        produto.nome,
        produto.destino,
        produto.tipo_nome,
        produto.cidade_nome,
        produto.fornecedor_nome
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(normalizedSearch)) return false;
    }

    if (filtroTipo && produto.tipo_produto !== filtroTipo) return false;
    if (filtroStatus === 'ativo' && produto.ativo === false) return false;
    if (filtroStatus === 'inativo' && produto.ativo !== false) return false;
    if (filtroAbrangencia === 'global' && produto.todas_as_cidades !== true) return false;
    if (filtroAbrangencia === 'cidade' && produto.todas_as_cidades === true) return false;
    return true;
  });

  $: stats = rows.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.ativo !== false) acc.ativos += 1;
      if (item.todas_as_cidades === true) acc.globais += 1;
      const tipo = item.tipo_nome.toLowerCase();
      if (['hotel', 'pousada', 'resort', 'flat'].some((keyword) => tipo.includes(keyword))) {
        acc.hospedagem += 1;
      }
      return acc;
    },
    { total: 0, ativos: 0, globais: 0, hospedagem: 0 }
  );

  const columns = [
    { key: 'nome', label: 'Nome', sortable: true },
    { key: 'tipo_nome', label: 'Tipo', sortable: true, width: '180px' },
    { key: 'destino', label: 'Destino', sortable: true, width: '180px' },
    { key: 'cidade_nome', label: 'Cidade', sortable: true, width: '180px' },
    { key: 'fornecedor_nome', label: 'Fornecedor', sortable: true, width: '180px' },
    {
      key: 'todas_as_cidades',
      label: 'Abrangência',
      sortable: true,
      width: '120px',
      formatter: (_value: unknown, row: Produto) => abrangenciaBadge(row)
    },
    {
      key: 'ativo',
      label: 'Status',
      sortable: true,
      width: '110px',
      formatter: (value: boolean) => statusBadge(value)
    },
    {
      key: 'updated_at',
      label: 'Atualizado',
      sortable: true,
      width: '120px',
      formatter: (value: string) => formatDate(value)
    }
  ];

  $: routeBase = mode === 'destinos' ? '/cadastros/destinos' : '/cadastros/produtos';
  $: title = mode === 'destinos' ? 'Destinos' : 'Produtos';
  $: subtitle =
    mode === 'destinos'
      ? 'Base operacional compartilhada com produtos, vendas e orçamentos'
      : 'Base operacional de produtos, destinos e atributos consumidos pela operação';
</script>

<svelte:head>
  <title>{title} | VTUR</title>
</svelte:head>

<PageHeader
  {title}
  {subtitle}
  color="financeiro"
  breadcrumbs={[{ label: 'Cadastros', href: '/cadastros' }, { label: title }]}
  actions={[
    {
      label: mode === 'destinos' ? 'Novo destino' : 'Novo produto',
      onClick: () => goto(`${routeBase}/novo`),
      variant: 'primary',
      icon: Plus
    }
  ]}
/>

<div class="vtur-kpi-grid mb-6">
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
      <Package size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Total</p>
      <p class="text-2xl font-bold text-slate-900">{stats.total}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
      <MapPin size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Ativos</p>
      <p class="text-2xl font-bold text-slate-900">{stats.ativos}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
      <Globe2 size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Globais</p>
      <p class="text-2xl font-bold text-slate-900">{stats.globais}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-500">
      <Hotel size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Hospedagem</p>
      <p class="text-2xl font-bold text-slate-900">{stats.hospedagem}</p>
    </div>
  </div>
</div>

<Card color="financeiro" class="mb-6">
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-4">
    <FieldInput
      id="produtos-busca"
      label="Buscar"
      bind:value={search}
      placeholder="Nome, destino, tipo, cidade..."
    />
    <FieldSelect
      id="produtos-tipo"
      label="Tipo"
      bind:value={filtroTipo}
      placeholder={null}
      options={[
        { value: '', label: 'Todos' },
        ...tipos.map((tipo) => ({ value: tipo.id, label: tipo.nome || tipo.tipo || '-' }))
      ]}
    />
    <FieldSelect
      id="produtos-status"
      label="Status"
      bind:value={filtroStatus}
      placeholder={null}
      options={[
        { value: '', label: 'Todos' },
        { value: 'ativo', label: 'Ativo' },
        { value: 'inativo', label: 'Inativo' }
      ]}
    />
    <FieldSelect
      id="produtos-abrangencia"
      label="Abrangência"
      bind:value={filtroAbrangencia}
      placeholder={null}
      options={[
        { value: '', label: 'Todas' },
        { value: 'global', label: 'Global' },
        { value: 'cidade', label: 'Por cidade' }
      ]}
    />
  </div>
</Card>

<DataTable
  {columns}
  data={filteredRows}
  color="financeiro"
  {loading}
  title={`Base de ${title.toLowerCase()}`}
  searchable={false}
  filterable={false}
  exportable={false}
  onRowClick={(row) => goto(`${routeBase}/${row.id}/editar`)}
  emptyMessage={`Nenhum ${mode === 'destinos' ? 'destino' : 'produto'} encontrado.`}
/>
