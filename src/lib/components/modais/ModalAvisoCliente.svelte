<script lang="ts">
  import { dev } from '$app/environment';
  import { X, MessageCircle, Mail, Send, Phone, Copy, Pencil, ExternalLink, Download } from '$lib/icons';
  import Button from '$lib/components/ui/Button.svelte';
  import { Dialog, FieldInput, FieldTextarea, FieldSelect, LoadingState } from '$lib/components/ui';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { toast } from '$lib/stores/ui';
  import { formatDateTime } from '$lib/utils/formatters';
  import { downloadBlob, fetchPreviewPngBlob } from '$lib/utils/browser-images';
  import { toUserMessage } from '$lib/utils/errors';
  import { parseISODateParts, todayISODateLocal } from '$lib/date';
  import { safeOpenNewTab } from '$lib/security/url';
  import { createLoadGuard } from '$lib/utils/loadGuard';

  type CanalAviso = 'whatsapp' | 'email';

  type AvisoSendResponse = {
    canal?: string | null;
    whatsapp_url?: string | null;
    [key: string]: unknown;
  };

  type AvisoEnviado = {
    canal: CanalAviso;
    mensagem: string;
    assunto: string;
    cliente_id: string;
    template_id: string | null;
    response: AvisoSendResponse;
  };

  type AvisoHistoricoItem = {
    canal: string;
    created_at: string;
    assunto?: string | null;
    mensagem?: string | null;
    status?: string | null;
  };

  type AvisoHistoricoResponse = {
    items?: AvisoHistoricoItem[];
    unavailable?: boolean;
  };

  type CrmCategory = {
    id?: string | null;
    nome?: string | null;
  };

  type CrmTheme = {
    id?: string | null;
    nome?: string | null;
    categoria_id?: string | null;
    categoria?: string | null;
    greeting_text?: string | null;
    asset_url?: string | null;
    ativo?: boolean | null;
  };

  type CrmMessage = {
    id?: string | null;
    nome?: string | null;
    titulo?: string | null;
    assunto?: string | null;
    corpo?: string | null;
    categoria?: string | null;
    theme_id?: string | null;
    ativo?: boolean | null;
  };

  type CrmSignature = {
    linha2?: string | null;
    linha3?: string | null;
  };

  type CrmSettings = {
    consultor_nome?: string | null;
  };

  type CrmLibraryResponse = {
    categories?: CrmCategory[];
    themes?: CrmTheme[];
    messages?: CrmMessage[];
    signature?: CrmSignature | null;
    settings?: CrmSettings | null;
  };

  type AvisoTemplate = {
    id: string;
    nome: string;
    tipo: string;
    assunto: string;
    conteudo: string;
    mensagem?: string | null;
    mensagem_id: string | null;
    theme_id: string;
    theme_asset_url: string;
  };

  export let open: boolean = false;
  export let clienteId: string = '';
  export let clienteNome: string = '';
  export let clienteTelefone: string = '';
  export let clienteEmail: string = '';
  export let clienteNascimento: string | null = null;
  export let initialTema: string = 'all';
  export let onClose: () => void = () => {};
  export let onEnviar: (dados: AvisoEnviado) => void = () => {};

  let canalAtivo: CanalAviso = 'whatsapp';
  let temaSelecionado = 'all';
  let templateSelecionado = '';
  let mensagemPersonalizada = '';
  let previewCardUrl = '';
  let previewTextColor = '';
  let enviando = false;
  let templates: AvisoTemplate[] = [];
  let crmThemesById: Record<string, CrmTheme> = {};
  let crmSignature: CrmSignature | null = null;
  let crmSettings: CrmSettings | null = null;
  let carregandoTemplates = false;
  let erroTemplates = '';
  let modalReady = false;
  let historico: AvisoHistoricoItem[] = [];
  let carregandoHistorico = false;
  let historicoIndisponivel = false;
  let lastTemaSelecionado = 'all';
  let lastTemplateSelecionado = '';
  const templatesGuard = createLoadGuard();
  const historicoGuard = createLoadGuard();

  const TEMA_LABELS: Record<string, string> = {
    all: 'Todos',
    aniversario: 'Aniversário',
    natal: 'Natal',
    pascoa: 'Páscoa',
    ano_novo: 'Ano Novo',
    dia_das_maes: 'Dia das Mães',
    dia_dos_pais: 'Dia dos Pais',
    dia_da_mulher: 'Dia da Mulher',
    dia_do_viajante: 'Dia do Viajante',
    ultimas_compras: 'Últimas Compras',
    geral: 'Geral'
  };

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

  const DIACRITICS_RE = /[\u0300-\u036f]/g;
  const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

  function normalizeText(value?: string | null) {
    return String(value || '')
      .normalize('NFD')
      .replace(DIACRITICS_RE, '')
      .toLowerCase();
  }

  function getPrimeiroNome(nome: string) {
    return (nome || '').trim().split(/\s+/)[0] || '';
  }

  function buildPreviewUrl(params: {
    themeId: string;
    themeAssetUrl?: string | null;
    titulo: string;
    primeiroNome: string;
    nomeCompleto: string;
    mensagem: string;
    assinaturaNome: string;
    assinaturaCargo: string;
    textColor?: string;
  }): string {
    const q = new URLSearchParams();
    q.set('theme_id', params.themeId);
    if (params.themeAssetUrl) q.set('theme_asset_url', params.themeAssetUrl);
    if (params.titulo) q.set('titulo', params.titulo);

    const safeNome = String(params.nomeCompleto || params.primeiroNome || 'Cliente').trim();
    q.set('nome', safeNome || 'Cliente');

    const clientName = String(params.primeiroNome || params.nomeCompleto || '').trim();
    if (clientName) q.set('cliente_nome_literal', clientName.endsWith(',') ? clientName : `${clientName},`);

    if (params.mensagem) q.set('corpo', params.mensagem);
    q.set('footer_lead', '');
    if (params.assinaturaNome) q.set('assinatura', params.assinaturaNome);
    q.set('cargo_consultor', params.assinaturaCargo || '');
    if (params.textColor) q.set('text_color', params.textColor);

    return `/api/v1/cards/render.svg?${q.toString()}`;
  }

  function resolveTemaBucket(normalizedThemeText: string): string {
    if (!normalizedThemeText) return 'geral';
    if (normalizedThemeText.includes('anivers') || normalizedThemeText.includes('birthday')) return 'aniversario';
    if (normalizedThemeText.includes('natal') || normalizedThemeText.includes('christmas')) return 'natal';
    if (normalizedThemeText.includes('pascoa') || normalizedThemeText.includes('easter')) return 'pascoa';
    if (
      normalizedThemeText.includes('ano novo') ||
      normalizedThemeText.includes('ano_novo') ||
      normalizedThemeText.includes('new-year') ||
      normalizedThemeText.includes('reveillon') ||
      normalizedThemeText.includes('new year')
    ) {
      return 'ano_novo';
    }
    if (normalizedThemeText.includes('dia das maes') || normalizedThemeText.includes('mother')) return 'dia_das_maes';
    if (normalizedThemeText.includes('dia dos pais') || normalizedThemeText.includes('father')) return 'dia_dos_pais';
    if (normalizedThemeText.includes('dia da mulher') || normalizedThemeText.includes('women')) return 'dia_da_mulher';
    if (normalizedThemeText.includes('viajant') || normalizedThemeText.includes('travel')) return 'dia_do_viajante';
    if (
      normalizedThemeText.includes('ultima compra') ||
      normalizedThemeText.includes('ultimas compras') ||
      normalizedThemeText.includes('agradecimento compra') ||
      normalizedThemeText.includes('thank you purchase')
    ) return 'ultimas_compras';
    return 'geral';
  }

  function resolveGreetingByTheme(theme?: { nome?: string; categoria?: string | null; greeting_text?: string | null }): string {
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
      normalized.includes('new-year') ||
      normalized.includes('anonovo') ||
      normalized.includes('new year')
    ) {
      return 'Feliz Ano Novo!';
    }
    if (normalized.includes('dia das maes') || normalized.includes('mother')) return 'Feliz Dia das Mães!';
    if (normalized.includes('dia dos pais') || normalized.includes('father')) return 'Feliz Dia dos Pais!';
    if (normalized.includes('dia da mulher') || normalized.includes('women')) return 'Feliz Dia da Mulher!';
    if (normalized.includes('viajant') || normalized.includes('travel')) return 'Boas viagens e muitas conquistas!';
    if (normalized.includes('ultima compra') || normalized.includes('ultimas compras') || normalized.includes('agradecimento compra')) return 'Obrigado pela sua compra!';
    return '';
  }

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

  $: isAniversariante = clienteNascimento ? isBirthdayToday(clienteNascimento) : false;
  $: templateAtual = templates.find((t) => t.id === templateSelecionado);
  $: assuntoAtual = templateAtual?.assunto
    ? aplicarVariaveis(templateAtual.assunto)
    : `Aviso para ${clienteNome.split(' ')[0] || clienteNome}`;

  $: if (open && !modalReady) {
    modalReady = true;
    void prepararModal();
  }

  $: if (!open && modalReady) {
    modalReady = false;
    templatesGuard.abort();
    historicoGuard.abort();
    carregandoTemplates = false;
    carregandoHistorico = false;
  }

  async function prepararModal() {
    canalAtivo = clienteTelefone ? 'whatsapp' : 'email';
    temaSelecionado = initialTema || 'all';
    templateSelecionado = '';
    mensagemPersonalizada = '';
    await Promise.all([carregarTemplates(), carregarHistorico()]);

    if (isAniversariante && templates.some((t) => t.tipo === 'aniversario')) {
      temaSelecionado = 'aniversario';
    } else if (initialTema && templates.some((t) => t.tipo === initialTema)) {
      temaSelecionado = initialTema;
    }
  }

  async function carregarTemplates() {
    const request = templatesGuard.next();
    carregandoTemplates = true;
    erroTemplates = '';
    try {
      const libraryData = await apiGet<CrmLibraryResponse>(
        '/api/v1/crm/library',
        undefined,
        request.signal
      );
      if (!templatesGuard.isCurrent(request.seq)) return;
      const categorias = Array.isArray(libraryData?.categories) ? libraryData.categories : [];
      const temas = Array.isArray(libraryData?.themes) ? libraryData.themes : [];
      const mensagens = Array.isArray(libraryData?.messages) ? libraryData.messages : [];
      crmSignature = libraryData?.signature || null;
      crmSettings = libraryData?.settings || null;

      crmThemesById = Object.fromEntries(
        temas
          .filter((theme) => String(theme?.id || '').trim())
          .map((theme) => [String(theme.id), theme])
      );

      const categoryNameById = new Map<string, string>(
        categorias.map((cat) => [String(cat?.id || '').trim(), String(cat?.nome || '').trim()])
      );

      const activeMessages = mensagens.filter((item) => item?.ativo !== false);
      const activeThemes = temas.filter((item) => item?.ativo !== false);

      templates = activeThemes
        .map((theme) => {
          const categoryName: string =
            categoryNameById.get(String(theme?.categoria_id || '').trim()) || String(theme?.categoria || '').trim();
          const selectedCategory = normalizeText(categoryName);
          const normalizedThemeText = normalizeText(`${theme?.nome || ''} ${categoryName || ''}`);
          const themeBucket = resolveTemaBucket(normalizedThemeText);

          const bucketMatchedMessages = [...activeMessages]
            .filter((message) => {
              const normalizedMessageText = normalizeText(
                `${message?.nome || ''} ${message?.titulo || ''} ${message?.categoria || ''}`
              );
              return resolveTemaBucket(normalizedMessageText) === themeBucket;
            })
            .sort((a, b) => PT_BR_COLLATOR.compare(String(a?.nome || ''), String(b?.nome || '')));

          const ranked = [...activeMessages]
            .map((message) => {
              const messageCategory = normalizeText(String(message?.categoria || ''));
              const isGeneral = !messageCategory || messageCategory === 'geral' || messageCategory === 'general';
              let categoryRank = 1;

              if (!selectedCategory) {
                categoryRank = isGeneral ? 3 : 2;
              } else if (messageCategory === selectedCategory) {
                categoryRank = 5;
              } else if (
                messageCategory &&
                (messageCategory.includes(selectedCategory) || selectedCategory.includes(messageCategory))
              ) {
                categoryRank = 4;
              } else if (isGeneral) {
                categoryRank = 3;
              } else {
                categoryRank = 2;
              }

              return { message, categoryRank };
            })
            .sort((a, b) => {
              if (a.categoryRank !== b.categoryRank) return b.categoryRank - a.categoryRank;
              return PT_BR_COLLATOR.compare(String(a.message?.nome || ''), String(b.message?.nome || ''));
            });

          const selectedMessage = bucketMatchedMessages[0] || ranked[0]?.message || null;
          const greetingByTheme = resolveGreetingByTheme({
            nome: String(theme?.nome || ''),
            categoria: categoryName,
            greeting_text: String(theme?.greeting_text || '')
          });

          const assunto = String(selectedMessage?.titulo || '').trim() || greetingByTheme;
          const conteudo = stripLegacyGreeting(String(selectedMessage?.corpo || ''));

          return {
            id: String(theme?.id || ''),
            nome: String(theme?.nome || 'Template CRM'),
            tipo: resolveTemaBucket(normalizedThemeText),
            assunto,
            conteudo,
            mensagem_id: selectedMessage?.id ? String(selectedMessage.id) : null,
            theme_id: String(theme?.id || ''),
            theme_asset_url: String(theme?.asset_url || '')
          };
        })
        .filter((item) => item.id)
        .sort((a, b) => PT_BR_COLLATOR.compare(String(a.nome || ''), String(b.nome || '')));

      if (templates.length === 0 && activeMessages.length > 0) {
        templates = activeMessages
          .map((message) => {
            const nome = String(message?.nome || '').trim();
            const categoria = String(message?.categoria || '').trim();
            const normalizedMessageText = normalizeText(`${nome} ${categoria}`);
            const assunto = String(message?.titulo || message?.assunto || '').trim();
            const conteudo = stripLegacyGreeting(String(message?.corpo || ''));

            return {
              id: String(message?.id || ''),
              nome: nome || 'Template CRM',
              tipo: resolveTemaBucket(normalizedMessageText),
              assunto,
              conteudo,
              mensagem_id: message?.id ? String(message.id) : null,
              theme_id: String(message?.theme_id || ''),
              theme_asset_url: String(crmThemesById[String(message?.theme_id || '')]?.asset_url || '')
            };
          })
          .filter((item) => item.id)
          .sort((a, b) => PT_BR_COLLATOR.compare(String(a.nome || ''), String(b.nome || '')));
      }
    } catch (err: unknown) {
      if (isCanceledApiError(err)) return;
      if (dev) console.error('Erro ao carregar templates:', err);
      templates = [];
      erroTemplates = toUserMessage(err, 'Falha ao carregar templates');
    } finally {
      if (templatesGuard.isCurrent(request.seq)) carregandoTemplates = false;
    }
  }

  async function carregarHistorico() {
    if (!clienteId) return;
    const request = historicoGuard.next();
    carregandoHistorico = true;
    historicoIndisponivel = false;
    try {
      const data = await apiGet<AvisoHistoricoResponse>(
        '/api/v1/clientes/avisos/history',
        { cliente_id: clienteId },
        request.signal
      );
      if (!historicoGuard.isCurrent(request.seq)) return;
      historico = Array.isArray(data?.items) ? data.items : [];
      historicoIndisponivel = data?.unavailable === true;
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (dev) console.error('Erro ao carregar histórico:', err);
      historico = [];
    } finally {
      if (historicoGuard.isCurrent(request.seq)) carregandoHistorico = false;
    }
  }

  function aplicarVariaveis(texto: string) {
    return String(texto || '')
      .replace(/\{nome\}/gi, clienteNome.split(' ')[0] || clienteNome)
      .replace(/\{nome_completo\}/gi, clienteNome)
      .replace(/\{email\}/gi, clienteEmail || '')
      .replace(/\[PRIMEIRO_NOME\]/gi, clienteNome.split(' ')[0] || clienteNome)
      .replace(/\[NOME_CLIENTE\]/gi, clienteNome)
      .replace(/\{\{primeiro_nome\}\}/gi, clienteNome.split(' ')[0] || clienteNome)
      .replace(/\{\{nome_cliente\}\}/gi, clienteNome)
      .replace(/\{\{consultor\}\}/gi, '');
  }

  function aplicarTemplate() {
    const template = templates.find((t) => t.id === templateSelecionado);
    if (template) {
      mensagemPersonalizada = aplicarVariaveis(template.conteudo || template.mensagem || '');
    }
  }

  function focarEdicaoMensagem() {
    const el = document.getElementById('mensagem-aviso') as HTMLTextAreaElement | null;
    if (!el) return;
    el.focus();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function resetPreviewTextColor() {
    previewTextColor = '';
  }

  function openPreviewSvg() {
    if (!previewCardUrl) return;
    safeOpenNewTab(previewCardUrl, ['http:', 'https:']);
  }

  async function downloadPreviewPng() {
    if (!previewCardUrl) return;
    try {
      const { blob, generatedLocally } = await fetchPreviewPngBlob(previewCardUrl);
      downloadBlob(blob, `crm-cliente-${Date.now()}.png`);
      if (generatedLocally) toast.info('PNG gerado localmente no navegador.');
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Falha ao baixar PNG.'));
    }
  }

  function sharePreviewOnWhatsApp() {
    if (!previewCardUrl) return;
    const pngUrl = previewCardUrl.replace('/render.svg', '/render.png');
    const primeiroNome = getPrimeiroNome(clienteNome);
    const text = `Segue seu cartao, ${primeiroNome || 'cliente'}: ${pngUrl}`;
    safeOpenNewTab(`https://wa.me/?text=${encodeURIComponent(text)}`, ['https:']);
  }

  function clearPreviewActions() {
    previewTextColor = '';
    if (templateSelecionado) {
      aplicarTemplate();
    }
  }

  function isBirthdayToday(nascimento: string): boolean {
    const today = parseISODateParts(todayISODateLocal());
    const birth = parseISODateParts(nascimento);
    if (!today || !birth) return false;
    return today.month === birth.month && today.day === birth.day;
  }

  async function enviarMensagem() {
    if (!mensagemPersonalizada.trim()) {
      toast.error('Digite uma mensagem');
      return;
    }

    enviando = true;
    try {
      const payload = await apiPost<AvisoSendResponse>('/api/v1/clientes/avisos/send', {
          cliente_id: clienteId,
          canal: canalAtivo,
          template_id: templateSelecionado || null,
          assunto: assuntoAtual,
          mensagem: mensagemPersonalizada
      });

      if (payload?.canal === 'whatsapp' && payload?.whatsapp_url) {
        if (safeOpenNewTab(payload.whatsapp_url, ['https:'])) {
          toast.success('WhatsApp preparado com sucesso');
        } else {
          toast.error('Link do WhatsApp inválido.');
        }
      } else {
        toast.success('E-mail enviado com sucesso');
      }

      await carregarHistorico();

      onEnviar({
        canal: canalAtivo,
        mensagem: mensagemPersonalizada,
        assunto: assuntoAtual,
        cliente_id: clienteId,
        template_id: templateSelecionado || null,
        response: payload
      });
      onClose();
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Erro ao enviar mensagem'));
    } finally {
      enviando = false;
    }
  }

  function copiarMensagem() {
    navigator.clipboard.writeText(mensagemPersonalizada);
    toast.success('Mensagem copiada!');
  }

  function formatDate(value: string) {
    return formatDateTime(value);
  }

  function getStatusLabel(value: string | null | undefined) {
    const key = String(value || '').toLowerCase();
    if (key === 'enviado') return 'Enviado';
    if (key === 'preparado') return 'Preparado';
    return value || '-';
  }

  $: temaOptions = (() => {
    const base = [{ label: 'Todos', value: 'all' }];
    const seen = new Set<string>(['all']);

    for (const item of templates) {
      const key = String(item?.tipo || 'geral').trim() || 'geral';
      if (seen.has(key)) continue;
      seen.add(key);
      base.push({ label: TEMA_LABELS[key] || key.replaceAll('_', ' '), value: key });
    }

    return base;
  })();

  $: templatesFiltrados = temaSelecionado === 'all'
    ? templates
    : templates.filter((item) => String(item?.tipo || 'geral') === temaSelecionado);

  $: templateOptions = [
    { label: templatesFiltrados.length ? 'Selecione o template' : 'Nenhum template disponível', value: '' },
    ...templatesFiltrados.map((template) => ({
      label: String(template?.nome || 'Template CRM'),
      value: String(template?.id || '')
    }))
  ];

  $: if (templateSelecionado && !templatesFiltrados.some((item) => item.id === templateSelecionado)) {
    templateSelecionado = '';
    mensagemPersonalizada = '';
  }

  $: if (temaSelecionado !== lastTemaSelecionado) {
    lastTemaSelecionado = temaSelecionado;
    const filtrados = temaSelecionado === 'all'
      ? templates
      : templates.filter((item) => String(item?.tipo || 'geral') === temaSelecionado);

    const atual = filtrados.find((item) => String(item?.id || '') === templateSelecionado);
    const target = atual || filtrados[0];

    if (!target?.id) {
      templateSelecionado = '';
      mensagemPersonalizada = '';
    } else if (String(target.id) !== templateSelecionado) {
      templateSelecionado = String(target.id);
    }
  }

  $: if (templateSelecionado !== lastTemplateSelecionado) {
    lastTemplateSelecionado = templateSelecionado;
    if (templateSelecionado) {
      aplicarTemplate();
    }
  }

  $: {
    const template = templates.find((item) => item.id === templateSelecionado);
    const themeId = String(template?.theme_id || template?.id || '').trim();
    const themeAssetFromTemplate = String(template?.theme_asset_url || '').trim();
    const themeAssetFromMap = String(crmThemesById[themeId]?.asset_url || '').trim();
    const themeAssetUrl = themeAssetFromTemplate || themeAssetFromMap;
    const primeiroNome = getPrimeiroNome(clienteNome);
    const assinaturaNome = String(crmSignature?.linha2 || crmSettings?.consultor_nome || '').trim();
    const assinaturaCargo = String(crmSignature?.linha3 || '').trim();
    const titulo = assuntoAtual;

    if (!themeId || !mensagemPersonalizada.trim()) {
      previewCardUrl = '';
    } else {
      previewCardUrl = buildPreviewUrl({
        themeId,
        themeAssetUrl,
        titulo,
        primeiroNome,
        nomeCompleto: clienteNome,
        mensagem: mensagemPersonalizada,
        assinaturaNome,
        assinaturaCargo,
        textColor: previewTextColor
      });
    }
  }

</script>

<Dialog
  bind:open
  title={isAniversariante ? 'Aniversariante' : 'Enviar aviso'}
  description={clienteNome}
  color="clientes"
  size="xl"
  showCancel={false}
  onclose={onClose}
>
  <div class="vtur-modal-body-dense space-y-4">
        <div class="vtur-modal-section-compact bg-slate-50 rounded-lg p-3 flex items-center gap-4 flex-wrap">
          <div class="flex items-center gap-2"><Phone size={16} class="text-slate-400" /><span class="text-sm text-slate-600">{clienteTelefone || 'Sem telefone'}</span></div>
          <div class="flex items-center gap-2"><Mail size={16} class="text-slate-400" /><span class="text-sm text-slate-600">{clienteEmail || 'Sem email'}</span></div>
        </div>

        <div>
          <p class="block text-sm font-medium text-slate-700 mb-2">Canal de Envio</p>
          <div class="vtur-modal-grid-compact flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!clienteTelefone}
              class_name={`flex-1 justify-center gap-2.5 border-2 py-3 ${canalAtivo === 'whatsapp' ? 'border-green-500 bg-green-50 text-green-700 hover:bg-green-50!' : 'border-slate-200 bg-white text-slate-600'}`}
              on:click={() => canalAtivo = 'whatsapp'}
            >
              <MessageCircle size={20} />
              WhatsApp
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!clienteEmail}
              class_name={`flex-1 justify-center gap-2.5 border-2 py-3 ${canalAtivo === 'email' ? 'border-orange-500 bg-orange-50 text-orange-700 hover:bg-orange-50!' : 'border-slate-200 bg-white text-slate-600'}`}
              on:click={() => canalAtivo = 'email'}
            >
              <Mail size={20} />
              Email
            </Button>
          </div>
        </div>

        <div>
          {#if carregandoTemplates}
            <LoadingState compact={true} />
          {:else if erroTemplates}
            <div class="vtur-modal-notice rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {erroTemplates}
            </div>
          {:else if templatesFiltrados.length === 0}
            <div class="vtur-modal-notice rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Nenhum template ativo encontrado no CRM para seu escopo.
            </div>
          {:else}
            <div class="vtur-modal-grid-compact grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FieldSelect
                id="aviso-tema"
                label="Tema"
                bind:value={temaSelecionado}
                options={temaOptions}
                placeholder={null}
                class_name="w-full"
              />

              <FieldSelect
                id="aviso-template"
                label="Template"
                bind:value={templateSelecionado}
                options={templateOptions}
                placeholder={null}
                class_name="w-full"
              />
            </div>
          {/if}
        </div>

        {#if canalAtivo === 'email'}
          <FieldInput
            id="assunto-aviso"
            label="Assunto"
            value={assuntoAtual}
            readonly={true}
            class_name="w-full"
          />
        {/if}

        <div>
          <div class="mb-2 flex items-center justify-between">
            <label for="mensagem-aviso" class="block text-sm font-medium text-slate-700">Mensagem</label>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class_name="px-0! py-0! text-xs text-clientes-600 hover:bg-transparent! hover:!text-clientes-800"
              on:click={copiarMensagem}
            >
              <Copy size={12} />
              Copiar
            </Button>
          </div>
          <FieldTextarea
            id="mensagem-aviso"
            bind:value={mensagemPersonalizada}
            rows={5}
            class_name="w-full"
            placeholder="Digite sua mensagem personalizada..."
          />
          <p class="text-xs text-slate-500 mt-1">Use {'{nome}'} para o primeiro nome ou {'{nome_completo}'} para o nome completo</p>
        </div>

        {#if mensagemPersonalizada}
          <div class="vtur-modal-section-compact bg-slate-50 rounded-lg p-3 space-y-3">
            <p class="text-xs text-slate-500 mb-1">Preview:</p>
            {#if previewCardUrl}
              <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <img src={previewCardUrl} alt="Prévia do cartão" class="w-full" />
              </div>
            {/if}

            <div class="flex justify-center">
              <div class="inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
                <Button type="button" variant="secondary" color="clientes" size="xs" title="Editar texto" on:click={focarEdicaoMensagem}>
                  <Pencil size={14} />
                </Button>
                <Button type="button" variant="secondary" color="clientes" size="xs" title="Abrir cartão" disabled={!previewCardUrl} on:click={openPreviewSvg}>
                  <ExternalLink size={14} />
                </Button>
                <Button type="button" variant="secondary" color="clientes" size="xs" title="Baixar PNG" disabled={!previewCardUrl} on:click={downloadPreviewPng}>
                  <Download size={14} />
                </Button>
                <Button type="button" variant="secondary" color="clientes" size="xs" title="Compartilhar no WhatsApp" disabled={!previewCardUrl} on:click={sharePreviewOnWhatsApp}>
                  <MessageCircle size={14} />
                </Button>
                <Button type="button" variant="secondary" color="clientes" size="xs" title="Limpar ajustes" on:click={clearPreviewActions}>
                  <X size={14} />
                </Button>
              </div>
            </div>

            <div class="flex justify-center">
              <div class="inline-flex flex-wrap items-center justify-center gap-2">
                {#each CARD_TEXT_COLOR_PRESETS.filter((color) => color.value) as color}
                  <Button
                    type="button"
                    variant="unstyled"
                    class_name={`h-8 w-8 rounded-lg border-2 transition ${previewTextColor === color.value ? 'scale-105 border-slate-900 shadow-md' : 'border-white shadow-xs'}`}
                    style={`background-color: ${color.value}`}
                    title={`Aplicar ${color.label}`}
                    ariaLabel={`Aplicar ${color.label}`}
                    ariaPressed={previewTextColor === color.value}
                    on:click={() => (previewTextColor = color.value)}
                  />
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <div class="border-t border-slate-100 pt-4">
          <div class="flex items-center justify-between mb-2"><p class="text-sm font-medium text-slate-700">Últimos avisos</p></div>
          {#if carregandoHistorico}
            <LoadingState compact={true} />
          {:else if historicoIndisponivel}
            <div class="vtur-modal-notice rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">Histórico ainda indisponível no banco atual.</div>
          {:else if historico.length === 0}
            <div class="vtur-modal-notice rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Nenhum aviso registrado para este cliente.</div>
          {:else}
            <div class="space-y-2">
              {#each historico as item}
                <div class="vtur-modal-list-item rounded-lg border border-slate-200 px-3 py-2">
                  <div class="flex items-center justify-between gap-2 text-xs"><span class="font-medium text-slate-700 uppercase">{item.canal}</span><span class="text-slate-500">{formatDate(item.created_at)}</span></div>
                  <p class="mt-1 text-sm font-medium text-slate-900">{item.assunto || 'Sem assunto'}</p>
                  <p class="mt-1 text-xs text-slate-600">{item.mensagem}</p>
                  <p class="mt-1 text-xs text-slate-500">Status: {getStatusLabel(item.status)}</p>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

  <svelte:fragment slot="actions">
    <Button variant="secondary" on:click={onClose}>Cancelar</Button>
    <Button variant="primary" color={canalAtivo === 'whatsapp' ? 'green' : 'orange'} on:click={enviarMensagem} loading={enviando}>
      <Send size={16} class="mr-2" />
      Enviar por {canalAtivo === 'whatsapp' ? 'WhatsApp' : 'Email'}
    </Button>
  </svelte:fragment>
</Dialog>
