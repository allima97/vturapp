/**
 * Schemas de validação de input — F2-05.
 *
 * Validação pura em TypeScript, sem bibliotecas externas (projeto não tem Zod).
 *
 * Padrão:
 *   - Cada schema é uma função que recebe `unknown` e retorna um Result:
 *       { ok: true; data: T } | { ok: false; errors: string[] }
 *   - Funções de suporte: isString, isEmail, isUUID, isTrimmedMin, etc.
 *   - Exporta o tipo inferido junto com a função de parsing.
 *
 * Uso:
 *   const result = parseConviteInput(req.body);
 *   if (!result.ok) return c.json({ errors: result.errors }, 400);
 *   const { email, papel } = result.data;
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de resultado
// ─────────────────────────────────────────────────────────────────────────────

export type ParseOk<T> = { ok: true; data: T };
export type ParseErr = { ok: false; errors: string[] };
export type ParseResult<T> = ParseOk<T> | ParseErr;

// ─────────────────────────────────────────────────────────────────────────────
// Predicados primitivos
// ─────────────────────────────────────────────────────────────────────────────

export function isString(v: unknown): v is string {
  return typeof v === 'string';
}

export function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Valida e-mail: formato simplificado (não RFC completo, mas cobre 99% dos casos).
 * Regras: pelo menos um char antes de @, domínio com pelo menos um ponto, TLD 2+ chars.
 */
export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/**
 * Valida UUID v4 canônico (lowercase com hífens).
 */
export function isUUID(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
}

/**
 * Slug URL-safe: letras minúsculas, números e hífens.
 */
export function isSlug(v: string): boolean {
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(v) && !v.includes('--');
}

/**
 * Verifica comprimento mínimo de string após trim.
 */
export function isTrimmedMin(v: string, min: number): boolean {
  return v.trim().length >= min;
}

/**
 * Verifica comprimento máximo de string.
 */
export function isMaxLength(v: string, max: number): boolean {
  return v.length <= max;
}

// ─────────────────────────────────────────────────────────────────────────────
// Papéis válidos
// ─────────────────────────────────────────────────────────────────────────────

export const PAPEIS_VALIDOS = ['admin', 'operador', 'visualizador'] as const;
export type PapelValido = (typeof PAPEIS_VALIDOS)[number];

export function isPapelValido(v: unknown): v is PapelValido {
  return isString(v) && (PAPEIS_VALIDOS as readonly string[]).includes(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema: ConviteInput
// ─────────────────────────────────────────────────────────────────────────────

export interface ConviteInput {
  email: string;
  papel: PapelValido;
}

/**
 * Valida o body de criação de convite.
 *
 * Campos obrigatórios:
 *   - email: string, formato e-mail válido, max 320 chars
 *   - papel: 'admin' | 'operador' | 'visualizador'
 */
export function parseConviteInput(body: unknown): ParseResult<ConviteInput> {
  const errors: string[] = [];

  if (!isObject(body)) {
    return { ok: false, errors: ['Body deve ser um objeto JSON.'] };
  }

  // email
  const emailRaw = body['email'];
  if (!isString(emailRaw)) {
    errors.push('email: obrigatório e deve ser uma string.');
  } else if (!isTrimmedMin(emailRaw, 1)) {
    errors.push('email: não pode ser vazio.');
  } else if (!isEmail(emailRaw.trim())) {
    errors.push('email: formato inválido.');
  } else if (!isMaxLength(emailRaw, 320)) {
    errors.push('email: máximo 320 caracteres.');
  }

  // papel
  const papelRaw = body['papel'];
  if (papelRaw === undefined || papelRaw === null) {
    errors.push(`papel: obrigatório. Valores aceitos: ${PAPEIS_VALIDOS.join(', ')}.`);
  } else if (!isPapelValido(papelRaw)) {
    errors.push(`papel: valor inválido '${papelRaw}'. Aceitos: ${PAPEIS_VALIDOS.join(', ')}.`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      email: (emailRaw as string).trim().toLowerCase(),
      papel: papelRaw as PapelValido,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema: AceitarConviteInput
// ─────────────────────────────────────────────────────────────────────────────

export interface AceitarConviteInput {
  token: string;
}

/**
 * Valida o body de aceitação de convite.
 *
 * Campos obrigatórios:
 *   - token: UUID v4
 */
export function parseAceitarConviteInput(body: unknown): ParseResult<AceitarConviteInput> {
  if (!isObject(body)) {
    return { ok: false, errors: ['Body deve ser um objeto JSON.'] };
  }

  const tokenRaw = body['token'];

  if (!isString(tokenRaw)) {
    return { ok: false, errors: ['token: obrigatório e deve ser uma string.'] };
  }

  if (!isUUID(tokenRaw.trim())) {
    return { ok: false, errors: ['token: deve ser um UUID v4 válido.'] };
  }

  return { ok: true, data: { token: tokenRaw.trim().toLowerCase() } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema: RegistroEmpresaInput
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistroEmpresaInput {
  nome: string;
  slug: string;
  cnpj?: string;
}

/**
 * Valida o body de registro de nova empresa.
 *
 * Campos obrigatórios:
 *   - nome: string, 2–200 chars após trim
 *   - slug: string, 3–80 chars, formato URL-safe
 *
 * Campos opcionais:
 *   - cnpj: string, exatamente 14 dígitos (somente números)
 */
export function parseRegistroEmpresaInput(body: unknown): ParseResult<RegistroEmpresaInput> {
  const errors: string[] = [];

  if (!isObject(body)) {
    return { ok: false, errors: ['Body deve ser um objeto JSON.'] };
  }

  // nome
  const nomeRaw = body['nome'];
  if (!isString(nomeRaw)) {
    errors.push('nome: obrigatório e deve ser uma string.');
  } else if (!isTrimmedMin(nomeRaw, 2)) {
    errors.push('nome: mínimo 2 caracteres.');
  } else if (!isMaxLength(nomeRaw, 200)) {
    errors.push('nome: máximo 200 caracteres.');
  }

  // slug
  const slugRaw = body['slug'];
  if (!isString(slugRaw)) {
    errors.push('slug: obrigatório e deve ser uma string.');
  } else if (!isTrimmedMin(slugRaw, 3)) {
    errors.push('slug: mínimo 3 caracteres.');
  } else if (!isMaxLength(slugRaw, 80)) {
    errors.push('slug: máximo 80 caracteres.');
  } else if (!isSlug(slugRaw.trim())) {
    errors.push(
      'slug: formato inválido. Use apenas letras minúsculas, números e hífens (sem início/fim com hífen, sem hífens duplos).'
    );
  }

  // cnpj (opcional)
  const cnpjRaw = body['cnpj'];
  if (cnpjRaw !== undefined && cnpjRaw !== null) {
    if (!isString(cnpjRaw)) {
      errors.push('cnpj: deve ser uma string.');
    } else if (!/^\d{14}$/.test(cnpjRaw)) {
      errors.push('cnpj: deve conter exatamente 14 dígitos numéricos (sem formatação).');
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const result: RegistroEmpresaInput = {
    nome: (nomeRaw as string).trim(),
    slug: (slugRaw as string).trim().toLowerCase(),
  };

  if (cnpjRaw) {
    result.cnpj = (cnpjRaw as string).trim();
  }

  return { ok: true, data: result };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: formata erros de validação para resposta HTTP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converte um ParseErr em resposta 400 padronizada.
 *
 * Uso nos routes:
 *   const r = parseConviteInput(await c.req.json());
 *   if (!r.ok) return c.json(validationErrorResponse(r.errors), 400);
 */
export function validationErrorResponse(errors: string[]): {
  error: string;
  code: 'VALIDATION_ERROR';
  details: string[];
} {
  return {
    error: 'Dados de entrada inválidos.',
    code: 'VALIDATION_ERROR',
    details: errors,
  };
}
