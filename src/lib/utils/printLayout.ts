import { escapeHtml } from './html';

export const printLocationIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="vertical-align: -0.125em; margin-right: 0.3em"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

export function nomeCidadeNoPdf(cidade: string): string {
  const nome = cidade.split(',')[0].trim();
  return nome || cidade.trim();
}

export function printCityTitle(city: string) {
  return `<div class="roteiro-card-city">${printLocationIcon}${escapeHtml(nomeCidadeNoPdf(city))}</div>`;
}

export function printCardField(label: string, value: string, highlightValue = false) {
  const labelHtml = `${escapeHtml(label)}:`;
  const valueHtml = escapeHtml(value || '-');
  return `<p class="roteiro-card-detail">${highlightValue ? `${labelHtml} <strong>${valueHtml}</strong>` : `<strong>${labelHtml}</strong> ${valueHtml}`}</p>`;
}

export const roteiroCardStyles = `
  .roteiro-card { margin: 12px 0 0; border: 1px solid #9aaac2; border-radius: 18px; background: white; color: #1f2430; font-family: Georgia, "Times New Roman", serif; overflow-wrap: anywhere; padding: 14px 16px; }
  .roteiro-card h3 { font-size: 15px; line-height: 1.4; margin: 0 0 8px; }
  .roteiro-card p { margin: 0; line-height: 1.55; white-space: normal; }
  .roteiro-card-city { margin-bottom: 8px; color: #243aa3; font-size: 18px; font-weight: 700; }
  .roteiro-card .roteiro-card-detail { margin-top: 6px; line-height: 1.4; }
`;

export function requiresPrintContinuation(text: string) {
  return text.length > 5000 || text.split('\n').length > 37;
}
