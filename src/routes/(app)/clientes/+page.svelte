<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { CalendarDays, Plus, Users, Wallet, FileText, Clock } from '$lib/icons';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import KPICard from '$lib/components/kpis/KPICard.svelte';
  import KPIGrid from '$lib/components/kpis/KPIGrid.svelte';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { formatDate } from '$lib/utils/formatters';
  import { escapeHtml } from '$lib/utils/html';
  import { apiGet, isCanceledApiError } from '$lib/services/api';

  type Cliente = {
    id: string;
    nome: string;
    cpf: string | null;
    documento: string;
    email: string | null;
    telefone: string | null;
    whatsapp: string | null;
    contato: string;
    data_nascimento: string | null;
    cidade: string | null;
    estado: string | null;
    cidade_uf: string;
    classificacao: string | null;
    tipo_pessoa: string;
    tipo_cliente: string;
    tags: string[];
    tags_text: string;
    status: 'ativo' | 'inativo' | 'prospect';
    ultima_compra: string | null;
    total_gasto: number;
    total_viagens: number;
    total_orcamentos: number;
    aniversario_hoje: boolean;
    ativo: boolean;
    created_at: string | null;
  };

  let clientes: Cliente[] = [];
  let loading = true;
  let loadingSummary = true;
  let errorMessage: string | null = null;
  let mounted = false;
  let listPage = 1;
  let listPageSize = 25;
  let totalClientes = 0;
  let searchTerm = '';
  let filterValues: Record<string, string> = {};
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let requestSeq = 0;
  let requestAbortController: AbortController | null = null;
  let lastSummaryKey = '';
  let summary = {
    total: 0,
    ativos: 0,
    aniversariantesHoje: 0,
    totalCarteira: 0,
    comViagem: 0,
    emNegociacao: 0
  };
  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  const columns = [
    {
      key: 'nome',
      label: 'Cliente',
      sortable: true,
      formatter: (_value: string, row: Cliente) => {
        const aniversario = row.aniversario_hoje
          ? '<span class="ml-2 rounded-full bg-pink-100 px-2 py-0.5 text-[11px] font-semibold text-pink-700">Aniversario</span>'
          : '';
        const tags = row.tags.length
          ? `<div class="mt-1 text-xs text-slate-500">${row.tags.map((tag) => escapeHtml(tag)).join(', ')}</div>`
          : '';
        return `<div><div class="font-semibold text-slate-900">${escapeHtml(row.nome)}${aniversario}</div><div class="text-xs text-slate-500">${escapeHtml(row.email || 'Sem e-mail')}</div>${tags}</div>`;
      }
    },
    {
      key: 'documento',
      label: 'CPF/CNPJ',
      sortable: true
    },
    {
      key: 'contato',
      label: 'Contato',
      sortable: true,
      formatter: (_value: string, row: Cliente) =>
        `<div><div>${escapeHtml(row.whatsapp || row.telefone || '-')}</div><div class="text-xs text-slate-500">${escapeHtml(row.email || 'Sem e-mail')}</div></div>`
    },
    {
      key: 'cidade_uf',
      label: 'Cidade/UF',
      sortable: true,
      formatter: (value: string) => value || '-'
    },
    {
      key: 'tipo_pessoa',
      label: 'Tipo',
      sortable: true,
      formatter: (value: string, row: Cliente) =>
        `<span>${value === 'PJ' ? 'PJ' : 'PF'} · ${escapeHtml(row.tipo_cliente || 'passageiro')}</span>`
    },
    {
      key: 'classificacao',
      label: 'Classificacao',
      sortable: true,
      formatter: (value: string | null) => `<span>${escapeHtml(value || '-')}</span>`
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      formatter: (value: string, row: Cliente) => {
        const styles = {
          ativo: 'bg-green-100 text-green-700',
          inativo: 'bg-red-100 text-red-700',
          prospect: 'bg-blue-100 text-blue-700'
        };
        const labels = {
          ativo: 'Ativo',
          inativo: 'Inativo',
          prospect: 'Prospect'
        };
        const extra =
          row.total_viagens > 0
            ? ` · ${row.total_viagens} viagens`
            : row.total_orcamentos > 0
              ? ` · ${row.total_orcamentos} orc.`
              : '';
        return `<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[value as keyof typeof styles]}">${labels[value as keyof typeof labels]}${extra}</span>`;
      }
    },
    {
      key: 'total_gasto',
      label: 'Total Gasto',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => BRL_CURRENCY_FORMATTER.format(value || 0)
    },
    {
      key: 'ultima_compra',
      label: 'Ultima Compra',
      sortable: true,
      formatter: (value: string | null, row: Cliente) =>
        value
          ? `${formatDate(value)} · ${row.total_orcamentos} orc.`
          : row.total_orcamentos > 0
            ? `Sem venda · ${row.total_orcamentos} orc.`
            : '-'
    }
  ];

  $: statusAtivos = summary.ativos;
  $: aniversariantesHoje = summary.aniversariantesHoje;
  $: totalCarteira = summary.totalCarteira;
  $: clientesComViagem = summary.comViagem;
  $: clientesEmNegociacao = summary.emNegociacao;

  $: filters = [
    {
      key: 'status',
      label: 'Status',
      type: 'select' as const,
      options: [
        { value: 'ativo', label: 'Ativo' },
        { value: 'inativo', label: 'Inativo' },
        { value: 'prospect', label: 'Prospect' }
      ]
    },
    {
      key: 'estado',
      label: 'Estado',
      type: 'select' as const,
      options: [
        'AC',
        'AL',
        'AP',
        'AM',
        'BA',
        'CE',
        'DF',
        'ES',
        'GO',
        'MA',
        'MT',
        'MS',
        'MG',
        'PA',
        'PB',
        'PR',
        'PE',
        'PI',
        'RJ',
        'RN',
        'RS',
        'RO',
        'RR',
        'SC',
        'SP',
        'SE',
        'TO'
      ].map((uf) => ({ value: uf, label: uf }))
    },
    {
      key: 'tipo_pessoa',
      label: 'Tipo de Pessoa',
      type: 'select' as const,
      options: [
        { value: 'PF', label: 'Pessoa Fisica' },
        { value: 'PJ', label: 'Pessoa Juridica' }
      ]
    },
    {
      key: 'classificacao',
      label: 'Classificacao',
      type: 'select' as const,
      options: ['A', 'B', 'C', 'D', 'E'].map((item) => ({ value: item, label: item }))
    },
    {
      key: 'aniversario_hoje',
      label: 'Aniversariante Hoje',
      type: 'select' as const,
      options: [
        { value: 'true', label: 'Sim' },
        { value: 'false', label: 'Nao' }
      ]
    }
  ];

  function getSummaryKey() {
    return JSON.stringify({
      busca: searchTerm,
      status: filterValues.status || '',
      estado: filterValues.estado || '',
      tipo_pessoa: filterValues.tipo_pessoa || '',
      classificacao: filterValues.classificacao || '',
      aniversario_hoje: filterValues.aniversario_hoje || ''
    });
  }

  async function loadClientes() {
    const seq = ++requestSeq;
    requestAbortController?.abort();
    const controller = new AbortController();
    requestAbortController = controller;
    loading = true;
    loadingSummary = true;
    errorMessage = null;

    try {
      // Uma única chamada com include_summary=1 elimina o segundo round-trip
      // que antes era disparado separadamente por loadClientesResumo().
      const payload = await apiGet<{
        items?: Cliente[];
        total?: number;
        summary?: Partial<typeof summary>;
      }>(
        '/api/v1/clientes/list',
        {
          page: String(listPage),
          pageSize: String(listPageSize),
          busca: searchTerm,
          status: filterValues.status || '',
          estado: filterValues.estado || '',
          tipo_pessoa: filterValues.tipo_pessoa || '',
          classificacao: filterValues.classificacao || '',
          aniversario_hoje: filterValues.aniversario_hoje || '',
          include_summary: '1'
        },
        controller.signal,
        60_000
      );

      if (seq !== requestSeq) return;

      clientes = Array.isArray(payload?.items) ? payload.items : [];
      totalClientes = Number(payload?.total || clientes.length || 0);
      lastSummaryKey = getSummaryKey();

      // Usar summary retornado pela API; se ausente, derivar dos itens da página
      const s = payload?.summary;
      const fallbackSummary = clientes.reduce(
        (acc, item) => {
          if (item.status === 'ativo') acc.ativos += 1;
          if (item.aniversario_hoje) acc.aniversariantesHoje += 1;
          acc.totalCarteira += Number(item.total_gasto || 0);
          if (item.total_viagens > 0) acc.comViagem += 1;
          if (item.total_orcamentos > 0 && item.total_viagens === 0) acc.emNegociacao += 1;
          return acc;
        },
        { ativos: 0, aniversariantesHoje: 0, totalCarteira: 0, comViagem: 0, emNegociacao: 0 }
      );
      summary = {
        total: Number(s?.total ?? totalClientes),
        ativos: Number(s?.ativos ?? fallbackSummary.ativos),
        aniversariantesHoje: Number(s?.aniversariantesHoje ?? fallbackSummary.aniversariantesHoje),
        totalCarteira: Number(s?.totalCarteira ?? fallbackSummary.totalCarteira),
        comViagem: Number(s?.comViagem ?? fallbackSummary.comViagem),
        emNegociacao: Number(s?.emNegociacao ?? fallbackSummary.emNegociacao)
      };
    } catch (error: unknown) {
      if (isCanceledApiError(error)) return;
      if (seq !== requestSeq) return;
      errorMessage = toUserMessage(error, 'Erro ao carregar clientes.');
      clientes = [];
      totalClientes = 0;
      toast.error(errorMessage);
    } finally {
      if (seq === requestSeq) {
        loading = false;
        loadingSummary = false;
        if (requestAbortController === controller) {
          requestAbortController = null;
        }
      }
    }
  }

  function scheduleLoadClientes(resetPage = false) {
    if (!mounted) return;
    if (resetPage) listPage = 1;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void loadClientes();
    }, 250);
  }

  function handleSearch(query: string) {
    if (searchTerm === query) return;
    searchTerm = query;
    scheduleLoadClientes(true);
  }

  function handleFilterChange(key: string, value: string) {
    filterValues = { ...filterValues, [key]: value };
    scheduleLoadClientes(true);
  }

  function handlePageChange(page: number) {
    if (listPage === page) return;
    listPage = page;
    void loadClientes();
  }

  function handlePageSizeChange(pageSize: number) {
    if (listPageSize === pageSize) return;
    listPageSize = pageSize;
    listPage = 1;
    void loadClientes();
  }

  function handleRowClick(row: Cliente) {
    goto(`/clientes/${row.id}`);
  }

  function handleExport() {
    toast.info('Exportacao ainda pendente. A listagem real de clientes ja esta conectada.');
  }

  onMount(() => {
    mounted = true;
    void loadClientes();
  });

  onDestroy(() => {
    requestAbortController?.abort();
    if (searchTimer) clearTimeout(searchTimer);
  });
</script>

<svelte:head>
  <title>Clientes | VTUR</title>
</svelte:head>

<PageHeader
  title="Clientes"
  subtitle="Carteira de clientes com contato, historico comercial e relacionamento com vendas e orcamentos."
  breadcrumbs={[{ label: 'Clientes' }]}
  actions={[
    {
      label: 'Novo Cliente',
      href: '/clientes/novo',
      variant: 'primary',
      icon: Plus
    }
  ]}
/>

<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
  <div>
    <p class="text-xs font-semibold tracking-[0.14em] text-slate-400 uppercase">Painel executivo</p>
    <p class="text-sm text-slate-500">
      Resumo da carteira com foco em relacionamento, negociacao e reativacao.
    </p>
  </div>
</div>

{#if errorMessage}
  <div
    role="alert"
    class="rounded-vtur-lg mb-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
  >
    {errorMessage}
  </div>
{/if}

<KPIGrid className="mb-6" columns={5}>
  <KPICard
    title="Clientes na carteira"
    value={summary.total || totalClientes}
    color="clientes"
    icon={Users}
    loading={loadingSummary}
  />
  <KPICard
    title="Clientes ativos"
    value={statusAtivos}
    color="operacao"
    icon={Users}
    loading={loadingSummary}
  />
  <KPICard
    title="Em negociação"
    value={clientesEmNegociacao}
    color="financeiro"
    icon={Clock}
    loading={loadingSummary}
  />
  <KPICard
    title="Aniversariantes hoje"
    value={aniversariantesHoje}
    color="clientes"
    icon={CalendarDays}
    loading={loadingSummary}
  />
  <KPICard
    title="Total gasto"
    value={BRL_CURRENCY_FORMATTER.format(totalCarteira)}
    color="slate"
    icon={Wallet}
    loading={loadingSummary}
  />
</KPIGrid>

<div
  class="rounded-vtur-xl shadow-vtur-lg mb-6 border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600"
>
  A carteira consolida <strong class="text-slate-900">{clientesComViagem}</strong> clientes com
  histórico de viagens e <strong class="text-slate-900">{clientesEmNegociacao}</strong> em negociação
  com orçamentos em aberto.
</div>

<DataTable
  {columns}
  data={clientes}
  color="clientes"
  {loading}
  title="Carteira de Clientes"
  {filters}
  serverSide={true}
  totalItems={totalClientes}
  page={listPage}
  pageSize={listPageSize}
  searchable={true}
  filterable={true}
  exportable={true}
  onSearch={handleSearch}
  onFilterChange={handleFilterChange}
  onPageChange={handlePageChange}
  onPageSizeChange={handlePageSizeChange}
  onRowClick={handleRowClick}
  onExport={handleExport}
  emptyMessage="Nenhum cliente encontrado para o escopo atual"
/>
