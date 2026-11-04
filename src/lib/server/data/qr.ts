import { renderSVG } from "uqr";

/** URI padrão otpauth consumido por aplicativos autenticadores. */
export function otpauthUri(account: string, secret: string) {
  const label = encodeURIComponent(account.trim() || "usuario");
  const query = new URLSearchParams({
    secret,
    issuer: "VTUR",
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/VTUR:${label}?${query.toString()}`;
}

/** SVG escaneável, pronto para <img src>. */
export function qrDataUrl(text: string) {
  const svg = renderSVG(text, { ecc: "M", border: 2, pixelSize: 6 });
  return `data:image/svg+xml;utf-8,${encodeURIComponent(svg)}`;
}
