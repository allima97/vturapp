<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { toast } from '$lib/stores/ui';
  import { FieldInput, FieldCheckbox } from '$lib/components/ui';
  import { Plus, Trash2, RefreshCw } from '$lib/icons';
  import { toUserMessage } from '$lib/utils/errors';

  import { confirmAction } from '$lib/stores/confirm';
  import { apiDelete, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  type Termo = {
    id: string;
    termo: string;
    descricao: string | null;
    ativo: boolean;
    created_at: string | null;
  };

  let termos: Termo[] = [];
  let loading = true;
  let modalOpen = false;
  let saving = false;
  let deletingId = '';
  let editingId: string | null = null;

  let form = { termo: '', descricao: '', ativo: true };
  const loadGuard = createLoadGuard();

  const columns = [
    { key: 'termo', label: 'Termo', sortable: true },
    {
      key: 'descricao',
      label: 'Descrição',
      sortable: true,
      formatter: (v: string | null) => v || '-'
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
      const payload = await apiGet<{ items?: Termo[] }>(
        '/api/v1/parametros/nao-comissionaveis',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      termos = payload.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar termos.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function openNew() {
    editingId = null;
    form = { termo: '', descricao: '', ativo: true };
    modalOpen = true;
  }

  function openEdit(t: Termo) {
    editingId = t.id;
    form = { termo: t.termo, descricao: t.descricao || '', ativo: t.ativo };
    modalOpen = true;
  }

  async function save() {
    if (!form.termo.trim()) {
      toast.error('Termo obrigatório.');
      return;
    }
    saving = true;
    try {
      await apiPost('/api/v1/parametros/nao-comissionaveis', {
        id: editingId || undefined,
        ...form
      });
      toast.success(editingId ? 'Termo atualizado.' : 'Termo criado.');
      modalOpen = false;
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar.'));
    } finally {
      saving = false;
    }
  }

  async function deleteTermo(id: string) {
    if (!(await confirmAction('Deseja excluir este termo?'))) return;
    deletingId = id;
    try {
      await apiDelete('/api/v1/parametros/nao-comissionaveis', { id });
      toast.success('Termo excluído.');
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao excluir.'));
    } finally {
      deletingId = '';
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>Parâmetros de Importação | VTUR</title>
</svelte:head>

<PageHeader
  title="Parâmetros de Importação"
  subtitle="Gerencie os termos não comissionáveis usados na importação e conciliação de vendas."
  breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Parâmetros de Importação' }]}
  actions={[
    { label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw },
    { label: 'Novo Termo', onClick: openNew, variant: 'primary', icon: Plus }
  ]}
/>

<Card color="financeiro" class="mb-4">
  <p class="text-sm text-slate-600">
    Termos não comissionáveis são palavras ou expressões que, quando encontradas nos recibos durante
    a importação ou conciliação, fazem com que o valor correspondente não seja incluído no cálculo
    de comissões.
  </p>
</Card>

<DataTable
  {columns}
  data={termos}
  color="financeiro"
  {loading}
  title="Termos não comissionáveis"
  searchable={true}
  emptyMessage="Nenhum termo cadastrado"
  onRowClick={(row) => openEdit(row)}
>
  <svelte:fragment slot="row-actions" let:row>
    <Button
      variant="ghost"
      size="sm"
      class_name="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
      title="Excluir"
      ariaLabel="Excluir termo"
      disabled={deletingId === row.id}
      on:click={(event) => {
        event.stopPropagation();
        deleteTermo(row.id);
      }}
    >
      <Trash2 size={15} />
    </Button>
  </svelte:fragment>
</DataTable>

<Dialog
  bind:open={modalOpen}
  title={editingId ? 'Editar Termo' : 'Novo Termo'}
  color="financeiro"
  size="sm"
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
      id="nc-termo"
      label="Termo *"
      bind:value={form.termo}
      placeholder="Ex: SEGURO, DU, RAV/RAC"
      class_name="w-full"
    />
    <p class="text-xs text-slate-500">Texto que será buscado nos recibos (case-insensitive).</p>
    <FieldInput
      id="nc-desc"
      label="Descrição"
      bind:value={form.descricao}
      placeholder="Explicação do termo"
      class_name="w-full"
    />
    <FieldCheckbox label="Termo ativo" bind:checked={form.ativo} />
  </div>
</Dialog>
