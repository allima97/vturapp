<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { FieldInput, FieldSelect, FieldCheckbox, FieldTextarea } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { Plus, Trash2, RefreshCw, DollarSign } from '$lib/icons';
  import { toUserMessage } from '$lib/utils/errors';

  import { confirmAction } from '$lib/stores/confirm';
  import { apiDelete, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  type Plano = {
    id: string;
    nome: string;
    descricao: string | null;
    valor_mensal: number;
    moeda: string;
    ativo: boolean;
  };

  let planos: Plano[] = [];
  let loading = true;
  let modalOpen = false;
  let saving = false;
  let deletingId = '';
  let editingId: string | null = null;
  const loadGuard = createLoadGuard();

  let form = { nome: '', descricao: '', valor_mensal: '', moeda: 'BRL', ativo: true };
  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
  const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>([['BRL', BRL_CURRENCY_FORMATTER]]);

  function getCurrencyFormatter(currency: string) {
    const normalizedCurrency = currency || 'BRL';
    const cached = CURRENCY_FORMATTERS.get(normalizedCurrency);
    if (cached) return cached;
    const formatter = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: normalizedCurrency
    });
    CURRENCY_FORMATTERS.set(normalizedCurrency, formatter);
    return formatter;
  }

  const columns = [
    { key: 'nome', label: 'Nome', sortable: true },
    {
      key: 'descricao',
      label: 'Descrição',
      sortable: false,
      formatter: (v: string | null) => v || '-'
    },
    {
      key: 'valor_mensal',
      label: 'Mensalidade',
      sortable: true,
      align: 'right' as const,
      formatter: (v: number, row: Plano) => getCurrencyFormatter(row.moeda).format(v || 0)
    },
    {
      key: 'ativo',
      label: 'Status',
      sortable: true,
      width: '90px',
      formatter: (v: boolean) =>
        v
          ? '<span class="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">Ativo</span>'
          : '<span class="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Inativo</span>'
    }
  ];

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<{ items?: Plano[] }>(
        '/api/v1/admin/planos',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      planos = payload.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar planos.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function openNew() {
    editingId = null;
    form = { nome: '', descricao: '', valor_mensal: '', moeda: 'BRL', ativo: true };
    modalOpen = true;
  }

  function openEdit(p: Plano) {
    editingId = p.id;
    form = {
      nome: p.nome,
      descricao: p.descricao || '',
      valor_mensal: String(p.valor_mensal || ''),
      moeda: p.moeda || 'BRL',
      ativo: p.ativo
    };
    modalOpen = true;
  }

  async function save() {
    if (!form.nome.trim()) {
      toast.error('Nome obrigatório.');
      return;
    }
    saving = true;
    try {
      await apiPost('/api/v1/admin/planos', {
        id: editingId || undefined,
        nome: form.nome,
        descricao: form.descricao || null,
        valor_mensal: Number(form.valor_mensal || 0),
        moeda: form.moeda,
        ativo: form.ativo
      });
      toast.success(editingId ? 'Plano atualizado.' : 'Plano criado.');
      modalOpen = false;
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar.'));
    } finally {
      saving = false;
    }
  }

  async function deletePlano(id: string) {
    if (!(await confirmAction('Deseja excluir este plano?'))) return;
    deletingId = id;
    try {
      await apiDelete('/api/v1/admin/planos', { id });
      toast.success('Plano excluído.');
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao excluir.'));
    } finally {
      deletingId = '';
    }
  }

  onMount(load);

  $: planosStats = planos.reduce(
    (acc, plano) => {
      if (plano.ativo) {
        acc.ativos += 1;
        acc.totalMrr += plano.valor_mensal;
      }
      return acc;
    },
    { ativos: 0, totalMrr: 0 }
  );
  $: totalMrr = planosStats.totalMrr;
</script>

<svelte:head>
  <title>Planos | VTUR</title>
</svelte:head>

<PageHeader
  title="Planos de Assinatura"
  subtitle="Gerencie os planos disponíveis para as empresas clientes."
  breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Planos' }]}
  actions={[
    { label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw },
    { label: 'Novo Plano', onClick: openNew, variant: 'primary', icon: Plus }
  ]}
/>

<div class="vtur-kpi-grid vtur-kpi-grid-3 mb-6">
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-500">
      <DollarSign size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Total de planos</p>
      <p class="text-2xl font-bold text-slate-900">{planos.length}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
      <DollarSign size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Planos ativos</p>
      <p class="text-2xl font-bold text-slate-900">{planosStats.ativos}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
      <DollarSign size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">MRR potencial</p>
      <p class="text-2xl font-bold text-slate-900">{BRL_CURRENCY_FORMATTER.format(totalMrr)}</p>
    </div>
  </div>
</div>

<DataTable
  {columns}
  data={planos}
  color="financeiro"
  {loading}
  title="Planos cadastrados"
  searchable={true}
  emptyMessage="Nenhum plano cadastrado"
  onRowClick={(row) => openEdit(row)}
>
  <svelte:fragment slot="row-actions" let:row>
    <Button
      variant="ghost"
      size="sm"
      color="red"
      class_name="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
      on:click={() => deletePlano(row.id)}
      disabled={deletingId === row.id}
    >
      <Trash2 size={15} />
    </Button>
  </svelte:fragment>
</DataTable>

<Dialog
  bind:open={modalOpen}
  title={editingId ? 'Editar Plano' : 'Novo Plano'}
  color="financeiro"
  size="md"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText={editingId ? 'Salvar' : 'Criar'}
  loading={saving}
  onConfirm={save}
  onCancel={() => (modalOpen = false)}
>
  <div class="space-y-4">
    <FieldInput
      id="plano-nome"
      label="Nome"
      required={true}
      bind:value={form.nome}
      placeholder="Ex: Starter, Pro, Enterprise"
      class_name="w-full"
    />
    <FieldTextarea
      id="plano-desc"
      label="Descrição"
      bind:value={form.descricao}
      rows={2}
      placeholder="Descrição do plano..."
      class_name="w-full"
    />
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FieldInput
        money
        id="plano-valor"
        label="Mensalidade"
        type="number"
        step="0.01"
        min="0"
        bind:value={form.valor_mensal}
        placeholder="0,00"
        class_name="w-full"
      />
      <FieldSelect
        id="plano-moeda"
        label="Moeda"
        bind:value={form.moeda}
        options={[
          { value: 'BRL', label: 'BRL (R$)' },
          { value: 'USD', label: 'USD ($)' },
          { value: 'EUR', label: 'EUR (€)' }
        ]}
        placeholder=""
        class_name="w-full"
      />
    </div>
    <FieldCheckbox
      label="Plano ativo"
      bind:checked={form.ativo}
      color="financeiro"
      class_name="rounded-xl border border-slate-200 bg-white px-3 py-2"
    />
  </div>
</Dialog>
