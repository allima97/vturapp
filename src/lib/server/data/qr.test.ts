import { describe, expect, it } from "vitest";
import { otpauthUri, qrDataUrl } from "./qr";

describe("QR do autenticador", () => {
  it("codifica otpauth:// e devolve um SVG de módulos", () => {
    const uri = otpauthUri("ana@exemplo.test", "JBSWY3DPEHPK3PXP");
    expect(uri.startsWith("otpauth://totp/VTUR:")).toBe(true);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");

    const image = qrDataUrl(uri);
    const svg = decodeURIComponent(
      image.replace(/^data:image\/svg\+xml;utf-8,/, ""),
    );
    expect(image.startsWith("data:image/svg+xml")).toBe(true);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<path");
    expect((svg.match(/h6v6/g) || []).length).toBeGreaterThan(20);
  });
});
