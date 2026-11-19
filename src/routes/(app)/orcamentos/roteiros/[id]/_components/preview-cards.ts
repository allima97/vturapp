import { escapeHtml } from '$lib/utils/html';
import { quoteCheckIcon, serviceIconSvg } from '$lib/quote/pdfIcons';
import { nomeCidadeNoPdf, requiresPrintContinuation } from '$lib/utils/printLayout';
import type { RotHotel, RotPasseio } from './tipos';

export { renderPreviewFlights } from '$lib/quote/printFlights';

type FormatDate = (value: string | null | undefined) => string;

function cityTitle(city: string) {
  return `<div class="roteiro-card-city">${escapeHtml(nomeCidadeNoPdf(city))}</div>`;
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
  subtitle = ''
) {
  if (!content.trim()) return '';
  const subtitulo = subtitle
    ? `<span class="roteiro-print-subtitle">${escapeHtml(subtitle)}</span>`
    : '';
  return `<section class="roteiro-print-section ${escapeHtml(sectionClass)}"><table class="roteiro-print-table"><thead><tr><th><h2 class="rot-sh">${escapeHtml(title)}${subtitulo}</h2></th></tr></thead><tbody>${content}</tbody></table></section>`;
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

function card(content: string, source: string) {
  const longo = requiresPrintContinuation(source) ? ' roteiro-card--long' : '';
  return `<tr class="${longo.trim()}"><td><article class="roteiro-card${longo}">${content}</article></td></tr>`;
}

function conector() {
  return `<span class="md">${`<span class="lni"><span class="ln" style="width:50px"></span></span>`}</span>`;
}

function chip(label: string) {
  const value = text(label);
  if (!value || value === '-') return '';
  return `<div class="chks"><div class="chk">${quoteCheckIcon}<span>${escapeHtml(value)}</span></div></div>`;
}

export function renderPreviewHotels(items: RotHotel[], formatDate: FormatDate) {
  return Array.from(groupByCity(items, 'Hotéis'), ([city, hotels]) =>
    hotels
      .map((hotel) => {
        const start = formatDate(hotel.data_inicio);
        const end = formatDate(hotel.data_fim);
        const noites = hotel.noites && hotel.noites > 0 ? hotel.noites : 0;
        const kicker = noites ? `HOTEL · ${noites} ${noites === 1 ? 'NOITE' : 'NOITES'}` : 'HOTEL';
        const checkin = start ? `Check-in: ${start}` : '';
        const checkout = end ? `Check-out: ${end}` : '';
        const estadia =
          checkin && checkout
            ? `<div class="rtf rota"><span class="lg"><span class="rt rota">${escapeHtml(checkin)}</span></span>${conector()}<span class="lg"><span class="rt rota">${escapeHtml(checkout)}</span></span></div>`
            : checkin || checkout
              ? `<div class="rt rota">${escapeHtml(checkin || checkout)}</div>`
              : '';
        const detalhe = [text(hotel.apto), text(hotel.endereco)].filter(Boolean).join(' · ');
        const content = [
          `<div class="rot-hotel"><div>${serviceIconSvg('hotel')}</div><div>`,
          cityTitle(city),
          text(hotel.hotel)
            ? `<div class="rot-item-title"><b>${escapeHtml(text(hotel.hotel))}</b></div>`
            : '',
          `<div class="lb">${escapeHtml(kicker)}</div>`,
          estadia,
          detalhe ? `<div class="mu sm">${escapeHtml(detalhe)}</div>` : '',
          chip(text(hotel.regime)),
          `</div></div>`
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
            `<div class="rot-hotel"><div>${serviceIconSvg(iconeDoPasseio(kicker))}</div><div>`,
            cityTitle(city),
            `<div class="lb">${escapeHtml(kicker.toUpperCase())}</div>`,
            text(item.passeio)
              ? `<div class="rot-item-title"><b>${escapeHtml(text(item.passeio))}</b></div>`
              : '',
            date && date !== '-' ? `<p class="meta">${escapeHtml(date)}</p>` : '',
            text(item.ingressos) ? `<p>${escapeHtml(text(item.ingressos))}</p>` : '',
            `</div></div>`
          ].join(''),
          [city, item.passeio, item.ingressos].join('\n')
        );
      })
      .join('')
  ).join('');
}
