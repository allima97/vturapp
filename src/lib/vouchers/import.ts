import { buildPassengerSummary, createEmptyVoucherExtraData, normalizeVoucherExtraData } from "./extraData";
import { toISODateUTC } from '$lib/date';
import { uniqueCleanStrings } from "../utils/array";
import type {
  VoucherDia,
  VoucherExtraData,
  VoucherHotel,
  VoucherImportResult,
  VoucherPassengerDetail,
  VoucherProvider,
  VoucherTransferInfo,
} from "./types";

const MONTH_INDEX: Record<string, number> = {
  jan: 0, janeiro: 0,
  fev: 1, fevereiro: 1,
  mar: 2, marco: 2, "março": 2,
  abr: 3, abril: 3,
  mai: 4, maio: 4,
  jun: 5, junho: 5,
  jul: 6, julho: 6,
  ago: 7, agosto: 7,
  set: 8, setembro: 8,
  out: 9, outubro: 9,
  nov: 10, novembro: 10,
  dez: 11, dezembro: 11,
};

function normalizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanLine(value?: string | null) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/^[:\s-–—]+|[:\s-–—]+$/g, "")
    .trim();
}

function cleanMultilineText(value?: string | null) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\u2028/g, "\n")
    .replace(/\u2029/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toIsoDate(date: Date) {
  return toISODateUTC(date);
}

function diffNights(start?: string | null, end?: string | null) {
  const startDate = start ? new Date(`${start}T12:00:00`) : null;
  const endDate = end ? new Date(`${end}T12:00:00`) : null;
  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
}

function fileExt(name: string) {
  const raw = String(name || "").trim();
  const idx = raw.lastIndexOf(".");
  return idx >= 0 ? raw.slice(idx + 1).toLowerCase() : "";
}

function parseIsoDateLoose(value?: string | null, fallbackYear?: number | null) {
  const raw = cleanLine(value);
  if (!raw) return "";

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const date = new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
    return Number.isNaN(date.getTime()) ? "" : toIsoDate(date);
  }

  const brMatch = raw.match(/^(\d{2})\/(\d{2})(?:\/(\d{4}))?$/);
  if (brMatch) {
    const year = brMatch[3] ? Number(brMatch[3]) : Number(fallbackYear || 0);
    if (!year) return "";
    const date = new Date(Date.UTC(year, Number(brMatch[2]) - 1, Number(brMatch[1])));
    return Number.isNaN(date.getTime()) ? "" : toIsoDate(date);
  }

  const longMatch = normalizeText(raw).match(/(\d{1,2}) de ([a-zçãõáéíóú]+) de (\d{4})/i);
  if (longMatch) {
    const monthIndex = MONTH_INDEX[normalizeText(longMatch[2])];
    if (monthIndex === undefined) return "";
    const date = new Date(Date.UTC(Number(longMatch[3]), monthIndex, Number(longMatch[1])));
    return Number.isNaN(date.getTime()) ? "" : toIsoDate(date);
  }

  return "";
}

function titleCaseKeepAcronyms(value?: string | null) {
  const raw = cleanLine(value);
  if (!raw) return "";
  return raw
    .split(/\s+/)
    .map((part) => {
      if (/^[A-Z0-9À-ÖØ-Þ]{2,}$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function stripHotelStars(value?: string | null) {
  return cleanLine(value).replace(/\s*\*{2,5}\s*$/g, "").trim();
}

function getLineValue(lines: string[], index: number, pattern: RegExp) {
  const line = cleanLine(lines[index]);
  const match = line.match(pattern);
  if (!match) return null;

  const value = cleanLine(match[1] || "");
  if (value) return { value, nextIndex: index };

  const nextLine = cleanLine(lines[index + 1]);
  if (!nextLine || isStructuredHotelLabelLine(nextLine)) return { value: "", nextIndex: index };
  return { value: nextLine, nextIndex: index + 1 };
}

function isStructuredHotelLabelLine(value?: string | null) {
  const line = cleanLine(value);
  if (!line) return false;
  return (
    /^hotel(?:\s*[:\-]\s*|\s+|$)/i.test(line) ||
    /^endere[çc]o(?:\s*\/\s*address)?(?:\s*[:\-]\s*|\s+|$)/i.test(line) ||
    /^telefone(?:\s*[:\-]\s*|\s+|$)/i.test(line) ||
    /^check\s*in\s*\/?\s*out(?:\s*[:\-]\s*|\s+|$)/i.test(line)
  );
}

function parseHotelDateRange(value?: string | null) {
  const raw = cleanLine(value);
  if (!raw) return { start: "", end: "" };

  const datePattern = "(\\d{4}-\\d{2}-\\d{2}|\\d{2}\\/\\d{2}(?:\\/\\d{4})?)";
  const match =
    raw.match(new RegExp(`${datePattern}\\s*(?:a|ate|até|to|[-–—])\\s*${datePattern}`, "i")) ||
    raw.match(new RegExp(`${datePattern}\\s+${datePattern}`, "i"));

  if (!match) return { start: "", end: "" };

  const startRaw = match[1];
  const endRaw = match[2];
  const fallbackYear =
    Number(startRaw.match(/^(\d{4})-/)?.[1] || startRaw.match(/\d{2}\/\d{2}\/(\d{4})/)?.[1] || 0) || null;
  return {
    start: parseIsoDateLoose(startRaw),
    end: parseIsoDateLoose(endRaw, fallbackYear),
  };
}

function normalizeHotelKey(hotel: VoucherHotel) {
  return [
    normalizeText(hotel.cidade),
    normalizeText(hotel.hotel),
    normalizeText(hotel.endereco),
    normalizeText(hotel.telefone),
    normalizeText(hotel.contato),
    normalizeText(hotel.status),
  ].join("|");
}

function mergeConsecutiveHotels(items: VoucherHotel[]) {
  const sorted = items.slice().sort((a, b) => {
    const dateCompare = String(a.data_inicio || "").localeCompare(String(b.data_inicio || ""));
    if (dateCompare !== 0) return dateCompare;
    return a.ordem - b.ordem;
  });

  const merged: VoucherHotel[] = [];

  for (const hotel of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.data_fim &&
      hotel.data_inicio &&
      last.data_fim === hotel.data_inicio &&
      normalizeHotelKey(last) === normalizeHotelKey(hotel)
    ) {
      last.data_fim = hotel.data_fim || last.data_fim;
      last.noites = diffNights(last.data_inicio, last.data_fim);
      const obs: string[] = [];
      const lastObs = cleanLine(last.observacao);
      if (lastObs) obs.push(lastObs);
      const hotelObs = cleanLine(hotel.observacao);
      if (hotelObs) obs.push(hotelObs);
      last.observacao = uniqueCleanStrings(obs).join(" | ");
      continue;
    }
    merged.push({ ...hotel });
  }

  return merged.map((hotel, index) => ({ ...hotel, ordem: index }));
}

function looksLikeCityLine(value?: string | null) {
  const raw = cleanLine(value);
  if (!raw) return false;
  const normalized = normalizeText(raw);
  if (!/[a-z]/i.test(raw)) return false;
  if (
    normalized.startsWith("datas") ||
    normalized.startsWith("endereco") ||
    normalized.startsWith("codigo postal") ||
    normalized.startsWith("numero de telefone") ||
    normalized.startsWith("hotel pendente") ||
    normalized.startsWith("itinerario de viagem") ||
    normalized.startsWith("lista de hoteis")
  ) {
    return false;
  }

  const letters = raw.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  if (!letters) return false;
  const upper = letters.replace(/[^A-ZÀ-ÖØ-Þ]/g, "");
  return upper.length / letters.length >= 0.6;
}

function parsePassengerLine(line: string): Partial<VoucherPassengerDetail> | null {
  const raw = cleanLine(line);
  if (!raw) return null;

  const withDoc = raw.match(/^(.+?)\s*[-–—]\s*(?:passaporte|doc|doc\.?|documento)?\s*:?\s*(\w{6,})\s*$/i);
  if (withDoc) {
    return { nome: titleCaseKeepAcronyms(withDoc[1]), passaporte: withDoc[2].toUpperCase() };
  }

  const nameOnly = raw.match(/^([A-Za-zÀ-ÖØ-öø-ÿ\s'-]{3,})$/);
  if (nameOnly) {
    return { nome: titleCaseKeepAcronyms(nameOnly[1]) };
  }

  return null;
}

export function createEmptyVoucherImport(provider: VoucherProvider): VoucherImportResult {
  return {
    provider,
    nome: "",
    codigo_sistema: "",
    codigo_fornecedor: "",
    reserva_online: "",
    passageiros: "",
    tipo_acomodacao: "",
    operador: "",
    resumo: "",
    data_inicio: "",
    data_fim: "",
    dias: [],
    hoteis: [],
    extra_data: createEmptyVoucherExtraData(provider),
  };
}

export function mergeVoucherImport(
  base: Omit<VoucherImportResult, "extra_data"> & { extra_data?: VoucherExtraData },
  incoming: Partial<VoucherImportResult>
): VoucherImportResult {
  const merged: VoucherImportResult = {
    provider: incoming.provider || base.provider,
    nome: incoming.nome || base.nome,
    codigo_sistema: incoming.codigo_sistema || base.codigo_sistema,
    codigo_fornecedor: incoming.codigo_fornecedor || base.codigo_fornecedor,
    reserva_online: incoming.reserva_online || base.reserva_online,
    passageiros: incoming.passageiros || base.passageiros,
    tipo_acomodacao: incoming.tipo_acomodacao || base.tipo_acomodacao,
    operador: incoming.operador || base.operador,
    resumo: incoming.resumo || base.resumo,
    data_inicio: incoming.data_inicio || base.data_inicio,
    data_fim: incoming.data_fim || base.data_fim,
    dias: incoming.dias || base.dias || [],
    hoteis: incoming.hoteis || base.hoteis || [],
    extra_data: normalizeVoucherExtraData(
      { ...base.extra_data, ...incoming.extra_data },
      incoming.provider || base.provider
    ),
  };
  return merged;
}

export function parseVoucherImportText(text: string, provider: VoucherProvider): VoucherImportResult {
  const result = createEmptyVoucherImport(provider);
  const normalized = cleanMultilineText(text);
  if (!normalized) return result;

  const blocks = normalized.split(/\n{2,}/);
  for (const block of blocks) {
    const lines: string[] = [];
    for (const rawLine of block.split("\n")) {
      const line = cleanLine(rawLine);
      if (line) lines.push(line);
    }
    if (!lines.length) continue;

    const header = lines[0];
    if (/^dias?\s*[:\-]/i.test(header)) {
      result.dias = parseDayLines(lines.slice(1));
    } else if (/^hot[eé]is?\s*[:\-]/i.test(header) || normalizeText(header).startsWith("hoteis confirmados")) {
      result.hoteis = parseHotelLines(lines.slice(1));
    } else if (/^passageiros?\s*[:\-]/i.test(header)) {
      const passengers: Partial<VoucherPassengerDetail>[] = [];
      for (const line of lines.slice(1)) {
        const passenger = parsePassengerLine(line);
        if (passenger) passengers.push(passenger);
      }
      result.extra_data.passageiros_detalhes = passengers.map((p, i) => ({ ...p, ordem: i } as VoucherPassengerDetail));
      result.passageiros = buildPassengerSummary(result.extra_data.passageiros_detalhes);
    }
  }

  return result;
}

function parseDayLines(lines: string[]): VoucherDia[] {
  const dias: VoucherDia[] = [];
  let current: Partial<VoucherDia> | null = null;

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) continue;

    const dayMatch = line.match(/^dia\s*(\d+)[\s:.-]+(.+)$/i);
    if (dayMatch) {
      if (current) dias.push({ ...current, descricao: String(current.descricao || "").trim() } as VoucherDia);
      current = { dia_numero: Number(dayMatch[1]), titulo: dayMatch[2], descricao: "", ordem: dias.length };
    } else if (current) {
      current.descricao = (current.descricao ? current.descricao + "\n" : "") + line;
    }
  }

  if (current) dias.push({ ...current, descricao: String(current.descricao || "").trim() } as VoucherDia);
  return dias;
}

function parseHotelLines(lines: string[]): VoucherHotel[] {
  const structuredHotels = parseStructuredHotelLines(lines);
  if (structuredHotels.length) return structuredHotels;

  const hoteis: VoucherHotel[] = [];
  let current: Partial<VoucherHotel> = {};

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) continue;

    if (looksLikeCityLine(line)) {
      if (current.cidade && current.hotel) {
        hoteis.push({ ...current, ordem: hoteis.length } as VoucherHotel);
      }
      current = { cidade: titleCaseKeepAcronyms(line) };
    } else if (/^hotel\s*[:\-]/i.test(line)) {
      current.hotel = titleCaseKeepAcronyms(line.replace(/^hotel\s*[:\-]/i, ""));
    } else if (/^endere[çc]o\s*[:\-]/i.test(line)) {
      current.endereco = line.replace(/^endere[çc]o\s*[:\-]/i, "").trim();
    } else if (/^(?:data\s*)?in[íi]cio\s*[:\-]/i.test(line)) {
      current.data_inicio = parseIsoDateLoose(line.replace(/^(?:data\s*)?in[íi]cio\s*[:\-]/i, ""));
    } else if (/^(?:data\s*)?fim\s*[:\-]/i.test(line)) {
      current.data_fim = parseIsoDateLoose(line.replace(/^(?:data\s*)?fim\s*[:\-]/i, ""));
    }
  }

  if (current.cidade && current.hotel) {
    hoteis.push({ ...current, ordem: hoteis.length } as VoucherHotel);
  }

  return hoteis.map((h) => ({
    ...h,
    noites: diffNights(h.data_inicio, h.data_fim),
  }));
}

function parseStructuredHotelLines(lines: string[]): VoucherHotel[] {
  const hoteis: VoucherHotel[] = [];
  let current: Partial<VoucherHotel> | null = null;
  let sawStructuredDetails = false;

  const pushCurrent = () => {
    if (!current?.hotel) return;
    hoteis.push({
      cidade: cleanLine(current.cidade) || "",
      hotel: cleanLine(current.hotel),
      endereco: cleanLine(current.endereco) || null,
      data_inicio: current.data_inicio || null,
      data_fim: current.data_fim || null,
      noites: diffNights(current.data_inicio, current.data_fim),
      telefone: cleanLine(current.telefone) || null,
      contato: cleanLine(current.contato) || null,
      status: cleanLine(current.status) || null,
      observacao: cleanLine(current.observacao) || null,
      ordem: hoteis.length,
    } as VoucherHotel);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const hotelValue = getLineValue(lines, index, /^hotel(?:\s*[:\-]\s*|\s+)(.*)$/i);
    if (hotelValue) {
      if (current?.hotel) pushCurrent();
      current = {
        cidade: "",
        hotel: stripHotelStars(hotelValue.value),
      };
      index = hotelValue.nextIndex;
      continue;
    }

    if (!current) continue;

    const addressValue = getLineValue(lines, index, /^endere[çc]o(?:\s*\/\s*address)?(?:\s*[:\-]\s*|\s+)(.*)$/i);
    if (addressValue) {
      current.endereco = addressValue.value;
      sawStructuredDetails = true;
      index = addressValue.nextIndex;
      continue;
    }

    const phoneValue = getLineValue(lines, index, /^telefone(?:\s*[:\-]\s*|\s+)(.*)$/i);
    if (phoneValue) {
      current.telefone = phoneValue.value;
      sawStructuredDetails = true;
      index = phoneValue.nextIndex;
      continue;
    }

    const dateValue = getLineValue(lines, index, /^check\s*in\s*\/?\s*out(?:\s*[:\-]\s*|\s+)(.*)$/i);
    if (dateValue) {
      const range = parseHotelDateRange(dateValue.value);
      current.data_inicio = range.start || current.data_inicio || null;
      current.data_fim = range.end || current.data_fim || null;
      sawStructuredDetails = true;
      index = dateValue.nextIndex;
    }
  }

  if (current?.hotel) pushCurrent();
  if (!sawStructuredDetails) return [];
  return mergeConsecutiveHotels(hoteis);
}

export function parseSpecialToursCircuitPasteText(
  text: string,
  provider: VoucherProvider = "special_tours",
): VoucherImportResult {
  const result = createEmptyVoucherImport(provider);
  const normalized = cleanMultilineText(text);
  if (!normalized) return result;

  const lines: string[] = [];
  for (const rawLine of normalized.split("\n")) {
    const line = cleanLine(rawLine);
    if (line) lines.push(line);
  }

  const itineraryRange = findSpecialToursItineraryRange(lines);
  const dayLines: string[] = [];
  const hotelLines: string[] = [];
  const startEndDates = extractSpecialToursStartEndDates(lines);

  if (startEndDates.start) result.data_inicio = startEndDates.start;
  if (startEndDates.end) result.data_fim = startEndDates.end;

  let inItinerary = false;
  let inHotels = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lower = normalizeText(line);

    if (itineraryRange && index >= itineraryRange.start && index <= itineraryRange.end) {
      dayLines.push(line);
      continue;
    }

    if (!itineraryRange && (lower.includes("itinerario") || lower.includes("dia a dia"))) {
      inItinerary = true;
      inHotels = false;
      continue;
    }
    if (
      lower.startsWith("data e cidade de inicio") ||
      lower.startsWith("data e cidade de início") ||
      lower.startsWith("conversa com")
    ) {
      inItinerary = false;
      inHotels = false;
      continue;
    }
    if ((lower.includes("hotel") || lower.includes("hoteis")) && (lower.includes("confirmado") || lower.includes("lista"))) {
      inItinerary = false;
      inHotels = true;
      continue;
    }

    if (inItinerary) dayLines.push(line);
    if (inHotels) hotelLines.push(line);
  }

  result.dias = parseSpecialToursDays(dayLines, result.data_inicio || null);
  result.hoteis = parseSpecialToursHotels(hotelLines);

  return result;
}

function findSpecialToursItineraryRange(lines: string[]): { start: number; end: number } | null {
  let start = -1;
  let end = lines.length - 1;

  for (let i = 0; i < lines.length; i += 1) {
    const n = normalizeText(lines[i]);
    if (start === -1 && (n.startsWith("itinerario do circuito") || n === "itinerario")) {
      start = i + 1;
      continue;
    }
    if (
      start !== -1 &&
      (n.startsWith("data e cidade de inicio") || n.startsWith("data e cidade de início") || n.startsWith("conversa com"))
    ) {
      end = i - 1;
      break;
    }
  }

  if (start === -1 || end < start) return null;
  return { start, end };
}

function extractSpecialToursStartEndDates(lines: string[]): { start: string; end: string } {
  const matches: string[] = [];
  for (const line of lines) {
    const n = normalizeText(line);
    if (!(n.startsWith("data e cidade de inicio") || n.startsWith("data e cidade de início"))) continue;

    const afterLabel = line.split(":").slice(1).join(":").trim();
    const dateText = afterLabel.split("-")[0]?.trim() || afterLabel;
    const iso = parseIsoDateLoose(dateText);
    if (iso) matches.push(iso);
  }

  if (!matches.length) return { start: "", end: "" };
  if (matches.length === 1) return { start: matches[0], end: matches[0] };
  return { start: matches[0], end: matches[matches.length - 1] };
}

function parseSpecialToursDays(lines: string[], startDate?: string | null): VoucherDia[] {
  const dias: VoucherDia[] = [];
  let current: Partial<VoucherDia> | null = null;

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) continue;

    const dayMatch = line.match(/^dia\s*(\d+)[ºoª]?\s*[:\-.–—]?\s*(.*)$/i) || line.match(/^(\d+)[\s:.-]+(.+)$/);
    if (dayMatch) {
      if (current) dias.push({ ...current, descricao: String(current.descricao || "").trim() } as VoucherDia);
      current = { dia_numero: Number(dayMatch[1]), titulo: dayMatch[2], descricao: "", ordem: dias.length };
    } else if (current) {
      current.descricao = (current.descricao ? current.descricao + "\n" : "") + line;
    }
  }

  if (current) dias.push({ ...current, descricao: String(current.descricao || "").trim() } as VoucherDia);

  const baseDate = startDate ? parseIsoDateLoose(startDate) : "";
  if (!baseDate) return dias;

  return dias.map((dia, index) => ({
    ...dia,
    data_referencia: parseIsoDateLoose(baseDate)
      ? toIsoDate(new Date(new Date(`${baseDate}T12:00:00`).getTime() + index * 86400000))
      : dia.data_referencia || null,
  }));
}

function parseSpecialToursHotels(lines: string[]): VoucherHotel[] {
  const structuredHotels = parseStructuredHotelLines(lines);
  if (structuredHotels.length) return structuredHotels;

  const hoteis: VoucherHotel[] = [];
  let currentCity = "";

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) continue;

    if (looksLikeCityLine(line)) {
      currentCity = titleCaseKeepAcronyms(line);
      continue;
    }

    if (currentCity) {
      const hotelName = stripHotelStars(line);
      if (hotelName && hotelName.length > 3) {
        hoteis.push({
          cidade: currentCity,
          hotel: titleCaseKeepAcronyms(hotelName),
          ordem: hoteis.length,
        });
      }
    }
  }

  return hoteis;
}

export function parseSpecialToursHotelPaste(
  text: string,
  provider: VoucherProvider = "special_tours",
): VoucherImportResult {
  const result = createEmptyVoucherImport(provider);
  result.hoteis = parseSpecialToursHotels(text.split("\n"));
  return result;
}

export async function extractVoucherImportFromFile(file: File, provider: VoucherProvider): Promise<VoucherImportResult> {
  const ext = fileExt(file.name);
  
  if (ext === "txt") {
    const text = await file.text();
    const supportsCircuitPaste =
      provider === "special_tours" || provider === "sato_tours" || provider === "europamundo";

    if (!supportsCircuitPaste) return parseVoucherImportText(text, provider);

    const parsedCircuit = parseSpecialToursCircuitPasteText(text, provider);
    const hasItinerary = parsedCircuit.dias.length > 0 || parsedCircuit.hoteis.length > 0;

    return hasItinerary ? parsedCircuit : parseVoucherImportText(text, provider);
  }
  
  throw new Error("Formato não suportado. Use arquivo .txt ou copie e cole o texto.");
}
