<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { toast } from '$lib/stores/ui';
  import { BottomSheet, FieldInput, FieldSelect } from '$lib/components/ui';
  import { apiDelete, apiGet, apiPost } from '$lib/services/api';
  import { Plus, Trash2, RefreshCw, SlidersHorizontal } from '$lib/icons';
  import { toUserMessage } from '$lib/utils/errors';
  import { createDebouncedReloader } from '$lib/utils/autoReload';

  import { confirmAction } from '$lib/stores/confirm';
  type Subdivisao = {
    id: string;
    nome: string;
    pais_id: string;
    codigo_admin1: string | null;
    tipo: string | null;
    created_at: string | null;
    pais?: { id: string; nome: string } | null;
  };

  type Pais = { id: string; nome: string };

  type PaisesResponse = {
    items?: Pais[] | null;
  };

  type SubdivisoesResponse = {
    items?: Subdivisao[] | null;
    total?: number;
    page?: number;
    pageSize?: number;
  };

  let subdivisoes: Subdivisao[] = [];
  let paises: Pais[] = [];
  let loading = true;
  let modalOpen = false;
  let saving = false;
  let deletingId = '';
  let editingId: string | null = null;
  let filtroPais = '';
  let autoReloadEnabled = false;
  let lastAutoReloadKey = '';
  let showFilterSheet = false;
  const autoReload = createDebouncedReloader(() => load(), 250);

  let form = { nome: '', pais_id: '', codigo_admin1: '', tipo: '' };

  const columns = [
    { key: 'nome', label: 'Nome', sortable: true },
    {
      key: 'pais',
      label: 'País',
      sortable: false,
      formatter: (_: unknown, row: Subdivisao) => row.pais?.nome || '-'
    },
    {
      key: 'codigo_admin1',
      label: 'Código',
      sortable: true,
      width: '100px',
      formatter: (v: string | null) => v || '-'
    },
    {
      key: 'tipo',
      label: 'Tipo',
      sortable: true,
      width: '120px',
      formatter: (v: string | null) => v || '-'
    }
  ];

  async function loadPaises() {
    try {
      const payload = await apiGet<PaisesResponse>('/api/v1/paises');
      paises = payload.items || [];
    } catch (_err) {
      paises = [];
    }
  }

  async function load() {
    loading = true;
    let payload: SubdivisoesResponse | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        payload = await apiGet<SubdivisoesResponse>(
          '/api/v1/subdivisoes',
          {
            pais_id: filtroPais || undefined,
            pageSize: 500
          },
          undefined,
          30_000
        );
        break;
      } catch (err) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        toast.error(toUserMessage(err, 'Não foi possível carregar os estados. Tente novamente.'));
        loading = false;
        return;
      }
    }
    subdivisoes = payload?.items || [];
    loading = false;
  }

  function openNew() {
    editingId = null;
    form = { nome: '', pais_id: paises[0]?.id || '', codigo_admin1: '', tipo: '' };
    modalOpen = true;
  }

  function openEdit(s: Subdivisao) {
    editingId = s.id;
    form = {
      nome: s.nome,
      pais_id: s.pais_id,
      codigo_admin1: s.codigo_admin1 || '',
      tipo: s.tipo || ''
    };
    modalOpen = true;
  }

  async function save() {
    if (!form.nome.trim()) {
      toast.error('Nome obrigatório.');
      return;
    }
    if (!form.pais_id) {
      toast.error('País obrigatório.');
      return;
    }
    saving = true;
    try {
      await apiPost('/api/v1/subdivisoes', {
        id: editingId || undefined,
        nome: form.nome,
        pais_id: form.pais_id,
        codigo_admin1: form.codigo_admin1 || null,
        tipo: form.tipo || null
      });
      toast.success(editingId ? 'Estado atualizado.' : 'Estado criado.');
      modalOpen = false;
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar.'));
    } finally {
      saving = false;
    }
  }

  async function deleteEstado(id: string) {
    if (!(await confirmAction('Deseja excluir este estado/província?'))) return;
    deletingId = id;
    try {
      await apiDelete('/api/v1/subdivisoes', { id });
      toast.success('Estado excluído.');
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao excluir.'));
    } finally {
      deletingId = '';
    }
  }

  onMount(async () => {
    await Promise.all([load(), loadPaises()]);
    lastAutoReloadKey = buildAutoReloadKey();
    autoReloadEnabled = true;
  });

  onDestroy(() => {
    autoReload.cancel();
  });

  function buildAutoReloadKey() {
    return filtroPais;
  }

  function scheduleAutoReload() {
    autoReload.schedule();
  }

  // O $: do modo legado só reage às variáveis escritas nesta linha (não enxerga dentro de
  // buildAutoReloadKey()). Por isso a mesma expressão da função fica aqui, idêntica.
  $: autoReloadKey = filtroPais;
  $: if (autoReloadEnabled && autoReloadKey !== lastAutoReloadKey) {
    lastAutoReloadKey = autoReloadKey;
    scheduleAutoReload();
  }
</script>

<svelte:head>
  <title>Estados/Províncias | VTUR</title>
</svelte:head>

<PageHeader
  title="Estados / Províncias"
  subtitle="Cadastro de estados e províncias vinculados a países."
  breadcrumbs={[{ label: 'Cadastros', href: '/cadastros' }, { label: 'Estados' }]}
  actions={[
    { label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw },
    { label: 'Novo Estado', onClick: openNew, variant: 'primary', icon: Plus }
  ]}
/>

<!-- Mobile: botão de filtros -->
<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Filtros
    {#if filtroPais}
      <span class="ml-2 inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
    {/if}
  </Button>
</div>

<Card class="mb-6 hidden sm:block">
  <div class="flex items-end gap-4">
    <FieldSelect
      id="est-pais"
      label="País"
      bind:value={filtroPais}
      options={[
        { value: '', label: 'Todos' },
        ...paises.map((p) => ({ value: p.id, label: p.nome }))
      ]}
      placeholder={null}
    />
  </div>
</Card>

<BottomSheet bind:open={showFilterSheet} title="Filtrar Estados">
  <div class="space-y-4">
    <FieldSelect
      id="est-pais-mobile"
      label="País"
      bind:value={filtroPais}
      options={[
        { value: '', label: 'Todos' },
        ...paises.map((p) => ({ value: p.id, label: p.nome }))
      ]}
      placeholder={null}
      class_name="w-full"
    />
  </div>
  <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
    Aplicar filtros
  </Button>
</BottomSheet>

<DataTable
  {columns}
  data={subdivisoes}
  {loading}
  title="Estados/Províncias"
  searchable={true}
  emptyMessage="Nenhum estado encontrado"
  onRowClick={(row) => openEdit(row)}
>
  <svelte:fragment slot="row-actions" let:row>
    <Button
      variant="ghost"
      size="sm"
      class_name="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
      disabled={deletingId === row.id}
      title="Excluir estado"
      ariaLabel="Excluir estado"
      on:click={(event) => {
        event.stopPropagation();
        deleteEstado(row.id);
      }}
    >
      <Trash2 size={15} />
    </Button>
  </svelte:fragment>
</DataTable>

<Dialog
  bind:open={modalOpen}
  title={editingId ? 'Editar Estado' : 'Novo Estado'}
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
      id="est-nome"
      label="Nome *"
      bind:value={form.nome}
      placeholder="Nome do estado/província"
      class_name="w-full"
    />
    <FieldSelect
      id="est-pais-form"
      label="País *"
      bind:value={form.pais_id}
      options={[
        { value: '', label: 'Selecione uma opção' },
        ...paises.map((p) => ({ value: p.id, label: p.nome }))
      ]}
      placeholder={null}
      class_name="w-full"
    />
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FieldInput
        id="est-codigo"
        label="Código"
        bind:value={form.codigo_admin1}
        placeholder="Ex: SP, RJ"
        class_name="w-full"
      />
      <FieldInput
        id="est-tipo"
        label="Tipo"
        bind:value={form.tipo}
        placeholder="Ex: Estado, Província"
        class_name="w-full"
      />
    </div>
  </div>
</Dialog>
