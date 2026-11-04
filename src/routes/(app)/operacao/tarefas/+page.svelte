<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import {
    FieldInput,
    FieldSelect,
    FieldTextarea,
    LoadingState,
    BottomSheet
  } from '$lib/components/ui';
  import KPICard from '$lib/components/kpis/KPICard.svelte';
  import { toast } from '$lib/stores/ui';
  import { confirmAction } from '$lib/stores/confirm';
  import { apiDelete, apiGet, apiPatch, apiPost, isCanceledApiError } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';
  import {
    Archive,
    FolderKanban,
    Layers3,
    List,
    Plus,
    Search,
    SlidersHorizontal,
    SquareCheckBig,
    Tag
  } from '$lib/icons';

  type TodoStatus = 'novo' | 'agendado' | 'em_andamento' | 'concluido';
  type VisibleTodoStatus = 'novo' | 'agendado' | 'em_andamento';
  type TodoPrioridade = 'alta' | 'media' | 'baixa';
  type ViewMode = 'kanban' | 'lista';

  type TodoCategoria = {
    id: string;
    nome: string;
    cor: string | null;
  };

  type TodoItem = {
    id: string;
    titulo: string;
    descricao: string | null;
    done: boolean;
    categoria_id: string | null;
    prioridade: TodoPrioridade;
    status: TodoStatus;
    arquivo: string | null;
    created_at: string | null;
    updated_at: string | null;
  };

  type TodoItemEnriched = TodoItem & {
    visibleStatus: VisibleTodoStatus;
    categoriaNome: string;
    categoriaCor: string;
    prioridadeLabel: string;
    prioridadeBadge: 'red' | 'yellow' | 'green';
    statusLabel: string;
    createdAtLabel: string;
    updatedAtLabel: string;
    searchBlob: string;
  };

  const STATUS_COLUMNS: Array<{
    value: VisibleTodoStatus;
    label: string;
    colorClass: string;
    bodyClass: string;
  }> = [
    {
      value: 'novo',
      label: 'A Fazer',
      colorClass: 'bg-blue-600 text-white',
      bodyClass: 'bg-blue-50/70'
    },
    {
      value: 'agendado',
      label: 'Fazendo',
      colorClass: 'bg-amber-500 text-white',
      bodyClass: 'bg-amber-50/80'
    },
    {
      value: 'em_andamento',
      label: 'Feito',
      colorClass: 'bg-emerald-600 text-white',
      bodyClass: 'bg-emerald-50/80'
    }
  ];

  const PRIORITY_OPTIONS: Array<{ value: TodoPrioridade; label: string }> = [
    { value: 'alta', label: 'Alta' },
    { value: 'media', label: 'Media' },
    { value: 'baixa', label: 'Baixa' }
  ];

  const CATEGORY_PALETTE = [
    '#d1007a',
    '#7a008f',
    '#d97706',
    '#d02a1e',
    '#facc15',
    '#2e7d32',
    '#2d9cdb',
    '#1e3a8a'
  ];

  const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const listColumns = [
    { key: 'titulo', label: 'Assunto', sortable: true },
    { key: 'categoriaNome', label: 'Categoria', sortable: true },
    { key: 'prioridadeLabel', label: 'Prioridade', sortable: true },
    { key: 'statusLabel', label: 'Situacao', sortable: true },
    { key: 'updatedAtLabel', label: 'Atualizacao', sortable: true }
  ];

  const archivedColumns = [
    { key: 'titulo', label: 'Assunto', sortable: true },
    { key: 'categoriaNome', label: 'Categoria', sortable: true },
    { key: 'prioridadeLabel', label: 'Prioridade', sortable: true },
    { key: 'updatedAtLabel', label: 'Arquivada/Atualizada', sortable: true }
  ];

  const defaultTaskForm = () => ({
    titulo: '',
    descricao: '',
    categoria_id: '',
    prioridade: 'media' as TodoPrioridade,
    status: 'novo' as TodoStatus
  });

  const defaultCategoryForm = () => ({
    nome: '',
    cor: CATEGORY_PALETTE[0]
  });

  let loading = true;
  let errorMessage: string | null = null;
  let categorias: TodoCategoria[] = [];
  let itens: TodoItem[] = [];
  let boardRequestSeq = 0;
  let boardAbortController: AbortController | null = null;
  let taskRequestSeq = 0;
  let taskAbortController: AbortController | null = null;
  let viewMode: ViewMode = 'kanban';
  let searchQuery = '';
  let filtroStatus = 'todas';
  let filtroPrioridade = 'todas';
  let filtroCategoria = 'todas';
  let archivedExpanded = false;
  let showFilterSheet = false;
  $: normalizedSearchQuery = searchQuery.trim().toLowerCase();

  let taskModalOpen = false;
  let taskLoading = false;
  let taskSaving = false;
  let taskArchiving = false;
  let selectedTaskId: string | null = null;
  let taskForm = defaultTaskForm();
  let taskMeta = {
    arquivo: null as string | null,
    created_at: null as string | null,
    updated_at: null as string | null
  };

  let categoryModalOpen = false;
  let categorySaving = false;
  let selectedCategoryId: string | null = null;
  let categoryForm = defaultCategoryForm();
  let selectedCategoryLinkedCount = 0;

  function normalizeVisibleStatus(status: TodoStatus): VisibleTodoStatus {
    if (status === 'agendado') return 'agendado';
    if (status === 'em_andamento' || status === 'concluido') return 'em_andamento';
    return 'novo';
  }

  function formatDateTime(value?: string | null) {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

    return DATE_TIME_FORMATTER.format(parsed);
  }

  function getPriorityLabel(value: TodoPrioridade) {
    return PRIORITY_OPTIONS.find((item) => item.value === value)?.label || 'Media';
  }

  function getPriorityBadge(value: TodoPrioridade) {
    if (value === 'alta') return 'red';
    if (value === 'baixa') return 'green';
    return 'yellow';
  }

  function getStatusLabel(value: VisibleTodoStatus) {
    return STATUS_COLUMNS.find((item) => item.value === value)?.label || 'A Fazer';
  }

  function getCategoryColor(categoriaId: string | null) {
    return categorias.find((item) => item.id === categoriaId)?.cor || '#cbd5e1';
  }

  function getCategoryName(categoriaId: string | null) {
    return categorias.find((item) => item.id === categoriaId)?.nome || 'Sem categoria';
  }

  function textColorFor(background: string) {
    const hex = String(background || '').replace('#', '');
    const normalized = hex.length === 3 ? hex.replace(/(.)/g, '$1$1') : hex;
    const numeric = Number.parseInt(normalized, 16);
    const r = (numeric >> 16) & 255;
    const g = (numeric >> 8) & 255;
    const b = numeric & 255;
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 150 ? '#0f172a' : '#f8fafc';
  }

  async function loadBoard() {
    const requestSeq = ++boardRequestSeq;
    boardAbortController?.abort();
    const controller = new AbortController();
    boardAbortController = controller;
    loading = true;
    errorMessage = null;

    try {
      const payload = await apiGet<{ categorias?: TodoCategoria[]; itens?: TodoItem[] }>(
        '/api/v1/todo/board',
        {
          ts: Date.now()
        },
        controller.signal,
        60_000
      );
      if (requestSeq !== boardRequestSeq) return;
      categorias = Array.isArray(payload?.categorias) ? payload.categorias : [];
      itens = Array.isArray(payload?.itens) ? payload.itens : [];
    } catch (error: unknown) {
      if (isCanceledApiError(error)) return;
      if (requestSeq !== boardRequestSeq) return;
      errorMessage = toUserMessage(error, 'Erro ao carregar tarefas.');
      categorias = [];
      itens = [];
    } finally {
      if (requestSeq === boardRequestSeq) {
        loading = false;
        if (boardAbortController === controller) {
          boardAbortController = null;
        }
      }
    }
  }

  onMount(() => {
    loadBoard();
  });

  onDestroy(() => {
    boardAbortController?.abort();
    taskAbortController?.abort();
  });

  $: enrichedItems = itens
    .map((item) => {
      const visibleStatus = normalizeVisibleStatus(item.status);
      const categoriaNome = getCategoryName(item.categoria_id);
      const categoriaCor = getCategoryColor(item.categoria_id);
      const prioridadeLabel = getPriorityLabel(item.prioridade);
      const statusLabel = getStatusLabel(visibleStatus);
      const createdAtLabel = formatDateTime(item.created_at);
      const updatedAtLabel = formatDateTime(item.updated_at || item.created_at);

      const enriched: TodoItemEnriched = {
        ...item,
        visibleStatus,
        categoriaNome,
        categoriaCor,
        prioridadeLabel,
        prioridadeBadge: getPriorityBadge(item.prioridade),
        statusLabel,
        createdAtLabel,
        updatedAtLabel,
        searchBlob: [item.titulo, item.descricao || '', categoriaNome, prioridadeLabel, statusLabel]
          .join(' ')
          .toLowerCase()
      };

      return enriched;
    })
    .sort((left, right) => {
      const statusOrder =
        STATUS_COLUMNS.findIndex((item) => item.value === left.visibleStatus) -
        STATUS_COLUMNS.findIndex((item) => item.value === right.visibleStatus);
      if (statusOrder !== 0) return statusOrder;

      const priorityOrder = (value: TodoPrioridade) => {
        if (value === 'alta') return 0;
        if (value === 'media') return 1;
        return 2;
      };

      const diff = priorityOrder(left.prioridade) - priorityOrder(right.prioridade);
      if (diff !== 0) return diff;

      return String(right.created_at || '').localeCompare(String(left.created_at || ''));
    });

  function matchesFilters(item: TodoItemEnriched) {
    if (normalizedSearchQuery && !item.searchBlob.includes(normalizedSearchQuery)) return false;
    if (filtroStatus !== 'todas' && item.visibleStatus !== filtroStatus) return false;
    if (filtroPrioridade !== 'todas' && item.prioridade !== filtroPrioridade) return false;
    if (filtroCategoria !== 'todas' && (item.categoria_id || 'sem_categoria') !== filtroCategoria)
      return false;
    return true;
  }

  $: activeItems = enrichedItems.filter((item) => !item.arquivo && matchesFilters(item));
  $: archivedItems = enrichedItems.filter((item) => Boolean(item.arquivo) && matchesFilters(item));
  $: statusGroups = STATUS_COLUMNS.map((column) => ({
    ...column,
    items: activeItems.filter((item) => item.visibleStatus === column.value)
  }));

  $: resumo = enrichedItems.reduce(
    (acc, item) => {
      if (item.arquivo) {
        acc.arquivadas += 1;
        return acc;
      }

      acc.ativos += 1;
      if (item.visibleStatus === 'novo') acc.aFazer += 1;
      if (item.visibleStatus === 'agendado') acc.fazendo += 1;
      if (item.visibleStatus === 'em_andamento') acc.feitos += 1;
      return acc;
    },
    { ativos: 0, aFazer: 0, fazendo: 0, feitos: 0, arquivadas: 0 }
  );
  $: categoryTaskCounts = itens.reduce((counts, item) => {
    if (!item.categoria_id) return counts;
    counts.set(item.categoria_id, (counts.get(item.categoria_id) || 0) + 1);
    return counts;
  }, new Map<string, number>());

  function resetTaskModal() {
    selectedTaskId = null;
    taskForm = defaultTaskForm();
    taskMeta = { arquivo: null, created_at: null, updated_at: null };
    taskLoading = false;
    taskArchiving = false;
  }

  function resetCategoryModal() {
    selectedCategoryId = null;
    categoryForm = defaultCategoryForm();
    selectedCategoryLinkedCount = 0;
  }

  function openNewTask() {
    resetTaskModal();
    taskModalOpen = true;
  }

  async function openTask(taskId: string) {
    const requestSeq = ++taskRequestSeq;
    taskAbortController?.abort();
    const controller = new AbortController();
    taskAbortController = controller;
    taskModalOpen = true;
    taskLoading = true;
    selectedTaskId = taskId;

    try {
      const payload = await apiGet<{ item?: TodoItem }>(
        `/api/v1/todo/item/${taskId}`,
        undefined,
        controller.signal,
        60_000
      );
      if (requestSeq !== taskRequestSeq) return;
      const item = payload?.item as TodoItem | undefined;
      if (!item) {
        throw new Error('Tarefa nao encontrada.');
      }

      taskForm = {
        titulo: item.titulo || '',
        descricao: item.descricao || '',
        categoria_id: item.categoria_id || '',
        prioridade: item.prioridade || 'media',
        status: item.status || 'novo'
      };
      taskMeta = {
        arquivo: item.arquivo || null,
        created_at: item.created_at || null,
        updated_at: item.updated_at || null
      };
    } catch (error: unknown) {
      if (isCanceledApiError(error)) return;
      if (requestSeq !== taskRequestSeq) return;
      toast.error(toUserMessage(error, 'Erro ao carregar tarefa.'));
      taskModalOpen = false;
      resetTaskModal();
    } finally {
      if (requestSeq === taskRequestSeq) {
        taskLoading = false;
        if (taskAbortController === controller) {
          taskAbortController = null;
        }
      }
    }
  }

  async function saveTask() {
    if (!taskForm.titulo.trim()) {
      toast.error('Informe o titulo da tarefa.');
      return;
    }

    taskSaving = true;
    try {
      await apiPost('/api/v1/todo/item', {
        id: selectedTaskId || undefined,
        titulo: taskForm.titulo,
        descricao: taskForm.descricao || null,
        categoria_id: taskForm.categoria_id || null,
        prioridade: taskForm.prioridade,
        status: taskForm.status
      });

      toast.success(selectedTaskId ? 'Tarefa atualizada.' : 'Tarefa criada.');
      taskModalOpen = false;
      resetTaskModal();
      await loadBoard();
    } catch (error: unknown) {
      toast.error(toUserMessage(error, 'Erro ao salvar tarefa.'));
    } finally {
      taskSaving = false;
    }
  }

  async function archiveCurrentTask() {
    if (!selectedTaskId || taskArchiving) return;
    const taskId = selectedTaskId;
    const wasArchived = Boolean(taskMeta.arquivo);
    const action = wasArchived ? 'restore' : 'archive';
    const label = wasArchived ? 'restaurar' : 'arquivar';

    if (!(await confirmAction(`Deseja ${label} esta tarefa?`))) return;

    taskArchiving = true;
    try {
      const payload = await apiPatch<{ item?: TodoItem }>('/api/v1/todo/item', {
        id: selectedTaskId,
        action
      });

      const updatedItem = payload?.item as TodoItem | undefined;
      const nextArquivo =
        action === 'archive' ? updatedItem?.arquivo || new Date().toISOString() : null;
      const nextUpdatedAt = updatedItem?.updated_at || new Date().toISOString();

      itens = itens.map((item) =>
        item.id === taskId
          ? {
              ...item,
              ...(updatedItem || {}),
              arquivo: nextArquivo,
              updated_at: nextUpdatedAt
            }
          : item
      );

      toast.success(wasArchived ? 'Tarefa restaurada.' : 'Tarefa arquivada.');
      taskModalOpen = false;
      resetTaskModal();
      await loadBoard();
    } catch (error: unknown) {
      toast.error(toUserMessage(error, 'Erro ao atualizar tarefa.'));
    } finally {
      taskArchiving = false;
    }
  }

  async function deleteCurrentTask() {
    if (!selectedTaskId) return;
    if (!(await confirmAction('Deseja excluir esta tarefa?'))) return;

    try {
      await apiDelete('/api/v1/todo/item', { id: selectedTaskId });
      toast.success('Tarefa excluida.');
      taskModalOpen = false;
      resetTaskModal();
      await loadBoard();
    } catch (error: unknown) {
      toast.error(toUserMessage(error, 'Erro ao excluir tarefa.'));
    }
  }

  function openNewCategory() {
    resetCategoryModal();
    categoryModalOpen = true;
  }

  function openCategory(category: TodoCategoria) {
    selectedCategoryId = category.id;
    categoryForm = {
      nome: category.nome,
      cor: category.cor || CATEGORY_PALETTE[0]
    };
    selectedCategoryLinkedCount = categoryTaskCounts.get(category.id) || 0;
    categoryModalOpen = true;
  }

  async function saveCategory() {
    if (!categoryForm.nome.trim()) {
      toast.error('Informe o nome da categoria.');
      return;
    }

    categorySaving = true;
    try {
      await apiPost('/api/v1/todo/category', {
        id: selectedCategoryId || undefined,
        nome: categoryForm.nome,
        cor: categoryForm.cor
      });

      toast.success(selectedCategoryId ? 'Categoria atualizada.' : 'Categoria criada.');
      categoryModalOpen = false;
      resetCategoryModal();
      await loadBoard();
    } catch (error: unknown) {
      toast.error(toUserMessage(error, 'Erro ao salvar categoria.'));
    } finally {
      categorySaving = false;
    }
  }

  async function deleteCurrentCategory() {
    if (!selectedCategoryId) return;
    if (selectedCategoryLinkedCount > 0) {
      toast.error('Remova as tarefas vinculadas antes de excluir a categoria.');
      return;
    }
    if (!(await confirmAction('Deseja excluir esta categoria?'))) return;

    try {
      await apiDelete('/api/v1/todo/category', { id: selectedCategoryId });
      toast.success('Categoria excluida.');
      categoryModalOpen = false;
      resetCategoryModal();
      await loadBoard();
    } catch (error: unknown) {
      toast.error(toUserMessage(error, 'Erro ao excluir categoria.'));
    }
  }

  function clearFilters() {
    searchQuery = '';
    filtroStatus = 'todas';
    filtroPrioridade = 'todas';
    filtroCategoria = 'todas';
  }
</script>

<svelte:head>
  <title>Tarefas | VTUR</title>
</svelte:head>

<PageHeader
  title="Tarefas"
  subtitle="Crie, categorize e acompanhe suas tarefas no board operacional do legado."
  color="operacao"
  breadcrumbs={[{ label: 'Tarefas' }]}
  actions={[
    { label: 'Nova categoria', onClick: openNewCategory, variant: 'secondary', icon: Tag },
    { label: 'Nova tarefa', onClick: openNewTask, variant: 'primary', icon: Plus }
  ]}
/>

<div class="vtur-kpi-grid vtur-kpi-grid-5 mb-6">
  <KPICard title="Ativas" value={resumo.ativos} color="operacao" icon={SquareCheckBig} />
  <KPICard title="A Fazer" value={resumo.aFazer} color="operacao" icon={List} />
  <KPICard title="Fazendo" value={resumo.fazendo} color="operacao" icon={FolderKanban} />
  <KPICard title="Feitas" value={resumo.feitos} color="operacao" icon={Layers3} />
  <KPICard title="Arquivadas" value={resumo.arquivadas} color="operacao" icon={Archive} />
</div>

<!-- Mobile: botão de filtros -->
<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Filtros
    {#if searchQuery || filtroStatus !== 'todas' || filtroPrioridade !== 'todas' || filtroCategoria !== 'todas'}
      <span class="bg-operacao-500 ml-2 inline-flex h-2 w-2 rounded-full"></span>
    {/if}
  </Button>
</div>

<BottomSheet bind:open={showFilterSheet} title="Filtrar tarefas">
  <div class="flex flex-col gap-4">
    <FieldInput
      id="todo-search-mobile"
      label="Busca"
      bind:value={searchQuery}
      icon={Search}
      placeholder="Titulo, descricao, categoria ou prioridade"
      class_name="w-full"
    />

    <FieldSelect
      id="todo-status-mobile"
      label="Coluna"
      bind:value={filtroStatus}
      options={[
        { value: 'todas', label: 'Todas' },
        ...STATUS_COLUMNS.map((c) => ({ value: c.value, label: c.label }))
      ]}
      placeholder={null}
      class_name="w-full"
    />

    <FieldSelect
      id="todo-priority-mobile"
      label="Prioridade"
      bind:value={filtroPrioridade}
      options={[
        { value: 'todas', label: 'Todas' },
        ...PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
      ]}
      placeholder={null}
      class_name="w-full"
    />

    <FieldSelect
      id="todo-category-mobile"
      label="Categoria"
      bind:value={filtroCategoria}
      options={[
        { value: 'todas', label: 'Todas' },
        { value: 'sem_categoria', label: 'Sem categoria' },
        ...categorias.map((c) => ({ value: c.id, label: c.nome }))
      ]}
      placeholder={null}
      class_name="w-full"
    />

    <div class="min-w-0">
      <p class="mb-1.5 block text-xs leading-5 font-medium text-slate-700">Visualização</p>
      <div class="flex gap-2">
        <Button
          variant={viewMode === 'kanban' ? 'selected' : 'secondary'}
          class_name="box-border h-9 min-w-[96px] rounded-lg px-3! py-0! text-xs leading-none"
          on:click={() => (viewMode = 'kanban')}
        >
          Kanban
        </Button>
        <Button
          variant={viewMode === 'lista' ? 'selected' : 'secondary'}
          class_name="box-border h-9 min-w-[96px] rounded-lg px-3! py-0! text-xs leading-none"
          on:click={() => (viewMode = 'lista')}
        >
          Lista
        </Button>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <Button variant="ghost" size="sm" on:click={clearFilters}>Limpar filtros</Button>
      <Button variant="secondary" size="sm" on:click={loadBoard}>Atualizar board</Button>
    </div>

    <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
      Aplicar filtros
    </Button>
  </div>
</BottomSheet>

<Card color="operacao" class="mb-6 hidden sm:block">
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_repeat(4,minmax(0,1fr))]">
    <div>
      <FieldInput
        id="todo-search"
        label="Busca"
        bind:value={searchQuery}
        icon={Search}
        placeholder="Titulo, descricao, categoria ou prioridade"
        class_name="w-full"
      />
    </div>

    <FieldSelect
      id="todo-status"
      label="Coluna"
      bind:value={filtroStatus}
      options={[
        { value: 'todas', label: 'Todas' },
        ...STATUS_COLUMNS.map((c) => ({ value: c.value, label: c.label }))
      ]}
      placeholder={null}
      class_name="w-full"
    />

    <FieldSelect
      id="todo-priority"
      label="Prioridade"
      bind:value={filtroPrioridade}
      options={[
        { value: 'todas', label: 'Todas' },
        ...PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
      ]}
      placeholder={null}
      class_name="w-full"
    />

    <FieldSelect
      id="todo-category"
      label="Categoria"
      bind:value={filtroCategoria}
      options={[
        { value: 'todas', label: 'Todas' },
        { value: 'sem_categoria', label: 'Sem categoria' },
        ...categorias.map((c) => ({ value: c.id, label: c.nome }))
      ]}
      placeholder={null}
      class_name="w-full"
    />

    <div class="min-w-0">
      <p class="mb-1.5 block text-xs leading-5 font-medium text-slate-700">Visualização</p>
      <div class="flex gap-2">
        <Button
          variant={viewMode === 'kanban' ? 'selected' : 'secondary'}
          class_name="box-border h-9 min-w-[96px] rounded-lg px-3! py-0! text-xs leading-none"
          on:click={() => (viewMode = 'kanban')}
        >
          Kanban
        </Button>
        <Button
          variant={viewMode === 'lista' ? 'selected' : 'secondary'}
          class_name="box-border h-9 min-w-[96px] rounded-lg px-3! py-0! text-xs leading-none"
          on:click={() => (viewMode = 'lista')}
        >
          Lista
        </Button>
      </div>
    </div>
  </div>

  <div class="mt-4 flex flex-wrap gap-2">
    <Button variant="ghost" size="sm" on:click={clearFilters}>Limpar filtros</Button>
    <Button variant="secondary" size="sm" on:click={loadBoard}>Atualizar board</Button>
  </div>
</Card>

<Card color="operacao" class="mb-6">
  <div class="mb-4 flex items-center justify-between gap-3">
    <div>
      <h3 class="text-lg font-semibold text-slate-900">Categorias</h3>
      <p class="text-sm text-slate-500">
        Mesmo fluxo do legado: categorias por usuario para organizar o board.
      </p>
    </div>
    <Button variant="secondary" size="sm" on:click={openNewCategory}>
      <Plus size={14} class="mr-1.5" />
      Nova categoria
    </Button>
  </div>

  {#if categorias.length === 0}
    <div
      class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500"
    >
      Nenhuma categoria cadastrada. Crie categorias para agrupar tarefas como no board do
      `vtur-app`.
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {#each categorias as categoria}
        <Button
          variant="ghost"
          class_name="w-full justify-start rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:-translate-y-0.5 hover:border-operacao-200 hover:shadow-md"
          on:click={() => openCategory(categoria)}
        >
          <div class="flex w-full items-start justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              <span
                class="inline-block h-4 w-4 rounded-full border border-white/30"
                style="background:{categoria.cor || '#cbd5e1'}"
              ></span>
              <div class="min-w-0">
                <h4 class="truncate font-semibold text-slate-900">{categoria.nome}</h4>
                <p class="text-xs text-slate-500">Clique para editar cor e nome</p>
              </div>
            </div>
            <span
              class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
            >
              {categoryTaskCounts.get(categoria.id) || 0}
            </span>
          </div>
        </Button>
      {/each}
    </div>
  {/if}
</Card>

<Card color="operacao" class="mb-6" padding="none">
  <div class="border-b border-slate-100 px-5 py-4">
    <h3 class="text-lg font-semibold text-slate-900">Board de tarefas</h3>
    <p class="text-sm text-slate-500">
      {#if viewMode === 'kanban'}
        Clique no card para abrir o registro e editar status, prioridade, categoria e arquivo.
      {:else}
        Clique na linha para abrir a tarefa, sem botoes por linha.
      {/if}
    </p>
  </div>

  {#if loading}
    <LoadingState compact={true} />
  {:else if errorMessage}
    <div role="alert" class="px-5 py-8 text-sm text-red-600">{errorMessage}</div>
  {:else if activeItems.length === 0}
    <div class="px-5 py-12 text-center text-slate-500">
      Nenhuma tarefa ativa encontrada com os filtros atuais.
    </div>
  {:else if viewMode === 'lista'}
    <div class="p-5">
      <DataTable
        columns={listColumns}
        data={activeItems}
        color="operacao"
        loading={false}
        searchable={false}
        filterable={false}
        exportable={false}
        onRowClick={(row) => openTask(row.id)}
        emptyMessage="Nenhuma tarefa encontrada"
      />
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-4 p-5 xl:grid-cols-3">
      {#each statusGroups as group}
        <div class="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80">
          <div class="flex items-center justify-between px-4 py-3 {group.colorClass}">
            <div>
              <h4 class="font-semibold">{group.label}</h4>
              <p class="text-xs text-white/80">{group.items.length} tarefa(s)</p>
            </div>
          </div>

          <div class="min-h-56 space-y-3 p-3 {group.bodyClass}">
            {#if group.items.length === 0}
              <div
                class="rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-center text-sm text-slate-500"
              >
                Nenhum item nesta coluna.
              </div>
            {:else}
              {#each group.items as item}
                <Button
                  variant="ghost"
                  class_name="w-full justify-start rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:-translate-y-0.5 hover:border-operacao-200 hover:shadow-md"
                  on:click={() => openTask(item.id)}
                >
                  <div class="flex w-full items-start justify-between gap-3">
                    <div class="min-w-0">
                      <h5 class="truncate font-semibold text-slate-900">{item.titulo}</h5>
                      <div class="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                          style="background:{item.categoriaCor}; color:{textColorFor(
                            item.categoriaCor
                          )}"
                        >
                          {item.categoriaNome}
                        </span>
                        <Badge color={item.prioridadeBadge} size="sm">{item.prioridadeLabel}</Badge>
                      </div>
                    </div>
                    <span
                      class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
                    >
                      {item.updatedAtLabel}
                    </span>
                  </div>

                  {#if item.descricao}
                    <p class="mt-3 line-clamp-2 text-sm text-slate-600">{item.descricao}</p>
                  {/if}
                </Button>
              {/each}
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</Card>

<Card color="operacao">
  <Button
    variant="ghost"
    class_name="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100"
    on:click={() => (archivedExpanded = !archivedExpanded)}
  >
    <div>
      <h3 class="font-semibold text-slate-900">Arquivadas</h3>
      <p class="text-sm text-slate-500">
        Mesmo comportamento do board legado para restaurar historico de tarefas.
      </p>
    </div>
    <span class="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
      {archivedItems.length}
    </span>
  </Button>

  {#if archivedExpanded}
    <div class="mt-4">
      <DataTable
        columns={archivedColumns}
        data={archivedItems}
        color="operacao"
        loading={false}
        searchable={false}
        filterable={false}
        exportable={false}
        onRowClick={(row) => openTask(row.id)}
        emptyMessage="Nenhuma tarefa arquivada encontrada"
      />
    </div>
  {/if}
</Card>

<Dialog
  bind:open={taskModalOpen}
  title={selectedTaskId ? 'Detalhe da tarefa' : 'Nova tarefa'}
  color="operacao"
  size="lg"
  showCancel={true}
  cancelText="Fechar"
  showConfirm={!taskLoading}
  confirmText={selectedTaskId ? 'Salvar alteracoes' : 'Criar tarefa'}
  loading={taskSaving}
  onCancel={() => {
    taskModalOpen = false;
    resetTaskModal();
  }}
  onConfirm={saveTask}
>
  {#if taskLoading}
    <LoadingState compact={true} />
  {:else}
    <div class="space-y-5">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="md:col-span-2">
          <FieldInput
            id="task-title"
            label="Titulo"
            bind:value={taskForm.titulo}
            placeholder="Descreva a tarefa"
            class_name="w-full"
          />
        </div>

        <div class="md:col-span-2">
          <FieldTextarea
            id="task-description"
            label="Descricao"
            bind:value={taskForm.descricao}
            rows={4}
            placeholder="Observacoes da tarefa"
            class_name="w-full"
          />
        </div>

        <FieldSelect
          id="task-category"
          label="Categoria"
          bind:value={taskForm.categoria_id}
          options={[
            { value: '', label: 'Sem categoria' },
            ...categorias.map((c) => ({ value: c.id, label: c.nome }))
          ]}
          placeholder={null}
          class_name="w-full"
        />

        <FieldSelect
          id="task-priority"
          label="Prioridade"
          bind:value={taskForm.prioridade}
          options={PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          placeholder={null}
          class_name="w-full"
        />

        <FieldSelect
          id="task-status"
          label="Status"
          bind:value={taskForm.status}
          options={[
            { value: 'novo', label: 'A Fazer' },
            { value: 'agendado', label: 'Fazendo' },
            { value: 'em_andamento', label: 'Feito' },
            { value: 'concluido', label: 'Concluido' }
          ]}
          placeholder={null}
          class_name="w-full"
        />

        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p class="text-sm font-medium text-slate-700">Fluxo atual</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <Badge color={getPriorityBadge(taskForm.prioridade)} size="sm"
              >{getPriorityLabel(taskForm.prioridade)}</Badge
            >
            <Badge color="operacao" size="sm"
              >{getStatusLabel(normalizeVisibleStatus(taskForm.status))}</Badge
            >
            {#if taskMeta.arquivo}
              <Badge color="gray" size="sm">Arquivada</Badge>
            {/if}
          </div>
        </div>
      </div>

      {#if selectedTaskId}
        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <h4 class="mb-2 text-sm font-semibold text-slate-900">Historico do registro</h4>
          <div class="grid grid-cols-1 gap-3 text-sm text-slate-600 md:grid-cols-2">
            <div>
              <span class="block text-xs tracking-wide text-slate-400 uppercase">Criada em</span>
              <strong class="text-slate-900">{formatDateTime(taskMeta.created_at)}</strong>
            </div>
            <div>
              <span class="block text-xs tracking-wide text-slate-400 uppercase"
                >Ultima atualizacao</span
              >
              <strong class="text-slate-900"
                >{formatDateTime(taskMeta.updated_at || taskMeta.created_at)}</strong
              >
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <svelte:fragment slot="actions">
    {#if selectedTaskId && !taskLoading}
      <Button
        variant="ghost"
        loading={taskArchiving}
        disabled={taskSaving}
        on:click={archiveCurrentTask}
      >
        {#if taskMeta.arquivo}
          Restaurar
        {:else}
          Arquivar
        {/if}
      </Button>
      <Button variant="danger" on:click={deleteCurrentTask}>Excluir</Button>
    {/if}
  </svelte:fragment>
</Dialog>

<Dialog
  bind:open={categoryModalOpen}
  title={selectedCategoryId ? 'Editar categoria' : 'Nova categoria'}
  color="operacao"
  showCancel={true}
  cancelText="Fechar"
  showConfirm={false}
  loading={categorySaving}
  onCancel={() => {
    categoryModalOpen = false;
    resetCategoryModal();
  }}
>
  <div class="space-y-5">
    <FieldInput
      id="category-name"
      label="Nome"
      bind:value={categoryForm.nome}
      placeholder="Nome da categoria"
      class_name="w-full"
    />

    <div>
      <p class="mb-2 block text-sm font-medium text-slate-700">Cor</p>
      <div class="grid grid-cols-4 gap-2">
        {#each CATEGORY_PALETTE as color}
          <Button
            variant="ghost"
            class_name="h-10 rounded-xl border transition {categoryForm.cor === color
              ? 'border-slate-900 ring-2 ring-slate-200'
              : 'border-slate-200'}"
            ariaLabel={`Selecionar cor ${color}`}
            on:click={() => (categoryForm.cor = color)}
          >
            <span class="h-full w-full rounded-lg" style="background:{color}"></span>
          </Button>
        {/each}
      </div>
    </div>

    <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p class="text-sm font-medium text-slate-700">Vinculos atuais</p>
      <p class="mt-1 text-sm text-slate-600">
        {selectedCategoryLinkedCount} tarefa(s) vinculada(s) a esta categoria.
      </p>
    </div>
  </div>

  <svelte:fragment slot="actions">
    <Button variant="primary" loading={categorySaving} on:click={saveCategory}>
      {#if selectedCategoryId}
        Salvar categoria
      {:else}
        Criar categoria
      {/if}
    </Button>
    {#if selectedCategoryId}
      <Button variant="danger" on:click={deleteCurrentCategory}>Excluir</Button>
    {/if}
  </svelte:fragment>
</Dialog>
