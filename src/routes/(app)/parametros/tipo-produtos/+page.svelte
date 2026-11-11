<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { FieldInput, FieldSelect, FieldCheckbox } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { apiDelete, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { Plus, Trash2, RefreshCw } from '$lib/icons';
  import { toUserMessage } from '$lib/utils/errors';

  import { confirmAction } from '$lib/stores/confirm';
  type TipoProduto = {
    id: string;
    nome: string | null;
    tipo: string;
    descricao: string | null;
    ativo: boolean;
  };

  let tipos: TipoProduto[] = [];
  let loading = true;
  let modalOpen = false;
  let saving = false;
  let deletingId = '';
  let editingId: string | null = null;
  const loadGuard = createLoadGuard();

  let form = createForm();

  function createForm() {
    return {
      nome: '',
      tipo: 'servico',
      descricao: '',
      ativo: true
    };
  }

  const TIPOS = [
    { value: 'servico', label: 'Passeio' },
    { value: 'pacote', label: 'Pacote' },
    { value: 'hotel', label: 'Hotel' },
    { value: 'aereo', label: 'Aéreo' },
    { value: 'seguro', label: 'Seguro' },
    { value: 'transfer', label: 'Transfer' },
    { value: 'rodoviario', label: 'Rodoviário' },
    { value: 'ingresso', label: 'Ingresso' },
    { value: 'show', label: 'Show' },
    { value: 'cruzeiro', label: 'Cruzeiro' },
    { value: 'outro', label: 'Outro' }
  ];

  $: canEdit =
    !$permissoes.ready || $permissoes.isSystemAdmin || permissoes.can('parametros', 'edit');
  $: canDelete =
    !$permissoes.ready || $permissoes.isSystemAdmin || permissoes.can('parametros', 'admin');

  const columns = [
    { key: 'nome', label: 'Nome', sortable: true },
    {
      key: 'tipo',
      label: 'Tipo',
      sortable: true,
      width: '120px',
      formatter: (value: string) => {
        const found = TIPOS.find((t) => t.value === value);
        return found ? found.label : value;
      }
    },
    {
      key: 'ativo',
      label: 'Status',
      sortable: true,
      width: '100px',
      formatter: (value: boolean) =>
        value
          ? '<span class="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">Ativo</span>'
          : '<span class="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Inativo</span>'
    }
  ];

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<{ items?: TipoProduto[] }>(
        '/api/v1/tipo-produtos',
        { all: 1 },
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      tipos = payload.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar tipos de produto.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function openNew() {
    editingId = null;
    form = createForm();
    modalOpen = true;
  }

  function openEdit(tipo: TipoProduto) {
    editingId = tipo.id;
    form = {
      nome: tipo.nome || '',
      tipo: tipo.tipo || 'servico',
      descricao: tipo.descricao || '',
      ativo: tipo.ativo
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
      await apiPost('/api/v1/tipo-produtos', {
        id: editingId || undefined,
        nome: form.nome.trim(),
        tipo: form.tipo,
        descricao: form.descricao || null,
        ativo: form.ativo
      });
      toast.success(editingId ? 'Tipo de produto atualizado.' : 'Tipo de produto criado.');
      modalOpen = false;
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar tipo de produto.'));
    } finally {
      saving = false;
    }
  }

  async function deleteTipo(id: string) {
    if (
      !(await confirmAction(
        'Deseja excluir este tipo de produto? Ele não pode estar vinculado a recibos.'
      ))
    )
      return;
    deletingId = id;
    try {
      await apiDelete('/api/v1/tipo-produtos', { id });
      toast.success('Tipo de produto excluído.');
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao excluir tipo de produto.'));
    } finally {
      deletingId = '';
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>Tipos de Produto | VTUR</title>
</svelte:head>

<PageHeader
  title="Tipos de Produto"
  subtitle="Gerencie a lista global de tipos de produto utilizados nos recibos."
  color="financeiro"
  breadcrumbs={[{ label: 'Parâmetros', href: '/parametros' }, { label: 'Tipos de Produto' }]}
  actions={[
    { label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw },
    ...(canEdit
      ? [{ label: 'Novo Tipo', onClick: openNew, variant: 'primary' as const, icon: Plus }]
      : [])
  ]}
/>

<DataTable
  {columns}
  data={tipos}
  color="financeiro"
  {loading}
  title="Tipos de produto"
  searchable={true}
  emptyMessage="Nenhum tipo de produto cadastrado"
  onRowClick={canEdit ? (row) => openEdit(row) : undefined}
>
  <svelte:fragment slot="row-actions" let:row>
    {#if canDelete}
      <Button
        variant="ghost"
        size="sm"
        color="red"
        class_name="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
        on:click={() => deleteTipo(row.id)}
        disabled={deletingId === row.id}
      >
        <Trash2 size={15} />
      </Button>
    {/if}
  </svelte:fragment>
</DataTable>

<Dialog
  bind:open={modalOpen}
  title={editingId ? 'Editar Tipo de Produto' : 'Novo Tipo de Produto'}
  color="financeiro"
  size="lg"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText={editingId ? 'Salvar' : 'Criar'}
  loading={saving}
  onConfirm={save}
  onCancel={() => (modalOpen = false)}
>
  <div class="space-y-4">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FieldInput
        id="tprod-nome"
        label="Nome"
        required={true}
        bind:value={form.nome}
        placeholder="Ex: Pacote Aéreo + Hotel"
        class_name="w-full"
      />
      <FieldSelect
        id="tprod-tipo"
        label="Tipo"
        bind:value={form.tipo}
        options={TIPOS}
        placeholder=""
        class_name="w-full"
      />
    </div>
    <FieldInput
      id="tprod-descricao"
      label="Descrição"
      bind:value={form.descricao}
      placeholder="Descrição opcional"
      class_name="w-full"
    />
    <FieldCheckbox
      label="Tipo ativo"
      bind:checked={form.ativo}
      color="financeiro"
      class_name="rounded-xl border border-slate-200 bg-white px-3 py-2"
    />
  </div>
</Dialog>
