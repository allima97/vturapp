<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { FieldInput, FieldSelect, FieldTextarea } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { Plus, Trash2, RefreshCw, AlertCircle, CheckCircle, Clock } from '$lib/icons';
  import { diffDaysISODate, todayISODateLocal } from '$lib/date';
  import { formatDate } from '$lib/utils/formatters';
  import { escapeHtml, truncateText } from '$lib/utils/html';
  import { toUserMessage } from '$lib/utils/errors';

  import { confirmAction } from '$lib/stores/confirm';
  import { apiDelete, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  type SacRegistro = {
    id: string;
    recibo: string | null;
    tour: string | null;
    data_solicitacao: string | null;
    motivo: string | null;
    contratante_pax: string | null;
    ok_quando: string | null;
    status: string | null;
    responsavel: string | null;
    prazo: string | null;
    created_at: string;
  };

  const STATUS_OPCOES = [
    { value: 'aberto', label: 'Aberto' },
    { value: 'em_andamento', label: 'Em andamento' },
    { value: 'concluido', label: 'Concluído' },
    { value: 'cancelado', label: 'Cancelado' }
  ];

  let registros: SacRegistro[] = [];
  let loading = true;
  let modalOpen = false;
  let saving = false;
  let deletingId = '';
  let editingId: string | null = null;
  const loadGuard = createLoadGuard();

  let form = createForm();

  function createForm() {
    return {
      recibo: '',
      tour: '',
      data_solicitacao: todayISODateLocal(),
      motivo: '',
      contratante_pax: '',
      ok_quando: '',
      status: 'aberto',
      responsavel: '',
      prazo: ''
    };
  }

  $: canEdit =
    !$permissoes.ready ||
    $permissoes.isSystemAdmin ||
    permissoes.can('controle_sac', 'edit') ||
    permissoes.can('operacao', 'edit');
  $: canDelete =
    !$permissoes.ready ||
    $permissoes.isSystemAdmin ||
    permissoes.can('controle_sac', 'delete') ||
    permissoes.can('operacao', 'delete');

  function getStatusBadge(status: string | null) {
    const styles: Record<string, string> = {
      aberto: 'bg-red-100 text-red-700',
      em_andamento: 'bg-amber-100 text-amber-700',
      concluido: 'bg-green-100 text-green-700',
      cancelado: 'bg-slate-100 text-slate-600'
    };
    const labels: Record<string, string> = {
      aberto: 'Aberto',
      em_andamento: 'Em andamento',
      concluido: 'Concluído',
      cancelado: 'Cancelado'
    };
    const s = status || 'aberto';
    return `<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[s] || 'bg-slate-100 text-slate-600'}">${labels[s] || s}</span>`;
  }

  const columns = [
    {
      key: 'recibo',
      label: 'Recibo',
      sortable: true,
      width: '130px',
      formatter: (v: string | null) => v || '-'
    },
    {
      key: 'tour',
      label: 'Tour',
      sortable: true,
      formatter: (v: string | null) => v || '-'
    },
    {
      key: 'contratante_pax',
      label: 'Contratante/Pax',
      sortable: true,
      formatter: (v: string | null) => v || '-'
    },
    {
      key: 'motivo',
      label: 'Motivo',
      sortable: true,
      formatter: (v: string | null) =>
        v ? `<span title="${escapeHtml(v)}">${escapeHtml(truncateText(v, 40))}</span>` : '-'
    },
    {
      key: 'data_solicitacao',
      label: 'Solicitação',
      sortable: true,
      width: '120px',
      formatter: (v: string | null) => formatDate(v)
    },
    {
      key: 'prazo',
      label: 'Prazo',
      sortable: true,
      width: '110px',
      formatter: (v: string | null) => {
        if (!v) return '-';
        const diff = diffDaysISODate(todayISODateLocal(), v) ?? 0;
        const label = formatDate(v);
        if (diff < 0) return `<span class="text-red-600 font-medium">${label}</span>`;
        if (diff <= 3) return `<span class="text-amber-600 font-medium">${label}</span>`;
        return label;
      }
    },
    {
      key: 'responsavel',
      label: 'Responsável',
      sortable: true,
      formatter: (v: string | null) => v || '-'
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      width: '130px',
      formatter: (v: string | null) => getStatusBadge(v)
    }
  ];

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<{ items?: SacRegistro[] }>(
        '/api/v1/operacao/sac',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      registros = payload.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar registros SAC.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function openNew() {
    editingId = null;
    form = createForm();
    modalOpen = true;
  }

  function openEdit(registro: SacRegistro) {
    editingId = registro.id;
    form = {
      recibo: registro.recibo || '',
      tour: registro.tour || '',
      data_solicitacao: registro.data_solicitacao || todayISODateLocal(),
      motivo: registro.motivo || '',
      contratante_pax: registro.contratante_pax || '',
      ok_quando: registro.ok_quando || '',
      status: registro.status || 'aberto',
      responsavel: registro.responsavel || '',
      prazo: registro.prazo || ''
    };
    modalOpen = true;
  }

  async function save() {
    saving = true;
    try {
      await apiPost('/api/v1/operacao/sac', { id: editingId || undefined, ...form });
      toast.success(editingId ? 'Registro atualizado.' : 'Registro criado.');
      modalOpen = false;
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar.'));
    } finally {
      saving = false;
    }
  }

  async function deleteRegistro(id: string) {
    if (!(await confirmAction('Deseja excluir este registro SAC?'))) return;
    deletingId = id;
    try {
      await apiDelete('/api/v1/operacao/sac', { id });
      toast.success('Registro excluído.');
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao excluir.'));
    } finally {
      deletingId = '';
    }
  }

  onMount(load);

  $: statusCounts = registros.reduce(
    (acc, r) => {
      if (r.status === 'aberto') acc.abertos += 1;
      if (r.status === 'em_andamento') acc.emAndamento += 1;
      if (r.status === 'concluido') acc.concluidos += 1;
      return acc;
    },
    { abertos: 0, emAndamento: 0, concluidos: 0 }
  );
</script>

<svelte:head>
  <title>Controle SAC | VTUR</title>
</svelte:head>

<PageHeader
  title="Controle SAC"
  subtitle="Gerencie solicitações de atendimento ao cliente e acompanhe o status de cada caso."
  color="operacao"
  breadcrumbs={[{ label: 'Controle SAC' }]}
  actions={[
    { label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw },
    ...(canEdit
      ? [{ label: 'Novo Registro', onClick: openNew, variant: 'primary' as const, icon: Plus }]
      : [])
  ]}
/>

<div class="vtur-kpi-grid vtur-kpi-grid-3 mb-6">
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-500">
      <AlertCircle size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Abertos</p>
      <p class="text-2xl font-bold text-slate-900">{statusCounts.abertos}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-500">
      <Clock size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Em andamento</p>
      <p class="text-2xl font-bold text-slate-900">{statusCounts.emAndamento}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-500">
      <CheckCircle size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Concluídos</p>
      <p class="text-2xl font-bold text-slate-900">{statusCounts.concluidos}</p>
    </div>
  </div>
</div>

<DataTable
  {columns}
  data={registros}
  color="operacao"
  {loading}
  title="Registros SAC"
  searchable={true}
  extraSearchKeys={['motivo', 'recibo', 'tour', 'contratante_pax', 'responsavel']}
  filterable={true}
  filters={[
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: [{ value: '', label: 'Todos' }, ...STATUS_OPCOES]
    }
  ]}
  emptyMessage="Nenhum registro SAC encontrado"
  onRowClick={canEdit ? (row) => openEdit(row) : undefined}
  rowActionsAvailable={() => canDelete}
>
  <svelte:fragment slot="row-actions" let:row>
    {#if canDelete}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class_name="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
        on:click={() => deleteRegistro(row.id)}
        title="Excluir"
        disabled={deletingId === row.id}
      >
        <Trash2 size={15} />
      </Button>
    {/if}
  </svelte:fragment>
</DataTable>

<Dialog
  bind:open={modalOpen}
  title={editingId ? 'Editar Registro SAC' : 'Novo Registro SAC'}
  color="operacao"
  size="lg"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText={editingId ? 'Salvar' : 'Criar'}
  loading={saving}
  onConfirm={save}
  onCancel={() => (modalOpen = false)}
>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <FieldInput
      id="sac-recibo"
      label="Recibo"
      bind:value={form.recibo}
      placeholder="Número do recibo"
      class_name="w-full"
    />
    <FieldInput
      id="sac-tour"
      label="Tour"
      bind:value={form.tour}
      placeholder="Nome do tour"
      class_name="w-full"
    />
    <FieldInput
      id="sac-contratante"
      label="Contratante/Pax"
      bind:value={form.contratante_pax}
      placeholder="Nome do contratante ou passageiro"
      class_name="w-full"
    />
    <FieldInput
      id="sac-data"
      label="Data da Solicitação"
      type="date"
      bind:value={form.data_solicitacao}
      class_name="w-full"
    />
    <FieldTextarea
      id="sac-motivo"
      label="Motivo"
      bind:value={form.motivo}
      rows={3}
      placeholder="Descreva o motivo da solicitação"
      class_name="md:col-span-2 w-full"
    />
    <FieldInput
      id="sac-ok-quando"
      label="OK quando"
      bind:value={form.ok_quando}
      placeholder="Condição para encerramento"
      class_name="md:col-span-2 w-full"
    />
    <FieldInput
      id="sac-responsavel"
      label="Responsável"
      bind:value={form.responsavel}
      placeholder="Nome do responsável"
      class_name="w-full"
    />
    <FieldInput
      id="sac-prazo"
      label="Prazo"
      type="date"
      bind:value={form.prazo}
      class_name="w-full"
    />
    <FieldSelect
      id="sac-status-form"
      label="Status"
      bind:value={form.status}
      options={STATUS_OPCOES}
      placeholder="Selecione uma opção"
      class_name="w-full"
    />
  </div>
</Dialog>
