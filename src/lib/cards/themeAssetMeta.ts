const THEME_BUCKET = 'message-template-themes';

export type ThemeAssetMeta = {
  nome?: string | null;
  asset_url?: string | null;
  storage_path?: string | null;
  width_px?: number | null;
  height_px?: number | null;
};

function cleanStoragePath(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^\/+/, '')
    .replace(/^storage\/v1\/object\/public\/message-template-themes\//, '')
    .replace(/^message-template-themes\//, '');
}

function buildDadosStorageUrl(path?: string | null) {
  const storagePath = cleanStoragePath(path);
  if (!storagePath) return '';
  return `/api/arquivos/publico/${THEME_BUCKET}/${storagePath.split('/').map(encodeURIComponent).join('/')}`;
}

function resolveAssetUrl(theme?: ThemeAssetMeta | null) {
  const rawAssetUrl = String(theme?.asset_url || '').trim();
  const storagePath = String(theme?.storage_path || '').trim();
  const assetLooksLikeStoredPath =
    rawAssetUrl &&
    !/^https?:\/\//i.test(rawAssetUrl) &&
    !rawAssetUrl.startsWith('/') &&
    !rawAssetUrl.startsWith('data:');

  const storageUrl = buildDadosStorageUrl(storagePath || (assetLooksLikeStoredPath ? rawAssetUrl : ''));
  const isLegacyDadosStorageUrl = /\/storage\/v1\/object\/public\/message-template-themes\//i.test(rawAssetUrl);
  if (storageUrl && (isLegacyDadosStorageUrl || assetLooksLikeStoredPath || !rawAssetUrl)) return storageUrl;
  return rawAssetUrl;
}

export function resolveThemeAssetMeta(theme?: ThemeAssetMeta | null) {
  return {
    asset_url: resolveAssetUrl(theme),
    width_px: Number(theme?.width_px || 0),
    height_px: Number(theme?.height_px || 0),
  };
}
