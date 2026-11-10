<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import {
    BottomSheet,
    FieldInput,
    FieldTextarea,
    FieldCheckbox,
    LoadingState
  } from '$lib/components/ui';
  import KPICard from '$lib/components/kpis/KPICard.svelte';
  import { diffDaysISODate, formatISODateBR, todayISODateLocal, toISODateLocal } from '$lib/date';
  import { toast } from '$lib/stores/ui';
  import { confirmAction } from '$lib/stores/confirm';
  import { apiDelete, apiGet, apiPatch, apiPost, isCanceledApiError } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';
  import {
    CalendarDays,
    Clock3,
    Loader2,
    Plus,
    RefreshCw,
    Search,
    SlidersHorizontal,
    UserRound
  } from '$lib/icons';

  type AgendaItem = {
    id: string;
    title: string;
    start: string;
    end: string | null;
    descricao: string | null;
    allDay: boolean;
    source?: 'evento' | 'birthday';
  };

  type EventForm = {
    titulo: string;
    startDate: string;
    endDate: string;
    allDay: boolean;
    startTime: string;
    endTime: string;
    descricao: string;
  };

  type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';

  type CalendarEventInput = {
    id: string;
    title: string;
    start: string;
    end?: string;
    allDay: boolean;
    editable: boolean;
    backgroundColor: string;
    borderColor: string;
    extendedProps: {
      descricao: string | null;
      source: AgendaItem['source'];
    };
  };

  type CalendarEventLike = {
    id?: string;
    allDay: boolean;
    start: Date | null;
    end: Date | null;
  };

  type CalendarController = {
    changeView: (view: CalendarView) => void;
    removeAllEvents: () => void;
    addEventSource: (events: CalendarEventInput[]) => void;
    render: () => void;
  };

  type CalendarDatesSetInfo = {
    start: Date;
    end: Date;
  };

  type CalendarSelectInfo = {
    startStr: string;
    endStr?: string;
    allDay: boolean;
  };

  type CalendarDateClickInfo = {
    dateStr: string;
    allDay: boolean;
  };

  type CalendarEventClickInfo = {
    event: {
      id: string;
    };
  };

  type CalendarEventMutationInfo = {
    event: CalendarEventLike;
    revert: () => void;
  };

  const listColumns = [
    { key: 'title', label: 'Assunto', sortable: true },
    { key: 'sourceLabel', label: 'Origem', sortable: true },
    { key: 'dateLabel', label: 'Data', sortable: true },
    { key: 'descricao', label: 'Descricao', sortable: true }
  ];

  const DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const todayIso = todayISODateLocal();

  const defaultEventForm = (): EventForm => ({
    titulo: '',
    startDate: todayIso,
    endDate: todayIso,
    allDay: true,
    startTime: '09:00',
    endTime: '10:00',
    descricao: ''
  });

  let calendarEl: HTMLElement;
  let calendar: CalendarController | null = null;
  let loading = true;
  let refreshing = false;
  let items: AgendaItem[] = [];
  let visibleRange = { inicio: todayIso, fim: todayIso };
  let searchQuery = '';
  $: normalizedSearchQuery = searchQuery.trim().toLowerCase();
  let showFilterSheet = false;
  let currentView: CalendarView = 'timeGridDay';
  let initializingCalendar = false;
  let rangeRequestSeq = 0;
  let rangeAbortController: AbortController | null = null;

  function changeView(view: CalendarView) {
    currentView = view;
    calendar?.changeView(view);
  }

  let eventModalOpen = false;
  let eventLoading = false;
  let eventSaving = false;
  let selectedEventId: string | null = null;
  let selectedEventSource: AgendaItem['source'] = 'evento';
  let eventForm = defaultEventForm();

  function formatDate(date: Date) {
    return toISODateLocal(date);
  }

  function formatLocalDateTime(date: Date) {
    return `${formatDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function formatDateTimeLabel(value?: string | null, allDay = false) {
    if (!value) return '-';
    if (allDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return formatISODateBR(value);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

    return (allDay ? DATE_FORMATTER : DATE_TIME_FORMATTER).format(parsed);
  }

  function splitDateTime(value?: string | null) {
    if (!value) return { date: todayIso, time: '09:00' };
    if (!value.includes('T')) return { date: value, time: '09:00' };
    const [date, time] = value.split('T');
    return { date, time: time.slice(0, 5) };
  }

  function toCalendarEvent(item: AgendaItem): CalendarEventInput {
    const isBirthday = item.source === 'birthday' || item.id.startsWith('birthday:');
    return {
      id: item.id,
      title: item.title,
      start: item.start,
      end: item.end || undefined,
      allDay: item.allDay,
      editable: !isBirthday,
      backgroundColor: isBirthday ? '#f59e0b' : '#0f766e',
      borderColor: isBirthday ? '#d97706' : '#0f766e',
      extendedProps: {
        descricao: item.descricao,
        source: item.source || (isBirthday ? 'birthday' : 'evento')
      }
    };
  }

  async function syncCalendarEvents() {
    if (!calendar) return;
    calendar.removeAllEvents();
    calendar.addEventSource(items.map(toCalendarEvent));
  }

  async function loadRange(inicio: string, fim: string, silent = false) {
    const requestSeq = ++rangeRequestSeq;
    rangeAbortController?.abort();
    const controller = new AbortController();
    rangeAbortController = controller;
    if (!silent) loading = true;
    refreshing = true;

    try {
      const payload = await apiGet<{ items?: AgendaItem[] }>(
        '/api/v1/agenda/range',
        { inicio, fim },
        controller.signal,
        60_000
      );
      if (requestSeq !== rangeRequestSeq) return;
      visibleRange = { inicio, fim };
      items = Array.isArray(payload?.items) ? payload.items : [];
      await syncCalendarEvents();
    } catch (error: unknown) {
      if (isCanceledApiError(error)) return;
      if (requestSeq !== rangeRequestSeq) return;
      toast.error(toUserMessage(error, 'Erro ao carregar agenda.'));
      items = [];
      await syncCalendarEvents();
    } finally {
      if (requestSeq === rangeRequestSeq) {
        loading = false;
        refreshing = false;
        if (rangeAbortController === controller) {
          rangeAbortController = null;
        }
      }
    }
  }

  onDestroy(() => {
    rangeAbortController?.abort();
  });

  async function initializeCalendar() {
    if (!calendarEl || calendar || initializingCalendar) return;
    initializingCalendar = true;

    try {
      const [{ Calendar }, interactionPlugin, dayGridPlugin, timeGridPlugin, ptBrLocale] =
        await Promise.all([
          import('@fullcalendar/core'),
          import('@fullcalendar/interaction'),
          import('@fullcalendar/daygrid'),
          import('@fullcalendar/timegrid'),
          import('@fullcalendar/core/locales/pt-br')
        ]);

      const isMobile = window.innerWidth < 640;
      currentView = isMobile ? 'timeGridDay' : 'dayGridMonth';

      calendar = new Calendar(calendarEl, {
        plugins: [dayGridPlugin.default, timeGridPlugin.default, interactionPlugin.default],
        locale: ptBrLocale.default,
        initialView: currentView,
        headerToolbar: isMobile
          ? {
              left: 'prev',
              center: 'title',
              right: 'next'
            }
          : {
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
        footerToolbar: false,
        height: 'auto',
        editable: true,
        selectable: true,
        dayMaxEvents: true,
        datesSet: async (info: CalendarDatesSetInfo) => {
          const start = formatDate(info.start);
          const endDate = new Date(info.end.getTime());
          endDate.setDate(endDate.getDate() - 1);
          const end = formatDate(endDate);
          await loadRange(start, end, true);
        },
        select: (info: CalendarSelectInfo) => {
          openCreateModal({
            startDate: info.startStr.split('T')[0],
            endDate: (info.endStr || info.startStr).split('T')[0],
            allDay: info.allDay,
            startTime: info.allDay ? '09:00' : info.startStr.split('T')[1]?.slice(0, 5) || '09:00',
            endTime: info.allDay ? '10:00' : info.endStr?.split('T')[1]?.slice(0, 5) || '10:00'
          });
        },
        dateClick: (info: CalendarDateClickInfo) => {
          openCreateModal({
            startDate: info.dateStr.split('T')[0],
            endDate: info.dateStr.split('T')[0],
            allDay: info.allDay,
            startTime: '09:00',
            endTime: '10:00'
          });
        },
        eventClick: (info: CalendarEventClickInfo) => {
          const found = items.find((item) => item.id === info.event.id);
          if (!found) return;
          openExistingEvent(found);
        },
        eventDrop: async (info: CalendarEventMutationInfo) => {
          try {
            await updateFromCalendarEvent(info.event);
            toast.success('Evento reposicionado.');
          } catch (error: unknown) {
            info.revert();
            toast.error(toUserMessage(error, 'Erro ao mover evento.'));
          }
        },
        eventResize: async (info: CalendarEventMutationInfo) => {
          try {
            await updateFromCalendarEvent(info.event);
            toast.success('Periodo atualizado.');
          } catch (error: unknown) {
            info.revert();
            toast.error(toUserMessage(error, 'Erro ao atualizar evento.'));
          }
        }
      });

      calendar.render();
    } catch (error: unknown) {
      toast.error(toUserMessage(error, 'Erro ao carregar calendario.'));
      loading = false;
    } finally {
      initializingCalendar = false;
    }
  }

  function eventToPayload(event: CalendarEventLike) {
    const allDay = Boolean(event.allDay);
    const startDate = event.start ? formatDate(event.start) : todayIso;
    let endDate = event.end ? formatDate(event.end) : startDate;

    if (allDay && event.end) {
      const adjusted = new Date(event.end.getTime());
      adjusted.setDate(adjusted.getDate() - 1);
      endDate = formatDate(adjusted);
    }

    return {
      start_date: startDate,
      end_date: endDate,
      start_at: !allDay && event.start ? formatLocalDateTime(event.start) : null,
      end_at: !allDay && event.end ? formatLocalDateTime(event.end) : null,
      all_day: allDay
    };
  }

  async function updateFromCalendarEvent(event: CalendarEventLike) {
    if (String(event.id || '').startsWith('birthday:')) {
      throw new Error('Aniversarios sao somente leitura.');
    }

    await apiPatch(
      `/api/v1/agenda/update?id=${encodeURIComponent(String(event.id))}`,
      eventToPayload(event)
    );

    await loadRange(visibleRange.inicio, visibleRange.fim, true);
  }

  function openCreateModal(preset: Partial<EventForm> = {}) {
    selectedEventId = null;
    selectedEventSource = 'evento';
    eventForm = {
      ...defaultEventForm(),
      ...preset
    };
    eventModalOpen = true;
  }

  function openExistingEvent(item: AgendaItem) {
    const start = splitDateTime(item.start);
    const end = splitDateTime(item.end || item.start);
    selectedEventId = item.id;
    selectedEventSource = item.source || (item.id.startsWith('birthday:') ? 'birthday' : 'evento');
    eventForm = {
      titulo: item.title,
      startDate: start.date,
      endDate: end.date || start.date,
      allDay: item.allDay,
      startTime: start.time || '09:00',
      endTime: end.time || '10:00',
      descricao: item.descricao || ''
    };
    eventModalOpen = true;
  }

  async function saveEvent() {
    if (!eventForm.titulo.trim()) {
      toast.error('Informe o titulo do evento.');
      return;
    }

    if (selectedEventSource === 'birthday') {
      toast.error('Aniversarios sao somente leitura.');
      return;
    }

    eventSaving = true;
    try {
      const body = {
        titulo: eventForm.titulo,
        descricao: eventForm.descricao || null,
        start_date: eventForm.startDate,
        end_date: eventForm.endDate || eventForm.startDate,
        start_at: eventForm.allDay ? null : `${eventForm.startDate}T${eventForm.startTime}`,
        end_at: eventForm.allDay
          ? null
          : `${eventForm.endDate || eventForm.startDate}T${eventForm.endTime}`,
        all_day: eventForm.allDay
      };

      if (selectedEventId) {
        await apiPatch(`/api/v1/agenda/update?id=${encodeURIComponent(selectedEventId)}`, body);
      } else {
        await apiPost('/api/v1/agenda/create', body);
      }

      toast.success(selectedEventId ? 'Evento atualizado.' : 'Evento criado.');
      eventModalOpen = false;
      eventForm = defaultEventForm();
      selectedEventId = null;
      await loadRange(visibleRange.inicio, visibleRange.fim, true);
    } catch (error: unknown) {
      toast.error(toUserMessage(error, 'Erro ao salvar evento.'));
    } finally {
      eventSaving = false;
    }
  }

  async function deleteEvent() {
    if (!selectedEventId) return;
    if (!(await confirmAction('Deseja excluir este evento?'))) return;

    try {
      await apiDelete('/api/v1/agenda/delete', { id: selectedEventId });
      toast.success('Evento excluido.');
      eventModalOpen = false;
      selectedEventId = null;
      eventForm = defaultEventForm();
      await loadRange(visibleRange.inicio, visibleRange.fim, true);
    } catch (error: unknown) {
      toast.error(toUserMessage(error, 'Erro ao excluir evento.'));
    }
  }

  onMount(() => {
    void initializeCalendar();
  });

  $: if (calendarEl && !calendar) {
    void initializeCalendar();
  }

  $: visibleRows = items
    .map((item) => {
      const sourceLabel =
        item.source === 'birthday' || item.id.startsWith('birthday:') ? 'Aniversario' : 'Evento';
      return {
        ...item,
        sourceLabel,
        dateLabel: item.allDay
          ? formatDateTimeLabel(item.start, true)
          : `${formatDateTimeLabel(item.start)}${item.end ? ` ate ${formatDateTimeLabel(item.end)}` : ''}`
      };
    })
    .filter((row) => {
      if (!normalizedSearchQuery) return true;
      return [row.title, row.descricao || '', row.sourceLabel, row.dateLabel]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearchQuery);
    })
    .sort((left, right) => String(left.start).localeCompare(String(right.start)));

  $: resumo = items.reduce(
    (acc, item) => {
      if (String(item.id).startsWith('birthday:')) acc.aniversarios += 1;
      else acc.total += 1;
      if (String(item.start).startsWith(todayIso)) acc.hoje += 1;
      const diff = diffDaysISODate(todayIso, item.start);
      if (diff != null && diff >= 0 && diff <= 7) acc.proximos7 += 1;
      return acc;
    },
    { total: 0, aniversarios: 0, hoje: 0, proximos7: 0 }
  );
</script>

<svelte:head>
  <title>Agenda | VTUR</title>
</svelte:head>

<PageHeader
  title="Agenda"
  subtitle="Agenda operacional pessoal, com eventos reais e aniversarios da empresa como no fluxo legado."
  color="operacao"
  breadcrumbs={[{ label: 'Agenda' }]}
  actions={[
    {
      label: 'Atualizar',
      onClick: () => loadRange(visibleRange.inicio, visibleRange.fim, true),
      variant: 'secondary',
      icon: RefreshCw
    },
    { label: 'Novo evento', onClick: () => openCreateModal(), variant: 'primary', icon: Plus }
  ]}
/>

<div class="vtur-kpi-grid mb-6">
  <KPICard title="Eventos" value={resumo.total} color="operacao" icon={CalendarDays} />
  <KPICard title="Hoje" value={resumo.hoje} color="operacao" icon={Clock3} />
  <KPICard title="Proximos 7 dias" value={resumo.proximos7} color="operacao" icon={CalendarDays} />
  <KPICard title="Aniversarios" value={resumo.aniversarios} color="operacao" icon={UserRound} />
</div>

<Card color="operacao" padding="none" class="mb-6">
  <div
    class="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between"
  >
    <div>
      <h3 class="text-lg font-semibold text-slate-900">Calendario</h3>
      <p class="text-sm text-slate-500">
        Faixa atual: {visibleRange.inicio} ate {visibleRange.fim}
      </p>
    </div>
    <div class="flex items-center gap-2">
      {#if refreshing}
        <span
          class="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
        >
          <Loader2 size={14} class="animate-spin" />
          Atualizando
        </span>
      {/if}
      <Badge color="operacao" size="sm">Eventos pessoais</Badge>
      <Badge color="yellow" size="sm">Aniversarios</Badge>
    </div>
  </div>

  <!-- Seletor de visão customizado — só mobile, aparece ABAIXO do header do FC -->
  <div class="fc-mobile-view-switcher px-4 pt-1 pb-4 sm:hidden">
    <div class="view-switcher-bar">
      <Button
        type="button"
        variant="unstyled"
        class_name="view-btn {currentView === 'dayGridMonth' ? 'active' : ''}"
        on:click={() => changeView('dayGridMonth')}>Mês</Button
      >
      <Button
        type="button"
        variant="unstyled"
        class_name="view-btn {currentView === 'timeGridWeek' ? 'active' : ''}"
        on:click={() => changeView('timeGridWeek')}>Semana</Button
      >
      <Button
        type="button"
        variant="unstyled"
        class_name="view-btn {currentView === 'timeGridDay' ? 'active' : ''}"
        on:click={() => changeView('timeGridDay')}>Dia</Button
      >
    </div>
  </div>

  <div class="relative min-h-168">
    <div bind:this={calendarEl} class="min-h-168 p-4 md:p-5"></div>
    {#if loading}
      <div class="absolute inset-0 bg-white/80 backdrop-blur-xs">
        <LoadingState className="h-full" />
      </div>
    {/if}
  </div>
</Card>

<!-- Mobile: botão de filtros -->
<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Filtros
    {#if searchQuery.trim()}
      <span class="bg-operacao-500 ml-2 inline-flex h-2 w-2 rounded-full"></span>
    {/if}
  </Button>
</div>

<Card color="operacao">
  <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
    <div>
      <h3 class="text-lg font-semibold text-slate-900">Compromissos do periodo</h3>
      <p class="text-sm text-slate-500">Lista operacional do intervalo visivel no calendario.</p>
    </div>
    <div class="hidden w-full max-w-md sm:block">
      <FieldInput
        bind:value={searchQuery}
        icon={Search}
        placeholder="Buscar por assunto, data ou descricao"
        class_name="w-full"
      />
    </div>
  </div>

  <DataTable
    columns={listColumns}
    data={visibleRows}
    color="operacao"
    loading={false}
    searchable={false}
    filterable={false}
    exportable={false}
    onRowClick={(row) => openExistingEvent(row)}
    emptyMessage="Nenhum compromisso encontrado para o periodo"
  />
</Card>

<BottomSheet bind:open={showFilterSheet} title="Filtrar Compromissos">
  <div class="space-y-4">
    <FieldInput
      id="agenda-search-mobile"
      bind:value={searchQuery}
      icon={Search}
      placeholder="Buscar por assunto, data ou descricao"
      class_name="w-full"
    />
  </div>
  <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
    Aplicar filtros
  </Button>
</BottomSheet>

<Dialog
  bind:open={eventModalOpen}
  title={selectedEventId ? 'Detalhe do evento' : 'Novo evento'}
  color="operacao"
  size="lg"
  showCancel={true}
  cancelText="Fechar"
  showConfirm={false}
  loading={eventSaving}
  onCancel={() => {
    eventModalOpen = false;
    selectedEventId = null;
    selectedEventSource = 'evento';
    eventForm = defaultEventForm();
  }}
>
  {#if eventLoading}
    <LoadingState compact={true} />
  {:else if selectedEventSource === 'birthday'}
    <div class="space-y-4">
      <div class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <h4 class="font-semibold text-amber-900">{eventForm.titulo}</h4>
        <p class="mt-1 text-sm text-amber-700">
          Evento gerado automaticamente para aniversario da empresa.
        </p>
      </div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span class="block text-xs tracking-wide text-slate-400 uppercase">Data</span>
          <strong class="text-slate-900">{formatDateTimeLabel(eventForm.startDate, true)}</strong>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span class="block text-xs tracking-wide text-slate-400 uppercase">Descricao</span>
          <strong class="text-slate-900">{eventForm.descricao || 'Aniversario'}</strong>
        </div>
      </div>
    </div>
  {:else}
    <div class="space-y-5">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="md:col-span-2">
          <FieldInput
            id="agenda-title"
            label="Assunto"
            bind:value={eventForm.titulo}
            placeholder="Titulo do compromisso"
            class_name="w-full"
          />
        </div>

        <div class="md:col-span-2">
          <FieldTextarea
            id="agenda-description"
            label="Descricao"
            bind:value={eventForm.descricao}
            rows={4}
            placeholder="Detalhes do compromisso"
            class_name="w-full"
          />
        </div>

        <FieldInput
          id="agenda-start-date"
          label="Data inicial"
          type="date"
          bind:value={eventForm.startDate}
          class_name="w-full"
        />

        <FieldInput
          id="agenda-end-date"
          label="Data final"
          type="date"
          bind:value={eventForm.endDate}
          min={eventForm.startDate || null}
          class_name="w-full"
        />

        <div class="md:col-span-2">
          <FieldCheckbox
            id="agenda-allday"
            label="Dia inteiro"
            bind:checked={eventForm.allDay}
            color="operacao"
          />
        </div>

        {#if !eventForm.allDay}
          <FieldInput
            id="agenda-start-time"
            label="Inicio"
            type="time"
            bind:value={eventForm.startTime}
            class_name="w-full"
          />

          <FieldInput
            id="agenda-end-time"
            label="Fim"
            type="time"
            bind:value={eventForm.endTime}
            class_name="w-full"
          />
        {/if}
      </div>
    </div>
  {/if}

  <svelte:fragment slot="actions">
    {#if selectedEventSource !== 'birthday'}
      <Button variant="primary" loading={eventSaving} on:click={saveEvent}>
        {#if selectedEventId}
          Salvar evento
        {:else}
          Criar evento
        {/if}
      </Button>
      {#if selectedEventId}
        <Button variant="danger" on:click={deleteEvent}>Excluir</Button>
      {/if}
    {/if}
  </svelte:fragment>
</Dialog>
