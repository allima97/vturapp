import { diffDaysISODate } from '$lib/date';
import { formatarDataPassagem } from '$lib/passagens/data';
import { escapeHtml } from '$lib/utils/html';
import { requiresPrintContinuation } from '$lib/utils/printLayout';

export type PrintFlight = {
  trecho: string;
  cidade_saida?: string;
  cidade_chegada?: string;
  cia_aerea: string;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  data_voo: string;
  classe_reserva: string;
  hora_saida: string;
  aeroporto_saida: string;
  duracao_voo: string;
  hora_chegada: string;
  aeroporto_chegada: string;
  tarifa_nome: string;
};

function text(value: string | null | undefined) {
  return String(value || '').trim();
}

export function flightPlane(className = '', tilted = true) {
  return `<svg class="roteiro-flight-plane${className ? ` ${className}` : ''}" xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 28 28" fill="currentColor" aria-hidden="true" focusable="false"><path${tilted ? ' transform="rotate(-35 12 12)"' : ''} d="M22 12c0-.7-1-1.3-2-1.4L15 10 9 3H6l4 6.5-5-.2L3 7H1l1.5 5L1 17h2l2-2.3 5-.2L6 21h3l6-7 5-.6c1-.1 2-.7 2-1.4z"/></svg>`;
}

function flightPlace(
  city: string,
  airportCode: string,
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

export function renderPreviewFlights(
  items: PrintFlight[],
  formatDate: (value: string | null | undefined) => string,
  extraHtml = ''
) {
  return items
    .map((item, index) => {
      const [routeFrom = '', routeTo = ''] = text(item.trecho).split(/\s*(?:→|->)\s*|\s+-\s+/);
      const from = text(item.cidade_saida) || routeFrom;
      const to = text(item.cidade_chegada) || routeTo;
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
          ${index === items.length - 1 ? extraHtml : ''}
        </div>`;
      return `<article class="card roteiro-card roteiro-flight${requiresPrintContinuation([item.trecho, item.cia_aerea, item.descricao, item.classe_reserva, item.tarifa_nome, item.duracao_voo].join('\n')) ? ' roteiro-card--long' : ''}">${content}</article>`;
    })
    .join('');
}

export const roteiroFlightStyles = `
  .roteiro-flight-plane { width: 1em; height: 1em; vertical-align: -0.15em; }
  .roteiro-flight { padding: 0; overflow: hidden; border-radius: 5px; font-family: Arial, sans-serif; color: #17233c; }
  .roteiro-flight-header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 12px; padding: 9px 14px; background: #243aa3; color: white; font-weight: bold; }
  .roteiro-flight-body { padding: 12px 14px; }
  .roteiro-flight-route { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 12px; align-items: center; }
  .roteiro-flight-place strong { display: block; }
  .roteiro-flight-code { color: #0075ca; font-size: 22px; }
  .roteiro-flight-place p { margin-top: 5px; color: #475569; }
  .roteiro-flight-destination { text-align: right; }
  .roteiro-flight-duration { color: #64748b; font-size: 10px; text-align: center; }
  .roteiro-flight-duration span { display: flex; align-items: center; width: 110px; margin: 0 auto; color: #0075ca; font-size: 18px; }
  .roteiro-flight-duration span::before, .roteiro-flight-duration span::after { content: ''; flex: 1; height: 2px; background: currentColor; }
  .roteiro-flight-duration .roteiro-flight-plane { flex: none; }
  .roteiro-flight-arrival-notice { display: block; color: #92400e; font-size: 10px; font-weight: 700; border: 1px solid #b45309; border-radius: 4px; padding: 3px 6px; margin-top: 4px; }
  .roteiro-flight-details { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; border-top: 1px dashed #dbe3ec; margin-top: 12px; padding-top: 10px; }
  .roteiro-flight-detail-companhia { grid-column: 1; }
  .roteiro-flight-detail-classe { grid-column: 2; text-align: center; }
  .roteiro-flight-detail-tarifa { grid-column: 3; text-align: right; }
  .roteiro-flight-details span { display: block; color: #64748b; font-size: 10px; font-weight: bold; }
  .roteiro-flight-details strong { overflow-wrap: anywhere; }
  @media (max-width: 500px) { .roteiro-flight-duration span { width: 40px; } .roteiro-flight-route { gap: 6px; } }
  @media print {
    .roteiro-flight.roteiro-card--long { overflow: visible; }
    .roteiro-flight-header { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }
`;
