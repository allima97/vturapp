<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { BottomSheet, Button, FieldSelect } from '$lib/components/ui';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import KPICard from '$lib/components/kpis/KPICard.svelte';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiGet, isCanceledApiError } from '$lib/services/api';
  import { parseISODateParts } from '$lib/date';
  import { CalendarDays, RefreshCw, Gift, SlidersHorizontal } from '$lib/icons';
  import { escapeHtml } from '$lib/utils/html';

  type Aniversariante = {
    id: string;
    nome: string;
    nascimento: string;
    telefone: string | null;
    whatsapp: string | null;
    email: string | null;
    aniversario_hoje: boolean;
    pessoa_tipo: 'cliente' | 'acompanhante';
    cliente_id?: string | null;
  };

  type AniversariantesResponse = {
    items?: Aniversariante[];
    hoje?: number;
    proximos?: number;
  };

  let aniversariantes: Aniversariante[] = [];
  let loading = true;
  let diasAfrente = 30;
  let diasAfrenteFiltro = '30';
  let showFilterSheet = false;
  let loadController: AbortController | null = null;
  let loadSeq = 0;

  const MONTH_NAME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    timeZone: 'UTC'
  });

  const columns = [
    {
      key: 'nome',
      label: 'Cliente',
      sortable: true,
      formatter: (v: string, row: Aniversariante) => {
        const badge = row.aniversario_hoje
          ? '<span class="ml-2 inline-flex rounded-full bg-pink-100 px-2 py-0.5 text-[11px] font-semibold text-pink-700">Hoje!</span>'
          : '';
        return `<div class="font-medium text-slate-900">${escapeHtml(v)}${badge}</div>`;
      }
    },
    {
      key: 'nascimento',
      label: 'Aniversário',
      sortable: true,
      width: '130px',
      formatter: (v: string) => {
        if (!v) return '-';
        const parts = parseISODateParts(v);
        if (!parts) return '-';
        const monthName = MONTH_NAME_FORMATTER.format(new Date(Date.UTC(2024, parts.month - 1, 1)));
        return `${String(parts.day).padStart(2, '0')} de ${monthName}`;
      }
    },
    {
      key: 'whatsapp',
      label: 'Contato',
      sortable: false,
      formatter: (v: string | null, row: Aniversariante) => {
        const contato = v || row.telefone;
        if (!contato) return `<span>${escapeHtml(row.email || '-')}</span>`;
        const phone = contato.replace(/\D/g, '');
        return `<a href="https://wa.me/${phone}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-green-600 hover:underline text-xs">${escapeHtml(contato)}</a>`;
      }
    }
  ];

  async function load() {
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    const seq = ++loadSeq;
    loading = true;
    try {
      const payload = await apiGet<AniversariantesResponse>(
        '/api/v1/dashboard/aniversariantes',
        {
          dias: diasAfrente
        },
        controller.signal
      );
      if (seq !== loadSeq) return;
      aniversariantes = payload.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar aniversariantes.'));
    } finally {
      if (seq === loadSeq) loading = false;
    }
  }

  onMount(load);

  onDestroy(() => {
    loadController?.abort();
  });

  $: diasAfrente = Number(diasAfrenteFiltro);

  $: aniversariantesStats = aniversariantes.reduce(
    (acc, aniversariante) => {
      if (aniversariante.aniversario_hoje) acc.hoje += 1;
      if (!aniversariante.nascimento) return acc;
      const birth = parseISODateParts(aniversariante.nascimento);
      if (!birth) return acc;
      const now = new Date();
      for (let i = 0; i <= 7; i++) {
        const check = new Date(now);
        check.setDate(now.getDate() + i);
        if (birth.month === check.getMonth() + 1 && birth.day === check.getDate()) {
          acc.proximos7 += 1;
          break;
        }
      }
      return acc;
    },
    { hoje: 0, proximos7: 0 }
  );
  $: hoje = aniversariantesStats.hoje;
  $: proximos7 = aniversariantesStats.proximos7;
</script>

<svelte:head>
  <title>Aniversariantes | VTUR</title>
</svelte:head>

<PageHeader
  title="Aniversariantes"
  subtitle="Clientes com aniversário nos próximos dias — oportunidade de relacionamento."
  color="clientes"
  breadcrumbs={[{ label: 'Aniversariantes' }]}
  actions={[{ label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw }]}
/>

<div class="vtur-kpi-grid vtur-kpi-grid-3 mb-6">
  <KPICard title="Aniversário hoje" value={hoje} color="clientes" icon={Gift} />
  <KPICard title="Próximos 7 dias" value={proximos7} color="clientes" icon={CalendarDays} />
  <KPICard
    title={`Próximos ${diasAfrente} dias`}
    value={aniversariantes.length}
    color="clientes"
    icon={CalendarDays}
  />
</div>

<!-- Mobile: botão de filtros -->
<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Filtros
    {#if diasAfrenteFiltro !== '30'}
      <span class="bg-clientes-500 ml-2 inline-flex h-2 w-2 rounded-full"></span>
    {/if}
  </Button>
</div>

<Card color="clientes" class="mb-6 hidden sm:block">
  <div class="max-w-xs">
    <FieldSelect
      id="dias-afrente"
      label="Mostrar próximos"
      bind:value={diasAfrenteFiltro}
      placeholder={null}
      options={[
        { value: '7', label: '7 dias' },
        { value: '15', label: '15 dias' },
        { value: '30', label: '30 dias' },
        { value: '60', label: '60 dias' },
        { value: '90', label: '90 dias' }
      ]}
      on:change={load}
    />
  </div>
</Card>

<BottomSheet bind:open={showFilterSheet} title="Filtrar Aniversariantes">
  <div class="space-y-4">
    <FieldSelect
      id="dias-afrente-mobile"
      label="Mostrar próximos"
      bind:value={diasAfrenteFiltro}
      placeholder={null}
      options={[
        { value: '7', label: '7 dias' },
        { value: '15', label: '15 dias' },
        { value: '30', label: '30 dias' },
        { value: '60', label: '60 dias' },
        { value: '90', label: '90 dias' }
      ]}
      on:change={load}
    />
  </div>
  <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
    Aplicar filtros
  </Button>
</BottomSheet>

<DataTable
  {columns}
  data={aniversariantes}
  color="clientes"
  {loading}
  title="Aniversariantes"
  searchable={true}
  emptyMessage="Nenhum aniversariante encontrado no período"
  onRowClick={(row) => goto(`/clientes/${row.id}`)}
/>
