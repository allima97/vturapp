import { quoteCheckIcon } from '$lib/quote/pdfIcons';

export function roteiroCheckChips(items: string[], escape: (value: string) => string) {
  return `<div class="chks">${items
    .map((item) => `<div class="chk">${quoteCheckIcon}<span>${escape(item)}</span></div>`)
    .join('')}</div>`;
}

/** Visual do PDF de orçamento, aplicado ao roteiro sem alterar o HTML do orçamento. */
export const roteiroPdfThemeCss = `
  html, body, body * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1F2937; font-size: 9.4pt; background: #fff; }
  .shell { max-width: 900px; }
  .toolbar { background: #f8fafc; }
  .print-action { border-radius: 999px; background: #0f766e; font-weight: 600; }
  .preview-header-card, .preview-title-card, .preview-footer-card, .section {
    background: #fff;
    border: 1.5px solid #C5CED9;
    border-radius: 12px;
    box-shadow: none;
    color: #1F2937;
    font-family: Arial, Helvetica, sans-serif;
    overflow: visible;
  }
  .preview-header-card { padding: 12px 14px; margin: 0 0 12px; }
  .preview-logo { max-width: 120px; max-height: 56px; }
  .preview-header-copy, .preview-header-right, .preview-right-lines { font-family: Arial, Helvetica, sans-serif; color: #334155; }
  .preview-title-card { padding: 11px 14px; margin: 0 0 8px; }
  .preview-title-kicker { color: #243AA3; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; font-family: Arial, Helvetica, sans-serif; }
  .preview-title-name, .preview-title-card h1 { margin: 2px 0 0; font-size: 17pt; font-weight: bold; color: #1B2C80; font-family: Arial, Helvetica, sans-serif; line-height: 1.2; }
  .preview-title-meta, .preview-title-card .mu { color: #6B7280; font-size: 8pt; font-weight: normal; margin-top: 4px; }
  .preview-title-card .mu b { color: #1F2937; }
  .rot-band { margin: 0 0 8px; break-inside: avoid; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); border-radius: 12px; border: 1.5px solid #C5CED9; position: relative; overflow: visible; background: #fff; }
  .rot-band::after { content: ""; position: absolute; inset: -1.5px; border: 1.5px solid #C5CED9; border-radius: 12px; pointer-events: none; }
  .rot-band > div { padding: 10px 12px; border-right: 1.5px solid #C5CED9; background: #fff; }
  .rot-band > div:first-child { border-top-left-radius: 10.5px; border-bottom-left-radius: 10.5px; }
  .rot-band > div:last-child { border-right: 0; border-top-right-radius: 10.5px; border-bottom-right-radius: 10.5px; }
  .rot-band b { display: block; font-size: 7pt; color: #6B7280; letter-spacing: 1px; margin-bottom: 3px; font-weight: bold; }
  .rot-band span { font-weight: bold; color: #1B2C80; font-size: 9.5pt; }
  .roteiro-print-section { margin: 0 0 8px; }
  .roteiro-print-table { width: 100%; border: 1.5px solid #C5CED9; border-radius: 12px; border-collapse: separate; border-spacing: 0; background: #fff; overflow: visible; break-inside: avoid; }
  .roteiro-print-section h2 {
    margin: 0;
    padding: 8px 12px;
    border: 0;
    border-top-left-radius: 10.5px;
    border-top-right-radius: 10.5px;
    background: #D0DAEA;
    color: #1B2C80;
    font: bold 11px Arial, Helvetica, sans-serif;
    text-align: left;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .roteiro-print-title-icon { width: 16px; height: 16px; margin-right: 8px; vertical-align: -3px; color: #243AA3; }
  .roteiro-print-subtitle { display: inline; margin: 0; color: #6B7280; font-size: 8pt; font-weight: normal; }
  .roteiro-print-subtitle::before { content: " · "; }
  .roteiro-card {
    margin: 0;
    border: 0;
    border-radius: 0;
    border-top: 1px solid #EEF2F7;
    background: #fff;
    color: #1F2937;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.4pt;
    padding: 8px 12px;
    overflow: visible;
  }
  .roteiro-card h3 { margin: 0 0 4px; color: #1B2C80; font: bold 10pt Arial, Helvetica, sans-serif; line-height: 1.3; }
  .roteiro-card p { font-family: Arial, Helvetica, sans-serif; line-height: 1.45; }
  .roteiro-card .meta, .roteiro-card .roteiro-card-detail, .lg .ct, .mu.sm {
    color: #6B7280;
    font-size: 8pt;
    font-weight: normal;
    margin-top: 2px;
  }
  .roteiro-card-city { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; color: #243AA3; font: bold 11pt Arial, Helvetica, sans-serif; }
  .roteiro-card-city .orc-service-icon { flex: none; }
  .rot-kicker { margin: 0 0 2px; color: #6B7280; font-size: 8pt; font-weight: bold; letter-spacing: .04em; text-transform: uppercase; }
  .roteiro-optional-item h3 { color: #1B2C80; font: bold 10pt Arial, Helvetica, sans-serif; }
  .roteiro-optional-item p { color: #1F2937; font-size: 9.4pt; }
  .section { margin: 0 0 8px; padding: 0; overflow: visible; break-inside: avoid; }
  .section h2 {
    margin: 0;
    padding: 8px 12px;
    background: #D0DAEA;
    color: #1B2C80;
    border-top-left-radius: 10.5px;
    border-top-right-radius: 10.5px;
    font: bold 11px Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .section .grid, .section > ul, .section > .chks, .section > .preview-table-wrap, .section > p { padding: 8px 12px 12px; }
  .chks { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 14px; }
  .chk { display: flex; align-items: center; gap: 6px; color: #1B2C80; font-size: 7.5pt; font-family: Arial, Helvetica, sans-serif; }
  .chk svg { flex: 0 0 auto; }
  .preview-table-wrap { overflow: visible; border: 0; border-radius: 0; }
  .preview-table { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; }
  .preview-table thead th { background: #D0DAEA; color: #1B2C80; font-weight: bold; border-bottom: 1px solid #C5CED9; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .preview-table tbody td { color: #1F2937; border-bottom: 1px solid #EEF2F7; }
  .preview-footer-card { padding: 11px 14px; margin: 8px 0 0; font-size: 7.9pt; color: #4B5563; }
  .card.compact h3 { color: #1B2C80; font: bold 10pt Arial, Helvetica, sans-serif; }
  .roteiro-flight {
    margin: 8px 12px;
    border: 1.5px solid #C5CED9;
    border-radius: 12px;
    overflow: visible;
    font-family: Arial, Helvetica, sans-serif;
    color: #1F2937;
  }
  .roteiro-flight-header {
    background: #D0DAEA;
    color: #1B2C80;
    border-top-left-radius: 10.5px;
    border-top-right-radius: 10.5px;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .roteiro-flight-code { color: #243AA3; font-size: 14pt; }
  .roteiro-flight-place p, .roteiro-flight-duration, .roteiro-flight-details span { color: #6B7280; font-size: 8pt; }
  .roteiro-flight-duration span { color: #243AA3; }
  .roteiro-flight-details { border-top: 1px solid #EEF2F7; }
  @media print {
    @page { size: A4; margin: 13mm; }
    html, body, body * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { background: #fff; }
    .shell { max-width: none; padding: 0; }
    .preview-header-card,
    .preview-title-card,
    .preview-footer-card,
    .section,
    .roteiro-print-table,
    .rot-band,
    .roteiro-card,
    .roteiro-flight,
    .card {
      break-inside: avoid;
      page-break-inside: avoid;
      overflow: visible;
      box-shadow: none;
      border-radius: 12px;
    }
    .roteiro-print-section h2, .section h2, .roteiro-flight-header {
      background: #D0DAEA;
      color: #1B2C80;
      border-top-left-radius: 10.5px;
      border-top-right-radius: 10.5px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .roteiro-card { border-radius: 0; }
    .roteiro-card:not(.roteiro-flight) { border-radius: 0; }
    .roteiro-flight { border-radius: 12px; overflow: visible; }
    .roteiro-card--long, .roteiro-flight.roteiro-card--long, .roteiro-optional-item--long {
      break-inside: auto;
      page-break-inside: auto;
      overflow: visible;
    }
  }
`;
