<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { PageHeader, Card, Button, Dialog, FieldInput, FieldSelect, FieldTextarea, LoadingState } from '$lib/components/ui';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { downloadBlob, fetchPreviewPngBlob } from '$lib/utils/browser-images';
  import { toUserMessage } from '$lib/utils/errors';
  import { safeOpenNewTab } from '$lib/security/url';
  import {
    RefreshCw,
    Image as ImageIcon,
    MessageSquare,
    Tag,
    Send,
    Eye,
    ChevronLeft,
    ChevronRight,
    Search,
    ExternalLink,
    Download,
    MessageCircle,
    X,
    Pencil
  } from '$lib/icons';
  const loadGuard = createLoadGuard();
  const clienteSearchGuard = createLoadGuard();

  // ── Types ────────────────────────────────────────────────────────────────────

  type Category = {
    id: string;
    nome: string;
    icone: string;
    sort_order: number;
  };

  type Theme = {
    id: string;
    user_id?: string | null;
    nome: string;
    categoria: string | null;
    categoria_id: string | null;
    asset_url: string;
    greeting_text: string | null;
    mensagem_max_linhas: number | null;
    mensagem_max_palavras: number | null;
    assinatura_max_linhas: number | null;
    assinatura_max_palavras: number | null;
    scope: string | null;
    ativo?: boolean | null;
  };

  type MessageTemplate = {
    id: string;
    user_id?: string | null;
    nome: string;
    titulo: string;
    corpo: string;
    categoria: string | null;
    scope?: string | null;
    ativo?: boolean | null;
  };

  type Cliente = {
    id: string;
    nome: string;
  };

  type ClienteSearchResponse = {
    clientes?: Cliente[];
    items?: Cliente[];
  };

  type AssinaturaForm = {
    linha1: string;
    linha1_font_size: number;
    linha1_italic: boolean;
    linha2: string;
    linha2_font_size: number;
    linha2_italic: boolean;
    linha3: string;
    linha3_font_size: number;
    linha3_italic: boolean;
  };

  type LibraryData = {
    userId: string;
    userRole: string | null;
    isAdmin: boolean;
    currentCompanyId: string | null;
    categories: Category[];
    themes: Theme[];
    messages: MessageTemplate[];
    signature: AssinaturaForm | null;
    settings: { consultor_nome?: string | null } | null;
    themeLogoColumnsAvailable: boolean;
  };

  const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function normalizeText(value?: string | null) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function getPrimeiroNome(nome: string) {
    return (nome || '').trim().split(/\s+/)[0] || '';
  }

  function countWords(text: string) {
    return (text || '').trim().match(/\S+/g)?.length || 0;
  }

  function countLines(text: string) {
    return (text || '').split('\n').length;
  }

  /**
   * Detecta saudação automática baseada no nome/categoria do tema.
   * Portabilizado fielmente de CrmIsland.tsx (resolveGreetingByTheme).
   */
  function resolveGreetingByTheme(theme?: Pick<Theme, 'nome' | 'categoria' | 'greeting_text'> | null): string {
    const explicit = String(theme?.greeting_text || '').trim();
    if (explicit) return explicit;
    const source = `${theme?.nome || ''} ${theme?.categoria || ''}`;
    const normalized = normalizeText(source);
    if (normalized.includes('anivers') || normalized.includes('birthday')) return 'Feliz Aniversário!';
    if (normalized.includes('pascoa') || normalized.includes('easter')) return 'Feliz Páscoa!';
    if (normalized.includes('natal') || normalized.includes('christmas')) return 'Feliz Natal!';
    if (
      normalized.includes('ano novo') ||
      normalized.includes('ano-novo') ||
      normalized.includes('anonovo') ||
      normalized.includes('new year')
    ) {
      return 'Feliz Ano Novo!';
    }
    if (normalized.includes('dia das maes') || normalized.includes('mother')) return 'Feliz Dia das Mães!';
    if (normalized.includes('dia dos pais') || normalized.includes('father')) return 'Feliz Dia dos Pais!';
    if (normalized.includes('dia da mulher') || normalized.includes('women')) return 'Feliz Dia da Mulher!';
    if (normalized.includes('viajant') || normalized.includes('travel')) return 'Boas viagens e muitas conquistas!';
    return '';
  }

  /**
   * Remove saudação legada da primeira linha do template.
   * Portabilizado fielmente de CrmIsland.tsx (stripLegacyGreeting).
   */
  function stripLegacyGreeting(message: string): string {
    const raw = String(message || '').replace(/\r/g, '');
    if (!raw.trim()) return '';
    const lines = raw.split('\n');
    const first = normalizeText(lines[0] || '');
    const looksLikeLegacy =
      first.startsWith('prezado') ||
      first.startsWith('prezada') ||
      first.includes('[nome do cliente]') ||
      first.includes('{nome}');
    if (!looksLikeLegacy) return raw;
    return lines.slice(1).join('\n').trimStart();
  }

  /**
   * Substitui variáveis {{nome_cliente}}, {{primeiro_nome}}, {{consultor}} no template.
   */
  function interpolateTemplate(template: string, vars: { nome: string; primeiroNome: string; consultor: string }): string {
    return template
      .replace(/\{\{nome_cliente\}\}/g, vars.nome)
      .replace(/\{\{primeiro_nome\}\}/g, vars.primeiroNome)
      .replace(/\{\{consultor\}\}/g, vars.consultor);
  }

  /**
   * Constrói a URL do preview SVG.
   * Portabilizado fielmente de CrmIsland.tsx (buildPreviewParams).
   */
  function buildPreviewUrl(params: {
    themeId: string;
    themeAssetUrl?: string | null;
    greeting: string;
    primeiroNome: string;
    nomeCompleto: string;
    mensagem: string;
    assinatura: AssinaturaForm;
    textColor?: string;
  }): string {
    const q = new URLSearchParams();
    q.set('theme_id', params.themeId);
    if (params.themeAssetUrl) q.set('theme_asset_url', params.themeAssetUrl);
    if (params.greeting) q.set('titulo', params.greeting);
    const safeNome = String(params.nomeCompleto || params.primeiroNome || 'Cliente').trim();
    q.set('nome', safeNome || 'Cliente');
    const clientName = String(params.primeiroNome || params.nomeCompleto || '').trim();
    if (clientName) q.set('cliente_nome_literal', clientName.endsWith(',') ? clientName : `${clientName},`);
    if (params.mensagem) q.set('corpo', params.mensagem);
    q.set('footer_lead', '');
    if (params.assinatura.linha2) q.set('assinatura', params.assinatura.linha2);
    q.set('cargo_consultor', params.assinatura.linha3 || '');
    q.set('footer_lead_font_size', '40');
    q.set('consultant_font_size', String(params.assinatura.linha2_font_size || 40));
    q.set('consultant_role_font_size', String(params.assinatura.linha3_font_size || 24));
    q.set('footer_lead_italic', '0');
    q.set('consultant_italic', params.assinatura.linha2_italic ? '1' : '0');
    q.set('consultant_role_italic', params.assinatura.linha3_italic ? '1' : '0');
    q.set('signature_font_size', String(params.assinatura.linha2_font_size || 40));
    if (params.textColor) q.set('text_color', params.textColor);
    return `/api/v1/cards/render.svg?${q.toString()}`;
  }

  const CARD_TEXT_COLOR_PRESETS: Array<{ label: string; value: string }> = [
    { label: 'Padrão', value: '' },
    { label: 'Azul', value: '#1B4F9A' },
    { label: 'Grafite', value: '#0F172A' },
    { label: 'Preto suave', value: '#111827' },
    { label: 'Verde', value: '#166534' },
    { label: 'Rosa', value: '#BE185D' },
    { label: 'Vinho', value: '#7F1D1D' },
    { label: 'Roxo', value: '#581C87' },
    { label: 'Marrom', value: '#7C2D12' }
  ];

  // ── State ────────────────────────────────────────────────────────────────────

  let loading = true;
  let categories: Category[] = [];
  let themes: Theme[] = [];
  let messages: MessageTemplate[] = [];
  let savedSignature: AssinaturaForm | null = null;
  let userRole = '';
  let isAdmin = false;

  // Wizard step: 0=tema, 1=mensagem, 2=preview/envio
  let wizardStep = 0;

  let selectedTheme: Theme | null = null;
  let temaFilter = '';
  let selectedMessageTemplateId = '';

  // Form fields
  let greeting = '';
  let clienteNome = '';
  let clienteNomeCustom = '';
  let mensagem = '';
  let assinatura: AssinaturaForm = {
    linha1: '',
    linha1_font_size: 40,
    linha1_italic: false,
    linha2: '',
    linha2_font_size: 40,
    linha2_italic: false,
    linha3: '',
    linha3_font_size: 24,
    linha3_italic: false,
  };
  let textColor = '';
  let previewUrl: string | null = null;
  let previewLoading = false;
  let textEditorOpen = false;
  let editGreeting = '';
  let editMensagem = '';

  // Client search
  let clienteBusca = '';
  let clienteResults: Cliente[] = [];
  let searchingClientes = false;
  let showClienteDropdown = false;

  // Preview modal
  let previewModalOpen = false;

  // Signature save
  let savingSig = false;

  // Optional customization accordion
  let activeCustomizationSection: 'cliente' | 'mensagem' | 'assinatura' | null = null;

  // Debounce for preview
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Derived ──────────────────────────────────────────────────────────────────

  $: primeiroNome = (clienteNomeCustom.trim() || getPrimeiroNome(clienteNome));
  $: maxPalavras = selectedTheme?.mensagem_max_palavras ?? 50;
  $: maxLinhas = selectedTheme?.mensagem_max_linhas ?? 6;
  $: palavrasExcedido = countWords(mensagem) > maxPalavras;
  $: linhasExcedido = countLines(mensagem) > maxLinhas;

  $: activeThemes = themes.filter((theme) => theme?.ativo !== false);
  $: activeMessages = messages.filter((message) => message?.ativo !== false);

  function resolveTemaBucket(normalizedThemeText: string): string | null {
    if (!normalizedThemeText) return null;
    if (normalizedThemeText.includes('anivers') || normalizedThemeText.includes('birthday')) return 'aniversario';
    if (normalizedThemeText.includes('natal') || normalizedThemeText.includes('christmas')) return 'natal';
    if (normalizedThemeText.includes('pascoa') || normalizedThemeText.includes('easter')) return 'pascoa';
    if (
      normalizedThemeText.includes('ano novo') ||
      normalizedThemeText.includes('ano_novo') ||
      normalizedThemeText.includes('reveillon') ||
      normalizedThemeText.includes('new year')
    ) {
      return 'ano_novo';
    }
    if (normalizedThemeText.includes('dia das maes') || normalizedThemeText.includes('mother')) return 'dia_das_maes';
    if (normalizedThemeText.includes('dia dos pais') || normalizedThemeText.includes('father')) return 'dia_dos_pais';
    if (normalizedThemeText.includes('dia da mulher') || normalizedThemeText.includes('women')) return 'dia_da_mulher';
    if (normalizedThemeText.includes('viajant') || normalizedThemeText.includes('travel')) return 'dia_do_viajante';
    if (normalizedThemeText.includes('geral') || normalizedThemeText.includes('general')) return 'geral';
    return null;
  }

  function matchesTemaFilter(tema: string, normalizedThemeText: string, categoryId?: string | null): boolean {
    if (tema === 'all') return true;
    if (tema.startsWith('cat:')) {
      const selectedCategoryId = tema.slice(4);
      return !!selectedCategoryId && selectedCategoryId === String(categoryId || '');
    }
    return resolveTemaBucket(normalizedThemeText) === tema;
  }

  const TEMA_FILTER_BASE_OPTIONS: Array<{ label: string; value: string }> = [
    { label: 'Todos', value: 'all' },
    { label: 'Aniversário', value: 'aniversario' },
    { label: 'Natal', value: 'natal' },
    { label: 'Páscoa', value: 'pascoa' },
    { label: 'Ano Novo', value: 'ano_novo' },
    { label: 'Dia das Mães', value: 'dia_das_maes' },
    { label: 'Dia dos Pais', value: 'dia_dos_pais' },
    { label: 'Dia da Mulher', value: 'dia_da_mulher' },
    { label: 'Dia do Viajante', value: 'dia_do_viajante' },
    { label: 'Geral', value: 'geral' }
  ];

  $: categoryNameById = (() => {
    const namesById = new Map<string, string>();
    for (const cat of categories) {
      namesById.set(String(cat.id || '').trim(), String(cat.nome || '').trim());
    }
    return namesById;
  })();

  $: temaFilterOptions = (() => {
    const options = [...TEMA_FILTER_BASE_OPTIONS];
    const knownBuckets = new Set(options.map((option) => option.value));
    for (const cat of categories) {
      const id = String(cat.id || '').trim();
      const nome = String(cat.nome || '').trim();
      if (!id || !nome) continue;
      const normalized = normalizeText(nome);
      const fixedBucket = resolveTemaBucket(normalized);
      if (fixedBucket && knownBuckets.has(fixedBucket)) continue;
      options.push({ label: nome, value: `cat:${id}` });
    }
    return options;
  })();

  $: temaSelectionOptions = [
    { label: 'Selecione o tema', value: '' },
    ...temaFilterOptions
      .filter((option) => option.value !== 'all')
      .map((option) => ({ label: option.label, value: option.value }))
  ];

  $: filteredThemes = (() => {
    if (!temaFilter) return [] as Theme[];
    return activeThemes.filter((theme) => {
      const categoryName = categoryNameById.get(String(theme.categoria_id || '').trim()) || String(theme.categoria || '').trim();
      const normalizedThemeText = normalizeText(`${theme.nome || ''} ${categoryName || ''}`);
      return matchesTemaFilter(temaFilter, normalizedThemeText, theme.categoria_id);
    });
  })();

  $: templateSelectionOptions = (() => {
    const placeholder = !temaFilter
      ? 'Selecione um tema primeiro'
      : filteredThemes.length === 0
        ? 'Nenhum template disponível'
        : 'Selecione um template';

    return [
      { label: placeholder, value: '' },
      ...filteredThemes.map((theme) => {
        const categoryName = categoryNameById.get(String(theme.categoria_id || '').trim()) || String(theme.categoria || '').trim();
        return {
          value: theme.id,
          label: `${theme.nome}${categoryName ? ` • ${categoryName}` : ''}`
        };
      })
    ];
  })();

  $: filteredMessages = (() => {
    const normalizeCategory = (value?: string | null) => normalizeText(String(value || ''));
    const isGeneralCategory = (value?: string | null) => {
      const normalized = normalizeCategory(value);
      return !normalized || normalized === 'geral' || normalized === 'general';
    };

    const selectedCategoryRaw = selectedTheme
      ? categoryNameById.get(String(selectedTheme.categoria_id || '').trim()) || String(selectedTheme.categoria || '')
      : '';
    const selectedCategory = normalizeCategory(selectedCategoryRaw);

    return [...activeMessages]
      .map((message) => {
        const messageCategory = normalizeCategory(message.categoria);
        let categoryRank = 1;

        if (!selectedCategory) {
          categoryRank = isGeneralCategory(message.categoria) ? 3 : 2;
        } else if (messageCategory === selectedCategory) {
          categoryRank = 5;
        } else if (
          messageCategory &&
          (messageCategory.includes(selectedCategory) || selectedCategory.includes(messageCategory))
        ) {
          categoryRank = 4;
        } else if (isGeneralCategory(message.categoria)) {
          categoryRank = 3;
        } else {
          categoryRank = 2;
        }

        return { message, categoryRank };
      })
      .sort((a, b) => {
        if (a.categoryRank !== b.categoryRank) return b.categoryRank - a.categoryRank;
        return PT_BR_COLLATOR.compare(String(a.message.nome || ''), String(b.message.nome || ''));
      })
      .map((entry) => entry.message);
  })();

  $: previewDisplayUrl = previewUrl || selectedTheme?.asset_url || null;
  $: showComposer = Boolean(selectedTheme);
  $: if (wizardStep !== 0) wizardStep = 0;

  // ── Load ─────────────────────────────────────────────────────────────────────

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const data = await apiGet<LibraryData>('/api/v1/crm/library', undefined, request.signal);
      if (!loadGuard.isCurrent(request.seq)) return;
      categories = data.categories || [];
      themes = data.themes || [];
      messages = data.messages || [];
      userRole = data.userRole || '';
      isAdmin = Boolean(data.isAdmin);
      savedSignature = data.signature;

      // Pré-preenche assinatura com dados salvos
      if (savedSignature) {
        assinatura = {
          linha1: '',
          linha1_font_size: 40,
          linha1_italic: false,
          linha2: savedSignature.linha2 || (data.settings?.consultor_nome || ''),
          linha2_font_size: savedSignature.linha2_font_size || 40,
          linha2_italic: Boolean(savedSignature.linha2_italic),
          linha3: savedSignature.linha3 || '',
          linha3_font_size: savedSignature.linha3_font_size || 24,
          linha3_italic: Boolean(savedSignature.linha3_italic),
        };
      } else if (data.settings?.consultor_nome) {
        assinatura = { ...assinatura, linha2: data.settings.consultor_nome };
      }
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar CRM.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  // ── Client search ─────────────────────────────────────────────────────────────

  let clienteSearchTimer: ReturnType<typeof setTimeout> | null = null;

  async function searchClientes(busca: string) {
    if (!busca.trim()) {
      clienteSearchGuard.abort();
      clienteResults = [];
      showClienteDropdown = false;
      return;
    }
    const request = clienteSearchGuard.next();
    searchingClientes = true;
    try {
      const data = await apiGet<ClienteSearchResponse | Cliente[]>(
        '/api/v1/clientes/search',
        {
          q: busca,
          limit: 10
        },
        request.signal
      );
      if (!clienteSearchGuard.isCurrent(request.seq)) return;
      const results = Array.isArray(data) ? data : data.clientes || data.items || [];
      clienteResults = results.slice(0, 10);
      showClienteDropdown = clienteResults.length > 0;
    } catch (err) {
      if (isCanceledApiError(err)) return;
      clienteResults = [];
    } finally {
      if (clienteSearchGuard.isCurrent(request.seq)) searchingClientes = false;
    }
  }

  function onClienteBuscaInput() {
    if (clienteSearchTimer) clearTimeout(clienteSearchTimer);
    clienteSearchTimer = setTimeout(() => searchClientes(clienteBusca), 300);
  }

  function selectCliente(c: Cliente) {
    clienteNome = c.nome;
    clienteNomeCustom = getPrimeiroNome(c.nome);
    clienteBusca = c.nome;
    showClienteDropdown = false;
    clienteResults = [];
  }

  // ── Theme selection ──────────────────────────────────────────────────────────

  function selectTheme(theme: Theme) {
    selectedTheme = theme;
    greeting = resolveGreetingByTheme(theme);
    selectedMessageTemplateId = '';
    mensagem = '';
    previewUrl = null;
    activeCustomizationSection = null;
  }

  function clearThemeSelection() {
    selectedTheme = null;
    selectedMessageTemplateId = '';
    greeting = '';
    mensagem = '';
    previewUrl = null;
    activeCustomizationSection = null;
  }

  function handleTemaSelectChange(event: Event) {
    const value = String((event.target as HTMLSelectElement | null)?.value || '').trim();
    temaFilter = value;
    if (!value) clearThemeSelection();
  }

  function handleThemeSelectChange(event: Event) {
    const value = String((event.target as HTMLSelectElement | null)?.value || '').trim();
    if (!value) {
      clearThemeSelection();
      return;
    }
    const theme = filteredThemes.find((item) => item.id === value);
    if (theme) selectTheme(theme);
  }

  // ── Template selection ───────────────────────────────────────────────────────

  function selectMessageTemplate(template: MessageTemplate) {
    selectedMessageTemplateId = template.id;
    const selectedTitle = String(template.titulo || template.nome || '').trim();
    if (selectedTitle) greeting = selectedTitle;
    mensagem = stripLegacyGreeting(template.corpo);
  }

  // ── Preview ──────────────────────────────────────────────────────────────────

  function schedulePreview() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!selectedTheme) {
        previewUrl = null;
        return;
      }
      previewUrl = buildPreviewUrl({
        themeId: selectedTheme.id,
        themeAssetUrl: selectedTheme.asset_url,
        greeting,
        primeiroNome,
        nomeCompleto: clienteNome || primeiroNome,
        mensagem,
        assinatura,
        textColor,
      });
    }, 600);
  }

  $: if (selectedTheme || greeting || clienteNome || clienteNomeCustom || mensagem || assinatura || textColor) {
    schedulePreview();
  }

  $: if (temaFilter.startsWith('cat:')) {
    const exists = categories.some((cat) => `cat:${String(cat.id || '').trim()}` === temaFilter);
    if (!exists) temaFilter = '';
  }

  $: if (filteredThemes.length === 0) {
    if (selectedTheme) clearThemeSelection();
  } else if (selectedTheme && !filteredThemes.some((theme) => theme.id === (selectedTheme?.id || ''))) {
    clearThemeSelection();
  }

  $: if (!selectedTheme && wizardStep > 0) {
    wizardStep = 0;
  }

  $: if (selectedTheme) {
    if (!filteredMessages.length) {
      if (selectedMessageTemplateId) selectedMessageTemplateId = '';
    } else if (!selectedMessageTemplateId || !filteredMessages.some((message) => message.id === selectedMessageTemplateId)) {
      const greetingByTheme = resolveGreetingByTheme(selectedTheme);
      const normalizedGreetingByTheme = normalizeText(greetingByTheme);
      const matched =
        filteredMessages.find((message) => {
          const messageTitle = normalizeText(String(message.titulo || message.nome || ''));
          if (!messageTitle || !normalizedGreetingByTheme) return false;
          return messageTitle.includes(normalizedGreetingByTheme) || normalizedGreetingByTheme.includes(messageTitle);
        }) || filteredMessages[0];

      if (matched) {
        selectedMessageTemplateId = matched.id;
        const matchedTitle = String(matched.titulo || matched.nome || '').trim();
        greeting = matchedTitle || greetingByTheme;
        mensagem = stripLegacyGreeting(matched.corpo);
      }
    }
  }

  // ── Save signature ────────────────────────────────────────────────────────────

  async function saveSignature() {
    savingSig = true;
    try {
      await apiPost('/api/v1/crm/signature', { assinatura });
      toast.success('Assinatura salva com sucesso.');
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar assinatura.'));
    } finally {
      savingSig = false;
    }
  }

  // ── Wizard navigation ────────────────────────────────────────────────────────

  function goToWizardStep(nextStep: number) {
    const bounded = Math.max(0, Math.min(2, nextStep));
    if (bounded > 0 && !selectedTheme) {
      wizardStep = 0;
      toast.warning('Selecione um template para continuar.');
      return;
    }
    wizardStep = bounded;
  }

  function nextStep() {
    goToWizardStep(wizardStep + 1);
  }

  function prevStep() {
    goToWizardStep(wizardStep - 1);
  }

  const wizardItems = [
    { label: 'Template', icon: ImageIcon },
    { label: 'Mensagem', icon: MessageSquare },
    { label: 'Arte final', icon: Send }
  ];

  $: wizardSubtitle =
    wizardStep === 0
      ? 'Etapa 1 de 3: escolha o tema, informe o cliente e confirme a prévia.'
      : wizardStep === 1
        ? 'Etapa 2 de 3: personalize só se precisar; senão, siga para a versão final.'
        : 'Etapa 3 de 3: revise a arte final e envie para o cliente.';

  function reapplySelectedTemplate() {
    if (!selectedMessageTemplateId) return;
    const tpl = filteredMessages.find((message) => message.id === selectedMessageTemplateId);
    if (tpl) selectMessageTemplate(tpl);
  }

  function openTextEditor() {
    editGreeting = greeting;
    editMensagem = mensagem;
    textEditorOpen = true;
  }

  function applyTextEditor() {
    greeting = String(editGreeting || '').trim();
    mensagem = String(editMensagem || '').trim();
    textEditorOpen = false;
  }

  function openPreviewSvg() {
    if (!previewUrl) return;
    safeOpenNewTab(previewUrl, ['http:', 'https:']);
  }

  async function openPreviewPng() {
    if (!previewUrl) return;
    previewLoading = true;
    try {
      const { blob, generatedLocally } = await fetchPreviewPngBlob(previewUrl);
      downloadBlob(blob, `crm-${Date.now()}.png`);
      if (generatedLocally) toast.info('PNG gerado localmente no navegador.');
    } catch (err) {
      const message = toUserMessage(err, 'Falha ao baixar PNG.');
      toast.error(message);
    } finally {
      previewLoading = false;
    }
  }

  function sharePreviewOnWhatsApp() {
    if (!previewUrl) return;
    const pngUrl = previewUrl.replace('/render.svg', '/render.png');
    const cliente = primeiroNome || clienteNome || 'cliente';
    const text = `Segue o seu cartao, ${cliente}: ${pngUrl}`;
    safeOpenNewTab(`https://wa.me/?text=${encodeURIComponent(text)}`, ['https:']);
  }

  function clearPreviewSelection() {
    temaFilter = '';
    clearThemeSelection();
    textColor = '';
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  onMount(load);
  onDestroy(() => {
    if (clienteSearchTimer) clearTimeout(clienteSearchTimer);
  });

</script>

<svelte:head>
  <title>CRM — Cartões de Relacionamento | VTUR</title>
</svelte:head>

<PageHeader
  title="CRM — Cartões de Relacionamento"
  subtitle="Crie e personalize mensagens e cartões para seus clientes."
  breadcrumbs={[
    { label: 'Parâmetros', href: '/parametros' },
    { label: 'CRM' }
  ]}
  actions={[
    { label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw }
  ]}
/>

{#if loading}
  <LoadingState />
{:else}
  <!-- STEP 0: Selecionar tema de arte -->
  {#if wizardStep === 0}
    <Card color="crm">
      <div class="mb-4">
        <h3 class="font-semibold text-slate-800">Escolha a arte</h3>
        <p class="mt-1 text-sm text-slate-500">Selecione o tema, o template e o nome do cliente para montar a prévia.</p>
      </div>

      <div class="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr_1fr_auto]">
        <FieldSelect
          id="crm-tema-etapa1"
          label="Tema"
          value={temaFilter}
          options={temaSelectionOptions}
          placeholder={null}
          class_name="w-full"
          on:change={handleTemaSelectChange}
        />

        <FieldSelect
          id="crm-template-etapa1"
          label="Template"
          value={selectedTheme?.id || ''}
          options={templateSelectionOptions}
          placeholder={null}
          disabled={!temaFilter || filteredThemes.length === 0}
          class_name="w-full"
          on:change={handleThemeSelectChange}
        />

        <FieldInput
          id="crm-cliente-nome-etapa1"
          label="Nome do cliente"
          bind:value={clienteNomeCustom}
          placeholder={getPrimeiroNome(clienteNome) || 'Digite o nome do cliente'}
          class_name="w-full"
        />

        <div class="flex items-end">
          <Button variant="outline" color="crm" on:click={() => { temaFilter = ''; clearThemeSelection(); }}>Limpar</Button>
        </div>
      </div>

      <div class="mb-2 flex justify-center">
        <div class="w-full max-w-[420px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {#if previewDisplayUrl}
            <img src={previewDisplayUrl} alt={selectedTheme ? `Prévia do template ${selectedTheme.nome}` : 'Prévia do template'} class="w-full object-cover" />
          {:else}
            <div class="flex h-[420px] items-center justify-center text-center text-sm text-slate-500">
              {!temaFilter
                ? 'Selecione um tema para carregar a prévia.'
                : filteredThemes.length === 0
                  ? 'Nenhum template encontrado para o tema selecionado.'
                  : !selectedTheme
                    ? 'Selecione um template para carregar a prévia.'
                    : 'Carregando a prévia do template selecionado...'}
            </div>
          {/if}
        </div>
      </div>

      <div class="mt-3 flex justify-center">
        <div class="inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
          <Button
            variant="outline"
            color="crm"
            size="xs"
            title="Editar texto"
            disabled={!selectedTheme}
            on:click={openTextEditor}
          >
            <Pencil size={15} />
          </Button>

          <Button variant="secondary" color="crm" size="xs" title="Abrir SVG" disabled={!previewUrl} on:click={openPreviewSvg}>
            <ExternalLink size={15} />
          </Button>

          <Button variant="secondary" color="crm" size="xs" title="Baixar PNG" disabled={!previewUrl || previewLoading} on:click={openPreviewPng}>
            <Download size={15} />
          </Button>

          <Button
            variant="outline"
            color="crm"
            size="xs"
            title="Compartilhar no WhatsApp"
            disabled={!previewUrl}
            on:click={sharePreviewOnWhatsApp}
          >
            <MessageCircle size={15} />
          </Button>

          <Button variant="outline" color="crm" size="xs" title="Limpar selecao" on:click={clearPreviewSelection}>
            <X size={15} />
          </Button>
        </div>
      </div>

      <div class="mt-3 flex justify-center">
        <div class="inline-flex flex-wrap items-center gap-2">
          {#each CARD_TEXT_COLOR_PRESETS.filter((color) => color.value) as color}
            <Button
              type="button"
              variant="unstyled"
              class_name={`h-9 w-9 rounded-lg border-2 transition ${textColor === color.value ? 'scale-105 border-slate-900 shadow-md' : 'border-white shadow-xs'}`}
              style={`background-color: ${color.value}`}
              title={`Aplicar ${color.label}`}
              ariaLabel={`Aplicar ${color.label}`}
              ariaPressed={textColor === color.value}
              on:click={() => (textColor = color.value)}
            />
          {/each}
        </div>
      </div>

    </Card>

    <Dialog
      bind:open={textEditorOpen}
      title="Editar texto do cartão"
      color="operacao"
      size="lg"
      showCancel={true}
      cancelText="Cancelar"
      showConfirm={true}
      confirmText="Aplicar"
      onConfirm={applyTextEditor}
      onCancel={() => (textEditorOpen = false)}
    >
      <div class="space-y-4">
        <FieldInput
          id="crm-edit-saudacao"
          label="Saudação"
          bind:value={editGreeting}
          placeholder="Ex: Feliz Aniversário!"
          class_name="w-full"
        />

        <div>
          <label class="mb-1 flex items-center justify-between text-sm font-medium text-slate-700" for="crm-edit-mensagem">
            Mensagem
            <span class="text-xs font-normal {(countWords(editMensagem) > maxPalavras || countLines(editMensagem) > maxLinhas) ? 'text-red-500' : 'text-slate-400'}">
              {countWords(editMensagem)}/{maxPalavras} palavras · {countLines(editMensagem)}/{maxLinhas} linhas
            </span>
          </label>
          <FieldTextarea
            id="crm-edit-mensagem"
            bind:value={editMensagem}
            rows={6}
            resize="none"
            placeholder="Escreva sua mensagem..."
          />
          {#if countWords(editMensagem) > maxPalavras}
            <p class="mt-1 text-xs text-red-500">Mensagem excede o limite de {maxPalavras} palavras.</p>
          {/if}
          {#if countLines(editMensagem) > maxLinhas}
            <p class="mt-1 text-xs text-red-500">Mensagem excede o limite de {maxLinhas} linhas.</p>
          {/if}
        </div>

        <div class="flex justify-end">
          <Button variant="outline" color="crm" size="sm" disabled={!selectedMessageTemplateId} on:click={reapplySelectedTemplate}>
            Restaurar texto do template
          </Button>
        </div>
      </div>
    </Dialog>

  <!-- STEP 1: Personalização opcional -->
  {:else if wizardStep === 1}
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <!-- Coluna esquerda: formulário -->
      <Card color="crm">
        <div class="mb-4">
          <h3 class="font-semibold text-slate-800">Personalização opcional</h3>
          <p class="mt-1 text-sm text-slate-500">Abra uma opção apenas se quiser ajustar o cartão. Você pode seguir direto para a prévia.</p>
        </div>

        <!-- Arte selecionada (mini preview) -->
        {#if selectedTheme}
          <div class="mb-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
            {#if selectedTheme.asset_url}
              <img src={selectedTheme.asset_url} alt={selectedTheme.nome} class="h-12 w-12 rounded-lg object-cover" />
            {:else}
              <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-200">
                <ImageIcon size={18} class="text-slate-400" />
              </div>
            {/if}
            <div class="flex-1">
              <p class="text-sm font-medium text-slate-700">{selectedTheme.nome}</p>
            </div>
            <Button variant="ghost" size="xs" color="crm" on:click={prevStep}>
              Trocar
            </Button>
          </div>
        {/if}

        <div class="space-y-3">
          <div class="rounded-xl border border-slate-200 bg-white">
            <Button
              variant="unstyled"
              class_name="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left"
              on:click={() => (activeCustomizationSection = activeCustomizationSection === 'cliente' ? null : 'cliente')}
            >
              <span>
                <span class="block text-sm font-medium text-slate-800">Cliente e saudação</span>
                <span class="mt-0.5 block text-xs text-slate-500">Nome no cartão e saudação opcional</span>
              </span>
              <ChevronRight size={16} class={`transition-transform ${activeCustomizationSection === 'cliente' ? 'rotate-90' : ''}`.trim()} />
            </Button>

            {#if activeCustomizationSection === 'cliente'}
              <div class="border-t border-slate-100 px-4 py-4">
                <div class="relative mb-3">
                  <FieldInput
                    label="Cliente"
                    id="crm-cliente"
                    bind:value={clienteBusca}
                    on:input={onClienteBuscaInput}
                    on:focus={() => { if (clienteResults.length) showClienteDropdown = true; }}
                    on:blur={() => setTimeout(() => { showClienteDropdown = false; }, 200)}
                    placeholder="Buscar cliente..."
                    icon={Search}
                  />
                  {#if showClienteDropdown && clienteResults.length}
                    <div class="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                      {#each clienteResults as c}
                        <Button
                          type="button"
                          variant="unstyled"
                          size="sm"
                          class_name="block w-full rounded-none px-3 py-2 text-left text-sm hover:bg-slate-50"
                          on:click={() => selectCliente(c)}
                        >
                          {c.nome}
                        </Button>
                      {/each}
                    </div>
                  {/if}
                </div>

                {#if clienteNome}
                  <FieldInput
                    label="Nome no cartão"
                    id="crm-primeiro-nome"
                    bind:value={clienteNomeCustom}
                    placeholder={getPrimeiroNome(clienteNome)}
                    helper="Exibido no cartão. Padrão: primeiro nome."
                    class_name="mb-3"
                  />
                {/if}

                <FieldInput
                  label="Saudação"
                  id="crm-saudacao"
                  bind:value={greeting}
                  placeholder="Ex: Feliz Aniversário!"
                />
              </div>
            {/if}
          </div>

          <div class="rounded-xl border border-slate-200 bg-white">
            <Button
              variant="unstyled"
              class_name="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left"
              on:click={() => (activeCustomizationSection = activeCustomizationSection === 'mensagem' ? null : 'mensagem')}
            >
              <span>
                <span class="block text-sm font-medium text-slate-800">Mensagem</span>
                <span class="mt-0.5 block text-xs text-slate-500">Escolha um texto rápido ou edite manualmente</span>
              </span>
              <ChevronRight size={16} class={`transition-transform ${activeCustomizationSection === 'mensagem' ? 'rotate-90' : ''}`.trim()} />
            </Button>

            {#if activeCustomizationSection === 'mensagem'}
              <div class="border-t border-slate-100 px-4 py-4">
                {#if filteredMessages.length > 0}
                  <div class="mb-3">
                    <p class="mb-1.5 text-sm font-medium text-slate-700">Texto rápido</p>
                    <div class="flex flex-wrap gap-1.5">
                      {#each filteredMessages.slice(0, 8) as tpl}
                        <Button
                          variant={selectedMessageTemplateId === tpl.id ? 'primary' : 'outline'}
                          size="xs"
                          color="crm"
                          class_name="rounded-full"
                          on:click={() => selectMessageTemplate(tpl)}
                        >
                          {tpl.nome}
                        </Button>
                      {/each}
                    </div>
                  </div>
                {/if}

                <div>
                  <label class="mb-1 flex items-center justify-between text-sm font-medium text-slate-700" for="crm-mensagem">
                    Mensagem
                    <span class="text-xs font-normal {palavrasExcedido || linhasExcedido ? 'text-red-500' : 'text-slate-400'}">
                      {countWords(mensagem)}/{maxPalavras} palavras · {countLines(mensagem)}/{maxLinhas} linhas
                    </span>
                  </label>
                  <FieldTextarea
                    id="crm-mensagem"
                    bind:value={mensagem}
                    rows={5}
                    resize="none"
                    placeholder={'Escreva sua mensagem... Use {{primeiro_nome}}, {{nome_cliente}}, {{consultor}}'}
                  />
                  {#if palavrasExcedido}
                    <p class="mt-1 text-xs text-red-500">⚠️ Mensagem excede o limite de {maxPalavras} palavras.</p>
                  {/if}
                  {#if linhasExcedido}
                    <p class="mt-1 text-xs text-red-500">⚠️ Mensagem excede o limite de {maxLinhas} linhas.</p>
                  {/if}
                </div>
              </div>
            {/if}
          </div>

          <div class="rounded-xl border border-slate-200 bg-white">
            <Button
              variant="unstyled"
              class_name="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left"
              on:click={() => (activeCustomizationSection = activeCustomizationSection === 'assinatura' ? null : 'assinatura')}
            >
              <span>
                <span class="block text-sm font-medium text-slate-800">Assinatura</span>
                <span class="mt-0.5 block text-xs text-slate-500">Ajuste nome, cargo e estilo da assinatura</span>
              </span>
              <ChevronRight size={16} class={`transition-transform ${activeCustomizationSection === 'assinatura' ? 'rotate-90' : ''}`.trim()} />
            </Button>

            {#if activeCustomizationSection === 'assinatura'}
              <div class="border-t border-slate-100 px-4 py-4">
                <div class="mb-1.5 flex items-center justify-between">
                  <p class="text-sm font-medium text-slate-700">Assinatura</p>
                  <Button
                    variant="ghost"
                    size="xs"
                    color="crm"
                    disabled={savingSig}
                    on:click={saveSignature}
                  >
                    {savingSig ? 'Salvando...' : 'Salvar padrão'}
                  </Button>
                </div>
                <div class="space-y-2">
                  {#each [
                    { key: 'linha2' as const, sizeKey: 'linha2_font_size' as const, italicKey: 'linha2_italic' as const, placeholder: 'Seu nome (obrigatório)' },
                    { key: 'linha3' as const, sizeKey: 'linha3_font_size' as const, italicKey: 'linha3_italic' as const, placeholder: 'Seu cargo (opcional)' },
                  ] as line, i}
                    <div class="flex items-center gap-2">
                      <span class="w-4 shrink-0 text-center text-xs text-slate-400">{i + 1}</span>
                      <FieldInput
                        value={assinatura[line.key]}
                        placeholder={line.placeholder}
                        class_name={`flex-1 ${assinatura[line.italicKey] ? 'italic' : ''}`.trim()}
                        on:input={(event) => (assinatura[line.key] = (event.target as HTMLInputElement).value)}
                      />
                      <FieldSelect
                        value={String(assinatura[line.sizeKey])}
                        options={[12,14,16,18,20,22,24,28,32,36,40,44,48,52,56,60,64].map((s) => ({ value: String(s), label: `${s}px` }))}
                        placeholder={null}
                        class_name="w-24"
                        on:change={(event) => (assinatura[line.sizeKey] = Number((event.target as HTMLSelectElement).value))}
                      />
                      <Button
                        variant={assinatura[line.italicKey] ? 'primary' : 'outline'}
                        size="xs"
                        color="crm"
                        title="Itálico"
                        on:click={() => (assinatura[line.italicKey] = !assinatura[line.italicKey])}
                      >
                        <em>I</em>
                      </Button>
                    </div>
                  {/each}
                </div>
                <p class="mt-1 text-xs text-slate-400">Máx. 2 linhas · 20 palavras no total</p>
              </div>
            {/if}
          </div>
        </div>

        <div class="flex justify-between">
          <Button variant="secondary" on:click={prevStep}>
            <ChevronLeft size={16} class="mr-1" />
            Voltar
          </Button>
          <Button variant="primary" color="crm" on:click={nextStep}>
            Ir para prévia
            <ChevronRight size={16} class="ml-1" />
          </Button>
        </div>
      </Card>

      <!-- Coluna direita: mini preview ao vivo -->
      <div class="hidden lg:block">
        <Card color="crm">
          <h3 class="mb-3 font-semibold text-slate-800">Prévia ao vivo</h3>
          {#if selectedTheme && previewUrl}
            <div class="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <img
                src={previewUrl}
                alt="Prévia do cartão"
                class="w-full"
                on:error={() => { previewUrl = selectedTheme?.asset_url || null; }}
              />
            </div>
          {:else if selectedTheme}
            <div class="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <img src={selectedTheme.asset_url} alt={selectedTheme.nome} class="w-full" />
            </div>
          {:else}
            <div class="flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-slate-400">
              Nenhuma arte selecionada
            </div>
          {/if}
        </Card>
      </div>
    </div>

  <!-- STEP 2: Prévia final e envio -->
  {:else}
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <!-- Preview card -->
      <Card color="crm">
        <h3 class="mb-3 font-semibold text-slate-800">Cartão final</h3>
        {#if selectedTheme && previewUrl}
          <div class="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <img
              src={previewUrl}
              alt="Prévia do cartão"
              class="w-full"
              on:error={() => { previewUrl = selectedTheme?.asset_url || null; }}
            />
          </div>
        {:else if selectedTheme}
          <div class="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <img src={selectedTheme.asset_url} alt={selectedTheme.nome} class="w-full" />
          </div>
        {:else}
          <div class="flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-slate-400">
            Nenhuma arte selecionada
          </div>
        {/if}

        <!-- Download link -->
        {#if selectedTheme && previewUrl}
          <div class="mt-3 flex gap-2">
            <a
              href={previewUrl.replace('/render.svg', '/render.png')}
              target="_blank"
              rel="noopener noreferrer"
              class="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Baixar PNG
            </a>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Baixar SVG
            </a>
          </div>
        {/if}
      </Card>

      <!-- Resumo e ações -->
      <Card color="crm">
        <h3 class="mb-4 font-semibold text-slate-800">Resumo</h3>

        <dl class="space-y-2 text-sm">
          <div class="flex gap-2">
            <dt class="w-24 shrink-0 text-slate-500">Arte:</dt>
            <dd class="font-medium text-slate-800">{selectedTheme?.nome ?? '—'}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-24 shrink-0 text-slate-500">Cliente:</dt>
            <dd class="font-medium text-slate-800">{clienteNome || '(nenhum)'}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-24 shrink-0 text-slate-500">Saudação:</dt>
            <dd class="font-medium text-slate-800">{greeting || '—'}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-24 shrink-0 text-slate-500">Mensagem:</dt>
            <dd class="whitespace-pre-line font-medium text-slate-800 text-xs">{mensagem || '—'}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-24 shrink-0 text-slate-500">Assinatura:</dt>
            <dd class="font-medium text-slate-800">{[assinatura.linha2, assinatura.linha3].filter(Boolean).join(' · ') || '—'}</dd>
          </div>
        </dl>

        {#if palavrasExcedido || linhasExcedido}
          <div class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            ⚠️ A mensagem excede os limites do tema. Edite antes de continuar.
          </div>
        {/if}

        <div class="mt-4 flex justify-between">
          <Button variant="primary" on:click={prevStep}>
            <ChevronLeft size={16} class="mr-1" />
            Editar
          </Button>
          <Button
            variant="secondary"
            color="crm"
            disabled={palavrasExcedido || linhasExcedido || !selectedTheme}
            on:click={() => {
              if (previewUrl) safeOpenNewTab(previewUrl, ['http:', 'https:']);
            }}
          >
            <Eye size={16} class="mr-2" />
            Abrir cartão
          </Button>
        </div>
      </Card>
    </div>
  {/if}
{/if}
