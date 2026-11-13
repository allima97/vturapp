import { escapeHtml } from '$lib/utils/html';
import { diffDaysISODate } from '$lib/date';
import { formatarDataPassagem } from '$lib/passagens/data';
import { printLocationIcon, requiresPrintContinuation } from '$lib/utils/printLayout';
import { nomeCidadeNoPdf } from './preview-cidade';
import type { RotHotel, RotPasseio, RotTransporte } from './tipos';

type FormatDate = (value: string | null | undefined) => string;
type SectionIcon = 'itinerary' | 'hotels' | 'optionals' | 'flights';

const sectionIcons: Record<Exclude<SectionIcon, 'flights'>, string> = {
  itinerary:
    '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M5 7v2c0 3 3 3 6 3s6 0 6 3v2"/>',
  hotels: '<path d="M4 21V5l8-3 8 3v16M2 21h20M10 21v-4h4v4M8 8h1m6 0h1M8 12h1m6 0h1"/>',
  optionals:
    '<circle cx="7" cy="16" r="4"/><circle cx="17" cy="16" r="4"/><path d="M3 16 5 7h3l3 9m2 0 3-9h3l2 9M9 10h6"/>'
};

function flightPlane(className = '', tilted = true) {
  return `<svg class="roteiro-flight-plane${className ? ` ${className}` : ''}" xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 28 28" fill="currentColor" aria-hidden="true" focusable="false"><path${tilted ? ' transform="rotate(-35 12 12)"' : ''} d="M22 12c0-.7-1-1.3-2-1.4L15 10 9 3H6l4 6.5-5-.2L3 7H1l1.5 5L1 17h2l2-2.3 5-.2L6 21h3l6-7 5-.6c1-.1 2-.7 2-1.4z"/></svg>`;
}

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

function cityTitle(city: string) {
  return `<div class="roteiro-card-city">${printLocationIcon}${escapeHtml(nomeCidadeNoPdf(city))}</div>`;
}

function field(label: string, value: string) {
  return `<p class="roteiro-card-detail"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value || '-')}</p>`;
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
          cityTitle(city),
          field('Hotel', text(hotel.hotel)),
          field('Check In/Out', period),
          field('Noites', hotel.noites && hotel.noites > 0 ? String(hotel.noites) : '-'),
          field('Acomodação', text(hotel.apto)),
          field('Regime', text(hotel.regime)),
          text(hotel.endereco) ? field('Endereço', text(hotel.endereco)) : ''
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
            cityTitle(city),
            field('Passeio', text(item.passeio)),
            field('Data', date),
            field('Ingressos', text(item.ingressos))
          ].join(''),
          [city, item.passeio, item.ingressos].join('\n')
        );
      })
      .join('')
  ).join('');
}

function flightPlace(
  city: string,
  airportCode: string | null | undefined,
  date: string,
  label: string,
  destination = false
) {
  const place = city.trim();
  const code = text(airportCode).toUpperCase();
  return `<div class="roteiro-flight-place${destination ? ' roteiro-flight-destination' : ''}">
    <strong class="roteiro-flight-code">${escapeHtml(code || '-')}</strong>
    ${place && place.toUpperCase() !== code ? `<strong>${escapeHtml(place)}</strong>` : ''}
    <p>${escapeHtml(label)}: ${escapeHtml(date || '-')}</p>
  </div>`;
}

export function renderPreviewFlights(items: RotTransporte[], formatDate: FormatDate) {
  return items
    .map((item, index) => {
      const [from = '', to = ''] = text(item.trecho).split(/\s*(?:→|->)\s*|\s+-\s+/);
      const airline = text(item.cia_aerea) || 'AÉREO';
      const departure = [formatDate(item.data_voo || item.data_inicio), text(item.hora_saida)]
        .filter(Boolean)
        .join(' • ');
      const arrival = [
        formatDate(item.data_fim || item.data_voo || item.data_inicio),
        text(item.hora_chegada)
      ]
        .filter(Boolean)
        .join(' • ');
      const duration = text(item.duracao_voo);
      const days = diffDaysISODate(item.data_voo || item.data_inicio, item.data_fim);
      const arrivalNotice =
        days === 1
          ? 'Chegada no dia seguinte (+1)'
          : days && days > 1
            ? `Chegada ${days} dias depois (+${days})`
            : days === -1
              ? 'Chegada no dia anterior (-1)'
              : days && days < -1
                ? `Chegada ${-days} dias antes (${days})`
                : '';
      const details = [
        ['COMPANHIA', airline, 'companhia'],
        ['CLASSE', text(item.classe_reserva), 'classe'],
        ['TARIFA', text(item.tarifa_nome), 'tarifa']
      ]
        .filter(([, value]) => value)
        .map(
          ([label, value, position]) =>
            `<div class="roteiro-flight-detail-${position}"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`
        )
        .join('');
      const flightDate = formatarDataPassagem(item.data_voo || item.data_inicio, true);
      const content = `<div class="roteiro-flight-header"><span>TRECHO ${index + 1} — ${escapeHtml(flightDate)}</span><span>Voo ${flightPlane()} ${escapeHtml(text(item.descricao) || 'Não informado')}</span></div>
        <div class="roteiro-flight-body">
          <div class="roteiro-flight-route">
            ${flightPlace(from, item.aeroporto_saida, departure, 'Saída')}
            <div class="roteiro-flight-duration"><strong>DURAÇÃO: ${escapeHtml(duration || 'Não informada')}</strong><span>${flightPlane('', false)}</span>${arrivalNotice ? `<small class="roteiro-flight-arrival-notice">${escapeHtml(arrivalNotice)}</small>` : ''}</div>
            ${flightPlace(to, item.aeroporto_chegada, arrival, 'Chegada', true)}
          </div>
          <div class="roteiro-flight-details">${details}</div>
        </div>`;
      return `<article class="card roteiro-card roteiro-flight${requiresPrintContinuation([item.trecho, item.cia_aerea, item.descricao, item.classe_reserva, item.tarifa_nome, item.duracao_voo].join('\n')) ? ' roteiro-card--long' : ''}">${content}</article>`;
    })
    .join('');
}
