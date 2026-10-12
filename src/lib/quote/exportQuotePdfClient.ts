import { VTUR_LOGO_URL } from "$lib/brand";
/**
 * exportQuotePdfClient.ts — vtur-svelte
 *
 * Portabilizado de exportQuotePdfClient.ts + quotePdfModern.ts do vtur-app.
 * Gera o HTML de preview do orçamento com: logo, QR Code WhatsApp,
 * itens, resumo financeiro e rodapé.
 *
 * Usa o cliente Supabase browser para resolver URLs assinadas.
 */

import { construirLinkWhatsApp } from '$lib/whatsapp';
import { safeOpenNewTab } from '$lib/security/url';
import { formatISODateBR } from '$lib/date';
import type { User } from '@supabase/supabase-js';

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

type SupabaseQueryResult = PromiseLike<{ data: unknown; error?: { message?: string } | null }> & {
  eq: (column: string, value: unknown) => SupabaseQueryResult;
  in: (column: string, values: readonly string[]) => SupabaseQueryResult;
  order: (column: string, options: { ascending: boolean }) => SupabaseQueryResult;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error?: { message?: string } | null }>;
};

type SupabasePreviewStorage = {
  from: (bucket: string) => {
    download: (path: string) => Promise<{ data: Blob | null; error?: { message?: string } | null }>;
    createSignedUrl: (path: string, ttl: number) => Promise<{ data?: { signedUrl?: string } | null }>;
  };
};

type SupabasePreviewClient = {
  from: (table: string) => { select: (columns: string) => SupabaseQueryResult };
  auth: { getUser: () => Promise<{ data: { user: User | null } }> };
  storage: SupabasePreviewStorage;
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

function textVal(value?: string | null): string {
  return String(value ?? '').trim();
}

const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>();
const AIRLINE_IATA_CODE_RE = /^[A-Z0-9]{2,3}$/i;
const AIRPORT_IATA_CODE_RE = /^[A-Z]{3}$/;

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
  return formatter.format(value);
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
  for (const part of String(value || '').split(/\s+-\s+/)) {
    const trimmed = part.trim();
    if (trimmed) parts.push(trimmed);
  }
  return {
    origem: parts[0] || '',
    destino: parts[1] || ''
  };
}

function resolveAirlineIata(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (normalized.includes('lufthansa')) return 'LH';
  if (normalized.includes('latam')) return 'LA';
  if (normalized.includes('gol')) return 'G3';
  if (normalized.includes('azul')) return 'AD';
  if (normalized.includes('sky')) return 'H2';
  if (normalized.includes('tap')) return 'TP';
  if (normalized.includes('iberia')) return 'IB';
  if (normalized.includes('ita airways') || normalized.includes('ita')) return 'AZ';
  if (normalized.includes('air dolomiti')) return 'EN';
  if (normalized.includes('air france')) return 'AF';
  if (normalized.includes('klm')) return 'KL';
  if (normalized.includes('emirates')) return 'EK';
  if (normalized.includes('qatar')) return 'QR';
  if (normalized.includes('turkish')) return 'TK';
  const raw = String(value || '').trim();
  return AIRLINE_IATA_CODE_RE.test(raw) ? raw.toUpperCase() : raw.slice(0, 3).toUpperCase();
}

function formatFlightCity(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  for (const part of raw.split(/\s*-\s*/)) {
    const trimmed = part.trim();
    if (trimmed) return trimmed;
  }
  return raw;
}

function formatFlightPlace(city?: string | null, airport?: string | null) {
  const cityLabel = formatFlightCity(city);
  const airportLabel = String(airport || '').trim();
  if (airportLabel && (airportLabel.includes('(') || airportLabel.includes(' - ') || airportLabel.length > 3)) {
    return airportLabel;
  }
  const code = airportLabel.toUpperCase();
  if (cityLabel && AIRPORT_IATA_CODE_RE.test(code)) return `${cityLabel} (${code})`;
  if (cityLabel) return cityLabel;
  if (code) return code;
  return '-';
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
        data_inicio: asRecord(segment).data_inicio || asRecord(segment).data_voo || aereoImport.data_inicio,
        data_fim: asRecord(segment).data_fim || asRecord(segment).data_voo || aereoImport.data_fim
      }))
    : [];

  if (segmentos.length > 0) return segmentos;
  if (aereoImport.data_voo || aereoImport.hora_saida || aereoImport.aeroporto_saida) return [aereoImport];
  return [];
}

function buildFlightRows(item: QuoteItemForPdf) {
  const airlineLegend = new Map<string, string>();
  const rows = getFlightDataList(item).map((data) => {
    const trecho = splitTrechoCities(String(data.trecho || ''));
    const ciaCompleta = String(data.cia_aerea || '').trim();
    const cia = resolveAirlineIata(ciaCompleta) || ciaCompleta || 'AÉREO';
    if (ciaCompleta && cia && cia !== ciaCompleta.toUpperCase()) {
      airlineLegend.set(cia, ciaCompleta);
    }

    const origem = formatFlightPlace(
      String(data.cidade_saida || trecho.origem || ''),
      String(data.aeroporto_saida || '')
    );
    const destino = formatFlightPlace(
      String(data.cidade_chegada || trecho.destino || ''),
      String(data.aeroporto_chegada || '')
    );
    const horariosParts: string[] = [];
    for (const value of [data.hora_saida, data.hora_chegada]) {
      const trimmed = String(value || '').trim();
      if (trimmed) horariosParts.push(trimmed);
    }
    const horarios = horariosParts.join(' / ') || '-';

    return [
      cia,
      origem,
      formatDateBR(String(data.data_voo || data.data_inicio || '')),
      destino,
      formatDateBR(String(data.data_fim || data.data_voo || data.data_inicio || '')),
      horarios
    ];
  });

  return { rows, airlineLegend };
}

function isFlightQuoteItem(item: QuoteItemForPdf) {
  if (getFlightDataList(item).length > 0) return true;
  const normalized = normalizeText(`${item.item_type || ''} ${item.title || ''} ${item.product_name || ''}`);
  return normalized.includes('passagem') || normalized.includes('aereo') || normalized.includes('voo');
}

function getCircuitDaySegments(item: QuoteItemForPdf) {
  return (item.segments || [])
    .filter((segment) => segment.segment_type === 'circuit_day')
    .sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0));
}

function isCircuitQuoteItem(item: QuoteItemForPdf) {
  if (getCircuitDaySegments(item).length > 0) return true;
  const normalized = normalizeText(`${item.item_type || ''} ${item.title || ''} ${item.product_name || ''}`);
  return normalized.includes('circuito');
}

function extractStoragePath(url?: string | null): string | null {
  if (!url) return null;
  const marker = '/quotes/';
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

async function resolveStorageUrl(
  supabase: { storage: { from: (bucket: string) => { createSignedUrl: (path: string, ttl: number) => Promise<{ data?: { signedUrl?: string } | null }> } } },
  url?: string | null,
  path?: string | null
): Promise<string | null> {
  const storagePath = path || extractStoragePath(url);
  if (storagePath) {
    try {
      const { data } = await supabase.storage.from('quotes').createSignedUrl(storagePath, 3600);
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
 * Baixa uma imagem do Supabase Storage via SDK (.download) e converte para data URL.
 * Usa o SDK em vez de fetch externo — evita problemas de CORS com URLs assinadas.
 * Fallback: tenta fetch direto com a URL pública/assinada.
 */
async function storageImageToDataUrl(
  supabase: Pick<SupabasePreviewClient, 'storage'>,
  storagePath: string | null,
  fallbackUrl: string | null
): Promise<string | null> {
  // 1. Tenta download via SDK (sem CORS — usa as credenciais internas do cliente)
  if (storagePath) {
    try {
      const { data: blob, error } = await supabase.storage.from('quotes').download(storagePath);
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

function renderGenericItemHtml(item: QuoteItemForPdf, showItemValues: boolean) {
  const label = textVal(item.title || item.product_name || item.item_type || 'Item');
  const city = textVal(item.city_name);
  const start = formatDateBR(item.start_date);
  const end = formatDateBR(item.end_date);
  const period = start && end && start !== end ? `${start} – ${end}` : (start || '');
  const meta = city && period ? `${city} · ${period}` : (city || period);
  const amount = Number(item.total_amount ?? 0);
  const currency = item.currency || 'BRL';

  return `<div class="orc-section-card">
    <div class="orc-section-title orc-section-title--blue">${escHtml(label)}</div>
    <div class="orc-section-divider"></div>
    ${meta ? `<div class="orc-item-meta">${escHtml(meta)}</div>` : ''}
    ${showItemValues ? `<div class="orc-item-value">${escHtml(formatCurrency(amount, currency))}</div>` : ''}
  </div>`;
}

function renderFlightItemHtml(item: QuoteItemForPdf, showItemValues: boolean) {
  const { rows, airlineLegend } = buildFlightRows(item);
  if (rows.length === 0) return renderGenericItemHtml(item, showItemValues);

  const amount = Number(item.total_amount ?? 0);
  const taxes = Number(item.taxes_amount ?? 0);
  const currency = item.currency || 'BRL';
  let legendHtml = '';
  if (airlineLegend.size > 0) {
    let legendItems = '';
    for (const [code, name] of airlineLegend) {
      legendItems += `<div><b>${escHtml(code)}</b> = ${escHtml(name)}</div>`;
    }
    legendHtml = `<div class="orc-flight-legend">${legendItems}</div>`;
  }
  let rowsHtml = '';
  for (const row of rows) {
    let cellsHtml = '';
    for (const cell of row) {
      cellsHtml += `<td>${escHtml(cell || '-')}</td>`;
    }
    rowsHtml += `<tr>${cellsHtml}</tr>`;
  }

  return `<div class="orc-section-card orc-flight-card">
    <div class="orc-section-title orc-flight-title">Passagem Aérea</div>
    <div class="orc-flight-table-wrap">
      <table class="orc-flight-table">
        <thead>
          <tr>
            <th>Cia</th>
            <th>Origem</th>
            <th>Saída</th>
            <th>Destino</th>
            <th>Chegada</th>
            <th>Horários</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
    ${legendHtml}
    ${showItemValues ? `<div class="orc-flight-values">
      <span>Valor: ${escHtml(formatCurrency(amount, currency))}</span>
      ${taxes > 0 ? `<span>Taxas: ${escHtml(formatCurrency(taxes, currency))}</span>` : ''}
    </div>` : ''}
  </div>`;
}

function renderCircuitItemHtml(item: QuoteItemForPdf, showItemValues: boolean) {
  const label = textVal(item.title || item.product_name || item.item_type || 'Circuito');
  const city = textVal(item.city_name);
  const amount = Number(item.total_amount ?? 0);
  const currency = item.currency || 'BRL';
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
      <div class="orc-circuit-day-title">${escHtml(dayTitle)}</div>
      ${descricao ? `<div class="orc-circuit-day-desc">${escHtml(descricao).replace(/\n/g, '<br/>')}</div>` : ''}
    </div>`;
  }

  return `<div class="orc-section-card">
    <div class="orc-section-title orc-section-title--blue">${escHtml(label)}</div>
    <div class="orc-section-divider"></div>
    ${city ? `<div class="orc-item-meta">${escHtml(city)}</div>` : ''}
    ${daysHtml}
    ${showItemValues ? `<div class="orc-item-value">${escHtml(formatCurrency(amount, currency))}</div>` : ''}
  </div>`;
}

function renderAllItemsTableHtml(items: QuoteItemForPdf[], showItemValues: boolean) {
  if (items.length === 0) return '';

  let rowsHtml = '';
  for (const item of items) {
    const label = textVal(item.title || item.product_name || item.item_type || 'Item');
    const type = textVal(item.item_type || 'servico');
    const qty = Number(item.quantity ?? 1);
    const unit = Number(item.unit_price ?? 0);
    const total = Number(item.total_amount ?? 0);
    const currency = item.currency || 'BRL';
    rowsHtml += `<tr>
      <td>${escHtml(label)}</td>
      <td>${escHtml(type)}</td>
      <td class="text-right">${escHtml(String(Number.isFinite(qty) ? qty : 1))}</td>
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
    discount = 0
  } = params;

  // Totais
  const valorSemTaxas = items.reduce((s, i) => s + Number(i.total_amount ?? 0), 0);
  const taxesTotal = items.reduce((s, i) => s + Number(i.taxes_amount ?? 0), 0);
  const safeDiscount = Math.max(Number.isFinite(discount) ? discount : 0, 0);
  const total = Math.max(valorSemTaxas + taxesTotal - safeDiscount, 0);
  const itemCount = items.length;
  const currency = quote.currency || 'BRL';

  const dateLabel = formatDateBR(quote.created_at);
  const clientName = textVal(quote.client_name) || 'Cliente';

  const rightLines: string[] = [];
  if (settings.consultor_nome) rightLines.push(`Consultor: ${settings.consultor_nome}`);
  if (settings.telefone) rightLines.push(`Telefone: ${settings.telefone}`);
  if (settings.whatsapp) rightLines.push(`WhatsApp: ${settings.whatsapp}`);
  if (settings.email) rightLines.push(`E-mail: ${settings.email}`);
  let rightLinesHtml = '';
  for (const line of rightLines) {
    rightLinesHtml += `<div>${escHtml(line)}</div>`;
  }

  const footerText = textVal(settings.rodape_texto);
  const footerLines = footerText
    ? footerText.split(/\r?\n/).reduce((lines, line) => {
        const trimmed = line.trim();
        if (trimmed) lines.push(trimmed);
        return lines;
      }, [] as string[])
    : [
        'Preços em real (R$) convertido ao câmbio do dia sujeito a alteração e disponibilidade da tarifa.',
        'Valor da criança válido somente quando acompanhada de dois adultos pagantes no mesmo apartamento.',
        'Este orçamento é apenas uma tomada de preço.',
        'Os serviços citados não estão reservados; a compra somente poderá ser confirmada após a confirmação dos fornecedores.',
        'Este orçamento foi feito com base na menor tarifa para os serviços solicitados, podendo sofrer alteração devido à disponibilidade de lugares no ato da compra.',
      ];
  let footerLinesHtml = '';
  for (const line of footerLines) {
    footerLinesHtml += `<li>${escHtml(line)}</li>`;
  }

  // Cabeçalho
  const headerHtml = `
    <div class="orc-header-card">
      <table class="orc-header-table">
        <tbody>
          <tr>
            <td class="orc-header-left">
              <img src="${VTUR_LOGO_URL}" class="orc-logo" alt="VTur" />
              <div class="orc-header-copy">
                ${settings.filial_nome ? `<div>${escHtml('Filial: ' + settings.filial_nome)}</div>` : ''}
                ${settings.endereco_linha1 ? `<div>${escHtml(settings.endereco_linha1)}</div>` : ''}
                ${settings.endereco_linha2 ? `<div>${escHtml(settings.endereco_linha2)}</div>` : ''}
                ${settings.endereco_linha3 ? `<div>${escHtml(settings.endereco_linha3)}</div>` : ''}
              </div>
            </td>
            <td class="orc-header-right">
              <table class="orc-header-right-inner">
                <tbody>
                  <tr>
                    <td class="orc-right-lines">
                      ${qrUrl ? `<div class="orc-qr-label">Aponte para o QR Code abaixo e chame o consultor:</div>` : ''}
                      ${rightLinesHtml}
                    </td>
                    ${qrUrl ? `<td class="orc-qr-cell"><img src="${escHtml(qrUrl)}" class="orc-qr" alt="QR Code WhatsApp" /></td>` : ''}
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="orc-header-divider"></div>
    </div>`;

  // Título + resumo
  const titleHtml = `
    <div class="orc-title-row">
      <div class="orc-title-left">
        <div class="orc-title">Orçamento da sua viagem</div>
        <div class="orc-title-date">${escHtml(dateLabel)}</div>
      </div>
      <div class="orc-summary-box">
        <table class="orc-summary-table">
          <tbody>
            <tr><td>Valor (${itemCount} produto${itemCount === 1 ? '' : 's'})</td><td class="text-right">${escHtml(formatCurrency(valorSemTaxas, currency))}</td></tr>
            <tr><td>Taxas e impostos</td><td class="text-right">${escHtml(formatCurrency(taxesTotal, currency))}</td></tr>
            ${safeDiscount > 0 ? `<tr><td>Desconto</td><td class="text-right">${escHtml(formatCurrency(-safeDiscount, currency))}</td></tr>` : ''}
            <tr class="orc-total-row"><td><b>Total de</b></td><td class="text-right"><b>${escHtml(formatCurrency(total, currency))}</b></td></tr>
          </tbody>
        </table>
      </div>
    </div>`;

  // Itens
  let itensHtml = '';
  if (items.length === 0) {
    itensHtml = '<div class="orc-empty">Sem itens neste orçamento.</div>';
  } else {
    if (showBudgetItems) {
      itensHtml += renderAllItemsTableHtml(items, showItemValues);
    }
    if (showBudgetDetails) {
      for (const item of items) {
        itensHtml += isFlightQuoteItem(item)
          ? renderFlightItemHtml(item, showItemValues)
          : isCircuitQuoteItem(item)
            ? renderCircuitItemHtml(item, showItemValues)
            : renderGenericItemHtml(item, showItemValues);
      }
    }
    if (!showBudgetItems && !showBudgetDetails) {
      itensHtml = '';
    }
  }

  // Rodapé
  const footerHtml = `
    <div class="orc-section-card">
      <div class="orc-section-title orc-section-title--blue">Informações importantes</div>
      <div class="orc-section-divider"></div>
      <ul class="orc-footer-list">
        ${footerLinesHtml}
      </ul>
      ${complementUrl ? `<div class="orc-complement-img"><img src="${escHtml(complementUrl)}" alt="Imagem complementar" /></div>` : ''}
      <div class="orc-validity-box">
        <div class="orc-validity-client"><b>Orçamento para ${escHtml(clientName)}</b></div>
        <div class="orc-validity-date"><b>Validade somente para: ${escHtml(dateLabel)}</b></div>
      </div>
    </div>`;

  const css = `
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; font-size: 13px; }
    .shell { max-width: 900px; margin: 0 auto; padding: 24px; }
    .toolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; padding: 12px 0 16px 0; background: #f8fafc; z-index: 10; }
    .toolbar button { border: 0; border-radius: 999px; padding: 10px 20px; background: #0f766e; color: white; font-size: 14px; cursor: pointer; font-weight: 600; }
    .toolbar button:hover { background: #0d6460; }

    /* Header */
    .orc-header-card { background: white; border: 1px solid #d1d5db; border-radius: 12px; padding: 12px 14px; margin: 0 0 12px 0; }
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
    .orc-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; background: white; border: 1px solid #d1d5db; border-radius: 12px; padding: 14px 16px; margin: 0 0 12px 0; }
    .orc-title-left { flex: 1; }
    .orc-title { font-size: 21px; font-weight: 700; color: #1d4ed8; line-height: 1.1; }
    .orc-title-date { font-size: 11px; color: #0f172a; margin: 4px 0 0 0; }
    .orc-summary-box { border: 1px solid #d1d5db; border-radius: 10px; padding: 9px 12px; min-width: 230px; }
    .orc-summary-table { width: 100%; border-collapse: collapse; font-size: 10px; }
    .orc-summary-table td { padding: 1px 0; }
    .orc-summary-table .text-right { text-align: right; }
    .orc-total-row td { padding-top: 3px; border-top: 1px solid #e2e8f0; }

    /* Seção genérica */
    .orc-section-card { background: white; border: 1px solid #d1d5db; border-radius: 12px; padding: 12px 14px; margin: 0 0 12px 0; }
    .orc-section-title { font-size: 13px; font-weight: 700; margin: 0 0 6px 0; }
    .orc-section-title--blue { color: #1d4ed8; }
    .orc-section-divider { height: 1px; background: #e2e8f0; margin: 0 0 10px 0; }

    /* Itens */
    .orc-item-row { padding: 6px 0; }
    .orc-item-label { font-size: 12px; font-weight: 600; color: #0f172a; }
    .orc-item-meta { font-size: 11px; color: #64748b; margin: 2px 0 0 0; }
    .orc-item-value { font-size: 11px; color: #0f172a; margin: 2px 0 0 0; text-align: right; }
    .orc-item-divider { height: 1px; background: #f1f5f9; margin: 2px 0; }
    .orc-circuit-day { border: 1px solid #d9e2ec; border-radius: 8px; background: #f8fafc; padding: 8px 10px; margin: 8px 0 0 0; }
    .orc-circuit-day-title { font-size: 12px; font-weight: 700; color: #1e293b; margin: 0 0 4px 0; }
    .orc-circuit-day-desc { font-size: 11px; line-height: 1.5; color: #334155; }
    .orc-items-table-wrap { border: 1px solid #d9e2ec; border-radius: 8px; overflow: hidden; }
    .orc-items-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .orc-items-table th { background: #f1f5f9; color: #334155; text-align: left; padding: 7px 8px; border-bottom: 1px solid #d9e2ec; }
    .orc-items-table td { padding: 7px 8px; border-bottom: 1px solid #eef2f7; color: #0f172a; }
    .orc-items-table tbody tr:last-child td { border-bottom: 0; }
    .orc-items-table .text-right { text-align: right; }
    .orc-empty { font-size: 12px; color: #94a3b8; padding: 8px 0; }

    /* Passagem aérea */
    .orc-flight-card { padding: 18px 20px 20px 20px; }
    .orc-flight-title { color: #0f172a; font-size: 18px; margin: 0 0 14px 0; }
    .orc-flight-table-wrap { border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; }
    .orc-flight-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .orc-flight-table thead th { background: #e8eefb; color: #1e3a8a; padding: 8px 8px; text-align: left; font-weight: 700; border-bottom: 1px solid #cbd5e1; }
    .orc-flight-table tbody td { padding: 8px 8px; border-bottom: 1px solid #dbe3f0; color: #334155; }
    .orc-flight-table tbody tr:last-child td { border-bottom: 0; }
    .orc-flight-legend { margin: 10px 0 0 0; font-size: 10px; color: #0f172a; }
    .orc-flight-values { display: flex; justify-content: flex-end; gap: 16px; margin: 10px 0 0 0; font-size: 10px; font-weight: 700; color: #0f172a; }

    /* Rodapé */
    .orc-footer-list { margin: 0 0 0 14px; padding: 0; font-size: 9px; color: #334155; }
    .orc-footer-list li { margin: 0 0 3px 0; }
    .orc-complement-img { margin: 12px 0 0 0; text-align: center; }
    .orc-complement-img img { max-height: 170px; max-width: 100%; }
    .orc-validity-box { border: 1px solid #d1d5db; border-radius: 8px; margin: 10px 0 0 0; padding: 8px; text-align: center; }
    .orc-validity-client { font-size: 10px; color: #0f172a; }
    .orc-validity-date { font-size: 10px; color: #dc2626; margin: 3px 0 0 0; }

    @media print {
      @page { margin: 12mm; }
      body { background: white; }
      .toolbar { display: none; }
      .shell { max-width: none; padding: 0; }
      .orc-header-card, .orc-title-row, .orc-section-card { border-radius: 0; box-shadow: none; }
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
  <div class="shell">
    <div class="toolbar"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div>
    ${headerHtml}
    ${titleHtml}
    ${itensHtml}
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
  supabase: SupabasePreviewClient;
  showBudgetItems?: boolean;
  showBudgetDetails?: boolean;
  showItemValues?: boolean;
  discount?: number;
}): Promise<void> {
  const {
    quoteId,
    supabase,
    showBudgetItems = false,
    showBudgetDetails = true,
    showItemValues = true,
    discount = 0
  } = params;

  // 1. Autenticação
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id;
  if (!userId) throw new Error('Usuário não autenticado.');

  // 2. Dados do orçamento
  const { data: quote, error: quoteError } = await supabase
    .from('quote')
    .select('id, created_at, currency, total, status, client_name, raw_json, cliente:client_id (nome)')
    .eq('id', quoteId)
    .maybeSingle();
  const quoteRow = quote as QuotePreviewRow | null;
  if (quoteError || !quoteRow) throw new Error('Orçamento não encontrado.');

  // 3. Itens
  const { data: items, error: itemsError } = await supabase
    .from('quote_item')
    .select('id, item_type, title, product_name, city_name, quantity, unit_price, total_amount, taxes_amount, start_date, end_date, currency, order_index, raw')
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
    const { data: segments } = await supabase
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
  const { data: settings } = await supabase
    .from('quote_print_settings')
    .select('imagem_complementar_url, imagem_complementar_path, consultor_nome, filial_nome, endereco_linha1, endereco_linha2, endereco_linha3, telefone, whatsapp, whatsapp_codigo_pais, email, rodape_texto')
    .eq('owner_user_id', userId)
    .maybeSingle();

  const pdfSettings: QuotePdfSettings = settings ?? {};

  // 5. Resolve URLs assinadas (token na query string — funciona sem cookie)
  const complementSignedUrl = await resolveStorageUrl(supabase, pdfSettings.imagem_complementar_url, pdfSettings.imagem_complementar_path);

  // 6. QR Code
  const whatsappLink = construirLinkWhatsApp(pdfSettings.whatsapp, pdfSettings.whatsapp_codigo_pais);
  const qrSignedUrl = whatsappLink
    ? `/api/v1/qr?size=200&margin=1&text=${encodeURIComponent(whatsappLink)}`
    : null;

  // 7. Converte todas as imagens para data URL antes de montar o HTML
  // Necessário porque o blob: HTML abre em origem isolada (null) e imagens
  // externas com token na URL seriam bloqueadas pelo browser
  const [complementUrl, qrUrl] = await Promise.all([
    storageImageToDataUrl(supabase, pdfSettings.imagem_complementar_path || extractStoragePath(pdfSettings.imagem_complementar_url), complementSignedUrl),
    qrSignedUrl ? externalImageToDataUrl(qrSignedUrl) : Promise.resolve(null),
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
    },
    items: itemRows,
    settings: pdfSettings,
    qrUrl,
    complementUrl,
    showBudgetItems,
    showBudgetDetails,
    showItemValues,
    discount,
  });

  // 9. Abre em nova aba
  const previewUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const opened = safeOpenNewTab(previewUrl, ['blob:']);
  setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
  if (!opened) throw new Error('Não foi possível abrir a prévia. Verifique o bloqueador de pop-up.');
}
