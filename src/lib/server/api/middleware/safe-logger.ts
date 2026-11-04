/**
 * Safe Logger — F2-06.
 *
 * Utilitários para logging seguro: nunca vaza segredos, tokens, senhas
 * ou dados pessoais nos logs.
 *
 * Padrão:
 *   - `sanitize(obj)` — remove campos sensíveis recursivamente
 *   - `safeLog(level, message, data?)` — log com sanitização automática
 *   - `SENSITIVE_KEYS` — lista de nomes de campos sempre removidos
 *
 * Uso:
 *   import { safeLog } from '$lib/server/api/middleware/safe-logger';
 *   safeLog('info', 'Usuário autenticado', { userId, empresaId });
 *   // Nunca: safeLog('info', 'Auth', { password, token, secret });
 */

// ─────────────────────────────────────────────────────────────────────────────
// Campos sensíveis — sempre redacted no output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lista de chaves cujos valores são sempre substituídos por '[REDACTED]'.
 * Comparação case-insensitive.
 */
export const SENSITIVE_KEYS: readonly string[] = [
  'password',
  'senha',
  'secret',
  'token',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'id_token',
  'idtoken',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'set-cookie',
  'better_auth_secret',
  'betterauthsecret',
  'resend_api_key',
  'private_key',
  'privatekey',
  'cpf',
  'cnpj',
  'credit_card',
  'creditcard',
  'card_number',
  'cardnumber',
];

const SENSITIVE_SET = new Set(SENSITIVE_KEYS.map((k) => k.toLowerCase()));

/**
 * Verifica se uma chave é sensível.
 * Função pura — exportada para testes.
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_SET.has(key.toLowerCase());
}

/**
 * Remove campos sensíveis de um objeto recursivamente.
 * Preserva a estrutura; substitui valores por '[REDACTED]'.
 *
 * @param data — Qualquer objeto/array/primitivo
 * @param depth — Profundidade máxima (default: 5, evita loops)
 */
export function sanitize(data: unknown, depth = 5): unknown {
  if (depth <= 0) return '[DEEP]';
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitize(item, depth - 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitize(value, depth - 1);
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Logger seguro
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Loga uma mensagem com dados sanitizados.
 *
 * Em Cloudflare Workers, `console.log` vai para o Workers Logs.
 * Dados sensíveis são removidos antes do log.
 */
export function safeLog(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>
): void {
  const sanitized = data ? sanitize(data) : undefined;
  const entry = sanitized
    ? { level, message, ...sanitized }
    : { level, message };

  switch (level) {
    case 'debug':
      console.debug(JSON.stringify(entry));
      break;
    case 'info':
      console.log(JSON.stringify(entry));
      break;
    case 'warn':
      console.warn(JSON.stringify(entry));
      break;
    case 'error':
      console.error(JSON.stringify(entry));
      break;
  }
}

/**
 * Sanitiza um erro antes de logar — remove stack trace em produção.
 */
export function sanitizeError(
  err: unknown,
  isProd: boolean
): { message: string; name?: string; stack?: string } {
  if (!(err instanceof Error)) {
    return { message: String(err) };
  }
  return {
    name: err.name,
    message: err.message,
    // Stack trace apenas em não-produção
    ...(isProd ? {} : { stack: err.stack }),
  };
}
