<script lang="ts">
  import { VTUR_LOGO_URL } from '$lib/brand';
  import { formatISODateBR, parseISODateParts } from '$lib/date';
  import { explicitarIdentidadeCidade, VERSAO_ROTEIRO_IDENTIDADE } from '$lib/roteiroProtocolo';
  import { revisaoRoteiroAtiva, roteiroGeograficoAtivo } from '$lib/config/destinosGeograficos';
  import { salvarRoteiroComConfirmacao } from '$lib/features/roteiros/salvarComConfirmacao';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onDestroy, onMount, tick } from 'svelte';
  import { browserData as dados } from '$lib/db/browserData';
  import { construirLinkWhatsApp } from '$lib/whatsapp';
  import { mergeImportedRoteiroAereo, parseImportedRoteiroAereo } from '$lib/roteiroAereoImport';
  import { parseImportedRoteiroHotels } from '$lib/roteiroHotelImport';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Tabs from '$lib/components/ui/Tabs.svelte';
  import {
    FieldCheckbox,
    FieldDatalistInput,
    FieldInput,
    FieldSelect,
    FieldTextarea,
    LoadingState
  } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { confirmAction } from '$lib/stores/confirm';
  import { fetchImageAsDataUrl } from '$lib/utils/browser-images';
  import {
    ArrowLeft,
    Plus,
    Trash2,
    Save,
    ChevronUp,
    ChevronDown,
    FileText,
    DollarSign,
    RefreshCw,
    Copy,
    Pencil,
    Search,
    User,
    X,
    Whatsapp
  } from '$lib/icons';
  import { ApiError, apiFetch, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { ensureServerSessionCookie } from '$lib/services/session';
  import { toUserMessage } from '$lib/utils/errors';
  import { safeOpenNewTab } from '$lib/security/url';
  import {
    addItem,
    moveDown,
    moveUp,
    newDia,
    newHotel,
    newInvestimento,
    newPagamento,
    newPasseio,
    newTransporte,
    removeItem,
    reorder,
    updateItem,
    type DiaBuscaResult,
    type RotDia,
    type RotHotel,
    type RotInvestimento,
    type RotPagamento,
    type RotPasseio,
    type RotPasseioDetalhes,
    type RotTransporte
  } from './_components/tipos';
  import {
    isImportSectionHeader,
    normalizeImportLine,
    parseDiasImportText
  } from './_components/importacao-dias';
  import { formatBRL } from './_components/formatadores';
  import { atualizarDataHotel } from './_components/hotel-datas';
  import { renderPreviewDia } from './_components/preview-dia';
  import {
    buildRoteiroCardSection,
    categoriaPasseioPdf,
    renderPreviewCarros,
    renderPreviewFlights,
    renderPreviewHotels,
    renderPreviewInvestimentos,
    renderPreviewPasseios,
    renderPreviewSeguros,
    renderPreviewTrens
  } from './_components/preview-cards';
  import { nomeCidadeNoPdf } from './_components/preview-cidade';
  import { roteiroCardStyles } from '$lib/utils/printLayout';
  import { roteiroCheckChips, roteiroPdfThemeCss, roteiroXChips } from '$lib/quote/roteiroPdfTheme';
  import { roteiroFlightStyles } from '$lib/quote/printFlights';
  import AbaItinerario from './_components/AbaItinerario.svelte';
  import CidadeRoteiro from './_components/CidadeRoteiro.svelte';
  import AbaTransporte from './_components/AbaTransporte.svelte';
  import AbaHoteis from './_components/AbaHoteis.svelte';
  import AbaOpcionais from './_components/AbaOpcionais.svelte';
  import {
    atribuirIdsGruposOpcionais,
    buildOpcionaisHtml,
    parseRoteiroOpcionais,
    removerPasseiosIncorporados,
    type RoteiroOpcionalCidade
  } from '$lib/roteiroOpcionais';
  import { atribuirIdsRegistros, renovarIdsRegistros } from '$lib/roteiroRegistros';
  import AbaPasseios from './_components/AbaPasseios.svelte';
  import AbaPagamento from './_components/AbaPagamento.svelte';
  import AbaInvestimento from './_components/AbaInvestimento.svelte';

  // ─── Types ─────────────────────────────────────────────────────────────────

  type PdfSettings = {
    consultor_nome?: string;
    filial_nome?: string;
    endereco_linha1?: string;
    endereco_linha2?: string;
    endereco_linha3?: string;
    telefone?: string;
    whatsapp?: string;
    whatsapp_codigo_pais?: string;
    email?: string;
    rodape_texto?: string;
    imagem_complementar_url?: string;
    imagem_complementar_path?: string;
  };

  type PreviewPdfAssets = {
    qrUrl: string | null;
    complementUrl: string | null;
  };

  type RoteiroPayload = {
    revisao?: string;
    nome?: string | null;
    duracao?: number | string | null;
    inicio_cidade?: string | null;
    fim_cidade?: string | null;
    inclui_texto?: string | null;
    nao_inclui_texto?: string | null;
    informacoes_importantes?: string | null;
    mostrar_pagamento_pdf?: boolean | null;
    mostrar_informacoes_pdf?: boolean | null;
    mostrar_rodape_pdf?: boolean | null;
    cliente_id?: string | null;
    cliente_nome?: string | null;
    cliente_telefone?: string | null;
    cliente_email?: string | null;
    dias?: RotDia[] | null;
    hoteis?: RotHotel[] | null;
    passeios?: RotPasseio[] | null;
    opcionais?: RoteiroOpcionalCidade[] | null;
    transportes?: RotTransporte[] | null;
    investimentos?: RotInvestimento[] | null;
    pagamentos?: RotPagamento[] | null;
  };

  type RoteiroResponse = {
    roteiro: RoteiroPayload;
  };

  type SugestoesBuscaResponse = Record<string, string[]>;

  type OrcamentosPdfResponse = {
    settings?: PdfSettings | null;
  };

  // ─── Constants ─────────────────────────────────────────────────────────────
  const ABAS = [
    { id: 'itinerario', label: 'Itinerário' },
    { id: 'transporte', label: 'Passagem Aérea' },
    { id: 'aluguel-carro', label: 'Aluguel de Carro' },
    { id: 'hoteis', label: 'Hotéis' },
    { id: 'trem', label: 'Trem' },
    { id: 'passeios', label: 'Passeios' },
    { id: 'opcionais', label: 'Opcionais' },
    { id: 'seguro-viagem', label: 'Seguro Viagem' },
    { id: 'investimento', label: 'Investimento' },
    { id: 'pagamento', label: 'Pagamento' },
    { id: 'inclusoes', label: 'Inclusões' },
    { id: 'informacoes', label: 'Informações' }
  ] as const;

  type AbaId = (typeof ABAS)[number]['id'];

  const HOTEL_REGIME_OPTIONS = [
    'Café da manhã',
    'Meia pensão',
    'Pensão completa',
    'All-inclusive',
    'Apenas hospedagem'
  ];
  const HOTEL_CATEGORIA_OPTIONS = [
    '1 estrela',
    '2 estrelas',
    '3 estrelas',
    '4 estrelas',
    '5 estrelas',
    'Boutique',
    'Pousada',
    'Resort'
  ];
  const PASSEIO_TIPO_OPTIONS = ['Passeio', 'Show', 'Ingresso', 'Transfer', 'Serviço', 'Outro'];
  const TRANSPORTE_TIPO_OPTIONS = ['Aéreo', 'Terrestre', 'Marítimo', 'Ferroviário'];
  const TRANSPORTE_TIPO_VOO_OPTIONS = ['Nacional', 'Internacional'];
  const INVESTIMENTO_TIPO_OPTIONS = ['Por pessoa', 'Por casal', 'Por família', 'Por apto'];
  const PAGAMENTO_SERVICO_OPTIONS = [
    'Pacote Completo',
    'Passagem Aérea',
    'Hospedagem',
    'Passeios e Serviços',
    'Seguro Viagem',
    'Demais Serviços'
  ];

  // ─── Page state ────────────────────────────────────────────────────────────
  const roteiroId = $page.params.id;

  let loading = $state(true);
  let loadError = $state('');
  let saving = $state(false);
  let duplicating = $state(false);
  let previewingPdf = $state(false);
  let incluirCabecalhoRodapePdf = $state(false);
  let editandoDadosRoteiro = $state(false);
  let abaAtiva: AbaId = $state('itinerario');

  function selecionarAba(key: string) {
    const aba = ABAS.find((item) => item.id === key);
    if (aba) abaAtiva = aba.id;
  }

  // Form fields
  let nome = $state('');
  let revisao = $state<string | undefined>();
  let duracao = $state('');
  let modeloPdfRoteiro: 'completo' | 'moderno' = $state('completo');
  let inicioCidade = $state('');
  let fimCidade = $state('');
  let incluiTexto = $state('');
  let naoIncluiTexto = $state('');
  let informacoesImportantes = $state('');
  let mostrarPagamentoPdf = $state(true);
  let mostrarInformacoesPdf = $state(true);
  let mostrarRodapePdf = $state(true);
  let clienteId = $state('');
  let clienteNome = $state('');
  let clienteTelefone = $state('');
  let clienteEmail = $state('');

  function parsePasseioDetalhes(value: unknown): RotPasseioDetalhes | null {
    if (!value) return null;
    if (typeof value === 'object' && !Array.isArray(value)) return value as RotPasseioDetalhes;
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as RotPasseioDetalhes)
        : null;
    } catch {
      return null;
    }
  }

  function mergeCidadesVisitadas(inicio?: string | null, fim?: string | null): string {
    const origem = String(inicio || '').trim();
    const destino = String(fim || '').trim();
    if (origem && destino && origem.toLowerCase() !== destino.toLowerCase()) {
      return `${origem} • ${destino}`;
    }
    return origem || destino;
  }

  // Lists
  let dias: RotDia[] = $state([]);
  let hoteis: RotHotel[] = $state([]);
  let passeios: RotPasseio[] = $state([]);
  let opcionais: RoteiroOpcionalCidade[] = $state([]);
  let transportes: RotTransporte[] = $state([]);
  let investimentos: RotInvestimento[] = $state([]);
  let pagamentos: RotPagamento[] = $state([]);
  let pdfSettings: PdfSettings = $state({});

  // Sugestões
  let sugestoes: Record<string, string[]> = $state({});

  $effect(() => {
    const restantes = removerPasseiosIncorporados(opcionais, passeios);
    if (restantes !== opcionais) opcionais = restantes;
  });

  // Modals
  let showGerarModal = $state(false);
  let gerarClienteQ = $state('');
  let gerarClienteResults: { id: string; nome: string; email?: string; whatsapp?: string }[] =
    $state([]);
  let gerarClienteSel: { id: string; nome: string; email?: string; whatsapp?: string } | null =
    $state(null);
  let gerarClienteNome = $state('');
  let gerarLoading = $state(false);
  let gerarClienteLoading = $state(false);
  let loadController: AbortController | null = null;
  let diasBuscaController: AbortController | null = null;
  let clienteBuscaController: AbortController | null = null;
  let loadSeq = 0;
  let diasBuscaSeq = 0;
  let clienteBuscaSeq = 0;
  let destroyed = false;

  let showDiasBusca = $state(false);
  let diasBuscaQ = $state('');
  let diasBuscaDestino = $state<RotDia>(newDia(0));
  let diaBuscaAlvo = $state<RotDia | null>(null);
  let diasBuscaOffset = $state(0);
  let diasBuscaTemMais = $state(false);
  let diasBuscaRealizada = $state(false);
  let diasBuscaChave = $state('');
  let diasBuscaResults: DiaBuscaResult[] = $state([]);
  let diasBuscaLoading = $state(false);
  let showDiasImport = $state(false);
  let diasImportText = $state('');
  let diasImportMsg: string | null = $state(null);
  let diasImportError: string | null = $state(null);

  // Import text
  let hotelImportText = $state('');
  let hotelImportMsg: string | null = $state(null);
  let hotelImportError: string | null = $state(null);
  let passeioImportText = $state('');
  let passeioImportMsg: string | null = $state(null);
  let passeioImportError: string | null = $state(null);
  let aereoImportText = $state('');
  let aereoImportMsg: string | null = $state(null);
  let aereoImportError: string | null = $state(null);

  // ─── Counts for tab badges ─────────────────────────────────────────────────
  let tabCounts = $derived({
    opcionais: opcionais.reduce((total, cidade) => total + cidade.passeios.length, 0),
    itinerario: dias.filter((d) => d.cidade || d.percurso || d.data || d.descricao).length,
    hoteis: hoteis.filter((h) => h.cidade || h.hotel || h.data_inicio || h.apto || h.categoria)
      .length,
    passeios: passeios.filter(
      (p) =>
        p.tipo !== 'Trem' &&
        p.tipo !== 'Aluguel de Carro' &&
        p.tipo !== 'Seguro Viagem' &&
        (p.cidade || p.passeio || p.data_inicio || p.tipo)
    ).length,
    'aluguel-carro': passeios.filter(
      (p) => p.tipo === 'Aluguel de Carro' && (p.cidade || p.passeio || p.data_inicio || p.tipo)
    ).length,
    trem: passeios.filter(
      (p) => p.tipo === 'Trem' && (p.cidade || p.passeio || p.data_inicio || p.tipo)
    ).length,
    'seguro-viagem': passeios.filter(
      (p) => p.tipo === 'Seguro Viagem' && (p.cidade || p.passeio || p.data_inicio || p.tipo)
    ).length,
    transporte: transportes.filter((t) => t.trecho || t.cia_aerea || t.data_voo || t.tipo).length,
    investimento: investimentos.filter(
      (i) => i.tipo || Number(i.valor_por_pessoa) > 0 || Number(i.valor_por_apto) > 0
    ).length,
    pagamento: pagamentos.filter(
      (p) => p.servico || p.forma_pagamento || Number(p.valor_total_com_taxas) > 0
    ).length,
    inclusoes:
      incluiTexto.split('\n').filter((l) => l.trim()).length +
      naoIncluiTexto.split('\n').filter((l) => l.trim()).length,
    informacoes: informacoesImportantes.split('\n').filter((l) => l.trim()).length
  });

  // ─── Totals ────────────────────────────────────────────────────────────────
  let totalPagamento = $derived(
    pagamentos.reduce((s, p) => s + Number(p.valor_total_com_taxas || 0), 0)
  );
  let totalInvestimento = $derived(
    investimentos.reduce((s, i) => s + Number(i.valor_por_pessoa || 0), 0)
  );

  // ─── Factory functions ─────────────────────────────────────────────────────

  // ─── List operations ───────────────────────────────────────────────────────

  // ─── Hotel auto-calc noites ────────────────────────────────────────────────
  function onHotelDateChange(index: number, field: 'data_inicio' | 'data_fim', value: string) {
    atualizarDataHotel(hoteis[index], field, value);
  }

  function onAereoValorChange(index: number, field: 'valor_total' | 'taxas', rawValue: string) {
    const v = rawValue === '' ? null : Number(rawValue);
    const num = v !== null && isFinite(v) ? v : null;
    transportes = updateItem(transportes, index, { [field]: num });
  }

  function onInvestimentoChange(
    index: number,
    field: 'valor_por_pessoa' | 'qtd_apto' | 'valor_por_apto',
    rawValue: string
  ) {
    const num = rawValue === '' ? null : Number(rawValue);
    const v = num !== null && isFinite(num) ? num : null;
    if (field === 'valor_por_pessoa' || field === 'qtd_apto') {
      const inv = investimentos[index];
      const vpp = field === 'valor_por_pessoa' ? (v ?? 0) : Number(inv.valor_por_pessoa ?? 0);
      const qa = field === 'qtd_apto' ? (v ?? 0) : Number(inv.qtd_apto ?? 0);
      const vpa = vpp * qa;
      investimentos = updateItem(investimentos, index, {
        [field]: v,
        valor_por_apto: vpa > 0 ? vpa : null
      });
    } else {
      investimentos = updateItem(investimentos, index, { [field]: v });
    }
  }

  function handleImportDiasText() {
    diasImportMsg = null;
    diasImportError = null;

    if (!diasImportText.trim()) {
      diasImportError = 'Cole o texto do dia a dia do circuito.';
      return;
    }

    const imported = parseDiasImportText(diasImportText);
    if (imported.length === 0) {
      diasImportError =
        'Nenhum dia foi identificado. Use linhas como "Dia 1 - Chegada" ou blocos separados por linha em branco.';
      return;
    }

    dias = imported;
    duracao = String(imported.length);
    diasImportMsg = `${imported.length} dia(s) montado(s) automaticamente.`;
    toast.success(`${imported.length} dia(s) importado(s) para o roteiro.`);
    showDiasImport = false;
    diasImportText = '';
  }

  // ─── Load ──────────────────────────────────────────────────────────────────
  async function load() {
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    const seq = ++loadSeq;
    loading = true;
    try {
      const [payload, sugestoesData, settingsData] = await Promise.all([
        apiFetch<RoteiroResponse>(`/api/v1/roteiros/${roteiroId}`, {
          redirectOnForbidden: false,
          redirectOnUnauthorized: false,
          signal: controller.signal
        }),
        // Opcionais (sugestões e dados do PDF): sem acesso, seguem vazios sem mandar para "/negado".
        apiFetch<SugestoesBuscaResponse>('/api/v1/roteiros/sugestoes-busca', {
          signal: controller.signal,
          redirectOnForbidden: false
        }).catch(() => null),
        apiFetch<OrcamentosPdfResponse>('/api/v1/parametros/orcamentos-pdf', {
          signal: controller.signal,
          redirectOnForbidden: false
        }).catch(() => null)
      ]);
      if (seq !== loadSeq || destroyed) return;
      const r = payload.roteiro;

      revisao = r.revisao;
      nome = r.nome || '';
      duracao = r.duracao != null ? String(r.duracao) : '';
      inicioCidade = mergeCidadesVisitadas(r.inicio_cidade, r.fim_cidade);
      fimCidade = '';
      incluiTexto = r.inclui_texto || '';
      naoIncluiTexto = r.nao_inclui_texto || '';
      informacoesImportantes = r.informacoes_importantes || '';
      mostrarPagamentoPdf = r.mostrar_pagamento_pdf !== false;
      mostrarInformacoesPdf = r.mostrar_informacoes_pdf !== false;
      mostrarRodapePdf = r.mostrar_rodape_pdf !== false;
      clienteId = r.cliente_id || '';
      clienteNome = r.cliente_nome || '';
      clienteTelefone = r.cliente_telefone || '';
      clienteEmail = r.cliente_email || '';

      dias = (r.dias || []).map((d) => ({
        ...newDia(d.ordem ?? 0),
        ...d,
        percurso: d.percurso || '',
        data: d.data || '',
        descricao: d.descricao || ''
      }));
      hoteis = (r.hoteis || []).map((h) => ({ ...newHotel(h.ordem ?? 0), ...h }));
      opcionais = r.opcionais || [];
      passeios = (r.passeios || []).map((p) => ({
        ...newPasseio(p.ordem ?? 0),
        ...p,
        ingressos: p.ingressos || 'Não incluído',
        detalhes: parsePasseioDetalhes((p as { detalhes?: unknown }).detalhes)
      }));
      transportes = (r.transportes || []).map((t) => ({ ...newTransporte(t.ordem ?? 0), ...t }));
      investimentos = (r.investimentos || []).map((i) => ({
        ...newInvestimento(i.ordem ?? 0),
        ...i
      }));
      pagamentos = (r.pagamentos || []).map((p) => ({ ...newPagamento(p.ordem ?? 0), ...p }));

      if (sugestoesData) {
        sugestoes = sugestoesData;
      }

      if (settingsData) {
        pdfSettings = settingsData?.settings || {};
      }
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (seq !== loadSeq || destroyed) return;
      if (err instanceof ApiError) {
        if (err.status === 401) {
          toast.error('Sessão expirada. Faça login novamente para continuar.');
          const next = `${$page.url.pathname}${$page.url.search}`;
          await goto(`/auth/login?session_expired=1&next=${encodeURIComponent(next)}`);
          return;
        }
        if (err.status === 403) {
          toast.error(err.message || 'Você não tem permissão para acessar este roteiro.');
          await goto('/orcamentos/roteiros');
          return;
        }
        if (err.status === 404) {
          toast.error(err.message || 'Roteiro não encontrado.');
          await goto('/orcamentos/roteiros');
          return;
        }
      }
      loadError = toUserMessage(err, 'Erro ao carregar roteiro.');
      toast.error(loadError);
    } finally {
      if (seq === loadSeq && !destroyed) loading = false;
    }
  }

  // ─── Save ──────────────────────────────────────────────────────────────────
  function cidadePendente() {
    const grupos = [
      { itens: dias, aba: 'itinerario', label: 'Itinerário', campo: 'dia' },
      { itens: hoteis, aba: 'hoteis', label: 'Hotéis', campo: 'hotel' },
      { itens: passeios, aba: 'passeios', label: 'Passeios', campo: 'passeio' },
      { itens: opcionais, aba: 'opcionais', label: 'Opcionais', campo: 'opcional' }
    ] as const;
    for (const grupo of grupos) {
      const indice = grupo.itens.findIndex((item) => item.cidade_pendente);
      if (indice < 0) continue;
      abaAtiva = grupo.aba;
      void tick().then(() => {
        const campo = document.getElementById(`${grupo.campo}-cidade-${indice}`);
        const detalhes = campo?.closest('details');
        if (detalhes) detalhes.open = true;
        campo?.focus();
      });
      toast.error(`Confirme a cidade em ${grupo.label}, item ${indice + 1}, antes de continuar.`);
      return true;
    }
    return false;
  }

  async function save() {
    if (!nome.trim()) {
      toast.error('Nome obrigatório.');
      return;
    }
    if (browser && cidadePendente()) return;
    if (revisaoRoteiroAtiva && typeof revisao !== 'string') {
      toast.error('Revisão indisponível. Recarregue o roteiro antes de salvar.');
      return;
    }
    saving = true;
    try {
      if (revisaoRoteiroAtiva) {
        opcionais = atribuirIdsGruposOpcionais(opcionais);
        dias = atribuirIdsRegistros(dias);
        hoteis = atribuirIdsRegistros(hoteis);
        passeios = atribuirIdsRegistros(passeios);
      }
      const payload = {
        ...(roteiroGeograficoAtivo ? { versao_identidade: VERSAO_ROTEIRO_IDENTIDADE } : {}),
        ...(revisaoRoteiroAtiva ? { revisao } : {}),
        id: roteiroId,
        nome: nome.trim(),
        duracao: duracao ? Number(duracao) : null,
        inicio_cidade: inicioCidade.trim() || null,
        fim_cidade: null,
        inclui_texto: incluiTexto || null,
        nao_inclui_texto: naoIncluiTexto || null,
        informacoes_importantes: informacoesImportantes || null,
        mostrar_pagamento_pdf: mostrarPagamentoPdf,
        mostrar_informacoes_pdf: mostrarInformacoesPdf,
        mostrar_rodape_pdf: mostrarRodapePdf,
        cliente_id: clienteId || null,
        cliente_nome: clienteNome.trim() || null,
        cliente_telefone: clienteTelefone.trim() || null,
        cliente_email: clienteEmail.trim() || null,
        dias: dias.map((d, i) => ({
          ...(revisaoRoteiroAtiva ? explicitarIdentidadeCidade(d) : d),
          ordem: i
        })),
        hoteis: hoteis.map((h, i) => ({
          ...(revisaoRoteiroAtiva ? explicitarIdentidadeCidade(h) : h),
          ordem: i
        })),
        opcionais: parseRoteiroOpcionais(removerPasseiosIncorporados(opcionais, passeios)).map(
          (item) => (revisaoRoteiroAtiva ? explicitarIdentidadeCidade(item) : item)
        ),
        passeios: passeios.map((p, i) => ({
          ...(revisaoRoteiroAtiva ? explicitarIdentidadeCidade(p) : p),
          ordem: i
        })),
        transportes: transportes.map((t, i) => ({ ...t, ordem: i })),
        investimentos: investimentos.map((inv, i) => ({ ...inv, ordem: i })),
        pagamentos: pagamentos.map((p, i) => ({ ...p, ordem: i }))
      };
      const resultado = await salvarRoteiroComConfirmacao(payload, revisaoRoteiroAtiva);
      if (!resultado) return;
      if (revisaoRoteiroAtiva) {
        if (typeof resultado.revisao !== 'string') {
          revisao = undefined;
          throw new Error('Revisão não recebida. Recarregue o roteiro antes de salvar novamente.');
        }
        revisao = resultado.revisao;
      }
      toast.success('Roteiro salvo com sucesso!');
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar.'));
    } finally {
      saving = false;
    }
  }

  function buildDuplicateName(baseName: string): string {
    const normalized = baseName.trim() || 'Roteiro';
    return /\(copia\)$/i.test(normalized) ? normalized : `${normalized} (Cópia)`;
  }

  async function duplicateRoteiro() {
    if (duplicating || saving) return;
    if (!nome.trim()) {
      toast.error('Preencha o nome do roteiro antes de duplicar.');
      return;
    }
    if (browser && cidadePendente()) return;

    if (
      browser &&
      !(await confirmAction(
        'Deseja duplicar este roteiro? Será criada uma nova cópia para edição.'
      ))
    ) {
      return;
    }

    duplicating = true;
    try {
      if (revisaoRoteiroAtiva) opcionais = atribuirIdsGruposOpcionais(opcionais);
      const diasCopia = revisaoRoteiroAtiva ? renovarIdsRegistros(dias) : dias;
      const hoteisCopia = revisaoRoteiroAtiva ? renovarIdsRegistros(hoteis) : hoteis;
      const passeiosCopia = revisaoRoteiroAtiva ? renovarIdsRegistros(passeios) : passeios;
      const payload = await apiPost<{ id?: string }>('/api/v1/roteiros/save', {
        ...(roteiroGeograficoAtivo ? { versao_identidade: VERSAO_ROTEIRO_IDENTIDADE } : {}),
        nome: buildDuplicateName(nome),
        duracao: duracao ? Number(duracao) : null,
        inicio_cidade: inicioCidade.trim() || null,
        fim_cidade: null,
        inclui_texto: incluiTexto || null,
        nao_inclui_texto: naoIncluiTexto || null,
        informacoes_importantes: informacoesImportantes || null,
        mostrar_pagamento_pdf: mostrarPagamentoPdf,
        mostrar_informacoes_pdf: mostrarInformacoesPdf,
        mostrar_rodape_pdf: mostrarRodapePdf,
        cliente_id: clienteId || null,
        cliente_nome: clienteNome.trim() || null,
        cliente_telefone: clienteTelefone.trim() || null,
        cliente_email: clienteEmail.trim() || null,
        dias: diasCopia.map((d, i) => ({
          ...(revisaoRoteiroAtiva ? explicitarIdentidadeCidade(d) : d),
          ordem: i
        })),
        hoteis: hoteisCopia.map((h, i) => ({
          ...(revisaoRoteiroAtiva ? explicitarIdentidadeCidade(h) : h),
          ordem: i
        })),
        opcionais: parseRoteiroOpcionais(removerPasseiosIncorporados(opcionais, passeiosCopia)).map(
          (item) => (revisaoRoteiroAtiva ? explicitarIdentidadeCidade(item) : item)
        ),
        passeios: passeiosCopia.map((p, i) => ({
          ...(revisaoRoteiroAtiva ? explicitarIdentidadeCidade(p) : p),
          ordem: i
        })),
        transportes: transportes.map((t, i) => ({ ...t, ordem: i })),
        investimentos: investimentos.map((inv, i) => ({ ...inv, ordem: i })),
        pagamentos: pagamentos.map((p, i) => ({ ...p, ordem: i }))
      });

      if (!payload?.id) {
        throw new Error('Não foi possível obter o ID do roteiro duplicado.');
      }

      toast.success('Roteiro duplicado com sucesso!');
      await goto(`/orcamentos/roteiros/${payload.id}`);
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao duplicar roteiro.'));
    } finally {
      duplicating = false;
    }
  }

  // ─── Buscar dias no banco ──────────────────────────────────────────────────
  function chaveDestinoBusca() {
    return `${diasBuscaDestino.cidade_id || ''}|${diasBuscaDestino.cidade}`;
  }

  function abrirBuscaDias() {
    diasBuscaController?.abort();
    diasBuscaSeq += 1;
    diasBuscaLoading = false;
    diaBuscaAlvo = null;
    diasBuscaDestino = newDia(0);
    diasBuscaQ = '';
    diasBuscaResults = [];
    diasBuscaChave = '';
    diasBuscaRealizada = false;
    showDiasBusca = true;
  }

  function abrirDescricoes(dia: RotDia) {
    diaBuscaAlvo = dia;
    diasBuscaDestino = { ...newDia(0), cidade: dia.cidade, cidade_id: dia.cidade_id };
    diasBuscaQ = '';
    diasBuscaResults = [];
    diasBuscaOffset = 0;
    diasBuscaRealizada = false;
    showDiasBusca = true;
    void buscarDias(0);
  }

  async function buscarDias(offset = 0) {
    if (!diasBuscaDestino.cidade.trim() || diasBuscaDestino.cidade_pendente) {
      toast.error('Selecione uma cidade cadastrada para buscar descrições.');
      return;
    }
    diasBuscaController?.abort();
    const controller = new AbortController();
    diasBuscaController = controller;
    const seq = ++diasBuscaSeq;
    const chave = chaveDestinoBusca();
    diasBuscaLoading = true;
    try {
      const data = await apiGet<{ dias?: DiaBuscaResult[]; temMais?: boolean }>(
        '/api/v1/roteiros/dias-busca',
        {
          q: diasBuscaQ,
          cidade_exata: diasBuscaDestino.cidade,
          cidade_id: diasBuscaDestino.cidade_id || '',
          offset
        },
        controller.signal
      );
      if (seq !== diasBuscaSeq || destroyed || chave !== chaveDestinoBusca()) return;
      diasBuscaResults = data.dias || [];
      diasBuscaChave = chave;
      diasBuscaOffset = offset;
      diasBuscaTemMais = Boolean(data.temMais);
      diasBuscaRealizada = true;
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao buscar dias.'));
    } finally {
      if (seq === diasBuscaSeq && !destroyed) diasBuscaLoading = false;
    }
  }

  function addDiaBanco(dia: DiaBuscaResult) {
    if (diaBuscaAlvo) {
      const descricao = String(dia.descricao || '').trim();
      diaBuscaAlvo.descricao = [diaBuscaAlvo.descricao.trim(), descricao]
        .filter(Boolean)
        .join('\n\n');
      showDiasBusca = false;
      return;
    }
    const nextItem: RotDia = {
      percurso: String(dia.percurso || '').trim(),
      cidade: diasBuscaDestino.cidade,
      cidade_id: diasBuscaDestino.cidade_id ?? null,
      data: String(dia.data || '').trim(),
      descricao: String(dia.descricao || '').trim(),
      ordem: dias.length
    };
    dias = [...dias, nextItem];
    showDiasBusca = false;
  }

  // ─── Gerar orçamento ───────────────────────────────────────────────────────
  let clienteSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  interface ClienteBuscaResult {
    id?: string | null;
    nome?: string | null;
    email?: string | null;
    whatsapp?: string | null;
  }
  interface ClienteBuscaResponse {
    items?: ClienteBuscaResult[];
    clientes?: ClienteBuscaResult[];
  }

  function normalizeClienteBuscaResults(
    data: ClienteBuscaResponse | ClienteBuscaResult[]
  ): { id: string; nome: string; email?: string; whatsapp?: string }[] {
    const rows = Array.isArray(data) ? data : data.items || data.clientes || [];
    return rows
      .map((item) => ({
        id: item.id ? String(item.id) : '',
        nome: item.nome ? String(item.nome) : '',
        email: item.email ? String(item.email) : undefined,
        whatsapp: item.whatsapp ? String(item.whatsapp) : undefined
      }))
      .filter((item) => item.id.length > 0 && item.nome.length > 0);
  }

  // ─── Vínculo de cliente cadastrado (Dados do roteiro) ─────────────────────
  let vinculoQ = $state('');
  let vinculoResults = $state<{ id: string; nome: string; email?: string; whatsapp?: string }[]>(
    []
  );
  let vinculoLoading = $state(false);
  let showVinculo = $state(false);
  let vinculoController: AbortController | null = null;
  let vinculoSeq = 0;
  let vinculoTimeout: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const q = vinculoQ;
    if (!editandoDadosRoteiro || clienteId || !showVinculo || q.length < 2) {
      vinculoController?.abort();
      vinculoResults = [];
      return;
    }
    if (vinculoTimeout) clearTimeout(vinculoTimeout);
    vinculoTimeout = setTimeout(async () => {
      vinculoController?.abort();
      const controller = new AbortController();
      vinculoController = controller;
      const seq = ++vinculoSeq;
      vinculoLoading = true;
      try {
        const data = await apiFetch<ClienteBuscaResponse | ClienteBuscaResult[]>(
          '/api/v1/clientes',
          {
            query: { search: q },
            signal: controller.signal,
            // Busca opcional de cliente: sem acesso a Clientes, só não lista.
            redirectOnForbidden: false
          }
        );
        if (seq !== vinculoSeq || destroyed) return;
        vinculoResults = normalizeClienteBuscaResults(data);
      } catch (err) {
        if (isCanceledApiError(err)) return;
        vinculoResults = [];
      } finally {
        if (seq === vinculoSeq && !destroyed) vinculoLoading = false;
      }
    }, 300);

    return () => {
      if (vinculoTimeout) clearTimeout(vinculoTimeout);
    };
  });

  function selecionarClienteVinculo(cliente: {
    id: string;
    nome: string;
    email?: string;
    whatsapp?: string;
  }) {
    clienteId = cliente.id;
    clienteNome = cliente.nome;
    clienteTelefone = cliente.whatsapp || '';
    clienteEmail = cliente.email || '';
    vinculoQ = '';
    showVinculo = false;
    vinculoResults = [];
  }

  function limparClienteVinculo() {
    clienteId = '';
    vinculoQ = '';
    showVinculo = false;
    vinculoResults = [];
  }

  $effect(() => {
    if (!showGerarModal || !gerarClienteQ || gerarClienteQ.length < 2) {
      clienteBuscaController?.abort();
      gerarClienteResults = [];
      return;
    }
    if (clienteSearchTimeout) clearTimeout(clienteSearchTimeout);
    clienteSearchTimeout = setTimeout(async () => {
      clienteBuscaController?.abort();
      const controller = new AbortController();
      clienteBuscaController = controller;
      const seq = ++clienteBuscaSeq;
      gerarClienteLoading = true;
      try {
        const data = await apiFetch<ClienteBuscaResponse | ClienteBuscaResult[]>(
          '/api/v1/clientes',
          {
            query: { search: gerarClienteQ },
            signal: controller.signal,
            // Busca opcional de cliente: sem acesso a Clientes, só não lista (não vai para "/negado").
            redirectOnForbidden: false
          }
        );
        if (seq !== clienteBuscaSeq || destroyed) return;
        gerarClienteResults = normalizeClienteBuscaResults(data);
      } catch (err) {
        if (isCanceledApiError(err)) return;
        gerarClienteResults = [];
      } finally {
        if (seq === clienteBuscaSeq && !destroyed) gerarClienteLoading = false;
      }
    }, 300);

    return () => {
      if (clienteSearchTimeout) clearTimeout(clienteSearchTimeout);
    };
  });

  async function handleGerarOrcamento() {
    const clientName = gerarClienteSel?.nome || gerarClienteNome.trim();
    if (!clientName) {
      toast.error('Informe o nome do cliente.');
      return;
    }
    gerarLoading = true;
    try {
      const data = await apiPost<{ quote_id?: string }>('/api/v1/roteiros/gerar-orcamento', {
        roteiro_id: roteiroId,
        client_id: gerarClienteSel?.id || null,
        client_name: clientName,
        client_whatsapp: gerarClienteSel?.whatsapp || null,
        client_email: gerarClienteSel?.email || null
      });
      if (!data.quote_id) throw new Error('Orçamento gerado sem identificador.');
      goto(`/orcamentos/${data.quote_id}`);
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao gerar orçamento.'));
      gerarLoading = false;
    }
  }

  // ─── Import hotel text (structured parser) ────────────────────────────────
  function handleImportHotelText() {
    hotelImportMsg = null;
    hotelImportError = null;
    if (!hotelImportText.trim()) {
      hotelImportError = 'Cole o texto com os dados dos hotéis.';
      return;
    }
    try {
      const imported = parseImportedRoteiroHotels(hotelImportText, new Date());
      if (imported.length === 0) {
        hotelImportError = 'Nenhum hotel foi identificado no texto colado.';
        return;
      }

      const mapped: RotHotel[] = imported.map((item, idx) => ({
        ...newHotel(idx),
        ordem: item.ordem,
        cidade: item.cidade || '',
        hotel: item.hotel || '',
        endereco: item.endereco || '',
        data_inicio: item.data_inicio || '',
        data_fim: item.data_fim || '',
        noites: Number(item.noites) || null,
        qtd_apto: Number(item.qtd_apto) || null,
        apto: item.apto || '',
        categoria: item.categoria || '',
        regime: item.regime || '',
        tipo_tarifa: item.tipo_tarifa || '',
        qtd_adultos: Number(item.qtd_adultos) || null,
        qtd_criancas: Number(item.qtd_criancas) || null,
        valor_original: Number(item.valor_original) || null,
        valor_final: Number(item.valor_final) || null
      }));

      hoteis = reorder([...hoteis, ...mapped]);
      hotelImportText = '';
      hotelImportMsg = `${imported.length} hotel(is) importado(s). Revise os campos.`;
    } catch {
      hotelImportError = 'Não foi possível importar.';
    }
  }

  function handleImportPasseioText() {
    passeioImportMsg = null;
    passeioImportError = null;
    if (!passeioImportText.trim()) {
      passeioImportError = 'Cole o texto com os dados dos passeios.';
      return;
    }
    try {
      const lines = passeioImportText.split('\n').filter((l) => l.trim());
      const imported: RotPasseio[] = lines.map((line, idx) => {
        const p = newPasseio(idx);
        p.passeio = line.trim();
        return p;
      });
      passeios = reorder([...passeios, ...imported]);
      passeioImportText = '';
      passeioImportMsg = `${imported.length} linha(s) importada(s). Revise os campos.`;
    } catch {
      passeioImportError = 'Não foi possível importar.';
    }
  }

  function handleImportAereoText() {
    aereoImportMsg = null;
    aereoImportError = null;
    if (!aereoImportText.trim()) {
      aereoImportError = 'Cole o texto com os dados das passagens.';
      return;
    }
    try {
      const imported = parseImportedRoteiroAereo(aereoImportText, new Date());
      if (imported.length === 0) {
        aereoImportError = 'Nenhum trecho aéreo foi identificado no texto colado.';
        return;
      }

      const existingImported = transportes.map((item, index) => ({
        trecho: item.trecho || '',
        cia_aerea: item.cia_aerea || '',
        data_voo: item.data_voo || item.data_inicio || '',
        data_inicio: item.data_inicio || item.data_voo || '',
        data_fim: item.data_fim || item.data_voo || '',
        classe_reserva: item.classe_reserva || '',
        hora_saida: item.hora_saida || '',
        aeroporto_saida: item.aeroporto_saida || '',
        duracao_voo: item.duracao_voo || '',
        tipo_voo: item.tipo_voo || '',
        hora_chegada: item.hora_chegada || '',
        aeroporto_chegada: item.aeroporto_chegada || '',
        tarifa_nome: item.tarifa_nome || '',
        reembolso_tipo: item.reembolso_tipo || '',
        numero_voo: item.descricao || '',
        qtd_adultos: Number(item.qtd_adultos || 0),
        qtd_criancas: Number(item.qtd_criancas || 0),
        taxas: Number(item.taxas || 0),
        valor_total: Number(item.valor_total || 0),
        ordem: index
      }));

      const merged = mergeImportedRoteiroAereo(existingImported, imported);
      transportes = reorder(
        merged.map((item, idx) => ({
          ...newTransporte(idx),
          ordem: idx,
          tipo: 'Aéreo',
          trecho: item.trecho || '',
          cia_aerea: item.cia_aerea || '',
          data_voo: item.data_voo || '',
          data_inicio: item.data_inicio || item.data_voo || '',
          data_fim: item.data_fim || item.data_voo || '',
          classe_reserva: item.classe_reserva || '',
          hora_saida: item.hora_saida || '',
          aeroporto_saida: item.aeroporto_saida || '',
          duracao_voo: item.duracao_voo || '',
          tipo_voo: item.tipo_voo || '',
          hora_chegada: item.hora_chegada || '',
          aeroporto_chegada: item.aeroporto_chegada || '',
          tarifa_nome: item.tarifa_nome || '',
          reembolso_tipo: item.reembolso_tipo || '',
          descricao: item.numero_voo || '',
          qtd_adultos: item.qtd_adultos || null,
          qtd_criancas: item.qtd_criancas || null,
          taxas: item.taxas || null,
          valor_total: item.valor_total || null
        }))
      );
      aereoImportText = '';
      aereoImportMsg = `${imported.length} trecho(s) aéreo(s) importado(s). Revise os campos.`;
    } catch {
      aereoImportError = 'Não foi possível importar.';
    }
  }

  function escapePreviewHtml(value: string | number | null | undefined) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildPreviewList(items: string[]) {
    const filtered = items.map((item) => String(item || '').trim()).filter(Boolean);
    if (filtered.length === 0) {
      return '<p class="empty">Nenhum conteúdo informado.</p>';
    }
    return `<ul>${filtered.map((item) => `<li>${escapePreviewHtml(item)}</li>`).join('')}</ul>`;
  }

  function buildPreviewCards<T>(items: T[], render: (item: T, index: number) => string) {
    if (items.length === 0) {
      return '<p class="empty">Nenhum conteúdo informado.</p>';
    }
    return items.map(render).join('');
  }

  function formatPreviewDate(value: string | null | undefined) {
    const formatted = formatISODateBR(value);
    return formatted === '-' ? '' : formatted;
  }

  function faixaPeriodo(start: string, end: string) {
    const inicio = parseISODateParts(start);
    const fim = parseISODateParts(end);
    if (!inicio) return formatPreviewDate(end);
    if (!fim || inicio.iso === fim.iso) return formatISODateBR(inicio.iso);
    const dia = String(inicio.day).padStart(2, '0');
    const mes = String(inicio.month).padStart(2, '0');
    if (inicio.year === fim.year) return `${dia}/${mes} a ${formatISODateBR(fim.iso)}`;
    return `${formatISODateBR(inicio.iso)} a ${formatISODateBR(fim.iso)}`;
  }

  function buildPreviewSection(title: string, content: string) {
    if (!content.trim()) return '';
    return `<section class="section"><h2>${escapePreviewHtml(title)}</h2><div class="grid">${content}</div></section>`;
  }

  function buildPreviewListSection(
    title: string,
    items: string[],
    chips: boolean | 'x' = false
  ) {
    const filtered = items.map((item) => String(item || '').trim()).filter(Boolean);
    if (filtered.length === 0) return '';
    const body =
      chips === 'x'
        ? roteiroXChips(filtered, escapePreviewHtml)
        : chips
          ? roteiroCheckChips(filtered, escapePreviewHtml)
          : buildPreviewList(filtered);
    return `<section class="section"><h2>${escapePreviewHtml(title)}</h2>${body}</section>`;
  }

  function extractStoragePath(url?: string | null): string | null {
    if (!url) return null;
    const marker = '/quotes/';
    const idx = url.indexOf(marker);
    return idx === -1 ? null : url.slice(idx + marker.length);
  }

  function blobToDataUrl(blob: Blob, fallbackMime?: string): Promise<string> {
    return new Promise((resolve) => {
      let finalBlob = blob;
      if (fallbackMime && (!blob.type || blob.type === 'application/octet-stream')) {
        finalBlob = new Blob([blob], { type: fallbackMime });
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(finalBlob);
    });
  }

  function guessMimeFromPath(path: string): string {
    const lower = path.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    return 'image/png';
  }

  async function storageImageToDataUrl(
    path?: string | null,
    url?: string | null
  ): Promise<string | null> {
    const storagePath = path || extractStoragePath(url);
    if (!storagePath) return null;

    try {
      const { data: blob, error } = await dados.storage.from('quotes').download(storagePath);
      if (error || !blob) return null;
      const dataUrl = await blobToDataUrl(blob, guessMimeFromPath(storagePath));
      return dataUrl || null;
    } catch {
      return null;
    }
  }

  async function resolvePreviewPdfAssets(): Promise<PreviewPdfAssets> {
    if (!incluirCabecalhoRodapePdf) return { complementUrl: null, qrUrl: null };

    const whatsappLink = construirLinkWhatsApp(
      pdfSettings.whatsapp,
      pdfSettings.whatsapp_codigo_pais
    );
    const qrSource = whatsappLink
      ? `/api/v1/qr?size=200&margin=1&text=${encodeURIComponent(whatsappLink)}`
      : null;

    const [complementUrl, qrUrl] = await Promise.all([
      storageImageToDataUrl(
        pdfSettings.imagem_complementar_path,
        pdfSettings.imagem_complementar_url
      ),
      qrSource ? fetchImageAsDataUrl(qrSource) : Promise.resolve(null)
    ]);

    return { complementUrl, qrUrl };
  }

  function buildRoteiroPreviewHtml(
    assets: PreviewPdfAssets = { qrUrl: null, complementUrl: null },
    modeloInicial: 'completo' | 'moderno' = 'completo'
  ) {
    const diasItems = dias.filter((dia) => dia.cidade || dia.percurso || dia.data || dia.descricao);
    const diasHtml =
      diasItems.length > 0
        ? buildPreviewCards(diasItems, (dia, index) =>
            renderPreviewDia(dia, index, formatPreviewDate)
          )
        : '';

    const transportesItems = transportes.filter(
      (item) => item.trecho || item.cia_aerea || item.fornecedor || item.data_voo
    );
    const transportesHtml = renderPreviewFlights(transportesItems, formatPreviewDate);

    const hoteisItems = hoteis.filter((item) => item.hotel || item.cidade);
    const hoteisHtml = renderPreviewHotels(hoteisItems, formatPreviewDate);

    const passeiosItems = passeios.filter((item) => item.passeio || item.cidade);
    const passeiosGerais = passeiosItems.filter(
      (item) => categoriaPasseioPdf(item.tipo) === 'geral'
    );
    const carrosItems = passeiosItems.filter((item) => categoriaPasseioPdf(item.tipo) === 'carro');
    const trensItems = passeiosItems.filter((item) => categoriaPasseioPdf(item.tipo) === 'trem');
    const segurosItems = passeiosItems.filter(
      (item) => categoriaPasseioPdf(item.tipo) === 'seguro'
    );
    const passeiosHtml = renderPreviewPasseios(passeiosGerais, formatPreviewDate);
    const carrosHtml = renderPreviewCarros(carrosItems, formatPreviewDate);
    const trensHtml = renderPreviewTrens(trensItems, formatPreviewDate);
    const segurosHtml = renderPreviewSeguros(segurosItems, formatPreviewDate);

    const investimentosItems = investimentos.filter(
      (item) =>
        item.tipo ||
        Number(item.valor_por_pessoa || 0) > 0 ||
        Number(item.valor_por_apto || 0) > 0
    );
    const investimentosHtml = renderPreviewInvestimentos(investimentosItems);
    const investimentoTotalTexto =
      totalInvestimento > 0 ? `Total por pessoa: R$ ${formatBRL(totalInvestimento)}` : '';

    const pagamentosItems = pagamentos.filter((item) => item.servico || item.valor_total_com_taxas);
    const pagamentosHtml =
      pagamentosItems.length > 0
        ? buildPreviewCards(
            pagamentosItems,
            (item) =>
              `<article class="card compact"><h3>${escapePreviewHtml(item.servico || 'Pagamento')}</h3><p>${escapePreviewHtml([item.forma_pagamento, item.valor_total_com_taxas != null ? `R$ ${formatBRL(Number(item.valor_total_com_taxas || 0))}` : ''].filter(Boolean).join(' • '))}</p></article>`
          )
        : '';

    // ── Investimento e Pagamento (compartilhado Padrão + Moderno) ──────────
    let rot3InvestHtmlShared = '';
    if (investimentosItems.length > 0) {
      const qtdAdultos = Number(investimentosItems[0]?.qtd_adultos || investimentosItems[0]?.qtd_apto || 1) || 1;
      const totalAdultos = totalInvestimento * qtdAdultos;
      const dtHoje = new Date();
      const dtAm = new Date(dtHoje); dtAm.setDate(dtAm.getDate() + 1);
      const fDt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      const emis = fDt(dtHoje);
      const valid = fDt(dtAm);
      const consultorNome = pdfSettings?.consultor_nome || '';
      const _icoP = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="display:inline;vertical-align:middle;margin-right:4px;margin-bottom:1px"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
      const _icoG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="display:inline;vertical-align:middle;margin-right:4px;margin-bottom:1px"><circle cx="8" cy="8" r="3.5"/><circle cx="16" cy="9" r="2.5"/><path d="M1 20c0-3.5 3.1-6 8-6s7.5 2.3 8 5.5"/><path d="M18 15c2.5.5 5 2 5 5" stroke-dasharray="3 2"/></svg>`;
      const _icoClock = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline;vertical-align:middle;margin-right:5px;margin-bottom:1px;opacity:0.85"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`;
      rot3InvestHtmlShared = `<div class="rot3-inv-box">
        <div class="rot3-inv-col">
          <div class="rot3-inv-label">${_icoP}POR PESSOA</div>
          <div class="rot3-inv-valor">R$&nbsp;${formatBRL(totalInvestimento)}</div>
          <div class="rot3-inv-sub">Valor médio individual por adulto</div>
        </div>
        <div class="rot3-inv-divider"></div>
        <div class="rot3-inv-col">
          <div class="rot3-inv-label">${_icoG}TOTAL DA VIAGEM (${qtdAdultos} ${qtdAdultos !== 1 ? 'ADULTOS' : 'ADULTO'})</div>
          <div class="rot3-inv-valor">R$&nbsp;${formatBRL(totalAdultos)}</div>
          <div class="rot3-inv-sub">Valor total da proposta para ${qtdAdultos} adulto${qtdAdultos !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div class="rot3-inv-footer rot3-inv-footer--padrao">${_icoClock}Emissão em ${emis}&nbsp;•&nbsp;Tarifas válidas até ${valid}${consultorNome ? `&nbsp;•&nbsp;Reserve com ${escapePreviewHtml(consultorNome)} via WhatsApp` : ''}</div>`;
    }

    let rot3PagamentosHtmlShared = '';
    if (pagamentosItems.length > 0) {
      const qtdPaxPag = Number(investimentosItems[0]?.qtd_adultos || investimentosItems[0]?.qtd_apto || 0) || 0;
      const paxLabel  = qtdPaxPag > 1 ? ` (${qtdPaxPag} Pax${qtdPaxPag > 1 ? 's' : ''})` : '';
      const colHdrPag = `<div class="rot3-pag-header-row rot3-pag-header-row--padrao">
        <div class="rot3-pag-h1">Modalidade</div>
        <div class="rot3-pag-h2">Condição Comercial</div>
        <div class="rot3-pag-h3">Valor Total${paxLabel}</div>
      </div>`;
      const rowsPag = pagamentosItems.map((p) => {
        const modalidade  = escapePreviewHtml(String(p.forma_pagamento || '—').trim());
        const servicoRaw  = String(p.servico || '').trim();
        const nlIdx = servicoRaw.indexOf('\n');
        const ptIdx = servicoRaw.indexOf('. ');
        const splitIdx = nlIdx >= 0 ? nlIdx : (ptIdx >= 0 && ptIdx < 80 ? ptIdx + 1 : -1);
        const condTitulo = splitIdx > 0
          ? escapePreviewHtml(servicoRaw.slice(0, splitIdx).trim())
          : escapePreviewHtml(servicoRaw);
        const condDesc   = splitIdx > 0
          ? escapePreviewHtml(servicoRaw.slice(splitIdx).trim())
          : '';
        const valorTotal = p.valor_total_com_taxas
          ? `R$&nbsp;${formatBRL(Number(p.valor_total_com_taxas))}`
          : '—';
        const valorPax = (p.valor_total_com_taxas && qtdPaxPag > 1)
          ? `R$&nbsp;${formatBRL(Number(p.valor_total_com_taxas) / qtdPaxPag)}&nbsp;/ pax`
          : '';
        return `<div class="rot3-pag-row">
          <div class="rot3-pag-c1">
            <div class="rot3-pag-modal">${modalidade}</div>
          </div>
          <div class="rot3-pag-c2">
            ${condTitulo ? `<div class="rot3-pag-cond-titulo">${condTitulo}</div>` : ''}
            ${condDesc   ? `<div class="rot3-pag-cond-desc">${condDesc}</div>`   : ''}
          </div>
          <div class="rot3-pag-c3">
            <div class="rot3-pag-valor">${valorTotal}</div>
            ${valorPax ? `<div class="rot3-pag-pax">${valorPax}</div>` : ''}
          </div>
        </div>`;
      }).join('');
      const obsGerais = `<div class="rot3-pag-obs"><span class="rot3-pag-obs-label">Observações Gerais:</span> Valores sujeitos à disponibilidade e alteração sem aviso prévio até a efetivação da reserva. Os passeios opcionais não estão incluídos no valor total do pacote e podem ser adicionados a qualquer momento conforme preferência dos viajantes.</div>`;
      rot3PagamentosHtmlShared = `<div class="rot3-pag-tabela">${colHdrPag}${rowsPag}${obsGerais}</div>`;
    }

    const includesSection = buildPreviewListSection('O roteiro inclui', incluiTexto.split('\n'));
    const excludesSection = buildPreviewListSection(
      'O roteiro não inclui',
      naoIncluiTexto.split('\n')
    );
    const infoSection = buildPreviewListSection(
      'Informações importantes',
      informacoesImportantes.split('\n')
    );

    const footerLines = String(pdfSettings.rodape_texto || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const rightLines = [
      pdfSettings.consultor_nome ? `Consultor: ${pdfSettings.consultor_nome}` : '',
      pdfSettings.telefone ? `Telefone: ${pdfSettings.telefone}` : '',
      pdfSettings.whatsapp ? `WhatsApp: ${pdfSettings.whatsapp}` : '',
      pdfSettings.email ? `E-mail: ${pdfSettings.email}` : ''
    ].filter(Boolean);

    const citiesLine = [inicioCidade, fimCidade].filter(Boolean).join(' • ');
    const periodText = (() => {
      const firstDia =
        diasItems.find((item) => item.data)?.data ||
        transportesItems.find((item) => item.data_voo || item.data_inicio)?.data_voo ||
        transportesItems.find((item) => item.data_inicio)?.data_inicio ||
        '';
      const lastDia =
        [...diasItems].reverse().find((item) => item.data)?.data ||
        [...transportesItems]
          .reverse()
          .find((item) => item.data_fim || item.data_voo || item.data_inicio)?.data_fim ||
        '';
      if (firstDia && lastDia) return faixaPeriodo(firstDia, lastDia);
      return formatPreviewDate(firstDia || lastDia);
    })();

    const headerCardHtml = `
      <section class="preview-header-card">
        <table class="preview-header-table">
          <tbody>
            <tr>
              <td class="preview-header-left">
                <img src="${VTUR_LOGO_URL}" class="preview-logo" alt="VTur" />
                <div class="preview-header-copy">
                  ${pdfSettings.filial_nome ? `<div>${escapePreviewHtml(`Filial: ${pdfSettings.filial_nome}`)}</div>` : ''}
                  ${pdfSettings.endereco_linha1 ? `<div>${escapePreviewHtml(pdfSettings.endereco_linha1)}</div>` : ''}
                  ${pdfSettings.endereco_linha2 ? `<div>${escapePreviewHtml(pdfSettings.endereco_linha2)}</div>` : ''}
                  ${pdfSettings.endereco_linha3 ? `<div>${escapePreviewHtml(pdfSettings.endereco_linha3)}</div>` : ''}
                </div>
              </td>
              <td class="preview-header-right">
                <table class="preview-header-right-inner">
                  <tbody>
                    <tr>
                      <td class="preview-right-lines">
                        ${assets.qrUrl ? '<div class="preview-qr-label">Aponte para o QR Code abaixo e chame o consultor:</div>' : ''}
                        ${rightLines.map((line) => `<div>${escapePreviewHtml(line)}</div>`).join('')}
                      </td>
                      ${assets.qrUrl ? `<td class="preview-qr-cell"><img src="${escapePreviewHtml(assets.qrUrl)}" class="preview-qr" alt="QR Code WhatsApp" /></td>` : ''}
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="preview-header-divider"></div>
      </section>`;

    const titleCardHtml = `
      <section class="preview-title-card">
        <div class="preview-title-kicker">Roteiro Personalizado</div>
        <h1 class="preview-title-name">${escapePreviewHtml(nome || 'Roteiro')}</h1>
        ${clienteNome ? `<div class="mu preview-title-meta">Para: <b style="color:#1F2937">${escapePreviewHtml(clienteNome)}</b></div>` : ''}
        ${citiesLine ? `<div class="mu preview-title-meta">Cidades: <b style="color:#1F2937">${escapePreviewHtml(citiesLine)}</b></div>` : ''}
      </section>`;
    const summaryBandHtml = periodText
      ? `<div class="rot-band"><div><b>Período</b><span>${escapePreviewHtml(periodText)}</span></div>${duracao ? `<div><b>Duração</b><span>${escapePreviewHtml(duracao)} dias</span></div>` : ''}</div>`
      : '';

    const footerHtml =
      footerLines.length > 0
        ? `<section class="preview-footer-card"><div>${footerLines.map((line) => escapePreviewHtml(line)).join('<br/>')}</div>${assets.complementUrl ? `<div class="preview-complement-img"><img src="${escapePreviewHtml(assets.complementUrl)}" alt="Imagem complementar" /></div>` : ''}</section>`
        : '';

    const cidadeOrigemResumo = nomeCidadeNoPdf(
      (inicioCidade.split('•')[0] || '').trim()
    ).toLowerCase();
    const cidadesResumo: string[] = [];
    for (const dia of diasItems) {
      const cidadeCurta = nomeCidadeNoPdf((dia.cidade || '').trim());
      if (
        cidadeCurta &&
        cidadeCurta.toLowerCase() !== cidadeOrigemResumo &&
        !cidadesResumo.includes(cidadeCurta)
      )
        cidadesResumo.push(cidadeCurta);
    }
    const resumoRoteiroHtml = cidadesResumo.length
      ? `<div class="rot2-bloco"><div class="rot2-bloco-label">Resumo do Roteiro</div><div class="rot2-rota">${escapePreviewHtml(cidadesResumo.join(' → '))}</div></div>`
      : '';

    let cidadeAnterior = '';
    const rot2DiasHtml = diasItems.length
      ? diasItems
          .map((dia, index) => {
            const cidadeCurta = nomeCidadeNoPdf((dia.cidade || '').trim());
            const percursoTxt = (dia.percurso || '').trim();
            let rota = percursoTxt;
            if (!rota && cidadeCurta) {
              rota = cidadeAnterior && cidadeAnterior !== cidadeCurta
                ? `${cidadeAnterior} → ${cidadeCurta}`
                : cidadeCurta;
            }
            if (cidadeCurta) cidadeAnterior = cidadeCurta;
            const dataMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia.data || '');
            const dataTxt = dataMatch
              ? `${dataMatch[3]}/${dataMatch[2]}`
              : dia.data
                ? formatPreviewDate(dia.data)
                : '';
            const rotaSetas = rota.replace(/\s+-\s+/g, ' → ');
            const cabecalho = [`Dia ${index + 1}`, dataTxt, rotaSetas]
              .filter(Boolean)
              .join(' • ');
            return `<div class="rot2-dia">
              <div class="rot2-dia-head">${escapePreviewHtml(cabecalho)}</div>
              ${dia.descricao ? `<p>${escapePreviewHtml(dia.descricao).replace(/\n/g, '<br>')}</p>` : ''}
            </div>`;
          })
          .join('')
      : '';

    const rot2MetaLinha = [
      periodText ? `Período: ${periodText}` : '',
      duracao ? `Duração: ${duracao} dias` : ''
    ]
      .filter(Boolean)
      .join(' • ');

    const itinerarioBodyHtml = `
      <div class="rot2-doc">
        <div class="rot2-kicker">Roteiro Personalizado</div>
        <h1 class="rot2-title">${escapePreviewHtml((nome || 'Roteiro').toUpperCase())}</h1>
        ${clienteNome ? `<div class="rot2-para">Para: ${escapePreviewHtml(clienteNome)}</div>` : ''}
        ${rot2MetaLinha ? `<div class="rot2-meta">${escapePreviewHtml(rot2MetaLinha)}</div>` : ''}
        ${resumoRoteiroHtml}
        ${rot2DiasHtml ? `<section class="rot2-itin"><h2>Itinerário Detalhado</h2>${rot2DiasHtml}</section>` : ''}
      </div>
      ${buildRoteiroCardSection('Passagem Aérea', transportesHtml, 'preview-airfare-section')}
      ${buildRoteiroCardSection('Aluguel de Carro', carrosHtml, 'preview-carros-section')}
      ${buildRoteiroCardSection('Hotéis Sugeridos', hoteisHtml, 'preview-hotels-section')}
      ${buildRoteiroCardSection('Trem', trensHtml, 'preview-trens-section')}
      ${buildRoteiroCardSection('Passeios e Serviços', passeiosHtml, 'preview-passeios-section')}
      ${buildRoteiroCardSection('Seguro Viagem', segurosHtml, 'preview-seguros-section')}
      ${rot3InvestHtmlShared ? `<section class="roteiro-print-section preview-investimento-section"><table class="roteiro-print-table"><thead><tr><th><h2 class="rot-sh">Investimento</h2></th></tr></thead><tbody><tr><td>${rot3InvestHtmlShared}</td></tr></tbody></table></section>` : buildRoteiroCardSection('Investimento', investimentosHtml, 'preview-investimento-section', investimentoTotalTexto)}
      ${mostrarPagamentoPdf && rot3PagamentosHtmlShared ? `<section class="roteiro-print-section preview-pagamento-section"><table class="roteiro-print-table"><thead><tr><th><h2 class="rot-sh">Pagamento</h2></th></tr></thead><tbody><tr><td>${rot3PagamentosHtmlShared}</td></tr></tbody></table></section>` : (mostrarPagamentoPdf ? buildPreviewSection('Pagamento', pagamentosHtml) : '')}
      ${buildPreviewListSection('O que está incluído', incluiTexto.split('\n'), true)}
      ${buildPreviewListSection('O que não está incluído', naoIncluiTexto.split('\n'), 'x')}
      ${mostrarInformacoesPdf ? buildPreviewListSection('Informações Importantes', informacoesImportantes.split('\n')) : ''}
      ${incluirCabecalhoRodapePdf && mostrarRodapePdf ? footerHtml : ''}
      <div class="rot2-doc-footer">Roteiro Personalizado${nome ? ` • ${escapePreviewHtml(nome)}` : ''}</div>`;


    // ── Modelo Moderno ────────────────────────────────────────────────────
    let cidadeAnterior2 = '';
    const rot3DiasHtml = diasItems.length
      ? diasItems
          .map((dia, index) => {
            const cidadeCurta = nomeCidadeNoPdf((dia.cidade || '').trim());
            const percursoTxt = (dia.percurso || '').trim();
            let rota = percursoTxt;
            if (!rota && cidadeCurta) {
              rota = cidadeAnterior2 && cidadeAnterior2 !== cidadeCurta
                ? `${cidadeAnterior2} → ${cidadeCurta}`
                : cidadeCurta;
            }
            if (cidadeCurta) cidadeAnterior2 = cidadeCurta;
            const dataMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia.data || '');
            const diaDDMM = dataMatch ? `${dataMatch[3]}/${dataMatch[2]}` : '';
            const pillLabel = [`Dia ${index + 1}`, diaDDMM].filter(Boolean).join(' · ');
            const rotaSetas = rota.replace(/\s+-\s+/g, ' → ');
            return `<div class="rot3-dia">
              <div class="rot3-dia-pill-col">
                <div class="rot3-dia-pill">${escapePreviewHtml(pillLabel)}</div>
              </div>
              <div class="rot3-dia-mid">
                <div class="rot3-dia-dot"></div>
                ${index < diasItems.length - 1 ? '<div class="rot3-dia-line"></div>' : ''}
              </div>
              <div class="rot3-dia-body">
                ${rotaSetas ? `<div class="rot3-dia-rota">${escapePreviewHtml(rotaSetas)}</div>` : ''}
                ${dia.descricao ? `<p class="rot3-dia-desc">${escapePreviewHtml(dia.descricao).replace(/\n/g, '<br>')}</p>` : ''}
              </div>
            </div>`;
          })
          .join('')
      : '';

    const rot3CidadesResumo: string[] = [];
    let rot3CidadeOrig = nomeCidadeNoPdf((inicioCidade.split('•')[0] || '').trim()).toLowerCase();
    for (const dia of diasItems) {
      const c = nomeCidadeNoPdf((dia.cidade || '').trim());
      if (c && c.toLowerCase() !== rot3CidadeOrig && !rot3CidadesResumo.includes(c))
        rot3CidadesResumo.push(c);
    }

    const _calIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:3px;position:relative;top:-1px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    const _clkIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:3px;position:relative;top:-1px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    const rot3MetaItens = [
      periodText ? `${_calIcon}Período: <span class="rot3-meta-val">${escapePreviewHtml(periodText)}</span>` : '',
      duracao ? `${_clkIcon}Duração: <span class="rot3-meta-val">${escapePreviewHtml(duracao)} dias</span>` : ''
    ].filter(Boolean);

    // ── Moderno: section wrapper helper
    const buildRot3Secao = (titulo: string, conteudo: string) => {
      if (!conteudo.trim()) return '';
      return `<section class="rot3-secao"><h2 class="rot3-secao-titulo">${escapePreviewHtml(titulo)}</h2>${conteudo}</section>`;
    };

    // ── Moderno: bordered info/list box
    const buildRot3InfoBox = (items: string[], tipo?: 'inclui' | 'naoinclui') => {
      const filtered = items.map((s) => String(s || '').trim()).filter(Boolean);
      if (!filtered.length) return '';
      const icoVerde = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="display:inline;vertical-align:middle;margin-right:5px;flex-shrink:0"><circle cx="6" cy="6" r="5.5" fill="#16A34A" opacity="0.15"/><path d="M3.2 6l1.8 1.8L9 4" stroke="#16A34A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const icoVerm  = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="display:inline;vertical-align:middle;margin-right:5px;flex-shrink:0"><circle cx="6" cy="6" r="5.5" fill="#DC2626" opacity="0.15"/><path d="M4 4l4 4M8 4l-4 4" stroke="#DC2626" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const ico = tipo === 'inclui' ? icoVerde : tipo === 'naoinclui' ? icoVerm : '';
      return `<div class="rot3-info-box"><ul class="rot3-info-list rot3-info-list--icon">${filtered.map((s) => `<li>${ico}${escapePreviewHtml(s)}</li>`).join('')}</ul></div>`;
    };

    // ── Moderno: Passagem Aérea (grouped flights)
    let rot3FlightsHtml = '';
    if (transportesItems.length > 0) {
      const groupsMap = new Map<string, typeof transportesItems>();
      for (const t of transportesItems) {
        const gk = [t.tipo_voo || '', t.cia_aerea || ''].filter(Boolean).join(' • ') || 'Voos';
        if (!groupsMap.has(gk)) groupsMap.set(gk, []);
        groupsMap.get(gk)!.push(t);
      }
      const _chkIco = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" style="display:inline;vertical-align:middle;margin-right:3px;flex-shrink:0"><circle cx="6" cy="6" r="5.5" fill="#1B2C80" opacity="0.13"/><path d="M3.2 6l1.8 1.8L9 4" stroke="#1B2C80" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      let inner = '';
      for (const [gk, grpItems] of groupsMap) {
        inner += `<div class="rot3-grupo-header">${escapePreviewHtml(gk)}</div>`;
        for (const t of grpItems) {
          // Col 1: "CidadeOrigem → CidadeDestino"
          const trechoPartes = (t.trecho || '').split(/\s*(?:→|->|—|--)\s*/);
          const cidOrig = nomeCidadeNoPdf((trechoPartes[0] || '').trim());
          const cidDest = nomeCidadeNoPdf((trechoPartes[1] || '').trim());
          const trechoDisplay = cidOrig && cidDest
            ? `${escapePreviewHtml(cidOrig)} → ${escapePreviewHtml(cidDest)}`
            : escapePreviewHtml(t.trecho || '');
          // Col 1 subtitle: "Voo LA8120 • 10/08/2027"
          const descVoo = String(t.descricao || '').trim();
          const dSaida = formatPreviewDate(t.data_voo || t.data_inicio || '');
          const c1SubParts: string[] = [];
          if (descVoo) c1SubParts.push(`Voo ${descVoo}`);
          else if (t.cia_aerea) c1SubParts.push(escapePreviewHtml(t.cia_aerea));
          if (dSaida) c1SubParts.push(dSaida);
          const c1Sub = c1SubParts.join(' • ');
          // Col 2 line 1: "GRU 17:50 → FCO 10:15 +1"
          const aeOrig = ((t.aeroporto_saida || '').split(',')[0]).trim().toUpperCase();
          const aeDest = ((t.aeroporto_chegada || '').split(',')[0]).trim().toUpperCase();
          const horaSaida = (t.hora_saida || '').replace(/\s*\(\+\d+\)\s*$/, '').trim();
          const horaCheg = (t.hora_chegada || '').replace(/\s*\(\+\d+\)\s*$/, '').trim();
          const msOff = new Date(t.data_fim || '').getTime() - new Date(t.data_voo || t.data_inicio || '').getTime();
          const dOff = (!isNaN(msOff) && msOff > 43200000) ? Math.round(msOff / 86400000) : 0;
          const plusHtml = dOff > 0 ? `<sup class="rot3-voo-plus">+${dOff}</sup>` : '';
          const fromPart = [aeOrig, horaSaida].filter(Boolean).join('\u00a0');
          const toPart = [aeDest, horaCheg].filter(Boolean).join('\u00a0');
          const rotaLine = (fromPart || toPart) ? `${escapePreviewHtml(fromPart)} → ${escapePreviewHtml(toPart)}${plusHtml}` : '';
          // Col 2 line 2: "Chegada em Roma em 11/08/2027"
          const dCheg = formatPreviewDate(t.data_fim || t.data_voo || '');
          const chegParts: string[] = ['Chegada'];
          if (cidDest) chegParts.push(`em ${escapePreviewHtml(cidDest)}`);
          if (dCheg && dCheg !== dSaida) chegParts.push(`em ${dCheg}`);
          else if (dCheg && !cidDest) chegParts.push(`em ${dCheg}`);
          const chegLine = chegParts.length > 1 ? chegParts.join(' ') : '';
          // Col 3: checkmark items for classe_reserva + tarifa_nome
          const checks = ([t.classe_reserva, t.tarifa_nome] as (string | undefined)[]).filter(s => String(s || '').trim());
          const checksHtml = checks.map(s => `<div class="rot3-chk-item">${_chkIco}${escapePreviewHtml(String(s).trim())}</div>`).join('');
          inner += `<div class="rot3-voo-row">
            <div class="rot3-voo-c1">
              <div class="rot3-voo-trecho">${trechoDisplay}</div>
              ${c1Sub ? `<div class="rot3-voo-cia">${c1Sub}</div>` : ''}
            </div>
            <div class="rot3-voo-c2">
              ${rotaLine ? `<div class="rot3-voo-rota">${rotaLine}</div>` : ''}
              ${chegLine ? `<div class="rot3-voo-info">${chegLine}</div>` : ''}
            </div>
            <div class="rot3-voo-c3">
              ${checksHtml}
            </div>
          </div>`;
        }
      }
      rot3FlightsHtml = `<div class="rot3-tabela">${inner}</div>`;
    }

    // ── Moderno: Hotéis Sugeridos
    let rot3HoteisHtml = '';
    if (hoteisItems.length > 0) {
      const _chkIco = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" style="display:inline;vertical-align:middle;margin-right:3px;flex-shrink:0"><circle cx="6" cy="6" r="5.5" fill="#1B2C80" opacity="0.13"/><path d="M3.2 6l1.8 1.8L9 4" stroke="#1B2C80" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const colHdr = `<div class="rot3-hotel-header-row"><div class="rot3-hotel-c1">Hotel &amp; Destino</div><div class="rot3-hotel-c2">Período de Hospedagem</div><div class="rot3-hotel-c3">Acomodação &amp; Regime</div></div>`;
      const rows = hoteisItems.map((h) => {
        const ci = formatPreviewDate(h.data_inicio || '');
        const co = formatPreviewDate(h.data_fim || '');
        const nts = h.noites ? `${h.noites} noite${Number(h.noites) !== 1 ? 's' : ''}` : '';
        const cidade = nomeCidadeNoPdf(h.cidade || '');
        // C1 subtitle: "Cidade • N noites" na cor laranja
        const cidadeNts = [cidade ? escapePreviewHtml(cidade) : '', nts ? escapePreviewHtml(nts) : ''].filter(Boolean).join(' • ');
        // Categoria/estrelas (ex: "3 estrelas" ou o valor bruto)
        const catLabel = h.categoria ? escapePreviewHtml(h.categoria) : '';
        // C3: checkmark items para apto + regime
        const checks = ([h.apto, h.regime] as (string | undefined)[]).filter(s => String(s || '').trim());
        const checksHtml = checks.map(s => `<div class="rot3-chk-item">${_chkIco}${escapePreviewHtml(String(s).trim())}</div>`).join('');
        return `<div class="rot3-hotel-row">
          <div class="rot3-hotel-c1">
            <div class="rot3-hotel-nome">${escapePreviewHtml(h.hotel || '—')}</div>
            ${cidadeNts ? `<div class="rot3-hotel-cidade">${cidadeNts}</div>` : ''}
            ${catLabel ? `<div class="rot3-hotel-cat">${catLabel}</div>` : ''}
          </div>
          <div class="rot3-hotel-c2">
            ${ci ? `<div class="rot3-hotel-info"><span class="rot3-voo-label">Check-in:</span> ${ci}</div>` : ''}
            ${co ? `<div class="rot3-hotel-info"><span class="rot3-voo-label">Check-out:</span> ${co}</div>` : ''}
          </div>
          <div class="rot3-hotel-c3">
            ${checksHtml}
          </div>
        </div>`;
      }).join('');
      rot3HoteisHtml = `<div class="rot3-tabela">${colHdr}${rows}</div>`;
    }

    // ── Moderno: Investimento e Pagamento — reutilizam as variáveis compartilhadas
    // (rot3InvestHtmlShared e rot3PagamentosHtmlShared calculados acima)
    // Para o Moderno: re-gerar sem a classe --padrao no footer do investimento
    let rot3InvestHtml = '';
    if (rot3InvestHtmlShared) {
      rot3InvestHtml = rot3InvestHtmlShared.replace('rot3-inv-footer rot3-inv-footer--padrao', 'rot3-inv-footer');
    }
    // Para o Moderno: re-gerar header da tabela de pagamento sem a classe --padrao
    let rot3PagamentosHtml = '';
    if (rot3PagamentosHtmlShared) {
      rot3PagamentosHtml = rot3PagamentosHtmlShared.replace('rot3-pag-header-row rot3-pag-header-row--padrao', 'rot3-pag-header-row');
    }

    // ── Moderno: Passeios Opcionais
    let rot3OpcionaisHtml = '';
    {
      const opcionaisVisiveis = removerPasseiosIncorporados(opcionais, passeios);
      const linhas = opcionaisVisiveis.flatMap((grupo) =>
        grupo.passeios.map((p) => ({ cidade: grupo.cidade, nome: p.nome, descricao: p.descricao }))
      ).filter((l) => l.nome);
      if (linhas.length > 0) {
        const colHdrOpc = `<div class="rot3-hotel-header-row">
          <div class="rot3-hotel-h1">DESTINO</div>
          <div class="rot3-hotel-h2">ATIVIDADE / EXPERIÊNCIA SUGERIDA</div>
          <div class="rot3-hotel-h3">VALOR ESTIMADO</div>
        </div>`;
        const rowsOpc = linhas.map((l) => {
          const cidade = nomeCidadeNoPdf(l.cidade);
          const descHtml = l.descricao
            ? `<div class="rot3-opc-desc">${escapePreviewHtml(l.descricao).replace(/\n/g, '<br>')}</div>`
            : '';
          return `<div class="rot3-hotel-row">
            <div class="rot3-hotel-c1">
              <div class="rot3-hotel-nome">${escapePreviewHtml(cidade || l.cidade)}</div>
            </div>
            <div class="rot3-hotel-c2">
              <div class="rot3-hotel-info" style="font-weight:600;color:#1a1a1a">${escapePreviewHtml(l.nome)}</div>
              ${descHtml}
            </div>
            <div class="rot3-hotel-c3" style="text-align:right">
              <div style="font-weight:600;color:#1B2C80">[Valor / pax]</div>
              <div style="font-size:7.5pt;color:#6B7280">Por pessoa</div>
            </div>
          </div>`;
        }).join('');
        rot3OpcionaisHtml = `<div class="rot3-tabela">${colHdrOpc}${rowsOpc}</div>`;
      }
    }

    const rot3InfoTexto = informacoesImportantes.trim() || [
      'Preços em real (R$) convertido ao câmbio do dia sujeito a alteração e disponibilidade da tarifa.',
      'Valor da criança válido somente quando acompanhada de dois adultos pagantes no mesmo apartamento.',
      'Este orçamento é apenas uma tomada de preço.',
      'Os serviços citados não estão reservados; a compra somente poderá ser confirmada após a confirmação dos fornecedores.',
      'Este orçamento foi feito com base na menor tarifa para os serviços solicitados, podendo sofrer alteração devido à disponibilidade de lugares no ato da compra.'
    ].join('\n');
    const rot3ModernoBodyHtml = `
      <div class="rot3-doc">
        <div class="rot3-kicker-bar"></div>
        <div class="rot3-kicker">ROTEIRO PERSONALIZADO</div>
        <h1 class="rot3-title">${escapePreviewHtml((nome || 'Roteiro').toUpperCase())}</h1>
        ${clienteNome ? `<div class="rot3-para">Para: <strong>${escapePreviewHtml(clienteNome)}</strong></div>` : ''}
        ${rot3MetaItens.length ? `<div class="rot3-meta">${rot3MetaItens.join(' &nbsp;•&nbsp; ')}</div>` : ''}
        ${rot3CidadesResumo.length ? `<div class="rot3-bloco"><div class="rot3-bloco-label">RESUMO DO ROTEIRO</div><div class="rot3-rota">${escapePreviewHtml(rot3CidadesResumo.join(' → '))}</div></div>` : ''}
        ${rot3DiasHtml ? `<section class="rot3-itin"><h2 class="rot3-itin-titulo">ITINERÁRIO DETALHADO</h2><div class="rot3-dias-lista">${rot3DiasHtml}</div></section>` : ''}
      </div>
      ${buildRot3Secao('PASSAGEM AÉREA', rot3FlightsHtml)}
      ${carrosHtml.trim() ? buildRot3Secao('ALUGUEL DE CARRO', carrosHtml) : ''}
      ${buildRot3Secao('HOTÉIS SUGERIDOS', rot3HoteisHtml)}
      ${trensHtml.trim() ? buildRot3Secao('TREM', trensHtml) : ''}
      ${passeiosHtml.trim() ? buildRot3Secao('PASSEIOS E SERVIÇOS', passeiosHtml) : ''}
      ${rot3OpcionaisHtml ? buildRot3Secao('PASSEIOS OPCIONAIS', rot3OpcionaisHtml) : ''}
      ${segurosHtml.trim() ? buildRot3Secao('SEGURO VIAGEM', segurosHtml) : ''}
      ${buildRot3Secao('INVESTIMENTO', rot3InvestHtml)}
      ${incluiTexto.trim() ? buildRot3Secao('O QUE ESTÁ INCLUÍDO', buildRot3InfoBox(incluiTexto.split('\n'), 'inclui')) : ''}
      ${naoIncluiTexto.trim() ? buildRot3Secao('O QUE NÃO ESTÁ INCLUÍDO', buildRot3InfoBox(naoIncluiTexto.split('\n'), 'naoinclui')) : ''}
      ${mostrarInformacoesPdf ? buildRot3Secao('INFORMAÇÕES IMPORTANTES', buildRot3InfoBox(rot3InfoTexto.split('\n'))) : ''}
      ${mostrarPagamentoPdf && rot3PagamentosHtml ? buildRot3Secao('FORMAS DE PAGAMENTO', rot3PagamentosHtml) : ''}
      ${incluirCabecalhoRodapePdf && mostrarRodapePdf ? footerHtml : ''}
      <div class="rot3-doc-footer">Roteiro Personalizado${nome ? ` · ${escapePreviewHtml(nome)}` : ''}</div>`;

    const mostrarModerno = modeloInicial === 'moderno';
    const mostrarItinerario = false; // opção removida do seletor

    return `<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapePreviewHtml(nome || 'Roteiro')}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
            .shell { max-width: 960px; margin: 0 auto; padding: 24px; }
            .toolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 12px; padding: 16px 0; background: #f8fafc; }
            .print-action { display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 8px; padding: 10px 16px; background: #0f766e; color: white; cursor: pointer; text-decoration: none; font-weight: 700; }
            .print-action:focus-visible { outline: 3px solid rgba(15, 118, 110, 0.28); outline-offset: 2px; }
            .preview-header-card, .preview-title-card, .preview-footer-card, .section { background: white; border: 1px solid #d1d5db; border-radius: 12px; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08); }
            .preview-header-card { padding: 12px 14px; margin: 0 0 12px 0; }
            .preview-header-table { width: 100%; border-collapse: separate; border-spacing: 0; }
            .preview-header-left, .preview-header-right { vertical-align: top; }
            .preview-header-left { width: 52%; }
            .preview-header-right { width: 48%; font-size: 11px; color: #334155; }
            .preview-header-right-inner { width: 100%; border-collapse: separate; border-spacing: 0; }
            .preview-logo { max-width: 120px; max-height: 56px; width: auto; height: auto; object-fit: contain; }
            .preview-header-copy { font-size: 11px; color: #0f172a; margin: 8px 0 0 0; }
            .preview-right-lines { vertical-align: top; }
            .preview-qr-label { font-size: 9px; color: #475569; margin: 0 0 5px 0; }
            .preview-qr-cell { vertical-align: top; text-align: right; width: 76px; }
            .preview-qr { width: 66px; height: 66px; }
            .preview-header-divider { height: 1px; background: #dbe3f0; margin: 10px 0 0 0; }
            .preview-title-card { padding: 14px 16px; margin: 0 0 14px 0; }
            .preview-title-kicker { font-size: 18px; font-weight: 700; color: #1a2cc8; }
            .preview-title-name { font-size: 15px; font-weight: 700; color: #0f172a; margin: 6px 0 0 0; }
            .preview-title-meta { font-size: 12px; color: #334155; margin: 6px 0 0 0; }
            .section { margin-top: 24px; background: white; border-radius: 18px; padding: 22px; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08); }
            .section h2 { margin: 0 0 16px; font-size: 18px; }
            .grid { display: grid; gap: 12px; }
            .card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; }
            .card.compact h3 { margin-bottom: 6px; }
            .card h3 { margin: 0 0 8px; font-size: 15px; }
            .card p { margin: 0; line-height: 1.55; white-space: normal; }
            .roteiro-print-section { margin: 0 0 8px; }
            .roteiro-print-table { width: 100%; border-collapse: separate; border-spacing: 0; }
            .roteiro-print-table thead { display: table-header-group; }
            .roteiro-print-section h2 { margin: 0; padding: 8px 12px; border: 0; background: transparent; color: #1B2C80; font: bold 11px Arial, Helvetica, sans-serif; text-align: left; }
            .roteiro-print-title-icon { width: 1em; height: 1em; margin-right: 0.35em; vertical-align: -0.15em; }
            .roteiro-print-subtitle { display: block; margin-top: 6px; font-size: 13px; font-weight: normal; }
            ${roteiroCardStyles}
            .roteiro-optional-item + .roteiro-optional-item { margin-top: 8px; }
            ${roteiroFlightStyles}
            .preview-table-wrap { overflow: visible; border: 0; border-radius: 0; }
            .preview-table { width: 100%; border-collapse: collapse; font-size: 12px; }
            .preview-table thead th { text-align: left; padding: 8px; border-bottom: 1px solid #cbd5e1; background: #eef2ff; color: #1e3a8a; }
            .preview-table tbody td { padding: 8px; border-bottom: 1px solid #e2e8f0; color: #475569; vertical-align: top; }
            .preview-table tbody tr:last-child td { border-bottom: 0; }
            .preview-footer-card { padding: 12px 14px; margin: 24px 0 12px 0; font-size: 10px; color: #64748b; }
            .preview-complement-img { margin: 12px 0 0 0; text-align: center; }
            .preview-complement-img img { max-height: 170px; max-width: 100%; }
            .meta { color: #475569; font-size: 13px; margin-bottom: 8px !important; }
            .empty { color: #64748b; font-style: italic; }
            ul { margin: 0; padding-left: 18px; }
            li { margin: 0 0 6px; }
            .rot3-pag-tabela { border: 1px solid #9aaac2; border-radius: 18px; overflow: hidden; margin-bottom: 8px; font-family: Georgia, "Times New Roman", serif; }
            .rot3-pag-header-row { display: flex; gap: 10px; background: #f8f9fb; border-bottom: 1px solid #9aaac2; font-size: 8.5pt; font-weight: 700; color: #1B2C80; padding: 7px 14px; }
            .rot3-pag-h1 { flex: 2; min-width: 0; }
            .rot3-pag-h2 { flex: 3; min-width: 0; }
            .rot3-pag-h3 { flex: 1.5; min-width: 0; text-align: right; }
            .rot3-pag-row { display: flex; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #EEF2F7; break-inside: avoid; page-break-inside: avoid; }
            .rot3-pag-row:last-of-type { border-bottom: none; }
            .rot3-pag-c1 { flex: 2; min-width: 0; }
            .rot3-pag-c2 { flex: 3; min-width: 0; }
            .rot3-pag-c3 { flex: 1.5; min-width: 0; text-align: right; display: flex; flex-direction: column; gap: 3px; }
            .rot3-pag-modal { font-size: 9.5pt; font-weight: 700; color: #1B2C80; }
            .rot3-pag-cond-titulo { font-size: 8.5pt; font-weight: 700; color: #1a1a1a; margin-bottom: 2px; }
            .rot3-pag-cond-desc { font-size: 8pt; color: #374151; line-height: 1.45; }
            .rot3-pag-valor { font-size: 9.5pt; font-weight: 700; color: #1B2C80; }
            .rot3-pag-pax { font-size: 8pt; color: #6B7280; }
            .rot3-pag-obs { background: #F8F9FB; border-top: 1px solid #9aaac2; padding: 10px 14px; font-size: 8pt; color: #374151; line-height: 1.5; border-radius: 0 0 18px 18px; }
            .rot3-pag-obs-label { font-weight: 700; color: #1B2C80; }
            @media print {
              @page { size: A4; margin: 13mm; }
              body { background: white; }
              .toolbar { display: none; }
              .shell { max-width: none; padding: 0; }
              .preview-header-card, .preview-title-card, .preview-footer-card { box-shadow: none; }
              .section, .roteiro-print-section { break-inside: auto; page-break-inside: auto; break-before: auto; page-break-before: auto; padding: 0; }
              .section h2, .roteiro-print-section h2 { break-after: avoid; page-break-after: avoid; }
              .preview-header-card,
              .preview-title-card,
              .preview-footer-card,
              .preview-complement-img {
                break-inside: avoid;
                page-break-inside: avoid;
              }
              .roteiro-card:not(.roteiro-card--long),
              .roteiro-optional-item:not(.roteiro-optional-item--long) {
                break-inside: avoid;
                page-break-inside: avoid;
              }
              .roteiro-card--long, .roteiro-optional-item--long { break-inside: auto; page-break-inside: auto; overflow: visible; }
            }
            .modelo[hidden] { display: none !important; }
            .rot2-modelo { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #475569; }
            .rot2-modelo select { border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px 10px; font-size: 13px; background: #fff; color: #0f172a; }
            .rot2-doc { max-width: 720px; margin: 0 auto; }
            .rot2-kicker { font-size: 9pt; font-weight: bold; letter-spacing: 2.5px; text-transform: uppercase; color: #6B7280; }
            .rot2-title { font-size: 26pt; font-weight: bold; color: #1B2C80; margin: 4px 0 10px; line-height: 1.1; }
            .rot2-para { font-size: 11pt; color: #1F2937; margin: 0 0 2px; }
            .rot2-meta { font-size: 10pt; color: #4B5563; margin: 0 0 22px; }
            .rot2-bloco { margin: 0 0 24px; }
            .rot2-bloco-label { font-size: 8.5pt; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; color: #6B7280; margin-bottom: 6px; }
            .rot2-rota { font-size: 14pt; font-weight: bold; color: #1B2C80; line-height: 1.4; }
            .rot2-itin h2 { margin: 0 0 6px; font-size: 13pt; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; color: #1B2C80; }
            .rot2-dia { padding: 12px 0; border-top: 1px solid #EEF2F7; break-inside: avoid; }
            .rot2-dia:first-of-type { border-top: none; }
            .rot2-dia-head { font-weight: bold; color: #1B2C80; font-size: 10.5pt; margin-bottom: 4px; }
            .rot2-dia p { margin: 0; color: #374151; font-size: 9.5pt; line-height: 1.6; }
            .rot2-doc-footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #C5CED9; font-size: 8pt; color: #9CA3AF; text-align: center; }
            @media print {
              .rot2-dia { break-inside: avoid; page-break-inside: avoid; }
              .rot2-doc { max-width: none; }
            }

            /* ─── Modelo Moderno do Roteiro (rot3-*) ─────────────────────────────── */
            .rot3-doc { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #1F2937; max-width: 720px; margin: 0 auto; border-top: 4px solid #1B2C80; padding-top: 20px; }
            .rot3-kicker { font-size: 8.5pt; font-weight: bold; letter-spacing: 2.5px; text-transform: uppercase; color: #1B2C80; text-align: center; margin-bottom: 4px; }
            .rot3-title { font-size: 26pt; font-weight: bold; color: #1B2C80; margin: 2px 0 6px; line-height: 1.1; text-align: center; }
            .rot3-para { font-size: 10pt; color: #1F2937; margin: 0 0 2px; text-align: center; }
            .rot3-para strong { color: #1B2C80; }
            .rot3-meta { font-size: 9pt; color: #4B5563; margin: 0 0 20px; text-align: center; }
            .rot3-meta-val { color: #1B2C80; font-weight: 600; }
            .rot3-bloco { border: 1.5px solid #C5CED9; border-radius: 10px; padding: 10px 14px; margin: 14px 0 20px; background: #EEF2F7; }
            .rot3-bloco-label { font-size: 7.5pt; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase; color: #1B2C80; margin-bottom: 6px; }
            .rot3-rota { font-size: 13pt; font-weight: bold; color: #1B2C80; line-height: 1.5; }
            .rot3-itin { margin: 0 0 20px; }
            .rot3-itin-titulo { font-size: 10pt; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; color: #1B2C80; border-bottom: 1.5px solid #C5CED9; padding-bottom: 6px; margin: 0 0 14px; text-align: center; }
            .rot3-dias-lista { }
            .rot3-kicker-bar { width: 40px; height: 3px; background: #1B2C80; margin: 0 auto 10px; border-radius: 2px; }
            .rot3-dia { display: flex; gap: 0; margin-bottom: 10px; break-inside: avoid; page-break-inside: avoid; }
            .rot3-dia-pill-col { width: 90px; flex-shrink: 0; padding-top: 2px; }
            .rot3-dia-mid { display: flex; flex-direction: column; align-items: center; width: 20px; flex-shrink: 0; padding-top: 6px; }
            .rot3-dia-pill { background: #1B2C80; color: #fff; font-size: 7.5pt; font-weight: bold; padding: 4px 8px; border-radius: 999px; text-align: center; white-space: nowrap; letter-spacing: 0.3px; }
            .rot3-dia-dot { width: 10px; height: 10px; border-radius: 50%; background: #1B2C80; flex-shrink: 0; }
            .rot3-dia-line { width: 2px; background: #C5CED9; flex: 1; min-height: 20px; margin-top: 4px; }
            .rot3-dia-body { flex: 1; border: 1.5px solid #C5CED9; border-radius: 10px; padding: 10px 14px; background: #fff; min-width: 0; }
            .rot3-dia-rota { font-size: 10.5pt; font-weight: bold; color: #1B2C80; margin-bottom: 4px; }
            .rot3-dia-desc { margin: 0; font-size: 9pt; color: #374151; line-height: 1.6; }
            .rot3-doc-footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #C5CED9; font-size: 8pt; color: #9CA3AF; display: flex; justify-content: space-between; }
            /* ─── rot3 Section / Flights / Hotels / Invest ─── */
            .rot3-secao { margin: 24px 0 0; }
            .rot3-secao-titulo { font-size: 10pt; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; color: #1B2C80; border-bottom: 1.5px solid #C5CED9; padding-bottom: 6px; margin: 0 0 14px; text-align: center; }
            .rot3-tabela { border: 1.5px solid #C5CED9; border-radius: 8px; overflow: hidden; margin-bottom: 8px; }
            .rot3-grupo-header { background: #1B2C80; color: #fff; font-size: 8.5pt; font-weight: bold; letter-spacing: 1px; padding: 5px 12px; }
            .rot3-voo-row { display: flex; gap: 10px; padding: 8px 12px; border-bottom: 1px solid #EEF2F7; break-inside: avoid; page-break-inside: avoid; }
            .rot3-voo-row:last-child { border-bottom: none; }
            .rot3-voo-c1 { flex: 2; min-width: 0; }
            .rot3-voo-c2 { flex: 3; min-width: 0; }
            .rot3-voo-c3 { flex: 1.5; display: flex; flex-direction: column; gap: 2px; justify-content: flex-start; min-width: 0; }
            .rot3-voo-trecho { font-size: 10pt; font-weight: bold; color: #1B2C80; }
            .rot3-voo-cia { font-size: 8.5pt; color: #6B7280; margin-top: 2px; }
            .rot3-voo-info { font-size: 8.5pt; color: #374151; margin-top: 2px; }
            .rot3-voo-rota { font-size: 9pt; font-weight: bold; color: #1B2C80; margin-top: 2px; }
            .rot3-voo-plus { font-size: 7pt; vertical-align: super; color: #E05C1A; font-weight: bold; margin-left: 2px; }
            .rot3-chk-item { font-size: 8.5pt; color: #1B2C80; display: flex; align-items: center; margin-bottom: 2px; }
            .rot3-voo-label { font-weight: bold; color: #1B2C80; }
            .rot3-chip { display: inline-block; background: #EEF2F7; color: #1B2C80; border-radius: 999px; font-size: 7.5pt; font-weight: bold; padding: 2px 7px; margin: 1px 0; border: 1px solid #C5CED9; }
            .rot3-hotel-header-row { display: flex; gap: 10px; background: #1B2C80; color: #fff; font-size: 8pt; font-weight: bold; letter-spacing: 0.5px; padding: 5px 12px; }
            .rot3-hotel-row { display: flex; gap: 10px; padding: 8px 12px; border-bottom: 1px solid #EEF2F7; break-inside: avoid; page-break-inside: avoid; }
            .rot3-hotel-row:last-child { border-bottom: none; }
            .rot3-hotel-c1 { flex: 2.5; min-width: 0; }
            .rot3-hotel-c2 { flex: 2; min-width: 0; }
            .rot3-hotel-c3 { flex: 1.5; display: flex; flex-direction: column; gap: 2px; justify-content: flex-start; min-width: 0; }
            .rot3-hotel-header-row div:nth-child(1) { flex: 2.5; }
            .rot3-hotel-header-row div:nth-child(2) { flex: 2; }
            .rot3-hotel-header-row div:nth-child(3) { flex: 1.5; }
            .rot3-hotel-nome { font-size: 10pt; font-weight: bold; color: #1B2C80; }
            .rot3-hotel-cidade { font-size: 8.5pt; color: #4472C4; font-weight: 600; margin-top: 2px; }
            .rot3-hotel-cat { font-size: 8pt; color: #6B7280; margin-top: 2px; }
            .rot3-hotel-info { font-size: 8.5pt; color: #374151; margin-top: 2px; }
            .rot3-opc-desc { font-size: 7.5pt; color: #6B7280; margin-top: 2px; line-height: 1.4; }
            .rot3-inv-box { display: flex; border: 1px solid #9aaac2; border-radius: 18px 18px 0 0; overflow: hidden; background: white; font-family: Georgia, "Times New Roman", serif; color: #1f2430; }
            .rot3-inv-col { flex: 1; padding: 14px 16px; text-align: center; }
            .rot3-inv-divider { width: 1px; background: #9aaac2; flex-shrink: 0; }
            .rot3-inv-label { font-size: 8pt; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase; color: #6B7280; margin-bottom: 6px; }
            .rot3-inv-valor { font-size: 16pt; font-weight: bold; color: #1B2C80; line-height: 1.2; }
            .rot3-inv-sub { font-size: 8pt; color: #9CA3AF; margin-top: 4px; }
            .rot3-inv-footer { background: #1B2C80; color: #fff; font-size: 8pt; padding: 7px 14px; text-align: center; border-radius: 0 0 18px 18px; border: 1px solid #9aaac2; border-top: none; }
            .rot3-inv-footer--padrao { background: #D0DAEA !important; color: #1B2C80 !important; }
            .rot3-pag-header-row--padrao { background: #D0DAEA !important; }
            .rot3-info-box { border: 1.5px solid #C5CED9; border-radius: 8px; padding: 12px 16px; background: #fff; }
            .rot3-info-list { margin: 0; padding-left: 16px; }
            .rot3-info-list li { font-size: 9pt; color: #374151; margin-bottom: 4px; line-height: 1.5; }
            .rot3-info-list--icon { padding-left: 0; list-style: none; }
            .rot3-info-list--icon li { display: flex; align-items: flex-start; }
            @media print {
              .rot3-doc { max-width: none; }
              .rot3-dia { break-inside: avoid; page-break-inside: avoid; }
              .rot3-bloco { background: #EEF2F7; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .rot3-grupo-header { background: #1B2C80; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .rot3-hotel-header-row { background: #1B2C80; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .rot3-pag-header-row { background: #f8f9fb; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .rot3-pag-obs { background: #F8F9FB; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .rot3-inv-footer { background: #1B2C80; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .rot3-inv-footer--padrao { background: #D0DAEA !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .rot3-pag-header-row--padrao { background: #D0DAEA !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            ${roteiroPdfThemeCss}
          </style>
        </head>
        <body>
          <div class="shell">
            <div class="toolbar">
              <label class="rot2-modelo">Modelo
                <select onchange="rvSwitchModelo(this.value)">
                  <option value="completo"${mostrarItinerario ? '' : ' selected'}>Padrão</option>
                  <option value="moderno"${mostrarModerno ? ' selected' : ''}>Moderno</option>
                </select>
              </label>
              <a class="print-action" href="#" onclick="event.preventDefault(); window.print();">Imprimir / Salvar em PDF</a>
            </div>
            <div class="modelo" data-modelo="completo"${mostrarItinerario || mostrarModerno ? ' hidden' : ''}>
            ${incluirCabecalhoRodapePdf ? headerCardHtml : ''}
            ${titleCardHtml}
            ${summaryBandHtml}
            ${buildRoteiroCardSection('Itinerário Detalhado', diasHtml, 'preview-itinerary-section')}
            ${buildRoteiroCardSection('Passagem Aérea', transportesHtml, 'preview-airfare-section')}
            ${buildRoteiroCardSection('Aluguel de Carro', carrosHtml, 'preview-carros-section')}
            ${buildRoteiroCardSection('Hotéis Sugeridos', hoteisHtml, 'preview-hotels-section')}
            ${buildRoteiroCardSection('Trem', trensHtml, 'preview-trens-section')}
            ${buildRoteiroCardSection('Passeios e Serviços', passeiosHtml, 'preview-passeios-section')}
            ${buildRoteiroCardSection(
              'Passeios Opcionais',
              buildOpcionaisHtml(
                removerPasseiosIncorporados(opcionais, passeios),
                escapePreviewHtml,
                nomeCidadeNoPdf
              ),
              'preview-optionals-section',
              'Sugestões sem data marcada, não incluídas no valor do roteiro'
            )}
            ${buildRoteiroCardSection('Seguro Viagem', segurosHtml, 'preview-seguros-section')}
            ${rot3InvestHtmlShared ? `<section class="roteiro-print-section preview-investimento-section"><table class="roteiro-print-table"><thead><tr><th><h2 class="rot-sh">Investimento</h2></th></tr></thead><tbody><tr><td>${rot3InvestHtmlShared}</td></tr></tbody></table></section>` : buildRoteiroCardSection('Investimento', investimentosHtml, 'preview-investimento-section', investimentoTotalTexto)}
            ${mostrarPagamentoPdf && rot3PagamentosHtmlShared ? `<section class="roteiro-print-section preview-pagamento-section"><table class="roteiro-print-table"><thead><tr><th><h2 class="rot-sh">Pagamento</h2></th></tr></thead><tbody><tr><td>${rot3PagamentosHtmlShared}</td></tr></tbody></table></section>` : (mostrarPagamentoPdf ? buildPreviewSection('Pagamento', pagamentosHtml) : '')}
            ${buildPreviewListSection('O que está incluído', incluiTexto.split('\n'), true)}
            ${buildPreviewListSection('O que não está incluído', naoIncluiTexto.split('\n'), 'x')}
            ${mostrarInformacoesPdf ? buildPreviewListSection('Informações Importantes', informacoesImportantes.split('\n')) : ''}
            ${incluirCabecalhoRodapePdf && mostrarRodapePdf ? footerHtml : ''}
            </div>
            <div class="modelo" data-modelo="itinerario"${mostrarItinerario && !mostrarModerno ? '' : ' hidden'}>
              ${itinerarioBodyHtml}
            </div>
            <div class="modelo" data-modelo="moderno"${mostrarModerno ? '' : ' hidden'}>
              ${rot3ModernoBodyHtml}
            </div>
            <script>
              function rvSwitchModelo(modelo) {
                document.querySelectorAll('.modelo').forEach(function (el) {
                  el.hidden = el.getAttribute('data-modelo') !== modelo;
                });
              }
            </scr${'ipt'}>
          </div>
        </body>
      </html>`;
  }

  async function handlePreviewPdf() {
    if (!browser) return;
    previewingPdf = true;
    try {
      const assets = await resolvePreviewPdfAssets();
      const html = buildRoteiroPreviewHtml(assets, modeloPdfRoteiro);
      const previewUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      const opened = safeOpenNewTab(previewUrl, ['blob:']);
      if (!opened) {
        throw new Error(
          'Não foi possível abrir a prévia do PDF. Verifique o bloqueador de pop-up.'
        );
      }
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60000);
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao visualizar PDF.'));
    } finally {
      previewingPdf = false;
    }
  }

  onMount(async () => {
    await ensureServerSessionCookie();
    await load();
  });

  onDestroy(() => {
    destroyed = true;
    loadSeq += 1;
    diasBuscaSeq += 1;
    clienteBuscaSeq += 1;
    vinculoSeq += 1;
    loadController?.abort();
    diasBuscaController?.abort();
    clienteBuscaController?.abort();
    vinculoController?.abort();
    if (clienteSearchTimeout) clearTimeout(clienteSearchTimeout);
    if (vinculoTimeout) clearTimeout(vinculoTimeout);
  });
</script>

<svelte:head>
  <title>{nome || 'Roteiro'} | VTUR</title>
</svelte:head>

{#if loading && !loadError}
  <div class="py-12">
    <LoadingState compact={true} />
  </div>
{:else if loadError}
  <div class="flex flex-col items-center justify-center py-16 text-center">
    <p class="mb-6 text-red-600 dark:text-red-400">{loadError}</p>
    <Button variant="secondary" href="/orcamentos/roteiros">
      <ArrowLeft size={16} class="mr-2" />
      Voltar para Roteiros
    </Button>
  </div>
{:else}
  <PageHeader
    title={nome || 'Roteiro'}
    subtitle="Edite o roteiro personalizado com hotéis, passeios, aéreo, itinerário, investimento e pagamento."
    color="clientes"
    breadcrumbs={[
      { label: 'Orçamentos', href: '/orcamentos' },
      { label: 'Roteiros', href: '/orcamentos/roteiros' },
      { label: nome || 'Roteiro' }
    ]}
    actions={[
      { label: 'Voltar', href: '/orcamentos/roteiros', variant: 'secondary', icon: ArrowLeft },
      {
        label: editandoDadosRoteiro ? 'Concluir edição' : 'Editar',
        onClick: () => (editandoDadosRoteiro = !editandoDadosRoteiro),
        variant: 'secondary',
        icon: Pencil
      }
    ]}
  />

  <!-- ─── Cabeçalho do roteiro ──────────────────────────────────────────── -->
  <Card title="Dados do roteiro" color="clientes" class="mb-4">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
      <div class="lg:col-span-2">
        {#if editandoDadosRoteiro}
          <FieldInput
            label="Nome"
            required
            bind:value={nome}
            placeholder="Nome do roteiro"
            id="rot-nome"
          />
        {:else}
          <p class="vtur-label">Nome <span class="text-red-500" aria-hidden="true">*</span></p>
          <p id="rot-nome" class="min-h-10 px-2.5 py-2.5 text-sm break-words text-slate-900">
            {nome || '—'}
          </p>
        {/if}
      </div>
      <div>
        {#if editandoDadosRoteiro}
          <FieldInput
            label="Duração (dias)"
            type="number"
            min="1"
            bind:value={duracao}
            placeholder="Ex: 7"
            id="rot-dur"
          />
        {:else}
          <p class="vtur-label">Duração (dias)</p>
          <p id="rot-dur" class="min-h-10 px-2.5 py-2.5 text-sm break-words text-slate-900">
            {duracao || '—'}
          </p>
        {/if}
      </div>
      <div class="lg:col-span-2">
        {#if editandoDadosRoteiro}
          <FieldInput
            id="rot-cidades-visitadas"
            label="Cidades Visitadas"
            bind:value={inicioCidade}
            placeholder="Ex: São Luís • Barreirinhas • Parnaíba • Teresina"
          />
        {:else}
          <p class="vtur-label">Cidades Visitadas</p>
          <p
            id="rot-cidades-visitadas"
            class="min-h-10 px-2.5 py-2.5 text-sm break-words text-slate-900"
          >
            {inicioCidade || '—'}
          </p>
        {/if}
      </div>
    </div>

    <div class="mt-4 border-t border-slate-100 pt-4">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          {#if editandoDadosRoteiro}
            <FieldInput
              label="Nome do cliente"
              bind:value={clienteNome}
              placeholder="Digite o nome do cliente"
              id="rot-cliente-nome"
            />
          {:else}
            <p class="vtur-label">Nome do cliente</p>
            <p
              id="rot-cliente-nome"
              class="min-h-10 px-2.5 py-2.5 text-sm break-words text-slate-900"
            >
              {clienteNome || '—'}
            </p>
          {/if}
        </div>
        <div>
          {#if editandoDadosRoteiro}
            <FieldInput
              label="Telefone/WhatsApp"
              bind:value={clienteTelefone}
              icon={Whatsapp}
              placeholder="(00) 00000-0000"
              mask="phone"
              id="rot-cliente-telefone"
            />
          {:else}
            <p class="vtur-label">Telefone/WhatsApp</p>
            <p
              id="rot-cliente-telefone"
              class="min-h-10 px-2.5 py-2.5 text-sm break-words text-slate-900"
            >
              {clienteTelefone || '—'}
            </p>
          {/if}
        </div>
        <div>
          {#if editandoDadosRoteiro}
            <FieldInput
              label="E-mail"
              type="email"
              bind:value={clienteEmail}
              placeholder="cliente@email.com"
              id="rot-cliente-email"
            />
          {:else}
            <p class="vtur-label">E-mail</p>
            <p
              id="rot-cliente-email"
              class="min-h-10 px-2.5 py-2.5 text-sm break-words text-slate-900"
            >
              {clienteEmail || '—'}
            </p>
          {/if}
        </div>
      </div>

      {#if editandoDadosRoteiro}
        <div class="mt-4">
          <label for="rot-vinculo-cliente" class="mb-1 block text-sm font-medium text-slate-700">
            Vincular cliente cadastrado <span class="font-normal text-slate-500">(opcional)</span>
          </label>

          {#if clienteId}
            <div class="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div
                class="bg-clientes-100 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              >
                <User size={20} class="text-clientes-600" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium text-slate-900">{clienteNome}</p>
                <p class="text-sm text-slate-500">Cliente cadastrado selecionado</p>
              </div>
              <Button variant="ghost" size="sm" type="button" on:click={limparClienteVinculo}>
                <X size={16} />
              </Button>
            </div>
          {:else}
            <div class="relative">
              <FieldInput
                id="rot-vinculo-cliente"
                bind:value={vinculoQ}
                label={null}
                icon={Search}
                on:input={() => {
                  showVinculo = true;
                }}
                on:focus={() => {
                  showVinculo = true;
                }}
                on:blur={() => {
                  setTimeout(() => {
                    showVinculo = false;
                  }, 200);
                }}
                placeholder="Buscar para vincular por nome, email ou CPF..."
                class_name="w-full"
                autocomplete="off"
              />
              {#if showVinculo && vinculoQ.length >= 2}
                <div
                  class="absolute top-full right-0 left-0 z-50 mt-1 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
                >
                  {#if vinculoLoading}
                    <div class="px-4 py-3 text-sm text-slate-500">Buscando...</div>
                  {:else if vinculoResults.length > 0}
                    {#each vinculoResults as cliente}
                      <Button
                        type="button"
                        variant="unstyled"
                        size="sm"
                        on:click={() => selecionarClienteVinculo(cliente)}
                        class_name="block w-full rounded-none border-b border-slate-100 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                      >
                        <p class="font-medium text-slate-900">{cliente.nome}</p>
                        <p class="text-sm text-slate-500">
                          {cliente.email || 'Sem email'}{cliente.whatsapp
                            ? ` • ${cliente.whatsapp}`
                            : ''}
                        </p>
                      </Button>
                    {/each}
                  {:else}
                    <div class="px-4 py-3 text-sm text-slate-500">
                      Nenhum cliente encontrado. Você pode preencher os dados manualmente acima.
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </Card>

  <!-- ─── Abas ──────────────────────────────────────────────────────────── -->
  <Tabs
    className="mb-4"
    mobileDropdown
    activeKey={abaAtiva}
    onSelect={selecionarAba}
    items={ABAS.map((aba) => ({
      key: aba.id,
      label: aba.label,
      badge: tabCounts[aba.id] > 0 ? tabCounts[aba.id] : null
    }))}
  />

  <fieldset
    disabled={!editandoDadosRoteiro}
    aria-label="Dados detalhados do roteiro"
    class="min-w-0 border-0 p-0"
  >
    <legend class="sr-only">Dados detalhados do roteiro</legend>
    <!-- ──────────────────── ABA: ITINERÁRIO ───────────────────────────────── -->
    {#if abaAtiva === 'itinerario'}
      <AbaItinerario
        bind:dias
        bind:diasImportError
        bind:diasImportMsg
        bind:showDiasBusca
        bind:showDiasImport
        {sugestoes}
        buscarDescricoes={abrirDescricoes}
        {abrirBuscaDias}
      />

      <!-- ──────────────────── ABA: HOTÉIS ──────────────────────────────────── -->
    {:else if abaAtiva === 'hoteis'}
      <AbaHoteis
        {HOTEL_CATEGORIA_OPTIONS}
        {HOTEL_REGIME_OPTIONS}
        {handleImportHotelText}
        bind:hoteis
        {hotelImportError}
        {hotelImportMsg}
        bind:hotelImportText
        {onHotelDateChange}
        {sugestoes}
      />

      <!-- ──────────────────── ABA: PASSEIOS ────────────────────────────────── -->
    {:else if abaAtiva === 'opcionais'}
      <AbaOpcionais
        bind:opcionais
        cidadesItinerario={dias.map((dia) => ({ cidade: dia.cidade, cidade_id: dia.cidade_id }))}
        passeiosIncorporados={passeios}
      />
    {:else if abaAtiva === 'aluguel-carro'}
      <AbaPasseios
        tituloCard="Aluguel de Carro"
        rotuloAdicionar="Adicionar aluguel de carro"
        PASSEIO_TIPO_OPTIONS={['Aluguel de Carro']}
        apenasTipos={['Aluguel de Carro']}
        {handleImportPasseioText}
        {passeioImportError}
        {passeioImportMsg}
        bind:passeioImportText
        bind:passeios
        {sugestoes}
      />
    {:else if abaAtiva === 'trem'}
      <AbaPasseios
        tituloCard="Trem"
        rotuloAdicionar="Adicionar trem"
        PASSEIO_TIPO_OPTIONS={['Trem']}
        apenasTipos={['Trem']}
        {handleImportPasseioText}
        {passeioImportError}
        {passeioImportMsg}
        bind:passeioImportText
        bind:passeios
        {sugestoes}
      />
    {:else if abaAtiva === 'seguro-viagem'}
      <AbaPasseios
        tituloCard="Seguro Viagem"
        rotuloAdicionar="Adicionar seguro viagem"
        PASSEIO_TIPO_OPTIONS={['Seguro Viagem']}
        apenasTipos={['Seguro Viagem']}
        {handleImportPasseioText}
        {passeioImportError}
        {passeioImportMsg}
        bind:passeioImportText
        bind:passeios
        {sugestoes}
      />
    {:else if abaAtiva === 'passeios'}
      <AbaPasseios
        {PASSEIO_TIPO_OPTIONS}
        excetoTipos={['Trem', 'Aluguel de Carro', 'Seguro Viagem']}
        {handleImportPasseioText}
        {passeioImportError}
        {passeioImportMsg}
        bind:passeioImportText
        bind:passeios
        {sugestoes}
      />

      <!-- ──────────────────── ABA: AÉREO ───────────────────────────────────── -->
    {:else if abaAtiva === 'transporte'}
      <AbaTransporte
        {TRANSPORTE_TIPO_OPTIONS}
        {TRANSPORTE_TIPO_VOO_OPTIONS}
        {aereoImportError}
        {aereoImportMsg}
        bind:aereoImportText
        {handleImportAereoText}
        {onAereoValorChange}
        bind:transportes
      />

      <!-- ──────────────────── ABA: INVESTIMENTO ────────────────────────────── -->
    {:else if abaAtiva === 'investimento'}
      <AbaInvestimento
        {INVESTIMENTO_TIPO_OPTIONS}
        bind:investimentos
        {onInvestimentoChange}
        {totalInvestimento}
      />

      <!-- ──────────────────── ABA: PAGAMENTO ───────────────────────────────── -->
    {:else if abaAtiva === 'pagamento'}
      <AbaPagamento
        {PAGAMENTO_SERVICO_OPTIONS}
        bind:mostrarInformacoesPdf
        bind:mostrarPagamentoPdf
        bind:mostrarRodapePdf
        bind:pagamentos
        {sugestoes}
        {totalPagamento}
      />

      <!-- ──────────────────── ABA: INCLUSÕES ───────────────────────────────── -->
    {:else if abaAtiva === 'inclusoes'}
      <Card title="Inclusões / Não inclusões" color="clientes">
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <label class="vtur-label" for="inclui">O roteiro inclui</label>
            <FieldTextarea
              id="inclui"
              bind:value={incluiTexto}
              rows={12}
              class_name="w-full"
              monospace={true}
              placeholder="Uma inclusão por linha&#10;Ex: Passagem aérea&#10;Hotel com café da manhã&#10;Transfer aeroporto/hotel"
            />
            <p class="mt-1 text-xs text-slate-400">
              {incluiTexto.split('\n').filter((l) => l.trim()).length} linha(s)
            </p>
          </div>
          <div>
            <label class="vtur-label" for="nao-inclui">O roteiro NÃO inclui</label>
            <FieldTextarea
              id="nao-inclui"
              bind:value={naoIncluiTexto}
              rows={12}
              class_name="w-full"
              monospace={true}
              placeholder="Uma exclusão por linha&#10;Ex: Despesas pessoais&#10;Passeios opcionais&#10;Vistos"
            />
            <p class="mt-1 text-xs text-slate-400">
              {naoIncluiTexto.split('\n').filter((l) => l.trim()).length} linha(s)
            </p>
          </div>
        </div>
      </Card>

      <!-- ──────────────────── ABA: INFORMAÇÕES ─────────────────────────────── -->
    {:else if abaAtiva === 'informacoes'}
      <Card title="Informações importantes" color="clientes">
        <label class="vtur-label" for="info-imp">Informações importantes</label>
        <FieldTextarea
          id="info-imp"
          bind:value={informacoesImportantes}
          rows={20}
          class_name="w-full"
          monospace={true}
          placeholder="Documentos necessários, dicas, políticas de cancelamento, informações de bagagem, etc."
        />
        <p class="mt-1 text-xs text-slate-400">
          {informacoesImportantes.split('\n').filter((l) => l.trim()).length} linha(s)
        </p>
      </Card>
    {/if}
  </fieldset>

  <!-- ─── Ações do roteiro ─────────────────────────────────────────────── -->
  <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
    <Button type="button" variant="secondary" on:click={() => goto('/orcamentos/roteiros')}
      >Cancelar</Button
    >
    <label class="flex items-center gap-2 text-sm text-slate-600">
      Modelo PDF
      <select
        bind:value={modeloPdfRoteiro}
        class="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
      >
        <option value="completo">Padrão</option>
        <option value="moderno">Moderno</option>
      </select>
    </label>
    <Button type="button" variant="secondary" loading={previewingPdf} on:click={handlePreviewPdf}>
      <FileText size={16} class="mr-2" />
      Visualizar PDF
    </Button>
    <Button type="button" variant="secondary" loading={duplicating} on:click={duplicateRoteiro}>
      <Copy size={16} class="mr-2" />
      Duplicar roteiro
    </Button>
    <Button type="button" variant="primary" color="clientes" loading={saving} on:click={save}>
      <Save size={16} class="mr-2" />
      Salvar roteiro
    </Button>
    <Button
      type="button"
      variant="secondary"
      on:click={() => {
        gerarClienteResults = [];
        if (clienteId && clienteNome) {
          gerarClienteSel = {
            id: clienteId,
            nome: clienteNome,
            email: clienteEmail || undefined,
            whatsapp: clienteTelefone || undefined
          };
          gerarClienteQ = clienteNome;
          gerarClienteNome = '';
        } else {
          gerarClienteSel = null;
          gerarClienteQ = '';
          gerarClienteNome = clienteNome;
        }
        showGerarModal = true;
      }}
    >
      <DollarSign size={16} class="mr-2" />
      Gerar Orçamento
    </Button>
  </div>
{/if}

<Dialog
  bind:open={showGerarModal}
  title="Gerar Orçamento"
  description="Informe o cliente para criar o orçamento a partir deste roteiro."
  color="orcamentos"
  cancelText="Cancelar"
  confirmText="Gerar Orçamento"
  showConfirm={true}
  loading={gerarLoading}
  onCancel={() => {
    showGerarModal = false;
    gerarLoading = false;
  }}
  onConfirm={handleGerarOrcamento}
>
  <div class="space-y-4">
    <div>
      <FieldInput
        id="gerar-q"
        label="Buscar cliente"
        bind:value={gerarClienteQ}
        placeholder="Digite o nome..."
      />
      {#if gerarClienteLoading}
        <p class="mt-1 text-xs text-slate-400">Buscando...</p>
      {:else if gerarClienteResults.length > 0}
        <ul class="mt-1 rounded-lg border border-slate-200 bg-white shadow-sm">
          {#each gerarClienteResults as cliente}
            <li>
              <Button
                type="button"
                variant="ghost"
                class_name={`w-full justify-start rounded-none px-3 py-2 text-left text-sm hover:bg-slate-50! ${gerarClienteSel?.id === cliente.id ? 'bg-clientes-50 font-medium text-clientes-700 hover:bg-clientes-50!' : ''}`}
                on:click={() => {
                  gerarClienteSel = cliente;
                  gerarClienteQ = cliente.nome;
                  gerarClienteResults = [];
                }}
              >
                {cliente.nome}
                {#if cliente.email}<span class="ml-2 text-xs text-slate-400">{cliente.email}</span
                  >{/if}
              </Button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    {#if !gerarClienteSel}
      <FieldInput
        label="Ou informe o nome do cliente"
        bind:value={gerarClienteNome}
        placeholder="Nome do cliente"
        id="gerar-nome"
      />
    {:else}
      <div class="bg-clientes-50 text-clientes-700 rounded-lg px-3 py-2 text-sm">
        Cliente selecionado: <strong>{gerarClienteSel.nome}</strong>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          class_name="ml-2 px-0! py-0! text-xs text-slate-400 underline hover:bg-transparent! hover:text-slate-500!"
          on:click={() => {
            gerarClienteSel = null;
            gerarClienteQ = '';
          }}
        >
          Remover
        </Button>
      </div>
    {/if}
  </div>
</Dialog>

<Dialog
  bind:open={showDiasBusca}
  title="Buscar dias no banco"
  description="Reutilize descrições de dias de outros roteiros."
  color="orcamentos"
  size="lg"
  cancelText="Fechar"
  onCancel={() => {
    showDiasBusca = false;
    diasBuscaController?.abort();
  }}
>
  <div class="space-y-3">
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FieldInput label="Texto" bind:value={diasBuscaQ} placeholder="Palavra-chave..." id="db-q" />
      {#if diaBuscaAlvo}
        <p class="self-end pb-2 text-sm text-slate-600">Cidade: {diasBuscaDestino.cidade}</p>
      {:else}
        <CidadeRoteiro bind:destino={diasBuscaDestino} fieldId="db-cidade" />
      {/if}
    </div>

    <Button
      type="button"
      variant="primary"
      color="clientes"
      size="sm"
      loading={diasBuscaLoading}
      on:click={() => buscarDias(0)}
    >
      Buscar
    </Button>

    {#if diasBuscaChave === chaveDestinoBusca() && diasBuscaResults.length > 0}
      <div class="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
        {#each diasBuscaResults as dia}
          <div
            class="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-0"
          >
            <div class="text-sm">
              <span class="font-medium text-slate-700">{dia.cidade || '-'}</span>
              {#if dia.data}<span class="ml-2 text-xs text-slate-400">{dia.data}</span>{/if}
              {#if dia.percurso}<p class="mt-0.5 text-xs text-slate-500">{dia.percurso}</p>{/if}
              {#if dia.descricao}<p class="mt-0.5 text-xs whitespace-pre-wrap text-slate-600">
                  {dia.descricao}
                </p>{/if}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class_name="shrink-0 border border-clientes-200 bg-clientes-100 px-2.5! py-1! text-xs font-medium text-clientes-700 hover:!bg-clientes-200"
              on:click={() => addDiaBanco(dia)}
            >
              <Plus size={16} class="mr-2" />{diaBuscaAlvo ? 'Incluir descrição' : 'Adicionar dia'}
            </Button>
          </div>
        {/each}
      </div>
      <div class="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={diasBuscaOffset === 0 || diasBuscaLoading}
          on:click={() => buscarDias(Math.max(0, diasBuscaOffset - 20))}>Anterior</Button
        >
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!diasBuscaTemMais || diasBuscaLoading}
          on:click={() => buscarDias(diasBuscaOffset + 20)}>Próxima</Button
        >
      </div>
    {:else if !diasBuscaLoading && diasBuscaRealizada && diasBuscaChave === chaveDestinoBusca()}
      <p class="py-4 text-center text-sm text-slate-400">
        Nenhuma descrição encontrada para esta cidade.
      </p>
    {/if}
  </div>
</Dialog>

<Dialog
  bind:open={showDiasImport}
  title="Importar dia a dia do circuito"
  description="Cole o texto do circuito e o sistema monta os dias automaticamente."
  color="orcamentos"
  size="xl"
  cancelText="Cancelar"
  confirmText="Importar dias"
  showConfirm={true}
  onCancel={() => {
    showDiasImport = false;
    diasImportError = null;
    diasImportMsg = null;
  }}
  onConfirm={handleImportDiasText}
>
  <div class="space-y-3">
    <FieldTextarea
      bind:value={diasImportText}
      rows={12}
      class_name="w-full"
      monospace={true}
      placeholder={'Dia 1 - Chegada em Lisboa\nRecepcao no aeroporto e traslado ao hotel.\n\nDia 2 - Lisboa\nCity tour e tarde livre.'}
    />
    <p class="text-xs text-slate-500">
      Formatos aceitos: <strong>Dia 1 - Título</strong>, <strong>1º Dia - Título</strong> ou blocos separados
      por linha em branco.
    </p>
    {#if diasImportMsg}<p class="text-xs text-green-600">{diasImportMsg}</p>{/if}
    {#if diasImportError}<p class="text-xs text-red-600">{diasImportError}</p>{/if}
  </div>
</Dialog>

<style lang="postcss">
  @reference "tailwindcss";
  :global(.vtur-label) {
    @apply mb-1 block text-sm font-medium text-slate-700;
  }
  :global(.vtur-label-xs) {
    @apply mb-1 block text-xs font-medium text-slate-600;
  }
</style>
