<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { FieldInput, FieldSelect } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { apiDelete, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { Plus, Trash2, RefreshCw, DollarSign } from '$lib/icons';
  import { todayISODateLocal } from '$lib/date';
  import { formatDate } from '$lib/utils/formatters';
  import { toUserMessage } from '$lib/utils/errors';

  import { confirmAction } from '$lib/stores/confirm';
  type Cambio = {
    id: string;
    moeda: string;
    data: string;
    valor: number | null;
    created_at: string | null;
    owner_user?: { nome_completo?: string | null } | null;
  };

  let cambios: Cambio[] = [];
  let loading = true;
  let modalOpen = false;
  let saving = false;
  let deletingId = '';
  let editingId: string | null = null;
  const loadGuard = createLoadGuard();

  const MOEDAS = [
    'USD',
    'EUR',
    'ARS',
    'GBP',
    'CAD',
    'AUD',
    'CHF',
    'JPY',
    'MXN',
    'CLP',
    'UYU',
    'PYG'
  ];
  const CAMBIO_VALUE_FORMATTER = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6
  });

  let form = { moeda: 'USD', data: todayISODateLocal(), valor: '' };

  $: canEdit =
    !$permissoes.ready ||
    $permissoes.isSystemAdmin ||
    permissoes.can('cambios', 'edit') ||
    permissoes.can('parametros', 'edit');
  $: canDelete =
    !$permissoes.ready ||
    $permissoes.isSystemAdmin ||
    permissoes.can('cambios', 'delete') ||
    permissoes.can('parametros', 'delete');

  const columns = [
    { key: 'moeda', label: 'Moeda', sortable: true, width: '100px' },
    {
      key: 'data',
      label: 'Data',
      sortable: true,
      width: '120px',
      formatter: (value: string) => formatDate(value)
    },
    {
      key: 'valor',
      label: 'Valor (R$)',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number | null) =>
        value != null ? CAMBIO_VALUE_FORMATTER.format(value) : '-'
    },
    {
      key: 'owner_user',
      label: 'Registrado por',
      sortable: false,
      formatter: (_: unknown, row: Cambio) => String(row.owner_user?.nome_completo || '-')
    }
  ];

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<{ items?: Cambio[] }>(
        '/api/v1/parametros/cambios',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      cambios = payload.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar câmbios.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function openNew() {
    editingId = null;
    form = { moeda: 'USD', data: todayISODateLocal(), valor: '' };
    modalOpen = true;
  }

  function openEdit(cambio: Cambio) {
    editingId = cambio.id;
    form = {
      moeda: cambio.moeda,
      data: cambio.data,
      valor: String(cambio.valor ?? '')
    };
    modalOpen = true;
  }

  async function save() {
    if (!form.moeda.trim()) {
      toast.error('Informe a moeda.');
      return;
    }
    if (!form.data) {
      toast.error('Informe a data.');
      return;
    }
    if (!form.valor) {
      toast.error('Informe o valor.');
      return;
    }

    saving = true;
    try {
      await apiPost('/api/v1/parametros/cambios', {
        id: editingId || undefined,
        moeda: form.moeda.trim().toUpperCase(),
        data: form.data,
        valor: Number(String(form.valor).replace(',', '.'))
      });
      toast.success(editingId ? 'Câmbio atualizado.' : 'Câmbio registrado.');
      modalOpen = false;
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar câmbio.'));
    } finally {
      saving = false;
    }
  }

  async function deleteCambio(id: string) {
    if (!(await confirmAction('Deseja excluir este câmbio?'))) return;
    deletingId = id;
    try {
      await apiDelete('/api/v1/parametros/cambios', { id });
      toast.success('Câmbio excluído.');
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao excluir câmbio.'));
    } finally {
      deletingId = '';
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>Câmbios | VTUR</title>
</svelte:head>

<PageHeader
  title="Câmbios"
  subtitle="Registre as cotações de moedas estrangeiras para uso nos orçamentos e relatórios."
  color="financeiro"
  breadcrumbs={[{ label: 'Parâmetros', href: '/parametros' }, { label: 'Câmbios' }]}
  actions={[
    { label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw },
    ...(canEdit
      ? [{ label: 'Novo Câmbio', onClick: openNew, variant: 'primary' as const, icon: Plus }]
      : [])
  ]}
/>

<DataTable
  {columns}
  data={cambios}
  color="financeiro"
  {loading}
  title="Histórico de câmbios"
  searchable={true}
  emptyMessage="Nenhum câmbio registrado"
  onRowClick={canEdit ? (row) => openEdit(row) : undefined}
>
  <svelte:fragment slot="row-actions" let:row>
    {#if canDelete}
      <Button
        on:click={(event) => {
          event.stopPropagation();
          deleteCambio(row.id);
        }}
        variant="ghost"
        size="sm"
        class_name="p-1.5"
        title="Excluir"
        ariaLabel="Excluir câmbio"
        disabled={deletingId === row.id}
      >
        <Trash2 size={15} />
      </Button>
    {/if}
  </svelte:fragment>
</DataTable>

<Dialog
  bind:open={modalOpen}
  title={editingId ? 'Editar Câmbio' : 'Novo Câmbio'}
  color="financeiro"
  size="sm"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText={editingId ? 'Salvar' : 'Registrar'}
  loading={saving}
  onConfirm={save}
  onCancel={() => (modalOpen = false)}
>
  <div class="space-y-4">
    <div class="grid grid-cols-[1fr_112px] gap-2">
      <FieldSelect
        id="cambio-moeda"
        label="Moeda"
        required={true}
        bind:value={form.moeda}
        placeholder={null}
        options={MOEDAS.map((m) => ({ value: m, label: m }))}
        class_name="w-full"
      />
      <FieldInput
        id="cambio-moeda-outra"
        label="Outra"
        bind:value={form.moeda}
        placeholder="Outra"
        maxlength={5}
        helper="Selecione ou digite o código da moeda."
        class_name="w-full"
      />
    </div>

    <FieldInput
      id="cambio-data"
      label="Data"
      required
      type="date"
      bind:value={form.data}
      class_name="w-full"
    />
    <FieldInput
      id="cambio-valor"
      label="Valor em R$"
      required
      type="number"
      step="0.000001"
      min="0"
      bind:value={form.valor}
      placeholder="Ex: 5.123456"
      class_name="w-full"
    />
    <p class="text-xs text-slate-500">Valor de 1 unidade da moeda em reais.</p>
  </div>
</Dialog>
