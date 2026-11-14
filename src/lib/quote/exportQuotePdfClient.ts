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
  resumoDetalhes
} from '$lib/quote/detalhesItem';
import { chaveIdentidadeCidade } from '$lib/catalogoOpcionais';
import {
  nomeCidadeNoPdf,
  printCardField,
  printCityTitle,
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
  for (const part of String(value || '').split(/\s*(?:→|->)\s*|\s+-\s+/)) {
    const trimmed = part.trim();
    if (trimmed) parts.push(trimmed);
  }
  return {
    origem: parts[0] || '',
    destino: parts[1] || ''
  };
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
    const includedOrder = ['KM Livre', 'CDW', 'LDW', 'Tanque Cheio'];
    const included = new Set(details.incluidos.map(normalizeText));
    const extras = [
      ...includedOrder.filter((value) => included.has(normalizeText(value))),
      ...details.incluidos.filter(
        (value) => !includedOrder.some((known) => normalizeText(known) === normalizeText(value))
      )
    ];
    return [textVal(details.cambio), ...extras].filter(Boolean);
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
  const label = labels[type] || textVal(item.item_type) || 'Serviço';
  const periodo = formatServicePeriod(item);
  const fields = getServiceDetails(item);
  const title = getServiceTitle(item);
  const quantity = flight
    ? formatFlightQuantity(item)
    : (formatLodgingOrCarQuantity(item) ?? (item.quantity == null ? '-' : String(item.quantity)));
  if (showUnitValue) {
    const content = `<strong>${escHtml(title)}${periodo ? ` - ${escHtml(periodo)}` : ''}</strong>${fields.length ? `<div class="orc-service-details">${fields.map(escHtml).join(' | ')}</div>` : ''}`;
    return renderScreenItemRow(item, label, content, quantity, defaultCurrency);
  }
  return `<tr class="orc-city-item${requiresPrintContinuation([title, ...fields].join('\n')) ? ' orc-city-item--long' : ''}">
    <td class="orc-service-type">${escHtml(label)}</td>
    <td><strong>${escHtml(title)}${periodo ? ` - ${escHtml(periodo)}` : ''}</strong>${fields.length ? `<div class="orc-service-details">${fields.map(escHtml).join(' | ')}</div>` : ''}</td>
    <td class="orc-quantity">${escHtml(quantity)}</td>
    ${showItemValues ? `<td class="orc-value">${escHtml(formatCurrency(Number(item.total_amount ?? 0), item.currency || defaultCurrency))}</td>` : ''}
  </tr>`;
}

type QuotePdfSection =
  | { kind: 'city'; city: string; key: string; items: QuoteItemForPdf[] }
  | { kind: 'flights'; items: QuoteItemForPdf[] }
  | { kind: 'train'; items: QuoteItemForPdf[] }
  | { kind: 'circuit'; items: QuoteItemForPdf[] };

function orderQuoteSections(items: QuoteItemForPdf[]): QuotePdfSection[] {
  const sections: QuotePdfSection[] = [];
  for (const item of items) {
    const previous = sections[sections.length - 1];
    if (normalizeText(item.item_type) === 'trem') {
      if (previous?.kind === 'train') previous.items.push(item);
      else sections.push({ kind: 'train', items: [item] });
      continue;
    }
    if (isFlightQuoteItem(item)) {
      if (previous?.kind === 'flights') previous.items.push(item);
      else sections.push({ kind: 'flights', items: [item] });
      continue;
    }
    if (isCircuitQuoteItem(item)) {
      sections.push({ kind: 'circuit', items: [item] });
      continue;
    }
    const city = textVal(item.city_name);
    const cityId = item.destino_geografico_id
      ? `geo:${item.destino_geografico_id}`
      : item.cidade_id
        ? `cidade:${item.cidade_id}`
        : null;
    const key = chaveIdentidadeCidade(city, cityId);
    if (previous?.kind === 'city' && previous.key === key) previous.items.push(item);
    else sections.push({ kind: 'city', city: city || 'Cidade não informada', key, items: [item] });
  }
  return sections;
}

function renderGroupedItems(
  sections: QuotePdfSection[],
  showItemValues: boolean,
  defaultCurrency: string
) {
  return sections
    .map((section) => {
      if (section.kind === 'flights' || section.kind === 'train') {
        const content = section.items
          .map((item) =>
            getFlightDataList(item).length
              ? renderFlightItemHtml(item, showItemValues, defaultCurrency)
              : renderServiceItem(item, showItemValues, defaultCurrency, true)
          )
          .join('');
        return renderCityTable(
          section.kind === 'train' ? 'Trem' : 'Passagens Aéreas Internacionais e Trechos Internos',
          content,
          showItemValues,
          false
        );
      }
      if (section.kind === 'circuit')
        return renderCircuitItemHtml(section.items[0], showItemValues, defaultCurrency);

      const content = section.items
        .map((item) => renderServiceItem(item, showItemValues, defaultCurrency))
        .join('');
      const totals = new Map<string, number>();
      for (const item of section.items) {
        const currency = item.currency || defaultCurrency;
        totals.set(currency, (totals.get(currency) || 0) + Number(item.total_amount ?? 0));
      }
      const subtotal = showItemValues
        ? `<tr class="orc-subtotal"><td colspan="3">Subtotal — ${escHtml(nomeCidadeNoPdf(section.city))}</td><td class="orc-value">${Array.from(totals, ([currency, value]) => escHtml(formatCurrency(value, currency))).join('<br>')}</td></tr>`
        : '';
      return renderCityTable(section.city, `${content}${subtotal}`, showItemValues, true);
    })
    .join('');
}

function renderCityTable(title: string, content: string, showItemValues: boolean, isCity = false) {
  const columnCount = 3 + Number(showItemValues);
  const sectionTitle = isCity
    ? printCityTitle(title)
    : `<div class="orc-table-section-title">${escHtml(title)}</div>`;
  return `<section class="orc-city-section">
    <table class="orc-city-table">
      <colgroup><col style="width:18%"><col style="width:${showItemValues ? 50 : 70}%"><col style="width:14%">${showItemValues ? '<col style="width:18%">' : ''}</colgroup>
      <thead>
        <tr><th class="orc-city-heading" colspan="${columnCount}">${sectionTitle}</th></tr>
        <tr><th>Serviço</th><th>Descrição / Detalhes</th><th>Qtd.</th>${showItemValues ? '<th class="orc-value">Valor</th>' : ''}</tr>
      </thead>
      <tbody>${content}</tbody>
    </table>
  </section>`;
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
  return `<tr class="hover:bg-slate-50">
    <td data-label="Cidade" class="px-3 py-3 text-slate-900">${escHtml(nomeCidadeNoPdf(textVal(item.city_name)) || '—')}</td>
    <td data-label="Serviço" class="px-3 py-3 text-slate-700">${escHtml(service)}</td>
    <td data-label="Descrição / Detalhes" class="px-3 py-3 text-slate-900"><div>${content}</div></td>
    <td data-label="Valor Unit." class="px-3 py-3 text-right text-slate-700">${escHtml(formatCurrency(Number(item.unit_price ?? 0), currency))}</td>
    <td data-label="Qtd" class="px-3 py-3 text-center text-slate-700">${escHtml(quantity)}</td>
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
      tarifa_nome: String(data.tarifa_nome || '')
    };
  });
  if (flights.length === 0) return renderGenericItemHtml(item, showItemValues, defaultCurrency);
  const amount = Number(item.total_amount ?? 0);
  const taxes = Number(item.taxes_amount ?? 0);
  const currency = item.currency || defaultCurrency;
  const title = formatarDescricaoItem(
    item.item_type || '',
    textVal(item.title || item.product_name)
  );
  const flightType = normalizeText(flights[0].tipo_voo);
  const isDomestic = flightType === 'nacional' || flightType.includes('interno');
  const isTrain = normalizeText(item.item_type) === 'trem';
  const service = isTrain
    ? 'Trem'
    : isDomestic
      ? 'Voo Interno'
      : flightType === 'internacional'
        ? 'Aéreo Internacional'
        : 'Passagem Aérea';
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
      return [route, textVal(flight.descricao), departureDate, ...times]
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
  return `<tr class="orc-city-item">
    <td class="orc-service-type">${escHtml(service)}</td>
    <td>${content}</td>
    <td class="orc-quantity">${escHtml(quantityLabel)}</td>
    ${showItemValues ? `<td class="orc-value">${escHtml(formatCurrency(amount, currency))}</td>` : ''}
  </tr>`;
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
    ${city ? printCityTitle(city) : ''}
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
    const type = textVal(item.item_type || 'servico');
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

  const rows = Array.from(totals, ([code, group]) => {
    const appliedDiscount = code === currency ? discount : 0;
    const total = Math.max(group.flights + group.services + group.taxes - appliedDiscount, 0);
    const row = (label: string, value: number, className = '') =>
      `<tr${className ? ` class="${className}"` : ''}><td>${escHtml(label)}</td><td>${escHtml(code)}</td><td class="orc-value">${escHtml(formatCurrency(value, code))}</td></tr>`;
    return [
      showItemValues && group.flights ? row('Passagens aéreas', group.flights) : '',
      showItemValues && group.services ? row('Serviços e demais produtos', group.services) : '',
      !showItemValues ? row('Produtos', group.flights + group.services) : '',
      group.taxes ? row('Taxas e impostos', group.taxes) : '',
      appliedDiscount ? row('Desconto', -appliedDiscount) : '',
      row('Total', total, 'orc-subtotal')
    ].join('');
  }).join('');
  const discountNotice =
    discount > 0 && !totals.has(currency)
      ? `<p class="orc-summary-note">Desconto informado em ${escHtml(currency)} não aplicado: não há itens nessa moeda.</p>`
      : '';
  return `<section class="orc-financial-section">
    <table class="orc-city-table orc-financial-table">
      <colgroup><col style="width:55%"><col style="width:18%"><col style="width:27%"></colgroup>
      <thead><tr><th class="orc-financial-heading" colspan="3"><h2>Resumo financeiro</h2></th></tr>
        <tr><th>Categoria</th><th>Moeda</th><th class="orc-value">Valor total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>${discountNotice}
  </section>`;
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
  const period = dates.length
    ? dates[0] === dates[dates.length - 1]
      ? formatRoteiroDate(dates[0])
      : `${formatRoteiroDate(dates[0])} a ${formatRoteiroDate(dates[dates.length - 1])}`
    : '';
  const cities = Array.from(
    new Set(items.map((item) => nomeCidadeNoPdf(textVal(item.city_name))).filter(Boolean))
  );
  const validity = formatRoteiroDate(quote.valid_until);

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
  const hasChildren = items.some((item) => (lerDetalhes(item).criancas || 0) > 0);
  const footerLines = footerText
    ? footerText.split(/\r?\n/).reduce((lines, line) => {
        const trimmed = line.trim();
        if (trimmed) lines.push(trimmed);
        return lines;
      }, [] as string[])
    : [
        'Preços em real (R$) convertido ao câmbio do dia sujeito a alteração e disponibilidade da tarifa.',
        ...(hasChildren
          ? [
              'Valor da criança válido somente quando acompanhada de dois adultos pagantes no mesmo apartamento.'
            ]
          : []),
        'Este orçamento é apenas uma tomada de preço.',
        'Os serviços citados não estão reservados; a compra somente poderá ser confirmada após a confirmação dos fornecedores.',
        'Este orçamento foi feito com base na menor tarifa para os serviços solicitados, podendo sofrer alteração devido à disponibilidade de lugares no ato da compra.'
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

  // Título e dados disponíveis da viagem
  const titleHtml = `
    <div class="orc-title-row">
      <div class="orc-title-left">
        <div class="orc-title-kicker">Proposta de viagem</div>
        <div class="orc-title">Orçamento da sua viagem</div>
        <div class="orc-title-meta"><strong>Para:</strong> ${escHtml(clientName)}</div>
        ${
          dateLabel || validity
            ? `<div class="orc-title-meta orc-title-dates">${dateLabel ? `<strong>Emissão:</strong> ${escHtml(dateLabel)}` : ''}${dateLabel && validity ? ' <span>·</span> ' : ''}${validity ? `<strong>Validade:</strong> ${escHtml(validity)}` : ''}</div>`
            : ''
        }
        ${period ? `<div class="orc-title-meta"><strong>Período:</strong> ${escHtml(period)}</div>` : ''}
        ${cities.length ? `<div class="orc-title-meta"><strong>Destinos:</strong> ${escHtml(cities.join(', '))}</div>` : ''}
      </div>
    </div>`;

  // Itens
  let itensHtml = '';
  if (items.length === 0) {
    itensHtml = '<div class="orc-empty">Sem itens neste orçamento.</div>';
  } else {
    const sections = orderQuoteSections(items);
    if (showBudgetItems) {
      itensHtml += renderAllItemsTableHtml(
        sections.flatMap((section) => section.items),
        showItemValues,
        currency
      );
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
    <div class="orc-section-card">
      <div class="orc-section-title orc-section-title--blue">Informações importantes</div>
      <div class="orc-section-divider"></div>
      <ul class="orc-footer-list">
        ${footerLinesHtml}
      </ul>
      ${complementUrl ? `<div class="orc-complement-img"><img src="${escHtml(complementUrl)}" alt="Imagem complementar" /></div>` : ''}
      <div class="orc-validity-box">
        <div class="orc-validity-client"><b>Orçamento para ${escHtml(clientName)}</b></div>
        ${validity ? `<div class="orc-validity-date"><b>Válido até: ${escHtml(validity)}</b></div>` : ''}
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
    .orc-title-row { background: white; border: 1px solid #d1d5db; border-radius: 12px; padding: 16px; margin: 0 0 16px 0; }
    .orc-title-kicker { color: #243aa3; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
    .orc-title { font-size: 21px; font-weight: 700; color: #243aa3; line-height: 1.2; margin-top: 4px; }
    .orc-title-meta { color: #334155; font-size: 12px; line-height: 1.5; margin-top: 5px; }
    .orc-title-dates { white-space: nowrap; }

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
    .orc-circuit-day { margin: 14px 0 0 0; }
    .orc-items-table-wrap { border: 1px solid #d9e2ec; border-radius: 8px; overflow: hidden; }
    .orc-items-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .orc-items-table th { background: #243aa3; color: white; text-align: left; padding: 7px 8px; border-bottom: 1px solid #d9e2ec; }
    .orc-items-table td { padding: 7px 8px; border-bottom: 1px solid #eef2f7; color: #0f172a; }
    .orc-items-table tbody tr:last-child td { border-bottom: 0; }
    .orc-items-table .text-right { text-align: right; }
    .orc-empty { font-size: 12px; color: #94a3b8; padding: 8px 0; }
    ${roteiroCardStyles}
    .orc-city-section, .orc-financial-section { margin: 18px 0; }
    .orc-city-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; overflow-wrap: anywhere; }
    .orc-city-table th, .orc-city-table td { border: 1px solid #dbe3ec; padding: 8px; text-align: left; vertical-align: top; }
    .orc-city-table thead th { background: #243aa3; color: white; font-weight: 700; }
    .orc-city-table thead tr:not(:first-child) th { text-transform: uppercase; }
    .orc-city-table thead .orc-city-heading { background: transparent; border: 0; padding: 0; }
    .orc-city-table thead .orc-financial-heading { background: transparent; border: 0; padding: 0; }
    .orc-city-heading .roteiro-card-city { margin: 0 0 8px; border-left: 4px solid #c45b1b; padding-left: 9px; color: #112b4d; font: bold 18px Arial, sans-serif; }
    .orc-city-heading .roteiro-card-city svg { display: none; }
    .orc-table-section-title { margin: 0 0 8px; border-left: 4px solid #c45b1b; padding-left: 9px; color: #112b4d; font: bold 18px Arial, sans-serif; }
    .orc-city-table tbody tr:nth-child(even):not(.orc-subtotal) { background: #f7f9fc; }
    .orc-city-table .orc-value { text-align: right; }
    .orc-service-type { font-weight: 700; }
    .orc-service-details { color: #475569; line-height: 1.5; margin-top: 4px; }
    .orc-subtotal { background: #edf2f7; color: #112b4d; font-weight: 700; }
    .orc-flight-segment + .orc-flight-segment { margin-top: 2px; }
    .orc-financial-section h2 { color: #112b4d; font: bold 18px Arial, sans-serif; margin: 0 0 10px; }
    .orc-summary-note { color: #475569; font-size: 11px; }

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
      .roteiro-card, .orc-city-item { break-inside: avoid; page-break-inside: avoid; }
      .roteiro-card--long, .orc-city-item--long { break-inside: auto; page-break-inside: auto; }
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
  <div class="shell">
    <div class="toolbar"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div>
    ${headerHtml}
    ${titleHtml}
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
      valid_until: quoteRow.valid_until ?? null
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
