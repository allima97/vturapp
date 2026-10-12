<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Badge,
    Button,
    Card,
    Dialog,
    FieldCheckbox,
    FieldInput,
    FieldSelect,
    FieldTextarea,
    LoadingState,
    PageHeader
  } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { confirmAction } from '$lib/stores/confirm';
  import { apiDelete, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { BookOpen, FileText, Pencil, Plus, RefreshCw, Trash2 } from '$lib/icons';

  type DocumentationSection = {
    id: string;
    slug: string;
    role_scope: string;
    module_key: string;
    route_pattern: string | null;
    title: string;
    summary: string | null;
    content_markdown: string;
    tone: string;
    sort_order: number;
    is_active: boolean;
    updated_at: string | null;
  };

  type DocumentationPayload = {
    sections?: DocumentationSection[];
    source?: string;
  };

  const roleOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'vendedor', label: 'Vendedor' },
    { value: 'gestor', label: 'Gestor' },
    { value: 'master', label: 'Master' },
    { value: 'admin', label: 'Admin' }
  ];

  const toneOptions = [
    { value: 'info', label: 'Informativo' },
    { value: 'default', label: 'Padrão' },
    { value: 'config', label: 'Configuração' },
    { value: 'teal', label: 'Operação' },
    { value: 'green', label: 'Sucesso' }
  ];

  let loading = true;
  let saving = false;
  let sections: DocumentationSection[] = [];
  let source = '';
  let selectedId = '';
  let modalOpen = false;
  let form = createForm();
  const loadGuard = createLoadGuard();

  $: selected = sections.find((section) => section.id === selectedId) || sections[0] || null;
  $: activeCount = sections.reduce((total, section) => total + (section.is_active ? 1 : 0), 0);
  $: inactiveCount = Math.max(0, sections.length - activeCount);

  function createForm(section?: DocumentationSection | null) {
    return {
      id: section?.id || '',
      slug: section?.slug || 'vtur',
      role_scope: section?.role_scope || 'all',
      module_key: section?.module_key || '',
      route_pattern: section?.route_pattern || '',
      title: section?.title || '',
      summary: section?.summary || '',
      content_markdown: section?.content_markdown || '',
      tone: section?.tone || 'info',
      sort_order: String(section?.sort_order ?? 0),
      is_active: section?.is_active !== false
    };
  }

  function previewText(value: string) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > 180 ? `${text.slice(0, 180)}...` : text;
  }

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<DocumentationPayload>('/api/v1/documentacao', undefined, request.signal);
      if (!loadGuard.isCurrent(request.seq)) return;
      sections = payload.sections || [];
      source = payload.source || '';
      if (!selectedId || !sections.some((section) => section.id === selectedId)) {
        selectedId = sections[0]?.id || '';
      }
    } catch (err) {
      if (isCanceledApiError(err)) return;
      sections = [];
      selectedId = '';
      toast.error(toUserMessage(err, 'Não foi possível carregar a documentação.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function openNew() {
    form = createForm();
    modalOpen = true;
  }

  function openEdit(section: DocumentationSection) {
    form = createForm(section);
    modalOpen = true;
  }

  async function save() {
    if (!form.title.trim()) {
      toast.error('Informe o título.');
      return;
    }
    if (!form.module_key.trim()) {
      toast.error('Informe a chave do módulo.');
      return;
    }
    if (!form.content_markdown.trim()) {
      toast.error('Informe o conteúdo.');
      return;
    }

    saving = true;
    try {
      await apiPost('/api/v1/documentacao', {
        ...form,
        sort_order: Number(form.sort_order || 0)
      });
      toast.success(form.id ? 'Documentação atualizada.' : 'Documentação criada.');
      modalOpen = false;
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Não foi possível salvar a documentação.'));
    } finally {
      saving = false;
    }
  }

  async function remove(section: DocumentationSection) {
    const confirmed = await confirmAction(`Excluir a documentação "${section.title}"?`);
    if (!confirmed) return;

    try {
      await apiDelete('/api/v1/documentacao', { id: section.id });
      toast.success('Documentação excluída.');
      if (selectedId === section.id) selectedId = '';
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Não foi possível excluir a documentação.'));
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>Documentação | VTUR</title>
</svelte:head>

<PageHeader
  title="Documentação"
  subtitle="Crie e mantenha guias internos, por módulo, perfil e rota do sistema."
  breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Documentação' }]}
  actions={[
    { label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw },
    { label: 'Nova documentação', onClick: openNew, variant: 'primary', icon: Plus }
  ]}
/>

{#if loading}
  <LoadingState />
{:else}
  <div class="vtur-kpi-grid vtur-kpi-grid-3 mb-6">
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
        <BookOpen size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Seções</p>
        <p class="text-2xl font-bold text-slate-900">{sections.length}</p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
        <FileText size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Ativas</p>
        <p class="text-2xl font-bold text-slate-900">{activeCount}</p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
        <FileText size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Inativas</p>
        <p class="text-2xl font-bold text-slate-900">{inactiveCount}</p>
      </div>
    </div>
  </div>

  {#if source === 'legacy'}
    <div class="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      Documentação carregada do modelo legado. Ao editar ou criar novos itens, o sistema passa a salvar no modelo estruturado.
    </div>
  {/if}

  <div class="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
    <Card title="Instâncias de documentação" color="financeiro">
      {#if sections.length === 0}
        <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Nenhuma documentação cadastrada.
        </div>
      {:else}
        <div class="space-y-3">
          {#each sections as section}
            <button
              type="button"
              class="w-full rounded-xl border px-4 py-3 text-left transition {selected?.id === section.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}"
              on:click={() => (selectedId = section.id)}
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="font-semibold text-slate-900">{section.title}</p>
                    <Badge color={section.is_active ? 'green' : 'gray'} size="sm">
                      {section.is_active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                  <p class="mt-1 text-xs text-slate-500">
                    {section.slug} · {section.role_scope} · {section.module_key}
                  </p>
                  {#if section.summary}
                    <p class="mt-2 text-sm text-slate-600">{section.summary}</p>
                  {/if}
                </div>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </Card>

    <Card title={selected ? selected.title : 'Conteúdo'} color="financeiro">
      <svelte:fragment slot="actions">
        {#if selected}
          <div class="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" on:click={() => openEdit(selected)}>
              <Pencil size={15} class="mr-1.5" />
              Editar
            </Button>
            <Button variant="danger" size="sm" on:click={() => remove(selected)}>
              <Trash2 size={15} class="mr-1.5" />
              Excluir
            </Button>
          </div>
        {/if}
      </svelte:fragment>

      {#if selected}
        <div class="mb-4 flex flex-wrap gap-2">
          <Badge color="blue" size="sm">Instância: {selected.slug}</Badge>
          <Badge color="purple" size="sm">Perfil: {selected.role_scope}</Badge>
          <Badge color="yellow" size="sm">Módulo: {selected.module_key}</Badge>
          {#if selected.route_pattern}
            <Badge color="teal" size="sm">Rota: {selected.route_pattern}</Badge>
          {/if}
        </div>

        {#if selected.summary}
          <p class="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {selected.summary}
          </p>
        {/if}

        <div class="prose prose-sm max-w-none whitespace-pre-wrap rounded-xl border border-slate-200 bg-white px-5 py-4 text-slate-700">
          {selected.content_markdown}
        </div>
      {:else}
        <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
          <p class="font-medium text-slate-900">Nenhuma documentação selecionada</p>
          <p class="mt-1 text-sm text-slate-500">Crie uma nova instância para começar.</p>
          <Button class_name="mt-4" on:click={openNew}>
            <Plus size={16} class="mr-2" />
            Nova documentação
          </Button>
        </div>
      {/if}
    </Card>
  </div>
{/if}

<Dialog
  bind:open={modalOpen}
  title={form.id ? 'Editar documentação' : 'Nova documentação'}
  color="financeiro"
  size="xl"
  showCancel={true}
  showConfirm={true}
  cancelText="Cancelar"
  confirmText={form.id ? 'Salvar alterações' : 'Criar documentação'}
  loading={saving}
  onConfirm={save}
  onCancel={() => (modalOpen = false)}
>
  <div class="grid gap-4 md:grid-cols-2">
    <FieldInput
      id="doc-title"
      label="Título"
      bind:value={form.title}
      required={true}
      placeholder="Ex.: Como cadastrar uma venda"
    />
    <FieldInput
      id="doc-module-key"
      label="Chave do módulo"
      bind:value={form.module_key}
      required={true}
      placeholder="Ex.: vendas_importacao"
      helper="Use uma chave única por instância, perfil e módulo."
    />
    <FieldInput
      id="doc-slug"
      label="Instância"
      bind:value={form.slug}
      placeholder="vtur"
      helper="Agrupa documentações por produto/ambiente. Ex.: vtur, onboarding, financeiro."
    />
    <FieldSelect
      id="doc-role"
      label="Perfil"
      bind:value={form.role_scope}
      options={roleOptions}
      placeholder={null}
    />
    <FieldInput
      id="doc-route-pattern"
      label="Rota relacionada"
      bind:value={form.route_pattern}
      placeholder="/vendas/nova"
    />
    <FieldSelect
      id="doc-tone"
      label="Tipo visual"
      bind:value={form.tone}
      options={toneOptions}
      placeholder={null}
    />
    <FieldInput
      id="doc-sort-order"
      label="Ordenação"
      type="number"
      bind:value={form.sort_order}
    />
    <FieldCheckbox
      id="doc-active"
      label="Documentação ativa"
      bind:checked={form.is_active}
      align="center"
      class_name="flex items-end"
    />
  </div>

  <div class="mt-4 space-y-4">
    <FieldTextarea
      id="doc-summary"
      label="Resumo"
      bind:value={form.summary}
      rows={2}
      placeholder="Resumo curto exibido na lista."
    />
    <FieldTextarea
      id="doc-content"
      label="Conteúdo"
      bind:value={form.content_markdown}
      rows={12}
      monospace={true}
      required={true}
      placeholder="Escreva o guia em Markdown."
    />
    {#if form.content_markdown}
      <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p class="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Prévia curta</p>
        <p class="mt-2 text-sm text-slate-600">{previewText(form.content_markdown)}</p>
      </div>
    {/if}
  </div>
</Dialog>
