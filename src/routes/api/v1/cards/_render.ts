import { VTUR_LOGO_URL } from "$lib/brand";
import type { RequestEvent } from '@sveltejs/kit';
import { env as publicEnv } from '$env/dynamic/public';
import { buildCardFontFaceCss } from '$lib/cards/cardFonts';
import { resolveThemeAssetMeta } from '$lib/cards/themeAssetMeta';
import {
  getCardThemeLayout,
  type CardThemeLogoSlot,
  type CardThemeMask,
  type CardThemePhotoSlot,
} from '$lib/cards/themeLayouts';
import { resolveCardStyleMap } from '$lib/cards/styleConfig';
import { renderTemplateText } from '$lib/messageTemplates';
import {
  buildCardClientGreeting,
  DEFAULT_CARD_FOOTER_LEAD,
} from '$lib/cards/templateRuntime';
import { isUuid } from '$lib/server/v1';

export type CardStyle = {
  x?: number;
  y?: number;
  maxWidth?: number;
  width?: number;
  fontSize?: number;
  fontWeight?: number | string;
  color?: string;
  fontFamily?: string;
  align?: "left" | "center" | "right" | "justify";
  textAlign?: "left" | "center" | "right" | "justify";
  lineHeight?: number;
  italic?: boolean;
  fontStyle?: "normal" | "italic";
};

export type CardRenderResult = {
  svg: string;
  width: number;
  height: number;
};

const MASTER_WIDTH = 1080;
const MASTER_HEIGHT = 1080;
const MASTER_LAYOUT_KEY = "master-card-v1";
const MAX_CARD_DIMENSION = 2160;
const MAX_TEXT_PARAM_LENGTH = 900;
const MAX_SHORT_TEXT_PARAM_LENGTH = 180;
const MAX_URL_PARAM_LENGTH = 2048;
// Limite para imagens de fundo incorporadas aos cartões.
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;
const INLINE_IMAGE_FETCH_TIMEOUT_MS = 2500;
const DEFAULT_LOGO_SLOT_MASTER = {
  x: 848,
  y: 848,
  width: 120,
  height: 120,
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseNum(v: string | null | undefined, fallback: number) {
  if (v == null) return fallback;
  const raw = String(v).trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseDimension(v: string | null | undefined, fallback: number) {
  const parsed = parseNum(v, fallback);
  return Math.max(320, Math.min(MAX_CARD_DIMENSION, Math.round(parsed)));
}

function parseOffset(v: string | null | undefined, fallback = 0) {
  if (v == null) return fallback;
  const raw = String(v).trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(-240, Math.min(240, Math.round(n)));
}

function limitText(value: string | null | undefined, maxLength = MAX_TEXT_PARAM_LENGTH) {
  return String(value || "")
    .replace(/\0/g, "")
    .trim()
    .slice(0, maxLength);
}

function trustedImageOrigins(appOrigin: string) {
  const origins = new Set<string>([appOrigin]);
  const supabaseUrl = String(publicEnv.PUBLIC_SUPABASE_URL || "").trim();
  if (supabaseUrl) {
    try {
      origins.add(new URL(supabaseUrl).origin);
    } catch {
      // Ignora configuração inválida; a validação abaixo permanece fechada para externos.
    }
  }
  return origins;
}

function isTrustedImageUrl(parsed: URL, appOrigin: string) {
  if (!trustedImageOrigins(appOrigin).has(parsed.origin)) return false;

  if (parsed.origin === appOrigin) {
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.startsWith("/api/") || pathname.startsWith("/auth/")) return false;
    if (
      pathname.startsWith("/brand/") ||
      pathname.startsWith("/assets/") ||
      pathname.startsWith("/icons/") ||
      pathname.startsWith("/_app/") ||
      pathname.startsWith("/public/") ||
      /\.(png|jpe?g|webp|gif|svg)$/.test(pathname)
    ) {
      return true;
    }
    return false;
  }

  return true;
}

function sanitizeImageUrl(rawValue: string, appOrigin: string) {
  const raw = limitText(rawValue, MAX_URL_PARAM_LENGTH);
  if (!raw) return "";

  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(raw) && raw.length <= MAX_INLINE_IMAGE_BYTES) {
    return raw;
  }

  try {
    const parsed = raw.startsWith("/") ? new URL(raw, appOrigin) : new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    if (!isTrustedImageUrl(parsed, appOrigin)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function parseBooleanParam(v: string | null | undefined): boolean | undefined {
  if (v == null) return undefined;
  const raw = String(v).trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "sim" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "nao" || raw === "não" || raw === "off") return false;
  return undefined;
}

function splitParagraph(text: string, maxChars: number) {
  const words = text.match(/\S+/g) || [];
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function wrapText(text: string, style: CardStyle) {
  const safeText = String(text || "").replace(/\r/g, "").trim();
  if (!safeText) return [];
  const fontSize = Number(style.fontSize || 52);
  const maxWidth = Number(style.maxWidth || style.width || 860);
  const maxChars = Math.max(8, Math.floor(maxWidth / Math.max(fontSize * 0.55, 8)));

  // Respeita quebras manuais, mas também faz wrap de cada linha para não estourar a área técnica.
  const paragraphs = safeText.split("\n");
  const lines: string[] = [];
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) {
      lines.push("");
      continue;
    }
    const wrapped = splitParagraph(trimmed, maxChars);
    if (!wrapped.length) {
      lines.push("");
      continue;
    }
    for (const line of wrapped) lines.push(line);
  }
  return lines;
}

function estimateWordWidth(word: string, fontSize: number) {
  const normalized = String(word || "").trim();
  if (!normalized) return Math.max(1, fontSize * 0.28);
  return Math.max(fontSize * 0.3, normalized.length * fontSize * 0.56);
}

function resolveAlign(value?: string | null): "left" | "center" | "right" | "justify" {
  const align = String(value || "").trim().toLowerCase();
  if (align === "left" || align === "center" || align === "right" || align === "justify") return align;
  return "center";
}

function drawTextBlock(text: string, style: CardStyle) {
  const lines = wrapText(text, style);
  if (!lines.length) return "";
  const x = Number(style.x || 540);
  const y = Number(style.y || 760);
  const maxWidth = Number(style.maxWidth || style.width || 860);
  const fontSize = Number(style.fontSize || 52);
  const fontWeight = String(style.fontWeight || "500");
  const color = escapeXml(String(style.color || "#0A0A0A"));
  const fontFamily = escapeXml(String(style.fontFamily || "Alegreya Sans, Arial, sans-serif"));
  const align = resolveAlign(style.align || style.textAlign || "center");
  const lineHeight = Number(style.lineHeight || 1.2);
  const italic = style.italic || style.fontStyle === "italic" ? "italic" : "normal";
  const step = Math.round(fontSize * lineHeight);
  const textAttrs = `font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}" font-style="${italic}"`;

  if (align !== "justify") {
    const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
    const tspans = lines
      .map((line, idx) => `<tspan x="${x}" dy="${idx === 0 ? 0 : step}">${escapeXml(line || " ")}</tspan>`)
      .join("");
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" ${textAttrs}>${tspans}</text>`;
  }

  const lastNonEmptyLineIdx = (() => {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (String(lines[i] || "").trim()) return i;
    }
    return -1;
  })();

  const justifiedLines = lines
    .map((line, idx) => {
      const trimmedLine = String(line || "").trim();
      if (!trimmedLine) return "";
      const lineY = y + idx * step;
      const isLastLine = idx >= lastNonEmptyLineIdx;
      const words = trimmedLine.match(/\S+/g) || [];

      if (isLastLine || words.length < 2) {
        return `<text x="${x}" y="${lineY}" text-anchor="start" ${textAttrs}>${escapeXml(trimmedLine)}</text>`;
      }

      const totalWordWidth = words.reduce((acc, word) => acc + estimateWordWidth(word, fontSize), 0);
      const gapCount = words.length - 1;
      const calculatedGap = (maxWidth - totalWordWidth) / gapCount;
      const minGap = fontSize * 0.14;

      if (!Number.isFinite(calculatedGap) || calculatedGap < minGap) {
        return `<text x="${x}" y="${lineY}" text-anchor="start" ${textAttrs}>${escapeXml(trimmedLine)}</text>`;
      }

      let cursorX = x;
      return words
        .map((word, wordIndex) => {
          const node = `<text x="${cursorX.toFixed(2)}" y="${lineY}" text-anchor="start" ${textAttrs}>${escapeXml(word)}</text>`;
          cursorX += estimateWordWidth(word, fontSize);
          if (wordIndex < words.length - 1) cursorX += calculatedGap;
          return node;
        })
        .join("");
    })
    .join("");

  return justifiedLines;
}

function drawPhotoBlock(photoUrl: string, slot: CardThemePhotoSlot) {
  const x = Number(slot.x || 0);
  const y = Number(slot.y || 0);
  const width = Number(slot.width || 0);
  const height = Number(slot.height || 0);
  if (!photoUrl || width <= 0 || height <= 0) return "";

  const framePadding = Math.max(0, Number(slot.framePadding || 0));
  const frameRadius = Math.max(0, Number(slot.frameRadius || 0));
  const rotation = Number(slot.rotation || 0);
  const frameFill = escapeXml(String(slot.frameFill || "#FFFFFF"));
  const shadowColor = escapeXml(String(slot.shadowColor || "rgba(0,0,0,0.18)"));
  const shadowBlur = Math.max(0, Number(slot.shadowBlur || 12));
  const shadowDx = Number(slot.shadowDx || 0);
  const shadowDy = Number(slot.shadowDy || 8);
  const outerX = x - framePadding;
  const outerY = y - framePadding;
  const outerWidth = width + framePadding * 2;
  const outerHeight = height + framePadding * 2;
  const centerX = outerX + outerWidth / 2;
  const centerY = outerY + outerHeight / 2;
  const innerRadius = Math.max(0, frameRadius - Math.min(framePadding, frameRadius));
  const transform = rotation ? ` transform="rotate(${rotation} ${centerX} ${centerY})"` : "";

  return `
  <defs>
    <filter id="cardPhotoShadow" x="${outerX - 60}" y="${outerY - 60}" width="${outerWidth + 120}" height="${outerHeight + 120}" filterUnits="userSpaceOnUse">
      <feDropShadow dx="${shadowDx}" dy="${shadowDy}" stdDeviation="${shadowBlur}" flood-color="${shadowColor}" />
    </filter>
    <clipPath id="cardPhotoClip">
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${innerRadius}" />
    </clipPath>
  </defs>
  <g${transform}>
    <rect x="${outerX}" y="${outerY}" width="${outerWidth}" height="${outerHeight}" rx="${frameRadius}" fill="${frameFill}" filter="url(#cardPhotoShadow)" />
    <image href="${escapeXml(photoUrl)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cardPhotoClip)" />
  </g>`;
}

function scaleLogoSlot(
  slot: CardThemeLogoSlot,
  layoutCanvas: { width?: number; height?: number } | undefined,
  width: number,
  height: number,
): CardThemeLogoSlot {
  const baseWidth = Math.max(1, Number(layoutCanvas?.width || width || MASTER_WIDTH));
  const baseHeight = Math.max(1, Number(layoutCanvas?.height || height || MASTER_HEIGHT));
  const scaleX = width / baseWidth;
  const scaleY = height / baseHeight;
  return {
    x: Math.round(Number(slot.x || 0) * scaleX),
    y: Math.round(Number(slot.y || 0) * scaleY),
    width: Math.round(Number(slot.width || 0) * scaleX),
    height: Math.round(Number(slot.height || 0) * scaleY),
  };
}

function resolveLogoSlot(
  themeLayout: ReturnType<typeof getCardThemeLayout>,
  width: number,
  height: number,
): CardThemeLogoSlot {
  // Metodologia técnica padronizada: logo sempre no slot técnico master.
  // Se no futuro for necessário liberar exceções por tema, basta alterar este flag.
  const useThemeLogoSlot = false;
  if (useThemeLogoSlot && themeLayout?.logo) {
    return scaleLogoSlot(themeLayout.logo, themeLayout.canvas, width, height);
  }
  const scaleX = width / MASTER_WIDTH;
  const scaleY = height / MASTER_HEIGHT;
  return {
    x: Math.round(DEFAULT_LOGO_SLOT_MASTER.x * scaleX),
    y: Math.round(DEFAULT_LOGO_SLOT_MASTER.y * scaleY),
    width: Math.round(DEFAULT_LOGO_SLOT_MASTER.width * scaleX),
    height: Math.round(DEFAULT_LOGO_SLOT_MASTER.height * scaleY),
  };
}

function drawLogoBlock(logoUrl: string, slot: CardThemeLogoSlot) {
  const x = Number(slot.x || 0);
  const y = Number(slot.y || 0);
  const width = Number(slot.width || 0);
  const height = Number(slot.height || 0);
  if (!logoUrl || width <= 0 || height <= 0) return "";
  return `<image href="${escapeXml(logoUrl)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" />`;
}

function drawMaskBlock(mask: CardThemeMask, id: string) {
  const x = Number(mask.x || 0);
  const y = Number(mask.y || 0);
  const width = Number(mask.width || 0);
  const height = Number(mask.height || 0);
  if (width <= 0 || height <= 0) return "";

  const radius = Math.max(0, Number(mask.radius || 0));
  const fill = escapeXml(String(mask.fill || "#FFFFFF"));
  const opacity = Math.min(1, Math.max(0, Number(mask.opacity ?? 1)));
  const blur = Math.max(0, Number(mask.blur || 0));

  if (blur > 0) {
    return `
  <defs>
    <filter id="${id}" x="${x - blur * 4}" y="${y - blur * 4}" width="${width + blur * 8}" height="${height + blur * 8}" filterUnits="userSpaceOnUse">
      <feGaussianBlur stdDeviation="${blur}" />
    </filter>
  </defs>
  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" opacity="${opacity}" filter="url(#${id})" />`;
  }

  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" opacity="${opacity}" />`;
}

function normalizeColor(value: unknown, fallback: string) {
  const color = String(value || "").trim();
  if (!color) return fallback;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return color;
  return fallback;
}

type TemplateRow = {
  theme_id?: string | null;
  titulo?: string | null;
  corpo?: string | null;
  assinatura?: string | null;
  signature_style?: unknown;
};

type ThemeRow = {
  id?: string | null;
  nome?: string | null;
  asset_url?: string | null;
  storage_path?: string | null;
  width_px?: number | null;
  height_px?: number | null;
  signature_style?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractSignatureTextConfig(signatureStyle?: unknown) {
  const content = isRecord(signatureStyle) && isRecord(signatureStyle.content)
    ? signatureStyle.content
    : null;
  const hasFooterLead =
    !!content && Object.prototype.hasOwnProperty.call(content, "footerLead");
  const hasConsultantRole =
    !!content && Object.prototype.hasOwnProperty.call(content, "consultantRole");

  return {
    footerLead: String(content?.footerLead || "").trim(),
    consultantRole: String(content?.consultantRole || "").trim(),
    hasFooterLead,
    hasConsultantRole,
  };
}

function fixedMasterStyle(params: {
  base: CardStyle;
  queryFontSize?: string | null;
  queryColor?: string | null;
  queryItalic?: boolean | null;
}) {
  const { base, queryFontSize, queryColor, queryItalic } = params;
  const fontSize = Math.max(8, Math.min(160, parseNum(queryFontSize, Number(base.fontSize || 48))));
  const lineHeightRaw = Number(base.lineHeight || 1.2);
  const lineHeight = Number.isFinite(lineHeightRaw) && lineHeightRaw > 0 ? lineHeightRaw : Number(base.lineHeight || 1.2);
  const fontFamily = String(base.fontFamily || "Alegreya Sans, Arial, sans-serif");
  const fontWeight = String(base.fontWeight || "500");
  const italicRaw = base.italic === true || base.fontStyle === "italic";
  const italic = queryItalic === null || queryItalic === undefined ? italicRaw : queryItalic;
  const color = normalizeColor(queryColor || base.color, String(base.color || "#0A0A0A"));

  return {
    x: base.x,
    y: base.y,
    maxWidth: base.maxWidth,
    width: base.width,
    align: base.align || base.textAlign,
    fontSize,
    lineHeight,
    fontFamily,
    fontWeight,
    color,
    italic,
  } as CardStyle;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isVisible(flag: boolean | undefined, fallback = true) {
  return flag === undefined ? fallback : flag;
}

function absoluteAssetUrl(origin: string, assetUrl: string) {
  const raw = limitText(assetUrl, MAX_URL_PARAM_LENGTH);
  if (!raw) return "";
  if (/^(https?:|data:)/i.test(raw) || raw.startsWith("/")) return sanitizeImageUrl(raw, origin);
  return sanitizeImageUrl(`/${raw.replace(/^\.?\//, "")}`, origin);
}

function guessImageMimeFromPath(path?: string | null) {
  const clean = String(path || "").split("?")[0].toLowerCase();
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

function normalizeImageMime(value?: string | null, fallback = "image/png") {
  const raw = String(value || "").split(";")[0].trim().toLowerCase();
  if (!raw || raw === "application/octet-stream" || raw === "binary/octet-stream") {
    return fallback;
  }
  return raw;
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function blobToImageDataUrl(blob: Blob, fallbackMime: string) {
  if (!blob || typeof blob.arrayBuffer !== "function") return "";
  const payload = await blob.arrayBuffer();
  if (!payload.byteLength || payload.byteLength > MAX_INLINE_IMAGE_BYTES) return "";
  const mime = normalizeImageMime(blob.type, fallbackMime || "image/png");
  return `data:${mime};base64,${toBase64(payload)}`;
}

async function resolveInlineImageHref(sourceUrl: string, appOrigin: string) {
  const raw = sanitizeImageUrl(sourceUrl, appOrigin);
  if (!raw) return "";
  if (raw.startsWith("data:")) return raw;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INLINE_IMAGE_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(raw, { signal: controller.signal });
    if (!resp.ok) return raw;
    const contentType = normalizeImageMime(
      resp.headers.get("content-type"),
      guessImageMimeFromPath(raw),
    );
    if (!contentType.startsWith("image/")) return raw;
    const contentLength = Number(resp.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_INLINE_IMAGE_BYTES) return raw;
    const payload = await resp.arrayBuffer();
    if (!payload.byteLength || payload.byteLength > MAX_INLINE_IMAGE_BYTES) return raw;
    const base64 = toBase64(payload);
    return `data:${contentType};base64,${base64}`;
  } catch {
    return raw;
  } finally {
    clearTimeout(timeout);
  }
}

export async function renderCardSvg(event: RequestEvent): Promise<CardRenderResult> {
  const url = new URL(event.request.url);
  const client = event.locals.supabase;
  const sessionContext = await event.locals.safeGetSession().catch(() => ({ user: null }));
  const canReadStoredRows = Boolean(sessionContext?.user);

  const nome = limitText(url.searchParams.get("nome"), MAX_SHORT_TEXT_PARAM_LENGTH) || "Cliente";
  const clienteNomeLiteralRaw = limitText(url.searchParams.get("cliente_nome_literal"), MAX_SHORT_TEXT_PARAM_LENGTH);
  const tituloRaw = limitText(url.searchParams.get("titulo"), 240);
  const corpoRaw = limitText(url.searchParams.get("corpo"), MAX_TEXT_PARAM_LENGTH);
  const hasFooterLeadParam = url.searchParams.has("footer_lead");
  const hasCargoConsultorParam = url.searchParams.has("cargo_consultor");
  const footerLeadRaw = limitText(url.searchParams.get("footer_lead"), MAX_SHORT_TEXT_PARAM_LENGTH);
  const assinaturaRaw = limitText(url.searchParams.get("assinatura"), MAX_SHORT_TEXT_PARAM_LENGTH);
  const consultorRaw = limitText(url.searchParams.get("consultor"), MAX_SHORT_TEXT_PARAM_LENGTH);
  const cargoConsultorRaw = limitText(url.searchParams.get("cargo_consultor"), MAX_SHORT_TEXT_PARAM_LENGTH);
  const footerLeadFontSizeRaw = url.searchParams.get("footer_lead_font_size");
  const consultantFontSizeRaw = url.searchParams.get("consultant_font_size") || url.searchParams.get("signature_font_size");
  const consultantRoleFontSizeRaw = url.searchParams.get("consultant_role_font_size");
  const footerLeadItalic = parseBooleanParam(url.searchParams.get("footer_lead_italic"));
  const consultantItalic = parseBooleanParam(url.searchParams.get("consultant_italic"));
  const consultantRoleItalic = parseBooleanParam(url.searchParams.get("consultant_role_italic"));
  const textColorRaw = limitText(url.searchParams.get("text_color"), 32);
  const titleOffsetX = parseOffset(url.searchParams.get("title_offset_x"));
  const titleOffsetY = parseOffset(url.searchParams.get("title_offset_y"));
  const clientOffsetX = parseOffset(url.searchParams.get("client_offset_x"));
  const clientOffsetY = parseOffset(url.searchParams.get("client_offset_y"));
  const bodyOffsetX = parseOffset(url.searchParams.get("body_offset_x"));
  const bodyOffsetY = parseOffset(url.searchParams.get("body_offset_y"));
  const signatureOffsetX = parseOffset(url.searchParams.get("signature_offset_x"));
  const signatureOffsetY = parseOffset(url.searchParams.get("signature_offset_y"));
  const logoOffsetX = parseOffset(url.searchParams.get("logo_offset_x"));
  const logoOffsetY = parseOffset(url.searchParams.get("logo_offset_y"));
  const empresaRaw = limitText(url.searchParams.get("empresa"), MAX_SHORT_TEXT_PARAM_LENGTH);
  const origemRaw = limitText(url.searchParams.get("origem"), MAX_SHORT_TEXT_PARAM_LENGTH);
  const destinoRaw = limitText(url.searchParams.get("destino"), MAX_SHORT_TEXT_PARAM_LENGTH);
  const dataViagemRaw = limitText(url.searchParams.get("data_viagem"), 40);
  const dataEmbarqueRaw = limitText(url.searchParams.get("data_embarque"), 40);
  const dataRetornoRaw = limitText(url.searchParams.get("data_retorno"), 40);
  const ctaRaw = limitText(url.searchParams.get("cta"), MAX_SHORT_TEXT_PARAM_LENGTH);
  const mensagemRaw = limitText(url.searchParams.get("mensagem"), MAX_TEXT_PARAM_LENGTH);
  const photoUrlRaw = sanitizeImageUrl(String(url.searchParams.get("photo_url") || url.searchParams.get("photo") || ""), url.origin);
  const templateIdRaw = limitText(url.searchParams.get("template_id"), 80);
  const templateId = isUuid(templateIdRaw) ? templateIdRaw : "";
  const themeIdRaw = limitText(url.searchParams.get("theme_id"), 80);
  let themeId = isUuid(themeIdRaw) ? themeIdRaw : "";
  const themeName = limitText(url.searchParams.get("theme_name") || url.searchParams.get("theme_key"), MAX_SHORT_TEXT_PARAM_LENGTH);
  const themeAssetUrlFromQuery = sanitizeImageUrl(String(url.searchParams.get("theme_asset_url") || ""), url.origin);

  let templateRow: TemplateRow | null = null;
  if (canReadStoredRows && templateId) {
    const tplResp = await client
      .from("user_message_templates")
      .select("id, titulo, corpo, assinatura, theme_id, title_style, body_style, signature_style")
      .eq("id", templateId)
      .maybeSingle();
    if (!tplResp.error && tplResp.data) {
      templateRow = tplResp.data as TemplateRow;
      if (!themeId && templateRow.theme_id) themeId = String(templateRow.theme_id);
    }
  }

  let themeRow: ThemeRow | null = null;
  if (canReadStoredRows && (themeId || themeName)) {
    const themeSelectLegacy = "id, nome, asset_url, storage_path, width_px, height_px, title_style, body_style, signature_style";
    let themeResp = themeId
      ? await client
          .from("user_message_template_themes")
          .select(themeSelectLegacy)
          .eq("id", themeId)
          .maybeSingle()
      : await client
          .from("user_message_template_themes")
          .select(themeSelectLegacy)
          .eq("nome", themeName)
          .maybeSingle();


    if (!themeResp.error && themeResp.data) themeRow = themeResp.data as ThemeRow;
    if (!themeId && themeRow?.id) themeId = String(themeRow.id);
  }

  const activeThemeName = themeName || String(themeRow?.nome || "").trim();
  const resolvedThemeAsset = resolveThemeAssetMeta(
    themeRow
      ? {
          nome: themeRow.nome,
          asset_url: themeRow.asset_url,
          storage_path: themeRow.storage_path,
          width_px: themeRow.width_px,
          height_px: themeRow.height_px,
        }
      : null,
  );
  const themeLayout = getCardThemeLayout(activeThemeName);
  // Layout técnico oficial: sempre 1080x1080 para manter posições/zonas fixas.
  const width = parseDimension(url.searchParams.get("width"), MASTER_WIDTH);
  const height = parseDimension(url.searchParams.get("height"), MASTER_HEIGHT);
  // Metodologia técnica padronizada: estilos fixos para todas as artes.
  const resolvedStyleMap = resolveCardStyleMap();

  const titleStyle = fixedMasterStyle({
    base: resolvedStyleMap.title,
  });

  const clientNameStyle = fixedMasterStyle({
    base: resolvedStyleMap.clientName,
  });

  const bodyStyle = fixedMasterStyle({
    base: resolvedStyleMap.body,
  });

  const footerLeadStyle = fixedMasterStyle({
    base: resolvedStyleMap.footerLead,
    queryFontSize: footerLeadFontSizeRaw,
    queryItalic: footerLeadItalic,
  });

  const consultantStyle = fixedMasterStyle({
    base: resolvedStyleMap.consultant,
    queryFontSize: consultantFontSizeRaw,
    queryItalic: consultantItalic,
  });

  const consultantRoleStyle = fixedMasterStyle({
    base: resolvedStyleMap.consultantRole,
    queryFontSize: consultantRoleFontSizeRaw,
    queryItalic: consultantRoleItalic,
  });

  const unifiedTextColor = normalizeColor(textColorRaw, "#1B4F9A");
  if (unifiedTextColor) {
    titleStyle.color = unifiedTextColor;
    clientNameStyle.color = unifiedTextColor;
    bodyStyle.color = unifiedTextColor;
    footerLeadStyle.color = unifiedTextColor;
    consultantStyle.color = unifiedTextColor;
    consultantRoleStyle.color = unifiedTextColor;
  }

  titleStyle.x = Number(titleStyle.x || 0) + titleOffsetX;
  titleStyle.y = Number(titleStyle.y || 0) + titleOffsetY;
  clientNameStyle.x = Number(clientNameStyle.x || 0) + clientOffsetX;
  clientNameStyle.y = Number(clientNameStyle.y || 0) + clientOffsetY;
  bodyStyle.x = Number(bodyStyle.x || 0) + bodyOffsetX;
  bodyStyle.y = Number(bodyStyle.y || 0) + bodyOffsetY;
  footerLeadStyle.x = Number(footerLeadStyle.x || 0) + signatureOffsetX;
  footerLeadStyle.y = Number(footerLeadStyle.y || 0) + signatureOffsetY;
  consultantStyle.x = Number(consultantStyle.x || 0) + signatureOffsetX;
  consultantStyle.y = Number(consultantStyle.y || 0) + signatureOffsetY;
  consultantRoleStyle.x = Number(consultantRoleStyle.x || 0) + signatureOffsetX;
  consultantRoleStyle.y = Number(consultantRoleStyle.y || 0) + signatureOffsetY;

  const titulo = tituloRaw || templateRow?.titulo || `${nome}, feliz aniversário!`;
  const corpo =
    corpoRaw ||
    templateRow?.corpo ||
    "Que seu novo ano seja cheio de viagens, conquistas e momentos inesquecíveis.";
  const signatureTheme = extractSignatureTextConfig(themeRow?.signature_style);
  const signatureTemplate = extractSignatureTextConfig(templateRow?.signature_style);
  const hasFooterLeadConfig = signatureTemplate.hasFooterLead || signatureTheme.hasFooterLead;
  const hasConsultantRoleConfig = signatureTemplate.hasConsultantRole || signatureTheme.hasConsultantRole;
  const footerLeadConfig = signatureTemplate.hasFooterLead ? signatureTemplate.footerLead : signatureTheme.footerLead;
  const consultantRoleConfig = signatureTemplate.hasConsultantRole
    ? signatureTemplate.consultantRole
    : signatureTheme.consultantRole;
  const assinatura = assinaturaRaw || templateRow?.assinatura || consultorRaw || "";
  const consultor = consultorRaw || assinatura || "Equipe vtur";
  const footerLead = hasFooterLeadParam
    ? footerLeadRaw
    : hasFooterLeadConfig
      ? footerLeadConfig
      : DEFAULT_CARD_FOOTER_LEAD;
  const cargoConsultor = hasCargoConsultorParam
    ? cargoConsultorRaw
    : hasConsultantRoleConfig
      ? consultantRoleConfig
      : "";

  const renderVars = {
    nomeCompleto: nome,
    assinatura: consultor,
    consultor,
    cargoConsultor,
    empresa: empresaRaw,
    origem: origemRaw,
    destino: destinoRaw,
    dataViagem: dataViagemRaw,
    dataEmbarque: dataEmbarqueRaw,
    dataRetorno: dataRetornoRaw,
    cta: ctaRaw,
    mensagem: mensagemRaw,
  };

  const forceNomeCompleto = Boolean(clienteNomeLiteralRaw);
  const titleText = renderTemplateText(titulo, renderVars, {
    useFullNameAsFirstName: forceNomeCompleto,
  });
  const clientNameTemplate = String(url.searchParams.get("cliente_nome") || "").trim();
  const clientNameText = clienteNomeLiteralRaw
    ? clienteNomeLiteralRaw
    : clientNameTemplate
      ? renderTemplateText(clientNameTemplate, renderVars, {
          useFullNameAsFirstName: true,
        })
      : buildCardClientGreeting(nome);
  const bodyTextRaw = renderTemplateText(corpo, {
    ...renderVars,
    mensagem: mensagemRaw || corpo,
  }, {
    useFullNameAsFirstName: forceNomeCompleto,
  });
  const bodyTextNoFooter = bodyTextRaw
    .replace(/\n+\s*com carinho\s*$/i, "")
    .replace(/\n+\s*consultor(?:a)? de viagens\s*$/i, "")
    .replace(new RegExp(`\\n+\\s*${escapeRegex(consultor)}\\s*$`, "i"), "")
    .trim();
  const bodyText = bodyTextNoFooter || bodyTextRaw;
  const footerLeadText = renderTemplateText(footerLead, renderVars, {
    useFullNameAsFirstName: forceNomeCompleto,
  });
  const consultantNameText = renderTemplateText("[CONSULTOR]", renderVars);
  const consultantRoleText = renderTemplateText("[CARGO_CONSULTOR]", renderVars);
  const showPhoto = Boolean(photoUrlRaw && themeLayout?.photo);
  const hideClientName = Boolean(showPhoto && themeLayout?.photo?.hideClientNameWhenPhoto);
  const hideBody = Boolean(showPhoto && themeLayout?.photo?.hideBodyWhenPhoto);
  const visibility = themeLayout?.visibility;
  const logoUrl = VTUR_LOGO_URL;
  const backgroundUrl = await resolveInlineImageHref(
    absoluteAssetUrl(
      url.origin,
      themeAssetUrlFromQuery || resolvedThemeAsset.asset_url,
    ),
    url.origin,
  );
  const logoSlotBase = resolveLogoSlot(themeLayout, width, height);
  const logoSlot = {
    ...logoSlotBase,
    x: Number(logoSlotBase.x || 0) + logoOffsetX,
    y: Number(logoSlotBase.y || 0) + logoOffsetY,
  };

  const fontFaceCss = buildCardFontFaceCss();
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <metadata>${MASTER_LAYOUT_KEY}</metadata>
  <style><![CDATA[
${fontFaceCss}
  ]]></style>
  <rect width="${width}" height="${height}" fill="#F5F8FC" />
  ${backgroundUrl ? `<image href="${escapeXml(backgroundUrl)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" />` : ""}
  ${showPhoto ? drawPhotoBlock(photoUrlRaw, themeLayout?.photo as CardThemePhotoSlot) : ""}
  ${themeLayout?.clientNameMask ? drawMaskBlock(themeLayout.clientNameMask, `clientNameMask-${activeThemeName || "default"}`) : ""}
  ${isVisible(visibility?.title) ? drawTextBlock(titleText, titleStyle) : ""}
  ${hideClientName || !isVisible(visibility?.clientName) ? "" : drawTextBlock(clientNameText, clientNameStyle)}
  ${hideBody || !isVisible(visibility?.body) ? "" : drawTextBlock(bodyText, bodyStyle)}
  ${isVisible(visibility?.footerLead) ? drawTextBlock(footerLeadText, footerLeadStyle) : ""}
  ${isVisible(visibility?.consultant) ? drawTextBlock(consultantNameText, consultantStyle) : ""}
  ${isVisible(visibility?.consultantRole) ? drawTextBlock(consultantRoleText, consultantRoleStyle) : ""}
  ${logoUrl && isVisible(visibility?.logo) ? drawLogoBlock(logoUrl, logoSlot) : ""}
</svg>`;

  return { svg, width, height };
}
