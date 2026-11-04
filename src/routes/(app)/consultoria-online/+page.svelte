<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { BottomSheet, FieldInput, FieldSelect, FieldTextarea, LoadingState } from '$lib/components/ui';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiGet, apiPatch, apiPost, isCanceledApiError } from '$lib/services/api';
  import { safeOpenNewTab } from '$lib/security/url';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';
  import { Calendar, Download, Plus, RefreshCw, SlidersHorizontal, Video, X } from '$lib/icons';

  type Consultoria = {
    id: string;
    cliente_id: string | null;
    cliente_nome: string;
    data_hora: string;
    lembrete: string;
    destino: string | null;
    quantidade_pessoas: number;
    orcamento_id: string | null;
    taxa_consultoria: number;
    notas: string | null;
    fechada: boolean;
    fechada_em: string | null;
    created_at: string;
  };

  type ConsultoriaForm = {
    cliente_nome: string;
    data_hora: string;
    lembrete: string;
    destino: string;
    quantidade_pessoas: number;
    taxa_consultoria: number;
    notas: string;
  };

  const lembreteOptions = [
    { value: '15min', label: '15 minutos antes' },
    { value: '30min', label: '30 minutos antes' },
    { value: '1h', label: '1 hora antes' },
    { value: '2h', label: '2 horas antes' },
    { value: '1d', label: '1 dia antes' }
  ];

  const statusOptions = [
    { value: '', label: 'Todas' },
    { value: 'aberta', label: 'Abertas' },
    { value: 'fechada', label: 'Fechadas' }
  ];

  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
  const loadGuard = createLoadGuard();

  const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  let consultorias: Consultoria[] = [];
  let loading = false;
  let saving = false;
  let showModal = false;
  let editingId: string | null = null;
  let statusFilter = '';
  let lastLoadedStatusFilter = statusFilter;
  let autoReloadEnabled = false;
  let showFilterSheet = false;

  function defaultForm(): ConsultoriaForm {
    return {
      cliente_nome: '',
      data_hora: '',
      lembrete: '15min',
      destino: '',
      quantidade_pessoas: 1,
      taxa_consultoria: 0,
      notas: ''
    };
  }

  let form: ConsultoriaForm = defaultForm();

  function formatDataHora(iso: string): string {
    if (!iso) return '-';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    return DATE_TIME_FORMATTER.format(date);
  }

  function formatCurrency(val: number): string {
    if (!val) return '-';
    return BRL_CURRENCY_FORMATTER.format(val);
  }

  async function loadConsultorias() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<Consultoria[]>(
        '/api/v1/consultorias',
        { status: statusFilter || undefined },
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      consultorias = payload;
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar consultorias.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function openCreate() {
    editingId = null;
    form = defaultForm();
    showModal = true;
  }

  function openEdit(c: Consultoria) {
    editingId = c.id;
    const dt = c.data_hora ? new Date(c.data_hora) : null;
    const dataHoraLocal = dt
      ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
      : '';
    form = {
      cliente_nome: c.cliente_nome,
      data_hora: dataHoraLocal,
      lembrete: c.lembrete || '15min',
      destino: c.destino || '',
      quantidade_pessoas: c.quantidade_pessoas || 1,
      taxa_consultoria: c.taxa_consultoria || 0,
      notas: c.notas || ''
    };
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    editingId = null;
    form = defaultForm();
  }

  async function saveConsultoria() {
    if (!form.cliente_nome.trim()) { toast.error('Nome do cliente é obrigatório.'); return; }
    if (!form.data_hora) { toast.error('Data e hora são obrigatórias.'); return; }

    saving = true;
    try {
      const payload = {
        ...(editingId ? { id: editingId } : {}),
        cliente_nome: form.cliente_nome.trim(),
        data_hora: new Date(form.data_hora).toISOString(),
        lembrete: form.lembrete,
        destino: form.destino.trim() || null,
        quantidade_pessoas: Number(form.quantidade_pessoas) || 1,
        taxa_consultoria: Number(form.taxa_consultoria) || 0,
        notas: form.notas.trim() || null
      };

      if (editingId) {
        await apiPatch('/api/v1/consultorias', payload);
      } else {
        await apiPost('/api/v1/consultorias', payload);
      }

      toast.success(editingId ? 'Consultoria atualizada.' : 'Consultoria criada.');
      closeModal();
      await loadConsultorias();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar consultoria.'));
    } finally {
      saving = false;
    }
  }

  async function toggleFechada(c: Consultoria) {
    try {
      await apiPatch('/api/v1/consultorias', {
        id: c.id,
        fechada: !c.fechada,
        fechada_em: !c.fechada ? new Date().toISOString() : null
      });
      toast.success(c.fechada ? 'Consultoria reaberta.' : 'Consultoria fechada.');
      await loadConsultorias();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao atualizar status da consultoria.'));
    }
  }

  function exportIcal() {
    safeOpenNewTab('/api/v1/consultorias/ics');
  }

  $: if (autoReloadEnabled && statusFilter !== lastLoadedStatusFilter) {
    lastLoadedStatusFilter = statusFilter;
    void loadConsultorias();
  }

  onMount(() => {
    lastLoadedStatusFilter = statusFilter;
    autoReloadEnabled = true;
    void loadConsultorias();
  });
</script>

<svelte:head>
  <title>Consultoria Online | VTUR</title>
</svelte:head>

<PageHeader
  title="Consultoria Online"
  subtitle="Gerencie agendamentos de consultoria"
  color="operacao"
  actions={[
    { label: 'Nova Consultoria', onClick: openCreate, variant: 'primary', icon: Plus }
  ]}
/>

<div class="space-y-4">
  <!-- Mobile: botão de filtros -->
  <div class="mb-4 sm:hidden">
    <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
      <SlidersHorizontal size={16} class="mr-2" />
      Filtros
      {#if statusFilter !== ''}
        <span class="ml-2 inline-flex h-2 w-2 rounded-full bg-operacao-500"></span>
      {/if}
    </Button>
  </div>

  <!-- Filtros -->
  <Card class="hidden sm:block">
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-sm font-medium text-slate-600">Filtrar por status:</span>
      {#each statusOptions as opt}
        <Button
          variant={statusFilter === opt.value ? 'primary' : 'outline'}
          size="sm"
          class_name="rounded-full"
          on:click={() => { statusFilter = opt.value; }}
        >
          {opt.label}
        </Button>
      {/each}
      <div class="ml-auto flex items-center gap-2">
        <span class="text-sm text-slate-500">{consultorias.length} registro(s)</span>
        <Button
          variant="ghost"
          size="xs"
          disabled={loading}
          title="Atualizar"
          on:click={loadConsultorias}
        >
          <RefreshCw size={15} class={loading ? 'animate-spin' : ''} />
        </Button>
        <Button
          variant="ghost"
          size="xs"
          title="Exportar iCal"
          on:click={exportIcal}
        >
          <Download size={15} />
        </Button>
      </div>
    </div>
  </Card>

  <BottomSheet bind:open={showFilterSheet} title="Filtrar Consultorias">
    <div class="space-y-4">
      <span class="text-sm font-medium text-slate-600">Filtrar por status:</span>
      <div class="flex flex-col gap-2">
        {#each statusOptions as opt}
          <Button
            variant={statusFilter === opt.value ? 'primary' : 'outline'}
            size="sm"
            class_name="rounded-full justify-start"
            on:click={() => { statusFilter = opt.value; }}
          >
            {opt.label}
          </Button>
        {/each}
      </div>
    </div>
    <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
      Aplicar filtros
    </Button>
  </BottomSheet>

  <!-- Lista -->
  {#if loading}
    <LoadingState />
  {:else if consultorias.length === 0}
    <EmptyState
      title="Nenhuma consultoria encontrada"
      message="Clique em 'Nova Consultoria' para agendar a primeira."
      icon={Video}
    />
  {:else}
    <div class="space-y-2">
      {#each consultorias as c (c.id)}
        <Card>
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold text-slate-900">{c.cliente_nome}</span>
                <Badge color={c.fechada ? 'gray' : 'teal'} dot>
                  {c.fechada ? 'Fechada' : 'Aberta'}
                </Badge>
                {#if c.destino}
                  <span class="text-sm text-slate-500">— {c.destino}</span>
                {/if}
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                <span class="flex items-center gap-1">
                  <Calendar size={14} />
                  {formatDataHora(c.data_hora)}
                </span>
                <span>{c.quantidade_pessoas} pessoa(s)</span>
                {#if c.taxa_consultoria}
                  <span>{formatCurrency(c.taxa_consultoria)}</span>
                {/if}
                {#if c.lembrete}
                  <span class="rounded-sm bg-slate-100 px-2 py-0.5 text-xs">Lembrete: {c.lembrete}</span>
                {/if}
              </div>
              {#if c.notas}
                <p class="mt-1 line-clamp-2 text-sm text-slate-500">{c.notas}</p>
              {/if}
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="primary" on:click={() => openEdit(c)}>
                Editar
              </Button>
              <Button
                size="sm"
                variant="secondary"
                color={c.fechada ? 'green' : 'orange'}
                on:click={() => toggleFechada(c)}
              >
                {c.fechada ? 'Reabrir' : 'Fechar'}
              </Button>
            </div>
          </div>
        </Card>
      {/each}
    </div>
  {/if}
</div>

<!-- Modal Nova/Editar Consultoria -->
<Dialog
  bind:open={showModal}
  title={editingId ? 'Editar Consultoria' : 'Nova Consultoria'}
  size="lg"
  color="operacao"
  onCancel={closeModal}
>
  <form
    on:submit|preventDefault={saveConsultoria}
    class="space-y-4"
  >
    <FieldInput
      id="cliente_nome"
      label="Nome do Cliente"
      bind:value={form.cliente_nome}
      placeholder="Nome do cliente"
      required
    />

    <FieldInput
      id="data_hora"
      label="Data e Hora"
      type="datetime-local"
      bind:value={form.data_hora}
      required
    />

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FieldSelect
        id="lembrete"
        label="Lembrete"
        bind:value={form.lembrete}
        options={lembreteOptions}
        placeholder={null}
      />
      <FieldInput
        id="qtd_pessoas"
        label="Qtd. Pessoas"
        type="number"
        bind:value={form.quantidade_pessoas}
        min="1"
      />
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <CidadeDestinoAutocomplete
        id="destino"
        label="Destino"
        bind:value={form.destino}
        placeholder="Ex: Paris, Miami..."
        endpoint="/api/v1/orcamentos/cidades-busca"
      />
      <FieldInput
        id="taxa"
        label="Taxa de Consultoria (R$)"
        type="number"
        bind:value={form.taxa_consultoria}
        min="0"
        step="0.01"
      />
    </div>

    <FieldTextarea
      id="notas"
      label="Notas"
      bind:value={form.notas}
      rows={3}
      placeholder="Observações sobre a consultoria..."
    />

    <div class="flex justify-end gap-2 border-t pt-3">
      <Button type="button" variant="secondary" on:click={closeModal} disabled={saving}>
        <X size={16} class="mr-1" />
        Cancelar
      </Button>
      <Button type="submit" variant="primary" color="operacao" loading={saving}>
        {editingId ? 'Salvar Alterações' : 'Criar Consultoria'}
      </Button>
    </div>
  </form>
</Dialog>
