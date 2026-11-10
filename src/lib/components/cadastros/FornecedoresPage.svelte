<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { FieldInput, FieldSelect } from '$lib/components/ui';
  import { Building2, MapPin, Phone, Wallet, Plus } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { apiGet, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';

  type Fornecedor = {
    id: string;
    nome_completo?: string | null;
    nome_fantasia?: string | null;
    localizacao?: string | null;
    cidade?: string | null;
    estado?: string | null;
    telefone?: string | null;
    whatsapp?: string | null;
    telefone_emergencia?: string | null;
    responsavel?: string | null;
    tipo_faturamento?: string | null;
    principais_servicos?: string | null;
    ativo?: boolean | null;
    produtos_vinculados?: number;
  };

  let loading = true;
  let fornecedores: Fornecedor[] = [];
  let busca = '';
  let filtroStatus = '';
  let filtroLocalizacao = '';
  let filtroFaturamento = '';
  const loadGuard = createLoadGuard();

  async function loadFornecedores() {
    const request = loadGuard.next();
    loading = true;
    try {
      const data = await apiGet<{ items?: Fornecedor[] }>(
        '/api/v1/fornecedores',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      fornecedores = data.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error('Erro ao carregar fornecedores.');
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  onMount(loadFornecedores);

  const DIACRITICS_RE = /[\u0300-\u036f]/g;

  function normalize(value?: string | null) {
    return String(value || '')
      .normalize('NFD')
      .replace(DIACRITICS_RE, '')
      .toLowerCase()
      .trim();
  }

  function formatLocalizacao(value?: string | null) {
    return value === 'exterior' ? 'Exterior' : 'Brasil';
  }

  function formatFaturamento(value?: string | null) {
    switch (String(value || '')) {
      case 'pre_pago':
        return 'Pré-pago';
      case 'semanal':
        return 'Semanal';
      case 'quinzenal':
        return 'Quinzenal';
      case 'mensal':
        return 'Mensal';
      default:
        return value || '-';
    }
  }

  function statusBadge(value?: boolean | null) {
    return value !== false
      ? '<span class="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">Ativo</span>'
      : '<span class="inline-flex rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-600">Inativo</span>';
  }

  $: rows = fornecedores.map((item) => ({
    ...item,
    parceiro_nome: item.nome_fantasia || item.nome_completo || '-',
    local_label: `${formatLocalizacao(item.localizacao)}${item.cidade ? ` - ${item.cidade}` : ''}${item.estado ? `/${item.estado}` : ''}`,
    faturamento_label: formatFaturamento(item.tipo_faturamento),
    contato_label: item.responsavel || '-',
    servicos_label:
      item.principais_servicos && item.principais_servicos.length > 80
        ? `${item.principais_servicos.slice(0, 80)}...`
        : item.principais_servicos || '-'
  }));

  $: filteredRows = rows.filter((item) => {
    const termo = normalize(busca);
    if (termo) {
      const haystack = normalize(
        [
          item.parceiro_nome,
          item.nome_completo,
          item.responsavel,
          item.telefone,
          item.whatsapp,
          item.local_label,
          item.servicos_label
        ].join(' ')
      );
      if (!haystack.includes(termo)) return false;
    }
    if (filtroStatus === 'ativo' && item.ativo === false) return false;
    if (filtroStatus === 'inativo' && item.ativo !== false) return false;
    if (filtroLocalizacao && item.localizacao !== filtroLocalizacao) return false;
    if (filtroFaturamento && item.tipo_faturamento !== filtroFaturamento) return false;
    return true;
  });

  $: stats = fornecedores.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.ativo !== false) acc.ativos += 1;
      if (item.localizacao === 'exterior') acc.exterior += 1;
      if ((item.produtos_vinculados || 0) > 0) acc.vinculados += 1;
      return acc;
    },
    { total: 0, ativos: 0, exterior: 0, vinculados: 0 }
  );

  const columns = [
    { key: 'parceiro_nome', label: 'Nome fantasia', sortable: true },
    { key: 'local_label', label: 'Local', sortable: true, width: '220px' },
    { key: 'faturamento_label', label: 'Faturamento', sortable: true, width: '140px' },
    { key: 'telefone', label: 'Telefone', sortable: true, width: '150px' },
    { key: 'whatsapp', label: 'WhatsApp', sortable: true, width: '150px' },
    { key: 'telefone_emergencia', label: 'Emergência', sortable: true, width: '150px' },
    { key: 'servicos_label', label: 'Serviços', sortable: false },
    {
      key: 'ativo',
      label: 'Status',
      sortable: true,
      width: '110px',
      formatter: (value: boolean) => statusBadge(value)
    }
  ];
</script>

<svelte:head>
  <title>Fornecedores | VTUR</title>
</svelte:head>

<PageHeader
  title="Fornecedores"
  subtitle="Cadastros de apoio operacional usados por produtos, operação e fluxo comercial"
  color="financeiro"
  breadcrumbs={[{ label: 'Cadastros', href: '/cadastros' }, { label: 'Fornecedores' }]}
  actions={[
    {
      label: 'Novo fornecedor',
      onClick: () => goto('/cadastros/fornecedores/novo'),
      variant: 'primary',
      icon: Plus
    }
  ]}
/>

<div class="vtur-kpi-grid mb-6">
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
      <Building2 size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Total</p>
      <p class="text-2xl font-bold text-slate-900">{stats.total}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
      <Phone size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Ativos</p>
      <p class="text-2xl font-bold text-slate-900">{stats.ativos}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
      <MapPin size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Exterior</p>
      <p class="text-2xl font-bold text-slate-900">{stats.exterior}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-500">
      <Wallet size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Com produtos</p>
      <p class="text-2xl font-bold text-slate-900">{stats.vinculados}</p>
    </div>
  </div>
</div>

<Card color="financeiro" class="mb-6">
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-4">
    <FieldInput
      id="forn-busca"
      label="Buscar"
      bind:value={busca}
      placeholder="Fantasia, razão social, responsável..."
    />
    <FieldSelect
      id="forn-status"
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
      id="forn-local"
      label="Localização"
      bind:value={filtroLocalizacao}
      placeholder={null}
      options={[
        { value: '', label: 'Todas' },
        { value: 'brasil', label: 'Brasil' },
        { value: 'exterior', label: 'Exterior' }
      ]}
    />
    <FieldSelect
      id="forn-fat"
      label="Faturamento"
      bind:value={filtroFaturamento}
      placeholder={null}
      options={[
        { value: '', label: 'Todos' },
        { value: 'pre_pago', label: 'Pré-pago' },
        { value: 'semanal', label: 'Semanal' },
        { value: 'quinzenal', label: 'Quinzenal' },
        { value: 'mensal', label: 'Mensal' }
      ]}
    />
  </div>
</Card>

<DataTable
  {columns}
  data={filteredRows}
  color="financeiro"
  {loading}
  title="Base de fornecedores"
  searchable={false}
  filterable={false}
  exportable={false}
  onRowClick={(row) => goto(`/cadastros/fornecedores/${row.id}/editar`)}
  emptyMessage="Nenhum fornecedor encontrado."
/>
