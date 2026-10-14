<script lang="ts">
  import { VTUR_LOGO_URL } from "$lib/brand";
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import { supabase } from '$lib/db/supabase';
  import { construirLinkWhatsApp } from '$lib/whatsapp';
  import { mergeImportedRoteiroAereo, parseImportedRoteiroAereo } from '$lib/roteiroAereoImport';
  import { parseImportedRoteiroHotels } from '$lib/roteiroHotelImport';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Tabs from '$lib/components/ui/Tabs.svelte';
  import { FieldCheckbox, FieldDatalistInput, FieldInput, FieldSelect, FieldTextarea, LoadingState } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { fetchImageAsDataUrl } from '$lib/utils/browser-images';
  import { ArrowLeft, Plus, Trash2, Save, ChevronUp, ChevronDown, FileText, DollarSign, RefreshCw, Copy } from '$lib/icons';
  import { ApiError, apiFetch, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { ensureServerSessionCookie } from '$lib/services/session';
  import { diffDaysISODate } from '$lib/date';
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
    type RotTransporte
  } from './_components/tipos';
  import { isImportSectionHeader, normalizeImportLine, parseDiasImportText } from './_components/importacao-dias';
  import { formatBRL } from './_components/formatadores';
  import AbaItinerario from './_components/AbaItinerario.svelte';
  import AbaTransporte from './_components/AbaTransporte.svelte';
  import AbaHoteis from './_components/AbaHoteis.svelte';
  import AbaOpcionais from './_components/AbaOpcionais.svelte';
  import { buildOpcionaisHtml, parseRoteiroOpcionais, type RoteiroOpcionalCidade } from '$lib/roteiroOpcionais';
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
    { id: 'hoteis', label: 'Hotéis' },
    { id: 'passeios', label: 'Passeios' },
    { id: 'opcionais', label: 'Opcionais' },
    { id: 'transporte', label: 'Aéreo' },
    { id: 'investimento', label: 'Investimento' },
    { id: 'pagamento', label: 'Pagamento' },
    { id: 'inclusoes', label: 'Inclusões' },
    { id: 'informacoes', label: 'Informações' },
  ] as const;

  type AbaId = (typeof ABAS)[number]['id'];

  const HOTEL_REGIME_OPTIONS = ['Café da manhã', 'Meia pensão', 'Pensão completa', 'All-inclusive', 'Apenas hospedagem'];
  const HOTEL_CATEGORIA_OPTIONS = ['1 estrela', '2 estrelas', '3 estrelas', '4 estrelas', '5 estrelas', 'Boutique', 'Pousada', 'Resort'];
  const PASSEIO_TIPO_OPTIONS = ['Passeio', 'Transfer', 'Seguro Viagem', 'Serviço', 'Ingresso', 'Outro'];
  const TRANSPORTE_TIPO_OPTIONS = ['Aéreo', 'Terrestre', 'Marítimo', 'Ferroviário'];
  const TRANSPORTE_TIPO_VOO_OPTIONS = ['Nacional', 'Internacional'];
  const INVESTIMENTO_TIPO_OPTIONS = ['Por pessoa', 'Por casal', 'Por família', 'Por apto'];
  const PAGAMENTO_SERVICO_OPTIONS = ['Pacote Completo', 'Passagem Aérea', 'Hospedagem', 'Passeios e Serviços', 'Seguro Viagem', 'Demais Serviços'];

  // ─── Page state ────────────────────────────────────────────────────────────
  const roteiroId = $page.params.id;

  let loading = $state(true);
  let loadError = $state('');
  let saving = $state(false);
  let duplicating = $state(false);
  let previewingPdf = $state(false);
  let incluirCabecalhoRodapePdf = $state(false);
  let abaAtiva: AbaId = $state('itinerario');

  // Form fields
  let nome = $state('');
  let duracao = $state('');
  let inicioCidade = $state('');
  let fimCidade = $state('');
  let incluiTexto = $state('');
  let naoIncluiTexto = $state('');
  let informacoesImportantes = $state('');
  let mostrarPagamentoPdf = $state(true);
  let mostrarInformacoesPdf = $state(true);
  let mostrarRodapePdf = $state(true);

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

  // Modals
  let showGerarModal = $state(false);
  let gerarClienteQ = $state('');
  let gerarClienteResults: { id: string; nome: string; email?: string; whatsapp?: string }[] = $state([]);
  let gerarClienteSel: { id: string; nome: string; email?: string; whatsapp?: string } | null = $state(null);
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
  let diasBuscaCidade = $state('');
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
    itinerario: dias.filter(d => d.cidade || d.percurso || d.data || d.descricao).length,
    hoteis: hoteis.filter(h => h.cidade || h.hotel || h.data_inicio || h.apto || h.categoria).length,
    passeios: passeios.filter(p => p.cidade || p.passeio || p.data_inicio || p.tipo).length,
    transporte: transportes.filter(t => t.trecho || t.cia_aerea || t.data_voo || t.tipo).length,
    investimento: investimentos.filter(i => i.tipo || Number(i.valor_por_pessoa) > 0 || Number(i.valor_por_apto) > 0).length,
    pagamento: pagamentos.filter(p => p.servico || p.forma_pagamento || Number(p.valor_total_com_taxas) > 0).length,
    inclusoes: (incluiTexto.split('\n').filter(l => l.trim()).length) + (naoIncluiTexto.split('\n').filter(l => l.trim()).length),
    informacoes: informacoesImportantes.split('\n').filter(l => l.trim()).length,
  });

  // ─── Totals ────────────────────────────────────────────────────────────────
  let totalPagamento = $derived(pagamentos.reduce((s, p) => s + Number(p.valor_total_com_taxas || 0), 0));
  let totalInvestimento = $derived(investimentos.reduce((s, i) => s + Number(i.valor_por_pessoa || 0), 0));

  // ─── Factory functions ─────────────────────────────────────────────────────

  // ─── List operations ───────────────────────────────────────────────────────

  // ─── Hotel auto-calc noites ────────────────────────────────────────────────
  function calcNoites(dataInicio: string, dataFim: string): number | null {
    if (!dataInicio || !dataFim) return null;
    const diff = diffDaysISODate(dataInicio, dataFim);
    if (diff === null) return null;
    return diff > 0 ? diff : null;
  }

  function onHotelDateChange(index: number, field: 'data_inicio' | 'data_fim', value: string) {
    const hotel = hoteis[index];
    const updated = { ...hotel, [field]: value };
    const noites = calcNoites(
      field === 'data_inicio' ? value : hotel.data_inicio,
      field === 'data_fim' ? value : hotel.data_fim
    );
    hoteis = updateItem(hoteis, index, { [field]: value, noites: noites ?? updated.noites });
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
      investimentos = updateItem(investimentos, index, { [field]: v, valor_por_apto: vpa > 0 ? vpa : null });
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
      diasImportError = 'Nenhum dia foi identificado. Use linhas como "Dia 1 - Chegada" ou blocos separados por linha em branco.';
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
        apiFetch<SugestoesBuscaResponse>('/api/v1/roteiros/sugestoes-busca', { signal: controller.signal, redirectOnForbidden: false }).catch(() => null),
        apiFetch<OrcamentosPdfResponse>('/api/v1/parametros/orcamentos-pdf', { signal: controller.signal, redirectOnForbidden: false }).catch(() => null),
      ]);
      if (seq !== loadSeq || destroyed) return;
      const r = payload.roteiro;

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

      dias = (r.dias || []).map((d) => ({
        ...newDia(d.ordem ?? 0),
        ...d,
        percurso: d.percurso || '',
        data: d.data || '',
        descricao: d.descricao || '',
      }));
      hoteis = (r.hoteis || []).map((h) => ({ ...newHotel(h.ordem ?? 0), ...h }));
      opcionais = r.opcionais || [];
      passeios = (r.passeios || []).map((p) => ({ ...newPasseio(p.ordem ?? 0), ...p }));
      transportes = (r.transportes || []).map((t) => ({ ...newTransporte(t.ordem ?? 0), ...t }));
      investimentos = (r.investimentos || []).map((i) => ({ ...newInvestimento(i.ordem ?? 0), ...i }));
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
  async function save() {
    if (!nome.trim()) { toast.error('Nome obrigatório.'); return; }
    saving = true;
    try {
      await apiPost('/api/v1/roteiros/save', {
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
        dias: dias.map((d, i) => ({ ...d, ordem: i })),
        hoteis: hoteis.map((h, i) => ({ ...h, ordem: i })),
        opcionais: parseRoteiroOpcionais(opcionais),
        passeios: passeios.map((p, i) => ({ ...p, ordem: i })),
        transportes: transportes.map((t, i) => ({ ...t, ordem: i })),
        investimentos: investimentos.map((inv, i) => ({ ...inv, ordem: i })),
        pagamentos: pagamentos.map((p, i) => ({ ...p, ordem: i }))
      });
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

    if (browser && !window.confirm('Deseja duplicar este roteiro? Será criada uma nova cópia para edição.')) {
      return;
    }

    duplicating = true;
    try {
      const payload = await apiPost<{ id?: string }>('/api/v1/roteiros/save', {
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
        dias: dias.map((d, i) => ({ ...d, ordem: i })),
        hoteis: hoteis.map((h, i) => ({ ...h, ordem: i })),
        opcionais: parseRoteiroOpcionais(opcionais),
        passeios: passeios.map((p, i) => ({ ...p, ordem: i })),
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
  async function buscarDias() {
    diasBuscaController?.abort();
    const controller = new AbortController();
    diasBuscaController = controller;
    const seq = ++diasBuscaSeq;
    diasBuscaLoading = true;
    try {
      const data = await apiGet<{ dias?: DiaBuscaResult[] }>('/api/v1/roteiros/dias-busca', {
        q: diasBuscaQ,
        cidade: diasBuscaCidade
      }, controller.signal);
      if (seq !== diasBuscaSeq || destroyed) return;
      diasBuscaResults = data.dias || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao buscar dias.'));
    } finally {
      if (seq === diasBuscaSeq && !destroyed) diasBuscaLoading = false;
    }
  }

  function addDiaBanco(dia: DiaBuscaResult) {
    const nextItem: RotDia = {
      percurso: String(dia.percurso || '').trim(),
      cidade: String(dia.cidade || '').trim(),
      data: String(dia.data || '').trim(),
      descricao: String(dia.descricao || '').trim(),
      ordem: dias.length,
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
        const data = await apiFetch<ClienteBuscaResponse | ClienteBuscaResult[]>('/api/v1/clientes', {
          query: { search: gerarClienteQ },
          signal: controller.signal,
          // Busca opcional de cliente: sem acesso a Clientes, só não lista (não vai para "/negado").
          redirectOnForbidden: false
        });
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
    if (!clientName) { toast.error('Informe o nome do cliente.'); return; }
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
      const lines = passeioImportText.split('\n').filter(l => l.trim());
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
    const normalized = String(value || '').trim();
    if (!normalized) return '';

    const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return `${day}-${month}-${year}`;
    }

    const isoDateTimeMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T.*$/);
    if (isoDateTimeMatch) {
      const [, year, month, day] = isoDateTimeMatch;
      return `${day}-${month}-${year}`;
    }

    return normalized;
  }

  function buildPreviewSection(title: string, content: string) {
    if (!content.trim()) return '';
    return `<section class="section"><h2>${escapePreviewHtml(title)}</h2><div class="grid">${content}</div></section>`;
  }

  function buildPreviewRawSection(title: string, content: string, sectionClass = '') {
    if (!content.trim()) return '';
    const className = ['section', sectionClass].filter(Boolean).join(' ');
    return `<section class="${className}"><h2>${escapePreviewHtml(title)}</h2>${content}</section>`;
  }

  function buildPreviewListSection(title: string, items: string[]) {
    const filtered = items.map((item) => String(item || '').trim()).filter(Boolean);
    if (filtered.length === 0) return '';
    return `<section class="section"><h2>${escapePreviewHtml(title)}</h2>${buildPreviewList(filtered)}</section>`;
  }

  function buildPreviewTable(headers: string[], rows: string[][], className = '') {
    if (rows.length === 0) return '';
    return `<div class="preview-table-wrap ${escapePreviewHtml(className)}"><table class="preview-table ${escapePreviewHtml(className)}">
      <thead>
        <tr>${headers.map((header) => `<th>${escapePreviewHtml(header)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${escapePreviewHtml(cell || '-')}</td>`).join('')}</tr>`)
          .join('')}
      </tbody>
    </table></div>`;
  }

  function splitTrechoCities(value: string | null | undefined) {
    const parts = String(value || '')
      .split(/\s+-\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    return {
      origem: parts[0] || '',
      destino: parts[1] || '',
    };
  }

  function resolvePreviewAirlineIata(value: string | null | undefined) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized.includes('lufthansa')) return 'LH';
    if (normalized.includes('latam')) return 'LA';
    if (normalized.includes('gol')) return 'G3';
    if (normalized.includes('azul')) return 'AD';
    if (normalized.includes('sky')) return 'H2';
    if (normalized.includes('tap')) return 'TP';
    if (normalized.includes('iberia')) return 'IB';
    if (normalized.includes('air france')) return 'AF';
    if (normalized.includes('klm')) return 'KL';
    if (normalized.includes('emirates')) return 'EK';
    if (normalized.includes('qatar')) return 'QR';
    if (normalized.includes('turkish')) return 'TK';
    return String(value || '').trim().slice(0, 3).toUpperCase();
  }

  function formatFlightCity(value: string | null | undefined) {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    return normalized
      .split(/\s*-\s*/)
      .map((part) => part.trim())
      .filter(Boolean)[0] || normalized;
  }

  function formatFlightPlace(city: string | null | undefined, airportCode: string | null | undefined) {
    const cityLabel = formatFlightCity(city);
    const code = String(airportCode || '').trim().toUpperCase();
    if (cityLabel && code) return `${cityLabel} (${code})`;
    if (cityLabel) return cityLabel;
    if (code) return code;
    return '';
  }

  function buildPreviewFlightTable(items: RotTransporte[]) {
    if (items.length === 0) return '';

    const airlineLegend = new Map<string, string>();
    const rows = items
      .map((item) => {
        const trecho = splitTrechoCities(item.trecho || '');
        const ciaCompleta = String(item.cia_aerea || '').trim();
        const cia = resolvePreviewAirlineIata(ciaCompleta) || ciaCompleta || 'AÉREO';
        if (ciaCompleta && cia && cia !== ciaCompleta.toUpperCase()) {
          airlineLegend.set(cia, ciaCompleta);
        }
        const origem = formatFlightPlace(trecho.origem, item.aeroporto_saida) || '-';
        const destino = formatFlightPlace(trecho.destino, item.aeroporto_chegada) || '-';
        const horarios = [String(item.hora_saida || '').trim(), String(item.hora_chegada || '').trim()].filter(Boolean).join(' / ') || '-';

        return [
          cia,
          origem,
          formatPreviewDate(item.data_voo || item.data_inicio),
          destino,
          formatPreviewDate(item.data_fim || item.data_voo || item.data_inicio),
          horarios,
        ];
      })
      .filter((row) => row.length > 0);

    const legendHtml = airlineLegend.size > 0
      ? `<div class="preview-legend">${Array.from(airlineLegend.entries()).map(([code, name]) => `<div><b>${escapePreviewHtml(code)}</b> = ${escapePreviewHtml(name)}</div>`).join('')}</div>`
      : '';

    return `${buildPreviewTable(['Cia', 'Origem', 'Saída', 'Destino', 'Chegada', 'Horários'], rows, 'flight-preview-table')}${legendHtml}`;
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

  async function storageImageToDataUrl(path?: string | null, url?: string | null): Promise<string | null> {
    const storagePath = path || extractStoragePath(url);
    if (!storagePath) return null;

    try {
      const { data: blob, error } = await supabase.storage.from('quotes').download(storagePath);
      if (error || !blob) return null;
      const dataUrl = await blobToDataUrl(blob, guessMimeFromPath(storagePath));
      return dataUrl || null;
    } catch {
      return null;
    }
  }

  async function resolvePreviewPdfAssets(): Promise<PreviewPdfAssets> {
    if (!incluirCabecalhoRodapePdf) return { complementUrl: null, qrUrl: null };

    const whatsappLink = construirLinkWhatsApp(pdfSettings.whatsapp, pdfSettings.whatsapp_codigo_pais);
    const qrSource = whatsappLink
      ? `/api/v1/qr?size=200&margin=1&text=${encodeURIComponent(whatsappLink)}`
      : null;

    const [complementUrl, qrUrl] = await Promise.all([
      storageImageToDataUrl(pdfSettings.imagem_complementar_path, pdfSettings.imagem_complementar_url),
      qrSource ? fetchImageAsDataUrl(qrSource) : Promise.resolve(null),
    ]);

    return { complementUrl, qrUrl };
  }

  function buildRoteiroPreviewHtml(assets: PreviewPdfAssets = { qrUrl: null, complementUrl: null }) {
    const diasItems = dias.filter((dia) => dia.cidade || dia.percurso || dia.data || dia.descricao);
    const diasHtml = diasItems.length > 0
      ? buildPreviewCards(
      diasItems,
      (dia, index) => `
        <article class="card">
          <h3>Dia ${index + 1} - ${escapePreviewHtml(dia.cidade || dia.percurso || 'Sem título')}</h3>
          ${dia.data ? `<p class="meta">${escapePreviewHtml(formatPreviewDate(dia.data))}</p>` : ''}
          ${dia.percurso && dia.percurso !== dia.cidade ? `<p class="meta">${escapePreviewHtml(dia.percurso)}</p>` : ''}
          ${dia.descricao ? `<p>${escapePreviewHtml(dia.descricao).replace(/\n/g, '<br>')}</p>` : '<p class="empty">Sem descrição.</p>'}
        </article>`
    ) : '';

    const transportesItems = transportes.filter((item) => item.trecho || item.cia_aerea || item.data_voo);
    const transportesHtml = transportesItems.length > 0
      ? buildPreviewFlightTable(transportesItems)
      : '';

    const hoteisItems = hoteis.filter((item) => item.hotel || item.cidade);
    const groupedHoteis = Array.from(
      hoteisItems.reduce((map, item) => {
        const key = String(item.cidade || 'Hotéis').trim() || 'Hotéis';
        if (!map.has(key)) map.set(key, [] as RotHotel[]);
        map.get(key)?.push(item);
        return map;
      }, new Map<string, RotHotel[]>())
    );
    const hoteisHtml = groupedHoteis.length > 0
      ? groupedHoteis
          .map(([cidade, itens]) => {
            const rows = itens.map((item) => [
              String(item.hotel || '').trim() || '-',
              formatPreviewDate(item.data_inicio) || '-',
              formatPreviewDate(item.data_fim) || '-',
              Number(item.noites || 0) > 0 ? String(Number(item.noites || 0)) : '-',
              String(item.apto || '').trim() || '-',
              String(item.regime || '').trim() || '-',
            ]);
            return `<div class="preview-group-block"><div class="preview-group-title">${escapePreviewHtml(cidade)}</div>${buildPreviewTable(['Nome hotel', 'Início', 'Fim', 'Noites', 'Acomodação', 'Regime'], rows, 'hotel-preview-table')}</div>`;
          })
          .join('')
      : '';

    const passeiosItems = passeios.filter((item) => item.passeio || item.cidade);
    const groupedPasseios = Array.from(
      passeiosItems.reduce((map, item) => {
        const key = String(item.cidade || 'Serviços').trim() || 'Serviços';
        if (!map.has(key)) map.set(key, [] as RotPasseio[]);
        map.get(key)?.push(item);
        return map;
      }, new Map<string, RotPasseio[]>())
    );
    const passeiosHtml = groupedPasseios.length > 0
      ? groupedPasseios
          .map(([cidade, itens]) => {
            const rows = itens.map((item) => {
              const dataInicio = formatPreviewDate(item.data_inicio);
              const dataFim = formatPreviewDate(item.data_fim);
              const data = dataInicio && dataFim && dataInicio !== dataFim ? `${dataInicio} a ${dataFim}` : dataInicio || dataFim || '-';
              return [data, String(item.passeio || '').trim() || '-', String(item.ingressos || '').trim() || '-'];
            });
            return `<div class="preview-group-block"><div class="preview-group-title">${escapePreviewHtml(cidade)}</div>${buildPreviewTable(['Data', 'Descrição', 'Ingressos'], rows, 'passeio-preview-table')}</div>`;
          })
          .join('')
      : '';

    const investimentoRows = investimentos
      .filter((item) => item.tipo || Number(item.valor_por_pessoa || 0) > 0 || Number(item.valor_por_apto || 0) > 0)
      .map((item) => [
        String(item.tipo || '').trim() || '-',
        Number(item.valor_por_pessoa || 0) > 0 ? `R$ ${formatBRL(Number(item.valor_por_pessoa || 0))}` : '-',
        Number(item.qtd_apto || 0) > 0 ? String(Number(item.qtd_apto || 0)) : '-',
        Number(item.valor_por_apto || 0) > 0 ? `R$ ${formatBRL(Number(item.valor_por_apto || 0))}` : '-',
      ]);
    const investimentoHtml = investimentoRows.length > 0
      ? buildPreviewTable(['Tipo', 'Valor por Pessoa', 'Qte Paxs', 'Valor total por Apto'], investimentoRows, 'investimento-preview-table')
      : '';

    const pagamentosItems = pagamentos.filter((item) => item.servico || item.valor_total_com_taxas);
    const pagamentosHtml = pagamentosItems.length > 0
      ? buildPreviewCards(
      pagamentosItems,
      (item) => `<article class="card compact"><h3>${escapePreviewHtml(item.servico || 'Pagamento')}</h3><p>${escapePreviewHtml([item.forma_pagamento, item.valor_total_com_taxas != null ? `R$ ${formatBRL(Number(item.valor_total_com_taxas || 0))}` : ''].filter(Boolean).join(' • '))}</p></article>`
    ) : '';

    const includesSection = buildPreviewListSection('O roteiro inclui', incluiTexto.split('\n'));
    const excludesSection = buildPreviewListSection('O roteiro não inclui', naoIncluiTexto.split('\n'));
    const infoSection = buildPreviewListSection('Informações importantes', informacoesImportantes.split('\n'));

    const footerLines = String(pdfSettings.rodape_texto || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const rightLines = [
      pdfSettings.consultor_nome ? `Consultor: ${pdfSettings.consultor_nome}` : '',
      pdfSettings.telefone ? `Telefone: ${pdfSettings.telefone}` : '',
      pdfSettings.whatsapp ? `WhatsApp: ${pdfSettings.whatsapp}` : '',
      pdfSettings.email ? `E-mail: ${pdfSettings.email}` : '',
    ].filter(Boolean);

    const citiesLine = [inicioCidade, fimCidade].filter(Boolean).join(' • ');
    const periodText = (() => {
      const firstDia = diasItems.find((item) => item.data)?.data || transportesItems.find((item) => item.data_voo || item.data_inicio)?.data_voo || transportesItems.find((item) => item.data_inicio)?.data_inicio || '';
      const lastDia = [...diasItems].reverse().find((item) => item.data)?.data || [...transportesItems].reverse().find((item) => item.data_fim || item.data_voo || item.data_inicio)?.data_fim || '';
      const start = formatPreviewDate(firstDia);
      const end = formatPreviewDate(lastDia);
      if (start && end && start !== end) return `${start} a ${end}`;
      return start || end || '';
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
        <div class="preview-title-name">${escapePreviewHtml(nome || 'Roteiro')}</div>
        ${citiesLine ? `<div class="preview-title-meta"><b>Cidades:</b> ${escapePreviewHtml(citiesLine)}</div>` : ''}
        ${periodText ? `<div class="preview-title-meta"><b>Período:</b> ${escapePreviewHtml(periodText)}</div>` : ''}
      </section>`;

    const footerHtml = footerLines.length > 0
      ? `<section class="preview-footer-card"><div>${footerLines.map((line) => escapePreviewHtml(line)).join('<br/>')}</div>${assets.complementUrl ? `<div class="preview-complement-img"><img src="${escapePreviewHtml(assets.complementUrl)}" alt="Imagem complementar" /></div>` : ''}</section>`
      : '';

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
            .preview-table-wrap { overflow: hidden; border: 1px solid #e2e8f0; border-radius: 14px; }
            .preview-table { width: 100%; border-collapse: collapse; font-size: 12px; }
            .preview-table thead th { text-align: left; padding: 8px; border-bottom: 1px solid #cbd5e1; background: #eef2ff; color: #1e3a8a; }
            .preview-table tbody td { padding: 8px; border-bottom: 1px solid #e2e8f0; color: #475569; vertical-align: top; }
            .preview-table tbody tr:last-child td { border-bottom: 0; }
            .preview-group-block { margin: 0 0 12px 0; }
            .preview-group-title { font-size: 15px; font-weight: 700; color: #334155; margin: 0 0 10px 0; }
            .preview-legend { margin-top: 10px; font-size: 11px; color: #334155; }
            .preview-legend div + div { margin-top: 4px; }
            .preview-footer-card { padding: 12px 14px; margin: 24px 0 12px 0; font-size: 10px; color: #64748b; }
            .preview-complement-img { margin: 12px 0 0 0; text-align: center; }
            .preview-complement-img img { max-height: 170px; max-width: 100%; }
            .hotel-preview-table.preview-table {
              font-size: 13px;
              table-layout: fixed;
              width: 100%;
            }
            .hotel-preview-table.preview-table thead th { font-size: 12px; }
            .hotel-preview-table.preview-table tbody td { font-size: 13px; }
            .hotel-preview-table.preview-table th:nth-child(1),
            .hotel-preview-table.preview-table td:nth-child(1) { width: 24%; }
            .hotel-preview-table.preview-table th:nth-child(2),
            .hotel-preview-table.preview-table td:nth-child(2) { width: 13%; white-space: nowrap; }
            .hotel-preview-table.preview-table th:nth-child(3),
            .hotel-preview-table.preview-table td:nth-child(3) { width: 13%; white-space: nowrap; }
            .hotel-preview-table.preview-table th:nth-child(4),
            .hotel-preview-table.preview-table td:nth-child(4) { width: 8%; white-space: nowrap; text-align: center; }
            .hotel-preview-table.preview-table th:nth-child(5),
            .hotel-preview-table.preview-table td:nth-child(5) { width: 18%; }
            .hotel-preview-table.preview-table th:nth-child(6),
            .hotel-preview-table.preview-table td:nth-child(6) { width: 24%; }
            .flight-preview-table.preview-table { font-size: 13px; }
            .flight-preview-table.preview-table thead th { font-size: 12px; }
            .flight-preview-table.preview-table tbody td { font-size: 13px; }
            .meta { color: #475569; font-size: 13px; margin-bottom: 8px !important; }
            .empty { color: #64748b; font-style: italic; }
            ul { margin: 0; padding-left: 18px; }
            li { margin: 0 0 6px; }
            @media print {
              @page { margin: 12mm; }
              body { background: white; }
              .toolbar { display: none; }
              .shell { max-width: none; padding: 0; }
              .preview-header-card, .preview-title-card, .preview-footer-card, .section { box-shadow: none; border-radius: 0; }
              .preview-title-card, .section { padding: 12px 14px 18px; }
              .preview-table-wrap { border-radius: 0; }
              .section { break-inside: auto; page-break-inside: auto; }
              .section h2 { break-after: avoid; page-break-after: avoid; }
              .preview-header-card,
              .preview-title-card,
              .preview-footer-card,
              .card,
              .preview-group-block,
              .preview-table-wrap,
              .preview-complement-img,
              .preview-header-table,
              .preview-header-right-inner {
                break-inside: avoid;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="shell">
            <div class="toolbar"><a class="print-action" href="#" onclick="event.preventDefault(); window.print();">Imprimir / Salvar em PDF</a></div>
            ${incluirCabecalhoRodapePdf ? headerCardHtml : ''}
            ${titleCardHtml}
            ${buildPreviewSection('Itinerário Detalhado', diasHtml)}
            ${buildPreviewRawSection('Hotéis Sugeridos', hoteisHtml, 'preview-hotels-section')}
            ${buildPreviewRawSection('Passeios e Serviços', passeiosHtml, 'preview-passeios-section')}
            ${buildPreviewSection('Passeios Opcionais — sugestões sem data marcada, não incluídas no valor do roteiro', buildOpcionaisHtml(opcionais, escapePreviewHtml))}
            ${buildPreviewRawSection('Passagem Aérea', transportesHtml, 'preview-airfare-section')}
            ${buildPreviewRawSection('Investimento', investimentoHtml, 'preview-investimento-section')}
            ${mostrarPagamentoPdf ? buildPreviewSection('Pagamento', pagamentosHtml) : ''}
            ${buildPreviewListSection('O que está incluído', incluiTexto.split('\n'))}
            ${buildPreviewListSection('O que não está incluído', naoIncluiTexto.split('\n'))}
            ${mostrarInformacoesPdf ? buildPreviewListSection('Informações Importantes', informacoesImportantes.split('\n')) : ''}
            ${incluirCabecalhoRodapePdf && mostrarRodapePdf ? footerHtml : ''}
          </div>
        </body>
      </html>`;
  }

  async function handlePreviewPdf() {
    if (!browser) return;
    previewingPdf = true;
    try {
      const assets = await resolvePreviewPdfAssets();
      const html = buildRoteiroPreviewHtml(assets);
      const previewUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      const opened = safeOpenNewTab(previewUrl, ['blob:']);
      if (!opened) {
        throw new Error('Não foi possível abrir a prévia do PDF. Verifique o bloqueador de pop-up.');
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
    loadController?.abort();
    diasBuscaController?.abort();
    clienteBuscaController?.abort();
    if (clienteSearchTimeout) clearTimeout(clienteSearchTimeout);
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
      { label: 'Duplicar', onClick: duplicateRoteiro, variant: 'secondary', icon: Copy }
    ]}
  />

  <!-- ─── Cabeçalho do roteiro ──────────────────────────────────────────── -->
  <Card title="Dados do roteiro" color="clientes" class="mb-4">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
      <div class="lg:col-span-2">
        <FieldInput label="Nome" required bind:value={nome} placeholder="Nome do roteiro" id="rot-nome" />
      </div>
      <div>
        <FieldInput label="Duração (dias)" type="number" min="1" bind:value={duracao} placeholder="Ex: 7" id="rot-dur" />
      </div>
      <div class="lg:col-span-2">
        <FieldInput
          id="rot-cidades-visitadas"
          label="Cidades Visitadas"
          bind:value={inicioCidade}
          placeholder="Ex: São Luís • Barreirinhas • Parnaíba • Teresina"
        />
      </div>
    </div>

    <div class="mt-4">
      <FieldCheckbox
        label="Incluir cabeçalho e rodapé no PDF"
        helper="Inclui logo, contatos, QR Code e condições de preços (se habilitadas na aba Pagamento). Por padrão, o PDF é gerado sem esses dados."
        bind:checked={incluirCabecalhoRodapePdf}
        color="clientes"
      />
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" size="sm" on:click={() => goto('/orcamentos/roteiros')}>Cancelar</Button>
      <Button type="button" variant="secondary" size="sm" loading={previewingPdf} on:click={handlePreviewPdf}>
        <FileText size={14} class="mr-1" />
        Visualizar PDF
      </Button>
      <Button type="button" variant="secondary" size="sm" loading={duplicating} on:click={duplicateRoteiro}>
        <Copy size={14} class="mr-1" />
        Duplicar roteiro
      </Button>
      <Button type="button" variant="primary" color="clientes" size="sm" loading={saving} on:click={save}>
        <Save size={14} class="mr-1" />
        Salvar roteiro
      </Button>
      <Button type="button" variant="secondary" size="sm" on:click={() => { showGerarModal = true; }}>
        <DollarSign size={14} class="mr-1" />
        Gerar Orçamento
      </Button>
    </div>
  </Card>

  <!-- ─── Abas ──────────────────────────────────────────────────────────── -->
  <Tabs
    className="mb-4"
    bind:activeKey={abaAtiva}
    items={ABAS.map((aba) => ({
      key: aba.id,
      label: aba.label,
      badge: tabCounts[aba.id] > 0 ? tabCounts[aba.id] : null
    }))}
  />

  <!-- ──────────────────── ABA: ITINERÁRIO ───────────────────────────────── -->
  {#if abaAtiva === 'itinerario'}
    <AbaItinerario bind:dias bind:diasImportError bind:diasImportMsg bind:showDiasBusca bind:showDiasImport {sugestoes} />

  <!-- ──────────────────── ABA: HOTÉIS ──────────────────────────────────── -->
  {:else if abaAtiva === 'hoteis'}
    <AbaHoteis {HOTEL_CATEGORIA_OPTIONS} {HOTEL_REGIME_OPTIONS} {handleImportHotelText} bind:hoteis {hotelImportError} {hotelImportMsg} bind:hotelImportText {onHotelDateChange} {sugestoes} />

  <!-- ──────────────────── ABA: PASSEIOS ────────────────────────────────── -->
  {:else if abaAtiva === 'opcionais'}
    <AbaOpcionais bind:opcionais />
  {:else if abaAtiva === 'passeios'}
    <AbaPasseios {PASSEIO_TIPO_OPTIONS} {handleImportPasseioText} {passeioImportError} {passeioImportMsg} bind:passeioImportText bind:passeios {sugestoes} />

  <!-- ──────────────────── ABA: AÉREO ───────────────────────────────────── -->
  {:else if abaAtiva === 'transporte'}
    <AbaTransporte {TRANSPORTE_TIPO_OPTIONS} {TRANSPORTE_TIPO_VOO_OPTIONS} {aereoImportError} {aereoImportMsg} bind:aereoImportText {handleImportAereoText} {onAereoValorChange} bind:transportes />

  <!-- ──────────────────── ABA: INVESTIMENTO ────────────────────────────── -->
  {:else if abaAtiva === 'investimento'}
    <AbaInvestimento {INVESTIMENTO_TIPO_OPTIONS} bind:investimentos {onInvestimentoChange} {totalInvestimento} />

  <!-- ──────────────────── ABA: PAGAMENTO ───────────────────────────────── -->
  {:else if abaAtiva === 'pagamento'}
    <AbaPagamento {PAGAMENTO_SERVICO_OPTIONS} bind:mostrarInformacoesPdf bind:mostrarPagamentoPdf bind:mostrarRodapePdf bind:pagamentos {sugestoes} {totalPagamento} />

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
          <p class="mt-1 text-xs text-slate-400">{incluiTexto.split('\n').filter(l => l.trim()).length} linha(s)</p>
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
          <p class="mt-1 text-xs text-slate-400">{naoIncluiTexto.split('\n').filter(l => l.trim()).length} linha(s)</p>
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
      <p class="mt-1 text-xs text-slate-400">{informacoesImportantes.split('\n').filter(l => l.trim()).length} linha(s)</p>
    </Card>
  {/if}

  <div class="mt-6">
    <FieldCheckbox
        label="Incluir cabeçalho e rodapé no PDF"
        helper="Inclui logo, contatos, QR Code e condições de preços (se habilitadas na aba Pagamento). Por padrão, o PDF é gerado sem esses dados."
        bind:checked={incluirCabecalhoRodapePdf}
        color="clientes"
      />
  </div>

  <!-- ─── Botão salvar flutuante ─────────────────────────────────────────── -->
  <div class="mt-6 flex justify-end gap-3">
    <Button type="button" variant="secondary" on:click={() => goto('/orcamentos/roteiros')}>Cancelar</Button>
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
  onCancel={() => { showGerarModal = false; gerarLoading = false; }}
  onConfirm={handleGerarOrcamento}
>
  <div class="space-y-4">
    <div>
      <FieldInput id="gerar-q" label="Buscar cliente" bind:value={gerarClienteQ} placeholder="Digite o nome..." />
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
                on:click={() => { gerarClienteSel = cliente; gerarClienteQ = cliente.nome; gerarClienteResults = []; }}
              >
                {cliente.nome}
                {#if cliente.email}<span class="ml-2 text-xs text-slate-400">{cliente.email}</span>{/if}
              </Button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    {#if !gerarClienteSel}
      <FieldInput label="Ou informe o nome do cliente" bind:value={gerarClienteNome} placeholder="Nome do cliente" id="gerar-nome" />
    {:else}
      <div class="rounded-lg bg-clientes-50 px-3 py-2 text-sm text-clientes-700">
        Cliente selecionado: <strong>{gerarClienteSel.nome}</strong>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          class_name="ml-2 px-0! py-0! text-xs text-slate-400 underline hover:bg-transparent! hover:text-slate-500!"
          on:click={() => { gerarClienteSel = null; gerarClienteQ = ''; }}
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
  onCancel={() => { showDiasBusca = false; }}
>
  <div class="space-y-3">
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FieldInput label="Texto" bind:value={diasBuscaQ} placeholder="Palavra-chave..." id="db-q" />
      <FieldDatalistInput
        id="db-cidade"
        label="Cidade"
        bind:value={diasBuscaCidade}
        placeholder="Filtrar por cidade"
        options={sugestoes['cidade'] || []}
        listId="sugestoes-cidade"
      />
    </div>

    <Button type="button" variant="primary" color="clientes" size="sm" loading={diasBuscaLoading} on:click={buscarDias}>
      Buscar
    </Button>

    {#if diasBuscaResults.length > 0}
      <div class="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
        {#each diasBuscaResults as dia}
          <div class="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-0">
            <div class="text-sm">
              <span class="font-medium text-slate-700">{dia.cidade || '-'}</span>
              {#if dia.data}<span class="ml-2 text-xs text-slate-400">{dia.data}</span>{/if}
              {#if dia.percurso}<p class="mt-0.5 text-xs text-slate-500">{dia.percurso}</p>{/if}
              {#if dia.descricao}<p class="mt-0.5 line-clamp-2 text-xs text-slate-600">{dia.descricao}</p>{/if}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class_name="shrink-0 border border-clientes-200 bg-clientes-100 px-2.5! py-1! text-xs font-medium text-clientes-700 hover:!bg-clientes-200"
              on:click={() => addDiaBanco(dia)}
            >
              Usar
            </Button>
          </div>
        {/each}
      </div>
    {:else if !diasBuscaLoading}
      <p class="py-4 text-center text-sm text-slate-400">Nenhum resultado. Tente buscar acima.</p>
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
  onCancel={() => { showDiasImport = false; diasImportError = null; diasImportMsg = null; }}
  onConfirm={handleImportDiasText}
>
  <div class="space-y-3">
    <FieldTextarea
      bind:value={diasImportText}
      rows={12}
      class_name="w-full"
      monospace={true}
      placeholder={"Dia 1 - Chegada em Lisboa\nRecepcao no aeroporto e traslado ao hotel.\n\nDia 2 - Lisboa\nCity tour e tarde livre."}
    />
    <p class="text-xs text-slate-500">
      Formatos aceitos: <strong>Dia 1 - Título</strong>, <strong>1º Dia - Título</strong> ou blocos separados por linha em branco.
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
