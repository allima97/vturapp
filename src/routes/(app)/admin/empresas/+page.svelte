<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { toast } from '$lib/stores/ui';
  import { Plus, RefreshCw, Building2, CheckCircle, CreditCard, Network } from '$lib/icons';
  import { apiGet, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { escapeHtml } from '$lib/utils/html';
  import { toUserMessage } from '$lib/utils/errors';

  type Empresa = {
    id: string;
    nome_empresa: string;
    nome_fantasia: string;
    cnpj: string;
    cidade: string;
    estado: string;
    active: boolean;
    billing?: {
      status?: string;
      valor_mensal?: number | null;
      plan?: { nome?: string | null } | null;
    } | null;
    master_links: number;
  };

  let loading = true;
  let rows: Empresa[] = [];
  const loadGuard = createLoadGuard();

  function badge(label: string, tone: 'green' | 'yellow' | 'red' | 'gray') {
    const classes = {
      green: 'bg-emerald-100 text-emerald-700',
      yellow: 'bg-amber-100 text-amber-700',
      red: 'bg-rose-100 text-rose-700',
      gray: 'bg-slate-100 text-slate-700'
    };
    return `<span class="inline-flex rounded-full px-2 py-1 text-xs font-medium ${classes[tone]}">${escapeHtml(label)}</span>`;
  }

  const columns = [
    {
      key: 'nome_fantasia',
      label: 'Empresa',
      sortable: true,
      formatter: (_value: unknown, row: Empresa) => `
        <div>
          <p class="font-medium text-slate-900">${escapeHtml(row.nome_fantasia || row.nome_empresa)}</p>
          <p class="text-xs text-slate-500">${escapeHtml(row.cnpj || 'Sem CNPJ')}</p>
        </div>
      `
    },
    {
      key: 'local',
      label: 'Cidade',
      sortable: true,
      formatter: (_value: unknown, row: Empresa) =>
        `<span>${escapeHtml(row.cidade || '-')}${row.estado ? ` / ${escapeHtml(row.estado)}` : ''}</span>`
    },
    {
      key: 'billing',
      label: 'Billing',
      sortable: true,
      formatter: (_value: unknown, row: Empresa) => {
        const status = String(row.billing?.status || '').toLowerCase();
        if (!status) return badge('Sem billing', 'gray');
        if (status === 'active') return badge('Ativo', 'green');
        if (status === 'trial') return badge('Trial', 'yellow');
        if (status === 'past_due' || status === 'suspended') return badge(status, 'red');
        return badge(status, 'gray');
      }
    },
    {
      key: 'plan',
      label: 'Plano',
      sortable: true,
      formatter: (_value: unknown, row: Empresa) =>
        `<span>${escapeHtml(row.billing?.plan?.nome || '-')}</span>`
    },
    {
      key: 'master_links',
      label: 'Masters',
      sortable: true
    }
  ];

  async function loadPage() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<{ items?: Empresa[] }>(
        '/api/v1/admin/empresas',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      rows = payload.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Nao foi possivel carregar as empresas.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  $: stats = rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.active) acc.ativas += 1;
      if (String(row.billing?.status || '').toLowerCase() === 'active') acc.billingAtivo += 1;
      acc.masters += Number(row.master_links || 0);
      return acc;
    },
    { total: 0, ativas: 0, billingAtivo: 0, masters: 0 }
  );

  onMount(loadPage);
</script>

<svelte:head>
  <title>Empresas | VTUR</title>
</svelte:head>

<PageHeader
  title="Empresas"
  subtitle="Cadastro corporativo, billing e escopo master por empresa."
  breadcrumbs={[{ label: 'Administracao', href: '/admin' }, { label: 'Empresas' }]}
  actions={[
    { label: 'Atualizar', onClick: loadPage, variant: 'secondary', icon: RefreshCw },
    { label: 'Nova empresa', href: '/admin/empresas/nova', variant: 'primary', icon: Plus }
  ]}
/>

<div class="space-y-6">
  <div class="vtur-kpi-grid mb-6">
    <div class="vtur-kpi-card">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500"
      >
        <Building2 size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Total</p>
        <p class="text-2xl font-bold text-slate-900">{stats.total}</p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
        <CheckCircle size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Ativas</p>
        <p class="text-2xl font-bold text-slate-900">{stats.ativas}</p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-500">
        <CreditCard size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Billing ativo</p>
        <p class="text-2xl font-bold text-slate-900">{stats.billingAtivo}</p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-500"
      >
        <Network size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Vínculos master</p>
        <p class="text-2xl font-bold text-slate-900">{stats.masters}</p>
      </div>
    </div>
  </div>

  <DataTable
    title="Empresas administradas"
    color="financeiro"
    {loading}
    {columns}
    data={rows}
    emptyMessage="Nenhuma empresa encontrada."
    onRowClick={(row: Empresa) => goto(`/admin/empresas/${row.id}`)}
  />
</div>
