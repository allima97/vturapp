type UploadValidationOptions = {
  allowedMimeTypes: string[];
  maxSizeBytes: number;
};

const MIME_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf']
};

function getExtension(fileName: string) {
  return (
    String(fileName || '')
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '') || ''
  );
}

async function detectMimeFromMagicBytes(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return 'application/pdf';
  }

  return null;
}

export async function validateUploadedFile(file: File | null, options: UploadValidationOptions) {
  if (!file || file.size <= 0) {
    return { ok: false as const, error: 'Arquivo é obrigatório.' };
  }

  if (file.size > options.maxSizeBytes) {
    return { ok: false as const, error: 'Arquivo muito grande.' };
  }

  const claimedMime = String(file.type || '').toLowerCase();
  if (!options.allowedMimeTypes.includes(claimedMime)) {
    return { ok: false as const, error: 'Tipo de arquivo não permitido.' };
  }

  const extension = getExtension(file.name);
  const allowedExtensions = MIME_EXTENSIONS[claimedMime] || [];
  if (!extension || !allowedExtensions.includes(extension)) {
    return { ok: false as const, error: 'Extensão do arquivo não corresponde ao tipo enviado.' };
  }

  const detectedMime = await detectMimeFromMagicBytes(file);
  if (!detectedMime || detectedMime !== claimedMime) {
    return { ok: false as const, error: 'Conteúdo do arquivo não corresponde ao tipo enviado.' };
  }

  return { ok: true as const, mimeType: claimedMime, extension };
}
