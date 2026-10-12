import { VTUR_LOGO_URL } from "$lib/brand";
import { normalizeVoucherExtraData, splitLinesFromMultilineText } from "./extraData";
import { addDaysISODate } from '$lib/date';
import type {
  VoucherAssetRecord,
  VoucherAppInfo,
  VoucherDia,
  VoucherHotel,
  VoucherPassengerDetail,
  VoucherRecord,
  VoucherTransferInfo,
} from "./types";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SHORT_DATE_RE = /^(\d{2})\/(\d{2})$/;
const DAY_TITLE_RE = /^\(([^)]+)\)\s*:\s*(.+)$/;

function textValue(value?: string | null) {
  return String(value || "").trim();
}

function escapeHtml(value?: string | null) {
  return textValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeLookupValue(value?: string | null) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatDateBR(value?: string | null) {
  const raw = textValue(value);
  if (!raw) return "";
  const match = raw.match(ISO_DATE_RE);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;

  const shortMatch = raw.match(SHORT_DATE_RE);
  if (shortMatch) return raw;
  return raw;
}

function providerLabel(provider?: string | null) {
  if (provider === "special_tours") return "Special Tours";
  if (provider === "europamundo") return "Europamundo";
  if (provider === "sato_tours") return "Sato Tours";
  return "Voucher";
}

const EUROPAMUNDO_APP_ICON_RULES: Array<{ match: (value: string) => boolean; iconUrl: string; alt: string }> = [
  {
    match: (value) => value.includes("suitcase") || value.includes("suit case"),
    iconUrl: "/icons/vouchers/europamundo/suitcase.webp",
    alt: "Mobile Suitcase",
  },
  {
    match: (value) => value.includes("uber"),
    iconUrl: "/icons/vouchers/europamundo/uber.webp",
    alt: "Uber",
  },
  {
    match: (value) =>
      value.includes("google tradutor") ||
      value.includes("google translator") ||
      value.includes("google translate") ||
      value.includes("tradutor google") ||
      value.includes("translate"),
    iconUrl: "/icons/vouchers/europamundo/google-tradutor.webp",
    alt: "Google Tradutor",
  },
  {
    match: (value) => value === "xe" || value.includes("xe currency") || value.startsWith("xe "),
    iconUrl: "/icons/vouchers/europamundo/xe-currency.webp",
    alt: "XE Currency",
  },
  {
    match: (value) => value.includes("accuweather") || value.includes("accuwheather") || value.includes("wheather"),
    iconUrl: "/icons/vouchers/europamundo/accuweather.webp",
    alt: "AccuWeather",
  },
  {
    match: (value) => value.includes("yelp"),
    iconUrl: "/icons/vouchers/europamundo/yelp.webp",
    alt: "Yelp",
  },
  {
    match: (value) => value.includes("europamundo"),
    iconUrl: "/icons/vouchers/europamundo/europamundo.webp",
    alt: "Europamundo",
  },
];

function getEuropamundoAppIcon(appName?: string | null, assets: VoucherAssetRecord[] = []) {
  const normalized = normalizeLookupValue(appName);
  if (!normalized) return null;
  const matchedRule = EUROPAMUNDO_APP_ICON_RULES.find((rule) => rule.match(normalized)) || null;
  if (!matchedRule) return null;

  const uploadedAsset = sortAssets(
    assets.filter(
      (asset) =>
        asset.provider === "europamundo" &&
        asset.asset_kind === "app_icon" &&
        textValue(asset.preview_url) &&
        matchedRule.match(normalizeLookupValue(asset.label)),
    ),
  )[0];

  if (uploadedAsset?.preview_url) {
    return {
      iconUrl: uploadedAsset.preview_url,
      alt: matchedRule.alt,
    };
  }

  return matchedRule;
}

function buildEuropamundoAppCard(app: VoucherAppInfo, assets: VoucherAssetRecord[] = []) {
  const icon = getEuropamundoAppIcon(app.nome, assets);
  return `
    <article class="sheet-card europa-app-card">
      <div class="europa-app-header">
        ${
          icon
            ? `<img class="europa-app-icon" src="${escapeHtml(icon.iconUrl)}" alt="${escapeHtml(icon.alt || app.nome || "App")}" />`
            : ""
        }
        <div class="europa-app-name">${escapeHtml(app.nome || "-")}</div>
      </div>
      <div class="europa-app-description">${escapeHtml(app.descricao || "").replace(/\n/g, "<br/>")}</div>
    </article>`;
}

function sortAssets(items: VoucherAssetRecord[]) {
  return items
    .slice()
    .sort((a, b) => {
      const firstOrder = Number(a.ordem ?? 0);
      const secondOrder = Number(b.ordem ?? 0);
      if (firstOrder !== secondOrder) return firstOrder - secondOrder;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });
}

function pickAssetUrls(assets: VoucherAssetRecord[], provider: string, kind: "image") {
  const preferred = sortAssets(
    assets.filter((asset) => asset.asset_kind === kind && asset.provider === provider && textValue(asset.preview_url)),
  );
  if (preferred.length) {
    const urls: string[] = [];
    for (const asset of preferred) {
      if (asset.preview_url) urls.push(asset.preview_url);
    }
    return urls;
  }

  const urls: string[] = [];
  for (const asset of sortAssets(
    assets.filter((asset) => asset.asset_kind === kind && asset.provider === "generic" && textValue(asset.preview_url)),
  )) {
    if (asset.preview_url) urls.push(asset.preview_url);
  }
  return urls;
}

function buildRouteTitle(voucher: VoucherRecord) {
  const code = textValue(voucher.codigo_fornecedor || voucher.codigo_systur);
  const name = textValue(voucher.nome || "Voucher");
  if (!code) return name;
  if (name.toLowerCase().startsWith(code.toLowerCase())) return name;
  return `${code} - ${name}`;
}

function parseDayTitle(value?: string | null) {
  const raw = textValue(value);
  const match = raw.match(DAY_TITLE_RE);
  if (!match) return { note: "", title: raw };
  return {
    note: textValue(match[1]),
    title: textValue(match[2]),
  };
}

function buildDayHeading(dia: VoucherDia) {
  const parsed = parseDayTitle(dia.titulo);
  const dayLabel = `Dia ${dia.dia_numero}${parsed.note ? ` (${parsed.note})` : ""}`;
  const prefix = dia.data_referencia ? `${formatDateBR(dia.data_referencia)} – ${dayLabel}` : dayLabel;
  return `${prefix}${parsed.title ? `: ${parsed.title}` : ""}`;
}

function addDaysToIsoDate(startDate: string, offset: number) {
  return addDaysISODate(textValue(startDate), offset);
}

function normalizePreviewDays(items: VoucherDia[], startDate?: string | null) {
  const sorted = items
    .slice()
    .sort((a, b) => (a.ordem ?? a.dia_numero) - (b.ordem ?? b.dia_numero))
    .map((item, index) => ({ ...item, ordem: index }));

  if (!addDaysToIsoDate(textValue(startDate), 0)) return sorted;

  return sorted.map((item, index) => ({
    ...item,
    data_referencia: addDaysToIsoDate(textValue(startDate), index),
    ordem: index,
  }));
}

function splitPassengerLines(value?: string | null) {
  const lines: string[] = [];
  for (const line of textValue(value).split(/\n+/)) {
    const normalized = line.trim();
    if (normalized) lines.push(normalized);
  }
  return lines;
}

function renderMultilineDivs(value?: string | null, emptyLabel = "-") {
  const lines = splitLinesFromMultilineText(value);
  if (!lines.length) return `<div>${escapeHtml(emptyLabel)}</div>`;
  return lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
}

function renderMultilineList(value?: string | null) {
  const lines = splitLinesFromMultilineText(value);
  if (!lines.length) return "";
  return `<ul class="voucher-bullet-list">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
}

function renderBulletListFromLines(lines: string[]) {
  const normalized: string[] = [];
  for (const line of lines) {
    const value = textValue(line);
    if (value) normalized.push(value);
  }
  if (!normalized.length) return "";
  return `<ul class="voucher-bullet-list">${normalized.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
}

function splitLinesIntoPrintableGroups(lines: string[], maxChars = 900) {
  const normalized: string[] = [];
  for (const line of lines) {
    for (const chunk of splitTextIntoPrintableChunks(line, maxChars)) {
      const value = textValue(chunk);
      if (value) normalized.push(value);
    }
  }

  if (!normalized.length) return [] as string[][];

  const groups: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (const line of normalized) {
    const lineChars = line.length + 2;
    if (current.length && currentChars + lineChars > maxChars) {
      groups.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(line);
    currentChars += lineChars;
  }

  if (current.length) groups.push(current);
  return groups;
}

function rebalanceTrailingSparsePage<T>(
  pages: T[][],
  getUnits: (item: T) => number,
  maxUnitsPerPage: number | ((pageIndex: number) => number),
  overflowAllowance = 1,
) {
  if (pages.length < 2) return pages;

  const copy = pages.map((page) => page.slice());
  const lastPageIndex = copy.length - 1;
  const lastPage = copy[lastPageIndex];
  if (lastPage.length !== 1) return copy;

  const previousPageIndex = lastPageIndex - 1;
  const previousPage = copy[previousPageIndex];
  const limit =
    typeof maxUnitsPerPage === "function"
      ? Math.max(1, maxUnitsPerPage(previousPageIndex))
      : Math.max(1, maxUnitsPerPage);
  const previousUnits = previousPage.reduce((sum, item) => sum + Math.max(1, getUnits(item)), 0);
  const lastItemUnits = Math.max(1, getUnits(lastPage[0]));

  if (previousUnits + lastItemUnits <= limit + overflowAllowance) {
    previousPage.push(lastPage[0]);
    copy.pop();
  }

  return copy;
}

function buildHotelDateRange(hotel: VoucherHotel) {
  const start = formatDateBR(hotel.data_inicio);
  const end = formatDateBR(hotel.data_fim);
  if (start && end) return `${start} a ${end}`;
  return start || end;
}

function buildUnifiedHotelCard(
  hotel: VoucherHotel,
  options: {
    showCity?: boolean;
    addressLabel?: string;
    periodLabel?: string;
  } = {},
) {
  const showCity = options.showCity !== false;
  const addressLabel = options.addressLabel || "Endereço";
  const periodLabel = options.periodLabel || "Check In/Out";
  const period = buildHotelDateRange(hotel);

  return `
    <article class="sheet-card voucher-hotel-card">
      ${showCity && textValue(hotel.cidade) ? `<div class="voucher-hotel-city">${escapeHtml(hotel.cidade || "-")}</div>` : ""}
      ${textValue(hotel.hotel) ? `<div class="voucher-hotel-detail voucher-hotel-name"><strong>Hotel:</strong> ${escapeHtml(hotel.hotel)}</div>` : ""}
      ${period ? `<div class="voucher-hotel-detail voucher-hotel-period"><strong>${escapeHtml(periodLabel)}:</strong> ${escapeHtml(period)}</div>` : ""}
      ${textValue(hotel.endereco) ? `<div class="voucher-hotel-detail"><strong>${escapeHtml(addressLabel)}:</strong> ${escapeHtml(hotel.endereco)}</div>` : ""}
      ${textValue(hotel.telefone) ? `<div class="voucher-hotel-detail"><strong>Telefone:</strong> ${escapeHtml(hotel.telefone)}</div>` : ""}
      ${textValue(hotel.observacao) ? `<div class="voucher-hotel-note">${escapeHtml(hotel.observacao || "")}</div>` : ""}
    </article>`;
}

type ProgramPrintBlock = {
  heading: string;
  description: string;
  units: number;
};

function splitTextIntoPrintableChunks(value?: string | null, maxChars = 1400) {
  const normalized = textValue(value).replace(/\s+/g, " ").trim();
  if (!normalized) return [""];
  if (normalized.length <= maxChars) return [normalized];

  const sentenceParts = normalized.split(/(?<=[.!?;:])\s+/);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const part of sentenceParts) {
    const next = current ? `${current} ${part}` : part;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) pushCurrent();

    if (part.length <= maxChars) {
      current = part;
      continue;
    }

    let remaining = part;
    while (remaining.length > maxChars) {
      chunks.push(remaining.slice(0, maxChars).trim());
      remaining = remaining.slice(maxChars).trim();
    }
    current = remaining;
  }

  pushCurrent();
  return chunks.length ? chunks : [normalized];
}

function buildProgramPrintBlocks(items: VoucherDia[]) {
  return items.flatMap((dia) => {
    const heading = buildDayHeading(dia);
    const chunks = splitTextIntoPrintableChunks(dia.descricao, 1200);
    return chunks.map((chunk, index) => ({
      heading: index === 0 ? heading : `${heading} (continuação)`,
      description: chunk,
      units: Math.max(1, Math.ceil(String(chunk || "").length / 850)),
    }));
  });
}

function paginateByUnits<T>(
  items: T[],
  getUnits: (item: T) => number,
  maxUnitsPerPage: number | ((pageIndex: number) => number),
) {
  const pages: T[][] = [];
  let currentPage: T[] = [];
  let currentUnits = 0;
  let pageIndex = 0;

  for (const item of items) {
    const units = Math.max(1, getUnits(item));
    const maxUnitsForCurrentPage =
      typeof maxUnitsPerPage === "function" ? Math.max(1, maxUnitsPerPage(pageIndex)) : Math.max(1, maxUnitsPerPage);
    if (currentPage.length && currentUnits + units > maxUnitsForCurrentPage) {
      pages.push(currentPage);
      currentPage = [];
      currentUnits = 0;
      pageIndex += 1;
    }
    currentPage.push(item);
    currentUnits += units;
  }

  if (currentPage.length) pages.push(currentPage);
  return pages;
}

function buildHotelPrintUnits(hotel: VoucherHotel) {
  const payload = [hotel.cidade, hotel.hotel, hotel.endereco, hotel.telefone, hotel.observacao].map(textValue).join(" ");
  return Math.max(1, Math.ceil(payload.length / 900));
}

function buildAppPrintUnits(app: VoucherAppInfo) {
  const payload = [app.nome, app.descricao].map(textValue).join(" ");
  return Math.max(1, Math.ceil(payload.length / 1000));
}

function renderProgramSections(params: {
  providerName: string;
  routeTitle: string;
  referenceLabel?: string | null;
  referenceValue?: string | null;
  dias: VoucherDia[];
}) {
  const blocks = buildProgramPrintBlocks(params.dias);
  if (!blocks.length) return "";

  const pageLimit = (pageIndex: number) => (pageIndex === 0 ? 6 : 7);
  const pages = paginateByUnits(blocks, (item) => item.units, pageLimit);
  return pages
    .map(
      (pageBlocks, pageIndex) => `
        <section class="sheet">
          ${buildSpecialHeader(params.providerName)}
          ${buildBand("PROGRAMA DE VIAGEM")}
          ${
            pageIndex === 0
              ? `<div class="sheet-card sheet-card-center">
                  <div class="route-title">${escapeHtml(params.routeTitle)}</div>
                  ${
                    textValue(params.referenceLabel) && textValue(params.referenceValue)
                      ? `<div class="route-ref">${escapeHtml(params.referenceLabel || "")}: ${escapeHtml(params.referenceValue || "")}</div>`
                      : ""
                  }
                </div>`
              : ""
          }
          <div class="program-list">
            ${pageBlocks
              .map(
                (block) => `
                  <article class="program-card">
                    <div class="program-heading">${escapeHtml(block.heading)}</div>
                    <div class="program-description">${escapeHtml(block.description || "").replace(/\n/g, "<br/>")}</div>
                  </article>`,
              )
              .join("")}
          </div>
        </section>`,
    )
    .join("");
}

function renderHotelSections(params: {
  providerName: string;
  hoteis: VoucherHotel[];
  renderCard: (hotel: VoucherHotel) => string;
}) {
  if (!params.hoteis.length) return "";
  const pageLimit = 6;
  const pages = rebalanceTrailingSparsePage(
    paginateByUnits(params.hoteis, buildHotelPrintUnits, pageLimit),
    buildHotelPrintUnits,
    pageLimit,
    1,
  );
  return pages
    .map(
      (pageHotels) => `
        <section class="sheet">
          ${buildSpecialHeader(params.providerName)}
          ${buildBand("LISTA DE HOTÉIS")}
          <div class="voucher-hotel-list hotel-list-standalone">
            ${pageHotels.map((hotel) => params.renderCard(hotel)).join("")}
          </div>
        </section>`,
    )
    .join("");
}

function renderEuropamundoPassengerSections(params: {
  routeTitle: string;
  infoTable: string;
  passageiros: VoucherPassengerDetail[];
}) {
  const pageLimit = (pageIndex: number) => (pageIndex === 0 ? 13 : 17);
  const pages = rebalanceTrailingSparsePage(
    paginateByUnits(params.passageiros, () => 1, pageLimit),
    () => 1,
    pageLimit,
    2,
  );

  if (!pages.length) {
    return `
      <section class="sheet">
        ${buildSpecialHeader("Europamundo")}
        ${buildBand("DADOS DE SUA VIAGEM")}
        <div class="sheet-card sheet-card-center">
          <div class="route-title">${escapeHtml(params.routeTitle)}</div>
        </div>
        <div class="sheet-card">
          ${params.infoTable}
        </div>
      </section>`;
  }

  return pages
    .map(
      (pageRows, pageIndex) => `
        <section class="sheet">
          ${buildSpecialHeader("Europamundo")}
          ${buildBand("DADOS DE SUA VIAGEM")}
          ${
            pageIndex === 0
              ? `<div class="sheet-card sheet-card-center">
                  <div class="route-title">${escapeHtml(params.routeTitle)}</div>
                </div>
                <div class="sheet-card">
                  ${params.infoTable}
                </div>`
              : ""
          }
          <div class="sheet-card europa-passenger-card">
            <div class="europa-passenger-title">PASSAGEIROS${pageIndex > 0 ? " (continuação)" : ""}</div>
            <div class="europa-passenger-table-wrap">
              <table class="europa-passenger-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>ID</th>
                    <th>Tipo</th>
                    <th>Passaporte</th>
                    <th>Data nasc.</th>
                    <th>Nacionalidade</th>
                  </tr>
                </thead>
                <tbody>
                  ${pageRows
                    .map(
                      (passageiro) => `
                        <tr>
                          <td>${escapeHtml(passageiro.nome || "-")}</td>
                          <td>${escapeHtml(passageiro.passenger_id || "-")}</td>
                          <td>${escapeHtml(passageiro.tipo || "-")}</td>
                          <td>${escapeHtml(passageiro.passaporte || "-")}</td>
                          <td>${escapeHtml(formatDateBR(passageiro.data_nascimento) || "-")}</td>
                          <td>${escapeHtml(passageiro.nacionalidade || "-")}</td>
                        </tr>`,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </div>
        </section>`,
    )
    .join("");
}

type EuropamundoTransferBlock = {
  title: string;
  detailsLines: string[];
  phone: string;
  notesLines: string[];
  notesTitle: string;
};

function buildEuropamundoTransferBlocks(
  title: string,
  transfer: VoucherTransferInfo | null | undefined,
  notesTitle: string,
) {
  const detailsLines = splitLinesFromMultilineText(transfer?.detalhes);
  const notesLines = splitLinesFromMultilineText(transfer?.notas);
  const detailGroups = splitLinesIntoPrintableGroups(detailsLines, 820);
  const noteGroups = splitLinesIntoPrintableGroups(notesLines, 820);
  const totalBlocks = Math.max(detailGroups.length, noteGroups.length, textValue(transfer?.telefone_transferista) ? 1 : 0);

  if (!totalBlocks) return [] as EuropamundoTransferBlock[];

  return Array.from({ length: totalBlocks }, (_, index) => ({
    title: index === 0 ? title : `${title} (continuação)`,
    detailsLines: detailGroups[index] || [],
    phone: index === 0 ? textValue(transfer?.telefone_transferista) : "",
    notesLines: noteGroups[index] || [],
    notesTitle: noteGroups[index]?.length ? (index === 0 ? notesTitle : `${notesTitle} (continuação)`) : "",
  }));
}

function renderEuropamundoTransferSections(params: {
  providerName?: string;
  transferIn?: VoucherTransferInfo | null;
  transferOut?: VoucherTransferInfo | null;
}) {
  const blocks = [
    ...buildEuropamundoTransferBlocks("TRANSFER IN", params.transferIn, "Notas traslado de chegada"),
    ...buildEuropamundoTransferBlocks("TRANSFER OUT", params.transferOut, "Notas traslado de saída"),
  ];

  if (!blocks.length) return "";

  const pages = paginateByUnits(blocks, () => 1, 2);
  return pages
    .map(
      (pageBlocks) => `
        <section class="sheet">
          ${buildSpecialHeader(params.providerName || "Europamundo")}
          ${buildBand("TRASLADOS")}
          <div class="europa-transfer-grid europa-transfer-grid--print-safe">
            ${pageBlocks
              .map(
                (block) => `
                  <article class="sheet-card europa-transfer-card">
                    <div class="europa-transfer-title">${escapeHtml(block.title)}</div>
                    ${
                      block.detailsLines.length
                        ? `<div class="europa-transfer-content">${block.detailsLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>`
                        : ""
                    }
                    ${block.phone ? `<div class="europa-transfer-phone">Telefone do transferista: ${escapeHtml(block.phone)}</div>` : ""}
                    ${
                      block.notesLines.length
                        ? `<div class="europa-transfer-notes-title">${escapeHtml(block.notesTitle)}</div>${renderBulletListFromLines(block.notesLines)}`
                        : ""
                    }
                  </article>`,
              )
              .join("")}
          </div>
        </section>`,
    )
    .join("");
}

function renderBulletListSections(params: {
  providerName: string;
  title: string;
  content?: string | null;
  cardClass?: string;
}) {
  const groups = splitLinesIntoPrintableGroups(splitLinesFromMultilineText(params.content), 1650);
  if (!groups.length) return "";

  return groups
    .map(
      (group, pageIndex) => `
        <section class="sheet">
          ${buildSpecialHeader(params.providerName)}
          ${buildBand(params.title)}
          <div class="sheet-card ${escapeHtml(params.cardClass || "").trim()}">
            ${pageIndex > 0 ? `<div class="europa-section-continuation">Continuação</div>` : ""}
            ${renderBulletListFromLines(group)}
          </div>
        </section>`,
    )
    .join("");
}

function renderEuropamundoAppSections(params: {
  apps: VoucherAppInfo[];
  assets?: VoucherAssetRecord[];
}) {
  if (!params.apps.length) return "";
  const pageLimit = 6;
  const pages = paginateByUnits(params.apps, buildAppPrintUnits, pageLimit);

  return pages
    .map(
      (pageApps) => `
        <section class="sheet">
          ${buildSpecialHeader("Europamundo")}
          ${buildBand("APPS RECOMENDADOS")}
          <div class="europa-apps-grid">
            ${pageApps
              .map((app) => buildEuropamundoAppCard(app, params.assets || []))
              .join("")}
          </div>
        </section>`,
    )
    .join("");
}

function buildSpecialHeader(providerName: string) {
  const isEuropamundo = textValue(providerName).toLowerCase() === "europamundo";
  const providerClass = isEuropamundo ? " voucher-header--europamundo" : "";
  const providerLogoClass = isEuropamundo ? " voucher-header-logo--europamundo" : "";
  return `
    <div class="voucher-header${providerClass}">
      <div class="voucher-header-logo">
        <img src="${VTUR_LOGO_URL}" alt="VTur" />
      </div>
      <div class="voucher-header-center">
        <div class="voucher-header-title">VOUCHER</div>
        <div class="voucher-header-subtitle">Documentação da Viagem</div>
      </div>
      <div class="voucher-header-logo voucher-header-logo-right${providerLogoClass}">
        ${`<div class="voucher-header-placeholder">${escapeHtml(providerName)}</div>`}
      </div>
    </div>`;
}

function buildBand(title: string) {
  return `<div class="voucher-band">${escapeHtml(title)}</div>`;
}

function buildInfoRow(label: string, content: string) {
  return `
    <div class="info-row">
      <div class="info-label">${escapeHtml(label)}</div>
      <div class="info-value">${content}</div>
    </div>`;
}

function buildSpecialToursPreviewDocument(
  voucher: VoucherRecord,
  assets: VoucherAssetRecord[],
  options?: { providerAsset?: "special_tours" | "sato_tours"; providerName?: string }
) {
  const providerAsset = options?.providerAsset || "special_tours";
  const providerName = options?.providerName || "Special Tours";
  const providerImages = pickAssetUrls(assets, providerAsset, "image");
  const routeTitle = buildRouteTitle(voucher);
  const extraData = normalizeVoucherExtraData(voucher.extra_data, voucher.provider);
  const passengerLines = splitPassengerLines(voucher.passageiros);
  const dias = normalizePreviewDays((voucher.voucher_dias || []) as VoucherDia[], voucher.data_inicio);
  const hoteis = (voucher.voucher_hoteis || [])
    .slice()
    .sort((a, b) => {
      const firstHasDate = Boolean(String(a.data_inicio || "").trim() || String(a.data_fim || "").trim());
      const secondHasDate = Boolean(String(b.data_inicio || "").trim() || String(b.data_fim || "").trim());
      if (firstHasDate !== secondHasDate) return firstHasDate ? -1 : 1;

      const firstDate = String(a.data_inicio || "");
      const secondDate = String(b.data_inicio || "");
      if (firstDate !== secondDate) return firstDate.localeCompare(secondDate);
      return Number(a.ordem ?? 0) - Number(b.ordem ?? 0);
    });

  const infoTable = `
    <div class="info-table">
      ${buildInfoRow(
        "Passageiros:",
        passengerLines.length
          ? passengerLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")
          : `<div>-</div>`,
      )}
      ${buildInfoRow("Tipo Acomodação:", escapeHtml(voucher.tipo_acomodacao || "-"))}
      ${buildInfoRow("Identificador:", escapeHtml(voucher.reserva_online || "-"))}
      ${buildInfoRow("Data Início:", escapeHtml(formatDateBR(voucher.data_inicio) || "-"))}
      ${buildInfoRow("Data Final:", escapeHtml(formatDateBR(voucher.data_fim) || "-"))}
    </div>`;

  const programSection = renderProgramSections({
    providerName,
    routeTitle,
    referenceLabel: voucher.reserva_online ? "S/REF" : "",
    referenceValue: voucher.reserva_online || "",
    dias,
  });

  const transfersSection = renderEuropamundoTransferSections({
    providerName,
    transferIn: extraData.traslado_chegada,
    transferOut: extraData.traslado_saida,
  });

  const hotelSection = renderHotelSections({
    providerName,
    hoteis,
    renderCard: (hotel) =>
      buildUnifiedHotelCard(hotel, {
        showCity: false,
        addressLabel: "Endereço / Address",
        periodLabel: "Check In/Out",
      }),
  });

  const appSection = providerImages.length
    ? `
      <section class="sheet sheet-keep-together">
        ${buildSpecialHeader(providerName)}
        <div class="sheet-keep-together-block">
          ${buildBand("BAIXE O APLICATIVO CONQUISTA")}
          <div class="provider-images">
            ${providerImages
              .map(
                (imageUrl, index) => `
                  <div class="provider-image-card">
                    <img src="${escapeHtml(imageUrl)}" alt="Imagem padrão ${index + 1} do voucher" />
                  </div>`,
              )
              .join("")}
          </div>
        </div>
      </section>`
    : "";

  const emergencyOffice = textValue(extraData.emergencia?.escritorio) || "onboard@specialtours.com";
  const emergency24h = textValue(extraData.emergencia?.emergencia_24h) || "+34 652 99 00 47";
  const emergencyWhatsapp = textValue(extraData.emergencia?.whatsapp);
  const emergencyOfficeHtml = emergencyOffice.includes("@")
    ? `<a href="mailto:${escapeHtml(emergencyOffice)}">${escapeHtml(emergencyOffice)}</a>`
    : escapeHtml(emergencyOffice);

  const emergencySection = `
    <section class="sheet">
      ${buildSpecialHeader(providerName)}
      ${buildBand("TELEFONE DE EMERGÊNCIA")}
      <div class="sheet-card emergency-card">
        <p>Nos adicione no seu WhatsApp e em caso de emergência durante a sua viagem,<br/>ou qualquer outra dúvida, entre em contato conosco.</p>
        <p>Apenas para passageiros em viagem:</p>
        <p class="emergency-strong">${escapeHtml(emergency24h)}</p>
        <p>${emergencyOfficeHtml}</p>
        ${emergencyWhatsapp ? `<p>WhatsApp emergências: ${escapeHtml(emergencyWhatsapp)}</p>` : ""}
        ${voucher.reserva_online ? `<p class="emergency-id">IDENTIFICADOR: ${escapeHtml(voucher.reserva_online)}</p>` : ""}
      </div>
    </section>`;

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(routeTitle || "Voucher")}</title>
    <style>
      :root {
        --page-bg: #eef3fb;
        --card-bg: #ffffff;
        --border: #cfd8e6;
        --border-strong: #9aaac2;
        --text: #1f2430;
        --accent: #243aa3;
        --accent-soft: #b1144f;
        --shadow: 0 12px 28px rgba(25, 38, 74, 0.08);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: linear-gradient(180deg, #f3f6fb 0%, var(--page-bg) 100%);
        color: var(--text);
        font-family: "Georgia", "Times New Roman", serif;
      }
      .document {
        width: min(1020px, calc(100vw - 28px));
        margin: 0 auto;
        padding: 24px 0 32px;
      }
      .sheet {
        background: transparent;
        margin-bottom: 28px;
        page-break-after: always;
      }
      .sheet:last-child {
        page-break-after: auto;
      }
      .voucher-header,
      .voucher-band,
      .sheet-card,
      .program-card {
        background: var(--card-bg);
        border: 1px solid var(--border-strong);
        border-radius: 18px;
        box-shadow: var(--shadow);
      }
      .voucher-header {
        display: grid;
        grid-template-columns: 150px 1fr 150px;
        align-items: center;
        gap: 18px;
        padding: 18px 20px;
        width: 100%;
      }
      .voucher-header--europamundo {
        grid-template-columns: 190px 1fr 190px;
      }
      .voucher-header-logo {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        min-height: 76px;
      }
      .voucher-header-logo-right {
        justify-content: flex-end;
      }
      .voucher-header-logo img {
        max-width: 120px;
        max-height: 78px;
        object-fit: contain;
      }
      .voucher-header-logo--europamundo img {
        max-width: 160px;
        max-height: 92px;
      }
      .voucher-header-placeholder {
        min-width: 92px;
        min-height: 60px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
        border: 1px dashed var(--border);
        border-radius: 14px;
        color: #5c6780;
        font-family: "Arial", sans-serif;
        font-size: 13px;
      }
      .voucher-header-center {
        text-align: center;
        color: var(--accent);
      }
      .voucher-header-title {
        font-size: clamp(32px, 4vw, 48px);
        font-weight: 700;
        letter-spacing: 0.02em;
        line-height: 1;
      }
      .voucher-header-subtitle {
        font-size: clamp(17px, 2vw, 28px);
        font-weight: 700;
        margin-top: 8px;
      }
      .voucher-band {
        margin-top: 18px;
        padding: 14px 18px;
        text-align: center;
        font-size: clamp(22px, 2vw, 34px);
        font-weight: 700;
      }
      .sheet-card {
        margin-top: 18px;
        padding: 22px 24px;
      }
      .sheet-card-center {
        text-align: center;
      }
      .route-title {
        max-width: 880px;
        margin: 0 auto;
        font-size: clamp(18px, 1.65vw, 28px);
        font-weight: 700;
        line-height: 1.25;
      }
      .route-ref {
        margin-top: 10px;
        font-size: clamp(16px, 1.35vw, 22px);
      }
      .info-table {
        display: grid;
        gap: 0;
      }
      .info-row {
        display: grid;
        grid-template-columns: minmax(210px, 30%) 1fr;
        border-top: 1px solid var(--border);
      }
      .info-row:first-child {
        border-top: 0;
      }
      .info-label,
      .info-value {
        padding: 16px 18px;
        min-height: 70px;
      }
      .info-label {
        color: var(--accent-soft);
        font-size: clamp(16px, 1.3vw, 24px);
        font-weight: 700;
        border-right: 1px solid var(--border);
        white-space: nowrap;
      }
      .info-value {
        font-size: clamp(16px, 1.35vw, 24px);
        font-weight: 700;
        line-height: 1.35;
      }
      .program-list,
      .provider-images {
        display: grid;
        gap: 16px;
        margin-top: 18px;
      }
      .program-card {
        padding: 14px 16px;
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
      .sheet-keep-together,
      .sheet-keep-together-block {
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
      .program-heading {
        font-size: clamp(15px, 1.2vw, 22px);
        font-weight: 700;
        line-height: 1.4;
      }
      .europa-transfer-title {
        font-size: clamp(18px, 1.4vw, 24px);
        font-weight: 700;
      }
      .program-description {
        margin-top: 10px;
        font-size: clamp(15px, 1.05vw, 20px);
        line-height: 1.55;
      }
      .europa-transfer-grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 18px;
      }
      .europa-transfer-card {
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
      .europa-transfer-content {
        display: grid;
        gap: 8px;
        margin-top: 14px;
        line-height: 1.55;
      }
      .europa-transfer-phone {
        margin-top: 16px;
        font-weight: 700;
        color: var(--accent);
      }
      .europa-transfer-notes-title {
        margin-top: 18px;
        font-weight: 700;
      }
      .voucher-bullet-list {
        margin: 14px 0 0;
        padding-left: 20px;
        line-height: 1.6;
      }
      .voucher-bullet-list li + li {
        margin-top: 8px;
      }
      .voucher-hotel-list,
      .hotel-list {
        display: grid;
        gap: 14px;
      }
      .hotel-list-standalone {
        margin-top: 18px;
      }
      .voucher-hotel-card {
        margin-top: 0;
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
      .voucher-hotel-city {
        font-size: clamp(18px, 1.45vw, 24px);
        font-weight: 700;
        color: var(--accent);
      }
      .voucher-hotel-name {
        margin-top: 14px;
      }
      .voucher-hotel-period {
        margin-top: 10px;
      }
      .voucher-hotel-detail {
        margin-top: 10px;
        font-size: clamp(15px, 1.08vw, 20px);
        line-height: 1.55;
      }
      .voucher-hotel-detail strong {
        font-weight: 700;
      }
      .voucher-hotel-note {
        margin-top: 12px;
        color: #475569;
        font-style: italic;
      }
      .provider-image-card {
        display: flex;
        justify-content: center;
        width: 100%;
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
      .provider-image-card img {
        width: 100%;
        max-width: 100%;
        max-height: none;
        display: block;
        border-radius: 12px;
        object-fit: contain;
      }
      .emergency-card {
        text-align: center;
        padding: 36px 32px;
        font-size: clamp(16px, 1.15vw, 22px);
        line-height: 1.6;
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
      .emergency-card p {
        margin: 0 0 16px;
      }
      .emergency-strong,
      .emergency-id {
        font-weight: 700;
        font-style: italic;
      }
      .emergency-card a {
        color: #2b47a8;
      }
      @media screen and (max-width: 720px) {
        .document {
          width: calc(100vw - 18px);
          padding: 12px 0 24px;
        }
        .voucher-header {
          grid-template-columns: 1fr;
          justify-items: center;
          text-align: center;
        }
        .voucher-header-logo,
        .voucher-header-logo-right {
          justify-content: center;
        }
        .info-row {
          grid-template-columns: 1fr;
        }
        .info-label {
          border-right: 0;
          border-bottom: 1px solid var(--border);
          min-height: auto;
          padding-bottom: 10px;
        }
        .info-value {
          min-height: auto;
          padding-top: 12px;
        }
        .europa-transfer-grid {
          grid-template-columns: 1fr;
        }
      }
      @media print {
        @page {
          margin: 8mm 8mm 5mm;
        }
        body {
          background: #fff;
        }
        .document {
          width: auto;
          padding: 0;
        }
        .sheet {
          break-after: auto !important;
          page-break-after: auto !important;
          break-inside: auto !important;
          page-break-inside: auto !important;
          margin-bottom: 0 !important;
        }
        .sheet + .sheet {
          break-before: page !important;
          page-break-before: always !important;
        }
        .voucher-header {
          grid-template-columns: 150px 1fr 150px !important;
          align-items: center !important;
        }
        .voucher-header--europamundo {
          grid-template-columns: 190px 1fr 190px !important;
        }
        .voucher-header-logo {
          justify-content: flex-start !important;
        }
        .voucher-header-logo-right {
          justify-content: flex-end !important;
        }
        .info-row {
          grid-template-columns: minmax(210px, 30%) 1fr !important;
        }
        .info-label {
          border-right: 1px solid var(--border) !important;
          border-bottom: 0 !important;
        }
        .europa-transfer-grid,
        .europa-transfer-grid--print-safe {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
        .provider-image-card img {
          width: 100%;
          max-width: 100%;
          max-height: none;
        }
        .voucher-band {
          margin-top: 12px !important;
          padding: 12px 16px !important;
        }
        .sheet-card {
          margin-top: 12px !important;
          padding: 18px 20px !important;
        }
        .program-list,
        .provider-images,
        .voucher-hotel-list,
        .hotel-list,
        .europa-transfer-grid,
        .europa-transfer-grid--print-safe {
          gap: 12px !important;
          margin-top: 12px !important;
        }
        .hotel-list-standalone {
          margin-top: 12px !important;
        }
        .voucher-hotel-card {
          padding: 14px 16px !important;
        }
        .voucher-hotel-name {
          margin-top: 8px !important;
        }
        .voucher-hotel-period,
        .voucher-hotel-detail {
          margin-top: 6px !important;
          line-height: 1.4 !important;
        }
        .voucher-hotel-note {
          margin-top: 8px !important;
        }
        .program-card {
          padding: 12px 14px !important;
        }
        .emergency-card {
          padding: 28px 24px !important;
        }
        .voucher-header,
        .voucher-band,
        .provider-image-card,
        .emergency-card {
          break-inside: avoid-page !important;
          page-break-inside: avoid !important;
        }
        .sheet-card,
        .program-card,
        .europa-transfer-card,
        .voucher-hotel-card,
        .sheet-keep-together,
        .sheet-keep-together-block {
          break-inside: auto !important;
          page-break-inside: auto !important;
        }
        .voucher-header,
        .voucher-band,
        .sheet-card,
        .program-card {
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <main class="document">
      <section class="sheet">
        ${buildSpecialHeader(providerName)}
        ${buildBand("DADOS DE SUA VIAGEM")}
        ${buildBand(routeTitle)}
        <div class="sheet-card">
          ${infoTable}
        </div>
      </section>
      ${transfersSection}
      ${programSection}
      ${hotelSection}
      ${appSection}
      ${emergencySection}
    </main>
  </body>
</html>`;
}

function buildEuropamundoPreviewDocument(voucher: VoucherRecord, assets: VoucherAssetRecord[]) {
  const extraData = normalizeVoucherExtraData(voucher.extra_data, "europamundo");
  const passageiros = (extraData.passageiros_detalhes || []).slice().sort((a, b) => a.ordem - b.ordem);
  const dias = normalizePreviewDays((voucher.voucher_dias || []) as VoucherDia[], voucher.data_inicio);
  const hoteis = (voucher.voucher_hoteis || [])
    .slice()
    .sort((a, b) => {
      const firstDate = String(a.data_inicio || "");
      const secondDate = String(b.data_inicio || "");
      if (firstDate !== secondDate) return firstDate.localeCompare(secondDate);
      return Number(a.ordem ?? 0) - Number(b.ordem ?? 0);
    });
  const apps = (extraData.apps_recomendados || []).slice().sort((a, b) => a.ordem - b.ordem);
  const routeTitle = textValue(voucher.nome || "Voucher");

  const infoTable = `
    <div class="info-table">
      ${buildInfoRow("Localizador:", escapeHtml(voucher.reserva_online || "-"))}
      ${buildInfoRow("Data de Partida:", escapeHtml(formatDateBR(voucher.data_inicio) || "-"))}
      ${buildInfoRow("Data de Finalização:", escapeHtml(formatDateBR(voucher.data_fim) || "-"))}
      ${buildInfoRow("Tipo de Quarto:", escapeHtml(voucher.tipo_acomodacao || "-"))}
    </div>`;

  const tripDataSections = renderEuropamundoPassengerSections({
    routeTitle,
    infoTable,
    passageiros,
  });

  const transfersSection = renderEuropamundoTransferSections({
    transferIn: extraData.traslado_chegada,
    transferOut: extraData.traslado_saida,
  });

  const programSection = renderProgramSections({
    providerName: "Europamundo",
    routeTitle,
    referenceLabel: voucher.reserva_online ? "LOCALIZADOR" : "",
    referenceValue: voucher.reserva_online || "",
    dias,
  });

  const hotelsSection = renderHotelSections({
    providerName: "Europamundo",
    hoteis,
    renderCard: (hotel) =>
      buildUnifiedHotelCard(hotel, {
        showCity: true,
        addressLabel: "Endereço",
        periodLabel: "Check In/Out",
      }),
  });

  const importantInfoSection = renderBulletListSections({
    providerName: "Europamundo",
    title: "INFORMAÇÕES IMPORTANTES",
    content: extraData.informacoes_importantes,
    cardClass: "europa-info-card",
  });

  const appsSection = renderEuropamundoAppSections({
    apps,
    assets,
  });

  const emergencySection =
    textValue(extraData.emergencia?.escritorio) ||
    textValue(extraData.emergencia?.emergencia_24h) ||
    textValue(extraData.emergencia?.whatsapp)
      ? `
        <section class="sheet">
          ${buildSpecialHeader("Europamundo")}
          ${buildBand("TELEFONE DE EMERGÊNCIA")}
          <div class="sheet-card emergency-card">
            <p>Apenas para passageiros em viagem:</p>
            ${
              textValue(extraData.emergencia?.escritorio)
                ? `<p><strong>Escritório:</strong> ${escapeHtml(extraData.emergencia?.escritorio || "")}</p>`
                : ""
            }
            ${
              textValue(extraData.emergencia?.emergencia_24h)
                ? `<p class="emergency-strong">Emergência 24 horas: ${escapeHtml(extraData.emergencia?.emergencia_24h || "")}</p>`
                : ""
            }
            ${
              textValue(extraData.emergencia?.whatsapp)
                ? `<p>WhatsApp emergências: ${escapeHtml(extraData.emergencia?.whatsapp || "")}</p>`
                : ""
            }
            ${voucher.reserva_online ? `<p class="emergency-id">LOCALIZADOR: ${escapeHtml(voucher.reserva_online)}</p>` : ""}
          </div>
        </section>`
      : "";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(routeTitle || "Voucher")}</title>
    <style>
      :root {
        --page-bg: #eef3fb;
        --card-bg: #ffffff;
        --border: #cfd8e6;
        --border-strong: #9aaac2;
        --text: #1f2430;
        --accent: #243aa3;
        --accent-soft: #b1144f;
        --shadow: 0 12px 28px rgba(25, 38, 74, 0.08);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: linear-gradient(180deg, #f3f6fb 0%, var(--page-bg) 100%);
        color: var(--text);
        font-family: "Georgia", "Times New Roman", serif;
      }
      .document {
        width: min(1020px, calc(100vw - 28px));
        margin: 0 auto;
        padding: 24px 0 32px;
      }
      .sheet {
        background: transparent;
        margin-bottom: 28px;
        page-break-after: always;
      }
      .sheet:last-child {
        page-break-after: auto;
      }
      .voucher-header,
      .voucher-band,
      .sheet-card,
      .program-card {
        background: var(--card-bg);
        border: 1px solid var(--border-strong);
        border-radius: 18px;
        box-shadow: var(--shadow);
      }
      .voucher-header {
        display: grid;
        grid-template-columns: 150px 1fr 150px;
        align-items: center;
        gap: 18px;
        padding: 18px 20px;
        width: 100%;
      }
      .voucher-header--europamundo {
        grid-template-columns: 190px 1fr 190px;
      }
      .voucher-header-logo {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        min-height: 76px;
      }
      .voucher-header-logo-right {
        justify-content: flex-end;
      }
      .voucher-header-logo img {
        max-width: 120px;
        max-height: 78px;
        object-fit: contain;
      }
      .voucher-header-logo--europamundo img {
        max-width: 160px;
        max-height: 92px;
      }
      .voucher-header-placeholder {
        min-width: 92px;
        min-height: 60px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
        border: 1px dashed var(--border);
        border-radius: 14px;
        color: #5c6780;
        font-family: "Arial", sans-serif;
        font-size: 13px;
      }
      .voucher-header-center {
        text-align: center;
        color: var(--accent);
      }
      .voucher-header-title {
        font-size: clamp(32px, 4vw, 48px);
        font-weight: 700;
        letter-spacing: 0.02em;
        line-height: 1;
      }
      .voucher-header-subtitle {
        font-size: clamp(17px, 2vw, 28px);
        font-weight: 700;
        margin-top: 8px;
      }
      .voucher-band {
        margin-top: 18px;
        padding: 14px 18px;
        text-align: center;
        font-size: clamp(22px, 2vw, 34px);
        font-weight: 700;
      }
      .sheet-card {
        margin-top: 18px;
        padding: 22px 24px;
      }
      .sheet-card-center {
        text-align: center;
      }
      .route-title {
        max-width: 880px;
        margin: 0 auto;
        font-size: clamp(18px, 1.65vw, 28px);
        font-weight: 700;
        line-height: 1.25;
      }
      .route-ref {
        margin-top: 10px;
        font-size: clamp(16px, 1.35vw, 22px);
      }
      .info-table {
        display: grid;
        gap: 0;
      }
      .info-row {
        display: grid;
        grid-template-columns: minmax(210px, 30%) 1fr;
        border-top: 1px solid var(--border);
      }
      .info-row:first-child {
        border-top: 0;
      }
      .info-label,
      .info-value {
        padding: 16px 18px;
        min-height: 70px;
      }
      .info-label {
        color: var(--accent-soft);
        font-size: clamp(16px, 1.3vw, 24px);
        font-weight: 700;
        border-right: 1px solid var(--border);
        white-space: nowrap;
      }
      .info-value {
        font-size: clamp(16px, 1.35vw, 24px);
        font-weight: 700;
        line-height: 1.35;
      }
      .europa-passenger-title,
      .europa-transfer-title,
      .europa-app-name {
        font-size: clamp(18px, 1.4vw, 24px);
        font-weight: 700;
      }
      .europa-app-header {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .europa-app-icon {
        width: 40px;
        height: 40px;
        min-width: 40px;
        border-radius: 10px;
        object-fit: cover;
        display: block;
      }
      .europa-passenger-table-wrap {
        overflow-x: auto;
        margin-top: 14px;
      }
      .europa-passenger-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      .europa-passenger-table th,
      .europa-passenger-table td {
        border: 1px solid var(--border);
        padding: 10px 12px;
        text-align: left;
        vertical-align: top;
      }
      .europa-passenger-table th {
        background: #f6f8fc;
        font-weight: 700;
      }
      .program-list,
      .voucher-hotel-list,
      .europa-apps-grid {
        display: grid;
        gap: 16px;
        margin-top: 18px;
      }
      .program-card {
        padding: 14px 16px;
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
      .program-heading {
        font-size: clamp(15px, 1.2vw, 22px);
        font-weight: 700;
        line-height: 1.4;
      }
      .program-description {
        margin-top: 10px;
        font-size: clamp(15px, 1.05vw, 20px);
        line-height: 1.55;
      }
      .europa-transfer-grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 18px;
      }
      .europa-transfer-card,
      .europa-app-card,
      .europa-info-card,
      .europa-passenger-card {
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
      .europa-transfer-content {
        display: grid;
        gap: 8px;
        margin-top: 14px;
        line-height: 1.55;
      }
      .europa-transfer-phone {
        margin-top: 16px;
        font-weight: 700;
        color: var(--accent);
      }
      .europa-transfer-notes-title {
        margin-top: 18px;
        font-weight: 700;
      }
      .voucher-bullet-list {
        margin: 14px 0 0;
        padding-left: 20px;
        line-height: 1.6;
      }
      .voucher-bullet-list li + li {
        margin-top: 8px;
      }
      .europa-section-continuation {
        margin-bottom: 12px;
        font-weight: 700;
        color: var(--accent);
      }
      .europa-app-description {
        margin-top: 12px;
        line-height: 1.6;
      }
      .emergency-card {
        text-align: center;
        padding: 36px 32px;
        font-size: clamp(16px, 1.15vw, 22px);
        line-height: 1.6;
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
      .emergency-card p {
        margin: 0 0 16px;
      }
      .emergency-strong,
      .emergency-id {
        font-weight: 700;
        font-style: italic;
      }
      @media screen and (max-width: 720px) {
        .document {
          width: calc(100vw - 18px);
          padding: 12px 0 24px;
        }
        .voucher-header {
          grid-template-columns: 1fr;
          justify-items: center;
          text-align: center;
        }
        .voucher-header-logo,
        .voucher-header-logo-right {
          justify-content: center;
        }
        .info-row {
          grid-template-columns: 1fr;
        }
        .info-label {
          border-right: 0;
          border-bottom: 1px solid var(--border);
          min-height: auto;
          padding-bottom: 10px;
        }
        .info-value {
          min-height: auto;
          padding-top: 12px;
        }
        .europa-transfer-grid {
          grid-template-columns: 1fr;
        }
      }
      @media print {
        @page {
          margin: 8mm 8mm 5mm;
        }
        body {
          background: #fff;
        }
        .document {
          width: auto;
          padding: 0;
        }
        .sheet {
          break-after: auto !important;
          page-break-after: auto !important;
          break-inside: auto !important;
          page-break-inside: auto !important;
          margin-bottom: 0 !important;
        }
        .sheet + .sheet {
          break-before: page !important;
          page-break-before: always !important;
        }
        .voucher-header {
          grid-template-columns: 150px 1fr 150px !important;
          align-items: center !important;
        }
        .voucher-header--europamundo {
          grid-template-columns: 190px 1fr 190px !important;
        }
        .voucher-header-logo {
          justify-content: flex-start !important;
        }
        .voucher-header-logo-right {
          justify-content: flex-end !important;
        }
        .info-row {
          grid-template-columns: minmax(210px, 30%) 1fr !important;
        }
        .info-label {
          border-right: 1px solid var(--border) !important;
          border-bottom: 0 !important;
        }
        .europa-transfer-grid,
        .europa-transfer-grid--print-safe {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
        .voucher-band {
          margin-top: 12px !important;
          padding: 12px 16px !important;
        }
        .sheet-card {
          margin-top: 12px !important;
          padding: 18px 20px !important;
        }
        .program-list,
        .voucher-hotel-list,
        .europa-apps-grid,
        .europa-transfer-grid,
        .europa-transfer-grid--print-safe {
          gap: 12px !important;
          margin-top: 12px !important;
        }
        .voucher-hotel-card {
          padding: 14px 16px !important;
        }
        .voucher-hotel-name {
          margin-top: 8px !important;
        }
        .voucher-hotel-period,
        .voucher-hotel-detail {
          margin-top: 6px !important;
          line-height: 1.4 !important;
        }
        .voucher-hotel-note {
          margin-top: 8px !important;
        }
        .program-card {
          padding: 12px 14px !important;
        }
        .europa-app-header {
          gap: 10px !important;
        }
        .europa-app-icon {
          width: 34px !important;
          height: 34px !important;
          min-width: 34px !important;
        }
        .emergency-card {
          padding: 28px 24px !important;
        }
        .voucher-header,
        .voucher-band {
          break-inside: avoid-page !important;
          page-break-inside: avoid !important;
          box-shadow: none;
        }
        .program-card,
        .sheet-card,
        .voucher-hotel-card,
        .europa-transfer-card,
        .europa-info-card,
        .europa-passenger-card,
        .europa-app-card {
          break-inside: auto !important;
          page-break-inside: auto !important;
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <main class="document">
      ${tripDataSections}
      ${transfersSection}
      ${programSection}
      ${hotelsSection}
      ${importantInfoSection}
      ${appsSection}
      ${emergencySection}
    </main>
  </body>
</html>`;
}

function buildGenericVoucherPreviewDocument(voucher: VoucherRecord, assets: VoucherAssetRecord[]) {
  const dias = normalizePreviewDays((voucher.voucher_dias || []) as VoucherDia[], voucher.data_inicio);
  const hoteis = (voucher.voucher_hoteis || [])
    .slice()
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const routeTitle = buildRouteTitle(voucher);

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(routeTitle || "Voucher")}</title>
    <style>
      body {
        margin: 0;
        background: #eef3fb;
        color: #1f2430;
        font-family: "Georgia", "Times New Roman", serif;
      }
      .document {
        width: min(960px, calc(100vw - 28px));
        margin: 0 auto;
        padding: 24px 0 32px;
      }
      .card {
        background: #fff;
        border: 1px solid #cfd8e6;
        border-radius: 18px;
        box-shadow: 0 12px 28px rgba(25, 38, 74, 0.08);
        padding: 20px 22px;
        margin-bottom: 16px;
      }
      .top {
        display: grid;
        grid-template-columns: 150px 1fr 150px;
        align-items: center;
        gap: 18px;
      }
      .top img {
        max-width: 120px;
        max-height: 78px;
        object-fit: contain;
      }
      .title {
        text-align: center;
        color: #243aa3;
        font-size: 32px;
        font-weight: 700;
      }
      .subtitle {
        text-align: center;
        color: #243aa3;
        font-size: 20px;
        font-weight: 700;
        margin-top: 8px;
      }
      .route-title {
        font-size: 24px;
        font-weight: 700;
        text-align: center;
      }
      .block-title {
        font-size: 22px;
        font-weight: 700;
        margin: 0 0 12px;
      }
      .day {
        border-top: 1px solid #d6ddea;
        padding-top: 12px;
        margin-top: 12px;
      }
      .day:first-child {
        border-top: 0;
        padding-top: 0;
        margin-top: 0;
      }
      .day-heading {
        font-weight: 700;
        margin-bottom: 8px;
      }
      .hotel {
        border-top: 1px solid #d6ddea;
        padding-top: 12px;
        margin-top: 12px;
      }
      .hotel:first-child {
        border-top: 0;
        padding-top: 0;
        margin-top: 0;
      }
      @media print {
        body {
          background: #fff;
        }
        .card {
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <main class="document">
      <section class="card">
        <div class="top">
          <div><img src="${VTUR_LOGO_URL}" alt="VTur" /></div>
          <div>
            <div class="title">VOUCHER</div>
            <div class="subtitle">Documentação da Viagem</div>
          </div>
          <div style="text-align:right;"></div>
        </div>
      </section>
      <section class="card">
        <div class="route-title">${escapeHtml(routeTitle)}</div>
      </section>
      ${
        dias.length
          ? `<section class="card">
              <h2 class="block-title">PROGRAMA DE VIAGEM</h2>
              ${dias
                .map(
                  (dia) => `<div class="day">
                    <div class="day-heading">${escapeHtml(buildDayHeading(dia))}</div>
                    <div>${escapeHtml(dia.descricao || "").replace(/\n/g, "<br/>")}</div>
                  </div>`,
                )
                .join("")}
            </section>`
          : ""
      }
      ${
        hoteis.length
          ? `<section class="card">
              <h2 class="block-title">LISTA DE HOTÉIS</h2>
              ${hoteis
                .map(
                  (hotel) => `<div class="hotel">
                    <div><b>Hotel:</b> ${escapeHtml(hotel.hotel || "-")}</div>
                    ${hotel.endereco ? `<div><b>Endereço:</b> ${escapeHtml(hotel.endereco)}</div>` : ""}
                    ${hotel.telefone ? `<div><b>Telefone:</b> ${escapeHtml(hotel.telefone)}</div>` : ""}
                    ${buildHotelDateRange(hotel) ? `<div><b>Check In/Out:</b> ${escapeHtml(buildHotelDateRange(hotel))}</div>` : ""}
                  </div>`,
                )
                .join("")}
            </section>`
          : ""
      }
    </main>
  </body>
</html>`;
}

export function buildVoucherPreviewDocument(voucher: VoucherRecord, assets: VoucherAssetRecord[] = []) {
  if (voucher.provider === "special_tours") {
    return buildSpecialToursPreviewDocument(voucher, assets);
  }
  if (voucher.provider === "sato_tours") {
    return buildSpecialToursPreviewDocument(voucher, assets, {
      providerAsset: "sato_tours",
      providerName: "Sato Tours",
    });
  }
  if (voucher.provider === "europamundo") {
    return buildEuropamundoPreviewDocument(voucher, assets);
  }
  return buildGenericVoucherPreviewDocument(voucher, assets);
}
