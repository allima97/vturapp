import { VTUR_LOGO_URL } from '$lib/brand';
import {
  addDaysISODate,
  diffDaysISODate,
  formatISODateBR,
  formatISODateShortBR,
  parseISODateParts
} from '$lib/date';
import type { QuoteForPdf, QuoteItemForPdf, QuotePdfSettings } from './exportQuotePdfClient';

const AIRPORT_IATA_CODE_RE = /^[A-Z]{3}$/;

type ItemKind = 'aereo' | 'trem' | 'hotel' | 'carro' | 'passeio' | 'outro';

type Leg = {
  date: string;
  endDate: string;
  originCode: string;
  originCity: string;
  destCode: string;
  destCity: string;
  departTime: string;
  arriveTime: string;
  airline: string;
  flightNumber: string;
  cabin: string;
  fare: string;
  seats: string;
  direction: string;
};

function escHtml(value?: string | number | null): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function textVal(value?: unknown): string {
  return String(value ?? '').trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeText(value?: string | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function pick(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = textVal(data[key]);
    if (value) return value;
  }
  return '';
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>();

function formatCurrency(value: number, currency = 'BRL'): string {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : 'BRL';
  let formatter = CURRENCY_FORMATTERS.get(code);
  if (!formatter) {
    formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code });
    CURRENCY_FORMATTERS.set(code, formatter);
  }
  return formatter.format(Number.isFinite(value) ? value : 0);
}

function isoDate(value?: unknown): string {
  const parts = parseISODateParts(textVal(value));
  return parts?.iso || '';
}

function formatHour(value?: unknown): string {
  const match = textVal(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return textVal(value);
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function iataCode(value?: unknown): string {
  const raw = textVal(value).toUpperCase();
  if (AIRPORT_IATA_CODE_RE.test(raw)) return raw;
  const wrapped = raw.match(/\(([A-Z]{3})\)/);
  return wrapped ? wrapped[1] : '';
}

function cityLabel(value?: unknown): string {
  return textVal(value)
    .replace(/\s*\([A-Z]{3}\)\s*$/i, '')
    .trim();
}

function joinNames(names: string[]): string {
  const unique = names.filter((name, index) => name && names.indexOf(name) === index);
  if (unique.length <= 1) return unique[0] || '';
  if (unique.length === 2) return `${unique[0]} e ${unique[1]}`;
  return `${unique.slice(0, -1).join(', ')} e ${unique[unique.length - 1]}`;
}

function plural(count: number, singular: string, pluralLabel: string): string {
  const amount = Number.isFinite(count) ? count : 0;
  const shown = Number.isInteger(amount) ? String(amount) : String(amount).replace('.', ',');
  return `${shown} ${amount === 1 ? singular : pluralLabel}`;
}

function formatRange(start?: string, end?: string, compact = false): string {
  const from = isoDate(start);
  const to = isoDate(end);
  if (!from) return '';
  if (!to || from === to) return formatISODateBR(from);
  const a = parseISODateParts(from);
  const b = parseISODateParts(to);
  if (!a || !b) return `${formatISODateBR(from)} a ${formatISODateBR(to)}`;
  if (compact && a.year === b.year && a.month === b.month) {
    return `${String(a.day).padStart(2, '0')} a ${formatISODateBR(to)}`;
  }
  if (a.year === b.year) {
    return `${formatISODateShortBR(from)} a ${formatISODateBR(to)}`;
  }
  return `${formatISODateBR(from)} a ${formatISODateBR(to)}`;
}

function icon(name: string): string {
  const paths: Record<string, string> = {
    plane:
      '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
    car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    train:
      '<rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16"/><path d="M8 19 6 22"/><path d="M16 19l2 3"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>',
    ticket:
      '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
    banknote:
      '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    baby: '<circle cx="12" cy="8" r="3"/><path d="M12 11v3"/><path d="M8 21v-2a4 4 0 0 1 8 0v2"/><path d="M9 14h6"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8"/><path d="M8 17h8"/>',
    calendarx:
      '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="m14 14-4 4"/><path d="m10 14 4 4"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="#243AA3"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'
  };
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="#243AA3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
}

function itemBlob(item: QuoteItemForPdf): string {
  return normalizeText(`${item.item_type || ''} ${item.title || ''} ${item.product_name || ''}`);
}

function flightRecords(item: QuoteItemForPdf): Record<string, unknown>[] {
  const segmentRows = (item.segments || [])
    .filter((segment) => normalizeText(segment.segment_type) === 'flight')
    .sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0))
    .map((segment) => asRecord(segment.data))
    .filter((data) => Object.keys(data).length > 0);
  if (segmentRows.length > 0) return segmentRows;

  const raw = asRecord(item.raw);
  const imported = asRecord(raw.aereo_import);
  const segments = Array.isArray(imported.segmentos) ? imported.segmentos : [];
  if (segments.length > 0) {
    return segments.map((segment) => {
      const row = asRecord(segment);
      return {
        ...imported,
        ...row,
        cia_aerea: row.cia_aerea || imported.cia_aerea,
        classe_reserva: row.classe_reserva || imported.classe_reserva,
        tarifa_nome: row.tarifa_nome || imported.tarifa_nome
      };
    });
  }
  if (
    imported.data_voo ||
    imported.hora_saida ||
    imported.aeroporto_saida ||
    raw.trecho ||
    raw.hora_saida ||
    raw.aeroporto_saida
  ) {
    return [Object.keys(imported).length ? { ...raw, ...imported } : raw];
  }
  return [];
}

export function itemKind(item: QuoteItemForPdf): ItemKind {
  const blob = itemBlob(item);
  if (blob.includes('trem') || blob.includes('train') || blob.includes('ferrovi')) return 'trem';
  if (flightRecords(item).length > 0) return 'aereo';
  if (
    blob.includes('passagem') ||
    blob.includes('aereo') ||
    blob.includes('aerea') ||
    blob.includes('voo')
  ) {
    return 'aereo';
  }
  if (
    blob.includes('hotel') ||
    blob.includes('hosped') ||
    blob.includes('pousada') ||
    blob.includes('resort')
  ) {
    return 'hotel';
  }
  if (blob.includes('carro') || blob.includes('veiculo') || blob.includes('aluguel'))
    return 'carro';
  if (blob.includes('passeio') || blob.includes('tour') || blob.includes('circuito'))
    return 'passeio';
  return 'outro';
}

function splitTrecho(value: string) {
  const parts = value
    .split(/\s*(?:-|–|—|→|\/)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return { origem: parts[0] || '', destino: parts[1] || '' };
}

function legFromRecord(data: Record<string, unknown>, item: QuoteItemForPdf): Leg {
  const ownDeparture = isoDate(pick(data, ['data_voo', 'data_inicio', 'data']));
  const ownArrival = isoDate(pick(data, ['data_fim', 'data_chegada']));
  const departure = ownDeparture || isoDate(item.start_date);
  const arrival = ownArrival || (ownDeparture ? ownDeparture : isoDate(item.end_date) || departure);
  const trecho = splitTrecho(pick(data, ['trecho']));
  const originRaw = pick(data, ['aeroporto_saida', 'origem', 'origin']) || trecho.origem;
  const destRaw = pick(data, ['aeroporto_chegada', 'destino', 'destination']) || trecho.destino;
  const originCity =
    cityLabel(pick(data, ['cidade_saida', 'cidade_origem', 'origin_city'])) ||
    (iataCode(originRaw) ? '' : cityLabel(originRaw));
  const destCity =
    cityLabel(pick(data, ['cidade_chegada', 'cidade_destino', 'destination_city'])) ||
    (iataCode(destRaw) ? '' : cityLabel(destRaw));
  return {
    date: departure,
    endDate: arrival,
    originCode: iataCode(originRaw),
    originCity,
    destCode: iataCode(destRaw),
    destCity,
    departTime: formatHour(pick(data, ['hora_saida', 'partida', 'departure_time'])),
    arriveTime: formatHour(pick(data, ['hora_chegada', 'chegada', 'arrival_time'])),
    airline: pick(data, ['cia_aerea', 'companhia', 'airline']),
    flightNumber: pick(data, ['numero_voo', 'voo', 'flight_number', 'numero']),
    cabin: pick(data, ['classe', 'cabine', 'classe_cabine', 'classe_reserva', 'categoria']),
    fare: pick(data, ['tarifa_nome', 'tarifa', 'familia_tarifaria']),
    seats: pick(data, ['assentos', 'assento', 'seats', 'lugares']),
    direction: normalizeText(pick(data, ['tipo_voo', 'sentido', 'direcao']))
  };
}

function legsOf(item: QuoteItemForPdf): Leg[] {
  const records = flightRecords(item);
  if (records.length > 0) return records.map((record) => legFromRecord(record, item));
  const raw = asRecord(item.raw);
  const titlePair = textVal(item.title)
    .toUpperCase()
    .match(/\b([A-Z]{3})\b.*\b([A-Z]{3})\b/);
  if (!titlePair && !isoDate(item.start_date) && !raw.trecho) return [];
  return [
    legFromRecord(
      {
        ...raw,
        data_voo: raw.data_voo || item.start_date || '',
        data_fim: raw.data_fim || item.end_date || item.start_date || '',
        aeroporto_saida: raw.aeroporto_saida || titlePair?.[1] || '',
        aeroporto_chegada: raw.aeroporto_chegada || titlePair?.[2] || ''
      },
      item
    )
  ];
}

function itemAmount(item: QuoteItemForPdf): number {
  return Number(item.total_amount ?? 0) + Number(item.taxes_amount ?? 0);
}

function itemQuantity(item: QuoteItemForPdf): number {
  const quantity = Number(item.quantity ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function itemStart(item: QuoteItemForPdf): string {
  const legs = legsOf(item)
    .map((leg) => leg.date)
    .filter(Boolean)
    .sort();
  return legs[0] || isoDate(item.start_date);
}

function itemEnd(item: QuoteItemForPdf): string {
  const legs = legsOf(item);
  const dates = legs
    .flatMap((leg) => [leg.endDate, leg.date])
    .filter(Boolean)
    .sort();
  return dates[dates.length - 1] || isoDate(item.end_date) || isoDate(item.start_date);
}

function partyOf(item: QuoteItemForPdf) {
  const raw = asRecord(item.raw);
  return {
    adults: numberOrNull(pick(raw, ['qtd_adultos', 'adultos', 'qte_adultos'])),
    children: numberOrNull(pick(raw, ['qtd_criancas', 'criancas', 'qte_criancas']))
  };
}

function partyLabel(adults: number | null, children: number | null, fallback = ''): string {
  const parts: string[] = [];
  if (adults != null && adults > 0) parts.push(plural(adults, 'adulto', 'adultos'));
  if (children != null && children > 0) parts.push(plural(children, 'criança', 'crianças'));
  if (parts.length) return parts.join(' e ');
  return fallback;
}

function seatTag(value: string): string {
  if (!value) return '';
  return normalizeText(value).includes('assent') ? value : `Assentos ${value}`;
}

function tagsHtml(labels: string[]): string {
  const unique = labels.map((label) => label.trim()).filter(Boolean);
  const seen = new Set<string>();
  let html = '';
  for (const label of unique) {
    const key = normalizeText(label);
    if (seen.has(key)) continue;
    seen.add(key);
    html += `<span class="tag">${escHtml(label)}</span>`;
  }
  return html ? `<div>${html}</div>` : '';
}

function routeHtml(leg: Leg): string {
  const from = leg.originCode || leg.originCity;
  const to = leg.destCode || leg.destCity;
  if (!from && !to) return '';
  const offset = leg.date && leg.endDate ? diffDaysISODate(leg.date, leg.endDate) : null;
  const plus = offset != null && offset > 0 ? `<span class="p1">+${offset}</span>` : '';
  const cities =
    leg.originCity || leg.destCity
      ? `<div class="itn">${escHtml([leg.originCity || from, leg.destCity || to].filter(Boolean).join(' / '))}</div>`
      : '';
  const carrier = [leg.airline, leg.flightNumber].filter(Boolean).join(' · ');
  return `<div class="rt">${escHtml(from)} ${leg.departTime ? `<span class="mu" style="font-weight:normal">${escHtml(leg.departTime)}</span>` : ''}<i></i>${escHtml(to)} <span class="mu" style="font-weight:normal">${escHtml(leg.arriveTime)} ${plus}</span></div>${cities}${carrier ? `<div class="mu" style="font-size:8pt">${escHtml(carrier)}</div>` : ''}`;
}

function legLabel(kind: ItemKind, leg: Leg, roundTrip: boolean, index: number): string {
  const prefix = kind === 'trem' ? 'TREM' : 'AÉREO';
  const date = formatISODateBR(leg.date);
  if (!roundTrip) return date && date !== '-' ? `${prefix} · ${date}` : prefix;
  const direction = leg.direction.includes('volta')
    ? 'VOLTA'
    : leg.direction.includes('ida')
      ? 'IDA'
      : index === 0
        ? 'IDA'
        : 'VOLTA';
  return date && date !== '-' ? `${prefix} · ${direction} · ${date}` : `${prefix} · ${direction}`;
}

function isRoundTrip(legs: Leg[]): boolean {
  if (legs.length !== 2) return false;
  const [going, back] = legs;
  const same = (a: string, b: string) => normalizeText(a) && normalizeText(a) === normalizeText(b);
  return (
    (same(going.originCode, back.destCode) && same(going.destCode, back.originCode)) ||
    (same(going.originCity, back.destCity) && same(going.destCity, back.originCity))
  );
}

function transportRow(item: QuoteItemForPdf, kind: ItemKind, showValues: boolean): string {
  const legs = legsOf(item);
  const roundTrip = isRoundTrip(legs);
  const raw = asRecord(item.raw);
  const party = partyOf(item);
  const passengerFallback =
    kind === 'aereo' || kind === 'trem'
      ? plural(itemQuantity(item), 'passageiro', 'passageiros')
      : '';
  const blocks = legs
    .map((leg, index) => {
      const label = legLabel(kind, leg, roundTrip, index);
      return `<div class="lb"${index > 0 ? ' style="margin-top:8px"' : ''}>${escHtml(label)}</div>${routeHtml(leg)}`;
    })
    .join('');
  const sharedTags = tagsHtml([
    pick(raw, ['classe', 'cabine', 'classe_reserva']) ||
      legs.map((leg) => leg.cabin).find(Boolean) ||
      '',
    pick(raw, ['tarifa_nome', 'tarifa']) || legs.map((leg) => leg.fare).find(Boolean) || '',
    partyLabel(party.adults, party.children, passengerFallback),
    seatTag(pick(raw, ['assentos', 'assento']) || legs.map((leg) => leg.seats).find(Boolean) || '')
  ]);
  const title = textVal(item.title || item.product_name);
  const body = blocks || `<b>${escHtml(title || 'Passagem')}</b>`;
  const unit =
    kind === 'trem' || kind === 'aereo' ? ['passagem', 'passagens'] : ['serviço', 'serviços'];
  return rowHtml(
    kind === 'trem' ? 'train' : 'plane',
    `${body}${sharedTags}`,
    plural(itemQuantity(item), unit[0], unit[1]),
    showValues ? formatCurrency(itemAmount(item), item.currency || 'BRL') : ''
  );
}

function hotelMeta(item: QuoteItemForPdf): string {
  const raw = asRecord(item.raw);
  const starsRaw = pick(raw, ['estrelas', 'stars', 'categoria']);
  const stars = /^\d+$/.test(starsRaw) ? plural(Number(starsRaw), 'estrela', 'estrelas') : starsRaw;
  const room = pick(raw, ['apto', 'acomodacao', 'tipo_apto', 'tipo_apartamento']);
  return [stars, room].filter(Boolean).join(' · ');
}

function stayCount(item: QuoteItemForPdf, mode: 'noites' | 'diarias'): number | null {
  const raw = asRecord(item.raw);
  const explicit = numberOrNull(
    mode === 'noites'
      ? pick(raw, ['noites', 'qtd_noites'])
      : pick(raw, ['diarias', 'qtd_diarias', 'qtd_dias'])
  );
  if (explicit != null && explicit > 0) return explicit;
  const start = itemStart(item);
  const end = itemEnd(item);
  const diff = start && end ? diffDaysISODate(start, end) : null;
  if (diff == null || diff < 0) return null;
  return mode === 'noites' ? diff : diff + 1;
}

function serviceRow(item: QuoteItemForPdf, kind: ItemKind, showValues: boolean): string {
  const raw = asRecord(item.raw);
  const party = partyOf(item);
  const start = itemStart(item);
  const end = itemEnd(item);
  const name = textVal(item.title || item.product_name || item.item_type || 'Serviço');
  let label = '';
  let extra = '';
  let iconName = 'pin';
  let quantity = plural(itemQuantity(item), 'serviço', 'serviços');
  const tagLabels: string[] = [];

  if (kind === 'hotel') {
    const nights = stayCount(item, 'noites');
    label = ['HOTEL', formatRange(start, end), nights ? plural(nights, 'NOITE', 'NOITES') : '']
      .filter(Boolean)
      .join(' · ');
    extra = hotelMeta(item);
    iconName = 'bed';
    quantity = plural(itemQuantity(item), 'apartamento', 'apartamentos');
    tagLabels.push(pick(raw, ['regime', 'alimentacao']), partyLabel(party.adults, party.children));
  } else if (kind === 'carro') {
    const days = stayCount(item, 'diarias');
    label = ['CARRO', formatRange(start, end), days ? plural(days, 'DIÁRIA', 'DIÁRIAS') : '']
      .filter(Boolean)
      .join(' · ');
    extra = textVal(item.item_type) || 'Aluguel de carro';
    iconName = 'car';
    quantity = plural(itemQuantity(item), 'carro', 'carros');
    tagLabels.push(
      pick(raw, ['km', 'km_livre', 'franquia_km']),
      pick(raw, ['seguros', 'seguro', 'protecao']),
      pick(raw, ['tanque', 'combustivel'])
    );
  } else if (kind === 'trem') {
    return transportRow(item, 'trem', showValues);
  } else {
    const prefix =
      kind === 'passeio' ? 'PASSEIO' : textVal(item.item_type || 'SERVIÇO').toUpperCase();
    const when = formatRange(start, end);
    label = [prefix, when].filter(Boolean).join(' · ');
    extra = textVal(item.product_name && item.product_name !== name ? item.product_name : '');
    iconName = kind === 'passeio' ? 'ticket' : 'pin';
    tagLabels.push(partyLabel(party.adults, party.children));
  }

  const circuitDays = (item.segments || [])
    .filter((segment) => normalizeText(segment.segment_type) === 'circuit_day')
    .sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0));
  let daysHtml = '';
  for (const [index, segment] of circuitDays.entries()) {
    const data = asRecord(segment.data);
    const dayNumber = numberOrNull(data.dia) || index + 1;
    const dayTitle = textVal(data.titulo);
    const description = textVal(data.descricao);
    const heading = dayTitle ? `Dia ${dayNumber} — ${dayTitle}` : `Dia ${dayNumber}`;
    daysHtml += `<div class="mu" style="font-size:8pt;margin-top:4px"><b>${escHtml(heading)}</b>${description ? ` · ${escHtml(description)}` : ''}</div>`;
  }

  const body = `${label ? `<div class="lb">${escHtml(label)}</div>` : ''}<b>${escHtml(name)}</b>${extra ? `<div class="mu" style="font-size:8pt">${escHtml(extra)}</div>` : ''}${tagsHtml(tagLabels)}${daysHtml}`;
  return rowHtml(
    iconName,
    body,
    quantity,
    showValues ? formatCurrency(itemAmount(item), item.currency || 'BRL') : ''
  );
}

function rowHtml(iconName: string, body: string, quantity: string, value: string): string {
  return `<div class="row"><div>${icon(iconName)}</div><div>${body}</div><div class="q">${escHtml(quantity)}</div><div class="v">${escHtml(value)}</div></div>`;
}

function sectionCard(title: string, note: string, subtotal: string, rows: string): string {
  return `<div class="sec"><div class="sh"><span>${escHtml(title)}${note ? ` <small>· ${escHtml(note)}</small>` : ''}</span>${subtotal ? `<span>${escHtml(subtotal)}</span>` : ''}</div>${rows}</div>`;
}

function airSummary(items: QuoteItemForPdf[]): string {
  const phrases: string[] = [];
  for (const item of items) {
    const legs = legsOf(item);
    if (isRoundTrip(legs)) {
      const from = legs[0].originCity || legs[0].originCode;
      const to = legs[0].destCity || legs[0].destCode;
      if (from && to) phrases.push(`${from} ⇄ ${to}`);
      continue;
    }
    for (const leg of legs) {
      const from = leg.originCity || leg.originCode;
      const to = leg.destCity || leg.destCode;
      if (from && to) phrases.push(`${from} → ${to}`);
    }
  }
  return joinNames(phrases);
}

function infoIcon(line: string): string {
  const text = normalizeText(line);
  if (text.includes('cambio') || text.includes('preco') || text.includes('real ('))
    return 'banknote';
  if (text.includes('crianca')) return 'baby';
  if (text.includes('tomada de preco') || text.includes('orcamento e apenas')) return 'file';
  if (text.includes('reserv') || text.includes('fornecedor')) return 'calendarx';
  if (text.includes('tarifa') || text.includes('disponib')) return 'tag';
  return 'info';
}

function validadeOf(quote: QuoteForPdf): string {
  const raw = asRecord(quote.raw_json);
  return (
    isoDate(pick(raw, ['valid_until', 'data_validade', 'validade'])) ||
    isoDate(addDaysISODate(quote.created_at, 30))
  );
}

function periodOf(quote: QuoteForPdf, items: QuoteItemForPdf[]): string {
  const embark = isoDate(quote.data_embarque);
  const finish = isoDate(quote.data_final);
  if (embark || finish) return formatRange(embark || finish, finish || embark);
  const dates = items
    .flatMap((item) => [itemStart(item), itemEnd(item)])
    .filter(Boolean)
    .sort();
  if (!dates.length) return '';
  return formatRange(dates[0], dates[dates.length - 1]);
}

function travelersOf(items: QuoteItemForPdf[]): string {
  let adults: number | null = null;
  let children: number | null = null;
  let passengers = 0;
  for (const item of items) {
    const party = partyOf(item);
    if (party.adults != null) adults = Math.max(adults ?? 0, party.adults);
    if (party.children != null) children = Math.max(children ?? 0, party.children);
    const kind = itemKind(item);
    if (kind === 'aereo' || kind === 'trem') passengers = Math.max(passengers, itemQuantity(item));
  }
  return (
    partyLabel(adults, children) ||
    (passengers > 0 ? plural(passengers, 'passageiro', 'passageiros') : '')
  );
}

export function buildQuoteCardsHtml(params: {
  quote: QuoteForPdf;
  items: QuoteItemForPdf[];
  settings: QuotePdfSettings;
  qrUrl: string | null;
  complementUrl: string | null;
  showItems: boolean;
  showItemValues: boolean;
  discount?: number;
}): string {
  const { quote, items, settings, qrUrl, complementUrl, showItems, showItemValues } = params;
  const discount = Math.max(Number.isFinite(params.discount) ? Number(params.discount) : 0, 0);
  const currency = quote.currency || 'BRL';
  const ordered = [...items].sort((a, b) => itemStart(a).localeCompare(itemStart(b)) || 0);
  const air = ordered.filter((item) => itemKind(item) === 'aereo');
  const ground = ordered.filter((item) => itemKind(item) !== 'aereo');
  const airTotal = air.reduce((sum, item) => sum + itemAmount(item), 0);
  const groundTotal = ground.reduce((sum, item) => sum + itemAmount(item), 0);
  const total = Math.max(airTotal + groundTotal - discount, 0);
  const clientName = textVal(quote.client_name) || 'Cliente';
  const consultant = textVal(settings.consultor_nome);
  const firstName = consultant.split(/\s+/)[0] || '';
  const phones = [textVal(settings.telefone), textVal(settings.whatsapp)].filter(
    (value, index, all) => value && all.indexOf(value) === index
  );
  const contacts = [...phones, textVal(settings.email)].filter(Boolean).join(' · ');
  const cities = ground
    .map((item) => textVal(item.city_name))
    .filter((city, index, all) => city && all.indexOf(city) === index);
  const destinationNames =
    cities.length > 0
      ? cities
      : air
          .flatMap((item) => legsOf(item).map((leg) => leg.destCity || leg.destCode))
          .filter(Boolean);
  const validade = validadeOf(quote);
  const emission = isoDate(quote.created_at);
  const footerLines = textVal(settings.rodape_texto)
    ? textVal(settings.rodape_texto)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [
        'Preços em real (R$) convertidos ao câmbio do dia, sujeitos a alteração e disponibilidade da tarifa.',
        'Valor da criança válido somente quando acompanhada de dois adultos pagantes no mesmo apartamento.',
        'Este orçamento é apenas uma tomada de preço.',
        'Os serviços citados não estão reservados; a compra somente poderá ser confirmada após a confirmação dos fornecedores.',
        'Este orçamento foi feito com base na menor tarifa para os serviços solicitados, podendo sofrer alteração devido à disponibilidade de lugares no ato da compra.'
      ];

  const cityGroups = new Map<string, QuoteItemForPdf[]>();
  for (const item of ground) {
    const city = textVal(item.city_name) || 'Serviços';
    const current = cityGroups.get(city) || [];
    current.push(item);
    cityGroups.set(city, current);
  }
  const groups = [...cityGroups.entries()].sort((a, b) =>
    itemStart(a[1][0]).localeCompare(itemStart(b[1][0]))
  );

  let itemsHtml = '';
  if (showItems && ordered.length === 0) {
    itemsHtml = '<div class="card mu">Sem itens neste orçamento.</div>';
  } else if (showItems) {
    if (air.length > 0) {
      itemsHtml += sectionCard(
        'Passagens aéreas',
        airSummary(air),
        showItemValues ? formatCurrency(airTotal, currency) : '',
        air.map((item) => transportRow(item, 'aereo', showItemValues)).join('')
      );
    }
    for (const [city, cityItems] of groups) {
      const dates = cityItems
        .flatMap((item) => [itemStart(item), itemEnd(item)])
        .filter(Boolean)
        .sort();
      const subtotal = cityItems.reduce((sum, item) => sum + itemAmount(item), 0);
      itemsHtml += sectionCard(
        city,
        formatRange(dates[0], dates[dates.length - 1], true),
        showItemValues ? formatCurrency(subtotal, currency) : '',
        cityItems.map((item) => serviceRow(item, itemKind(item), showItemValues)).join('')
      );
    }
  }

  const discountNote = discount > 0 ? ` · desconto ${formatCurrency(discount, currency)}` : '';
  const totalNote = showItemValues
    ? `Aéreo ${formatCurrency(airTotal, currency)} + Serviços ${formatCurrency(groundTotal, currency)}${discountNote}`
    : '';
  const infoRows = footerLines
    .map((line) => `<div class="ii">${icon(infoIcon(line))}<span>${escHtml(line)}</span></div>`)
    .join('');
  const validityText = validade ? `Tarifas válidas até ${formatISODateBR(validade)}.` : '';

  const css = `@page{size:A4;margin:0}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1F2937;margin:0;font-size:9.4pt}
.pg{padding:9mm 13mm 6mm}.mu{color:#6B7280}.tag{display:inline-block;background:#EEF2F7;color:#1B2C80;border-radius:20px;padding:2px 8px;font-size:7.5pt;margin:4px 4px 0 0}
.hd{display:flex;justify-content:space-between;align-items:center}.hd img{height:40px}.hd .c{text-align:right;font-size:8.3pt;line-height:1.5}
.band{margin:0 0 8px;break-inside:avoid;display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr 1.3fr;border-radius:12px;overflow:hidden;border:1px solid #DDE3EC}
.band>div{padding:10px 12px;border-right:1px solid #DDE3EC}.band b{display:block;font-size:7pt;color:#6B7280;letter-spacing:1px;margin-bottom:3px}.band span{font-weight:bold;color:#1B2C80;font-size:9.5pt}
.band .tt{background:#243AA3;border:0}.band .tt b{color:#fff;opacity:.75}.band .tt span{color:#fff;font-size:14pt}
.band .val span{color:#C62828}
h1{font-size:17pt;color:#1B2C80;margin:0 0 2px}
.sec{border:1px solid #DDE3EC;border-radius:12px;margin-bottom:8px;overflow:hidden;break-inside:avoid}
.sh{background:#EEF2F7;display:flex;justify-content:space-between;align-items:center;padding:8px 12px;font-weight:bold;color:#1B2C80}.sh small{font-weight:normal;color:#6B7280}
.row{display:grid;grid-template-columns:22px 1fr 90px 90px;gap:8px;padding:6px 12px;border-top:1px solid #EEF2F7}.sh+.row{border-top:0}
.v{text-align:right;font-weight:bold}.q{color:#6B7280;font-size:8.3pt}.rt{display:flex;align-items:center;gap:6px;font-weight:bold}.rt i{flex:0 0 40px;height:1px;background:#243AA3}
.p1{background:#C62828;color:#fff;font-weight:bold;border-radius:4px;padding:0 4px;font-size:7.5pt;margin-left:2px}.itn{font-size:8.5pt;color:#1B2C80;font-weight:bold;margin-top:1px}.lb{color:#6B7280;font-size:7.5pt;font-weight:bold}
.tot{display:flex;justify-content:space-between;align-items:center;font-size:12pt;font-weight:bold;color:#1B2C80}
.card{border:1px solid #DDE3EC;border-radius:12px;padding:11px 14px;margin-bottom:8px;break-inside:avoid;background:#fff}
.two{display:grid;grid-template-columns:1.9fr 1fr;gap:10px;break-inside:avoid}.inf{font-size:7.8pt;color:#4B5563}.ii{display:flex;gap:8px;align-items:center;padding:2px 0;font-size:7.9pt;line-height:1.35}
.cta{background:#243AA3;color:#fff;border-radius:12px;padding:12px;display:flex;gap:10px;align-items:center}.cta img{height:62px;background:#fff;border-radius:6px;padding:3px}
.ico{width:16px;height:16px;display:block}
.toolbar{display:flex;justify-content:flex-end;padding:8px 13mm 0}
.toolbar button{border:0;border-radius:999px;padding:8px 14px;background:#243AA3;color:#fff;font-family:Arial,Helvetica,sans-serif;cursor:pointer}
@media print{.toolbar{display:none}}`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Orçamento ${escHtml(clientName)}</title>
  <style>${css}</style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div>
  <div class="pg">
    <div class="card"><div class="hd"><img src="${VTUR_LOGO_URL}" alt="VTur" /><div class="c">${consultant ? `<b style="color:#1B2C80;font-size:10pt">${escHtml(consultant)}</b> · ` : ''}Consultor de viagens${contacts ? `<br><span class="mu">${escHtml(contacts)}</span>` : ''}</div></div></div>
    <div class="card"><h1>Proposta de viagem</h1><div class="mu">Para <b style="color:#1F2937">${escHtml(clientName)}</b>${destinationNames.length ? ` · ${escHtml(joinNames(destinationNames))}` : ''}</div></div>
    <div class="band">
      <div><b>PERÍODO</b><span>${escHtml(periodOf(quote, ordered) || '—')}</span></div>
      <div><b>VIAJANTES</b><span>${escHtml(travelersOf(ordered) || '—')}</span></div>
      <div><b>EMISSÃO</b><span>${escHtml(emission ? formatISODateBR(emission) : '—')}</span></div>
      <div class="val"><b>VALIDADE</b><span>${escHtml(validade ? formatISODateBR(validade) : '—')}</span></div>
      <div class="tt"><b>TOTAL</b><span>${escHtml(formatCurrency(total, currency))}</span></div>
    </div>
    ${itemsHtml}
    <div class="card tot" style="background:#EEF2F7"><span>Total da viagem${totalNote ? ` <span class="mu" style="font-size:8.5pt;font-weight:normal">· ${escHtml(totalNote)}</span>` : ''}</span><span>${escHtml(formatCurrency(total, currency))}</span></div>
    <div class="two">
      <div class="inf card" style="margin:0"><b style="color:#1B2C80;font-size:9pt">Informações importantes</b>${infoRows}${complementUrl ? `<div style="margin-top:8px"><img src="${escHtml(complementUrl)}" alt="Imagem complementar" style="max-width:100%;max-height:120px" /></div>` : ''}</div>
      <div class="cta">${qrUrl ? `<img src="${escHtml(qrUrl)}" alt="QR Code WhatsApp" />` : ''}<div><b>Reserve com o ${escHtml(firstName || 'consultor')}</b><br><span style="font-size:8.3pt;opacity:.9">Aponte a câmera para o QR Code e fale no WhatsApp.${validityText ? ` ${escHtml(validityText)}` : ''}</span></div></div>
    </div>
  </div>
</body>
</html>`;
}
