import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { logServerError } from '$lib/server/v1';

type TurnstileVerifyResponse = {
  success?: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
};

export function isTurnstileServerConfigured() {
  return Boolean(String(privateEnv.TURNSTILE_SECRET_KEY || '').trim());
}

function isProductionRuntime() {
  return [publicEnv.PUBLIC_ENVIRONMENT, privateEnv.VTUR_ENV, privateEnv.NODE_ENV].some(
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase() === 'production'
  );
}

export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null
): Promise<{ ok: true; skipped?: boolean } | { ok: false; message: string; codes?: string[] }> {
  const secret = String(privateEnv.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret) {
    if (isProductionRuntime()) {
      return {
        ok: false,
        message: 'Desafio de segurança indisponível. Configure o Turnstile no ambiente de produção.'
      };
    }
    return { ok: true, skipped: true };
  }

  const response = String(token || '').trim();
  if (!response) {
    return { ok: false, message: 'Confirme o desafio de segurança para continuar.' };
  }

  const body = new URLSearchParams({
    secret,
    response
  });
  if (remoteIp) body.set('remoteip', remoteIp);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: controller.signal
    });

    const payload = (await res.json().catch(() => ({}))) as TurnstileVerifyResponse;
    if (res.ok && payload.success) return { ok: true };

    const codes = Array.isArray(payload['error-codes']) ? payload['error-codes'] : [];
    logServerError('[turnstile] Verificacao rejeitada', new Error('turnstile_rejected'), {
      codes: codes.slice(0, 5).join(',')
    });
    return {
      ok: false,
      message: 'Não foi possível validar o desafio de segurança. Tente novamente.',
      codes
    };
  } catch (err) {
    logServerError('[turnstile] Falha ao verificar token', err);
    return {
      ok: false,
      message: 'Falha ao validar o desafio de segurança. Verifique a conexão e tente novamente.'
    };
  } finally {
    clearTimeout(timeout);
  }
}
