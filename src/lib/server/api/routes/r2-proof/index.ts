/**
 * F1-05: Rotas de prova de stack R2.
 *
 * ATENÇÃO: rotas de prova — não usar em produção antes de F2-03.
 * Em produção, auth real e autorização de empresa devem ser validadas.
 *
 * Endpoints:
 *   POST   /api/v1/r2-proof/upload                  — upload multipart
 *   GET    /api/v1/r2-proof/download/:encodedKey     — download proxied
 *   DELETE /api/v1/r2-proof/delete/:encodedKey       — deletar objeto
 *   GET    /api/v1/r2-proof/list/:empresaId          — listar objetos de empresa
 *   GET    /api/v1/r2-proof/head/:encodedKey         — metadados sem body
 */
import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { r2Delete, r2Download, r2Head, r2List, r2Upload } from '$lib/server/r2/client';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
]);

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB para prova

function requireR2(c: { env: ApiEnv['Bindings'] }) {
  const r2 = c.env.R2;
  if (!r2) throw new Error('R2 não disponível. Use npm run dev:cf');
  return r2;
}

export const r2ProofRoutes = new Hono<ApiEnv>()

  /**
   * POST /api/v1/r2-proof/upload
   * Body: multipart/form-data
   *   - file: File
   *   - empresaId: string (number)
   *   - context: string (ex: 'documentos', 'logos')
   */
  .post('/upload', async (c) => {
    const r2 = requireR2(c);

    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json({ error: 'Body inválido: esperado multipart/form-data' }, 400);
    }

    const file = formData.get('file');
    const empresaIdRaw = formData.get('empresaId');
    const context = String(formData.get('context') || 'geral');

    if (!(file instanceof File)) {
      return c.json({ error: 'Campo "file" obrigatório (File)' }, 400);
    }
    if (!empresaIdRaw) {
      return c.json({ error: 'Campo "empresaId" obrigatório' }, 400);
    }

    const empresaId = parseInt(String(empresaIdRaw), 10);
    if (isNaN(empresaId) || empresaId <= 0) {
      return c.json({ error: 'empresaId deve ser número positivo' }, 400);
    }

    const contentType = file.type || 'application/octet-stream';
    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      return c.json(
        { error: `Tipo não permitido: ${contentType}. Permitidos: ${[...ALLOWED_MIME_TYPES].join(', ')}` },
        415
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return c.json({ error: `Arquivo muito grande: ${file.size} bytes (máx ${MAX_FILE_BYTES})` }, 413);
    }

    const buffer = await file.arrayBuffer();
    const result = await r2Upload(r2, empresaId, context, file.name, buffer, contentType);

    return c.json(
      {
        success: true,
        key: result.key,
        etag: result.etag,
        size: result.size,
        contentType: result.contentType,
        // Codifica a chave para usar nas outras rotas
        encodedKey: encodeURIComponent(result.key),
      },
      201
    );
  })

  /**
   * GET /api/v1/r2-proof/download/:encodedKey?empresaId=N
   * Proxy privado: lê do R2 e serve o arquivo.
   */
  .get('/download/:encodedKey', async (c) => {
    const r2 = requireR2(c);
    const key = decodeURIComponent(c.req.param('encodedKey'));
    const empresaIdRaw = c.req.query('empresaId');

    if (!empresaIdRaw) {
      return c.json({ error: 'Query "empresaId" obrigatória' }, 400);
    }
    const empresaId = parseInt(empresaIdRaw, 10);
    if (isNaN(empresaId) || empresaId <= 0) {
      return c.json({ error: 'empresaId inválido' }, 400);
    }

    let object: R2ObjectBody | null;
    try {
      object = await r2Download(r2, key, empresaId);
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }

    if (!object) {
      return c.json({ error: 'Objeto não encontrado' }, 404);
    }

    const contentType = object.httpMetadata?.contentType ?? 'application/octet-stream';
    const headers = new Headers({
      'Content-Type': contentType,
      'Content-Length': String(object.size),
      'ETag': object.etag,
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="${key.split('/').pop()}"`,
    });

    return new Response(object.body, { headers });
  })

  /**
   * DELETE /api/v1/r2-proof/delete/:encodedKey?empresaId=N
   */
  .delete('/delete/:encodedKey', async (c) => {
    const r2 = requireR2(c);
    const key = decodeURIComponent(c.req.param('encodedKey'));
    const empresaIdRaw = c.req.query('empresaId');

    if (!empresaIdRaw) {
      return c.json({ error: 'Query "empresaId" obrigatória' }, 400);
    }
    const empresaId = parseInt(empresaIdRaw, 10);

    try {
      await r2Delete(r2, key, empresaId);
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }

    return c.json({ success: true, key });
  })

  /**
   * GET /api/v1/r2-proof/list/:empresaId?context=&cursor=&limit=
   */
  .get('/list/:empresaId', async (c) => {
    const r2 = requireR2(c);
    const empresaId = parseInt(c.req.param('empresaId'), 10);
    if (isNaN(empresaId) || empresaId <= 0) {
      return c.json({ error: 'empresaId inválido' }, 400);
    }

    const context = c.req.query('context') || undefined;
    const cursor = c.req.query('cursor') || undefined;
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200);

    const result = await r2List(r2, empresaId, context, { cursor, limit });
    return c.json({
      items: result.items.map((item) => ({
        key: item.key,
        size: item.size,
        uploaded: item.uploaded.toISOString(),
        etag: item.etag,
        encodedKey: encodeURIComponent(item.key),
      })),
      truncated: result.truncated,
      cursor: result.cursor,
    });
  })

  /**
   * GET /api/v1/r2-proof/head/:encodedKey?empresaId=N
   * Retorna metadados sem body.
   */
  .get('/head/:encodedKey', async (c) => {
    const r2 = requireR2(c);
    const key = decodeURIComponent(c.req.param('encodedKey'));
    const empresaIdRaw = c.req.query('empresaId');

    if (!empresaIdRaw) return c.json({ error: 'Query "empresaId" obrigatória' }, 400);
    const empresaId = parseInt(empresaIdRaw, 10);

    let object: R2Object | null;
    try {
      object = await r2Head(r2, key, empresaId);
    } catch (err) {
      return c.json({ error: String(err) }, 403);
    }

    if (!object) return c.json({ error: 'Objeto não encontrado' }, 404);

    return c.json({
      key: object.key,
      size: object.size,
      etag: object.etag,
      uploaded: object.uploaded.toISOString(),
      contentType: object.httpMetadata?.contentType,
      customMetadata: object.customMetadata,
    });
  });
