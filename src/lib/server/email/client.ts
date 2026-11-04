/**
 * F1-07: Cliente Resend via API HTTP pura.
 *
 * Cloudflare Workers não suporta `nodemailer` (requer Node.js net/tls).
 * A única opção para e-mail transacional em Workers é API HTTP REST.
 *
 * Resend é a escolha: API simples, excelente deliverability, SDK opcional
 * (usamos fetch direto para zero overhead e compatibilidade garantida com Workers).
 *
 * Para migração futura: SMTP via Resend SMTP endpoint não funciona em Workers
 * (TCP/465 bloqueado). Resend API HTTP é a única opção viável.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

export type EmailAddress = string | { email: string; name?: string };

export type ResendEmailPayload = {
  from: string;           // ex: 'Vtur App <noreply@vturapp.com.br>'
  to: EmailAddress | EmailAddress[];
  subject: string;
  html?: string;
  text?: string;
  cc?: EmailAddress | EmailAddress[];
  bcc?: EmailAddress | EmailAddress[];
  reply_to?: EmailAddress;
  tags?: Array<{ name: string; value: string }>;
};

export type ResendEmailResult = {
  id: string;             // ID do e-mail na API Resend
};

export type ResendErrorResult = {
  statusCode: number;
  message: string;
  name: string;
};

export class ResendApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly resendName: string,
    message: string
  ) {
    super(`Resend API error ${statusCode} (${resendName}): ${message}`);
    this.name = 'ResendApiError';
  }
}

/**
 * Envia e-mail via Resend API HTTP.
 *
 * @throws {ResendApiError} Se a API retornar erro HTTP
 * @throws {Error} Se a rede falhar
 */
export async function sendEmail(
  apiKey: string,
  payload: ResendEmailPayload
): Promise<ResendEmailResult> {
  if (!apiKey) {
    throw new Error('RESEND_API_KEY não configurado');
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json() as ResendEmailResult | ResendErrorResult;

  if (!response.ok) {
    const err = data as ResendErrorResult;
    throw new ResendApiError(
      response.status,
      err.name ?? 'unknown',
      err.message ?? `HTTP ${response.status}`
    );
  }

  return data as ResendEmailResult;
}

/**
 * Envia e-mail com retry simples (1 retry após 1s para falhas de rede).
 * Para produção considerar Cloudflare Queues para retry robusto (F4-03).
 */
export async function sendEmailWithRetry(
  apiKey: string,
  payload: ResendEmailPayload,
  maxRetries = 1
): Promise<ResendEmailResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await sendEmail(apiKey, payload);
    } catch (err) {
      lastError = err;
      // Não retenta erros de validação/auth (4xx)
      if (err instanceof ResendApiError && err.statusCode < 500) {
        throw err;
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  throw lastError;
}

/**
 * Verifica se a API key está configurada (útil para health check).
 */
export function hasResendApiKey(apiKey: string | undefined): boolean {
  return Boolean(apiKey && apiKey.startsWith('re_'));
}
