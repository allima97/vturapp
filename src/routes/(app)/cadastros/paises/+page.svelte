<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { FieldInput, FieldSelect } from '$lib/components/ui';
  import { apiDelete, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { Plus, Trash2, RefreshCw } from '$lib/icons';

  import { confirmAction } from '$lib/stores/confirm';
  type Pais = {
    id: string;
    nome: string;
    codigo_iso: string | null;
    continente: string | null;
    created_at: string | null;
  };

  type PaisesResponse = {
    items?: Pais[] | null;
  };

  const CONTINENTES = [
    'África',
    'América do Norte',
    'América do Sul',
    'América Central',
    'Ásia',
    'Europa',
    'Oceania',
    'Antártida'
  ];

  let paises: Pais[] = [];
  let loading = true;
  let modalOpen = false;
  let saving = false;
  let deletingId = '';
  let editingId: string | null = null;

  let form = { nome: '', codigo_iso: '', continente: '' };
  const loadGuard = createLoadGuard();

  const columns = [
    { key: 'nome', label: 'País', sortable: true },
    {
      key: 'codigo_iso',
      label: 'ISO',
      sortable: true,
      width: '80px',
      formatter: (v: string | null) => v || '-'
    },
    {
      key: 'continente',
      label: 'Continente',
      sortable: true,
      formatter: (v: string | null) => v || '-'
    }
  ];

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<PaisesResponse>('/api/v1/paises', undefined, request.signal);
      if (!loadGuard.isCurrent(request.seq)) return;
      paises = payload.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar países.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function openNew() {
    editingId = null;
    form = { nome: '', codigo_iso: '', continente: '' };
    modalOpen = true;
  }

  function openEdit(p: Pais) {
    editingId = p.id;
    form = { nome: p.nome, codigo_iso: p.codigo_iso || '', continente: p.continente || '' };
    modalOpen = true;
  }

  async function save() {
    if (!form.nome.trim()) {
      toast.error('Nome obrigatório.');
      return;
    }
    saving = true;
    try {
      await apiPost('/api/v1/paises', {
        id: editingId || undefined,
        nome: form.nome,
        codigo_iso: form.codigo_iso || null,
        continente: form.continente || null
      });
      toast.success(editingId ? 'País atualizado.' : 'País criado.');
      modalOpen = false;
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar.'));
    } finally {
      saving = false;
    }
  }

  async function deletePais(id: string) {
    if (!(await confirmAction('Deseja excluir este país?'))) return;
    deletingId = id;
    try {
      await apiDelete('/api/v1/paises', { id });
      toast.success('País excluído.');
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
  <title>Países | VTUR</title>
</svelte:head>

<PageHeader
  title="Países"
  subtitle="Cadastro de países utilizados nos destinos e clientes."
  breadcrumbs={[{ label: 'Cadastros', href: '/cadastros' }, { label: 'Países' }]}
  actions={[
    { label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw },
    { label: 'Novo País', onClick: openNew, variant: 'primary', icon: Plus }
  ]}
/>

<DataTable
  {columns}
  data={paises}
  {loading}
  title="Países cadastrados"
  searchable={true}
  emptyMessage="Nenhum país encontrado"
  onRowClick={(row) => openEdit(row)}
>
  <svelte:fragment slot="row-actions" let:row>
    <Button
      variant="ghost"
      size="sm"
      class_name="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
      disabled={deletingId === row.id}
      title="Excluir país"
      ariaLabel="Excluir país"
      on:click={(event) => {
        event.stopPropagation();
        deletePais(row.id);
      }}
    >
      <Trash2 size={15} />
    </Button>
  </svelte:fragment>
</DataTable>

<Dialog
  bind:open={modalOpen}
  title={editingId ? 'Editar País' : 'Novo País'}
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
      id="pais-nome"
      label="Nome *"
      bind:value={form.nome}
      placeholder="Nome do país"
      class_name="w-full"
    />
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FieldInput
        id="pais-iso"
        label="Código ISO"
        bind:value={form.codigo_iso}
        placeholder="Ex: BR, US"
        maxlength={3}
        class_name="w-full"
      />
      <FieldSelect
        id="pais-continente"
        label="Continente"
        bind:value={form.continente}
        options={[
          { value: '', label: 'Selecione uma opção' },
          ...CONTINENTES.map((c) => ({ value: c, label: c }))
        ]}
        placeholder={null}
        class_name="w-full"
      />
    </div>
  </div>
</Dialog>
