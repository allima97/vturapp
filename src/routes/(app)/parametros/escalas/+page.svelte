<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import { mobileCardActions } from '$lib/actions/mobileCardActions';
  import MobileCardField from '$lib/components/ui/MobileCardField.svelte';
  import { FieldCheckbox, FieldInput, FieldSelect, LoadingState } from '$lib/components/ui';
  import { addMonthsISODate, monthRangeFromKey, todayISODateLocal } from '$lib/date';
  import { formatDate, formatYearMonthLabel } from '$lib/utils/formatters';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { Calendar, ChevronLeft, ChevronRight, Eraser, RefreshCw } from '$lib/icons';
  import { toUserMessage } from '$lib/utils/errors';

  type EscalaDia = {
    id: string;
    escala_mes_id: string;
    usuario_id: string;
    data: string;
    tipo: string | null;
    hora_inicio: string | null;
    hora_fim: string | null;
    observacao: string | null;
    usuario?: { nome_completo?: string | null } | null;
  };

  type HorarioUsuario = {
    usuario_id: string;
    auto_aplicar?: boolean | null;
    seg_inicio?: string | null;
    seg_fim?: string | null;
    ter_inicio?: string | null;
    ter_fim?: string | null;
    qua_inicio?: string | null;
    qua_fim?: string | null;
    qui_inicio?: string | null;
    qui_fim?: string | null;
    sex_inicio?: string | null;
    sex_fim?: string | null;
    sab_inicio?: string | null;
    sab_fim?: string | null;
    dom_inicio?: string | null;
    dom_fim?: string | null;
    feriado_inicio?: string | null;
    feriado_fim?: string | null;
  };

  type Usuario = { id: string; nome_completo: string | null; email: string | null };
  type EscalaMes = { id: string; periodo: string; status: string | null };
  type Feriado = { id: string; data: string; nome: string; tipo: string };

  const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const TIPOS_TRABALHO = new Set(['TRABALHO', 'PLANTAO']);
  const TIPOS_FOLGA = new Set(['FOLGA', 'FERIAS', 'LICENCA']);
  const HORARIO_KEYS = [
    { inicio: 'dom_inicio', fim: 'dom_fim' },
    { inicio: 'seg_inicio', fim: 'seg_fim' },
    { inicio: 'ter_inicio', fim: 'ter_fim' },
    { inicio: 'qua_inicio', fim: 'qua_fim' },
    { inicio: 'qui_inicio', fim: 'qui_fim' },
    { inicio: 'sex_inicio', fim: 'sex_fim' },
    { inicio: 'sab_inicio', fim: 'sab_fim' }
  ] as const;

  const TIPO_OPCOES = [
    { value: '', label: 'Sem registro' },
    { value: 'TRABALHO', label: 'Trabalho' },
    { value: 'PLANTAO', label: 'Plantão' },
    { value: 'FOLGA', label: 'Folga' },
    { value: 'FERIAS', label: 'Férias' },
    { value: 'LICENCA', label: 'Licença' },
    { value: 'FERIADO', label: 'Feriado' },
    { value: 'PENDENCIA', label: 'Pendência' }
  ];

  const TIPO_CODIGO: Record<string, string> = {
    TRABALHO: 'T',
    PLANTAO: 'P',
    FOLGA: 'F',
    FERIAS: 'X',
    LICENCA: 'L',
    FERIADO: 'H',
    PENDENCIA: '!'
  };

  const TIPO_COLOR: Record<string, string> = {
    TRABALHO: 'bg-green-100 text-green-700 ring-green-200',
    PLANTAO: 'bg-blue-100 text-blue-700 ring-blue-200',
    FOLGA: 'bg-slate-100 text-slate-700 ring-slate-200',
    FERIAS: 'bg-amber-100 text-amber-700 ring-amber-200',
    LICENCA: 'bg-purple-100 text-purple-700 ring-purple-200',
    FERIADO: 'bg-red-100 text-red-700 ring-red-200',
    PENDENCIA: 'bg-rose-100 text-rose-700 ring-rose-200'
  };

  const currentMonth = todayISODateLocal().slice(0, 7);

  let loading = true;
  let saving = false;
  let applying = false;
  let meses: EscalaMes[] = [];
  let dias: EscalaDia[] = [];
  let usuarios: Usuario[] = [];
  let feriados: Feriado[] = [];
  let horarios: HorarioUsuario[] = [];
  let mesAtualId = '';
  let periodoAtual = currentMonth;
  const loadGuard = createLoadGuard();

  let modalOpen = false;
  let selectedCell: { usuario: Usuario; data: string; registro?: EscalaDia | null } | null = null;
  let cellForm = { tipo: '', hora_inicio: '', hora_fim: '', observacao: '' };

  let multiAtivo = false;
  let multiUsuarioId = '';
  let multiDatas: string[] = [];
  let multiTipo = '';
  let multiInicio = '';
  let multiFim = '';
  let multiErro = '';

  $: canEdit =
    !$permissoes.ready ||
    $permissoes.isSystemAdmin ||
    permissoes.can('escalas', 'edit') ||
    permissoes.can('parametros', 'edit');

  function getDaysInMonth(periodo: string) {
    const range = monthRangeFromKey(periodo);
    if (!range) return [];
    const [year, month] = periodo.split('-').map(Number);
    const daysCount = Number(range.fim.slice(8, 10));
    return Array.from({ length: daysCount }, (_, index) => {
      const day = index + 1;
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      return { date, dow, day };
    });
  }

  function getDiaRegistro(usuarioId: string, data: string): EscalaDia | null {
    return dias.find((d) => d.usuario_id === usuarioId && d.data === data) || null;
  }

  function normalizeFeriadoDate(value: unknown) {
    return String(value || '')
      .trim()
      .slice(0, 10);
  }

  function getFeriados(data: string): Feriado[] {
    return feriados.filter((f) => normalizeFeriadoDate(f.data) === data);
  }

  function isFeriado(data: string): Feriado | null {
    return getFeriados(data)[0] || null;
  }

  function isFeriadoEspecial(data: string) {
    const [, mes, dia] = data.split('-').map(Number);
    return mes === 12 && (dia === 24 || dia === 31);
  }

  function formatFeriadosTitle(lista: Feriado[]) {
    const nomes = new Set<string>();
    for (const feriado of lista) {
      if (feriado.nome) nomes.add(feriado.nome);
    }
    return Array.from(nomes).join(' / ');
  }

  function buildFeriadosResumo(lista: Feriado[], periodo: string) {
    const map: Record<string, Feriado[]> = {};
    for (const feriado of lista) {
      const data = normalizeFeriadoDate(feriado.data);
      if (!data.startsWith(periodo)) continue;
      map[data] = [...(map[data] || []), { ...feriado, data }];
    }

    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, itens]) => ({
        data,
        nomes: formatFeriadosTitle(itens),
        origem: itens.some((item) => item.tipo !== 'nacional') ? 'local' : 'nacional'
      }));
  }

  function formatTimeRange(inicio?: string | null, fim?: string | null) {
    if (!inicio || !fim) return '';
    return `${inicio.slice(0, 5)}-${fim.slice(0, 5)}`;
  }

  function resolveHorarioAuto(usuarioId: string, data: string) {
    const horario = horarios.find((item) => item.usuario_id === usuarioId);
    if (!horario?.auto_aplicar) return null;

    const feriado = Boolean(isFeriado(data)) || isFeriadoEspecial(data);
    let inicio: string | null = null;
    let fim: string | null = null;
    if (feriado) {
      inicio = horario.feriado_inicio || null;
      fim = horario.feriado_fim || null;
    }

    if (!inicio || !fim) {
      const [year, month, day] = data.split('-').map(Number);
      const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      const keys = HORARIO_KEYS[dow];
      inicio = inicio || (horario[keys.inicio] as string | null) || null;
      fim = fim || (horario[keys.fim] as string | null) || null;
    }

    return inicio && fim ? { inicio: inicio.slice(0, 5), fim: fim.slice(0, 5) } : null;
  }

  async function ensureMes() {
    const payload = await apiPost<{ id: string }>('/api/v1/parametros/escalas', {
      action: 'ensure_mes',
      periodo: periodoAtual
    });
    return payload.id;
  }

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<{
        meses?: EscalaMes[];
        dias?: EscalaDia[];
        usuarios?: Usuario[];
        feriados?: Feriado[];
        horariosUsuario?: HorarioUsuario[];
      }>('/api/v1/parametros/escalas', { periodo: periodoAtual }, request.signal);
      if (!loadGuard.isCurrent(request.seq)) return;
      meses = payload.meses || [];
      dias = payload.dias || [];
      usuarios = payload.usuarios || [];
      feriados = payload.feriados || [];
      horarios = payload.horariosUsuario || [];

      const mes = meses.find((m) => m.periodo.startsWith(periodoAtual));
      mesAtualId = mes?.id || '';
      clearMulti(true);
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar escalas.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function openCell(usuario: Usuario, data: string) {
    if (!canEdit) return;
    const registro = getDiaRegistro(usuario.id, data);
    selectedCell = { usuario, data, registro };
    cellForm = {
      tipo: registro?.tipo || '',
      hora_inicio: registro?.hora_inicio?.slice(0, 5) || '',
      hora_fim: registro?.hora_fim?.slice(0, 5) || '',
      observacao: registro?.observacao || ''
    };
    modalOpen = true;
  }

  function validateSchedule(tipo: string, inicio: string, fim: string) {
    if (!TIPOS_TRABALHO.has(tipo)) return '';
    if ((inicio && !fim) || (!inicio && fim)) return 'Informe início e fim do horário.';
    return '';
  }

  async function saveCell() {
    if (!selectedCell) return;
    const validation = validateSchedule(cellForm.tipo, cellForm.hora_inicio, cellForm.hora_fim);
    if (validation) {
      toast.error(validation);
      return;
    }

    saving = true;
    try {
      let mesId = mesAtualId;
      if (!mesId) {
        mesId = await ensureMes();
        mesAtualId = mesId;
      }

      let horaInicio = cellForm.hora_inicio || null;
      let horaFim = cellForm.hora_fim || null;
      if (TIPOS_TRABALHO.has(cellForm.tipo) && !horaInicio && !horaFim) {
        const auto = resolveHorarioAuto(selectedCell.usuario.id, selectedCell.data);
        horaInicio = auto?.inicio || null;
        horaFim = auto?.fim || null;
      }

      await apiPost('/api/v1/parametros/escalas', {
        action: 'upsert_dia',
        escala_mes_id: mesId,
        usuario_id: selectedCell.usuario.id,
        data: selectedCell.data,
        tipo: cellForm.tipo || null,
        hora_inicio: horaInicio,
        hora_fim: horaFim,
        observacao: cellForm.observacao || null
      });
      toast.success('Escala salva.');
      modalOpen = false;
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar escala.'));
    } finally {
      saving = false;
    }
  }

  async function removeSelectedCell() {
    if (!selectedCell) return;
    cellForm = { tipo: '', hora_inicio: '', hora_fim: '', observacao: '' };
    await saveCell();
  }

  function toggleMulti(usuario: Usuario, data: string) {
    if (!multiAtivo || !canEdit) return;
    multiErro = '';
    if (multiUsuarioId && multiUsuarioId !== usuario.id) {
      multiErro = 'Selecione datas de apenas um colaborador por vez.';
      return;
    }

    if (multiDatas.includes(data)) {
      multiDatas = multiDatas.filter((item) => item !== data);
      if (multiDatas.length === 0) multiUsuarioId = '';
    } else {
      multiUsuarioId = usuario.id;
      multiDatas = [...multiDatas, data].sort();
    }
  }

  function clearMulti(keepType = false) {
    multiUsuarioId = '';
    multiDatas = [];
    multiErro = '';
    if (!keepType) {
      multiTipo = '';
      multiInicio = '';
      multiFim = '';
    }
  }

  async function applyMulti() {
    if (!multiUsuarioId || multiDatas.length === 0) {
      multiErro = 'Selecione ao menos uma data.';
      return;
    }
    const validation = validateSchedule(multiTipo, multiInicio, multiFim);
    if (validation) {
      multiErro = validation;
      return;
    }

    applying = true;
    try {
      let horaInicio = multiInicio || null;
      let horaFim = multiFim || null;
      if (TIPOS_TRABALHO.has(multiTipo) && !horaInicio && !horaFim) {
        const firstAuto = resolveHorarioAuto(multiUsuarioId, multiDatas[0]);
        horaInicio = firstAuto?.inicio || null;
        horaFim = firstAuto?.fim || null;
      }

      await apiPost('/api/v1/parametros/escalas', {
        action: 'apply_batch',
        escala_mes_id: mesAtualId || undefined,
        periodo: periodoAtual,
        usuario_id: multiUsuarioId,
        datas: multiDatas,
        tipo: multiTipo || null,
        hora_inicio: horaInicio,
        hora_fim: horaFim
      });
      toast.success('Escala aplicada em lote.');
      clearMulti(true);
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao aplicar escala.'));
    } finally {
      applying = false;
    }
  }

  function navMes(delta: number) {
    periodoAtual = addMonthsISODate(`${periodoAtual}-01`, delta).slice(0, 7);
    load();
  }

  function handleCellClick(usuario: Usuario, data: string) {
    if (multiAtivo) {
      toggleMulti(usuario, data);
      return;
    }
    openCell(usuario, data);
  }

  onMount(load);

  $: diasDoMes = getDaysInMonth(periodoAtual);
  $: periodoLabel = formatYearMonthLabel(periodoAtual);
  $: feriadosResumo = buildFeriadosResumo(feriados, periodoAtual);
  $: resumoPorUsuario = usuarios.reduce(
    (acc, usuario) => {
      const registros = dias.filter((dia) => dia.usuario_id === usuario.id);
      acc[usuario.id] = registros.reduce(
        (resumo, dia) => {
          if (dia.tipo && TIPOS_TRABALHO.has(dia.tipo)) resumo.trabalhados += 1;
          if (dia.tipo && TIPOS_FOLGA.has(dia.tipo)) resumo.folgas += 1;
          return resumo;
        },
        { trabalhados: 0, folgas: 0 }
      );
      return acc;
    },
    {} as Record<string, { trabalhados: number; folgas: number }>
  );
  $: multiUsuarioNome =
    usuarios.find((usuario) => usuario.id === multiUsuarioId)?.nome_completo ||
    usuarios.find((usuario) => usuario.id === multiUsuarioId)?.email ||
    'Nenhum';
</script>

<svelte:head>
  <title>Escalas | VTUR</title>
</svelte:head>

<PageHeader
  title="Escalas de Trabalho"
  subtitle="Atribua dias em lote ou ajuste células individuais da escala mensal."
  color="financeiro"
  breadcrumbs={[{ label: 'Parâmetros', href: '/parametros' }, { label: 'Escalas' }]}
  actions={[{ label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw }]}
/>

<Card color="financeiro" class="mb-6">
  <div class="grid gap-4 lg:grid-cols-[auto_minmax(240px,1fr)_auto] lg:items-center">
    <Button variant="secondary" size="sm" ariaLabel="Mês anterior" on:click={() => navMes(-1)}>
      <ChevronLeft size={16} />
    </Button>

    <div class="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
      <Calendar size={18} class="text-orange-600" />
      <span class="text-base font-semibold text-slate-900 capitalize">{periodoLabel}</span>
    </div>

    <Button variant="secondary" size="sm" ariaLabel="Próximo mês" on:click={() => navMes(1)}>
      <ChevronRight size={16} />
    </Button>
  </div>
</Card>

<Card color="financeiro" class="mb-6">
  <div
    class="grid gap-4 xl:grid-cols-[minmax(220px,1.2fr)_minmax(180px,0.8fr)_120px_120px_minmax(180px,0.8fr)_auto] xl:items-end"
  >
    <FieldCheckbox
      label="Seleção múltipla"
      helper="Clique em várias datas do mesmo colaborador."
      bind:checked={multiAtivo}
      disabled={!canEdit}
      color="financeiro"
      on:change={() => clearMulti(true)}
    />

    <FieldSelect
      id="escala-multi-tipo"
      label="Tipo"
      bind:value={multiTipo}
      options={TIPO_OPCOES}
      placeholder={null}
      disabled={!canEdit || !multiAtivo}
    />

    <FieldInput
      id="escala-multi-inicio"
      label="Início"
      type="time"
      bind:value={multiInicio}
      disabled={!canEdit || !multiAtivo}
    />

    <FieldInput
      id="escala-multi-fim"
      label="Fim"
      type="time"
      bind:value={multiFim}
      disabled={!canEdit || !multiAtivo}
    />

    <div class="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
      <div class="font-semibold text-slate-900">{multiUsuarioNome}</div>
      <div>{multiDatas.length} dia(s) selecionado(s)</div>
    </div>

    <div class="flex gap-2">
      <Button
        variant="secondary"
        color="financeiro"
        on:click={() => clearMulti(true)}
        disabled={!multiAtivo || multiDatas.length === 0}
      >
        Limpar
      </Button>
      <Button
        variant="primary"
        color="financeiro"
        on:click={applyMulti}
        disabled={!canEdit || !multiAtivo || multiDatas.length === 0}
        loading={applying}
      >
        Aplicar
      </Button>
    </div>
  </div>
  {#if multiErro}
    <p class="mt-3 text-sm font-semibold text-red-600">{multiErro}</p>
  {/if}
</Card>

{#if loading}
  <LoadingState />
{:else if usuarios.length === 0}
  <Card color="financeiro">
    <div class="py-12 text-center text-slate-500">
      <Calendar size={48} class="mx-auto mb-4 opacity-30" />
      <p>Nenhum usuário encontrado na equipe.</p>
    </div>
  </Card>
{:else}
  <Card color="financeiro" padding="none">
    <div class="overflow-x-visible md:overflow-x-auto">
      <table class="table-mobile-cards min-w-full text-xs">
        <thead class="border-b border-slate-200 bg-slate-50">
          <tr>
            <th
              class="sticky left-0 z-10 min-w-[180px] bg-slate-50 px-4 py-3 text-left font-semibold text-slate-700"
              >Colaborador</th
            >
            {#each diasDoMes as { date, dow, day }}
              {@const feriadosDia = getFeriados(date)}
              <th
                class="min-w-[42px] px-1 py-3 text-center font-medium {dow === 0 || dow === 6
                  ? 'text-red-500'
                  : 'text-slate-600'} {feriadosDia.length ? 'bg-red-50' : ''}"
                title={formatFeriadosTitle(feriadosDia)}
              >
                <div>{day}</div>
                <div class="text-[10px] opacity-60">{DIAS_SEMANA[dow]}</div>
              </th>
            {/each}
            <th class="min-w-[70px] px-2 py-3 text-center font-semibold text-slate-600">Trab.</th>
            <th class="min-w-[70px] px-2 py-3 text-center font-semibold text-slate-600">Folgas</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each usuarios as usuario}
            <tr class="hover:bg-slate-50/50" use:mobileCardActions={canEdit}>
              <td
                data-label="Colaborador"
                class="sticky left-0 z-10 border-r border-slate-100 bg-white px-4 py-2 font-medium text-slate-900"
              >
                {usuario.nome_completo || usuario.email || 'Usuário'}
              </td>
              {#each diasDoMes as { date, dow }}
                {@const registro = getDiaRegistro(usuario.id, date)}
                {@const feriadosDia = getFeriados(date)}
                {@const feriadoTitle = formatFeriadosTitle(feriadosDia)}
                {@const selected =
                  multiAtivo && multiUsuarioId === usuario.id && multiDatas.includes(date)}
                <td
                  data-label={formatDate(date)}
                  class="p-0.5 text-center {dow === 0 || dow === 6 ? 'bg-slate-50/50' : ''}"
                >
                  {#snippet conteudoDia()}
                    {#if registro?.tipo}
                      <span
                        class="inline-flex h-7 min-w-7 items-center justify-center rounded-sm px-1 text-[10px] font-bold ring-1 {TIPO_COLOR[
                          registro.tipo
                        ] || 'bg-slate-100 text-slate-600 ring-slate-200'}"
                      >
                        {TIPO_CODIGO[registro.tipo] || '?'}
                        {#if registro.hora_inicio && registro.hora_fim}
                          <span class="ml-0.5 hidden text-[9px] font-semibold xl:inline"
                            >{formatTimeRange(registro.hora_inicio, registro.hora_fim)}</span
                          >
                        {/if}
                      </span>
                    {:else if feriadosDia.length}
                      <span
                        class="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-red-100 text-[10px] font-bold text-red-600 ring-1 ring-red-200"
                        >H</span
                      >
                    {:else}
                      <span
                        class="inline-flex h-7 w-7 items-center justify-center rounded-sm text-[12px] text-slate-300"
                        >·</span
                      >
                    {/if}
                  {/snippet}
                  <MobileCardField>
                    <svelte:fragment slot="preview">
                      {@render conteudoDia()}
                    </svelte:fragment>
                    <Button
                      type="button"
                      variant="unstyled"
                      class_name="escala-dia-edit flex h-8 w-full items-center justify-center rounded-sm transition-colors hover:bg-orange-50 {selected
                        ? 'bg-orange-100 ring-2 ring-orange-300'
                        : ''}"
                      on:click={() => handleCellClick(usuario, date)}
                      ariaLabel={`Editar escala de ${usuario.nome_completo || usuario.email || 'usuário'} em ${formatDate(date)}`}
                      title={registro
                        ? `${registro.tipo}${registro.hora_inicio ? ' ' + formatTimeRange(registro.hora_inicio, registro.hora_fim) : ''}`
                        : feriadoTitle}
                    >
                      {@render conteudoDia()}
                    </Button>
                  </MobileCardField>
                </td>
              {/each}
              <td
                data-label="Trabalhados"
                class="px-2 py-2 text-center font-semibold text-slate-700"
                >{resumoPorUsuario[usuario.id]?.trabalhados || 0}</td
              >
              <td data-label="Folgas" class="px-2 py-2 text-center font-semibold text-slate-700"
                >{resumoPorUsuario[usuario.id]?.folgas || 0}</td
              >
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="flex flex-wrap gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
      {#each TIPO_OPCOES.filter((t) => t.value) as opt}
        <span class="inline-flex items-center gap-1">
          <span
            class="inline-flex h-5 w-5 items-center justify-center rounded-sm text-[10px] font-bold {TIPO_COLOR[
              opt.value
            ] || 'bg-slate-100'}"
          >
            {TIPO_CODIGO[opt.value] || '?'}
          </span>
          {opt.label}
        </span>
      {/each}
    </div>

    {#if feriadosResumo.length > 0}
      <div class="border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
        <div class="mb-2 font-semibold text-slate-800">Feriados do mês</div>
        <div class="flex flex-wrap gap-2">
          {#each feriadosResumo as item}
            <span
              class="inline-flex items-center gap-1 rounded-full border border-red-100 bg-red-50 px-2 py-1 text-red-700"
            >
              {formatDate(item.data)} · {item.nomes}
              <span class="text-red-500">({item.origem})</span>
            </span>
          {/each}
        </div>
      </div>
    {/if}
  </Card>
{/if}

<Dialog
  bind:open={modalOpen}
  title={selectedCell
    ? `${selectedCell.usuario.nome_completo || 'Usuário'} - ${formatDate(selectedCell.data)}`
    : 'Escala'}
  color="financeiro"
  size="md"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText="Salvar"
  loading={saving}
  onConfirm={saveCell}
  onCancel={() => (modalOpen = false)}
>
  <div class="space-y-4">
    <FieldSelect
      id="esc-tipo"
      label="Tipo"
      bind:value={cellForm.tipo}
      options={TIPO_OPCOES}
      placeholder={null}
    />
    {#if cellForm.tipo === 'TRABALHO' || cellForm.tipo === 'PLANTAO'}
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldInput id="esc-inicio" label="Início" type="time" bind:value={cellForm.hora_inicio} />
        <FieldInput id="esc-fim" label="Fim" type="time" bind:value={cellForm.hora_fim} />
      </div>
    {/if}
    <FieldInput
      id="esc-obs"
      label="Observação"
      bind:value={cellForm.observacao}
      placeholder="Opcional"
    />
  </div>

  <svelte:fragment slot="actions">
    <Button
      variant="secondary"
      color="financeiro"
      on:click={removeSelectedCell}
      disabled={!selectedCell?.registro}
      loading={saving}
    >
      <Eraser size={16} class="mr-2" />
      Remover
    </Button>
  </svelte:fragment>
</Dialog>
