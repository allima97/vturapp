export const planeIconShape =
  '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>';
export const trainIconShape =
  '<rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16M12 3v8M8 19l-2 3M18 22l-2-3M8 15h0M16 15h0"/>';
export const carIconShape =
  '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-3.4A2 2 0 0 0 13.7 6H8.3a2 2 0 0 0-1.6.8L4 10l-2 .6C1.4 10.9 1 11.6 1 12.3V16c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>';
export const hotelIconShape = '<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>';
const ticketIconShape =
  '<path d="M3 8V5h18v3a3 3 0 0 0 0 6v3H3v-3a3 3 0 0 0 0-6zm9-2v2m0 2v2m0 2v2"/>';
const tourIconShape =
  '<path d="M12 22s-7-6-7-12a7 7 0 1 1 14 0c0 6-7 12-7 12z"/><circle cx="12" cy="10" r="2"/>';
const transferIconShape =
  '<rect x="4" y="4" width="16" height="14" rx="2"/><path d="M4 11h16M7 18v2m10-2v2M7 15h2m6 0h2"/>';
const showIconShape =
  '<path d="M10 17V5l9-2v12M10 8l9-2"/><ellipse cx="7" cy="18" rx="3" ry="2"/><ellipse cx="16" cy="16" rx="3" ry="2"/>';
const insuranceIconShape = '<path d="M12 3 20 6v5c0 5-3 8-8 10-5-2-8-5-8-10V6zM9 12l2 2 4-4"/>';
const packageIconShape = '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>';
const serviceIconShape =
  '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 13h18m-10 0v2h2v-2"/>';
const moneyIconShape =
  '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>';

const serviceIcons = new Map<string, [string, string]>([
  ['hotel', ['hotel', hotelIconShape]],
  ['aluguel_carro', ['car', carIconShape]],
  ['ingresso', ['ticket', ticketIconShape]],
  ['trem', ['train', trainIconShape]],
  ['passeio', ['tour', tourIconShape]],
  ['transfer', ['transfer', transferIconShape]],
  ['show', ['show', showIconShape]],
  ['seguro', ['insurance', insuranceIconShape]],
  ['pacote', ['package', packageIconShape]],
  ['investimento', ['money', moneyIconShape]]
]);

export const quoteCheckIcon =
  '<svg width="11" height="11" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#243AA3" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg>';

export function serviceIconSvg(type: string, extraClass = '') {
  const iconType = type === 'hospedagem' ? 'hotel' : type === 'seguro_viagem' ? 'seguro' : type;
  const flight = iconType === 'passagem' || iconType === 'passagem-section';
  const [name, shape] = flight
    ? ['flight', planeIconShape]
    : (serviceIcons.get(iconType) ?? ['service', serviceIconShape]);
  const section =
    iconType === 'passagem-section' ? ' orc-section-icon orc-section-icon--flight' : '';
  const extra = extraClass ? ` ${extraClass}` : '';
  return `<svg class="orc-service-icon orc-service-icon--${name}${section}${extra}" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#243AA3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shape}</svg>`;
}
