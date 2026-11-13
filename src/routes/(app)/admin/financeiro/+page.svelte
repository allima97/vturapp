<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { FieldInput, FieldSelect } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { RefreshCw, DollarSign, Building2 } from '$lib/icons';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { escapeHtml } from '$lib/utils/html';
  import { diffDaysISODate, formatISODateBR, todayISODateLocal } from '$lib/date';
  import { toUserMessage } from '$lib/utils/errors';
  import { createLoadGuard } from '$lib/utils/loadGuard';

  type BillingRow = {
    id: string;
    company_id: string;
    company_nome: string;
    plan_nome: string | null;
    status: string;
    valor_mensal: number | null;
    ultimo_pagamento: string | null;
    proximo_vencimento: string | null;
  };

  type CompanyBillingPlan = {
    nome?: string | null;
  };

  type CompanyBilling = {
    status?: string | null;
    valor_mensal?: number | null;
    ultimo_pagamento?: string | null;
    proximo_vencimento?: string | null;
    plan?: CompanyBillingPlan | CompanyBillingPlan[] | null;
  };

  type AdminCompanyItem = {
    id: string;
    nome_fantasia?: string | null;
    nome_empresa?: string | null;
    billing?: CompanyBilling | CompanyBilling[] | null;
  };

  const STATUS_LABELS: Record<string, string> = {
    active: 'Ativa',
    trial: 'Trial',
    past_due: 'Atrasada',
    suspended: 'Suspensa',
    canceled: 'Cancelada'
  };
  const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([key, label]) => ({
    value: key,
    label
  }));

  const STATUS_COLORS: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    trial: 'bg-blue-100 text-blue-700',
    past_due: 'bg-amber-100 text-amber-700',
    suspended: 'bg-orange-100 text-orange-700',
    canceled: 'bg-red-100 text-red-700'
  };

  let billings: BillingRow[] = [];
  let loading = true;
  let modalOpen = false;
  let saving = false;
  let selectedBilling: BillingRow | null = null;
  const loadGuard = createLoadGuard();

  let form = { status: 'active', valor_mensal: '', ultimo_pagamento: '', proximo_vencimento: '' };
  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  const columns = [
    { key: 'company_nome', label: 'Empresa', sortable: true },
    {
      key: 'plan_nome',
      label: 'Plano',
      sortable: true,
      formatter: (v: string | null) => `<span>${escapeHtml(v || '-')}</span>`
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      width: '120px',
      formatter: (v: string) =>
        `<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[v] || 'bg-slate-100 text-slate-600'}">${escapeHtml(STATUS_LABELS[v] || v)}</span>`
    },
    {
      key: 'valor_mensal',
      label: 'Mensalidade',
      sortable: true,
      align: 'right' as const,
      formatter: (v: number | null) => (v != null ? BRL_CURRENCY_FORMATTER.format(v) : '-')
    },
    {
      key: 'proximo_vencimento',
      label: 'Próx. Vencimento',
      sortable: true,
      width: '140px',
      formatter: (v: string | null) => {
        if (!v) return '-';
        const diff = diffDaysISODate(todayISODateLocal(), v) ?? 0;
        const label = formatISODateBR(v);
        if (diff < 0) return `<span class="text-red-600 font-medium">${label}</span>`;
        if (diff <= 7) return `<span class="text-amber-600 font-medium">${label}</span>`;
        return label;
      }
    }
  ];

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<{ items?: AdminCompanyItem[] }>(
        '/api/v1/admin/empresas',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      billings = (payload.items || []).map((item) => {
        const billing = Array.isArray(item.billing)
          ? item.billing[0] || null
          : item.billing || null;
        const plan = Array.isArray(billing?.plan) ? billing.plan[0] || null : billing?.plan || null;

        return {
          id: item.id,
          company_id: item.id,
          company_nome: item.nome_fantasia || item.nome_empresa || 'Empresa',
          plan_nome: plan?.nome || null,
          status: billing?.status || 'trial',
          valor_mensal: billing?.valor_mensal || null,
          ultimo_pagamento: billing?.ultimo_pagamento || null,
          proximo_vencimento: billing?.proximo_vencimento || null
        };
      });
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar dados financeiros.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function openEdit(row: BillingRow) {
    selectedBilling = row;
    form = {
      status: row.status,
      valor_mensal: row.valor_mensal != null ? String(row.valor_mensal) : '',
      ultimo_pagamento: row.ultimo_pagamento || '',
      proximo_vencimento: row.proximo_vencimento || ''
    };
    modalOpen = true;
  }

  async function save() {
    if (!selectedBilling) return;
    saving = true;
    try {
      await apiPost('/api/v1/admin/empresas', {
        id: selectedBilling.company_id,
        billing_status: form.status,
        billing_valor_mensal: form.valor_mensal ? Number(form.valor_mensal) : null,
        billing_ultimo_pagamento: form.ultimo_pagamento || null,
        billing_proximo_vencimento: form.proximo_vencimento || null
      });
      toast.success('Billing atualizado.');
      modalOpen = false;
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar.'));
    } finally {
      saving = false;
    }
  }

  onMount(load);

  $: billingResumo = billings.reduce(
    (acc, billing) => {
      if (billing.status === 'active') {
        acc.ativas += 1;
        acc.totalMrr += billing.valor_mensal || 0;
      }
      if (billing.status === 'past_due') acc.atrasadas += 1;
      return acc;
    },
    { ativas: 0, atrasadas: 0, totalMrr: 0 }
  );
  $: ({ ativas, atrasadas, totalMrr } = billingResumo);
</script>

<svelte:head>
  <title>Financeiro Admin | VTUR</title>
</svelte:head>

<PageHeader
  title="Financeiro Admin"
  subtitle="Gerencie o billing e status de assinatura das empresas."
  breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Financeiro' }]}
  actions={[{ label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw }]}
/>

<div class="vtur-kpi-grid vtur-kpi-grid-3 mb-6">
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
      <Building2 size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Empresas ativas</p>
      <p class="text-2xl font-bold text-slate-900">{ativas}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
      <Building2 size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Atrasadas</p>
      <p class="text-2xl font-bold text-slate-900">{atrasadas}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
      <DollarSign size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">MRR (ativas)</p>
      <p class="text-2xl font-bold text-slate-900">{BRL_CURRENCY_FORMATTER.format(totalMrr)}</p>
    </div>
  </div>
</div>

<DataTable
  {columns}
  data={billings}
  color="financeiro"
  {loading}
  title="Billing por empresa"
  searchable={true}
  emptyMessage="Nenhuma empresa encontrada"
  onRowClick={(row) => openEdit(row)}
/>

<Dialog
  bind:open={modalOpen}
  title={selectedBilling ? `Billing — ${selectedBilling.company_nome}` : 'Billing'}
  color="financeiro"
  size="md"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText="Salvar"
  loading={saving}
  onConfirm={save}
  onCancel={() => (modalOpen = false)}
>
  <div class="space-y-4">
    <FieldSelect
      id="bill-status"
      label="Status"
      bind:value={form.status}
      options={STATUS_OPTIONS}
      placeholder=""
      class_name="w-full"
    />
    <FieldInput
      money
      id="bill-valor"
      label="Mensalidade (R$)"
      type="number"
      step="0.01"
      bind:value={form.valor_mensal}
      placeholder="0,00"
      class_name="w-full"
    />
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FieldInput
        id="bill-ultimo"
        label="Último pagamento"
        type="date"
        bind:value={form.ultimo_pagamento}
        class_name="w-full"
      />
      <FieldInput
        id="bill-proximo"
        label="Próx. vencimento"
        type="date"
        bind:value={form.proximo_vencimento}
        class_name="w-full"
      />
    </div>
  </div>
</Dialog>
