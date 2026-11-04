<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import {
    Button,
    FieldInput,
    FieldSelect,
    FieldTextarea,
    LoadingState,
    PageHeader
  } from '$lib/components/ui';
  import { 
    Plus, ArrowLeft, Loader2, Save, CheckCircle, ChevronRight, 
    ChevronLeft, MapPin, Calendar, Hotel, Info, FileText,
    Users, Trash2, MoveUp, MoveDown, ChevronDown, ChevronUp,
    Plane, Phone, Smartphone, AlertCircle
  } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { fade, slide } from 'svelte/transition';
  import SelecaoFornecedor from './_components/SelecaoFornecedor.svelte';
  import WizardEtapas from './_components/WizardEtapas.svelte';
  import ImportacaoVoucher from './_components/ImportacaoVoucher.svelte';
  import { formatDateBR } from './_components/formatters';
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';
  import type { WizardForm } from './_components/types';
  import { 
    createEmptyVoucherImport, 
    extractVoucherImportFromFile,
    parseVoucherImportText,
    parseSpecialToursCircuitPasteText, 
    parseSpecialToursHotelPaste 
  } from '$lib/vouchers/import';
  import { 
    normalizeVoucherExtraData, 
    createBlankPassengerDetail, 
    buildPassengerSummary, 
    createBlankAppInfo 
  } from '$lib/vouchers/extraData';
  import { addDaysISODate, diffDaysISODate } from '$lib/date';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import type { 
    VoucherProvider, 
    VoucherDia, 
    VoucherHotel, 
    VoucherExtraData,
    VoucherImportResult
  } from '$lib/vouchers/types';

  // Tipo para o formulário do wizard

  let currentStep = 0;
  let loading = true;
  let saving = false;
  let companyId: string | null = null;
  // Quando o voucher é criado a partir da tela de detalhe de uma viagem
  // (botão "Adicionar Voucher"), a viagem chega via query param e o voucher
  // deve ser vinculado a ela (vouchers.viagem_id).
  const viagemId: string | null = $page.url.searchParams.get('viagem_id') || null;

  // Textos de importação
  let travelPasteText = '';
  let circuitPasteText = '';
  let hotelPasteText = '';
  let importingTravel = false;
  let importingCircuit = false;
  let importingHotels = false;
  let importingFile = false;
  let importedFileName = '';
  let importAccordion: string[] = [];
  
  // Accordion states
  let activeDayIndexes: number[] = [];
  let activeHotelIndexes: number[] = [];
  
  // Validação
  let validationErrors: Record<string, string> = {};

  const steps = [
    { id: 0, label: 'Dados da Viagem', icon: MapPin, description: 'Informações básicas do voucher' },
    { id: 1, label: 'Dia a Dia', icon: Calendar, description: 'Itinerário do circuito' },
    { id: 2, label: 'Hotéis', icon: Hotel, description: 'Acomodações confirmadas' },
    { id: 3, label: 'Extras', icon: Info, description: 'Traslados e informações adicionais' }
  ];

  const providers: { value: VoucherProvider; label: string; color: string }[] = [
    { value: 'special_tours', label: 'Special Tours', color: 'bg-blue-500' },
    { value: 'europamundo', label: 'Europamundo', color: 'bg-orange-500' },
    { value: 'sato_tours', label: 'Sato Tours', color: 'bg-emerald-500' }
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

  const hotelStatusOptions = [
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

  // Formulário inicial
  let form: WizardForm = {
    provider: 'special_tours',
    nome: '',
    codigo_sistema: '',
    codigo_fornecedor: '',
    reserva_online: '',
    passageiros: '',
    tipo_acomodacao: '',
    operador: '',
    resumo: '',
    data_inicio: '',
    data_fim: '',
    ativo: true,
    status: 'rascunho',
    extra_data: normalizeVoucherExtraData({}, 'special_tours'),
    dias: [],
    hoteis: []
  };
  const contextGuard = createLoadGuard();

  onMount(async () => {
    if (await loadUserContext()) {
      loading = false;
    }
  });

  async function loadUserContext() {
    const request = contextGuard.next();
    try {
      const data = await apiGet<{ company_id?: string | null }>(
        '/api/v1/user/context',
        undefined,
        request.signal
      );
      if (!contextGuard.isCurrent(request.seq)) return false;
      companyId = data.company_id || null;
      return true;
    } catch (err) {
      if (isCanceledApiError(err)) return false;
      companyId = null;
      return true;
    }
  }

  // ============ HELPERS ============

  function addDaysToDate(startDate: string, days: number): string {
    return addDaysISODate(startDate, days);
  }

  function diffNights(start?: string | null, end?: string | null): number | null {
    const diff = diffDaysISODate(start, end);
    if (diff === null) return null;
    return diff > 0 ? diff : 0;
  }

  function setVoucherProvider(provider: VoucherProvider) {
    if (form.provider === provider) return;

    form = {
      ...form,
      provider,
      extra_data: normalizeVoucherExtraData(form.extra_data, provider)
    };
  }

  // ============ ETAPA 1: DADOS DA VIAGEM ============
  function syncDaysWithStartDate() {
    if (!form.data_inicio) return;
    form.dias = form.dias.map((dia, index) => ({
      ...dia,
      data_referencia: addDaysToDate(form.data_inicio, index)
    }));
  }

  // ============ PASSAGEIROS ============
  function addPassenger() {
    const details = form.extra_data.passageiros_detalhes || [];
    form.extra_data = {
      ...form.extra_data,
      passageiros_detalhes: [...details, createBlankPassengerDetail(details.length)]
    };
    updatePassageirosSummary();
  }

  function removePassenger(index: number) {
    const details = (form.extra_data.passageiros_detalhes || []).filter((_, i) => i !== index);
    form.extra_data = { ...form.extra_data, passageiros_detalhes: details };
    updatePassageirosSummary();
  }

  function updatePassenger(index: number, field: string, value: string) {
    const details = [...(form.extra_data.passageiros_detalhes || [])];
    details[index] = { ...details[index], [field]: value };
    form.extra_data = { ...form.extra_data, passageiros_detalhes: details };
    updatePassageirosSummary();
  }

  function updatePassageirosSummary() {
    form.passageiros = buildPassengerSummary(form.extra_data.passageiros_detalhes || []);
  }

  // ============ ETAPA 2: DIAS ============
  function addDay() {
    const nextNum = form.dias.length + 1;
    form.dias = [...form.dias, {
      dia_numero: nextNum,
      titulo: '',
      descricao: '',
      data_referencia: form.data_inicio ? addDaysToDate(form.data_inicio, form.dias.length) : null,
      cidade: null,
      ordem: form.dias.length
    }];
    activeDayIndexes = [...activeDayIndexes, form.dias.length - 1];
  }

  function removeDay(index: number) {
    form.dias = form.dias.reduce<typeof form.dias>((items, dia, i) => {
      if (i !== index) items.push({ ...dia, dia_numero: items.length + 1, ordem: items.length });
      return items;
    }, []);
    activeDayIndexes = activeDayIndexes.reduce<number[]>((items, i) => {
      if (i !== index) items.push(i > index ? i - 1 : i);
      return items;
    }, []);
    syncDaysWithStartDate();
  }

  function moveDay(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= form.dias.length) return;
    const dias = [...form.dias];
    [dias[index], dias[newIndex]] = [dias[newIndex], dias[index]];
    form.dias = dias.map((d, i) => ({ ...d, dia_numero: i + 1, ordem: i }));
    syncDaysWithStartDate();
  }

  function applyImportedResult(
    imported: VoucherImportResult,
    options: { replaceDays?: boolean; replaceHotels?: boolean } = {}
  ) {
    const nextDays = options.replaceDays ? (imported.dias || []) : form.dias;
    const nextHotels = options.replaceHotels ? (imported.hoteis || []) : form.hoteis;

    form = {
      ...form,
      provider: imported.provider || form.provider,
      nome: imported.nome || form.nome,
      codigo_sistema: imported.codigo_sistema || form.codigo_sistema,
      codigo_fornecedor: imported.codigo_fornecedor || form.codigo_fornecedor,
      reserva_online: imported.reserva_online || form.reserva_online,
      passageiros: imported.passageiros || form.passageiros,
      tipo_acomodacao: imported.tipo_acomodacao || form.tipo_acomodacao,
      operador: imported.operador || form.operador,
      resumo: imported.resumo || form.resumo,
      data_inicio: imported.data_inicio || form.data_inicio,
      data_fim: imported.data_fim || form.data_fim,
      extra_data: normalizeVoucherExtraData(imported.extra_data || form.extra_data, imported.provider || form.provider),
      dias: nextDays.map((dia, index) => ({ ...dia, ordem: index, dia_numero: Number(dia.dia_numero || index + 1) })),
      hoteis: nextHotels.map((hotel, index) => ({ ...hotel, ordem: index }))
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
      const structuredHotels = parseSpecialToursHotelPaste(hotelPasteText, form.provider);
      const imported = structuredHotels.hoteis.length
        ? structuredHotels
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

  // ============ ETAPA 3: HOTÉIS ============
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

  function updateHotelDates(index: number, field: 'data_inicio' | 'data_fim', value: string) {
    form.hoteis[index][field] = value;
    form.hoteis[index].noites = diffNights(form.hoteis[index].data_inicio, form.hoteis[index].data_fim);
    form.hoteis = [...form.hoteis];
  }

  // ============ ETAPA 4: APPS ============
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

  // ============ NAVEGAÇÃO E VALIDAÇÃO ============
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
    if (step > currentStep && !validateStep(currentStep)) {
      toast.error('Preencha os campos obrigatórios antes de avançar');
      return;
    }
    currentStep = step;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function nextStep() {
    if (currentStep < steps.length - 1) {
      if (validateStep(currentStep)) {
        currentStep++;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        toast.error('Preencha os campos obrigatórios antes de avançar');
      }
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      currentStep--;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function getStepStatus(stepIndex: number): 'completed' | 'current' | 'pending' {
    if (stepIndex < currentStep) return 'completed';
    if (stepIndex === currentStep) return 'current';
    return 'pending';
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

  // ============ SALVAMENTO ============
  async function saveVoucher(finalizar = false) {
    if (!companyId) {
      toast.error('Selecione uma empresa');
      return;
    }
    
    if (!form.nome.trim()) {
      validationErrors.nome = 'Nome do voucher é obrigatório';
      currentStep = 0;
      toast.error('Informe o nome do voucher');
      return;
    }

    saving = true;
    
    try {
      const payload = {
        company_id: companyId,
        provider: form.provider,
        nome: form.nome,
        codigo_sistema: form.codigo_sistema || null,
        codigo_fornecedor: form.codigo_fornecedor || null,
        reserva_online: form.reserva_online || null,
        passageiros: form.passageiros || null,
        tipo_acomodacao: form.tipo_acomodacao || null,
        operador: form.operador || null,
        resumo: form.resumo || null,
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        ativo: true,
        status: finalizar ? 'finalizado' : 'rascunho',
        extra_data: form.extra_data,
        dias: form.dias,
        hoteis: form.hoteis,
        viagem_id: viagemId
      };

      await apiPost('/api/v1/vouchers', payload);
      
      toast.success(finalizar ? 'Voucher finalizado com sucesso!' : 'Rascunho salvo com sucesso!');
      goto('/operacao/vouchers');
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Erro ao salvar voucher'));
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>Novo Voucher | VTUR</title>
</svelte:head>

<PageHeader 
  title="Novo Voucher"
  subtitle="Crie um voucher completo em 4 etapas"
  color="clientes"
  breadcrumbs={[
    { label: 'Vouchers', href: '/operacao/vouchers' },
    { label: 'Novo' }
  ]}
  actions={[
    {
      label: 'Voltar',
      href: '/operacao/vouchers',
      variant: 'secondary',
      icon: ArrowLeft
    }
  ]}
/>

{#if loading}
  <LoadingState />
{:else}
  <div class="max-w-6xl mx-auto pb-20">
    <SelecaoFornecedor {providers} provider={form.provider} {setVoucherProvider} />

    <WizardEtapas {steps} {goToStep} {getStepStatus} />

    <!-- Conteúdo do Wizard -->
    <div class="bg-white rounded-xl shadow-xs border border-slate-200 p-6 md:p-8">
      
      <!-- ETAPA 1: DADOS DA VIAGEM -->
      {#if currentStep === 0}
        <div in:fade={{ duration: 200 }}>
          <div class="flex items-center gap-3 mb-6">
            <div class="w-12 h-12 rounded-xl bg-clientes-100 text-clientes-600 flex items-center justify-center">
              <MapPin size={24} />
            </div>
            <div>
              <h2 class="text-xl font-bold text-slate-900">Dados da Viagem</h2>
              <p class="text-slate-500">Informações básicas do voucher</p>
            </div>
          </div>

          <div class="space-y-6">
            <ImportacaoVoucher
              bind:travelPasteText
              bind:circuitPasteText
              bind:hotelPasteText
              {importingTravel}
              {importingCircuit}
              {importingHotels}
              {importingFile}
              {importedFileName}
              {importAccordion}
              {importTravelFromPaste}
              {importItineraryFromPaste}
              {importHotelsFromPasteUnified}
              {importFromFile}
              {toggleImportAccordion}
            />

            <!-- Informações Principais -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldInput
                id="voucher-nome"
                label="Nome do Voucher"
                bind:value={form.nome}
                required={true}
                error={validationErrors.nome}
                placeholder="Ex: Circuito Europa 2024 - Lisboa, Madrid e Paris"
                class_name="md:col-span-2"
              />

              <FieldInput
                id="voucher-codigo-sistema"
                label="Código interno"
                bind:value={form.codigo_sistema}
                placeholder="Código interno"
              />

              <FieldInput
                id="voucher-codigo-fornecedor"
                label="Código Fornecedor"
                bind:value={form.codigo_fornecedor}
                placeholder="Código do fornecedor"
              />

              <FieldInput
                id="voucher-reserva-online"
                label="Reserva Online"
                bind:value={form.reserva_online}
                placeholder="Número da reserva"
              />

              <FieldInput
                id="voucher-localizador-agencia"
                label="Localizador Agência"
                value={form.extra_data.localizador_agencia || ''}
                placeholder="Localizador"
                on:input={(e) => form.extra_data = { ...form.extra_data, localizador_agencia: (e.currentTarget as HTMLInputElement).value }}
              />
            </div>

            <!-- Datas -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 bg-blue-50 rounded-xl border border-blue-100">
              <FieldInput
                id="voucher-data-inicio"
                label="Data Início"
                type="date"
                bind:value={form.data_inicio}
                required={true}
                error={validationErrors.data_inicio}
                on:change={syncDaysWithStartDate}
              />

              <FieldInput
                id="voucher-data-fim"
                label="Data Fim"
                type="date"
                bind:value={form.data_fim}
                min={form.data_inicio || null}
              />
            </div>

            <!-- Acomodação e Operador -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldSelect
                id="voucher-tipo-acomodacao"
                label="Tipo de Acomodação"
                bind:value={form.tipo_acomodacao}
                options={acomodacaoSelectOptions}
                placeholder="Selecione uma opção"
              />

              <FieldInput
                id="voucher-operador"
                label="Operador Responsável"
                bind:value={form.operador}
                placeholder="Nome do operador"
              />
            </div>

            <!-- Passageiros -->
            <div class="p-5 bg-slate-50 rounded-xl border border-slate-200">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-slate-900 flex items-center gap-2">
                  <Users size={18} class="text-clientes-500" />
                  Passageiros
                </h3>
                <Button variant="secondary" size="sm" on:click={addPassenger}>
                  <Plus size={14} class="mr-1" />
                  Adicionar
                </Button>
              </div>
              
              {#if form.extra_data.passageiros_detalhes?.length}
                <div class="space-y-3">
                  {#each form.extra_data.passageiros_detalhes as passenger, i}
                    <div class="p-4 bg-white rounded-lg border border-slate-200 shadow-xs">
                      <div class="flex items-center justify-between mb-3">
                        <span class="text-sm font-medium text-slate-700">Passageiro {i + 1}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          color="red"
                          on:click={() => removePassenger(i)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <FieldInput
                          id={`voucher-passageiro-nome-${i}`}
                          label="Nome Completo"
                          value={passenger.nome}
                          placeholder="Nome do passageiro"
                          class_name="md:col-span-2"
                          on:input={(e) => updatePassenger(i, 'nome', (e.currentTarget as HTMLInputElement).value)}
                        />
                        <FieldInput
                          id={`voucher-passageiro-passaporte-${i}`}
                          label="Passaporte"
                          value={passenger.passaporte || ''}
                          placeholder="Número"
                          on:input={(e) => updatePassenger(i, 'passaporte', (e.currentTarget as HTMLInputElement).value)}
                        />
                        <FieldInput
                          id={`voucher-passageiro-data-${i}`}
                          label="Data Nasc."
                          type="date"
                          value={passenger.data_nascimento || ''}
                          on:input={(e) => updatePassenger(i, 'data_nascimento', (e.currentTarget as HTMLInputElement).value)}
                        />
                        <FieldInput
                          id={`voucher-passageiro-nacionalidade-${i}`}
                          label="Nacionalidade"
                          value={passenger.nacionalidade || ''}
                          placeholder="Ex: Brasileira"
                          on:input={(e) => updatePassenger(i, 'nacionalidade', (e.currentTarget as HTMLInputElement).value)}
                        />
                        <FieldSelect
                          id={`voucher-passageiro-tipo-${i}`}
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
                <div class="text-center py-8 text-slate-400 border-2 border-dashed border-slate-300 rounded-lg">
                  <Users size={32} class="mx-auto mb-2 opacity-50" />
                  <p class="text-sm">Nenhum passageiro adicionado</p>
                  <Button variant="ghost" size="sm" class_name="mt-2" on:click={addPassenger}>
                    <Plus size={14} class="mr-1" />
                    Adicionar Passageiro
                  </Button>
                </div>
              {/if}
            </div>

            <!-- Resumo -->
            <FieldTextarea
              id="voucher-resumo"
              label="Resumo da Viagem"
              bind:value={form.resumo}
              rows={4}
              placeholder="Descreva o resumo da viagem..."
            />
          </div>
        </div>

      <!-- ETAPA 2: DIA A DIA -->
      {:else if currentStep === 1}
        <div in:fade={{ duration: 200 }}>
          <div class="flex items-center gap-3 mb-6">
            <div class="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
              <Calendar size={24} />
            </div>
            <div>
              <h2 class="text-xl font-bold text-slate-900">Dia a Dia do Circuito</h2>
              <p class="text-slate-500">Itinerário detalhado da viagem</p>
            </div>
          </div>

          <div class="space-y-6">

            <!-- Lista de Dias -->
            <div>
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-slate-900">Dias do Circuito ({form.dias.length})</h3>
                <Button variant="primary" size="sm" on:click={addDay}>
                  <Plus size={14} class="mr-1" />
                  Adicionar Dia
                </Button>
              </div>

              {#if form.dias.length === 0}
                <div class="text-center py-12 text-slate-400 border-2 border-dashed border-slate-300 rounded-xl">
                  <Calendar size={48} class="mx-auto mb-3 opacity-50" />
                  <p class="font-medium">Nenhum dia adicionado</p>
                  <p class="text-sm mt-1">Importe ou adicione os dias do circuito</p>
                </div>
              {:else}
                <div class="space-y-3">
                  {#each form.dias as dia, i}
                    <div class="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                      <div class="flex items-stretch justify-between bg-slate-50 transition-colors">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          class_name="flex flex-1 justify-start! gap-4 rounded-none! border-0! bg-transparent! px-4! py-4! text-left! shadow-none! hover:bg-slate-100!"
                          on:click={() => toggleDayAccordion(i)}
                        >
                          <div class="w-10 h-10 rounded-full bg-clientes-500 text-white flex items-center justify-center font-bold">
                            {dia.dia_numero}
                          </div>
                          <div>
                            <p class="font-medium text-slate-900">{dia.titulo || `Dia ${dia.dia_numero}`}</p>
                            {#if dia.data_referencia}
                              <p class="text-sm text-slate-500">{formatDateBR(dia.data_referencia)} • {dia.cidade || 'Sem cidade'}</p>
                            {/if}
                          </div>
                          <svelte:component 
                            this={activeDayIndexes.includes(i) ? ChevronUp : ChevronDown} 
                            size={20} 
                            class="text-slate-400 ml-auto"
                          />
                        </Button>
                        <div class="flex items-center gap-2 px-4">
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
                        <div class="p-4 space-y-4 border-t border-slate-100" transition:slide>
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FieldInput
                              id={`voucher-dia-titulo-${i}`}
                              label="Título do Dia"
                              type="text"
                              bind:value={dia.titulo}
                              placeholder="Ex: Lisboa - Chegada"
                            />
                            <CidadeDestinoAutocomplete
                              id={`voucher-dia-cidade-${i}`}
                              label="Cidade"
                              bind:value={dia.cidade}
                              placeholder="Nome da cidade"
                              endpoint="/api/v1/viagens/cidades-busca"
                            />
                          </div>
                          <FieldTextarea
                            id={`voucher-dia-descricao-${i}`}
                            label="Descrição das Atividades"
                            bind:value={dia.descricao}
                            rows={5}
                            placeholder="Descreva as atividades do dia..."
                          />
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>

      <!-- ETAPA 3: HOTÉIS -->
      {:else if currentStep === 2}
        <div in:fade={{ duration: 200 }}>
          <div class="flex items-center gap-3 mb-6">
            <div class="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
              <Hotel size={24} />
            </div>
            <div>
              <h2 class="text-xl font-bold text-slate-900">Hotéis Confirmados</h2>
              <p class="text-slate-500">Acomodações durante a viagem</p>
            </div>
          </div>

          <div class="space-y-6">

            <!-- Lista de Hotéis -->
            <div>
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-slate-900">Hotéis ({form.hoteis.length})</h3>
                <Button variant="primary" size="sm" on:click={addHotel}>
                  <Plus size={14} class="mr-1" />
                  Adicionar Hotel
                </Button>
              </div>

              {#if form.hoteis.length === 0}
                <div class="text-center py-12 text-slate-400 border-2 border-dashed border-slate-300 rounded-xl">
                  <Hotel size={48} class="mx-auto mb-3 opacity-50" />
                  <p class="font-medium">Nenhum hotel adicionado</p>
                  <p class="text-sm mt-1">Importe ou adicione os hotéis</p>
                </div>
              {:else}
                <div class="space-y-3">
                  {#each form.hoteis as hotel, i}
                    <div class="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                      <div class="flex items-stretch justify-between bg-slate-50 transition-colors">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          class_name="flex flex-1 justify-start! gap-4 rounded-none! border-0! bg-transparent! px-4! py-4! text-left! shadow-none! hover:bg-slate-100!"
                          on:click={() => toggleHotelAccordion(i)}
                        >
                          <div class="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center">
                            <Hotel size={20} />
                          </div>
                          <div>
                            <p class="font-medium text-slate-900">{hotel.hotel || `Hotel ${i + 1}`}</p>
                            <p class="text-sm text-slate-500">{hotel.cidade || 'Sem cidade'} • {hotel.noites || 0} noites</p>
                          </div>
                          <svelte:component 
                            this={activeHotelIndexes.includes(i) ? ChevronUp : ChevronDown} 
                            size={20} 
                            class="text-slate-400 ml-auto"
                          />
                        </Button>
                        <div class="flex items-center gap-2 px-4">
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
                        <div class="p-4 space-y-4 border-t border-slate-100" transition:slide>
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <CidadeDestinoAutocomplete
                              id={`voucher-hotel-cidade-${i}`}
                              label="Cidade"
                              required={true}
                              bind:value={hotel.cidade}
                              placeholder="Nome da cidade"
                              endpoint="/api/v1/viagens/cidades-busca"
                            />
                            <FieldInput
                              id={`voucher-hotel-nome-${i}`}
                              label="Hotel"
                              required={true}
                              bind:value={hotel.hotel}
                              placeholder="Nome do hotel"
                            />
                          </div>
                          
                          <FieldInput
                            id={`voucher-hotel-endereco-${i}`}
                            label="Endereço"
                            type="text"
                            value={hotel.endereco || ''}
                            on:input={(e) => hotel.endereco = (e.currentTarget as HTMLInputElement).value}
                            placeholder="Endereço completo"
                          />
                          
                          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FieldInput
                              id={`voucher-hotel-checkin-${i}`}
                              label="Check-in"
                              type="date"
                              value={hotel.data_inicio || ''}
                              on:input={(e) => updateHotelDates(i, 'data_inicio', (e.currentTarget as HTMLInputElement).value)}
                            />
                            <FieldInput
                              id={`voucher-hotel-checkout-${i}`}
                              label="Check-out"
                              type="date"
                              value={hotel.data_fim || ''}
                              min={hotel.data_inicio || null}
                              on:input={(e) => updateHotelDates(i, 'data_fim', (e.currentTarget as HTMLInputElement).value)}
                            />
                            <FieldInput
                              id={`voucher-hotel-noites-${i}`}
                              label="Noites"
                              type="number"
                              value={hotel.noites != null ? String(hotel.noites) : ''}
                              readonly={true}
                            />
                          </div>
                          
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FieldInput
                              id={`voucher-hotel-telefone-${i}`}
                              label="Telefone"
                              type="text"
                              value={hotel.telefone || ''}
                              on:input={(e) => hotel.telefone = (e.currentTarget as HTMLInputElement).value}
                              placeholder="Telefone do hotel"
                            />
                            <FieldInput
                              id={`voucher-hotel-contato-${i}`}
                              label="Contato"
                              type="text"
                              value={hotel.contato || ''}
                              on:input={(e) => hotel.contato = (e.currentTarget as HTMLInputElement).value}
                              placeholder="Nome do contato"
                            />
                          </div>
                          
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FieldSelect
                              id={`voucher-hotel-status-${i}`}
                              label="Status"
                              value={hotel.status || ''}
                              on:change={(e) => hotel.status = (e.currentTarget as HTMLSelectElement).value}
                              options={[{ value: '', label: 'Selecione uma opção' }, ...hotelStatusOptions]}
                            />
                          </div>
                          
                          <FieldTextarea
                            id={`voucher-hotel-observacao-${i}`}
                            label="Observação"
                            value={hotel.observacao || ''}
                            on:input={(e) => hotel.observacao = (e.currentTarget as HTMLTextAreaElement).value}
                            rows={2}
                            placeholder="Observações sobre o hotel..."
                          />
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>

      <!-- ETAPA 4: EXTRA DATA -->
      {:else if currentStep === 3}
        <div in:fade={{ duration: 200 }}>
          <div class="flex items-center gap-3 mb-6">
            <div class="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
              <Info size={24} />
            </div>
            <div>
              <h2 class="text-xl font-bold text-slate-900">Informações Adicionais</h2>
              <p class="text-slate-500">Traslados, apps e contatos de emergência</p>
            </div>
          </div>

          <div class="space-y-6">
            <!-- Traslados -->
            <div class="p-5 bg-slate-50 rounded-xl border border-slate-200">
              <h3 class="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Plane size={20} class="text-clientes-500" />
                Traslados
              </h3>
              
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Chegada -->
                <div class="p-4 bg-green-50 rounded-lg border border-green-200">
                  <h4 class="font-medium text-green-900 mb-3 flex items-center gap-2">
                    <Plane size={16} class="rotate-45" />
                    Traslado Chegada
                  </h4>
                  <div class="space-y-3">
                    <FieldTextarea
                      id="voucher-traslado-chegada-detalhes"
                      label="Detalhes"
                      value={form.extra_data.traslado_chegada?.detalhes || ''}
                      on:input={(e) => form.extra_data = { 
                        ...form.extra_data, 
                        traslado_chegada: { 
                          ...(form.extra_data.traslado_chegada || {}), 
                          detalhes: (e.currentTarget as HTMLTextAreaElement).value 
                        } 
                      }}
                      rows={3}
                      placeholder="Detalhes do traslado de chegada..."
                    />
                    <FieldTextarea
                      id="voucher-traslado-chegada-notas"
                      label="Notas"
                      value={form.extra_data.traslado_chegada?.notas || ''}
                      on:input={(e) => form.extra_data = { 
                        ...form.extra_data, 
                        traslado_chegada: { 
                          ...(form.extra_data.traslado_chegada || {}), 
                          notas: (e.currentTarget as HTMLTextAreaElement).value 
                        } 
                      }}
                      rows={2}
                      placeholder="Notas importantes..."
                    />
                    <FieldInput
                      id="voucher-traslado-chegada-telefone"
                      label="Telefone Transferista"
                      type="text"
                      value={form.extra_data.traslado_chegada?.telefone_transferista || ''}
                      on:input={(e) => form.extra_data = { 
                        ...form.extra_data, 
                        traslado_chegada: { 
                          ...(form.extra_data.traslado_chegada || {}), 
                          telefone_transferista: (e.currentTarget as HTMLInputElement).value 
                        } 
                      }}
                      placeholder="+34 999 999 999"
                    />
                  </div>
                </div>

                <!-- Saída -->
                <div class="p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <h4 class="font-medium text-orange-900 mb-3 flex items-center gap-2">
                    <Plane size={16} class="-rotate-45" />
                    Traslado Saída
                  </h4>
                  <div class="space-y-3">
                    <FieldTextarea
                      id="voucher-traslado-saida-detalhes"
                      label="Detalhes"
                      value={form.extra_data.traslado_saida?.detalhes || ''}
                      on:input={(e) => form.extra_data = { 
                        ...form.extra_data, 
                        traslado_saida: { 
                          ...(form.extra_data.traslado_saida || {}), 
                          detalhes: (e.currentTarget as HTMLTextAreaElement).value 
                        } 
                      }}
                      rows={3}
                      placeholder="Detalhes do traslado de saída..."
                    />
                    <FieldTextarea
                      id="voucher-traslado-saida-notas"
                      label="Notas"
                      value={form.extra_data.traslado_saida?.notas || ''}
                      on:input={(e) => form.extra_data = { 
                        ...form.extra_data, 
                        traslado_saida: { 
                          ...(form.extra_data.traslado_saida || {}), 
                          notas: (e.currentTarget as HTMLTextAreaElement).value 
                        } 
                      }}
                      rows={2}
                      placeholder="Notas importantes..."
                    />
                    <FieldInput
                      id="voucher-traslado-saida-telefone"
                      label="Telefone Transferista"
                      type="text"
                      value={form.extra_data.traslado_saida?.telefone_transferista || ''}
                      on:input={(e) => form.extra_data = { 
                        ...form.extra_data, 
                        traslado_saida: { 
                          ...(form.extra_data.traslado_saida || {}), 
                          telefone_transferista: (e.currentTarget as HTMLInputElement).value 
                        } 
                      }}
                      placeholder="+34 999 999 999"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- Informações Importantes -->
            <div class="p-5 bg-amber-50 rounded-xl border border-amber-200">
              <h3 class="font-semibold text-amber-900 mb-3 flex items-center gap-2">
                <AlertCircle size={20} />
                Informações Importantes
              </h3>
              <FieldTextarea
                value={form.extra_data.informacoes_importantes || ''}
                on:input={(e) => form.extra_data = { ...form.extra_data, informacoes_importantes: (e.currentTarget as HTMLTextAreaElement).value }}
                rows={5}
                placeholder="Liste aqui as informações importantes para o passageiro..."
              />
            </div>

            <!-- Apps -->
            <div class="p-5 bg-blue-50 rounded-xl border border-blue-200">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-blue-900 flex items-center gap-2">
                  <Smartphone size={20} />
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
                    <div class="p-4 bg-white rounded-lg border border-blue-200 shadow-xs">
                      <div class="flex items-center justify-between mb-3">
                        <span class="text-sm font-medium text-slate-700">App {i + 1}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          color="red"
                          on:click={() => removeApp(i)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <FieldInput
                          id={`voucher-app-nome-${i}`}
                          label="Nome"
                          type="text"
                          value={app.nome}
                          on:input={(e) => updateApp(i, 'nome', (e.currentTarget as HTMLInputElement).value)}
                          placeholder="Ex: Google Tradutor"
                        />
                        <FieldInput
                          id={`voucher-app-descricao-${i}`}
                          label="Descrição"
                          type="text"
                          value={app.descricao || ''}
                          on:input={(e) => updateApp(i, 'descricao', (e.currentTarget as HTMLInputElement).value)}
                          placeholder="Para que serve"
                        />
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="text-center py-6 text-blue-400 border-2 border-dashed border-blue-300 rounded-lg">
                  <Smartphone size={32} class="mx-auto mb-2 opacity-50" />
                  <p class="text-sm">Nenhum app adicionado</p>
                </div>
              {/if}
            </div>

            <!-- Emergência -->
            <div class="p-5 bg-red-50 rounded-xl border border-red-200">
              <h3 class="font-semibold text-red-900 mb-4 flex items-center gap-2">
                <Phone size={20} />
                Contatos de Emergência
              </h3>
              
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FieldInput
                  id="voucher-emergencia-escritorio"
                  label="Escritório"
                  type="text"
                  value={form.extra_data.emergencia?.escritorio || ''}
                  on:input={(e) => form.extra_data = { 
                    ...form.extra_data, 
                    emergencia: { 
                      ...(form.extra_data.emergencia || {}), 
                      escritorio: (e.currentTarget as HTMLInputElement).value 
                    } 
                  }}
                  placeholder="+55 11 9999-9999"
                />
                <FieldInput
                  id="voucher-emergencia-24h"
                  label="Emergência 24h"
                  type="text"
                  value={form.extra_data.emergencia?.emergencia_24h || ''}
                  on:input={(e) => form.extra_data = { 
                    ...form.extra_data, 
                    emergencia: { 
                      ...(form.extra_data.emergencia || {}), 
                      emergencia_24h: (e.currentTarget as HTMLInputElement).value 
                    } 
                  }}
                  placeholder="+34 652 99 00 47"
                />
                <FieldInput
                  id="voucher-emergencia-whatsapp"
                  label="WhatsApp"
                  type="text"
                  value={form.extra_data.emergencia?.whatsapp || ''}
                  on:input={(e) => form.extra_data = { 
                    ...form.extra_data, 
                    emergencia: { 
                      ...(form.extra_data.emergencia || {}), 
                      whatsapp: (e.currentTarget as HTMLInputElement).value 
                    } 
                  }}
                  placeholder="+55 11 99999-9999"
                />
              </div>
            </div>

            <!-- Preview Final -->
            <div class="p-5 bg-clientes-50 rounded-xl border border-clientes-200">
              <h3 class="font-semibold text-clientes-900 mb-4">Resumo do Voucher</h3>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div class="p-3 bg-white rounded-lg">
                  <p class="text-2xl font-bold text-clientes-600">{form.dias.length}</p>
                  <p class="text-sm text-slate-600">Dias</p>
                </div>
                <div class="p-3 bg-white rounded-lg">
                  <p class="text-2xl font-bold text-clientes-600">{form.hoteis.length}</p>
                  <p class="text-sm text-slate-600">Hotéis</p>
                </div>
                <div class="p-3 bg-white rounded-lg">
                  <p class="text-2xl font-bold text-clientes-600">{form.extra_data.passageiros_detalhes?.length || 0}</p>
                  <p class="text-sm text-slate-600">Passageiros</p>
                </div>
                <div class="p-3 bg-white rounded-lg">
                  <p class="text-2xl font-bold text-clientes-600">{form.extra_data.apps_recomendados?.length || 0}</p>
                  <p class="text-sm text-slate-600">Apps</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Navegação -->
      <div class="flex justify-between items-center mt-8 pt-6 border-t border-slate-200">
        <div>
          {#if currentStep > 0}
            <Button variant="secondary" on:click={prevStep}>
              <ChevronLeft size={18} class="mr-1" />
              Etapa Anterior
            </Button>
          {:else}
            <Button variant="secondary" href="/operacao/vouchers">
              <ArrowLeft size={18} class="mr-1" />
              Voltar
            </Button>
          {/if}
        </div>

        <div class="flex items-center gap-2">
          <span class="text-sm text-slate-500 hidden sm:inline">
            Etapa {currentStep + 1} de {steps.length}
          </span>
        </div>

        <div class="flex gap-3">
          {#if currentStep < steps.length - 1}
            <Button variant="primary" on:click={nextStep}>
              Próxima Etapa
              <ChevronRight size={18} class="ml-1" />
            </Button>
          {:else}
            <Button 
              variant="secondary" 
              on:click={() => saveVoucher(false)}
              disabled={saving}
            >
              {#if saving}
                <Loader2 size={18} class="mr-2 animate-spin" />
              {:else}
                <Save size={18} class="mr-2" />
              {/if}
              Salvar Rascunho
            </Button>
            
            <Button 
              variant="primary" 
              on:click={() => saveVoucher(true)}
              disabled={saving}
            >
              {#if saving}
                <Loader2 size={18} class="mr-2 animate-spin" />
              {:else}
                <CheckCircle size={18} class="mr-2" />
              {/if}
              Finalizar Voucher
            </Button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
