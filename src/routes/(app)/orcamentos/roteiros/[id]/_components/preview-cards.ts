import { escapeHtml } from '$lib/utils/html';
import { flightPlane } from '$lib/quote/printFlights';
import { printCityTitle, printCardField, requiresPrintContinuation } from '$lib/utils/printLayout';
import type { RotHotel, RotPasseio } from './tipos';

export { renderPreviewFlights } from '$lib/quote/printFlights';

type FormatDate = (value: string | null | undefined) => string;
type SectionIcon = 'itinerary' | 'hotels' | 'optionals' | 'flights';

const sectionIcons: Record<Exclude<SectionIcon, 'flights'>, string> = {
  itinerary:
    '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M5 7v2c0 3 3 3 6 3s6 0 6 3v2"/>',
  hotels: '<path d="M4 21V5l8-3 8 3v16M2 21h20M10 21v-4h4v4M8 8h1m6 0h1M8 12h1m6 0h1"/>',
  optionals:
    '<circle cx="7" cy="16" r="4"/><circle cx="17" cy="16" r="4"/><path d="M3 16 5 7h3l3 9m2 0 3-9h3l2 9M9 10h6"/>'
};

export function buildRoteiroCardSection(
  title: string,
  content: string,
  sectionClass = '',
  subtitle = '',
  icon?: SectionIcon
) {
  if (!content.trim()) return '';
  const iconHtml =
    icon === 'flights'
      ? flightPlane('roteiro-print-title-icon')
      : icon
        ? `<svg class="roteiro-print-title-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${sectionIcons[icon]}</svg>`
        : '';
  return `<section class="roteiro-print-section ${escapeHtml(sectionClass)}"><table class="roteiro-print-table" role="presentation">
    <thead><tr><td><h2>${iconHtml}${escapeHtml(title)}${subtitle ? `<span class="roteiro-print-subtitle">${escapeHtml(subtitle)}</span>` : ''}</h2></td></tr></thead>
    <tbody><tr><td>${content}</td></tr></tbody>
  </table></section>`;
}

function text(value: string | null | undefined) {
  return String(value || '').trim();
}

function groupByCity<T extends { cidade: string }>(items: T[], fallback: string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const city = text(item.cidade) || fallback;
    const group = groups.get(city) || [];
    group.push(item);
    groups.set(city, group);
  }
  return groups;
}

function card(content: string, text: string) {
  return `<article class="card roteiro-card${requiresPrintContinuation(text) ? ' roteiro-card--long' : ''}">${content}</article>`;
}

export function renderPreviewHotels(items: RotHotel[], formatDate: FormatDate) {
  return Array.from(groupByCity(items, 'Hotéis'), ([city, hotels]) =>
    hotels
      .map((hotel) => {
        const start = formatDate(hotel.data_inicio);
        const end = formatDate(hotel.data_fim);
        const period = start || end ? `${start || '-'} a ${end || '-'}` : '-';
        const content = [
          printCityTitle(city),
          printCardField('Hotel', text(hotel.hotel), true),
          printCardField('Check In/Out', period, true),
          printCardField(
            'Noites',
            hotel.noites && hotel.noites > 0 ? String(hotel.noites) : '-',
            true
          ),
          printCardField('Acomodação', text(hotel.apto), true),
          printCardField('Regime', text(hotel.regime), true),
          text(hotel.endereco) ? printCardField('Endereço', text(hotel.endereco), true) : ''
        ].join('');
        return card(
          content,
          [city, hotel.hotel, hotel.endereco, hotel.apto, hotel.regime].join('\n')
        );
      })
      .join('')
  ).join('');
}

export function renderPreviewPasseios(items: RotPasseio[], formatDate: FormatDate) {
  return Array.from(groupByCity(items, 'Serviços'), ([city, passeios]) =>
    passeios
      .map((item) => {
        const start = formatDate(item.data_inicio);
        const end = formatDate(item.data_fim);
        const date = start && end && start !== end ? `${start} a ${end}` : start || end || '-';
        return card(
          [
            printCityTitle(city),
            printCardField('Passeio', text(item.passeio)),
            printCardField('Data', date),
            printCardField('Ingressos', text(item.ingressos))
          ].join(''),
          [city, item.passeio, item.ingressos].join('\n')
        );
      })
      .join('')
  ).join('');
}
