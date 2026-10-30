/**
 * F1-05: Cliente R2 — fábrica e utilitários de isolamento por empresa.
 *
 * Padrão de chaves (key isolation):
 *   empresa/{empresaId}/{contexto}/{filename}
 *
 * Nunca exponha chaves de outras empresas: todo acesso valida o prefixo
 * empresa/{empresaId}/ antes de retornar ou operar o objeto.
 */

/** Constrói a chave R2 com isolamento por empresa */
export function r2Key(empresaId: number, context: string, filename: string): string {
  // Sanitiza filename para evitar traversal
  const safe = filename.replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 255);
  return `empresa/${empresaId}/${context}/${safe}`;
}

/** Garante que uma chave pertence à empresa (evita IDOR) */
export function assertKeyBelongsToEmpresa(key: string, empresaId: number): void {
  const prefix = `empresa/${empresaId}/`;
  if (!key.startsWith(prefix)) {
    throw new Error(`Chave R2 inválida para empresa ${empresaId}: ${key}`);
  }
}

/** Prefixo de listagem isolado por empresa */
export function r2Prefix(empresaId: number, context?: string): string {
  return context
    ? `empresa/${empresaId}/${context}/`
    : `empresa/${empresaId}/`;
}

/** Tipos de resultado de operações R2 */
export type R2UploadResult = {
  key: string;
  etag: string;
  size: number;
  contentType: string;
};

export type R2ListItem = {
  key: string;
  size: number;
  uploaded: Date;
  etag: string;
};

/**
 * Upload de arquivo para R2 com isolamento por empresa.
 *
 * @param r2       - R2Bucket binding do Cloudflare Workers
 * @param empresaId - ID da empresa (isolamento de tenant)
 * @param context  - Subpasta contextual (ex: 'documentos', 'logos', 'vouchers')
 * @param filename - Nome do arquivo sanitizado
 * @param body     - Conteúdo do arquivo (ArrayBuffer ou ReadableStream)
 * @param contentType - MIME type
 */
export async function r2Upload(
  r2: R2Bucket,
  empresaId: number,
  context: string,
  filename: string,
  body: ArrayBuffer | ReadableStream,
  contentType: string
): Promise<R2UploadResult> {
  const key = r2Key(empresaId, context, filename);
  const object = await r2.put(key, body, {
    httpMetadata: { contentType },
    customMetadata: {
      empresaId: String(empresaId),
      context,
      originalName: filename,
      uploadedAt: new Date().toISOString(),
    },
  });
  return {
    key,
    etag: object.etag,
    size: object.size,
    contentType,
  };
}

/**
 * Download de arquivo R2 com validação de isolamento.
 * Retorna null se não encontrado.
 */
export async function r2Download(
  r2: R2Bucket,
  key: string,
  empresaId: number
): Promise<R2ObjectBody | null> {
  assertKeyBelongsToEmpresa(key, empresaId);
  return r2.get(key);
}

/**
 * Deleção de arquivo R2 com validação de isolamento.
 */
export async function r2Delete(
  r2: R2Bucket,
  key: string,
  empresaId: number
): Promise<void> {
  assertKeyBelongsToEmpresa(key, empresaId);
  await r2.delete(key);
}

/**
 * Listagem de objetos de uma empresa.
 * Opcional: filtra por contexto (subpasta).
 */
export async function r2List(
  r2: R2Bucket,
  empresaId: number,
  context?: string,
  options?: { cursor?: string; limit?: number }
): Promise<{ items: R2ListItem[]; truncated: boolean; cursor?: string }> {
  const prefix = r2Prefix(empresaId, context);
  const result = await r2.list({
    prefix,
    cursor: options?.cursor,
    limit: options?.limit ?? 100,
  });
  return {
    items: result.objects.map((obj) => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded,
      etag: obj.etag,
    })),
    truncated: result.truncated,
    cursor: result.truncated ? result.cursor : undefined,
  };
}

/**
 * Obter metadados de um objeto sem baixar o corpo.
 */
export async function r2Head(
  r2: R2Bucket,
  key: string,
  empresaId: number
): Promise<R2Object | null> {
  assertKeyBelongsToEmpresa(key, empresaId);
  return r2.head(key);
}
