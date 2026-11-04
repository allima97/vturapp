import type { DataContext, QueryResult } from "./types";

/** Regras capturadas em docs/migracao/SCHEMA-LEGADO-2026-10-31.json (storage.buckets). */
export const BUCKET_RULES: Record<
  string,
  { public: boolean; maxBytes: number | null; mime: string[] | null }
> = {
  campanhas: { public: true, maxBytes: null, mime: null },
  "master-docs": { public: false, maxBytes: null, mime: null },
  "message-template-themes": { public: true, maxBytes: null, mime: null },
  "mural-recados": { public: true, maxBytes: null, mime: null },
  "profile-avatars": { public: true, maxBytes: null, mime: null },
  quotes: { public: false, maxBytes: null, mime: null },
  "system-docs": { public: true, maxBytes: null, mime: null },
  viagens: {
    public: true,
    maxBytes: 2_097_152,
    mime: [
      "application/pdf",
      "application/jpg",
      "application/jpeg",
      "application/png",
      "application/doc",
      "image/jpeg",
      "image/png",
      "image/jpg",
    ],
  },
  "viagens-documentos": { public: false, maxBytes: null, mime: null },
  "voucher-assets": { public: false, maxBytes: null, mime: null },
};

export function isPublicBucket(bucket: string) {
  return Boolean(BUCKET_RULES[bucket]?.public);
}

export function validateStorageUpload(
  bucket: string,
  size: number,
  contentType: string,
) {
  const rule = BUCKET_RULES[bucket];
  if (!rule) return "bucket desconhecido";
  if (rule.maxBytes != null && size > rule.maxBytes) return "arquivo excede o limite do bucket";
  if (rule.mime && !rule.mime.includes(contentType)) return "tipo de arquivo nao permitido";
  return null;
}

export function storageKey(bucket: string, path: string) {
  const safeBucket = bucket.replace(/[^a-z0-9-]/gi, "");
  const safePath = path.replace(/^\/+/, "").replace(/\.\./g, "");
  return `arquivos/${safeBucket}/${safePath}`;
}

async function sign(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function signedFileUrl(
  context: Pick<DataContext, "origin" | "secret">,
  bucket: string,
  path: string,
  expiresIn: number,
) {
  const exp = Math.floor(Date.now() / 1000) + Math.max(30, expiresIn);
  const payload = `${bucket}/${path}/${exp}`;
  const signature = await sign(context.secret || "dev-file-key", payload);
  return `${context.origin}/api/arquivos/assinado/${exp}/${signature}/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export async function verifySignedFile(
  secret: string,
  bucket: string,
  path: string,
  exp: string,
  signature: string,
) {
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = await sign(
    secret || "dev-file-key",
    `${bucket}/${path}/${exp}`,
  );
  return expected === signature;
}

async function bodyBytes(body: unknown) {
  if (body instanceof ArrayBuffer) return body;
  if (ArrayBuffer.isView(body))
    return body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength,
    );
  if (typeof Blob !== "undefined" && body instanceof Blob)
    return body.arrayBuffer();
  if (typeof body === "string") return new TextEncoder().encode(body).buffer;
  throw new Error("corpo de arquivo invalido");
}

export function createStorageApi(context: DataContext) {
  return {
    from(bucket: string) {
      return {
        async upload(
          path: string,
          body: unknown,
          options?: { contentType?: string; upsert?: boolean },
        ) {
          if (!context.r2)
            return {
              data: null,
              error: {
                message: "R2 indisponivel",
                code: "R2",
                details: null,
                hint: null,
              },
            } satisfies QueryResult;
          const bytes = await bodyBytes(body);
          const size = bytes.byteLength;
          const contentType = options?.contentType || "application/octet-stream";
          const rejected = validateStorageUpload(bucket, size, contentType);
          if (rejected) {
            return {
              data: null,
              error: { message: rejected, code: "422", details: null, hint: null },
            } satisfies QueryResult;
          }
          const key = storageKey(bucket, path);
          if (!options?.upsert) {
            const existing = await context.r2.head(key);
            if (existing)
              return {
                data: null,
                error: {
                  message: "arquivo ja existe",
                  code: "409",
                  details: null,
                  hint: null,
                },
              };
          }
          await context.r2.put(key, bytes as ArrayBuffer, {
            httpMetadata: { contentType },
          });
          return { data: { path }, error: null };
        },
        async download(path: string) {
          if (!context.r2)
            return {
              data: null,
              error: {
                message: "R2 indisponivel",
                code: "R2",
                details: null,
                hint: null,
              },
            };
          const object = await context.r2.get(storageKey(bucket, path));
          if (!object)
            return {
              data: null,
              error: {
                message: "arquivo nao encontrado",
                code: "404",
                details: null,
                hint: null,
              },
            };
          const bytes = await object.arrayBuffer();
          const blob =
            typeof Blob === "undefined"
              ? bytes
              : new Blob([bytes], {
                  type:
                    object.httpMetadata?.contentType ||
                    "application/octet-stream",
                });
          return { data: blob, error: null };
        },
        async remove(paths: string[]) {
          if (!context.r2)
            return {
              data: null,
              error: {
                message: "R2 indisponivel",
                code: "R2",
                details: null,
                hint: null,
              },
            };
          await context.r2.delete(
            (paths || []).map((path) => storageKey(bucket, path)),
          );
          return { data: null, error: null };
        },
        async createSignedUrl(path: string, expiresIn: number) {
          return {
            data: {
              signedUrl: await signedFileUrl(context, bucket, path, expiresIn),
            },
            error: null,
          };
        },
        getPublicUrl(path: string) {
          const encoded = path.split("/").map(encodeURIComponent).join("/");
          return {
            data: {
              publicUrl: `${context.origin}/api/arquivos/publico/${encodeURIComponent(bucket)}/${encoded}`,
            },
          };
        },
      };
    },
  };
}
