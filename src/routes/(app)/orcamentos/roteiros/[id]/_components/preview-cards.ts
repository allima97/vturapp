import { escapeHtml } from '$lib/utils/html';
import { serviceIconSvg } from '$lib/quote/pdfIcons';
import { printCardField, nomeCidadeNoPdf, requiresPrintContinuation } from '$lib/utils/printLayout';
import type { RotHotel, RotPasseio } from './tipos';

export { renderPreviewFlights } from '$lib/quote/printFlights';

type FormatDate = (value: string | null | undefined) => string;
type SectionIcon = 'itinerary' | 'hotels' | 'optionals' | 'flights' | 'passeios';

const sectionIconType: Record<SectionIcon, string> = {
  itinerary: 'passeio',
  hotels: 'hotel',
  passeios: 'passeio',
  optionals: 'ingresso',
  flights: 'passagem-section'
};

function cityTitle(city: string, iconType: string) {
  return `<div class="roteiro-card-city">${serviceIconSvg(iconType)}${escapeHtml(nomeCidadeNoPdf(city))}</div>`;
}

function iconeDoPasseio(tipo: string) {
  const nome = tipo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (nome.includes('seguro')) return 'seguro';
  if (nome.includes('ingresso')) return 'ingresso';
  if (nome.includes('transfer')) return 'transfer';
  if (nome.includes('show')) return 'show';
  if (nome.includes('trem') || nome.includes('ferro')) return 'trem';
  if (nome.includes('carro')) return 'aluguel_carro';
  return 'passeio';
}

export function buildRoteiroCardSection(
  title: string,
  content: string,
  sectionClass = '',
  subtitle = '',
  icon?: SectionIcon
) {
  if (!content.trim()) return '';
  const iconHtml = icon ? serviceIconSvg(sectionIconType[icon], 'roteiro-print-title-icon') : '';
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
        const noites = hotel.noites && hotel.noites > 0 ? hotel.noites : 0;
        const kicker = noites ? `Hotel · ${noites} ${noites === 1 ? 'noite' : 'noites'}` : 'Hotel';
        const content = [
          cityTitle(city, 'hotel'),
          `<p class="rot-kicker">${escapeHtml(kicker)}</p>`,
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
        const kicker = text(item.tipo) || 'Passeio';
        return card(
          [
            cityTitle(city, iconeDoPasseio(kicker)),
            `<p class="rot-kicker">${escapeHtml(kicker)}</p>`,
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
