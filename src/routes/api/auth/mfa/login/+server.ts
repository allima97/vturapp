import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { codeMatches, openUserSession, writeAal } from '$lib/server/data/authApi';
import { getDataContext } from '$lib/server/data';
import { logServerError } from '$lib/server/v1';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MAX_BODY_BYTES = 4 * 1024;

function readCookie(headers: Headers, suffix: string) {
  const raw = headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    if (name === suffix || name.endsWith(`.${suffix}`)) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

async function verifySignedCookieValue(raw: string, secret: string) {
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // valor já decodificado
  }
  const pos = value.lastIndexOf('.');
  if (pos < 1) return null;
  const signedValue = value.slice(0, pos);
  const signature = value.slice(pos + 1);
  if (signature.length !== 44 || !signature.endsWith('=')) return null;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const signatureBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      new TextEncoder().encode(signedValue)
    );
    return ok ? signedValue : null;
  } catch {
    return null;
  }
}

export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
  try {
    const originError = rejectCrossOriginRequest(request, 'Origem inválida.');
    if (originError) return originError;

    const bodyResult = await readJsonBodyLimited(request, MAX_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;
    const code = String((bodyResult.data as Record<string, unknown> | null)?.code || '').replace(
      /\D/g,
      ''
    );
    if (code.length !== 6) {
      return json(
        { error: 'Informe o código de 6 dígitos.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const context = getDataContext();
    const db = context?.db;
    const secret = context?.secret;
    if (!db || !secret || !context?.cookies) {
      return json(
        { error: 'Autenticação indisponível.' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    let remoteIp: string | null = null;
    try {
      remoteIp = getClientAddress();
    } catch {
      remoteIp = null;
    }
    const rateLimit = await checkPersistentRateLimit(
      'auth-mfa-login',
      remoteIp || 'unknown',
      { max: 10, windowMs: 60_000 },
      platform?.env?.DB
    );
    if (!rateLimit.allowed) {
      return json(
        { error: 'Muitas tentativas. Tente novamente em instantes.' },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            'Retry-After': String(rateLimit.retryAfterSeconds)
          }
        }
      );
    }

    // Cookie temporário criado pelo signInEmail quando a conta tem 2FA.
    // O valor assinado é o identifier de um registro na tabela verification
    // cujo value é o user_id.
    const rawCookie = readCookie(request.headers, 'two_factor');
    if (!rawCookie) {
      return json(
        { error: 'Sessão de verificação não encontrada. Faça login novamente.' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    const identifier = await verifySignedCookieValue(rawCookie, secret);
    if (!identifier) {
      return json(
        { error: 'Sessão de verificação inválida. Faça login novamente.' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const verification = await db
      .prepare('SELECT value, expires_at FROM verification WHERE identifier = ?1')
      .bind(identifier)
      .first<{ value: string; expires_at: number }>();
    if (!verification || Number(verification.expires_at) < Date.now()) {
      return json(
        { error: 'Verificação expirada. Faça login novamente.' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const userId = String(verification.value || '');
    const user = await db
      .prepare('SELECT id, email, name FROM user WHERE id = ?1')
      .bind(userId)
      .first<{ id: string; email: string; name: string }>();
    if (!user) {
      return json({ error: 'Usuário não encontrado.' }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const factor = await db
      .prepare(
        `SELECT secret FROM mfa_fatores
         WHERE user_id = ?1 AND status = 'verified'
         ORDER BY created_at DESC LIMIT 1`
      )
      .bind(userId)
      .first<{ secret: string }>();
    if (!factor || !(await codeMatches(factor.secret, code))) {
      return json(
        { error: 'Código inválido ou expirado. Verifique o aplicativo autenticador.' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Consome o token de verificação (uso único), abre a sessão e eleva para aal2
    // (cookie vtur_aal) para o hook de MFA não redirecionar de volta.
    await db.prepare('DELETE FROM verification WHERE identifier = ?1').bind(identifier).run();
    await openUserSession(context, userId);
    await writeAal(context, userId);

    return json(
      {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          aud: 'authenticated',
          role: 'authenticated'
        }
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logServerError('[auth/mfa/login] falha', err);
    return json({ error: 'Erro ao verificar código.' }, { status: 500, headers: NO_STORE_HEADERS });
  }
};
