import { quoteCheckIcon, quoteXIcon } from '$lib/quote/pdfIcons';

export function roteiroIconChips(
  items: string[],
  escape: (value: string) => string,
  icon: string = quoteCheckIcon
) {
  return `<div class="chks">${items
    .map((item) => `<div class="chk">${icon}<span>${escape(item)}</span></div>`)
    .join('')}</div>`;
}

export function roteiroCheckChips(items: string[], escape: (value: string) => string) {
  return roteiroIconChips(items, escape, quoteCheckIcon);
}

export function roteiroXChips(items: string[], escape: (value: string) => string) {
  return roteiroIconChips(items, escape, quoteXIcon);
}

/** Visual do PDF de orçamento, aplicado ao roteiro sem alterar o HTML do orçamento. */
export const roteiroPdfThemeCss = `
  html, body, body * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1F2937; font-size: 9.4pt; background: #fff; }
  .shell { max-width: 900px; }
  .toolbar { background: #f8fafc; }
  .print-action { border-radius: 999px; background: #0f766e; font-weight: 600; }
  .preview-header-card, .preview-title-card, .preview-footer-card {
    background: #fff;
    border: 1.5px solid #C5CED9;
    border-radius: 12px;
    box-shadow: none;
    color: #1F2937;
    font-family: Arial, Helvetica, sans-serif;
    overflow: visible;
    height: auto;
    min-height: 0;
  }
  .preview-header-card { padding: 12px 14px; margin: 0 0 8px; }
  .preview-logo { max-width: 120px; max-height: 56px; }
  .preview-header-copy, .preview-header-right, .preview-right-lines { font-family: Arial, Helvetica, sans-serif; color: #334155; }
  .preview-title-card { padding: 11px 14px; margin: 0 0 8px; }
  .preview-title-kicker { color: #243AA3; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; font-family: Arial, Helvetica, sans-serif; }
  .preview-title-name, .preview-title-card h1 { margin: 2px 0 0; font-size: 17pt; font-weight: bold; color: #1B2C80; font-family: Arial, Helvetica, sans-serif; line-height: 1.2; }
  .preview-title-meta, .preview-title-card .mu { color: #6B7280; font-size: 8pt; font-weight: normal; margin-top: 4px; }
  .preview-title-card .mu b { color: #1F2937; }
  .rot-band { margin: 0 0 8px; break-inside: avoid; page-break-inside: avoid; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); border-radius: 12px; border: 1.5px solid #C5CED9; position: relative; overflow: visible; background: #fff; height: auto; }
  .rot-band::after { content: ""; position: absolute; inset: -1.5px; border: 1.5px solid #C5CED9; border-radius: 12px; pointer-events: none; }
  .rot-band > div { padding: 10px 12px; border-right: 1.5px solid #C5CED9; background: #fff; }
  .rot-band > div:first-child { border-top-left-radius: 10.5px; border-bottom-left-radius: 10.5px; }
  .rot-band > div:last-child { border-right: 0; border-top-right-radius: 10.5px; border-bottom-right-radius: 10.5px; }
  .rot-band b { display: block; font-size: 7pt; color: #6B7280; letter-spacing: 1px; margin-bottom: 3px; font-weight: bold; }
  .rot-band span { font-weight: bold; color: #1B2C80; font-size: 9.5pt; }
  .roteiro-print-section, .section {
    margin: 0 0 8px;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
    height: auto;
    min-height: 0;
    overflow: visible;
    break-inside: auto;
    page-break-inside: auto;
    break-before: auto;
    page-break-before: auto;
  }
  .section > h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 8px 12px;
    border: 1.5px solid #C5CED9;
    border-bottom: 0;
    border-radius: 10.5px 10.5px 0 0;
    background: #D0DAEA;
    color: #1B2C80;
    font: bold 11px Arial, Helvetica, sans-serif;
    text-align: left;
    break-after: avoid;
    page-break-after: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .roteiro-print-table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 0 0 8px; height: auto; background: transparent; break-inside: auto; page-break-inside: auto; }
  .roteiro-print-table thead { display: table-header-group; break-after: avoid; page-break-after: avoid; }
  .roteiro-print-table thead tr, .roteiro-print-table tbody tr { break-inside: avoid; page-break-inside: avoid; height: auto; }
  .roteiro-print-table thead th {
    padding: 0;
    border: 1.5px solid #C5CED9;
    border-bottom: 0;
    border-radius: 10.5px 10.5px 0 0;
    background: #D0DAEA;
    text-align: left;
    font-weight: bold;
    color: #1B2C80;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .roteiro-print-table thead h2, .roteiro-print-section h2, .rot-sh {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 8px 12px;
    border: 0;
    border-radius: 10.5px 10.5px 0 0;
    background: transparent;
    color: #1B2C80;
    font: bold 11px Arial, Helvetica, sans-serif;
    text-align: left;
  }
  .roteiro-print-table tbody td {
    padding: 6px 12px;
    border-left: 1.5px solid #C5CED9;
    border-right: 1.5px solid #C5CED9;
    border-bottom: 1.5px solid #C5CED9;
    background: #fff;
    vertical-align: top;
    height: auto;
  }
  .roteiro-print-table tbody tr:last-child td { border-bottom-left-radius: 10.5px; border-bottom-right-radius: 10.5px; }
  .roteiro-print-table .roteiro-card, .roteiro-print-table .row.rot-row, .roteiro-print-table .card {
    border: 0;
    border-radius: 0;
    margin: 0;
    padding: 0;
    background: transparent;
    box-shadow: none;
    height: auto;
  }
  .roteiro-print-title-icon, .rot-sh .orc-service-icon { width: 16px; height: 16px; margin-right: 8px; vertical-align: -3px; color: #243AA3; flex: none; }
  .roteiro-print-subtitle { display: inline; margin: 0; color: #6B7280; font-size: 8pt; font-weight: normal; }
  .roteiro-print-subtitle::before { content: " · "; }
  .section > .grid,
  .section > ul,
  .section > .chks,
  .section > .preview-table-wrap,
  .section > p {
    border-left: 1.5px solid #C5CED9;
    border-right: 1.5px solid #C5CED9;
    background: #fff;
    margin: 0;
  }
  .section > :last-child {
    border-bottom: 1.5px solid #C5CED9;
    border-bottom-left-radius: 10.5px;
    border-bottom-right-radius: 10.5px;
  }
  .roteiro-card, .row.rot-row {
    border-radius: 0;
    padding: 6px 12px;
    color: #1F2937;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.4pt;
    overflow: visible;
    height: auto;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .roteiro-card--long, .roteiro-optional-item--long { break-inside: auto; page-break-inside: auto; }
  .row.rot-row, .rot-hotel { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 8px; align-items: start; }
  .roteiro-card h3, .rot-item-title, .rot-item-title b, .roteiro-optional-item h3 {
    margin: 0 0 2px;
    color: #1F2937;
    font: bold 9.4pt Arial, Helvetica, sans-serif;
    line-height: 1.3;
  }
  .roteiro-card p { margin: 0; font-family: Arial, Helvetica, sans-serif; line-height: 1.45; color: #475569; }
  .roteiro-card .meta, .mu.sm, .lg .ct, .roteiro-card-city {
    color: #6B7280;
    font-size: 8pt;
    font-weight: normal;
    margin: 0 0 2px;
    font-family: Arial, Helvetica, sans-serif;
  }
  .roteiro-card-city { display: flex; align-items: center; gap: 6px; }
  .lb { color: #6B7280; font-size: 7.5pt; font-weight: bold; letter-spacing: .04em; margin: 0 0 2px; }
  .rt { display: flex; align-items: center; gap: 6px; font-weight: bold; }
  .lg { display: inline-flex; flex-direction: column; min-width: 0; max-width: 100%; overflow: hidden; }
  .lg .ct { color: #6B7280; white-space: nowrap; overflow-wrap: normal; }
  .mu { color: #6B7280; }
  .mu.sm, .lg .ct { font-size: 8pt; font-weight: normal; }
  .md { display: inline-flex; flex-direction: column; align-items: center; color: #6B7280; font-size: 6pt; font-weight: normal; justify-self: center; }
  .rtf { display: grid; grid-template-columns: minmax(0, 130px) minmax(12px, 64px) minmax(0, 1fr); justify-content: start; align-items: center; column-gap: 6px; font-weight: bold; width: 100%; max-width: 100%; min-width: 0; }
  .rtf.rota { grid-template-columns: max-content 70px max-content; justify-content: start; align-items: center; width: auto; max-width: 100%; min-width: 0; }
  .rtf.rota > .lg:first-child { margin-right: 8px; }
  .rtf.rota > .lg:last-child { margin-left: 8px; }
  .rtf > .lg:last-child { margin-left: 22px; }
  .rt.rota { gap: 22px; font-size: 8.4pt; font-weight: bold; max-width: 100%; min-width: 0; white-space: nowrap; }
  .rtf .md { min-width: 0; flex: 0 1 34px; justify-content: center; }
  .md .ln { max-width: 100%; }
  .lni { display: inline-flex; align-items: center; gap: 4px; min-height: 12px; }
  .ln { display: inline-block; vertical-align: middle; border-top: 1.3px solid #243AA3; }
  .md .lni { margin: 2px 0; }
  .p1 { color: #C62828; font-weight: 700; font-size: 6.5pt; vertical-align: super; margin-left: 1px; letter-spacing: 0.2px; }
  .chks { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 14px; margin-top: 6px; }
  .chk { display: flex; align-items: center; gap: 6px; color: #1B2C80; font-size: 7.5pt; font-family: Arial, Helvetica, sans-serif; }
  .chk svg { flex: 0 0 auto; }
  .section > .grid, .section > .chks, .section > .preview-table-wrap, .section > ul, .section > p { padding: 8px 12px 12px; }
  .preview-table-wrap { overflow: visible; border: 0; border-radius: 0; }
  .preview-table { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; }
  .preview-table thead th { background: #D0DAEA; color: #1B2C80; font-weight: bold; border-bottom: 1px solid #C5CED9; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .preview-table tbody td { color: #1F2937; border-bottom: 1px solid #EEF2F7; }
  .preview-footer-card { padding: 11px 14px; margin: 8px 0 0; font-size: 7.9pt; color: #4B5563; }
  .card.compact h3 { color: #1F2937; font: bold 9.4pt Arial, Helvetica, sans-serif; }
  @media print {
    @page { size: A4; margin: 13mm; }
    html, body, body * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { background: #fff; }
    .shell { max-width: none; padding: 0; }
    .preview-header-card, .preview-title-card, .preview-footer-card, .rot-band {
      break-inside: avoid;
      page-break-inside: avoid;
      overflow: visible;
      box-shadow: none;
      border-radius: 12px;
      height: auto;
    }
    .roteiro-print-section, .section, .rot-body {
      break-inside: auto;
      page-break-inside: auto;
      break-before: auto;
      page-break-before: auto;
      overflow: visible;
      height: auto;
      min-height: 0;
    }
    .roteiro-print-table { break-inside: auto; page-break-inside: auto; height: auto; }
    .roteiro-print-table thead { display: table-header-group; }
    .roteiro-print-table thead th { background: #D0DAEA; border-radius: 10.5px 10.5px 0 0; }
    .section > h2 {
      background: #D0DAEA;
      color: #1B2C80;
      border-radius: 10.5px 10.5px 0 0;
    }
    .roteiro-card, .row.rot-row, .roteiro-optional-item {
      break-inside: avoid;
      page-break-inside: avoid;
      overflow: visible;
    }
    .roteiro-card--long, .roteiro-optional-item--long {
      break-inside: auto;
      page-break-inside: auto;
    }
  }
`;
