<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Tabs from '$lib/components/ui/Tabs.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import { formatDate, formatYearMonthLabel } from '$lib/utils/formatters';
  import { toUserMessage } from '$lib/utils/errors';
  import { todayISODateLocal } from '$lib/date';
  import { toast } from '$lib/stores/ui';
  import { auth } from '$lib/stores/auth';
  import { apiGet, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { Calendar, ChevronLeft, ChevronRight, RefreshCw } from '$lib/icons';

  type EscalaDia = {
    id: string;
    usuario_id: string;
    data: string;
    tipo: string | null;
    hora_inicio: string | null;
    hora_fim: string | null;
    observacao: string | null;
  };

  type Usuario = {
    id: string;
    nome_completo: string | null;
    email: string | null;
  };

  type Feriado = { id: string; data: string; nome: string; tipo: string };

  type EscalasPayload = {
    dias?: EscalaDia[];
    usuarios?: Usuario[];
    feriados?: Feriado[];
  };

  const TIPO_CODIGO: Record<string, string> = {
    TRABALHO: 'T',
    PLANTAO: 'P',
    FOLGA: 'F',
    FERIAS: 'X',
    LICENCA: 'L',
    FERIADO: 'H'
  };

  const TIPO_COLOR: Record<string, string> = {
    TRABALHO: 'bg-green-100 text-green-700',
    PLANTAO: 'bg-blue-100 text-blue-700',
    FOLGA: 'bg-slate-100 text-slate-600',
    FERIAS: 'bg-amber-100 text-amber-700',
    LICENCA: 'bg-purple-100 text-purple-700',
    FERIADO: 'bg-red-100 text-red-700'
  };

  const TIPO_LABEL: Record<string, string> = {
    TRABALHO: 'Trabalho',
    PLANTAO: 'Plantão',
    FOLGA: 'Folga',
    FERIAS: 'Férias',
    LICENCA: 'Licença',
    FERIADO: 'Feriado'
  };

  let loading = true;
  let dias: EscalaDia[] = [];
  let diasEquipe: EscalaDia[] = [];
  let usuarios: Usuario[] = [];
  let feriados: Feriado[] = [];
  let activeTab = 'minha_escala';
  const loadGuard = createLoadGuard();

  let periodoAtual = todayISODateLocal().slice(0, 7);

  function getDaysInMonth(periodo: string) {
    const [year, month] = periodo.split('-').map(Number);
    const daysCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length: daysCount }, (_, i) => {
      const d = i + 1;
      const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return { date, dow: new Date(Date.UTC(year, month - 1, d)).getUTCDay(), day: d };
    });
  }

  function getDia(data: string): EscalaDia | null {
    return dias.find((d) => d.data === data) || null;
  }

  function getDiaEquipe(usuarioId: string, data: string): EscalaDia | null {
    return diasEquipe.find((d) => d.usuario_id === usuarioId && d.data === data) || null;
  }

  function isFeriado(data: string): Feriado | null {
    return feriados.find((f) => f.data === data) || null;
  }

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<EscalasPayload>(
        '/api/v1/parametros/escalas',
        { periodo: periodoAtual },
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      const userId = $auth.user?.id;
      diasEquipe = payload.dias || [];
      usuarios = payload.usuarios || [];
      dias = diasEquipe.filter((d) => d.usuario_id === userId);
      feriados = payload.feriados || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar escala.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function navMes(delta: number) {
    const [year, month] = periodoAtual.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    periodoAtual = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    load();
  }

  onMount(load);

  $: diasDoMes = getDaysInMonth(periodoAtual);
  $: periodoLabel = formatYearMonthLabel(periodoAtual);
  $: diasResumo = dias.reduce(
    (acc, dia) => {
      if (dia.tipo === 'TRABALHO' || dia.tipo === 'PLANTAO') acc.diasTrabalhados += 1;
      if (dia.tipo === 'FOLGA' || dia.tipo === 'FERIAS' || dia.tipo === 'LICENCA')
        acc.diasFolga += 1;
      return acc;
    },
    { diasTrabalhados: 0, diasFolga: 0 }
  );
  $: ({ diasTrabalhados, diasFolga } = diasResumo);
  $: feriadosDoPeriodo = feriados.reduce(
    (total, feriado) => total + (feriado.data.startsWith(periodoAtual) ? 1 : 0),
    0
  );
  $: usuarioId = $auth.user?.id || '';
  $: canViewEquipe = usuarios.some((usuario) => usuario.id !== usuarioId);
  $: tabItems = [
    { key: 'minha_escala', label: 'Minha Escala' },
    ...(canViewEquipe
      ? [{ key: 'escala_equipe', label: 'Escala da Equipe', badge: usuarios.length }]
      : [])
  ];
  $: if (!canViewEquipe && activeTab !== 'minha_escala') {
    activeTab = 'minha_escala';
  }
</script>

<svelte:head>
  <title>Minha Escala | VTUR</title>
</svelte:head>

<PageHeader
  title="Minha Escala"
  subtitle="Visualize sua escala de trabalho mensal e, quando disponível, a escala da equipe."
  breadcrumbs={[{ label: 'Perfil', href: '/perfil' }, { label: 'Minha Escala' }]}
  actions={[{ label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw }]}
/>

<Tabs className="mb-6" bind:activeKey={activeTab} items={tabItems} />

<Card class="mb-6">
  <div class="flex items-center justify-between gap-4">
    <Button variant="secondary" size="sm" ariaLabel="Mês anterior" on:click={() => navMes(-1)}>
      <ChevronLeft size={16} />
    </Button>
    <div class="flex items-center gap-3">
      <Calendar size={18} class="text-slate-500" />
      <span class="text-lg font-semibold text-slate-900 capitalize">{periodoLabel}</span>
    </div>
    <Button variant="secondary" size="sm" ariaLabel="Próximo mês" on:click={() => navMes(1)}>
      <ChevronRight size={16} />
    </Button>
  </div>
</Card>

{#if activeTab === 'minha_escala'}
  <div class="vtur-kpi-grid mb-6">
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
        <Calendar size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Dias trabalhados</p>
        <p class="text-2xl font-bold text-slate-900">{diasTrabalhados}</p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"
      >
        <Calendar size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Folgas / Ferias</p>
        <p class="text-2xl font-bold text-slate-900">{diasFolga}</p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-500">
        <Calendar size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Feriados no mes</p>
        <p class="text-2xl font-bold text-slate-900">{feriadosDoPeriodo}</p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
        <Calendar size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Sem registro</p>
        <p class="text-2xl font-bold text-slate-900">
          {diasDoMes.length - diasTrabalhados - diasFolga}
        </p>
      </div>
    </div>
  </div>
{/if}

{#if loading}
  <LoadingState />
{:else if activeTab === 'escala_equipe' && canViewEquipe}
  <Card padding="none">
    <div class="overflow-x-visible md:overflow-x-auto">
      <table class="table-mobile-cards min-w-full text-xs">
        <thead class="border-b border-slate-200 bg-slate-50">
          <tr>
            <th
              class="sticky left-0 z-10 min-w-[160px] bg-slate-50 px-4 py-3 text-left font-semibold text-slate-700"
              >Colaborador</th
            >
            {#each diasDoMes as { date, dow, day }}
              <th
                class="min-w-[36px] px-1 py-3 text-center font-medium {dow === 0 || dow === 6
                  ? 'text-red-500'
                  : 'text-slate-600'} {isFeriado(date) ? 'bg-red-50' : ''}"
                title={isFeriado(date)?.nome || ''}
              >
                <div>{day}</div>
                <div class="text-[10px] opacity-60">{'DSTQQSS'[dow]}</div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each usuarios as usuario}
            <tr class="hover:bg-slate-50/50">
              <td
                class="sticky left-0 z-10 border-r border-slate-100 bg-white px-4 py-2 font-medium text-slate-900"
              >
                {usuario.nome_completo || usuario.email || 'Usuário'}
              </td>
              {#each diasDoMes as { date, dow }}
                {@const registro = getDiaEquipe(usuario.id, date)}
                {@const feriado = isFeriado(date)}
                <td
                  class="px-0.5 py-1 text-center {dow === 0 || dow === 6 ? 'bg-slate-50/50' : ''}"
                >
                  {#if registro?.tipo}
                    <span
                      class="inline-flex h-6 w-6 items-center justify-center rounded-sm text-[10px] font-bold {TIPO_COLOR[
                        registro.tipo
                      ] || 'bg-slate-100 text-slate-600'}"
                    >
                      {TIPO_CODIGO[registro.tipo] || '?'}
                    </span>
                  {:else if feriado}
                    <span
                      class="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-red-100 text-[10px] font-bold text-red-600"
                      >H</span
                    >
                  {:else}
                    <span
                      class="inline-flex h-6 w-6 items-center justify-center rounded-sm text-[10px] text-slate-300"
                      >·</span
                    >
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="flex flex-wrap gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
      {#each Object.entries(TIPO_LABEL) as [key, label]}
        <span class="inline-flex items-center gap-1">
          <span
            class="inline-flex h-5 w-5 items-center justify-center rounded-sm text-[10px] font-bold {TIPO_COLOR[
              key
            ] || 'bg-slate-100'}"
          >
            {TIPO_CODIGO[key] || '?'}
          </span>
          {label}
        </span>
      {/each}
    </div>
  </Card>
{:else}
  <Card padding="none">
    <div class="overflow-x-visible md:overflow-x-auto">
      <table class="table-mobile-cards min-w-full text-sm">
        <thead class="border-b border-slate-200 bg-slate-50">
          <tr>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Data</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Dia</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Tipo</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Horário</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Observação</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each diasDoMes as { date, dow, day }}
            {@const registro = getDia(date)}
            {@const feriado = isFeriado(date)}
            <tr
              class="{dow === 0 || dow === 6 ? 'bg-slate-50/50' : ''} {feriado
                ? 'bg-red-50/30'
                : ''}"
            >
              <td class="px-4 py-2 text-slate-700">
                {formatDate(date)}
              </td>
              <td class="px-4 py-2 text-xs text-slate-500">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dow]}
                {#if feriado}
                  <span class="ml-1 text-red-500">({feriado.nome})</span>
                {/if}
              </td>
              <td class="px-4 py-2">
                {#if registro?.tipo}
                  <span
                    class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold {TIPO_COLOR[
                      registro.tipo
                    ] || 'bg-slate-100 text-slate-600'}"
                  >
                    {TIPO_LABEL[registro.tipo] || registro.tipo}
                  </span>
                {:else if feriado}
                  <span
                    class="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-600"
                    >Feriado</span
                  >
                {:else}
                  <span class="text-xs text-slate-300">—</span>
                {/if}
              </td>
              <td class="px-4 py-2 text-xs text-slate-600">
                {#if registro?.hora_inicio && registro?.hora_fim}
                  {registro.hora_inicio.slice(0, 5)} – {registro.hora_fim.slice(0, 5)}
                {:else}
                  —
                {/if}
              </td>
              <td class="px-4 py-2 text-xs text-slate-500">{registro?.observacao || '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="flex flex-wrap gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
      {#each Object.entries(TIPO_LABEL) as [key, label]}
        <span class="inline-flex items-center gap-1">
          <span
            class="inline-flex h-5 w-5 items-center justify-center rounded-sm text-[10px] font-bold {TIPO_COLOR[
              key
            ] || 'bg-slate-100'}"
          >
            {TIPO_CODIGO[key] || '?'}
          </span>
          {label}
        </span>
      {/each}
    </div>
  </Card>
{/if}
