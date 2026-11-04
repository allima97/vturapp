import { describe, expect, it } from "vitest";
import {
  BUCKET_RULES,
  isPublicBucket,
  validateStorageUpload,
} from "./storageApi";

describe("regras dos buckets legados", () => {
  it("trata como publico só o que o inventário marcava como publico", () => {
    expect(Object.keys(BUCKET_RULES)).toHaveLength(10);
    expect(isPublicBucket("campanhas")).toBe(true);
    expect(isPublicBucket("profile-avatars")).toBe(true);
    expect(isPublicBucket("viagens")).toBe(true);
    expect(isPublicBucket("quotes")).toBe(false);
    expect(isPublicBucket("master-docs")).toBe(false);
    expect(isPublicBucket("voucher-assets")).toBe(false);
  });

  it("aplica tamanho e tipo do bucket viagens", () => {
    expect(validateStorageUpload("viagens", 2_097_152, "application/pdf")).toBeNull();
    expect(validateStorageUpload("viagens", 2_097_153, "application/pdf")).toMatch(/limite/);
    expect(validateStorageUpload("viagens", 100, "text/plain")).toMatch(/tipo/);
    expect(validateStorageUpload("bucket-inexistente", 10, "text/plain")).toMatch(/desconhecido/);
    expect(validateStorageUpload("quotes", 10_000_000, "application/pdf")).toBeNull();
  });
});
