import { VTUR_LOGO_URL } from '$lib/brand';
/**
 * exportQuotePdfClient.ts — vtur-svelte
 *
 * Portabilizado de exportQuotePdfClient.ts + quotePdfModern.ts do vtur-app.
 * Gera o HTML de preview do orçamento com: logo, QR Code WhatsApp,
 * itens, resumo financeiro e rodapé.
 *
 * Usa o cliente Dados browser para resolver URLs assinadas.
 */

import { construirLinkWhatsApp } from '$lib/whatsapp';
import { safeOpenNewTab } from '$lib/security/url';
import { buildQuoteCardsHtml } from './quotePdfCards';

// ---------------------------------------------------------------------------
// TIPOS
// ---------------------------------------------------------------------------

export type QuotePdfSettings = {
  imagem_complementar_url?: string | null;
  imagem_complementar_path?: string | null;
  consultor_nome?: string | null;
  filial_nome?: string | null;
  endereco_linha1?: string | null;
  endereco_linha2?: string | null;
  endereco_linha3?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  whatsapp_codigo_pais?: string | null;
  email?: string | null;
  rodape_texto?: string | null;
};

export type QuoteItemForPdf = {
  id?: string;
  item_type?: string | null;
  title?: string | null;
  product_name?: string | null;
  city_name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  total_amount?: number | null;
  taxes_amount?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  currency?: string | null;
  order_index?: number | null;
  raw?: Record<string, unknown> | null;
  segments?: Array<{
    segment_type?: string | null;
    data?: Record<string, unknown> | null;
    order_index?: number | null;
  }>;
};

export type QuoteForPdf = {
  id: string;
  created_at?: string | null;
  total?: number | null;
  currency?: string | null;
  client_name?: string | null;
  data_embarque?: string | null;
  data_final?: string | null;
  raw_json?: unknown;
};

type QuotePreviewRow = QuoteForPdf & {
  cliente?: { nome?: string | null } | null;
};

type QuoteItemSegmentRow = {
  quote_item_id?: string | null;
  segment_type?: string | null;
  data?: Record<string, unknown> | null;
  order_index?: number | null;
};

type DadosQueryResult = PromiseLike<{ data: unknown; error?: { message?: string } | null }> & {
  eq: (column: string, value: unknown) => DadosQueryResult;
  in: (column: string, values: readonly string[]) => DadosQueryResult;
  order: (column: string, options: { ascending: boolean }) => DadosQueryResult;
  maybeSingle: () => Promise<{
    data: Record<string, unknown> | null;
    error?: { message?: string } | null;
  }>;
};

type DadosPreviewStorage = {
  from: (bucket: string) => {
    download: (path: string) => Promise<{ data: Blob | null; error?: { message?: string } | null }>;
    createSignedUrl: (
      path: string,
      ttl: number
    ) => Promise<{ data?: { signedUrl?: string } | null }>;
  };
};

type PreviewUser = { id: string; email?: string | null };

type DadosPreviewClient = {
  from: (table: string) => any;
  auth: { getUser: () => Promise<{ data: { user: PreviewUser | null } }> };
  storage: DadosPreviewStorage;
};

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function textVal(value?: string | null): string {
  return String(value ?? '').trim();
}

export function buildQuotePreviewHtmlSync(params: {
  quote: QuoteForPdf;
  items: QuoteItemForPdf[];
  settings: QuotePdfSettings;
  qrUrl: string | null;
  complementUrl: string | null;
  showBudgetItems: boolean;
  showBudgetDetails: boolean;
  showItemValues: boolean;
  discount?: number;
}): string {
  return buildQuoteCardsHtml({
    quote: params.quote,
    items: params.items,
    settings: params.settings,
    qrUrl: params.qrUrl,
    complementUrl: params.complementUrl,
    showItems: params.showBudgetItems || params.showBudgetDetails,
    showItemValues: params.showItemValues,
    discount: params.discount
  });
}

// ---------------------------------------------------------------------------
// FUNÇÃO PRINCIPAL — carrega dados + monta HTML + abre em nova aba
// ---------------------------------------------------------------------------

export async function openQuotePreview(params: {
  quoteId: string;
  dados: DadosPreviewClient;
  showBudgetItems?: boolean;
  showBudgetDetails?: boolean;
  showItemValues?: boolean;
  discount?: number;
}): Promise<void> {
  const {
    quoteId,
    dados,
    showBudgetItems = false,
    showBudgetDetails = true,
    showItemValues = true,
    discount = 0
  } = params;

  // 1. Autenticação
  const { data: authData } = await dados.auth.getUser();
  const userId = authData?.user?.id;
  if (!userId) throw new Error('Usuário não autenticado.');

  // 2. Dados do orçamento
  const { data: quote, error: quoteError } = await dados
    .from('quote')
    .select(
      'id, created_at, currency, total, status, client_name, raw_json, data_embarque, data_final, cliente:client_id (nome)'
    )
    .eq('id', quoteId)
    .maybeSingle();
  const quoteRow = quote as QuotePreviewRow | null;
  if (quoteError || !quoteRow) throw new Error('Orçamento não encontrado.');

  // 3. Itens
  const { data: items, error: itemsError } = await dados
    .from('quote_item')
    .select(
      'id, item_type, title, product_name, city_name, quantity, unit_price, total_amount, taxes_amount, start_date, end_date, currency, order_index, raw'
    )
    .eq('quote_id', quoteId)
    .order('order_index', { ascending: true });
  if (itemsError) throw new Error('Erro ao carregar itens do orçamento.');

  const itemRows: QuoteItemForPdf[] = [];
  for (const item of (items ?? []) as QuoteItemForPdf[]) {
    itemRows.push({
      ...item,
      segments: []
    });
  }
  const itemIds: string[] = [];
  for (const item of itemRows) {
    if (item.id) itemIds.push(item.id);
  }
  if (itemIds.length > 0) {
    const { data: segments } = await dados
      .from('quote_item_segment')
      .select('quote_item_id, segment_type, data, order_index')
      .in('quote_item_id', itemIds)
      .order('order_index', { ascending: true });
    const segmentRows = (segments ?? []) as QuoteItemSegmentRow[];

    const segmentsByItem = new Map<string, NonNullable<QuoteItemForPdf['segments']>>();
    for (const segment of segmentRows) {
      const itemId = String(segment.quote_item_id || '');
      if (!itemId) continue;
      const current = segmentsByItem.get(itemId) || [];
      current.push({
        segment_type: segment.segment_type ?? null,
        data: segment.data ?? {},
        order_index: segment.order_index ?? 0
      });
      segmentsByItem.set(itemId, current);
    }

    for (const item of itemRows) {
      if (item.id && segmentsByItem.has(item.id)) item.segments = segmentsByItem.get(item.id) || [];
    }
  }

  // 4. Parâmetros PDF
  const { data: settings } = await dados
    .from('quote_print_settings')
    .select(
      'imagem_complementar_url, imagem_complementar_path, consultor_nome, filial_nome, endereco_linha1, endereco_linha2, endereco_linha3, telefone, whatsapp, whatsapp_codigo_pais, email, rodape_texto'
    )
    .eq('owner_user_id', userId)
    .maybeSingle();

  const pdfSettings: QuotePdfSettings = settings ?? {};

  // 5. Resolve URLs assinadas (token na query string — funciona sem cookie)
  const complementSignedUrl = await resolveStorageUrl(
    dados,
    pdfSettings.imagem_complementar_url,
    pdfSettings.imagem_complementar_path
  );

  // 6. QR Code
  const whatsappLink = construirLinkWhatsApp(
    pdfSettings.whatsapp,
    pdfSettings.whatsapp_codigo_pais
  );
  const qrSignedUrl = whatsappLink
    ? `/api/v1/qr?size=200&margin=1&text=${encodeURIComponent(whatsappLink)}`
    : null;

  // 7. Converte todas as imagens para data URL antes de montar o HTML
  // Necessário porque o blob: HTML abre em origem isolada (null) e imagens
  // externas com token na URL seriam bloqueadas pelo browser
  const [complementUrl, qrUrl] = await Promise.all([
    storageImageToDataUrl(
      dados,
      pdfSettings.imagem_complementar_path ||
        extractStoragePath(pdfSettings.imagem_complementar_url),
      complementSignedUrl
    ),
    qrSignedUrl ? externalImageToDataUrl(qrSignedUrl) : Promise.resolve(null)
  ]);

  // 8. Monta HTML
  const clientName = textVal(quoteRow.client_name ?? quoteRow.cliente?.nome);
  const html = buildQuotePreviewHtmlSync({
    quote: {
      id: quoteRow.id,
      created_at: quoteRow.created_at ?? null,
      total: quoteRow.total ?? 0,
      currency: quoteRow.currency ?? 'BRL',
      client_name: clientName || null,
      data_embarque: quoteRow.data_embarque ?? null,
      data_final: quoteRow.data_final ?? null,
      raw_json: quoteRow.raw_json ?? null
    },
    items: itemRows,
    settings: pdfSettings,
    qrUrl,
    complementUrl,
    showBudgetItems,
    showBudgetDetails,
    showItemValues,
    discount
  });

  // 9. Abre em nova aba
  const previewUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const opened = safeOpenNewTab(previewUrl, ['blob:']);
  setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
  if (!opened)
    throw new Error('Não foi possível abrir a prévia. Verifique o bloqueador de pop-up.');
}
