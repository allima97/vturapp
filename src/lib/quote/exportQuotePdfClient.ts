import { cityForAirportCode, loadAirportCodeCityLookup } from '$lib/airportCodeCityLookup';
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
import { diffDaysISODate, formatISODateBR, parseISODateParts } from '$lib/date';
import { apiFetch } from '$lib/services/api';
import {
  diasItem,
  formatarDescricaoItem,
  lerDetalhes,
  resumoDetalhes,
  resumoInformacoesVeiculo
} from '$lib/quote/detalhesItem';
import { chaveIdentidadeCidade } from '$lib/catalogoOpcionais';
import { defaultQuoteFooter } from '$lib/quote/defaultFooter';
import {
  nomeCidadeNoPdf,
  printCardField,
  requiresPrintContinuation,
  roteiroCardStyles
} from '$lib/utils/printLayout';

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
  cidade_id?: string | null;
  destino_geografico_id?: string | null;
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
  valid_until?: string | null;
};

type QuotePreviewRow = QuoteForPdf & {
  cliente?: { nome?: string | null } | null;
  itens: QuoteItemForPdf[];
  pdf_settings: QuotePdfSettings;
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

type DadosPreviewClient = {
  storage: DadosPreviewStorage;
};

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function escHtml(value?: string | number | null): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const planeIconShape =
  '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>';
const trainIconShape =
  '<rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16M12 3v8M8 19l-2 3M18 22l-2-3M8 15h0M16 15h0"/>';
const carIconShape =
  '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-3.4A2 2 0 0 0 13.7 6H8.3a2 2 0 0 0-1.6.8L4 10l-2 .6C1.4 10.9 1 11.6 1 12.3V16c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>';
const hotelIconShape = '<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>';

function traco(larguraLinha: number) {
  return `<span class="lni"><span class="ln" style="width:${larguraLinha * 2}px"></span></span>`;
}

function textVal(value?: string | null): string {
  return String(value ?? '').trim();
}

const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(currency: string): Intl.NumberFormat {
  const cached = CURRENCY_FORMATTERS.get(currency);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency });
  CURRENCY_FORMATTERS.set(currency, formatter);
  return formatter;
}

function formatCurrency(value: number, currency = 'BRL'): string {
  const formatter = getCurrencyFormatter(currency);
  if (!Number.isFinite(value)) {
    return formatter.format(0);
  }
  return formatter.format(value).replace(/[\u00a0\u202f]/g, ' ');
}

function formatDateBR(value?: string | null): string {
  if (!value) return '';
  const formatted = formatISODateBR(value);
  return formatted === '-' ? '' : formatted;
}

function normalizeText(value?: string | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function splitTrechoCities(value?: string | null) {
  const parts: string[] = [];
  for (const part of String(value || '').split(/\s*(?:→|->)\s*|\s+-\s+/)) {
    const trimmed = part.trim();
    if (trimmed) parts.push(trimmed);
  }
  return {
    origem: parts[0] || '',
    destino: parts[1] || ''
  };
}

function codigoIata(value: string) {
  const token = textVal(value).split(',')[0].trim();
  return /^[A-Za-z]{3}$/.test(token) ? token.toUpperCase() : '';
}

function cidadeDoTrecho(storedCity: string, place: string) {
  const stored = textVal(storedCity);
  if (stored && !codigoIata(stored)) return nomeCidadeNoPdf(stored);
  const code = codigoIata(place) || codigoIata(stored);
  const city = code ? cityForAirportCode(code) : '';
  if (city) return nomeCidadeNoPdf(city);
  return nomeCidadeNoPdf(stored || place);
}

function siglaDoTrecho(place: string, storedCity: string, train: boolean) {
  if (train) return nomeCidadeNoPdf(textVal(place) || textVal(storedCity));
  return (
    codigoIata(place) ||
    codigoIata(storedCity) ||
    nomeCidadeNoPdf(textVal(place) || textVal(storedCity))
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getFlightDataList(item: QuoteItemForPdf): Record<string, unknown>[] {
  const segmentRows = (item.segments || [])
    .filter((segment) => segment.segment_type === 'flight')
    .sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0))
    .reduce<Record<string, unknown>[]>((rows, segment) => {
      const data = asRecord(segment.data);
      if (Object.keys(data).length > 0) rows.push(data);
      return rows;
    }, []);

  if (segmentRows.length > 0) return segmentRows;

  const raw = asRecord(item.raw);
  const aereoImport = asRecord(raw.aereo_import);
  const segmentos = Array.isArray(aereoImport.segmentos)
    ? aereoImport.segmentos.map((segment) => ({
        ...asRecord(segment),
        cia_aerea: asRecord(segment).cia_aerea || aereoImport.cia_aerea,
        classe_reserva: asRecord(segment).classe_reserva || aereoImport.classe_reserva,
        trecho: asRecord(segment).trecho || aereoImport.trecho,
        data_inicio:
          asRecord(segment).data_inicio || asRecord(segment).data_voo || aereoImport.data_inicio,
        data_fim: asRecord(segment).data_fim || asRecord(segment).data_voo || aereoImport.data_fim
      }))
    : [];

  if (segmentos.length > 0) return segmentos;
  if (aereoImport.data_voo || aereoImport.hora_saida || aereoImport.aeroporto_saida)
    return [aereoImport];
  return [];
}

function isFlightQuoteItem(item: QuoteItemForPdf) {
  if (normalizeText(item.item_type) === 'trem') return false;
  if (getFlightDataList(item).length > 0) return true;
  const normalized = normalizeText(
    `${item.item_type || ''} ${item.title || ''} ${item.product_name || ''}`
  );
  return (
    normalized.includes('passagem') || normalized.includes('aereo') || normalized.includes('voo')
  );
}

function getCircuitDaySegments(item: QuoteItemForPdf) {
  return (item.segments || [])
    .filter((segment) => segment.segment_type === 'circuit_day')
    .sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0));
}

function isCircuitQuoteItem(item: QuoteItemForPdf) {
  if (getCircuitDaySegments(item).length > 0) return true;
  const normalized = normalizeText(
    `${item.item_type || ''} ${item.title || ''} ${item.product_name || ''}`
  );
  return normalized.includes('circuito');
}

function extractStoragePath(url?: string | null): string | null {
  if (!url) return null;
  const marker = '/quotes/';
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

async function resolveStorageUrl(
  dados: {
    storage: {
      from: (bucket: string) => {
        createSignedUrl: (
          path: string,
          ttl: number
        ) => Promise<{ data?: { signedUrl?: string } | null }>;
      };
    };
  },
  url?: string | null,
  path?: string | null
): Promise<string | null> {
  const storagePath = path || extractStoragePath(url);
  if (storagePath) {
    try {
      const { data } = await dados.storage.from('quotes').createSignedUrl(storagePath, 3600);
      if (data?.signedUrl) return data.signedUrl;
    } catch {
      // fall through to publicUrl
    }
  }
  return url ?? null;
}

/**
 * Converte um Blob para data URL via FileReader.
 */
function blobToDataUrl(blob: Blob, fallbackMime?: string): Promise<string> {
  return new Promise<string>((resolve) => {
    let finalBlob = blob;
    if (fallbackMime && (!blob.type || blob.type === 'application/octet-stream')) {
      finalBlob = new Blob([blob], { type: fallbackMime });
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
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
  return 'image/png';
}

/**
 * Baixa uma imagem do Dados Storage via SDK (.download) e converte para data URL.
 * Usa o SDK em vez de fetch externo — evita problemas de CORS com URLs assinadas.
 * Fallback: tenta fetch direto com a URL pública/assinada.
 */
async function storageImageToDataUrl(
  dados: Pick<DadosPreviewClient, 'storage'>,
  storagePath: string | null,
  fallbackUrl: string | null
): Promise<string | null> {
  // 1. Tenta download via SDK (sem CORS — usa as credenciais internas do cliente)
  if (storagePath) {
    try {
      const { data: blob, error } = await dados.storage.from('quotes').download(storagePath);
      if (!error && blob) {
        const mime = guessMimeFromPath(storagePath);
        const dataUrl = await blobToDataUrl(blob, mime);
        if (dataUrl) return dataUrl;
      }
    } catch {
      // fall through
    }
  }

  // 2. Fallback: fetch da URL assinada (pode funcionar dependendo da config do bucket)
  if (fallbackUrl) {
    try {
      const res = await fetch(fallbackUrl);
      if (res.ok) {
        const blob = await res.blob();
        const mime = guessMimeFromPath(fallbackUrl);
        const dataUrl = await blobToDataUrl(blob, mime);
        if (dataUrl) return dataUrl;
      }
    } catch {
      // fall through
    }
  }

  return null;
}

/**
 * Converte uma URL de imagem para data URL via fetch.
 */
async function externalImageToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await blobToDataUrl(blob, 'image/png');
  } catch {
    return null;
  }
}

function renderGenericItemHtml(
  item: QuoteItemForPdf,
  showItemValues: boolean,
  defaultCurrency: string
) {
  const label = textVal(item.title || item.product_name || item.item_type || 'Item');
  const city = nomeCidadeNoPdf(textVal(item.city_name));
  const start = formatDateBR(item.start_date);
  const end = formatDateBR(item.end_date);
  const period = start && end && start !== end ? `${start} – ${end}` : start || '';
  const meta = city && period ? `${city} · ${period}` : city || period;
  const amount = Number(item.total_amount ?? 0);
  const currency = item.currency || defaultCurrency;

  return `<div class="orc-section-card">
    <div class="orc-section-title orc-section-title--blue">${escHtml(label)}</div>
    <div class="orc-section-divider"></div>
    ${meta ? `<div class="orc-item-meta">${escHtml(meta)}</div>` : ''}
    ${renderDetalhesItem(item)}
    ${showItemValues ? `<div class="orc-item-value">${escHtml(formatCurrency(amount, currency))}</div>` : ''}
  </div>`;
}

function formatRoteiroDate(value?: string | null) {
  return formatDateBR(value).replace(/\//g, '-');
}

function formatPassengerCount(value: number | null, singular: string, plural: string) {
  if (value === null || value <= 0) return '';
  return `${String(value).padStart(2, '0')} ${value === 1 ? singular : plural}`;
}

function getPassengerDetails(item: QuoteItemForPdf) {
  const details = lerDetalhes(item);
  return [
    formatPassengerCount(details.adultos, 'Adulto', 'Adultos'),
    formatPassengerCount(details.criancas, 'Criança', 'Crianças'),
    formatPassengerCount(details.infant, 'Infant', 'Infants')
  ].filter(Boolean);
}

function getFlightPassengerQuantity(item: QuoteItemForPdf) {
  const rawDetails = asRecord(asRecord(item.raw).detalhes_orcamento);
  const hasPassengerCounts = ['adultos', 'criancas', 'infant'].some(
    (key) => rawDetails[key] !== undefined && rawDetails[key] !== null && rawDetails[key] !== ''
  );
  if (!hasPassengerCounts) return Math.max(0, Math.trunc(Number(item.quantity ?? 1)));

  const details = lerDetalhes(item);
  return [details.adultos, details.criancas, details.infant].reduce<number>(
    (total, count) => total + Math.max(0, count || 0),
    0
  );
}

function formatFlightQuantity(item: QuoteItemForPdf) {
  const quantity = getFlightPassengerQuantity(item);
  return `${String(quantity).padStart(2, '0')} ${quantity === 1 ? 'passagem' : 'passagens'}`;
}

function formatLodgingOrCarQuantity(item: QuoteItemForPdf): string | null {
  const type = normalizeText(item.item_type);
  const hotel = type === 'hotel' || type === 'hospedagem';
  if (!hotel && type !== 'aluguel_carro') return null;

  const rawDetails = asRecord(asRecord(item.raw).detalhes_orcamento);
  const apartments = rawDetails.quantidade_apartamentos;
  const quantity =
    hotel && apartments != null && apartments !== ''
      ? lerDetalhes(item).quantidade_apartamentos
      : item.quantity;
  if (quantity == null) return '-';
  const unit = hotel
    ? quantity === 1
      ? 'apartamento'
      : 'apartamentos'
    : quantity === 1
      ? 'carro'
      : 'carros';
  return `${String(quantity).padStart(2, '0')} ${unit}`;
}

function getServiceDetails(item: QuoteItemForPdf) {
  const type = normalizeText(item.item_type);
  const details = lerDetalhes(item);
  if (type === 'hotel' || type === 'hospedagem') {
    return [
      ...getPassengerDetails(item),
      textVal(details.categoria),
      textVal(details.tipo_apartamento),
      textVal(details.regime)
    ].filter(Boolean);
  }
  if (type === 'aluguel_carro') {
    const includedOrder = ['KM Livre', 'CDW', 'LDW', 'Tanque Cheio', '2º motorista'];
    const included = new Set(details.incluidos.map(normalizeText));
    const extras = [
      ...includedOrder.filter((value) => included.has(normalizeText(value))),
      ...details.incluidos.filter(
        (value) => !includedOrder.some((known) => normalizeText(known) === normalizeText(value))
      )
    ];
    return [textVal(details.cambio), resumoInformacoesVeiculo(details), ...extras].filter(Boolean);
  }
  return resumoDetalhes(item);
}

function getServiceTitle(item: QuoteItemForPdf) {
  const title = formatarDescricaoItem(
    item.item_type || '',
    textVal(item.title || item.product_name || item.item_type || 'Item')
  );
  if (normalizeText(item.item_type) !== 'aluguel_carro') return title;

  const cambio = textVal(lerDetalhes(item).cambio);
  const suffix = title.match(/^(.*?)\s+[-–—]\s+([^-–—]+)$/);
  return suffix && cambio && normalizeText(suffix[2]) === normalizeText(cambio)
    ? suffix[1].trim()
    : title;
}

function quantidadeSemZero(label: string) {
  return label.replace(/^0+(?=\d)/, '');
}

function quantidadeExibida(label: string) {
  const text = quantidadeSemZero(label).trim();
  if (!text || text === '-') return text || '-';
  const match = text.match(/^\d+/);
  return match ? String(Number(match[0])) : text;
}

function faixaDatas(start?: string | null, end?: string | null) {
  const from = parseISODateParts(start)?.iso || '';
  const to = parseISODateParts(end)?.iso || '';
  if (!from) return '';
  if (!to || from === to) return formatDateBR(from);
  const inicio = parseISODateParts(from);
  const fim = parseISODateParts(to);
  if (inicio && fim && inicio.year === fim.year) {
    return `${String(inicio.day).padStart(2, '0')}/${String(inicio.month).padStart(2, '0')} a ${formatDateBR(to)}`;
  }
  return `${formatDateBR(from)} a ${formatDateBR(to)}`;
}

function faixaResumo(start?: string | null, end?: string | null) {
  const inicio = parseISODateParts(start);
  const fim = parseISODateParts(end);
  if (!inicio) return '';
  if (!fim || inicio.iso === fim.iso) return formatDateBR(inicio.iso);
  if (inicio.year === fim.year && inicio.month === fim.month) {
    return `${inicio.day} a ${formatDateBR(fim.iso)}`;
  }
  return faixaDatas(inicio.iso, fim.iso);
}

function rotuloEstadiaCurto(item: QuoteItemForPdf, prefix: string, modo: 'noites' | 'diarias') {
  const dias = diasItem(textVal(item.item_type), textVal(item.start_date), textVal(item.end_date));
  const contagem =
    dias != null && dias > 0
      ? modo === 'noites'
        ? `${dias} ${dias === 1 ? 'NOITE' : 'NOITES'}`
        : `${dias} ${dias === 1 ? 'DIÁRIA' : 'DIÁRIAS'}`
      : '';
  return [prefix, contagem].filter(Boolean).join(' · ');
}

function dataValidaBR(value?: string | null) {
  const data = formatDateBR(value);
  return data && data !== '-' ? data : '';
}

function estadiaHotelHtml(item: QuoteItemForPdf, details: ReturnType<typeof lerDetalhes>) {
  const trecho = (rotulo: string, data: string, hora: string) =>
    data ? `${rotulo}: ${escHtml(data)}${hora ? ` às ${escHtml(hora)}` : ''}` : '';
  const checkin = trecho('Check-in', dataValidaBR(item.start_date), textVal(details.hora_checkin));
  const checkout = trecho('Check-out', dataValidaBR(item.end_date), textVal(details.hora_checkout));
  if (checkin && checkout)
    return `<div class="rtf rota"><span class="lg"><span class="rt rota">${checkin}</span></span><span class="md">${traco(36)}</span><span class="lg"><span class="rt rota">${checkout}</span></span></div>`;
  const partes = [checkin, checkout].filter(Boolean);
  return partes.length ? `<div class="rt rota">${partes.join(' / ')}</div>` : '';
}

function rotaCarroHtml(item: QuoteItemForPdf, details: ReturnType<typeof lerDetalhes>) {
  const retirada = nomeCidadeNoPdf(textVal(item.city_name));
  const devolucao = nomeCidadeNoPdf(textVal(details.cidade_devolucao));
  if (!retirada && !devolucao) return '';
  const grupo = (cidade: string, loja: string, rotuloData: string) => {
    const titulo = [cidade, loja].filter(Boolean).join(' · ');
    return `<span class="lg"><span class="rt rota">${escHtml(titulo)}</span>${rotuloData ? `<span class="ct">${escHtml(rotuloData)}</span>` : ''}</span>`;
  };
  const rotuloData = (rotulo: string, data: string, hora: string) =>
    data ? `${rotulo}: ${data}${hora ? ` às ${hora}` : ''}` : '';
  return `<div class="rtf car rota">${grupo(retirada, textVal(details.loja_retirada), rotuloData('Retirada', dataValidaBR(item.start_date), textVal(details.hora_retirada)))}<span class="md">${traco(36)}</span>${grupo(devolucao, textVal(details.loja_devolucao), rotuloData('Devolução', dataValidaBR(item.end_date), textVal(details.hora_devolucao)))}</div>`;
}

function rotuloServico(item: QuoteItemForPdf, prefix: string) {
  const dias = diasItem(textVal(item.item_type), textVal(item.start_date), textVal(item.end_date));
  const contagem =
    dias != null && dias > 0
      ? `- ${String(dias).padStart(2, '0')} ${dias === 1 ? 'dia' : 'dias'}`
      : '';
  const periodo = [faixaDatas(item.start_date, item.end_date), contagem].filter(Boolean).join(' ');
  return [prefix, periodo].filter(Boolean).join(' · ');
}

function etiquetasCarro(labels: string[]) {
  const sigla = /^[A-Z0-9]{2,5}$/;
  const frase = (value: string) =>
    value
      .split(/\s+/)
      .map((word, index) =>
        sigla.test(word)
          ? word
          : index === 0
            ? word.charAt(0).toUpperCase() + word.slice(1).toLocaleLowerCase('pt-BR')
            : word.toLocaleLowerCase('pt-BR')
      )
      .join(' ');
  const tags: string[] = [];
  const siglas: string[] = [];
  const flush = () => {
    if (siglas.length) tags.push(siglas.splice(0).join(' + '));
  };
  for (const label of labels) {
    const text = textVal(label);
    if (!text) continue;
    if (sigla.test(text)) {
      siglas.push(text);
      continue;
    }
    flush();
    tags.push(frase(text));
  }
  flush();
  return tags;
}

const checkIcon =
  '<svg width="11" height="11" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#243AA3" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg>';

function etiquetas(labels: string[]) {
  const seen = new Set<string>();
  let html = '';
  for (const label of labels) {
    const text = textVal(label);
    const key = normalizeText(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    html += `<div class="chk">${checkIcon}<span>${escHtml(text)}</span></div>`;
  }
  return html ? `<div class="chks">${html}</div>` : '';
}

function passageirosDoOrcamento(items: QuoteItemForPdf[]) {
  let adultos = 0;
  let criancas = 0;
  let infants = 0;
  let temContagem = false;
  let passagens = 0;
  for (const item of items) {
    const details = lerDetalhes(item);
    if (details.adultos || details.criancas || details.infant) {
      temContagem = true;
      adultos = Math.max(adultos, details.adultos || 0);
      criancas = Math.max(criancas, details.criancas || 0);
      infants = Math.max(infants, details.infant || 0);
    }
    if (isFlightQuoteItem(item) || normalizeText(item.item_type) === 'trem') {
      passagens = Math.max(passagens, getFlightPassengerQuantity(item));
    }
  }
  if (temContagem) {
    return [
      adultos ? `${adultos} ${adultos === 1 ? 'adulto' : 'adultos'}` : '',
      criancas ? `${criancas} ${criancas === 1 ? 'criança' : 'crianças'}` : '',
      infants ? `${infants} ${infants === 1 ? 'infant' : 'infants'}` : ''
    ]
      .filter(Boolean)
      .join(' e ');
  }
  return passagens ? `${passagens} ${passagens === 1 ? 'passageiro' : 'passageiros'}` : '';
}

function totaisDaViagem(items: QuoteItemForPdf[], currency: string, discount: number) {
  const totals = new Map<string, { flights: number; services: number; taxes: number }>();
  for (const item of items) {
    const itemCurrency = item.currency || currency;
    const group = totals.get(itemCurrency) || { flights: 0, services: 0, taxes: 0 };
    if (isFlightQuoteItem(item)) group.flights += Number(item.total_amount ?? 0);
    else group.services += Number(item.total_amount ?? 0);
    group.taxes += Number(item.taxes_amount ?? 0);
    totals.set(itemCurrency, group);
  }
  if (!totals.size) totals.set(currency, { flights: 0, services: 0, taxes: 0 });
  return Array.from(totals, ([code, group]) => {
    const appliedDiscount = code === currency ? discount : 0;
    return {
      code,
      group,
      appliedDiscount,
      total: Math.max(group.flights + group.services + group.taxes - appliedDiscount, 0)
    };
  });
}

function totalDaFaixa(items: QuoteItemForPdf[], currency: string, discount: number) {
  return totaisDaViagem(items, currency, discount)
    .map(({ code, total }) => formatCurrency(total, code))
    .join(' · ');
}

function passageirosSemZero(item: QuoteItemForPdf) {
  return getPassengerDetails(item)
    .map((label) =>
      quantidadeSemZero(label).replace('Adulto', 'adulto').replace('Criança', 'criança')
    )
    .join(' e ');
}

function formatServicePeriod(item: QuoteItemForPdf) {
  const inicio = formatRoteiroDate(item.start_date);
  const fim = formatRoteiroDate(item.end_date);
  let periodo = inicio && fim && inicio !== fim ? `${inicio} a ${fim}` : inicio || fim;
  const dias = diasItem(textVal(item.item_type), textVal(item.start_date), textVal(item.end_date));
  const type = normalizeText(item.item_type);

  if (periodo && (type === 'hotel' || type === 'hospedagem') && dias !== null && dias > 0) {
    periodo += ` (${String(dias).padStart(2, '0')} ${dias === 1 ? 'noite' : 'noites'})`;
  } else if (periodo && type === 'aluguel_carro' && dias !== null) {
    periodo += ` (${String(dias).padStart(2, '0')} ${dias === 1 ? 'dia' : 'dias'})`;
  }

  return periodo;
}

function renderServiceItem(
  item: QuoteItemForPdf,
  showItemValues: boolean,
  defaultCurrency: string,
  flight = false,
  showUnitValue = false
) {
  const type = normalizeText(item.item_type);
  const labels: Record<string, string> = {
    hotel: 'Hotel',
    hospedagem: 'Hospedagem',
    servico: 'Serviço',
    pacote: 'Pacote',
    passagem: 'Passagem Aérea',
    trem: 'Trem',
    passeio: 'Passeio',
    show: 'Show',
    aluguel_carro: 'Aluguel de Carro',
    ingresso: 'Ingresso',
    transfer: 'Traslado',
    seguro: 'Seguro Viagem',
    seguro_viagem: 'Seguro Viagem',
    outro: 'Serviço'
  };
  const label =
    flight && type !== 'trem'
      ? 'Passagem Aérea'
      : labels[type] || textVal(item.item_type) || 'Serviço';
  const periodo = formatServicePeriod(item);
  const fields = getServiceDetails(item);
  const title = getServiceTitle(item);
  const quantity = flight
    ? formatFlightQuantity(item)
    : (formatLodgingOrCarQuantity(item) ?? (item.quantity == null ? '-' : String(item.quantity)));
  const content = `<strong>${escHtml(title)}${periodo ? ` - ${escHtml(periodo)}` : ''}</strong>${fields.length ? `<div class="orc-service-details">${fields.map(escHtml).join(' | ')}</div>` : ''}`;
  if (showUnitValue) return renderScreenItemRow(item, label, content, quantity, defaultCurrency);
  const iconType = flight && type !== 'trem' ? 'passagem' : type;
  const details = lerDetalhes(item);
  const hospedagem = type === 'hotel' || type === 'hospedagem';
  const carro = type === 'aluguel_carro';
  const seguro = type === 'seguro' || type === 'seguro_viagem';
  const cabecalho = hospedagem
    ? rotuloEstadiaCurto(item, 'HOTEL', 'noites')
    : carro
      ? rotuloEstadiaCurto(item, 'CARRO', 'diarias')
      : flight || type === 'trem'
        ? [label.toUpperCase(), faixaDatas(item.start_date, item.end_date)]
            .filter(Boolean)
            .join(' · ')
        : rotuloServico(item, label.toUpperCase());
  const estrelas = textVal(details.categoria).replace(/estrelas/gi, 'estrelas');
  const veiculo = resumoInformacoesVeiculo(details);
  const linhaCinza = hospedagem
    ? [estrelas, textVal(details.tipo_apartamento)].filter(Boolean).join(' · ')
    : carro
      ? [textVal(details.locadora), veiculo].filter(Boolean).join(' · ') || 'Aluguel de carro'
      : seguro
        ? textVal(details.fornecedor)
        : textVal(details.categoria);
  const cambio = textVal(details.cambio);
  const titulo =
    carro && cambio && !normalizeText(title).includes(normalizeText(cambio))
      ? `${title} ${cambio.toLocaleLowerCase('pt-BR')}`
      : title;
  const tags = hospedagem
    ? [textVal(details.regime), passageirosSemZero(item)]
    : carro
      ? etiquetasCarro(details.incluidos)
      : [passageirosSemZero(item)];
  const tituloHtml = titulo
    ? `<div style="margin-bottom:10px"><b>${escHtml(titulo)}</b></div>`
    : '';
  const rotaCarro = carro ? rotaCarroHtml(item, details) : '';
  const estadiaHotel = hospedagem ? estadiaHotelHtml(item, details) : '';
  const pdf = `${tituloHtml}${cabecalho ? `<div class="lb">${escHtml(cabecalho)}</div>` : ''}${rotaCarro}${estadiaHotel}${linhaCinza ? `<div class="mu sm">${escHtml(linhaCinza)}</div>` : ''}${etiquetas(tags)}`;
  return `<div class="row orc-city-item${requiresPrintContinuation([title, ...fields].join('\n')) ? ' orc-city-item--long' : ''}${showItemValues ? '' : ' orc-row--sem-valor'}"><div>${serviceIconSvg(iconType)}</div><div>${pdf}</div><div class="q orc-quantity">${escHtml(quantidadeExibida(quantity))}</div>${showItemValues ? `<div class="v">${escHtml(formatCurrency(Number(item.total_amount ?? 0), item.currency || defaultCurrency))}</div>` : ''}</div>`;
}

type QuotePdfSection =
  | { kind: 'city'; city: string; key: string; cityId: string | null; items: QuoteItemForPdf[] }
  | { kind: 'flights'; items: QuoteItemForPdf[] }
  | { kind: 'circuit'; items: QuoteItemForPdf[] };

function nomesCompativeis(a: string, b: string) {
  const fullA = normalizeText(a);
  const fullB = normalizeText(b);
  if (!fullA || !fullB) return false;
  if (fullA === fullB) return true;
  const shortA = normalizeText(nomeCidadeNoPdf(a));
  const shortB = normalizeText(nomeCidadeNoPdf(b));
  if (!shortA || shortA !== shortB) return false;
  if (fullA === shortA || fullB === shortB) return true;
  if (fullA.startsWith(`${fullB},`) || fullB.startsWith(`${fullA},`)) return true;
  const tokens = (full: string, short: string) =>
    full
      .slice(short.length)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4);
  const restoA = new Set(tokens(fullA, shortA));
  return tokens(fullB, shortB).some((token) => restoA.has(token));
}

function mesmaCidade(section: QuotePdfSection, city: string, cityId: string | null) {
  if (section.kind !== 'city') return false;
  if (section.cityId && cityId && section.cityId !== cityId) return false;
  if (section.cityId && cityId) return true;
  const atual = section.city === 'Cidade não informada' ? '' : section.city;
  if (!atual && !city) return !section.cityId && !cityId;
  return nomesCompativeis(atual, city);
}

function orderQuoteSections(items: QuoteItemForPdf[]): QuotePdfSection[] {
  const sections: QuotePdfSection[] = [];
  for (const item of items) {
    const previous = sections[sections.length - 1];
    const isTrain = normalizeText(item.item_type) === 'trem';
    if (isFlightQuoteItem(item)) {
      if (previous?.kind === 'flights') previous.items.push(item);
      else sections.push({ kind: 'flights', items: [item] });
      continue;
    }
    if (!isTrain && isCircuitQuoteItem(item)) {
      sections.push({ kind: 'circuit', items: [item] });
      continue;
    }
    const firstSegment = isTrain ? getFlightDataList(item)[0] : undefined;
    const origin = firstSegment
      ? textVal(String(firstSegment.aeroporto_saida || '')) ||
        splitTrechoCities(String(firstSegment.trecho || '')).origem ||
        textVal(String(firstSegment.cidade_saida || ''))
      : '';
    const city = origin || textVal(item.city_name);
    const originId = textVal(String(firstSegment?.cidade_saida_id || ''));
    const cityId = origin
      ? originId
        ? `geo:${originId}`
        : null
      : item.destino_geografico_id
        ? `geo:${item.destino_geografico_id}`
        : item.cidade_id
          ? `cidade:${item.cidade_id}`
          : null;
    const key = chaveIdentidadeCidade(city, cityId);
    const match = sections.find((section) => mesmaCidade(section, city, cityId));
    if (match?.kind === 'city') {
      if (cityId && !match.cityId) {
        match.cityId = cityId;
        match.key = key;
      }
      match.items.push(item);
    } else {
      sections.push({
        kind: 'city',
        city: city || 'Cidade não informada',
        key,
        cityId,
        items: [item]
      });
    }
  }
  return sections;
}

function marcoDoItem(item: QuoteItemForPdf) {
  const marcos: { start: string; end: string }[] = [];
  const add = (start: unknown, end: unknown) => {
    const inicio = parseISODateParts(typeof start === 'string' ? start : '')?.iso || '';
    const fim = parseISODateParts(typeof end === 'string' ? end : '')?.iso || '';
    if (inicio) marcos.push({ start: inicio, end: fim && fim >= inicio ? fim : inicio });
  };
  add(item.start_date, item.end_date);
  for (const flight of getFlightDataList(item)) {
    add(
      flight.data_voo || flight.data_inicio,
      flight.data_fim || flight.data_voo || flight.data_inicio
    );
  }
  marcos.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  return marcos[0] || null;
}

function ordenarItensDoGrupo(items: QuoteItemForPdf[]) {
  return items
    .map((item, order) => ({ item, order, marco: marcoDoItem(item) }))
    .sort((a, b) => {
      if (a.marco && b.marco && a.marco.start !== b.marco.start) {
        return a.marco.start < b.marco.start ? -1 : 1;
      }
      if (a.marco && !b.marco) return -1;
      if (!a.marco && b.marco) return 1;
      return a.order - b.order;
    })
    .map(({ item }) => item);
}

function ordenarGrupos(sections: QuotePdfSection[]) {
  const indexes = sections.flatMap((section, index) => (section.kind === 'city' ? [index] : []));
  const groups = indexes.map((index, order) => {
    const section = sections[index];
    const items = section.kind === 'city' ? ordenarItensDoGrupo(section.items) : [];
    const marcos = items
      .map(marcoDoItem)
      .filter((marco): marco is { start: string; end: string } => Boolean(marco))
      .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
    return {
      index,
      order,
      items,
      start: marcos[0]?.start || '',
      end: marcos.reduce((max, marco) => (marco.end > max ? marco.end : max), '')
    };
  });
  groups.sort((a, b) => {
    if (a.start && b.start && a.start !== b.start) return a.start < b.start ? -1 : 1;
    if (a.start && b.start && a.end !== b.end) return a.end < b.end ? -1 : 1;
    if (a.start && !b.start) return -1;
    if (!a.start && b.start) return 1;
    return a.order - b.order;
  });
  const ordered = sections.slice();
  indexes.forEach((slot, position) => {
    const source = sections[groups[position].index];
    if (source.kind !== 'city') return;
    ordered[slot] = { ...source, items: groups[position].items };
  });
  return ordered;
}

function resumoAereo(items: QuoteItemForPdf[]) {
  const phrases: string[] = [];
  for (const item of items) {
    const legs = getFlightDataList(item).map((data) => {
      const trecho = splitTrechoCities(String(data.trecho || ''));
      return {
        from: cidadeDoTrecho(
          String(data.cidade_saida || ''),
          String(data.aeroporto_saida || trecho.origem || '')
        ),
        to: cidadeDoTrecho(
          String(data.cidade_chegada || ''),
          String(data.aeroporto_chegada || trecho.destino || '')
        )
      };
    });
    const idaEVolta =
      legs.length === 2 &&
      normalizeText(legs[0].to) === normalizeText(legs[1].from) &&
      normalizeText(legs[0].from) === normalizeText(legs[1].to);
    if (idaEVolta && legs[0].from && legs[0].to) {
      phrases.push(`${legs[0].from} ⇄ ${legs[0].to}`);
      continue;
    }
    for (const leg of legs) {
      if (leg.from && leg.to) phrases.push(`${leg.from} → ${leg.to}`);
    }
  }
  if (phrases.length < 2) return phrases[0] || '';
  if (phrases.length === 2) return `${phrases[0]} e ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(', ')} e ${phrases[phrases.length - 1]}`;
}

function dataDoVoo(item: QuoteItemForPdf) {
  const flight = getFlightDataList(item)[0];
  return (
    parseISODateParts(String(flight?.data_voo || flight?.data_inicio || item.start_date || ''))
      ?.iso || '9999-99-99'
  );
}

function moedasDoGrupo(items: QuoteItemForPdf[], fallback: string) {
  const totals = new Map<string, number>();
  for (const item of items) {
    const currency = item.currency || fallback;
    totals.set(
      currency,
      (totals.get(currency) || 0) + Number(item.total_amount ?? 0) + Number(item.taxes_amount ?? 0)
    );
  }
  return Array.from(totals, ([currency, value]) => formatCurrency(value, currency)).join(' · ');
}

function periodoDoGrupo(items: QuoteItemForPdf[]) {
  const dates = items
    .flatMap((item) => [
      item.start_date,
      item.end_date,
      ...getFlightDataList(item).flatMap((flight) => [
        flight.data_voo,
        flight.data_inicio,
        flight.data_fim
      ])
    ])
    .map((date) => parseISODateParts(typeof date === 'string' ? date : null)?.iso)
    .filter((date): date is string => Boolean(date))
    .sort();
  return dates.length ? faixaResumo(dates[0], dates[dates.length - 1]) : '';
}

function atrasoChegada(data: { data_voo?: unknown; data_inicio?: unknown; data_fim?: unknown }) {
  const offset = diffDaysISODate(
    String(data.data_voo || data.data_inicio || ''),
    String(data.data_fim || data.data_voo || data.data_inicio || '')
  );
  return offset != null && offset > 0 ? offset : 0;
}

function renderGroupedItems(
  sections: QuotePdfSection[],
  showItemValues: boolean,
  defaultCurrency: string
) {
  const flights = sections
    .filter((section) => section.kind === 'flights')
    .flatMap((section) => section.items)
    .sort((a, b) => dataDoVoo(a).localeCompare(dataDoVoo(b)) || 0);
  const isCar = (item: QuoteItemForPdf) => normalizeText(item.item_type) === 'aluguel_carro';
  const isInsurance = (item: QuoteItemForPdf) => {
    const type = normalizeText(item.item_type);
    return type === 'seguro' || type === 'seguro_viagem';
  };
  const cars = sections
    .flatMap((section) => section.items)
    .filter(isCar)
    .sort((a, b) => textVal(a.start_date).localeCompare(textVal(b.start_date)));
  const insurances = sections
    .flatMap((section) => section.items)
    .filter(isInsurance)
    .sort((a, b) => textVal(a.start_date).localeCompare(textVal(b.start_date)));
  const rest = ordenarGrupos(
    sections
      .filter((section) => section.kind !== 'flights')
      .map((section) =>
        section.kind === 'city'
          ? {
              ...section,
              items: section.items.filter((item) => !isCar(item) && !isInsurance(item))
            }
          : section
      )
      .filter((section) => section.kind !== 'city' || section.items.length > 0)
  );
  const air =
    flights.length > 0
      ? renderCityTable(
          'Passagens aéreas',
          `${flights
            .map((item) => {
              if (!getFlightDataList(item).length)
                return renderServiceItem(item, showItemValues, defaultCurrency, true);
              return renderFlightItemHtml(item, showItemValues, defaultCurrency);
            })
            .join('')}`,
          false,
          showItemValues ? moedasDoGrupo(flights, defaultCurrency) : '',
          resumoAereo(flights)
        )
      : '';
  const carSection =
    cars.length > 0
      ? renderCityTable(
          'Aluguel de carro',
          cars.map((item) => renderServiceItem(item, showItemValues, defaultCurrency)).join(''),
          false,
          showItemValues ? moedasDoGrupo(cars, defaultCurrency) : '',
          periodoDoGrupo(cars)
        )
      : '';
  const cities = rest
    .map((section) => {
      if (section.kind === 'circuit')
        return renderCircuitItemHtml(section.items[0], showItemValues, defaultCurrency);
      if (section.kind !== 'city') return '';
      const content = section.items
        .map((item) => {
          if (normalizeText(item.item_type) !== 'trem')
            return renderServiceItem(item, showItemValues, defaultCurrency);
          return getFlightDataList(item).length
            ? renderFlightItemHtml(item, showItemValues, defaultCurrency)
            : renderServiceItem(item, showItemValues, defaultCurrency, true);
        })
        .join('');
      return renderCityTable(
        section.city,
        content,
        true,
        showItemValues ? moedasDoGrupo(section.items, defaultCurrency) : '',
        periodoDoGrupo(section.items)
      );
    })
    .join('');
  const insuranceSection =
    insurances.length > 0
      ? renderCityTable(
          'Seguro Viagem',
          insurances
            .map((item) => renderServiceItem(item, showItemValues, defaultCurrency))
            .join(''),
          false,
          showItemValues ? moedasDoGrupo(insurances, defaultCurrency) : '',
          periodoDoGrupo(insurances)
        )
      : '';
  return `${air}${carSection}${cities}${insuranceSection}`;
}

function renderCityTable(title: string, content: string, isCity = false, subtotal = '', note = '') {
  const heading = escHtml(isCity ? nomeCidadeNoPdf(title) : title);
  return `<section class="orc-city-section"><div class="sh${subtotal ? '' : ' sh--sem-valor'}"><span class="l">${heading}${note ? ` <small>· ${escHtml(note)}</small>` : ''}</span><span class="sh-qtd">Qtd</span>${subtotal ? `<span>${escHtml(subtotal)}</span>` : ''}</div>${content}</section>`;
}

const financialIcon = `<svg class="orc-section-icon orc-section-icon--financial" width="13" height="13" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#243AA3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 9h1m12 6h1"/></svg>`;
const infoIcon = `<svg class="orc-section-icon orc-info-icon--estimate" width="13" height="13" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#243AA3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/></svg>`;
const childIcon = `<svg class="orc-section-icon orc-info-icon--children" width="13" height="13" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#243AA3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="2"/><path d="M8 11l2-3h4l2 3M12 8v6m-2 0-1 7m5-7 1 7"/></svg>`;
const reservationIcon = `<svg class="orc-section-icon orc-info-icon--reservations" width="13" height="13" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#243AA3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-12 3 6 5m0-5-6 5"/></svg>`;
const tagIcon = `<svg class="orc-section-icon orc-info-icon--fares" width="13" height="13" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#243AA3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 4h9l9 9-8 8-10-10z"/><circle cx="7.5" cy="8" r="1"/></svg>`;
const defaultFooterItems = [
  { text: defaultQuoteFooter.exchange, icon: financialIcon },
  { text: defaultQuoteFooter.children, icon: childIcon },
  { text: defaultQuoteFooter.estimate, icon: infoIcon },
  { text: defaultQuoteFooter.reservations, icon: reservationIcon },
  { text: defaultQuoteFooter.fares, icon: tagIcon }
];
const defaultFooterIcons = new Map(
  defaultFooterItems.map(({ text, icon }) => [normalizeText(text), icon])
);

const serviceIcons = new Map<string, [string, string]>([
  ['hotel', ['hotel', hotelIconShape]],
  ['aluguel_carro', ['car', carIconShape]],
  [
    'ingresso',
    ['ticket', '<path d="M3 8V5h18v3a3 3 0 0 0 0 6v3H3v-3a3 3 0 0 0 0-6zm9-2v2m0 2v2m0 2v2"/>']
  ],
  ['trem', ['train', trainIconShape]],
  [
    'passeio',
    [
      'tour',
      '<path d="M12 22s-7-6-7-12a7 7 0 1 1 14 0c0 6-7 12-7 12z"/><circle cx="12" cy="10" r="2"/>'
    ]
  ],
  [
    'transfer',
    [
      'transfer',
      '<rect x="4" y="4" width="16" height="14" rx="2"/><path d="M4 11h16M7 18v2m10-2v2M7 15h2m6 0h2"/>'
    ]
  ],
  [
    'show',
    [
      'show',
      '<path d="M10 17V5l9-2v12M10 8l9-2"/><ellipse cx="7" cy="18" rx="3" ry="2"/><ellipse cx="16" cy="16" rx="3" ry="2"/>'
    ]
  ],
  ['seguro', ['insurance', '<path d="M12 3 20 6v5c0 5-3 8-8 10-5-2-8-5-8-10V6zM9 12l2 2 4-4"/>']],
  ['pacote', ['package', '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>']]
]);

function serviceIconSvg(type: string) {
  const iconType = type === 'hospedagem' ? 'hotel' : type === 'seguro_viagem' ? 'seguro' : type;
  const flight = iconType === 'passagem' || iconType === 'passagem-section';
  const [name, shape] = flight
    ? ['flight', planeIconShape]
    : (serviceIcons.get(iconType) ?? [
        'service',
        '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 13h18m-10 0v2h2v-2"/>'
      ]);
  const section =
    iconType === 'passagem-section' ? ' orc-section-icon orc-section-icon--flight' : '';
  return `<svg class="orc-service-icon orc-service-icon--${name}${section}" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#243AA3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shape}</svg>`;
}

function renderServiceLabel(label: string) {
  return `<span class="orc-service-label"><span>${escHtml(label)}</span></span>`;
}

function renderQuoteCityTitle(city: string) {
  return `<div class="roteiro-card-city">${escHtml(nomeCidadeNoPdf(city))}</div>`;
}

export function renderQuoteItemsForScreen(items: QuoteItemForPdf[], currency: string) {
  const rows = items
    .map((item) => {
      if (normalizeText(item.item_type) === 'trem' || isFlightQuoteItem(item)) {
        return getFlightDataList(item).length
          ? renderFlightItemHtml(item, true, currency, true)
          : renderServiceItem(item, true, currency, true, true);
      }
      if (isCircuitQuoteItem(item)) return renderCircuitItemHtml(item, true, currency, true);
      return renderServiceItem(item, true, currency, false, true);
    })
    .join('');
  return `<table class="table-mobile-cards w-full">
    <thead><tr class="border-b border-slate-200">
      <th class="px-3 py-3 text-left text-sm font-semibold text-slate-600">Cidade</th>
      <th class="px-3 py-3 text-left text-sm font-semibold text-slate-600">Serviço</th>
      <th class="px-3 py-3 text-left text-sm font-semibold text-slate-600">Descrição / Detalhes</th>
      <th class="px-3 py-3 text-right text-sm font-semibold text-slate-600">Valor Unit.</th>
      <th class="px-3 py-3 text-center text-sm font-semibold text-slate-600">Qtd</th>
      <th class="px-3 py-3 text-right text-sm font-semibold text-slate-600">Total</th>
    </tr></thead>
    <tbody class="divide-y divide-slate-100">${rows}</tbody>
  </table>`;
}

function renderScreenItemRow(
  item: QuoteItemForPdf,
  service: string,
  content: string,
  quantity: string,
  defaultCurrency: string
) {
  const currency = item.currency || defaultCurrency;
  const type = normalizeText(item.item_type);
  const iconType = isFlightQuoteItem(item) && type !== 'trem' ? 'passagem' : type;
  return `<tr class="hover:bg-slate-50">
    <td data-label="Cidade" class="px-3 py-3 text-slate-900">${escHtml(nomeCidadeNoPdf(textVal(item.city_name)) || '—')}</td>
    <td data-label="Serviço" class="px-3 py-3 text-slate-700"><div class="quote-service">${serviceIconSvg(iconType)}<span>${escHtml(service)}</span></div></td>
    <td data-label="Descrição / Detalhes" class="px-3 py-3 text-slate-900"><div>${content}</div></td>
    <td data-label="Valor Unit." class="px-3 py-3 text-right text-slate-700">${escHtml(formatCurrency(Number(item.unit_price ?? 0), currency))}</td>
    <td data-label="Qtd" class="px-3 py-3 text-center text-slate-700">${escHtml(quantidadeExibida(quantity))}</td>
    <td data-label="Total" class="px-3 py-3 text-right font-medium text-slate-900">${escHtml(formatCurrency(Number(item.total_amount ?? 0), currency))}</td>
  </tr>`;
}

function renderDetalhesItem(item: QuoteItemForPdf) {
  return resumoDetalhes(item)
    .map((detalhe) => {
      const separator = detalhe.indexOf(':');
      return printCardField(detalhe.slice(0, separator), detalhe.slice(separator + 1).trim());
    })
    .join('');
}

function renderPeriodoItem(item: QuoteItemForPdf) {
  const inicio = formatRoteiroDate(item.start_date);
  const fim = formatRoteiroDate(item.end_date);
  const periodo = inicio && fim && inicio !== fim ? `${inicio} a ${fim}` : inicio || fim;
  return periodo ? printCardField('Data', periodo) : '';
}

function renderFlightItemHtml(
  item: QuoteItemForPdf,
  showItemValues: boolean,
  defaultCurrency: string,
  showUnitValue = false
) {
  const flights = getFlightDataList(item).map((data) => {
    const trecho = splitTrechoCities(String(data.trecho || ''));
    const origem = String(data.cidade_saida || trecho.origem || '');
    const destino = String(data.cidade_chegada || trecho.destino || '');
    return {
      trecho: String(data.trecho || ''),
      cidade_saida: nomeCidadeNoPdf(origem),
      cidade_chegada: nomeCidadeNoPdf(destino),
      cia_aerea: String(data.cia_aerea || ''),
      descricao: String(data.numero_voo || data.descricao || ''),
      tipo_voo: String(data.tipo_voo || ''),
      data_inicio: String(data.data_inicio || ''),
      data_fim: String(data.data_fim || ''),
      data_voo: String(data.data_voo || ''),
      classe_reserva: String(data.classe_reserva || ''),
      hora_saida: String(data.hora_saida || ''),
      aeroporto_saida: String(data.aeroporto_saida || ''),
      duracao_voo: String(data.duracao_voo || ''),
      hora_chegada: String(data.hora_chegada || ''),
      aeroporto_chegada: String(data.aeroporto_chegada || ''),
      tarifa_nome: String(data.tarifa_nome || ''),
      assentos: String(data.assentos || '')
    };
  });
  if (flights.length === 0) return renderGenericItemHtml(item, showItemValues, defaultCurrency);
  const amount = Number(item.total_amount ?? 0);
  const taxes = Number(item.taxes_amount ?? 0);
  const currency = item.currency || defaultCurrency;
  const tituloOriginal = textVal(item.title || item.product_name);
  const title = formatarDescricaoItem(item.item_type || '', tituloOriginal);
  const isTrain = normalizeText(item.item_type) === 'trem';
  const service = isTrain ? 'Trem' : 'Passagem Aérea';
  const quantityLabel = formatFlightQuantity(item);
  const distinct = (values: string[]) =>
    Array.from(
      new Map(
        values
          .map((value) => textVal(value))
          .filter(Boolean)
          .map((value) => [normalizeText(value), value])
      ).values()
    );
  const carriers = distinct(flights.map((flight) => flight.cia_aerea));
  const fareDetails = distinct(
    flights
      .map((flight) =>
        [textVal(flight.classe_reserva), isTrain ? '' : textVal(flight.tarifa_nome)]
          .filter(Boolean)
          .join(' | ')
      )
      .filter(Boolean)
  );
  const segments = flights
    .map((flight) => {
      const routeText = textVal(flight.trecho);
      const routeParts = splitTrechoCities(routeText);
      const route = [
        textVal(flight.aeroporto_saida) || routeParts.origem || flight.cidade_saida,
        textVal(flight.aeroporto_chegada) || routeParts.destino || flight.cidade_chegada
      ]
        .filter(Boolean)
        .map((place) => (isTrain ? nomeCidadeNoPdf(place) : place))
        .join(' → ');
      const departureDate = formatRoteiroDate(flight.data_voo || flight.data_inicio);
      const offsetDays = diffDaysISODate(
        flight.data_voo || flight.data_inicio,
        flight.data_fim || flight.data_voo || flight.data_inicio
      );
      const arrivalTime = [
        textVal(flight.hora_chegada).replace(/\s*\(\+\d+\)\s*$/, ''),
        offsetDays ? `(${offsetDays > 0 ? '+' : ''}${offsetDays})` : ''
      ]
        .filter(Boolean)
        .join(' ');
      const times = [
        textVal(flight.hora_saida) && arrivalTime
          ? `${textVal(flight.hora_saida).replace(/\s*\(\+\d+\)\s*$/, '')} / ${arrivalTime}`
          : textVal(flight.hora_saida).replace(/\s*\(\+\d+\)\s*$/, '') || arrivalTime
      ].filter(Boolean);
      return [
        route,
        textVal(flight.descricao),
        departureDate,
        ...times,
        isTrain && textVal(flight.assentos) ? `Assentos: ${textVal(flight.assentos)}` : ''
      ]
        .filter(Boolean)
        .join(' - ');
    })
    .filter(Boolean);
  const serviceDetails = [...getPassengerDetails(item), ...fareDetails].join(' | ');
  const content = `<div class="orc-flight-row-details">
    ${carriers.length ? `<strong>${carriers.map(escHtml).join(' / ')}</strong>` : ''}
    ${title ? `<div>${escHtml(title)}</div>` : ''}
    ${segments.map((segment) => `<div class="orc-flight-segment">${escHtml(segment)}</div>`).join('')}
    ${serviceDetails ? `<div class="orc-service-details">${escHtml(serviceDetails)}</div>` : ''}
    ${showItemValues && taxes > 0 ? `<div class="orc-service-details">Taxas: ${escHtml(formatCurrency(taxes, currency))}</div>` : ''}
  </div>`;
  if (showUnitValue) return renderScreenItemRow(item, service, content, quantityLabel, currency);
  const iconType = isTrain ? 'trem' : 'passagem';
  const roundTrip =
    flights.length === 2 &&
    normalizeText(flights[0].aeroporto_chegada || flights[0].cidade_chegada) ===
      normalizeText(flights[1].aeroporto_saida || flights[1].cidade_saida) &&
    normalizeText(flights[0].aeroporto_saida || flights[0].cidade_saida) ===
      normalizeText(flights[1].aeroporto_chegada || flights[1].cidade_chegada);
  const legs = flights
    .map((flight, index) => {
      const fromCode = textVal(flight.aeroporto_saida);
      const toCode = textVal(flight.aeroporto_chegada);
      const fromCity = cidadeDoTrecho(flight.cidade_saida, fromCode);
      const toCity = cidadeDoTrecho(flight.cidade_chegada, toCode);
      const from = siglaDoTrecho(fromCode, flight.cidade_saida, isTrain);
      const to = siglaDoTrecho(toCode, flight.cidade_chegada, isTrain);
      const date = formatDateBR(flight.data_voo || flight.data_inicio);
      const kind = isTrain ? 'TREM' : 'AÉREO';
      const sentido = roundTrip ? (index === 0 ? 'IDA' : 'VOLTA') : '';
      const label = [kind, sentido, date && date !== '-' ? date : ''].filter(Boolean).join(' · ');
      const offset = atrasoChegada(flight);
      const plus = offset > 0 ? `<span class="p1">+${offset}</span>` : '';
      const depart = textVal(flight.hora_saida).replace(/\s*\(\+\d+\)\s*$/, '');
      const arrive = textVal(flight.hora_chegada).replace(/\s*\(\+\d+\)\s*$/, '');
      const carrier = isTrain
        ? [textVal(flight.cia_aerea), textVal(flight.descricao)].filter(Boolean).join(' · ')
        : textVal(flight.cia_aerea);
      const nomeTrecho =
        isTrain && index === 0 && tituloOriginal
          ? `<div style="margin-bottom:10px"><b>${escHtml(tituloOriginal)}</b></div>`
          : '';
      const saida = depart ? `<span class="mu">${escHtml(depart)}</span>` : '';
      const chegada =
        arrive || plus ? `<span class="mu">${escHtml(arrive)}${plus ? ` ${plus}` : ''}</span>` : '';
      const dataSaida = date && date !== '-' ? date : '';
      const dataChegadaBr = formatDateBR(flight.data_fim || flight.data_voo || flight.data_inicio);
      const dataChegadaOk = dataChegadaBr && dataChegadaBr !== '-' ? dataChegadaBr : '';
      const origemInfo = [fromCity, dataSaida].filter(Boolean).join(' – ');
      const destinoInfo = [toCity, dataChegadaOk].filter(Boolean).join(' – ');
      const rota =
        from || to || depart || arrive
          ? isTrain
            ? `<div class="rt rota">${escHtml(from)} ${saida}${traco(24)}${escHtml(to)} ${chegada}</div>`
            : `<div class="rtf"${index ? ' style="margin-top:16px"' : ''}><span class="lg"><span><b>${escHtml(from)}</b>${depart ? ` <span class="mu">· ${escHtml(depart)}</span>` : ''}</span>${origemInfo ? `<span class="ct">${escHtml(origemInfo)}</span>` : ''}</span><span class="md">${textVal(flight.descricao) ? `<span>${escHtml(textVal(flight.descricao))}</span>` : ''}${traco(36)}${textVal(flight.cia_aerea) ? `<span>${escHtml(textVal(flight.cia_aerea))}</span>` : ''}</span><span class="lg"><span><b>${escHtml(to)}</b>${arrive ? ` <span class="mu">· ${escHtml(arrive)}</span>` : ''}${plus ? ` ${plus}` : ''}</span>${destinoInfo ? `<span class="ct">${escHtml(destinoInfo)}</span>` : ''}</span></div>`
          : '';
      const meta = (() => {
        if (isTrain)
          return `${index ? '<div class="lb" style="margin-top:8px">' : '<div class="lb">'}${escHtml(label)}</div>`;
        if (rota) return '';
        const cia = [textVal(flight.cia_aerea), 'Voo'].filter(Boolean).map(escHtml).join(' · ');
        const voo = [textVal(flight.descricao), dataSaida].filter(Boolean).map(escHtml).join(' · ');
        const cabecalho = `${cia}${voo ? ` ${traco(24)} ${voo}` : ''}`;
        return `${index ? '<div class="lb" style="margin-top:16px">' : '<div class="lb">'}${cabecalho}</div>`;
      })();
      return isTrain
        ? `${nomeTrecho}${meta}${rota}${carrier ? `<div class="mu sm">${escHtml(carrier)}</div>` : ''}`
        : `${meta}${rota}`;
    })
    .join('');
  const tags = etiquetas([
    ...distinct(flights.map((flight) => flight.classe_reserva)),
    ...(isTrain ? [] : distinct(flights.map((flight) => flight.tarifa_nome))),
    ...(isTrain ? [] : [passageirosSemZero(item)]),
    ...distinct(flights.map((flight) => (flight.assentos ? `Assentos ${flight.assentos}` : '')))
  ]);
  const nome =
    !isTrain && title ? `<div style="margin-bottom:10px"><b>${escHtml(title)}</b></div>` : '';
  return `<div class="row orc-city-item${showItemValues ? '' : ' orc-row--sem-valor'}"><div>${serviceIconSvg(iconType === 'passagem' ? 'passagem-section' : iconType)}</div><div>${nome}${legs}${tags}</div><div class="q orc-quantity">${escHtml(quantidadeExibida(quantityLabel))}</div>${showItemValues ? `<div class="v">${escHtml(formatCurrency(amount, currency))}</div>` : ''}</div>`;
}

function renderCircuitItemHtml(
  item: QuoteItemForPdf,
  showItemValues: boolean,
  defaultCurrency: string,
  showUnitValue = false
) {
  const label = textVal(item.title || item.product_name || item.item_type || 'Circuito');
  const city = nomeCidadeNoPdf(textVal(item.city_name));
  const amount = Number(item.total_amount ?? 0);
  const currency = item.currency || defaultCurrency;
  const days = getCircuitDaySegments(item);

  let daysHtml = '';
  for (const [index, seg] of days.entries()) {
    const data = asRecord(seg.data);
    const diaValue = Number(data.dia ?? index + 1);
    const diaNumero = Number.isFinite(diaValue) && diaValue > 0 ? diaValue : index + 1;
    const titulo = textVal(String(data.titulo || ''));
    const descricao = textVal(String(data.descricao || ''));
    const dayTitle = titulo ? `Dia ${diaNumero} - ${titulo}` : `Dia ${diaNumero}`;
    daysHtml += `<div class="orc-circuit-day">
      <h3>${escHtml(dayTitle)}</h3>
      ${descricao ? `<p>${escHtml(descricao).replace(/\n/g, '<br/>')}</p>` : ''}
    </div>`;
  }

  if (showUnitValue) {
    const content = `<strong>${escHtml(label)}</strong>${renderPeriodoItem(item)}${renderDetalhesItem(item)}${daysHtml}`;
    return renderScreenItemRow(item, 'Circuito', content, String(item.quantity ?? '-'), currency);
  }

  return `<article class="roteiro-card${requiresPrintContinuation(daysHtml) ? ' roteiro-card--long' : ''}">
    ${city ? renderQuoteCityTitle(city) : ''}
    <h3>${escHtml(label)}</h3>
    ${renderPeriodoItem(item)}
    ${renderDetalhesItem(item)}
    ${daysHtml}
    ${showItemValues ? printCardField('Valor', formatCurrency(amount, currency)) : ''}
  </article>`;
}

function renderAllItemsTableHtml(
  items: QuoteItemForPdf[],
  showItemValues: boolean,
  defaultCurrency: string
) {
  if (items.length === 0) return '';

  let rowsHtml = '';
  for (const item of items) {
    const label = formatarDescricaoItem(
      item.item_type || '',
      textVal(item.title || item.product_name || item.item_type || 'Item')
    );
    const type = isFlightQuoteItem(item) ? 'Passagem Aérea' : textVal(item.item_type || 'servico');
    const qty =
      isFlightQuoteItem(item) || normalizeText(item.item_type) === 'trem'
        ? getFlightPassengerQuantity(item)
        : Number(item.quantity ?? 1);
    const quantity = formatLodgingOrCarQuantity(item) ?? String(Number.isFinite(qty) ? qty : 1);
    const unit = Number(item.unit_price ?? 0);
    const total = Number(item.total_amount ?? 0);
    const currency = item.currency || defaultCurrency;
    rowsHtml += `<tr>
      <td>${escHtml(label)}</td>
      <td>${escHtml(type)}</td>
      <td class="text-right">${escHtml(quantity)}</td>
      ${showItemValues ? `<td class="text-right">${escHtml(formatCurrency(unit, currency))}</td>` : ''}
      ${showItemValues ? `<td class="text-right">${escHtml(formatCurrency(total, currency))}</td>` : ''}
    </tr>`;
  }

  return `<div class="orc-section-card">
    <div class="orc-section-title orc-section-title--blue">Itens do orçamento</div>
    <div class="orc-section-divider"></div>
    <div class="orc-items-table-wrap">
      <table class="orc-items-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Tipo</th>
            <th class="text-right">Qtd</th>
            ${showItemValues ? '<th class="text-right">Valor Unit.</th>' : ''}
            ${showItemValues ? '<th class="text-right">Total</th>' : ''}
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  </div>`;
}

function renderFinancialSummary(
  items: QuoteItemForPdf[],
  currency: string,
  discount: number,
  showItemValues: boolean
) {
  const totals = totaisDaViagem(items, currency, discount);
  const discountNotice =
    discount > 0 && !totals.some((entry) => entry.code === currency)
      ? `<p class="orc-summary-note">Desconto informado em ${escHtml(currency)} não aplicado: não há itens nessa moeda.</p>`
      : '';
  const cards = totals
    .map(({ code, group, appliedDiscount, total }) => {
      const detail = showItemValues
        ? `· Aéreo ${formatCurrency(group.flights, code)} + Serviços ${formatCurrency(group.services + group.taxes, code)}${appliedDiscount ? ` · desconto ${formatCurrency(appliedDiscount, code)}` : ''}`
        : '';
      return `<div class="card tot" style="padding:12px 14px;background:#EEF2F7"><span>Total da viagem${detail ? ` <span class="mu" style="font-size:8.5pt;font-weight:normal">${escHtml(detail)}</span>` : ''}</span><span>${escHtml(formatCurrency(total, code))}</span></div>`;
    })
    .join('');
  return `<section class="orc-financial-section">${cards}${discountNotice}</section>`;
}

// ---------------------------------------------------------------------------
// BUILDER DO HTML
// ---------------------------------------------------------------------------

export function buildQuotePreviewHtmlSync(params: {
  quote: QuoteForPdf;
  items: QuoteItemForPdf[];
  settings: QuotePdfSettings;
  qrUrl: string | null;
  complementUrl: string | null;
  showBudgetItems: boolean;
  showBudgetDetails: boolean;
  showItemValues: boolean;
  showHeader?: boolean;
  discount?: number;
}): string {
  const {
    quote,
    items,
    settings,
    qrUrl,
    complementUrl,
    showBudgetItems,
    showBudgetDetails,
    showItemValues,
    showHeader = true,
    discount = 0
  } = params;

  const safeDiscount = Math.max(Number.isFinite(discount) ? discount : 0, 0);
  const currency = quote.currency || 'BRL';

  const dateLabel = formatDateBR(quote.created_at);
  const clientName = textVal(quote.client_name) || 'Cliente';
  const dates = items
    .flatMap((item) => [
      item.start_date,
      item.end_date,
      ...getFlightDataList(item).flatMap((flight) => [
        typeof flight.data_voo === 'string' ? flight.data_voo : null,
        typeof flight.data_inicio === 'string' ? flight.data_inicio : null,
        typeof flight.data_fim === 'string' ? flight.data_fim : null
      ])
    ])
    .map((date) => parseISODateParts(date)?.iso)
    .filter((date): date is string => Boolean(date))
    .sort();
  const period = dates.length ? faixaDatas(dates[0], dates[dates.length - 1]) : '';
  const cities = Array.from(
    new Set(items.map((item) => nomeCidadeNoPdf(textVal(item.city_name))).filter(Boolean))
  );
  const validity = formatDateBR(quote.valid_until);

  const consultor = textVal(settings.consultor_nome);
  const primeiroNome = consultor.split(/\s+/)[0] || '';
  const contatos = [textVal(settings.telefone), textVal(settings.whatsapp), textVal(settings.email)]
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .join(' · ');

  const footerText = textVal(settings.rodape_texto);
  const hasChildren = items.some((item) => (lerDetalhes(item).criancas || 0) > 0);
  const footerLines = footerText
    ? footerText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((text) => ({ text, icon: defaultFooterIcons.get(normalizeText(text)) || infoIcon }))
    : defaultFooterItems.filter(({ text }) => hasChildren || text !== defaultQuoteFooter.children);
  let footerLinesHtml = '';
  for (const line of footerLines) {
    footerLinesHtml += `<li${requiresPrintContinuation(line.text) ? ' class="orc-footer-item--long"' : ''}>${line.icon}<span>${escHtml(line.text)}</span></li>`;
  }

  // Cabeçalho
  const headerHtml = `
    <div class="card"><div class="hd"><img src="${VTUR_LOGO_URL}" alt="VTur" /><div class="c">${consultor ? `<b style="color:#1B2C80;font-size:10pt">${escHtml(consultor)}</b> · ` : ''}Consultor de viagens${contatos ? `<br><span class="mu">${escHtml(contatos)}</span>` : ''}</div></div></div>`;

  const ctaHtml = `<div class="cta">${qrUrl ? `<img src="${escHtml(qrUrl)}" alt="QR Code WhatsApp" />` : ''}<div><b>Reserve com o ${escHtml(primeiroNome || 'consultor')}</b><br><span>Aponte a câmera para o QR Code e fale no WhatsApp.${validity ? ` Tarifas válidas até ${escHtml(validity)}.` : ''}</span></div></div>`;

  const titleHtml = `
    <div class="card orc-title-card"><div class="orc-title-main"><h1 style="margin:0 0 2px">Proposta de viagem</h1><div class="mu">Para: <b style="color:#1F2937">${escHtml(clientName)}</b></div>${cities.length ? `<div class="mu">Cidades: <b style="color:#1F2937">${escHtml(cities.join(' e '))}</b></div>` : ''}</div>${ctaHtml}</div>`;

  const viajantes = passageirosDoOrcamento(items);
  const totalFaixa = totalDaFaixa(items, currency, safeDiscount);
  const bandHtml = `
    <div class="band">
      <div><b>PERÍODO</b><span>${escHtml(period || '—')}</span></div>
      <div><b>VIAJANTES</b><span>${escHtml(viajantes || '—')}</span></div>
      <div><b>EMISSÃO</b><span>${escHtml(dateLabel || '—')}</span></div>
      <div class="val"><b>VALIDADE</b><span>${escHtml(validity || '—')}</span></div>
      <div class="tt"><b>TOTAL</b><span>${escHtml(totalFaixa)}</span></div>
    </div>`;

  // Itens
  let itensHtml = '';
  if (items.length === 0) {
    itensHtml = '<div class="orc-empty">Sem itens neste orçamento.</div>';
  } else {
    const sections = orderQuoteSections(items);
    if (showBudgetItems) {
      itensHtml += renderAllItemsTableHtml(items, showItemValues, currency);
    }
    if (showBudgetDetails) {
      itensHtml += renderGroupedItems(sections, showItemValues, currency);
    }
    if (!showBudgetItems && !showBudgetDetails) {
      itensHtml = '';
    }
  }

  // Rodapé
  const footerHtml = `
    <div class="card inf orc-footer-card">
      <b style="color:#1B2C80;font-size:9pt">Informações importantes</b>
      <ul class="orc-footer-list">${footerLinesHtml}</ul>
      ${complementUrl ? `<div class="orc-complement-img"><img src="${escHtml(complementUrl)}" alt="Imagem complementar" /></div>` : ''}
    </div>`;

  const css = `
    *, *::before, *::after { box-sizing: border-box; }
    html, body, body * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; background: #fff; color: #1F2937; font-size: 9.4pt; }
    .pg { padding: 9mm 13mm 6mm; }
    .mu { color: #6B7280; }
    .card { border: 1.5px solid #C5CED9; border-radius: 12px; padding: 11px 14px; margin-bottom: 8px; break-inside: avoid; background: #fff; }
    .hd { display: flex; justify-content: space-between; align-items: center; }
    .hd img { height: 40px; }
    .hd .c { text-align: right; font-size: 8.3pt; line-height: 1.5; }
    .hd .c b { color: #1B2C80; font-size: 10pt; }
    h1 { font-size: 17pt; color: #1B2C80; margin: 14px 0 2px; }
    .rt .mu { font-weight: normal; }
    .mu.sm, .lg .ct { font-size: 8pt; font-weight: normal; }
    .sh .l { display: flex; gap: 8px; align-items: center; }
    .inf { font-size: 7.8pt; color: #4B5563; line-height: 1.5; }
    .inf p { margin: 0 0 4px; }
    .orc-footer-list { display: block; gap: 0; margin: 4px 0 0; padding: 0; list-style: none; font-size: 7.9pt; line-height: 1.35; color: inherit; }
    .orc-footer-list li, .ii { display: flex; gap: 8px; align-items: center; padding: 2px 0; margin-top: 1px; background: transparent; border: 0; font-size: 7.9pt; line-height: 1.35; }
    .orc-footer-list svg, .ii svg { flex: 0 0 auto; }
    .chks { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 14px; margin-top: 6px; }
    .chk { display: flex; align-items: center; gap: 6px; color: #1B2C80; font-size: 7.5pt; }
    .chk svg { flex: 0 0 auto; }
    .lb { color: #6B7280; font-size: 7.5pt; font-weight: bold; }
    .rt { display: flex; align-items: center; gap: 6px; font-weight: bold; }
    .lg { display: inline-flex; flex-direction: column; min-width: 0; max-width: 100%; overflow: hidden; }
    .lg .ct { color: #6B7280; white-space: nowrap; overflow-wrap: normal; }
    .md { display: inline-flex; flex-direction: column; align-items: center; color: #6B7280; font-size: 6pt; font-weight: normal; justify-self: center; }
    .rtf { display: grid; grid-template-columns: minmax(0, 130px) minmax(12px, 64px) minmax(0, 1fr); justify-content: start; align-items: center; column-gap: 6px; font-weight: bold; width: 100%; max-width: 100%; min-width: 0; }
    .rtf.car { grid-template-columns: minmax(0, max-content) minmax(8px, 1fr) minmax(0, max-content); align-items: start; }
    .rtf.car .lg, .rtf.rota .lg { max-width: none; }
    .rtf.car .lg > span:first-child,
    .rtf.rota .lg > span:first-child,
    .rt.rota,
    .rt.rota .mu { white-space: nowrap; overflow-wrap: normal; }
    .rtf > .lg:last-child { margin-left: 22px; }
    .rtf.rota { grid-template-columns: minmax(0, max-content) minmax(8px, 1fr) minmax(0, max-content); align-items: center; width: 100%; max-width: 100%; min-width: 0; }
    .rtf.car.rota { align-items: start; }
    .rtf.rota > .lg:first-child { margin-right: 22px; }
    .rtf.rota > .lg:last-child { margin-left: 22px; }
    .rt.rota { gap: 22px; font-size: 8.4pt; font-weight: bold; }
    .rt.rota { max-width: 100%; min-width: 0; overflow: hidden; }
    .rt.rota .lni, .rtf .md { min-width: 0; flex: 0 1 48px; }
    .md .ln { max-width: 100%; }
    .lb > .lni { margin-inline: 22px; }
    .lni { display: inline-flex; align-items: center; gap: 4px; min-height: 12px; }
    .ln { display: inline-block; vertical-align: middle; border-top: 1.3px solid #243AA3; }
    .md .lni { margin: 2px 0; }
    .p1 { color: #C62828; font-weight: 700; font-size: 6.5pt; vertical-align: super; margin-left: 1px; letter-spacing: 0.2px; }
    .tot { display: flex; justify-content: space-between; align-items: center; font-size: 12pt; font-weight: bold; color: #1B2C80; }
    .orc-title-card { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
    .orc-title-main { min-width: 0; }
    .cta { background: #fff; color: #1F2937; border: 1.5px solid #C5CED9; border-radius: 10px; padding: 6px 10px; display: flex; gap: 8px; align-items: center; flex: none; max-width: 250px; height: auto; min-height: 0; line-height: 1.35; }
    .cta b { color: #1B2C80; font-size: 8.5pt; }
    .cta span { color: #4B5563; font-size: 7.2pt; }
    .cta img { height: 44px; background: #fff; border-radius: 6px; padding: 2px; }
    .shell { max-width: 900px; margin: 0 auto; padding: 24px; }
    .toolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; padding: 12px 0 16px 0; background: #f8fafc; z-index: 10; }
    .toolbar button { border: 0; border-radius: 999px; padding: 10px 20px; background: #0f766e; color: white; font-size: 14px; cursor: pointer; font-weight: 600; }
    .toolbar button:hover { background: #0d6460; }

    /* Header */
    .orc-header-card { background: white; border: 1.5px solid #C5CED9; border-radius: 12px; padding: 12px 14px; margin: 0 0 12px 0; }
    .orc-header-table { width: 100%; border-collapse: separate; border-spacing: 0; }
    .orc-header-left { width: 52%; vertical-align: top; }
    .orc-header-right { width: 48%; vertical-align: top; }
    .orc-header-right-inner { width: 100%; border-collapse: separate; border-spacing: 0; }
    .orc-logo { max-width: 120px; max-height: 56px; width: auto; height: auto; object-fit: contain; display: block; }
    .orc-header-copy { font-size: 11px; color: #0f172a; margin: 8px 0 0 0; }
    .orc-right-lines { font-size: 11px; color: #334155; vertical-align: top; }
    .orc-qr-label { font-size: 9px; color: #475569; margin: 0 0 5px 0; }
    .orc-qr-cell { vertical-align: top; text-align: right; }
    .orc-qr { width: 66px; height: 66px; }
    .orc-header-divider { height: 1px; background: #dbe3f0; margin: 10px 0 0 0; }

    /* Título */
    .orc-title-row { background: white; border: 1.5px solid #C5CED9; border-radius: 12px; padding: 16px; }
    .orc-title-row { margin: 0 0 16px 0; }
    .orc-title-kicker { color: #243aa3; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
    .orc-title { font-size: 21px; font-weight: 700; color: #243aa3; line-height: 1.2; margin-top: 4px; }
    .orc-title-meta { color: #334155; font-size: 12px; line-height: 1.5; margin-top: 5px; }
    .orc-title-dates { white-space: nowrap; }

    /* Seção genérica */
    .orc-section-card { background: white; border: 1.5px solid #C5CED9; border-radius: 12px; padding: 12px 14px; margin: 0 0 12px 0; }
    .orc-section-title { font-size: 13px; font-weight: 700; margin: 0 0 6px 0; }
    .orc-section-title--blue { color: #1d4ed8; }
    .orc-section-divider { height: 1px; background: #e2e8f0; margin: 0 0 10px 0; }

    /* Itens */
    .orc-item-row { padding: 6px 0; }
    .orc-item-label { font-size: 12px; font-weight: 600; color: #0f172a; }
    .orc-item-meta { font-size: 11px; color: #64748b; margin: 2px 0 0 0; }
    .orc-item-value { font-size: 11px; color: #0f172a; margin: 2px 0 0 0; text-align: right; }
    .orc-item-divider { height: 1px; background: #f1f5f9; margin: 2px 0; }
    .orc-circuit-day { margin: 14px 0 0 0; }
    .orc-items-table-wrap { border: 1.5px solid #C5CED9; border-radius: 8px; overflow: hidden; }
    .orc-items-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .orc-items-table th { background: #243aa3; color: white; text-align: left; padding: 7px 8px; border-bottom: 1px solid #d9e2ec; }
    .orc-items-table td { padding: 7px 8px; border-bottom: 1px solid #eef2f7; color: #0f172a; }
    .orc-items-table tbody tr:last-child td { border-bottom: 0; }
    .orc-items-table .text-right { text-align: right; }
    .orc-empty { font-size: 12px; color: #94a3b8; padding: 8px 0; }
    ${roteiroCardStyles}
    .roteiro-card { border: 1.5px solid #C5CED9; }
    .orc-city-section, .orc-financial-section { margin: 18px 0; }
    .orc-city-table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; font-family: Arial, sans-serif; font-size: 12px; overflow-wrap: anywhere; }
    .orc-city-table th, .orc-city-table td { border: 0; text-align: left; vertical-align: top; }
    .orc-city-table thead th { background: #243aa3; color: white; font-weight: 700; }
    .orc-city-table thead tr:not(:first-child) th { text-transform: uppercase; }
    .orc-city-table thead .orc-city-heading { background: transparent; border: 0; padding: 0; }
    .orc-city-table thead .orc-financial-heading { background: transparent; border: 0; padding: 0; }
    .orc-city-heading .roteiro-card-city, .orc-table-section-title, .orc-financial-section h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; color: #112b4d; font: bold 18px Arial, sans-serif; }
    .roteiro-card .roteiro-card-city { display: flex; align-items: center; gap: 8px; }
    .orc-section-icon { width: 20px; height: 20px; flex: none; color: #243aa3; }
    .orc-city-table thead tr:nth-child(2) th { padding: 9px 10px; font-size: 11px; letter-spacing: .03em; }
    .orc-city-table thead tr:nth-child(2) th:first-child { border-radius: 6px 0 0 6px; }
    .orc-city-table thead tr:nth-child(2) th:last-child { border-radius: 0 6px 6px 0; }
    .orc-city-table tbody td { border-bottom: 1px solid #e2e8f0; padding: 11px 10px; line-height: 1.45; }
    .orc-city-table tbody tr:last-child td { border-bottom: 0; }
    .orc-city-table .orc-subtotal td { border-top: 1px solid #e2e8f0; }
    .orc-city-table .orc-value { text-align: right; }
    .orc-service-type { font-weight: 700; }
    .orc-service-label { display: flex; align-items: flex-start; gap: 6px; }
    .orc-service-icon { width: 16px; height: 16px; flex: none; color: #243aa3; }
    .orc-service-details { color: #475569; line-height: 1.5; margin-top: 4px; }
    .orc-subtotal { background: #edf2f7; color: #112b4d; font-weight: 700; }
    .orc-flight-segment + .orc-flight-segment { margin-top: 2px; }
    .orc-summary-note { color: #475569; font-size: 11px; }

    /* Rodapé */
    .orc-footer-card.inf { padding: 11px 14px; margin: 0; border: 1.5px solid #C5CED9; border-radius: 12px; background: #fff; }
    .orc-footer-list { display: block; margin: 4px 0 0; padding: 0; list-style: none; font-size: 7.9pt; color: inherit; }
    .orc-footer-list li { display: flex; align-items: center; gap: 8px; padding: 2px 0; margin-top: 1px; background: transparent; border: 0; line-height: 1.35; overflow-wrap: anywhere; }
    .band { margin: 0 0 8px; break-inside: avoid; display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr 1.3fr; border-radius: 12px; overflow: hidden; border: 1.5px solid #C5CED9; position: relative; }
    .band::after { content: ""; position: absolute; inset: -1.5px; border: 1.5px solid #C5CED9; border-radius: 12px; pointer-events: none; }
    .band > div { padding: 10px 12px; border-right: 1.5px solid #C5CED9; background: #fff; background-clip: padding-box; }
    .band > div:first-child { border-top-left-radius: 10.5px; border-bottom-left-radius: 10.5px; }
    .band b { display: block; font-size: 7pt; color: #6B7280; letter-spacing: 1px; margin-bottom: 3px; }
    .band span { font-weight: bold; color: #1B2C80; font-size: 9.5pt; }
    .band .tt { background: #243AA3; border: 0; border-top-right-radius: 10.5px; border-bottom-right-radius: 10.5px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .band .tt b { color: #fff; opacity: .75; }
    .band .tt span { color: #fff; font-size: 14pt; }
    .band .val span { color: #C62828; }
    .sec { border: 1.5px solid #C5CED9; border-radius: 12px; margin: 0 0 8px; overflow: hidden; break-inside: avoid; background: #fff; }
    .orc-city-section { background: #fff; border: 1.5px solid #C5CED9; border-radius: 12px; padding: 0; margin: 0 0 8px; overflow: hidden; }
    .orc-financial-section { background: transparent; border: 0; padding: 0; margin: 0; }
    .card.tot { background: #EEF2F7; border: 1.5px solid #C5CED9; color: #1B2C80; }
    .sh { background: #D0DAEA; display: grid; grid-template-columns: minmax(0, 1fr) 90px 90px; gap: 8px; align-items: center; width: 100%; margin: 0; padding: 8px 12px; font-weight: bold; color: #1B2C80; border-top-left-radius: 10.5px; border-top-right-radius: 10.5px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sh.sh--sem-valor { grid-template-columns: minmax(0, 1fr) 90px; }
    .sh .l { display: flex; gap: 8px; align-items: center; min-width: 0; }
    .sh-qtd { color: #6B7280; font-size: 7.5pt; font-weight: bold; letter-spacing: .04em; }
    .sh.sh--sem-valor .sh-qtd { text-align: right; }
    .sh > span:last-child:not(.sh-qtd) { color: #1B2C80; font-weight: bold; text-align: right; }
    .sh small { color: #6B7280; font-weight: normal; }
    .row { display: grid; grid-template-columns: 22px minmax(0, 1fr) 90px 90px; gap: 8px; padding: 6px 12px; border-top: 1px solid #EEF2F7; }
    .row.orc-row--sem-valor { grid-template-columns: 22px minmax(0, 1fr) 90px; }
    .row.orc-row--sem-valor .q { text-align: right; }
    .row > div { min-width: 0; white-space: normal; overflow-wrap: anywhere; }
    .row > div:nth-child(2) { min-width: 0; max-width: 100%; margin-right: 12mm; overflow: hidden; }
    .row strong, .orc-service-label, .orc-service-label span, .orc-flight-row-details, .orc-flight-segment { white-space: normal; overflow-wrap: anywhere; }
    .sh + .row { border-top: 0; }
    .q { color: #6B7280; font-size: 8.3pt; align-self: stretch; }
    .v, .orc-value { text-align: right; font-weight: bold; }
    .orc-subtotal { display: flex; justify-content: space-between; gap: 12px; padding: 8px 12px; background: #EEF2F7; font-weight: bold; color: #1B2C80; }
    .orc-footer-list .orc-section-icon { width: 13px; height: 13px; }
    .orc-complement-img { margin: 12px 0 0 0; text-align: center; }
    .orc-complement-img img { max-height: 170px; max-width: 100%; }
    .orc-validity-box { border: 1.5px solid #C5CED9; border-radius: 8px; margin: 10px 0 0 0; padding: 8px; text-align: center; }
    .orc-validity-client { font-size: 10px; color: #0f172a; }
    .orc-validity-date { font-size: 10px; color: #dc2626; margin: 3px 0 0 0; }

    @media screen and (max-width: 640px) {
      .orc-financial-section { overflow-x: auto; }
      .orc-city-table { min-width: 580px; }
    }

    @media print {
      @page { size: A4; margin: 13mm; }
      html, body, body * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { background: white; }
      .toolbar { display: none; }
      .shell { max-width: none; padding: 0; }
      .pg { padding: 0; }
      .card,
      .cta,
      .orc-city-section,
      .orc-section-card,
      .orc-footer-card,
      .band,
      .sec,
      .roteiro-card {
        break-inside: avoid;
        page-break-inside: avoid;
        overflow: visible;
      }
      .sh { background: #D0DAEA; color: #1B2C80; }
      .sh small { color: #6B7280; }
      .band .tt { color: #fff; }
      .band .tt { background: #243AA3; }
      .card.tot, .orc-subtotal { background: #EEF2F7; }
      .orc-header-card, .orc-title-row, .orc-section-card, .orc-city-section, .orc-financial-section { box-shadow: none; }
      .row, .row > div { overflow: visible; }
      .row > div:nth-child(2) { overflow: hidden; margin-right: 12mm; }
      .roteiro-card { break-inside: avoid; page-break-inside: avoid; }
      .orc-city-item { break-inside: auto; page-break-inside: auto; }
      .roteiro-card--long, .orc-city-item--long { break-inside: auto; page-break-inside: auto; }
      .orc-footer-list li { break-inside: avoid; page-break-inside: avoid; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .orc-footer-list .orc-footer-item--long { break-inside: auto; page-break-inside: auto; }
      .orc-city-table thead { display: table-header-group; }
      .orc-items-table th, .orc-city-table th, .orc-city-table .orc-subtotal, .orc-city-item:nth-child(even) { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Orçamento ${escHtml(clientName)}</title>
  <style>${css}</style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div>
  <div class="pg">
    ${showHeader ? headerHtml : ''}
    ${titleHtml}
    ${bandHtml}
    ${itensHtml}
    ${renderFinancialSummary(items, currency, safeDiscount, showItemValues)}
    ${footerHtml}
  </div>
</body>
</html>`;
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
  showHeader?: boolean;
  discount?: number;
}): Promise<void> {
  const {
    quoteId,
    dados,
    showBudgetItems = false,
    showBudgetDetails = true,
    showItemValues = true,
    showHeader = true,
    discount = 0
  } = params;

  const quoteRow = await apiFetch<QuotePreviewRow>(
    `/api/v1/orcamentos/${encodeURIComponent(quoteId)}`,
    {
      query: { preview_pdf: 1 },
      noCache: true,
      redirectOnForbidden: false,
      redirectOnUnauthorized: false
    }
  );
  const itemRows = quoteRow.itens;
  const pdfSettings = quoteRow.pdf_settings;

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
  const [, complementUrl, qrUrl] = await Promise.all([
    loadAirportCodeCityLookup(),
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
      valid_until: quoteRow.valid_until ?? null
    },
    items: itemRows,
    settings: pdfSettings,
    qrUrl,
    complementUrl,
    showBudgetItems,
    showBudgetDetails,
    showItemValues,
    showHeader,
    discount
  });

  // 9. Abre em nova aba
  const previewUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const opened = safeOpenNewTab(previewUrl, ['blob:']);
  setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
  if (!opened)
    throw new Error('Não foi possível abrir a prévia. Verifique o bloqueador de pop-up.');
}
