<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import Tabs from '$lib/components/ui/Tabs.svelte';
  import FieldInput from '$lib/components/ui/form/FieldInput.svelte';
  import FieldSelect from '$lib/components/ui/form/FieldSelect.svelte';
  import FieldTextarea from '$lib/components/ui/form/FieldTextarea.svelte';
  import FieldCheckbox from '$lib/components/ui/form/FieldCheckbox.svelte';
  import { toast } from '$lib/stores/ui';
  import { Plus, Pencil, Trash2, RefreshCw, Image, MessageSquare, Tag } from '$lib/icons';
  import { toUserMessage } from '$lib/utils/errors';

  import { confirmAction } from '$lib/stores/confirm';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  type Categoria = { id: string; nome: string; icone: string; sort_order: number; ativo: boolean };
  type Tema = {
    id: string;
    nome: string;
    categoria_id: string | null;
    asset_url: string;
    scope: string;
    ativo: boolean;
  };
  type Template = {
    id: string;
    nome: string;
    categoria: string | null;
    titulo: string;
    corpo: string;
    scope: string;
    ativo: boolean;
  };
  type CtrmEntity = Categoria | Tema | Template;

  const SCOPE_OPTIONS = [
    { value: 'system', label: 'Sistema' },
    { value: 'master', label: 'Master' },
    { value: 'gestor', label: 'Gestor' },
    { value: 'user', label: 'Usuário' }
  ];

  let categorias: Categoria[] = [];
  let temas: Tema[] = [];
  let templates: Template[] = [];
  let loading = true;
  let activeTab: 'categorias' | 'temas' | 'templates' = 'templates';
  let modalOpen = false;
  let saving = false;
  let deletingId = '';
  let editingId: string | null = null;
  let editingEntity: 'categoria' | 'tema' | 'template' = 'template';

  let formCategoria = { nome: '', icone: 'pi pi-tag', sort_order: 0, ativo: true };
  let formTema = { nome: '', categoria_id: '', asset_url: '', scope: 'system', ativo: true };
  let formTemplate = { nome: '', categoria: '', titulo: '', corpo: '', scope: 'user', ativo: true };
  const loadGuard = createLoadGuard();

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<{
        categorias?: Categoria[];
        temas?: Tema[];
        templates?: Template[];
      }>('/api/v1/admin/crm', undefined, request.signal);
      if (!loadGuard.isCurrent(request.seq)) return;
      categorias = payload.categorias || [];
      temas = payload.temas || [];
      templates = payload.templates || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar CRM.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function saveEntity() {
    saving = true;
    try {
      const data =
        editingEntity === 'categoria'
          ? formCategoria
          : editingEntity === 'tema'
            ? { ...formTema, categoria_id: formTema.categoria_id || null }
            : { ...formTemplate, categoria: formTemplate.categoria || null };

      await apiPost('/api/v1/admin/crm', {
        entity: editingEntity,
        action: 'upsert',
        id: editingId || undefined,
        data
      });
      toast.success(editingId ? 'Atualizado.' : 'Criado.');
      modalOpen = false;
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar.'));
    } finally {
      saving = false;
    }
  }

  async function deleteEntity(entity: string, id: string) {
    if (!(await confirmAction('Deseja excluir este item?'))) return;
    deletingId = id;
    try {
      await apiPost('/api/v1/admin/crm', { entity, action: 'delete', id });
      toast.success('Excluído.');
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao excluir.'));
    } finally {
      deletingId = '';
    }
  }

  function openNew(entity: 'categoria' | 'tema' | 'template') {
    editingEntity = entity;
    editingId = null;
    if (entity === 'categoria')
      formCategoria = { nome: '', icone: 'pi pi-tag', sort_order: categorias.length, ativo: true };
    else if (entity === 'tema')
      formTema = { nome: '', categoria_id: '', asset_url: '', scope: 'system', ativo: true };
    else
      formTemplate = { nome: '', categoria: '', titulo: '', corpo: '', scope: 'user', ativo: true };
    modalOpen = true;
  }

  function openEdit(entity: 'categoria' | 'tema' | 'template', item: CtrmEntity) {
    editingEntity = entity;
    editingId = item.id;
    if (entity === 'categoria') {
      const categoria = item as Categoria;
      formCategoria = {
        nome: categoria.nome,
        icone: categoria.icone || 'pi pi-tag',
        sort_order: categoria.sort_order || 0,
        ativo: categoria.ativo
      };
    } else if (entity === 'tema') {
      const tema = item as Tema;
      formTema = {
        nome: tema.nome,
        categoria_id: tema.categoria_id || '',
        asset_url: tema.asset_url || '',
        scope: tema.scope || 'system',
        ativo: tema.ativo
      };
    } else {
      const template = item as Template;
      formTemplate = {
        nome: template.nome,
        categoria: template.categoria || '',
        titulo: template.titulo,
        corpo: template.corpo,
        scope: template.scope || 'user',
        ativo: template.ativo
      };
    }
    modalOpen = true;
  }

  const colsTemplate = [
    { key: 'nome', label: 'Nome', sortable: true },
    {
      key: 'categoria',
      label: 'Ocasião',
      sortable: true,
      formatter: (v: string | null) => v || '-'
    },
    {
      key: 'scope',
      label: 'Escopo',
      sortable: true,
      width: '100px',
      formatter: (v: string) => SCOPE_OPTIONS.find((s) => s.value === v)?.label || v
    },
    {
      key: 'ativo',
      label: 'Status',
      sortable: true,
      width: '90px',
      formatter: (v: boolean) =>
        v
          ? '<span class="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Ativo</span>'
          : '<span class="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Inativo</span>'
    }
  ];

  const colsTema = [
    { key: 'nome', label: 'Nome', sortable: true },
    {
      key: 'scope',
      label: 'Escopo',
      sortable: true,
      width: '100px',
      formatter: (v: string) => SCOPE_OPTIONS.find((s) => s.value === v)?.label || v
    },
    {
      key: 'ativo',
      label: 'Status',
      sortable: true,
      width: '90px',
      formatter: (v: boolean) =>
        v
          ? '<span class="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Ativo</span>'
          : '<span class="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Inativo</span>'
    }
  ];

  onMount(load);
</script>

<svelte:head>
  <title>CRM Admin | VTUR</title>
</svelte:head>

<PageHeader
  title="CRM Admin"
  subtitle="Gerencie categorias, temas de arte e templates de mensagem do CRM."
  breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'CRM' }]}
  actions={[{ label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw }]}
/>

<!-- Tabs -->
<Tabs
  className="mb-6"
  bind:activeKey={activeTab}
  items={[
    { key: 'templates', label: 'Templates', icon: MessageSquare },
    { key: 'temas', label: 'Temas de Arte', icon: Image },
    { key: 'categorias', label: 'Categorias', icon: Tag }
  ]}
/>

{#if activeTab === 'templates'}
  <div class="mb-4 flex justify-end">
    <Button variant="primary" color="financeiro" on:click={() => openNew('template')}>
      <Plus size={16} class="mr-2" />
      Novo Template
    </Button>
  </div>
  <DataTable
    columns={colsTemplate}
    data={templates}
    color="financeiro"
    {loading}
    title="Templates de mensagem"
    searchable={true}
    emptyMessage="Nenhum template"
    onRowClick={(row) => openEdit('template', row)}
  >
    <svelte:fragment slot="row-actions" let:row>
      <Button
        variant="ghost"
        size="sm"
        class_name="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
        ariaLabel="Excluir template"
        disabled={deletingId === row.id}
        on:click={(event) => {
          event.stopPropagation();
          deleteEntity('template', row.id);
        }}
      >
        <Trash2 size={15} />
      </Button>
    </svelte:fragment>
  </DataTable>
{:else if activeTab === 'temas'}
  <div class="mb-4 flex justify-end">
    <Button variant="primary" color="financeiro" on:click={() => openNew('tema')}>
      <Plus size={16} class="mr-2" />
      Novo Tema
    </Button>
  </div>
  <DataTable
    columns={colsTema}
    data={temas}
    color="financeiro"
    {loading}
    title="Temas de arte"
    searchable={true}
    emptyMessage="Nenhum tema"
    onRowClick={(row) => openEdit('tema', row)}
  >
    <svelte:fragment slot="row-actions" let:row>
      <Button
        variant="ghost"
        size="sm"
        class_name="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
        ariaLabel="Excluir tema"
        disabled={deletingId === row.id}
        on:click={(event) => {
          event.stopPropagation();
          deleteEntity('tema', row.id);
        }}
      >
        <Trash2 size={15} />
      </Button>
    </svelte:fragment>
  </DataTable>
{:else}
  <div class="mb-4 flex justify-end">
    <Button variant="primary" color="financeiro" on:click={() => openNew('categoria')}>
      <Plus size={16} class="mr-2" />
      Nova Categoria
    </Button>
  </div>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
    {#each categorias as cat}
      <Card color="financeiro">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-2xl">{cat.icone?.startsWith('pi') ? '🏷️' : cat.icone || '🏷️'}</span>
            <div>
              <p class="font-semibold text-slate-900">{cat.nome}</p>
              <p class="text-xs text-slate-500">Ordem: {cat.sort_order}</p>
            </div>
          </div>
          <div class="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              class_name="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              ariaLabel="Editar categoria"
              on:click={() => openEdit('categoria', cat)}
            >
              <Pencil size={15} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class_name="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              ariaLabel="Excluir categoria"
              disabled={deletingId === cat.id}
              on:click={() => deleteEntity('categoria', cat.id)}
            >
              <Trash2 size={15} />
            </Button>
          </div>
        </div>
      </Card>
    {/each}
    {#if categorias.length === 0 && !loading}
      <div class="col-span-3 py-12 text-center text-slate-500">Nenhuma categoria cadastrada.</div>
    {/if}
  </div>
{/if}

<Dialog
  bind:open={modalOpen}
  title={editingId ? 'Editar' : 'Novo'}
  color="financeiro"
  size="lg"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText={editingId ? 'Salvar' : 'Criar'}
  loading={saving}
  onConfirm={saveEntity}
  onCancel={() => (modalOpen = false)}
>
  {#if editingEntity === 'categoria'}
    <div class="space-y-4">
      <FieldInput id="crm-cat-nome" label="Nome" bind:value={formCategoria.nome} required />
      <FieldInput
        id="crm-cat-icone"
        label="Ícone"
        bind:value={formCategoria.icone}
        placeholder="pi pi-tag"
      />
      <FieldInput
        id="crm-cat-ordem"
        label="Ordem"
        type="number"
        value={String(formCategoria.sort_order)}
        on:input={(e) => {
          formCategoria.sort_order = Number((e.target as HTMLInputElement).value);
        }}
      />
      <FieldCheckbox id="crm-cat-ativo" label="Ativo" bind:checked={formCategoria.ativo} />
    </div>
  {:else if editingEntity === 'tema'}
    <div class="space-y-4">
      <FieldInput id="crm-tema-nome" label="Nome" bind:value={formTema.nome} required />
      <FieldInput
        id="crm-tema-url"
        label="URL da Arte"
        bind:value={formTema.asset_url}
        placeholder="https://..."
      />
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldSelect
          id="crm-tema-cat"
          label="Categoria"
          bind:value={formTema.categoria_id}
          placeholder={null}
          options={[
            { value: '', label: 'Sem categoria' },
            ...categorias.map((c) => ({ value: c.id, label: c.nome }))
          ]}
        />
        <FieldSelect
          id="crm-tema-scope"
          label="Escopo"
          bind:value={formTema.scope}
          placeholder={null}
          options={SCOPE_OPTIONS}
        />
      </div>
      <FieldCheckbox id="crm-tema-ativo" label="Ativo" bind:checked={formTema.ativo} />
    </div>
  {:else}
    <div class="space-y-4">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldInput id="crm-tpl-nome" label="Nome" bind:value={formTemplate.nome} required />
        <FieldInput
          id="crm-tpl-cat"
          label="Ocasião"
          bind:value={formTemplate.categoria}
          placeholder="Ex: Aniversário"
        />
        <FieldSelect
          id="crm-tpl-scope"
          label="Escopo"
          bind:value={formTemplate.scope}
          placeholder={null}
          options={SCOPE_OPTIONS}
        />
        <div class="flex items-end">
          <FieldCheckbox id="crm-tpl-ativo" label="Ativo" bind:checked={formTemplate.ativo} />
        </div>
      </div>
      <FieldInput id="crm-tpl-titulo" label="Título" bind:value={formTemplate.titulo} required />
      <FieldTextarea
        id="crm-tpl-corpo"
        label="Corpo"
        bind:value={formTemplate.corpo}
        rows={6}
        placeholder={'Use {{nome_cliente}}, {{primeiro_nome}}, {{consultor}}'}
        required
      />
    </div>
  {/if}
</Dialog>
