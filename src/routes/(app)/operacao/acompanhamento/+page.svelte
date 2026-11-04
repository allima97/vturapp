<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import {
    BottomSheet,
    FieldCheckbox,
    FieldInput,
    FieldSelect,
    FieldTextarea,
    LoadingState
  } from '$lib/components/ui';
  import KPICard from '$lib/components/kpis/KPICard.svelte';
  import { toast } from '$lib/stores/ui';
  import {
    CalendarDays,
    ExternalLink,
    MessageCircle,
    RefreshCw,
    Search,
    SlidersHorizontal
  } from '$lib/icons';
  import { apiGet, apiPatch, isCanceledApiError } from '$lib/services/api';
  import { addDaysISODate, currentMonthRangeISODate, todayISODateLocal } from '$lib/date';
  import { formatDate as formatDateValue } from '$lib/utils/formatters';
  import { toUserMessage } from '$lib/utils/errors';
  import { createDebouncedReloader } from '$lib/utils/autoReload';

  // Perfil do usuário logado (para assinatura da mensagem)
  let userNome = '';
  let userAssinatura = '';

  async function loadUserProfile() {
    try {
      const sig = await apiGet<{ signature?: string | null; nome_completo?: string | null }>(
        '/api/v1/profile/signature'
      );
      userNome = String(sig?.nome_completo || '').trim();
      userAssinatura = String(sig?.signature || sig?.nome_completo || '').trim();
    } catch {
      // Silencioso — assinatura fica vazia
    }
  }

  function getSaudacao(): string {
    const hora = new Date().getHours();
    if (hora >= 5 && hora < 12) return 'Bom dia';
    if (hora >= 12 && hora < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function getPrimeiroNome(nomeCompleto: string): string {
    return (
      String(nomeCompleto || '')
        .trim()
        .split(/\s+/)[0] || nomeCompleto
    );
  }

  function buildMensagemFollowUp(clienteNome: string): string {
    const saudacao = getSaudacao();
    const primeiroNome = getPrimeiroNome(clienteNome);
    const assinatura = userAssinatura || userNome || '';
    return (
      `${saudacao} ${primeiroNome}, tudo bem?\n` +
      `Estou passando para saber como foi sua viagem. Espero que tenha corrido tudo bem!\n` +
      `Quando tiver um tempinho, ficarei muito grato se puder me enviar um feedback sobre sua experiência.\n` +
      `Muito obrigado!\n` +
      (assinatura ? assinatura : '')
    ).trim();
  }

  function getWhatsAppLink(item: FollowUpItem): string | null {
    const phone = sanitizePhone(item.cliente_whatsapp || item.cliente_telefone);
    if (!phone) return null;
    const texto = encodeURIComponent(buildMensagemFollowUp(item.cliente_nome));
    return `https://wa.me/${phone}?text=${texto}`;
  }

  function getEmailLink(item: FollowUpItem): string | null {
    const email = item.cliente_email || null;
    if (!email) return null;
    const assunto = encodeURIComponent('Como foi sua viagem?');
    const corpo = encodeURIComponent(buildMensagemFollowUp(item.cliente_nome));
    return `mailto:${email}?subject=${assunto}&body=${corpo}`;
  }

  type FollowUpItem = {
    row_key?: string;
    id: string;
    venda_id: string | null;
    cliente_id: string | null;
    cliente_nome: string;
    cliente_email: string | null;
    cliente_whatsapp: string | null;
    cliente_telefone: string | null;
    destino_nome: string | null;
    data_inicio: string | null;
    data_fim: string | null;
    data_embarque: string | null;
    data_final: string | null;
    vendedor_id: string | null;
    follow_up_fechado: boolean;
    follow_up_text: string | null;
    updated_at: string | null;
  };

  const columns = [
    { key: 'cliente_nome', label: 'Cliente', sortable: true },
    { key: 'destino_nome', label: 'Destino', sortable: true },
    { key: 'retornoLabel', label: 'Retorno', sortable: true },
    { key: 'embarqueLabel', label: 'Embarque', sortable: true },
    { key: 'statusLabel', label: 'Status', sortable: true },
    { key: 'followUpResumo', label: 'Follow-up', sortable: true }
  ];

  const todayIso = todayISODateLocal();

  function getDefaultFollowUpRange() {
    const monthRange = currentMonthRangeISODate();
    return {
      inicio: monthRange.inicio,
      fim: addDaysISODate(todayISODateLocal(), -1)
    };
  }

  function resetFilters() {
    const defaultRange = getDefaultFollowUpRange();
    searchQuery = '';
    statusFilter = 'abertos';
    inicio = defaultRange.inicio;
    fim = defaultRange.fim;
  }

  const defaultFollowUpRange = getDefaultFollowUpRange();

  let loading = true;
  let saving = false;
  let errorMessage: string | null = null;
  let searchQuery = '';
  let statusFilter = 'abertos';
  let inicio = defaultFollowUpRange.inicio;
  let fim = defaultFollowUpRange.fim;
  let items: FollowUpItem[] = [];
  let autoReloadEnabled = false;
  let lastAutoReloadKey = '';
  let showFilterSheet = false;
  let followUpsRequestSeq = 0;
  let followUpsAbortController: AbortController | null = null;
  const autoReload = createDebouncedReloader(() => loadFollowUps(), 250);
  $: normalizedSearchQuery = searchQuery.trim().toLowerCase();

  let modalOpen = false;
  let selectedItem: FollowUpItem | null = null;
  let form = {
    texto: '',
    fechado: false
  };

  function formatDate(value?: string | null) {
    return formatDateValue(value);
  }

  function sanitizePhone(value?: string | null) {
    return String(value || '').replace(/\D/g, '');
  }

  async function loadFollowUps() {
    const requestSeq = ++followUpsRequestSeq;
    followUpsAbortController?.abort();
    const controller = new AbortController();
    followUpsAbortController = controller;
    loading = true;
    errorMessage = null;

    try {
      const payload = await apiGet<{ items?: FollowUpItem[] }>(
        '/api/v1/dashboard/follow-ups',
        {
          inicio,
          fim,
          status: statusFilter
        },
        controller.signal,
        90_000
      );
      if (requestSeq !== followUpsRequestSeq) return;
      items = Array.isArray(payload?.items) ? payload.items : [];
    } catch (error) {
      if (isCanceledApiError(error)) return;
      if (requestSeq !== followUpsRequestSeq) return;
      errorMessage = toUserMessage(error, 'Erro ao carregar follow-ups.');
      items = [];
    } finally {
      if (requestSeq === followUpsRequestSeq) {
        loading = false;
        if (followUpsAbortController === controller) {
          followUpsAbortController = null;
        }
      }
    }
  }

  onMount(() => {
    void (async () => {
      await Promise.all([loadFollowUps(), loadUserProfile()]);
      lastAutoReloadKey = buildAutoReloadKey();
      autoReloadEnabled = true;
    })();
  });

  onDestroy(() => {
    followUpsAbortController?.abort();
    autoReload.cancel();
  });

  function buildAutoReloadKey() {
    return [inicio, fim, statusFilter].join('|');
  }

  function scheduleAutoReload() {
    autoReload.schedule();
  }

  $: rows = items
    .map((item) => ({
      ...item,
      retornoLabel: formatDate(item.data_fim || item.data_final),
      embarqueLabel: formatDate(item.data_inicio || item.data_embarque),
      statusLabel: item.follow_up_fechado ? 'Fechado' : 'Aberto',
      followUpResumo: item.follow_up_text?.trim() ? item.follow_up_text.trim() : 'Sem anotacao'
    }))
    .filter((item) => {
      if (!normalizedSearchQuery) return true;
      return [item.cliente_nome, item.destino_nome || '', item.followUpResumo, item.statusLabel]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearchQuery);
    });

  $: resumo = items.reduce(
    (acc, item) => {
      acc.total += 1;
      if (!item.follow_up_fechado && String(item.data_fim || item.data_final || '') < todayIso)
        acc.atrasados += 1;
      if (!String(item.follow_up_text || '').trim()) acc.semTexto += 1;
      if (item.follow_up_fechado) acc.fechados += 1;
      return acc;
    },
    { total: 0, atrasados: 0, semTexto: 0, fechados: 0 }
  );

  // O $: do modo legado só reage às variáveis escritas nesta linha (não enxerga dentro de
  // buildAutoReloadKey()). Por isso a mesma expressão da função fica aqui, idêntica.
  $: autoReloadKey = [inicio, fim, statusFilter].join('|');

  $: if (autoReloadEnabled && autoReloadKey !== lastAutoReloadKey) {
    lastAutoReloadKey = autoReloadKey;
    scheduleAutoReload();
  }

  function openItem(item: FollowUpItem) {
    selectedItem = item;
    form = {
      texto: item.follow_up_text || '',
      fechado: Boolean(item.follow_up_fechado)
    };
    modalOpen = true;
  }

  async function saveFollowUp() {
    if (!selectedItem) return;

    saving = true;
    try {
      await apiPatch(`/api/v1/viagens/${selectedItem.id}`, {
        follow_up_text: form.texto.trim() || null,
        follow_up_fechado: form.fechado
      });

      toast.success('Follow-up atualizado.');
      modalOpen = false;
      selectedItem = null;
      await loadFollowUps();
    } catch (error) {
      toast.error(toUserMessage(error, 'Erro ao salvar follow-up.'));
    } finally {
      saving = false;
    }
  }

  function currentWhatsAppLink(item: FollowUpItem) {
    return getWhatsAppLink(item);
  }
</script>

<svelte:head>
  <title>Follow-up | VTUR</title>
</svelte:head>

<PageHeader
  title="Follow-up"
  subtitle="Follow-up operacional derivado de viagens e vendas, respeitando escopo por perfil."
  color="operacao"
  breadcrumbs={[{ label: 'Follow-up' }]}
  actions={[{ label: 'Atualizar', onClick: loadFollowUps, variant: 'secondary', icon: RefreshCw }]}
/>

<div class="vtur-kpi-grid mb-6">
  <KPICard title="Itens no periodo" value={resumo.total} color="operacao" icon={CalendarDays} />
  <KPICard title="Atrasados" value={resumo.atrasados} color="operacao" icon={CalendarDays} />
  <KPICard title="Sem texto" value={resumo.semTexto} color="operacao" icon={Search} />
  <KPICard title="Fechados" value={resumo.fechados} color="operacao" icon={ExternalLink} />
</div>

<!-- Mobile: botão de filtros -->
<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Filtros
    {#if searchQuery.trim() || statusFilter !== 'abertos' || inicio || fim}
      <span class="bg-operacao-500 ml-2 inline-flex h-2 w-2 rounded-full"></span>
    {/if}
  </Button>
</div>

<Card color="operacao" class="mb-6 hidden sm:block">
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_repeat(3,minmax(0,1fr))]">
    <FieldInput
      id="follow-search"
      label="Busca"
      bind:value={searchQuery}
      class_name="w-full"
      placeholder="Cliente, destino ou texto do follow-up"
      icon={Search}
    />

    <FieldSelect
      id="follow-status"
      label="Status"
      bind:value={statusFilter}
      options={[
        { value: 'abertos', label: 'Abertos' },
        { value: 'todos', label: 'Todos' },
        { value: 'fechados', label: 'Fechados' }
      ]}
      placeholder={null}
      class_name="w-full"
    />

    <FieldInput
      id="follow-start"
      label="Inicio"
      type="date"
      bind:value={inicio}
      class_name="w-full"
    />

    <FieldInput
      id="follow-end"
      label="Fim"
      type="date"
      bind:value={fim}
      min={inicio || null}
      class_name="w-full"
    />
  </div>

  <div class="mt-4 flex flex-wrap gap-2">
    <Button variant="ghost" size="sm" on:click={resetFilters}>Limpar filtros</Button>
  </div>
</Card>

<BottomSheet bind:open={showFilterSheet} title="Filtrar acompanhamento">
  <div class="space-y-4">
    <FieldInput
      id="follow-search-mobile"
      label="Busca"
      bind:value={searchQuery}
      class_name="w-full"
      placeholder="Cliente, destino ou texto do follow-up"
      icon={Search}
    />
    <FieldSelect
      id="follow-status-mobile"
      label="Status"
      bind:value={statusFilter}
      options={[
        { value: 'abertos', label: 'Abertos' },
        { value: 'todos', label: 'Todos' },
        { value: 'fechados', label: 'Fechados' }
      ]}
      placeholder={null}
      class_name="w-full"
    />
    <FieldInput
      id="follow-start-mobile"
      label="Inicio"
      type="date"
      bind:value={inicio}
      class_name="w-full"
    />
    <FieldInput
      id="follow-end-mobile"
      label="Fim"
      type="date"
      bind:value={fim}
      min={inicio || null}
      class_name="w-full"
    />
  </div>
  <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}
    >Aplicar filtros</Button
  >
</BottomSheet>

<Card color="operacao">
  {#if loading}
    <LoadingState compact={true} />
  {:else if errorMessage}
    <div role="alert" class="py-8 text-sm text-red-600">{errorMessage}</div>
  {:else}
    <DataTable
      {columns}
      data={rows}
      color="operacao"
      loading={false}
      searchable={false}
      filterable={false}
      exportable={false}
      keyExtractor={(row) => row.row_key || `${row.id}:${row.cliente_id || row.cliente_nome}`}
      onRowClick={(row) => openItem(row)}
      emptyMessage="Nenhum follow-up encontrado para o periodo"
    />
  {/if}
</Card>

<Dialog
  bind:open={modalOpen}
  title="Detalhe do acompanhamento"
  color="operacao"
  size="lg"
  showCancel={true}
  cancelText="Fechar"
  showConfirm={false}
  loading={saving}
  onCancel={() => {
    modalOpen = false;
    selectedItem = null;
  }}
>
  {#if selectedItem}
    <div class="space-y-5">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span class="block text-xs tracking-wide text-slate-400 uppercase">Cliente</span>
          <strong class="text-slate-900">{selectedItem.cliente_nome}</strong>
          {#if selectedItem.destino_nome}
            <p class="mt-1 text-sm text-slate-600">{selectedItem.destino_nome}</p>
          {/if}
        </div>

        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span class="block text-xs tracking-wide text-slate-400 uppercase">Periodo da viagem</span
          >
          <strong class="text-slate-900">
            {formatDate(selectedItem.data_inicio || selectedItem.data_embarque)} ate {formatDate(
              selectedItem.data_fim || selectedItem.data_final
            )}
          </strong>
          <div class="mt-2 flex flex-wrap gap-2">
            {#if form.fechado}
              <Badge color="green" size="sm">Fechado</Badge>
            {:else}
              <Badge color="yellow" size="sm">Aberto</Badge>
            {/if}
          </div>
        </div>
      </div>

      <FieldTextarea
        id="follow-text"
        label="Texto do follow-up"
        bind:value={form.texto}
        class_name="w-full"
        rows={6}
        placeholder="Registre aqui o retorno operacional, feedback do cliente e proximos passos."
      />

      <div class="flex flex-wrap items-center gap-4">
        <FieldCheckbox
          label="Marcar follow-up como fechado"
          bind:checked={form.fechado}
          color="operacao"
        />
      </div>

      <!-- Preview da mensagem de contato -->
      <div class="rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
        <h4 class="mb-2 text-sm font-semibold text-slate-900">Mensagem sugerida</h4>
        <p class="text-sm leading-relaxed whitespace-pre-line text-slate-700">
          {buildMensagemFollowUp(selectedItem.cliente_nome)}
        </p>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <h4 class="mb-2 text-sm font-semibold text-slate-900">Contato e vinculos</h4>
        <div class="flex flex-wrap gap-2">
          {#if currentWhatsAppLink(selectedItem)}
            <Button
              href={currentWhatsAppLink(selectedItem) || undefined}
              target="_blank"
              rel="noopener noreferrer"
              variant="primary"
              size="sm"
            >
              <MessageCircle size={14} class="mr-1.5" />
              Enviar WhatsApp
            </Button>
          {/if}
          {#if getEmailLink(selectedItem)}
            <Button href={getEmailLink(selectedItem) || undefined} variant="secondary" size="sm">
              <ExternalLink size={14} class="mr-1.5" />
              Enviar E-mail
            </Button>
          {/if}
          {#if selectedItem.cliente_id}
            <Button href={`/clientes/${selectedItem.cliente_id}`} variant="secondary" size="sm">
              Cliente
            </Button>
          {/if}
          {#if selectedItem.venda_id}
            <Button href={`/vendas/${selectedItem.venda_id}`} variant="secondary" size="sm">
              Venda
            </Button>
          {/if}
          <Button href={`/operacao/viagens/${selectedItem.id}`} variant="secondary" size="sm">
            Viagem
          </Button>
        </div>
      </div>
    </div>
  {/if}

  <svelte:fragment slot="actions">
    <Button variant="primary" loading={saving} on:click={saveFollowUp}>Salvar follow-up</Button>
  </svelte:fragment>
</Dialog>
