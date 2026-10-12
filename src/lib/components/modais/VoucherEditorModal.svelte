<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { fade, slide } from 'svelte/transition';
  import { 
    X, Plus, Trash2, MoveUp, MoveDown, Save, FileText,
    ChevronDown, ChevronUp, Calendar, Hotel, MapPin, Users,
    Info, Plane, Phone, Smartphone, AlertCircle, CheckCircle
  } from '$lib/icons';
  import {
    Button,
    FieldInput,
    FieldSelect,
    FieldTextarea,
    OverlayModal
  } from '../ui';
  import { toast } from '../../stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import {
    createEmptyVoucherImport,
    extractVoucherImportFromFile,
    parseSpecialToursCircuitPasteText,
    parseSpecialToursHotelPaste,
    parseVoucherImportText
  } from '../../vouchers/import';
  import { normalizeVoucherExtraData, createBlankPassengerDetail, buildPassengerSummary, createBlankAppInfo } from '../../vouchers/extraData';
  import { addDaysISODate, diffDaysISODate } from '$lib/date';
  import type {
    VoucherProvider,
    VoucherDia,
    VoucherHotel,
    VoucherRecord,
    VoucherAssetRecord,
    VoucherExtraData,
    VoucherTransferInfo,
    VoucherAppInfo,
    VoucherImportResult
  } from '../../vouchers/types';

  type VoucherDiaForm = Omit<VoucherDia, 'cidade'> & {
    cidade: string;
  };

  type VoucherHotelForm = Omit<VoucherHotel, 'endereco' | 'data_inicio' | 'data_fim' | 'telefone' | 'contato' | 'status' | 'observacao'> & {
    endereco: string;
    data_inicio: string;
    data_fim: string;
    telefone: string;
    contato: string;
    status: string;
    observacao: string;
  };

  // Tipo local para o formulário do wizard
  interface VoucherForm {
    id: string | null;
    provider: VoucherProvider;
    nome: string;
    codigo_systur: string;
    codigo_fornecedor: string;
    reserva_online: string;
    passageiros: string;
    tipo_acomodacao: string;
    operador: string;
    resumo: string;
    data_inicio: string;
    data_fim: string;
    ativo: boolean;
    status: 'rascunho' | 'finalizado' | 'cancelado';
    extra_data: VoucherExtraData;
    dias: VoucherDiaForm[];
    hoteis: VoucherHotelForm[];
  }

  export let open = false;
  export let voucher: VoucherRecord | null = null;
  export let companyId: string | null = null;
  export let assets: VoucherAssetRecord[] = [];
  $: assets;

  const dispatch = createEventDispatcher();

  let form: VoucherForm;
  let currentStep = 0;
  let saving = false;
  let savingAsDraft = false;
  let travelPasteText = '';
  let circuitPasteText = '';
  let hotelPasteText = '';
  let importingTravel = false;
  let importingCircuit = false;
  let importingHotels = false;
  let importingFile = false;
  let importedFileName = '';
  let importFileInput: HTMLInputElement | null = null;
  let importAccordion: string[] = [];
  let activeDayIndexes: number[] = [];
  let activeHotelIndexes: number[] = [];
  let validationErrors: Record<string, string> = {};

  const steps = [
    { label: 'Dados da Viagem', icon: MapPin, description: 'Informações básicas' },
    { label: 'Dia a Dia', icon: Calendar, description: 'Circuito' },
    { label: 'Hotéis', icon: Hotel, description: 'Acomodações' },
    { label: 'Extras', icon: Info, description: 'Traslados e mais' }
  ];

  const providers: { value: VoucherProvider; label: string }[] = [
    { value: 'special_tours', label: 'Special Tours' },
    { value: 'europamundo', label: 'Europamundo' },
    { value: 'sato_tours', label: 'Sato Tours' }
  ];

  const acomodacaoOptions = [
    'Duplo',
    'Triplo',
    'Quádruplo',
    'Individual',
    'Casal',
    'Família (2 adultos + 1 criança)',
    'Família (2 adultos + 2 crianças)'
  ];

  const statusOptions = [
    { value: 'Confirmado', label: 'Confirmado' },
    { value: 'Pendente', label: 'Pendente' },
    { value: 'Sob Consulta', label: 'Sob Consulta' },
    { value: 'Não Disponível', label: 'Não Disponível' }
  ];

  const acomodacaoSelectOptions = acomodacaoOptions.map((opt) => ({ value: opt, label: opt }));
  const passengerTypeOptions = [
    { value: 'ADT', label: 'Adulto' },
    { value: 'CHD', label: 'Criança' },
    { value: 'INF', label: 'Bebê' }
  ];

  function initForm(): VoucherForm {
    const empty = createEmptyVoucherImport('special_tours');
    return {
      id: null,
      provider: empty.provider,
      nome: empty.nome,
      codigo_systur: empty.codigo_systur,
      codigo_fornecedor: empty.codigo_fornecedor,
      reserva_online: empty.reserva_online,
      passageiros: empty.passageiros,
      tipo_acomodacao: empty.tipo_acomodacao,
      operador: empty.operador,
      resumo: empty.resumo,
      data_inicio: empty.data_inicio,
      data_fim: empty.data_fim,
      ativo: true,
      status: 'rascunho',
      extra_data: normalizeVoucherExtraData(empty.extra_data, empty.provider),
      dias: [],
      hoteis: []
    };
  }

  function formFromVoucher(v: VoucherRecord): VoucherForm {
    const voucherStatus = (v as VoucherRecord & { status?: VoucherForm['status'] }).status;

    return {
      id: v.id,
      provider: v.provider,
      nome: v.nome || '',
      codigo_systur: v.codigo_systur || '',
      codigo_fornecedor: v.codigo_fornecedor || '',
      reserva_online: v.reserva_online || '',
      passageiros: v.passageiros || '',
      tipo_acomodacao: v.tipo_acomodacao || '',
      operador: v.operador || '',
      resumo: v.resumo || '',
      data_inicio: v.data_inicio || '',
      data_fim: v.data_fim || '',
      ativo: v.ativo !== false,
      status: voucherStatus || 'finalizado',
      extra_data: normalizeVoucherExtraData(v.extra_data, v.provider),
      dias: (v.voucher_dias || []).map((d, i) => normalizeDiaForForm(d, i)),
      hoteis: (v.voucher_hoteis || []).map((h, i) => normalizeHotelForForm(h, i))
    };
  }

  $: if (open) {
    form = voucher ? formFromVoucher(voucher) : initForm();
    currentStep = 0;
    travelPasteText = '';
    circuitPasteText = '';
    hotelPasteText = '';
    importingTravel = false;
    importingCircuit = false;
    importingHotels = false;
    importingFile = false;
    importedFileName = '';
    importAccordion = [];
    activeDayIndexes = [];
    activeHotelIndexes = [];
    validationErrors = {};
  }

  function formatDateBR(value?: string | null) {
    if (!value) return '';
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
  }

  function parseDateInput(value: string): string {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
  }
  function eventValue(event: Event) {
    const target = event.currentTarget as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    return target?.value ?? '';
  }
  
  function normalizeDiaForForm(dia: Partial<VoucherDia>, index: number): VoucherDiaForm {
    return {
      ...dia,
      dia_numero: Number(dia.dia_numero ?? index + 1),
      titulo: dia.titulo ?? '',
      descricao: dia.descricao ?? '',
      data_referencia: dia.data_referencia ?? null,
      cidade: dia.cidade ?? '',
      ordem: dia.ordem ?? index
    };
  }
  
  function normalizeHotelForForm(hotel: Partial<VoucherHotel>, index: number): VoucherHotelForm {
    return {
      ...hotel,
      cidade: hotel.cidade ?? '',
      hotel: hotel.hotel ?? '',
      endereco: hotel.endereco ?? '',
      data_inicio: hotel.data_inicio ?? '',
      data_fim: hotel.data_fim ?? '',
      noites: hotel.noites ?? null,
      telefone: hotel.telefone ?? '',
      contato: hotel.contato ?? '',
      status: hotel.status ?? '',
      observacao: hotel.observacao ?? '',
      ordem: hotel.ordem ?? index
    };
  }

  function addDaysToDate(startDate: string, days: number): string {
    return addDaysISODate(startDate, days);
  }

  function syncDaysWithStartDate() {
    if (!form.data_inicio) return;
    form.dias = form.dias.map((dia, index) => ({
      ...dia,
      data_referencia: addDaysToDate(form.data_inicio, index)
    }));
  }

  function addDay() {
    const nextNum = form.dias.length + 1;
    form.dias = [...form.dias, {
      dia_numero: nextNum,
      titulo: '',
      descricao: '',
      data_referencia: form.data_inicio ? addDaysToDate(form.data_inicio, form.dias.length) : null,
      cidade: '',
      ordem: form.dias.length
    }];
    activeDayIndexes = [...activeDayIndexes, form.dias.length - 1];
  }

  function removeDay(index: number) {
    form.dias = form.dias.reduce<typeof form.dias>((items, dia, i) => {
      if (i !== index) items.push({ ...dia, ordem: items.length });
      return items;
    }, []);
    activeDayIndexes = activeDayIndexes.reduce<number[]>((items, i) => {
      if (i !== index) items.push(i > index ? i - 1 : i);
      return items;
    }, []);
  }

  function moveDay(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= form.dias.length) return;
    const dias = [...form.dias];
    [dias[index], dias[newIndex]] = [dias[newIndex], dias[index]];
    form.dias = dias.map((d, i) => ({ ...d, ordem: i }));
    syncDaysWithStartDate();
  }

  function addHotel() {
    form.hoteis = [...form.hoteis, {
      cidade: '',
      hotel: '',
      endereco: '',
      data_inicio: '',
      data_fim: '',
      noites: null,
      telefone: '',
      contato: '',
      status: '',
      observacao: '',
      ordem: form.hoteis.length
    }];
    activeHotelIndexes = [...activeHotelIndexes, form.hoteis.length - 1];
  }

  function removeHotel(index: number) {
    form.hoteis = form.hoteis.reduce<typeof form.hoteis>((items, hotel, i) => {
      if (i !== index) items.push({ ...hotel, ordem: items.length });
      return items;
    }, []);
    activeHotelIndexes = activeHotelIndexes.reduce<number[]>((items, i) => {
      if (i !== index) items.push(i > index ? i - 1 : i);
      return items;
    }, []);
  }

  function moveHotel(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= form.hoteis.length) return;
    const hoteis = [...form.hoteis];
    [hoteis[index], hoteis[newIndex]] = [hoteis[newIndex], hoteis[index]];
    form.hoteis = hoteis.map((h, i) => ({ ...h, ordem: i }));
  }

  function diffNights(start?: string | null, end?: string | null): number | null {
    const diff = diffDaysISODate(start, end);
    if (diff === null) return null;
    return diff > 0 ? diff : 0;
  }

  function updateHotelDates(index: number, field: 'data_inicio' | 'data_fim', value: string) {
    form.hoteis[index][field] = value;
    form.hoteis[index].noites = diffNights(form.hoteis[index].data_inicio, form.hoteis[index].data_fim);
    form.hoteis = [...form.hoteis];
  }

  function applyImportedResult(imported: VoucherImportResult, options: { replaceDays?: boolean; replaceHotels?: boolean } = {}) {
    const replaceDays = options.replaceDays ?? false;
    const replaceHotels = options.replaceHotels ?? false;
    const nextDays = replaceDays ? imported.dias || [] : form.dias;
    const nextHotels = replaceHotels ? imported.hoteis || [] : form.hoteis;

    form = {
      ...form,
      provider: imported.provider || form.provider,
      nome: imported.nome || form.nome,
      codigo_systur: imported.codigo_systur || form.codigo_systur,
      codigo_fornecedor: imported.codigo_fornecedor || form.codigo_fornecedor,
      reserva_online: imported.reserva_online || form.reserva_online,
      passageiros: imported.passageiros || form.passageiros,
      tipo_acomodacao: imported.tipo_acomodacao || form.tipo_acomodacao,
      operador: imported.operador || form.operador,
      resumo: imported.resumo || form.resumo,
      data_inicio: imported.data_inicio || form.data_inicio,
      data_fim: imported.data_fim || form.data_fim,
      extra_data: normalizeVoucherExtraData(imported.extra_data || form.extra_data, imported.provider || form.provider),
      dias: nextDays.map((d, i) => normalizeDiaForForm({ ...d, ordem: i }, i)),
      hoteis: nextHotels.map((h, i) => normalizeHotelForForm({ ...h, ordem: i }, i))
    };

    syncDaysWithStartDate();
  }

  async function importTravelFromPaste() {
    if (!travelPasteText.trim()) {
      toast.error('Cole os dados da viagem antes de importar');
      return;
    }
    try {
      importingTravel = true;
      const imported = parseVoucherImportText(travelPasteText, form.provider);
      applyImportedResult(imported, { replaceDays: false, replaceHotels: false });
      toast.success('Dados da viagem importados com sucesso');
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Erro ao importar dados da viagem'));
    } finally {
      importingTravel = false;
    }
  }

  async function importItineraryFromPaste() {
    if (!circuitPasteText.trim()) {
      toast.error('Cole o itinerário antes de importar');
      return;
    }
    try {
      importingCircuit = true;
      const supportsCircuitPaste =
        form.provider === 'special_tours' || form.provider === 'sato_tours' || form.provider === 'europamundo';
      const parsedCircuit = supportsCircuitPaste
        ? parseSpecialToursCircuitPasteText(circuitPasteText, form.provider)
        : null;
      const imported =
        parsedCircuit && (parsedCircuit.dias.length > 0 || parsedCircuit.hoteis.length > 0)
          ? parsedCircuit
          : parseVoucherImportText(circuitPasteText, form.provider);
      applyImportedResult(imported, { replaceDays: true, replaceHotels: false });
      toast.success('Itinerário importado com sucesso');
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Erro ao importar itinerário'));
    } finally {
      importingCircuit = false;
    }
  }

  async function importHotelsFromPasteUnified() {
    if (!hotelPasteText.trim()) {
      toast.error('Cole a lista de hotéis antes de importar');
      return;
    }
    try {
      importingHotels = true;
      const imported =
        form.provider === 'special_tours' || form.provider === 'sato_tours'
          ? parseSpecialToursHotelPaste(hotelPasteText)
          : parseVoucherImportText(hotelPasteText, form.provider);
      applyImportedResult(imported, { replaceDays: false, replaceHotels: true });
      toast.success('Hotéis importados com sucesso');
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Erro ao importar hotéis'));
    } finally {
      importingHotels = false;
    }
  }

  async function importFromFile(file: File) {
    try {
      importingFile = true;
      importedFileName = file.name;
      const imported = await extractVoucherImportFromFile(file, form.provider);
      applyImportedResult(imported, { replaceDays: true, replaceHotels: true });
      toast.success('Arquivo importado com sucesso');
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Erro ao importar arquivo'));
    } finally {
      importingFile = false;
    }
  }

  function toggleImportAccordion(key: string) {
    if (importAccordion.includes(key)) {
      importAccordion = importAccordion.filter((item) => item !== key);
    } else {
      importAccordion = [...importAccordion, key];
    }
  }

  // ========== PASSAGEIROS ==========
  function addPassenger() {
    const details = form.extra_data.passageiros_detalhes || [];
    const nextDetails = [...details, createBlankPassengerDetail(details.length)];
    form.extra_data = {
      ...form.extra_data,
      passageiros_detalhes: nextDetails
    };
    form.passageiros = buildPassengerSummary(nextDetails);
  }

  function removePassenger(index: number) {
    const details = (form.extra_data.passageiros_detalhes || []).filter((_, i) => i !== index);
    form.extra_data = { ...form.extra_data, passageiros_detalhes: details };
    form.passageiros = buildPassengerSummary(details);
  }

  function updatePassenger(index: number, field: string, value: string) {
    const details = [...(form.extra_data.passageiros_detalhes || [])];
    details[index] = { ...details[index], [field]: value };
    form.extra_data = { ...form.extra_data, passageiros_detalhes: details };
    form.passageiros = buildPassengerSummary(details);
  }

  // ========== APPS RECOMENDADOS ==========
  function addApp() {
    const apps = form.extra_data.apps_recomendados || [];
    form.extra_data = {
      ...form.extra_data,
      apps_recomendados: [...apps, createBlankAppInfo(apps.length)]
    };
  }

  function removeApp(index: number) {
    const apps = (form.extra_data.apps_recomendados || []).filter((_, i) => i !== index);
    form.extra_data = { ...form.extra_data, apps_recomendados: apps };
  }

  function updateApp(index: number, field: string, value: string) {
    const apps = [...(form.extra_data.apps_recomendados || [])];
    apps[index] = { ...apps[index], [field]: value };
    form.extra_data = { ...form.extra_data, apps_recomendados: apps };
  }

  // ========== VALIDAÇÃO ==========
  function validateStep(step: number): boolean {
    validationErrors = {};
    
    if (step === 0) {
      if (!form.nome.trim()) {
        validationErrors.nome = 'Nome do voucher é obrigatório';
      }
      if (!form.data_inicio) {
        validationErrors.data_inicio = 'Data de início é obrigatória';
      }
    }
    
    return Object.keys(validationErrors).length === 0;
  }

  function goToStep(step: number) {
    // Só permite voltar ou avançar se passar na validação
    if (step > currentStep && !validateStep(currentStep)) {
      toast.error('Preencha os campos obrigatórios antes de avançar');
      return;
    }
    currentStep = step;
  }

  function nextStep() {
    if (currentStep < steps.length - 1) {
      if (validateStep(currentStep)) {
        currentStep++;
      } else {
        toast.error('Preencha os campos obrigatórios antes de avançar');
      }
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      currentStep--;
    }
  }

  // ========== SALVAMENTO ==========
  async function save(finalizar = false) {
    if (!companyId) {
      toast.error('Selecione uma empresa');
      return;
    }
    
    // Validação final
    if (!form.nome.trim()) {
      validationErrors.nome = 'Nome do voucher é obrigatório';
      currentStep = 0;
      toast.error('Informe o nome do voucher');
      return;
    }

    if (finalizar) {
      saving = true;
    } else {
      savingAsDraft = true;
    }
    
    try {
      const payload = {
        ...form,
        company_id: companyId,
        status: finalizar ? 'finalizado' : 'rascunho',
        dias: form.dias,
        hoteis: form.hoteis
      };
      dispatch('save', payload);
    } finally {
      saving = false;
      savingAsDraft = false;
    }
  }

  function close() {
    dispatch('close');
  }

  function toggleDayAccordion(index: number) {
    if (activeDayIndexes.includes(index)) {
      activeDayIndexes = activeDayIndexes.filter(i => i !== index);
    } else {
      activeDayIndexes = [...activeDayIndexes, index];
    }
  }

  function toggleHotelAccordion(index: number) {
    if (activeHotelIndexes.includes(index)) {
      activeHotelIndexes = activeHotelIndexes.filter(i => i !== index);
    } else {
      activeHotelIndexes = [...activeHotelIndexes, index];
    }
  }

  function getStepStatus(stepIndex: number): 'completed' | 'current' | 'pending' {
    if (stepIndex < currentStep) return 'completed';
    if (stepIndex === currentStep) return 'current';
    return 'pending';
  }
</script>

<OverlayModal bind:open position="top" zIndex="z-100" padding="pt-4 pb-4 px-4" scroll onclose={close}>
    <div 
      class="bg-white rounded-xl shadow-xl w-full max-w-6xl overflow-hidden flex flex-col"
      style="max-height: calc(100vh - 32px);"
      role="document"
    >
      <!-- Header -->
      <div class="vtur-modal-header border-b border-slate-200 bg-gradient-to-r from-clientes-50 to-white">
        <div>
          <h2 class="vtur-modal-header__title text-xl font-bold text-slate-900">
            {voucher ? 'Editar Voucher' : 'Novo Voucher'}
          </h2>
          <p class="vtur-modal-header__subtitle text-sm text-slate-500">
            {providers.find(p => p.value === form.provider)?.label}
            {#if form.status === 'rascunho'}
              <span class="ml-2 inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                Rascunho
              </span>
            {:else if form.status === 'finalizado'}
              <span class="ml-2 inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                Finalizado
              </span>
            {/if}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          ariaLabel="Fechar editor de voucher"
          class_name="vtur-modal-header__close min-w-0 rounded-lg! p-2! text-slate-400! hover:bg-slate-100! hover:text-slate-600!"
          on:click={close}
        >
          <X size={20} />
        </Button>
      </div>

      <!-- Wizard Steps -->
      <div class="vtur-modal-tabs bg-slate-50 border-b border-slate-200 p-0!">
        <div class="flex overflow-x-auto scrollbar-dark">
          {#each steps as step, i}
            {@const status = getStepStatus(i)}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class_name={`min-w-18 flex-1 rounded-none! border-0! py-3! md:py-4! px-2! shadow-none! flex flex-col items-center justify-center gap-1 text-xs md:text-sm font-medium transition-all relative ${
                status === 'current'
                  ? 'bg-white! text-clientes-700! border-b-2 border-clientes-500!'
                  : status === 'completed'
                    ? 'text-green-600! hover:bg-green-50!'
                    : 'text-slate-400! hover:text-slate-600! hover:bg-slate-100!'
              }`}
              on:click={() => goToStep(i)}
            >
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs
                  {status === 'current' 
                    ? 'bg-clientes-500 text-white' 
                    : status === 'completed'
                      ? 'bg-green-500 text-white'
                      : 'bg-slate-200 text-slate-500'}">
                  {#if status === 'completed'}
                    <CheckCircle size={14} />
                  {:else}
                    {i + 1}
                  {/if}
                </div>
                <span class="hidden sm:inline font-semibold">{step.label}</span>
              </div>
              <span class="text-xs opacity-75 hidden md:inline">{step.description}</span>
            </Button>
          {/each}
        </div>
      </div>

      <!-- Content -->
      <div class="vtur-modal-body-dense flex-1 bg-slate-50" style="min-height: 400px;">
        
        <!-- ETAPA 1: Dados da Viagem -->
        {#if currentStep === 0}
          <div class="space-y-4 md:space-y-6" in:fade={{ duration: 200 }}>
            <div class="vtur-modal-section-compact bg-slate-50 rounded-xl p-5 border border-slate-200">
              <h3 class="font-semibold text-slate-900 mb-2">Importar dados do voucher</h3>
              <p class="text-sm text-slate-600 mb-4">
                Cole cada parte do voucher na caixa correspondente ou importe por arquivo.
              </p>

              <input
                bind:this={importFileInput}
                type="file"
                class="hidden"
                accept=".docx,.pdf,.txt"
                on:change={async (event) => {
                  const file = (event.currentTarget as HTMLInputElement).files?.[0];
                  (event.currentTarget as HTMLInputElement).value = '';
                  if (!file) return;
                  await importFromFile(file);
                }}
              />

              <div class="space-y-2">
                <div class="border border-slate-200 rounded-lg bg-white overflow-hidden">
                  <Button type="button" variant="ghost" class_name="w-full justify-between! rounded-none! px-4! py-4!" on:click={() => toggleImportAccordion('viagem')}>
                    <span>Colar dados da viagem</span>
                    <ChevronDown size={16} class={importAccordion.includes('viagem') ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </Button>
                  {#if importAccordion.includes('viagem')}
                    <div class="p-4 border-t border-slate-100 space-y-3">
                      <FieldTextarea bind:value={travelPasteText} rows={8} placeholder="Cole os dados da viagem, passageiros e informações principais..." />
                      <div class="flex gap-2 flex-wrap">
                        <Button variant="secondary" size="sm" on:click={importTravelFromPaste} disabled={importingTravel}>
                          {importingTravel ? 'Importando...' : 'Importar dados da viagem'}
                        </Button>
                        {#if travelPasteText}
                          <Button variant="ghost" size="sm" on:click={() => (travelPasteText = '')}>Limpar</Button>
                        {/if}
                      </div>
                    </div>
                  {/if}
                </div>

                <div class="border border-slate-200 rounded-lg bg-white overflow-hidden">
                  <Button type="button" variant="ghost" class_name="w-full justify-between! rounded-none! px-4! py-4!" on:click={() => toggleImportAccordion('itinerario')}>
                    <span>Colar itinerário</span>
                    <ChevronDown size={16} class={importAccordion.includes('itinerario') ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </Button>
                  {#if importAccordion.includes('itinerario')}
                    <div class="p-4 border-t border-slate-100 space-y-3">
                      <FieldTextarea bind:value={circuitPasteText} rows={8} placeholder="Cole o itinerário dia a dia..." />
                      <div class="flex gap-2 flex-wrap">
                        <Button variant="secondary" size="sm" on:click={importItineraryFromPaste} disabled={importingCircuit}>
                          {importingCircuit ? 'Importando...' : 'Importar itinerário'}
                        </Button>
                        {#if circuitPasteText}
                          <Button variant="ghost" size="sm" on:click={() => (circuitPasteText = '')}>Limpar</Button>
                        {/if}
                      </div>
                    </div>
                  {/if}
                </div>

                <div class="border border-slate-200 rounded-lg bg-white overflow-hidden">
                  <Button type="button" variant="ghost" class_name="w-full justify-between! rounded-none! px-4! py-4!" on:click={() => toggleImportAccordion('hoteis')}>
                    <span>Colar lista de hotéis</span>
                    <ChevronDown size={16} class={importAccordion.includes('hoteis') ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </Button>
                  {#if importAccordion.includes('hoteis')}
                    <div class="p-4 border-t border-slate-100 space-y-3">
                      <FieldTextarea bind:value={hotelPasteText} rows={8} placeholder="Cole a lista de hotéis..." />
                      <div class="flex gap-2 flex-wrap">
                        <Button variant="secondary" size="sm" on:click={importHotelsFromPasteUnified} disabled={importingHotels}>
                          {importingHotels ? 'Importando...' : 'Importar hotéis'}
                        </Button>
                        {#if hotelPasteText}
                          <Button variant="ghost" size="sm" on:click={() => (hotelPasteText = '')}>Limpar</Button>
                        {/if}
                      </div>
                    </div>
                  {/if}
                </div>
              </div>

              <div class="flex items-center gap-3 mt-4">
                <Button variant="primary" on:click={() => importFileInput?.click()} disabled={importingFile}>
                  {importingFile ? 'Importando arquivo...' : 'Importar arquivo'}
                </Button>
                <span class="text-sm text-slate-600">{importedFileName || 'Nenhum arquivo selecionado'}</span>
              </div>
              <p class="text-xs text-slate-500 mt-2">Escolha o arquivo Word (.docx), PDF ou texto (.txt) e importe tudo de uma vez.</p>
            </div>

            <!-- Provider -->
            <fieldset class="vtur-modal-section-compact bg-white rounded-xl p-6 shadow-xs border border-slate-200">
              <legend class="block text-sm font-medium text-slate-700 mb-3">Fornecedor</legend>
              {#if voucher}
                <div class="py-2 px-4 rounded-lg border-2 border-clientes-500 bg-clientes-50 text-clientes-700 inline-block font-medium">
                  {providers.find(p => p.value === form.provider)?.label}
                </div>
                <p class="text-xs text-slate-500 mt-2">O fornecedor não pode ser alterado em um voucher existente.</p>
              {:else}
                <div class="vtur-modal-grid-compact flex gap-3">
                  {#each providers as p}
                    <Button
                      type="button"
                      variant={form.provider === p.value ? 'primary' : 'outline'}
                      size="md"
                      class_name="flex-1 justify-center! rounded-lg! border-2! px-4! py-3!"
                      on:click={() => form.provider = p.value}
                    >
                      {p.label}
                    </Button>
                  {/each}
                </div>
              {/if}
            </fieldset>

            <!-- Informações Principais -->
            <div class="vtur-modal-section-compact bg-white rounded-xl p-6 shadow-xs border border-slate-200">
              <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <FileText size={20} class="text-clientes-500" />
                Informações Principais
              </h3>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldInput
                  id="voucher-modal-nome"
                  label="Nome do Voucher"
                  bind:value={form.nome}
                  required={true}
                  error={validationErrors.nome}
                  placeholder="Ex: Circuito Europa 2024"
                  class_name="md:col-span-2"
                />

                <FieldInput
                  id="voucher-modal-codigo-systur"
                  label="Código interno"
                  bind:value={form.codigo_systur}
                  placeholder="Código interno"
                />

                <FieldInput
                  id="voucher-modal-codigo-fornecedor"
                  label="Código Fornecedor"
                  bind:value={form.codigo_fornecedor}
                  placeholder="Código do fornecedor"
                />

                <FieldInput
                  id="voucher-modal-reserva-online"
                  label="Reserva Online"
                  bind:value={form.reserva_online}
                  placeholder="Número da reserva"
                />

                <FieldInput
                  id="voucher-modal-localizador-agencia"
                  label="Localizador Agência"
                  value={form.extra_data.localizador_agencia || ''}
                  placeholder="Localizador da agência"
                  on:input={(e) => form.extra_data = { ...form.extra_data, localizador_agencia: (e.currentTarget as HTMLInputElement).value }}
                />
              </div>
            </div>

            <!-- Datas -->
            <div class="vtur-modal-section-compact bg-white rounded-xl p-6 shadow-xs border border-slate-200">
              <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Calendar size={20} class="text-clientes-500" />
                Datas da Viagem
              </h3>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldInput
                  id="voucher-modal-data-inicio"
                  label="Data Início"
                  type="date"
                  bind:value={form.data_inicio}
                  required={true}
                  error={validationErrors.data_inicio}
                  on:change={syncDaysWithStartDate}
                />

                <FieldInput
                  id="voucher-modal-data-fim"
                  label="Data Fim"
                  type="date"
                  bind:value={form.data_fim}
                />
              </div>
            </div>

            <!-- Acomodação e Operador -->
            <div class="bg-white rounded-xl p-6 shadow-xs border border-slate-200">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldSelect
                  id="voucher-modal-tipo-acomodacao"
                  label="Tipo de Acomodação"
                  bind:value={form.tipo_acomodacao}
                  options={acomodacaoSelectOptions}
                  placeholder="Selecione uma opção"
                />

                <FieldInput
                  id="voucher-modal-operador"
                  label="Operador"
                  bind:value={form.operador}
                  placeholder="Nome do operador"
                />
              </div>
            </div>

            <!-- Passageiros -->
            <div class="bg-white rounded-xl p-6 shadow-xs border border-slate-200">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Users size={20} class="text-clientes-500" />
                  Passageiros
                </h3>
                <Button variant="secondary" size="sm" on:click={addPassenger}>
                  <Plus size={14} class="mr-1" />
                  Adicionar Passageiro
                </Button>
              </div>
              
              {#if form.extra_data.passageiros_detalhes?.length}
                <div class="space-y-3">
                  {#each form.extra_data.passageiros_detalhes as passenger, i}
                    <div class="vtur-modal-list-item p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div class="flex items-center justify-between mb-3">
                        <span class="text-sm font-medium text-slate-700">Passageiro {i + 1}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          color="red"
                          class_name="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                          on:click={() => removePassenger(i)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <FieldInput
                          id={`voucher-modal-passageiro-nome-${i}`}
                          label="Nome Completo"
                          value={passenger.nome}
                          placeholder="Nome do passageiro"
                          class_name="md:col-span-2"
                          on:input={(e) => updatePassenger(i, 'nome', (e.currentTarget as HTMLInputElement).value)}
                        />
                        <FieldInput
                          id={`voucher-modal-passageiro-passaporte-${i}`}
                          label="Passaporte"
                          value={passenger.passaporte || ''}
                          placeholder="Número do passaporte"
                          on:input={(e) => updatePassenger(i, 'passaporte', (e.currentTarget as HTMLInputElement).value)}
                        />
                        <FieldInput
                          id={`voucher-modal-passageiro-data-${i}`}
                          label="Data Nascimento"
                          type="date"
                          value={passenger.data_nascimento || ''}
                          on:input={(e) => updatePassenger(i, 'data_nascimento', (e.currentTarget as HTMLInputElement).value)}
                        />
                        <FieldInput
                          id={`voucher-modal-passageiro-nacionalidade-${i}`}
                          label="Nacionalidade"
                          value={passenger.nacionalidade || ''}
                          placeholder="Ex: Brasileira"
                          on:input={(e) => updatePassenger(i, 'nacionalidade', (e.currentTarget as HTMLInputElement).value)}
                        />
                        <FieldSelect
                          id={`voucher-modal-passageiro-tipo-${i}`}
                          label="Tipo"
                          value={passenger.tipo || ''}
                          options={passengerTypeOptions}
                          placeholder="Selecione uma opção"
                          on:change={(e) => updatePassenger(i, 'tipo', (e.currentTarget as HTMLSelectElement).value)}
                        />
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="vtur-modal-notice text-center py-8 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                  <Users size={32} class="mx-auto mb-2 opacity-50" />
                  <p>Nenhum passageiro adicionado</p>
                  <p class="text-sm">Clique em "Adicionar Passageiro" para incluir</p>
                </div>
              {/if}
            </div>

            <!-- Resumo -->
            <div class="vtur-modal-section-compact bg-white rounded-xl p-6 shadow-xs border border-slate-200">
              <FieldTextarea
                id="voucher-modal-resumo"
                label="Resumo da Viagem"
                bind:value={form.resumo}
                rows={4}
                placeholder="Descreva o resumo da viagem..."
              />
            </div>
          </div>

        <!-- ETAPA 2: Dia a Dia Circuito -->
        {:else if currentStep === 1}
          <div class="space-y-4 md:space-y-6" in:fade={{ duration: 200 }}>
            <!-- Days List -->
            <div class="vtur-modal-section-compact bg-white rounded-xl p-6 shadow-xs border border-slate-200">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-slate-900">Dias do Circuito</h3>
                <Button variant="primary" size="sm" on:click={addDay}>
                  <Plus size={14} class="mr-1" />
                  Adicionar Dia
                </Button>
              </div>

              {#if form.dias.length === 0}
                <div class="vtur-modal-notice text-center py-12 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                  <Calendar size={40} class="mx-auto mb-3 opacity-50" />
                  <p class="font-medium">Nenhum dia adicionado</p>
                  <p class="text-sm mt-1">Importe ou adicione manualmente os dias do circuito</p>
                </div>
              {:else}
                <div class="space-y-3">
                  {#each form.dias as dia, i}
                    <div class="border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <div class="vtur-modal-accordion-header bg-gradient-to-r from-slate-50 to-white transition-colors">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          class_name="vtur-modal-accordion-trigger flex flex-1 justify-start! gap-4 rounded-none! border-0! bg-transparent! px-3! md:px-4! py-3! md:py-4! text-left! shadow-none! hover:from-slate-100! hover:to-slate-50!"
                          on:click={() => toggleDayAccordion(i)}
                        >
                          <div class="vtur-modal-accordion-badge rounded-full bg-clientes-100 text-clientes-700 flex items-center justify-center font-bold">
                            {dia.dia_numero}
                          </div>
                          <div>
                            {#if dia.titulo}
                              <p class="font-medium text-slate-900">{dia.titulo}</p>
                            {:else}
                              <p class="font-medium text-slate-400">Dia {dia.dia_numero}</p>
                            {/if}
                            {#if dia.data_referencia}
                              <p class="text-sm text-slate-500">{formatDateBR(dia.data_referencia)}</p>
                            {/if}
                          </div>
                          <svelte:component 
                            this={activeDayIndexes.includes(i) ? ChevronUp : ChevronDown} 
                            size={20} 
                            class="text-slate-400 ml-auto"
                          />
                        </Button>
                        <div class="vtur-modal-accordion-actions flex items-center gap-2 px-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            ariaLabel={`Mover dia ${i + 1} para cima`}
                            on:click={() => moveDay(i, -1)}
                            disabled={i === 0}
                            class_name="min-w-0 rounded-lg! p-1.5! text-slate-400! hover:bg-slate-200! hover:text-slate-600!"
                          >
                            <MoveUp size={18} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            ariaLabel={`Mover dia ${i + 1} para baixo`}
                            on:click={() => moveDay(i, 1)}
                            disabled={i === form.dias.length - 1}
                            class_name="min-w-0 rounded-lg! p-1.5! text-slate-400! hover:bg-slate-200! hover:text-slate-600!"
                          >
                            <MoveDown size={18} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            ariaLabel={`Remover dia ${i + 1}`}
                            on:click={() => removeDay(i)}
                            class_name="min-w-0 rounded-lg! p-1.5! text-red-400! hover:bg-red-50! hover:text-red-600!"
                          >
                            <Trash2 size={18} />
                          </Button>
                        </div>
                      </div>
                      
                      {#if activeDayIndexes.includes(i)}
                        <div class="vtur-modal-accordion-panel p-4 space-y-4 border-t border-slate-100" transition:slide>
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FieldInput
                              id={`voucher-modal-dia-titulo-${i}`}
                              label="Título do Dia"
                              bind:value={dia.titulo}
                              placeholder="Ex: Lisboa - Chegada"
                              class_name="w-full"
                            />
                            <FieldInput
                              id={`voucher-modal-dia-cidade-${i}`}
                              label="Cidade"
                              bind:value={dia.cidade}
                              placeholder="Nome da cidade"
                              class_name="w-full"
                            />
                          </div>
                          <FieldTextarea
                            id={`voucher-modal-dia-descricao-${i}`}
                            label="Descrição das Atividades"
                            bind:value={dia.descricao}
                            rows={5}
                            placeholder="Descreva as atividades do dia..."
                            class_name="w-full"
                          />
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>

        <!-- ETAPA 3: Hotéis Confirmados -->
        {:else if currentStep === 2}
          <div class="space-y-4 md:space-y-6" in:fade={{ duration: 200 }}>
            <!-- Hotels List -->
            <div class="vtur-modal-section-compact bg-white rounded-xl p-6 shadow-xs border border-slate-200">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-slate-900">Hotéis Confirmados</h3>
                <Button variant="primary" size="sm" on:click={addHotel}>
                  <Plus size={14} class="mr-1" />
                  Adicionar Hotel
                </Button>
              </div>

              {#if form.hoteis.length === 0}
                <div class="vtur-modal-notice text-center py-12 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                  <Hotel size={40} class="mx-auto mb-3 opacity-50" />
                  <p class="font-medium">Nenhum hotel adicionado</p>
                  <p class="text-sm mt-1">Importe ou adicione manualmente os hotéis</p>
                </div>
              {:else}
                <div class="space-y-3">
                  {#each form.hoteis as hotel, i}
                    <div class="border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <div class="vtur-modal-accordion-header bg-gradient-to-r from-slate-50 to-white transition-colors">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          class_name="vtur-modal-accordion-trigger flex flex-1 justify-start! gap-3 rounded-none! border-0! bg-transparent! px-3! md:px-4! py-3! md:py-4! text-left! shadow-none! hover:from-slate-100! hover:to-slate-50!"
                          on:click={() => toggleHotelAccordion(i)}
                        >
                          <div class="vtur-modal-accordion-badge rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                            <Hotel size={20} />
                          </div>
                          <div>
                            <p class="font-medium text-slate-900">{hotel.hotel || `Hotel ${i + 1}`}</p>
                            {#if hotel.cidade}
                              <p class="text-sm text-slate-500">{hotel.cidade}</p>
                            {/if}
                          </div>
                          <svelte:component 
                            this={activeHotelIndexes.includes(i) ? ChevronUp : ChevronDown} 
                            size={20} 
                            class="text-slate-400 ml-auto"
                          />
                        </Button>
                        <div class="vtur-modal-accordion-actions flex items-center gap-2 px-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            ariaLabel={`Mover hotel ${i + 1} para cima`}
                            on:click={() => moveHotel(i, -1)}
                            disabled={i === 0}
                            class_name="min-w-0 rounded-lg! p-1.5! text-slate-400! hover:bg-slate-200! hover:text-slate-600!"
                          >
                            <MoveUp size={18} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            ariaLabel={`Mover hotel ${i + 1} para baixo`}
                            on:click={() => moveHotel(i, 1)}
                            disabled={i === form.hoteis.length - 1}
                            class_name="min-w-0 rounded-lg! p-1.5! text-slate-400! hover:bg-slate-200! hover:text-slate-600!"
                          >
                            <MoveDown size={18} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            ariaLabel={`Remover hotel ${i + 1}`}
                            on:click={() => removeHotel(i)}
                            class_name="min-w-0 rounded-lg! p-1.5! text-red-400! hover:bg-red-50! hover:text-red-600!"
                          >
                            <Trash2 size={18} />
                          </Button>
                        </div>
                      </div>
                      
                      {#if activeHotelIndexes.includes(i)}
                        <div class="vtur-modal-accordion-panel p-4 space-y-4 border-t border-slate-100" transition:slide>
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FieldInput
                              id={`voucher-modal-hotel-cidade-${i}`}
                              label="Cidade *"
                              bind:value={hotel.cidade}
                              placeholder="Nome da cidade"
                              class_name="w-full"
                            />
                            <FieldInput
                              id={`voucher-modal-hotel-nome-${i}`}
                              label="Hotel *"
                              bind:value={hotel.hotel}
                              placeholder="Nome do hotel"
                              class_name="w-full"
                            />
                          </div>
                          <FieldInput
                            id={`voucher-modal-hotel-endereco-${i}`}
                            label="Endereço"
                            bind:value={hotel.endereco}
                            placeholder="Endereço completo do hotel"
                            class_name="w-full"
                          />
                          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FieldInput
                              id={`voucher-modal-hotel-checkin-${i}`}
                              label="Check-in"
                              type="date"
                              value={hotel.data_inicio}
                              class_name="w-full"
                              on:input={(e) => updateHotelDates(i, 'data_inicio', eventValue(e))}
                            />
                            <FieldInput
                              id={`voucher-modal-hotel-checkout-${i}`}
                              label="Check-out"
                              type="date"
                              value={hotel.data_fim}
                              class_name="w-full"
                              on:input={(e) => updateHotelDates(i, 'data_fim', eventValue(e))}
                            />
                            <FieldInput
                              id={`voucher-modal-hotel-noites-${i}`}
                              label="Noites"
                              type="number"
                              value={hotel.noites ?? ''}
                              readonly
                              class_name="w-full"
                            />
                          </div>
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FieldInput
                              id={`voucher-modal-hotel-telefone-${i}`}
                              label="Telefone"
                              bind:value={hotel.telefone}
                              placeholder="Telefone do hotel"
                              class_name="w-full"
                            />
                            <FieldInput
                              id={`voucher-modal-hotel-contato-${i}`}
                              label="Contato"
                              bind:value={hotel.contato}
                              placeholder="Nome do contato"
                              class_name="w-full"
                            />
                          </div>
                          <FieldSelect
                            id={`voucher-modal-hotel-status-${i}`}
                            label="Status"
                            bind:value={hotel.status}
                            options={[{ value: '', label: 'Selecione uma opção' }, ...statusOptions]}
                            class_name="w-full md:w-1/2"
                          />
                          <FieldTextarea
                            id={`voucher-modal-hotel-observacao-${i}`}
                            label="Observação"
                            bind:value={hotel.observacao}
                            rows={2}
                            placeholder="Observações sobre o hotel..."
                            class_name="w-full"
                          />
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>

        <!-- ETAPA 4: Extra Data -->
        {:else if currentStep === 3}
          <div class="space-y-4 md:space-y-6" in:fade={{ duration: 200 }}>
            
            <!-- Traslados -->
            <div class="vtur-modal-section-compact bg-white rounded-xl p-6 shadow-xs border border-slate-200">
              <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Plane size={20} class="text-clientes-500" />
                Traslados
              </h3>
              
              <div class="vtur-modal-grid-compact grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Traslado Chegada -->
                <div class="vtur-modal-section-compact p-4 bg-green-50 rounded-lg border border-green-200">
                  <h4 class="font-medium text-green-900 mb-3 flex items-center gap-2">
                    <Plane size={16} class="rotate-45" />
                    Traslado Chegada
                  </h4>
                  <div class="space-y-3">
                    <FieldTextarea
                      id="voucher-modal-traslado-chegada-detalhes"
                      label="Detalhes"
                      value={form.extra_data.traslado_chegada?.detalhes || ''}
                      rows={3}
                      placeholder="Detalhes do traslado de chegada..."
                      class_name="w-full"
                      on:input={(e) => form.extra_data = { 
                        ...form.extra_data, 
                        traslado_chegada: { 
                          ...(form.extra_data.traslado_chegada || {}), 
                          detalhes: eventValue(e) 
                        } 
                      }}
                    />
                    <FieldTextarea
                      id="voucher-modal-traslado-chegada-notas"
                      label="Notas"
                      value={form.extra_data.traslado_chegada?.notas || ''}
                      rows={2}
                      placeholder="Notas importantes..."
                      class_name="w-full"
                      on:input={(e) => form.extra_data = { 
                        ...form.extra_data, 
                        traslado_chegada: { 
                          ...(form.extra_data.traslado_chegada || {}), 
                          notas: eventValue(e) 
                        } 
                      }}
                    />
                    <FieldInput
                      id="voucher-modal-traslado-chegada-telefone"
                      label="Telefone Transferista"
                      type="text"
                      value={form.extra_data.traslado_chegada?.telefone_transferista || ''}
                      placeholder="+34 999 999 999"
                      class_name="w-full"
                      on:input={(e) => form.extra_data = { 
                        ...form.extra_data, 
                        traslado_chegada: { 
                          ...(form.extra_data.traslado_chegada || {}), 
                          telefone_transferista: eventValue(e) 
                        } 
                      }}
                    />
                  </div>
                </div>

                <!-- Traslado Saída -->
                <div class="vtur-modal-section-compact p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <h4 class="font-medium text-orange-900 mb-3 flex items-center gap-2">
                    <Plane size={16} class="-rotate-45" />
                    Traslado Saída
                  </h4>
                  <div class="space-y-3">
                    <FieldTextarea
                      id="voucher-modal-traslado-saida-detalhes"
                      label="Detalhes"
                      value={form.extra_data.traslado_saida?.detalhes || ''}
                      rows={3}
                      placeholder="Detalhes do traslado de saída..."
                      class_name="w-full"
                      on:input={(e) => form.extra_data = { 
                        ...form.extra_data, 
                        traslado_saida: { 
                          ...(form.extra_data.traslado_saida || {}), 
                          detalhes: eventValue(e) 
                        } 
                      }}
                    />
                    <FieldTextarea
                      id="voucher-modal-traslado-saida-notas"
                      label="Notas"
                      value={form.extra_data.traslado_saida?.notas || ''}
                      rows={2}
                      placeholder="Notas importantes..."
                      class_name="w-full"
                      on:input={(e) => form.extra_data = { 
                        ...form.extra_data, 
                        traslado_saida: { 
                          ...(form.extra_data.traslado_saida || {}), 
                          notas: eventValue(e) 
                        } 
                      }}
                    />
                    <FieldInput
                      id="voucher-modal-traslado-saida-telefone"
                      label="Telefone Transferista"
                      type="text"
                      value={form.extra_data.traslado_saida?.telefone_transferista || ''}
                      placeholder="+34 999 999 999"
                      class_name="w-full"
                      on:input={(e) => form.extra_data = { 
                        ...form.extra_data, 
                        traslado_saida: { 
                          ...(form.extra_data.traslado_saida || {}), 
                          telefone_transferista: eventValue(e) 
                        } 
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- Informações Importantes -->
            <div class="vtur-modal-section-compact bg-white rounded-xl p-6 shadow-xs border border-slate-200">
              <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <AlertCircle size={20} class="text-amber-500" />
                Informações Importantes
              </h3>
              <FieldTextarea
                id="voucher-modal-informacoes-importantes"
                label=""
                value={form.extra_data.informacoes_importantes || ''}
                rows={5}
                placeholder="Liste aqui as informações importantes para o passageiro..."
                class_name="w-full"
                on:input={(e) => form.extra_data = { ...form.extra_data, informacoes_importantes: eventValue(e) }}
              />
            </div>

            <!-- Apps Recomendados -->
            <div class="vtur-modal-section-compact bg-white rounded-xl p-6 shadow-xs border border-slate-200">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Smartphone size={20} class="text-clientes-500" />
                  Apps Recomendados
                </h3>
                <Button variant="secondary" size="sm" on:click={addApp}>
                  <Plus size={14} class="mr-1" />
                  Adicionar App
                </Button>
              </div>
              
              {#if form.extra_data.apps_recomendados?.length}
                <div class="space-y-3">
                  {#each form.extra_data.apps_recomendados as app, i}
                    <div class="vtur-modal-list-item p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div class="flex items-center justify-between mb-3">
                        <span class="text-sm font-medium text-slate-700">App {i + 1}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          color="red"
                          class_name="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                          on:click={() => removeApp(i)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <FieldInput
                          id={`voucher-modal-app-nome-${i}`}
                          label="Nome do App"
                          value={app.nome}
                          placeholder="Ex: Google Tradutor"
                          class_name="w-full"
                          on:input={(e) => updateApp(i, 'nome', eventValue(e))}
                        />
                        <FieldInput
                          id={`voucher-modal-app-descricao-${i}`}
                          label="Descrição"
                          value={app.descricao || ''}
                          placeholder="Para que serve o app"
                          class_name="w-full"
                          on:input={(e) => updateApp(i, 'descricao', eventValue(e))}
                        />
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="vtur-modal-notice text-center py-8 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                  <Smartphone size={32} class="mx-auto mb-2 opacity-50" />
                  <p>Nenhum app adicionado</p>
                  <p class="text-sm">Adicione apps úteis para a viagem</p>
                </div>
              {/if}
            </div>

            <!-- Emergência -->
            <div class="vtur-modal-section-compact bg-white rounded-xl p-6 shadow-xs border border-slate-200">
              <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Phone size={20} class="text-red-500" />
                Contatos de Emergência
              </h3>
              
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FieldInput
                  id="voucher-modal-emergencia-escritorio"
                  label="Escritório"
                  type="text"
                  value={form.extra_data.emergencia?.escritorio || ''}
                  placeholder="+55 11 9999-9999"
                  class_name="w-full"
                  on:input={(e) => form.extra_data = { 
                    ...form.extra_data, 
                    emergencia: { 
                      ...(form.extra_data.emergencia || {}), 
                      escritorio: eventValue(e) 
                    } 
                  }}
                />
                <FieldInput
                  id="voucher-modal-emergencia-24h"
                  label="Emergência 24h"
                  type="text"
                  value={form.extra_data.emergencia?.emergencia_24h || ''}
                  placeholder="+34 652 99 00 47"
                  class_name="w-full"
                  on:input={(e) => form.extra_data = { 
                    ...form.extra_data, 
                    emergencia: { 
                      ...(form.extra_data.emergencia || {}), 
                      emergencia_24h: eventValue(e) 
                    } 
                  }}
                />
                <FieldInput
                  id="voucher-modal-emergencia-whatsapp"
                  label="WhatsApp"
                  type="text"
                  value={form.extra_data.emergencia?.whatsapp || ''}
                  placeholder="+55 11 99999-9999"
                  class_name="w-full"
                  on:input={(e) => form.extra_data = { 
                    ...form.extra_data, 
                    emergencia: { 
                      ...(form.extra_data.emergencia || {}), 
                      whatsapp: eventValue(e) 
                    } 
                  }}
                />
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="vtur-modal-footer vtur-modal-footer--between border-t border-slate-200 bg-slate-50">
        <div>
          {#if currentStep > 0}
            <Button variant="secondary" on:click={prevStep}>
              ← Etapa Anterior
            </Button>
          {/if}
        </div>
        
        <div class="vtur-modal-footer__actions flex gap-3">
          <Button variant="secondary" on:click={close}>
            Cancelar
          </Button>
          
          {#if currentStep < steps.length - 1}
            <Button variant="primary" on:click={nextStep}>
              Próxima Etapa →
            </Button>
          {:else}
            <Button 
              variant="secondary" 
              on:click={() => save(false)}
              disabled={savingAsDraft}
            >
              {#if savingAsDraft}
                <span class="animate-spin mr-2">⏳</span>
                Salvando...
              {:else}
                <Save size={18} class="mr-2" />
                Salvar Rascunho
              {/if}
            </Button>
            
            <Button 
              variant="primary" 
              on:click={() => save(true)}
              disabled={saving}
            >
              {#if saving}
                <span class="animate-spin mr-2">⏳</span>
                Finalizando...
              {:else}
                <CheckCircle size={18} class="mr-2" />
                Finalizar Voucher
              {/if}
            </Button>
          {/if}
        </div>
      </div>
    </div>
</OverlayModal>
