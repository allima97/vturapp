// Migrado para Hono de src/routes/api/v1/voucher-assets/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyId,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse,
  type UserScope
} from '$lib/server/v1';
import { validateUploadedFile } from '$lib/server/uploadValidation';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readFormDataBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { cleanStringSet, chunkArray, dedupeById, SUPABASE_IN_BATCH_SIZE } from '$lib/utils/array';

const VOUCHER_ASSET_BUCKET = 'voucher-assets';
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const BOOLEAN_TRUE_VALUES = new Set(['1', 'true', 'on', 'yes', 'sim']);
const VALID_PROVIDERS = new Set(['vtur', 'special_tours', 'europamundo', 'sato_tours', 'generic']);
const VALID_ASSET_KINDS = new Set(['image', 'app_icon']);
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_REQUEST_SIZE_BYTES = MAX_FILE_SIZE_BYTES + 512 * 1024;
const PT_BR_COLLATOR = new Intl.Collator('pt-BR');
const mutationError = (message: string, status: number) =>
  json({ success: false, error: message }, { status, headers: NO_STORE_HEADERS });

type SupabaseAdminClient = ReturnType<typeof getAdminClient>;

type VoucherAssetRow = Record<string, unknown> & {
  id?: string | null;
  asset_kind?: string | null;
  ordem?: number | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  preview_url?: string | null;
};

function canAccessVoucherAssets(scope: UserScope, level: number) {
  if (scope.isAdmin) return true;
  if (scope.isMaster || scope.isGestor) return true;
  ensureModuloAccess(scope, ['parametros', 'vouchers', 'operacao'], level, 'Sem acesso a Voucher Assets.');
  return true;
}

function normalizeText(value: FormDataEntryValue | string | null | undefined) {
  return String(value || '').trim();
}

function normalizeOptionalText(value: FormDataEntryValue | string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeBoolean(value: FormDataEntryValue | string | null | undefined, fallback = true) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return fallback;
  return BOOLEAN_TRUE_VALUES.has(normalized);
}

function normalizeOrder(value: FormDataEntryValue | string | null | undefined) {
  const parsed = Number.parseInt(normalizeText(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validateProvider(provider: string) {
  if (!VALID_PROVIDERS.has(provider)) {
    throw new Error('Provider inválido para voucher asset.');
  }
  return provider;
}

function validateAssetKind(assetKind: string) {
  if (!VALID_ASSET_KINDS.has(assetKind)) {
    throw new Error('Tipo de asset inválido para voucher asset.');
  }
  return assetKind;
}

function buildStoragePath(params: {
  companyId: string;
  provider: string;
  assetKind: string;
  fileName: string;
}) {
  const extension = params.fileName.split('.').pop()?.toLowerCase() || 'bin';
  const safeExtension = extension.replace(/[^a-z0-9]/g, '') || 'bin';
  return `${params.companyId}/${params.provider}/${params.assetKind}/${Date.now()}-${crypto.randomUUID()}.${safeExtension}`;
}

async function withPreviewUrl(client: SupabaseAdminClient, asset: VoucherAssetRow) {
  try {
    if (!asset.storage_bucket || !asset.storage_path) {
      return { ...asset, preview_url: null };
    }
    const { data: signed } = await client.storage
      .from(asset.storage_bucket)
      .createSignedUrl(asset.storage_path, 3600);
    return { ...asset, preview_url: signed?.signedUrl || null };
  } catch {
    return { ...asset, preview_url: null };
  }
}

async function resolveTargetCompanyId(scope: UserScope, requestedCompanyId?: string | null) {
  const normalizedRequested = normalizeText(requestedCompanyId);
  if (normalizedRequested && !isUuid(normalizedRequested)) {
    throw new Error('Empresa inválida para o voucher asset.');
  }

  if (normalizedRequested && scope.isAdmin) {
    return normalizedRequested;
  }

  const companyId = resolveScopedCompanyId(scope, normalizedRequested || null);
  if (companyId) return companyId;

  throw new Error('Selecione uma empresa válida para o voucher asset.');
}

async function validateFile(file: File | null, required = true) {
  if (!file || file.size <= 0) {
    if (required) throw new Error('Arquivo é obrigatório.');
    return null;
  }

  const validation = await validateUploadedFile(file, {
    allowedMimeTypes: ALLOWED_MIME_TYPES,
    maxSizeBytes: MAX_FILE_SIZE_BYTES
  });

  if (!validation.ok) {
    throw new Error(
      validation.error === 'Arquivo muito grande.'
        ? 'Arquivo muito grande. Tamanho máximo: 8MB.'
        : 'Tipo de arquivo não permitido. Use JPG, PNG ou WebP.'
    );
  }

  return { file, mimeType: validation.mimeType };
}

export async function handleVoucherAssetsGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    canAccessVoucherAssets(scope, 1);

    const companyIds = resolveScopedCompanyIds(scope, event.url.searchParams.get('company_id'));

    const buildQuery = (companyIdsFilter = companyIds) => {
      let query = client
        .from('voucher_assets')
        .select('id, company_id, provider, asset_kind, label, storage_bucket, storage_path, mime_type, size_bytes, ativo, ordem, created_at, updated_at')
        .order('asset_kind')
        .order('ordem');

      if (companyIdsFilter.length > 0) query = query.in('company_id', companyIdsFilter);

      return query;
    };

    const fetchAssets = async () => {
      if (companyIds.length <= SUPABASE_IN_BATCH_SIZE) {
        return buildQuery();
      }

      const rows: VoucherAssetRow[] = [];
      for (const batch of chunkArray(companyIds)) {
        const result = await buildQuery(batch);
        if (result.error) return { data: null, error: result.error } as typeof result;
        rows.push(...((result.data || []) as unknown as VoucherAssetRow[]));
      }

      return {
        data: dedupeById(rows).sort((left, right) => {
          const assetKind = PT_BR_COLLATOR.compare(String(left?.asset_kind || ''), String(right?.asset_kind || ''));
          if (assetKind !== 0) return assetKind;
          return Number(left?.ordem || 0) - Number(right?.ordem || 0);
        }),
        error: null
      };
    };

    const { data, error } = await fetchAssets();
    if (error) throw error;

    // Gera URLs assinadas para preview
    const assets = ((data || []) as unknown as VoucherAssetRow[]).filter((asset) =>
      VALID_PROVIDERS.has(String(asset.provider || "")) && VALID_ASSET_KINDS.has(String(asset.asset_kind || ""))
    );
    const withUrls = await Promise.all(assets.map((asset) => withPreviewUrl(client, asset)));

    return json({ success: true, items: withUrls }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err: unknown) {
    return toErrorResponse(err, 'Erro ao carregar voucher assets.');
  }
}

export async function handleVoucherAssetsPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    canAccessVoucherAssets(scope, 2);

    const formDataResult = await readFormDataBodyLimited(
      event.request,
      MAX_REQUEST_SIZE_BYTES,
      'Arquivo muito grande. Tamanho máximo: 8MB.'
    );
    if (!formDataResult.ok) return formDataResult.response;
    const formData = formDataResult.formData;
    const provider = validateProvider(normalizeText(formData.get('provider')));
    const assetKind = validateAssetKind(normalizeText(formData.get('asset_kind')));
    const label = normalizeOptionalText(formData.get('label'));
    const ordem = normalizeOrder(formData.get('ordem'));
    const ativo = normalizeBoolean(formData.get('ativo'), true);
    const companyId = await resolveTargetCompanyId(scope, normalizeText(formData.get('company_id')));
    const validatedFile = await validateFile(formData.get('file') as File | null, true);
    if (!validatedFile) {
      throw new Error('Arquivo é obrigatório.');
    }
    const file = validatedFile.file;

    const storagePath = buildStoragePath({
      companyId,
      provider,
      assetKind,
      fileName: file.name
    });

    const { error: uploadError } = await client.storage
      .from(VOUCHER_ASSET_BUCKET)
      .upload(storagePath, file, { contentType: validatedFile.mimeType, upsert: false });

    if (uploadError) throw uploadError;

    const { data, error } = await client
      .from('voucher_assets')
      .insert({
        company_id: companyId,
        created_by: user.id,
        updated_by: user.id,
        provider,
        asset_kind: assetKind,
        label,
        storage_bucket: VOUCHER_ASSET_BUCKET,
        storage_path: storagePath,
        mime_type: validatedFile.mimeType || null,
        size_bytes: file.size || null,
        ativo,
        ordem
      })
      .select('id, company_id, provider, asset_kind, label, storage_bucket, storage_path, mime_type, size_bytes, ativo, ordem, created_at, updated_at')
      .single();

    if (error) {
      await client.storage.from(VOUCHER_ASSET_BUCKET).remove([storagePath]).catch(() => undefined);
      throw error;
    }

    return json({ success: true, item: await withPreviewUrl(client, data) }, { headers: NO_STORE_HEADERS });
  } catch (err: unknown) {
    return toErrorResponse(err, 'Erro ao criar voucher asset.');
  }
}

export async function handleVoucherAssetsPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    canAccessVoucherAssets(scope, 2);

    const formDataResult = await readFormDataBodyLimited(
      event.request,
      MAX_REQUEST_SIZE_BYTES,
      'Arquivo muito grande. Tamanho máximo: 8MB.'
    );
    if (!formDataResult.ok) return formDataResult.response;
    const formData = formDataResult.formData;
    const id = normalizeText(formData.get('id'));
    if (!isUuid(id)) {
      return mutationError('ID do asset inválido.', 400);
    }

    const assetQuery = client
      .from('voucher_assets')
      .select('id, company_id, provider, asset_kind, label, storage_bucket, storage_path, mime_type, size_bytes, ativo, ordem, created_at, updated_at')
      .eq('id', id);

    const scopedCompanyIds = resolveScopedCompanyIds(scope, normalizeText(formData.get('company_id')));

    const { data: existingRaw, error: existingError } = await assetQuery.maybeSingle();
    if (existingError) throw existingError;
    const existingCompanyId = String(existingRaw?.company_id || '').trim();
    const allowedCompanySet = cleanStringSet(scopedCompanyIds);
    const isAllowed =
      Boolean(existingRaw) &&
      ((scope.isAdmin && (allowedCompanySet.size === 0 || allowedCompanySet.has(existingCompanyId))) ||
        (!scope.isAdmin && allowedCompanySet.has(existingCompanyId)));
    if (!existingRaw || !isAllowed) {
      return mutationError('Voucher asset não encontrado.', 404);
    }
    const existing = existingRaw;

    const provider = validateProvider(normalizeText(formData.get('provider')) || existing.provider);
    const assetKind = validateAssetKind(normalizeText(formData.get('asset_kind')) || existing.asset_kind);
    const label = formData.has('label') ? normalizeOptionalText(formData.get('label')) : existing.label;
    const ordem = formData.has('ordem') ? normalizeOrder(formData.get('ordem')) : existing.ordem || 0;
    const ativo = formData.has('ativo') ? normalizeBoolean(formData.get('ativo'), Boolean(existing.ativo)) : Boolean(existing.ativo);
    const validatedFile = await validateFile(formData.get('file') as File | null, false);

    let nextStoragePath = existing.storage_path;
    let nextMimeType = existing.mime_type;
    let nextSizeBytes = existing.size_bytes;

    if (validatedFile) {
      const file = validatedFile.file;
      nextStoragePath = buildStoragePath({
        companyId: existing.company_id,
        provider,
        assetKind,
        fileName: file.name
      });

      const { error: uploadError } = await client.storage
        .from(VOUCHER_ASSET_BUCKET)
        .upload(nextStoragePath, file, { contentType: validatedFile.mimeType, upsert: false });

      if (uploadError) throw uploadError;

      nextMimeType = validatedFile.mimeType || null;
      nextSizeBytes = file.size || null;
    }

    const { data: updated, error: updateError } = await client
      .from('voucher_assets')
      .update({
        provider,
        asset_kind: assetKind,
        label,
        storage_bucket: existing.storage_bucket,
        storage_path: nextStoragePath,
        mime_type: nextMimeType,
        size_bytes: nextSizeBytes,
        ativo,
        ordem,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select('id, company_id, provider, asset_kind, label, storage_bucket, storage_path, mime_type, size_bytes, ativo, ordem, created_at, updated_at')
      .single();

    if (updateError) {
      if (validatedFile) {
        await client.storage.from(VOUCHER_ASSET_BUCKET).remove([nextStoragePath]).catch(() => undefined);
      }
      throw updateError;
    }

    if (validatedFile && existing.storage_path && existing.storage_path !== nextStoragePath) {
      await client.storage.from(existing.storage_bucket).remove([existing.storage_path]).catch(() => undefined);
    }

    return json(
      { success: true, item: await withPreviewUrl(client, updated) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err: unknown) {
    return toErrorResponse(err, 'Erro ao atualizar voucher asset.');
  }
}

export async function handleVoucherAssetsDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    canAccessVoucherAssets(scope, 3);

    const id = normalizeText(event.url.searchParams.get('id'));
    const requestedCompanyId = normalizeText(event.url.searchParams.get('company_id'));
    if (!isUuid(id)) {
      return mutationError('ID do asset inválido.', 400);
    }

    const assetQuery = client
      .from('voucher_assets')
      .select('id, company_id, storage_bucket, storage_path')
      .eq('id', id);

    const scopedCompanyIds = resolveScopedCompanyIds(scope, requestedCompanyId);

    const { data: existingRaw, error: existingError } = await assetQuery.maybeSingle();
    if (existingError) throw existingError;
    const existingCompanyId = String(existingRaw?.company_id || '').trim();
    const allowedCompanySet = cleanStringSet(scopedCompanyIds);
    const isAllowed =
      Boolean(existingRaw) &&
      ((scope.isAdmin && (allowedCompanySet.size === 0 || allowedCompanySet.has(existingCompanyId))) ||
        (!scope.isAdmin && allowedCompanySet.has(existingCompanyId)));
    if (!existingRaw || !isAllowed) {
      return mutationError('Voucher asset não encontrado.', 404);
    }
    const existing = existingRaw;

    const { error: deleteError } = await client.from('voucher_assets').delete().eq('id', existing.id);
    if (deleteError) throw deleteError;

    if (existing.storage_bucket && existing.storage_path) {
      await client.storage.from(existing.storage_bucket).remove([existing.storage_path]).catch(() => undefined);
    }

    return json({ success: true, id: existing.id }, { headers: NO_STORE_HEADERS });
  } catch (err: unknown) {
    return toErrorResponse(err, 'Erro ao excluir voucher asset.');
  }
}
