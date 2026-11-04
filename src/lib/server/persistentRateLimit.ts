import { checkRateLimit } from '$lib/server/rateLimit';
import { getAdminClient, logServerError } from '$lib/server/v1';

type RateLimitOptions = {
  max: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

let lastUnavailableLogAt = 0;

function shouldLogUnavailable() {
  const now = Date.now();
  if (now - lastUnavailableLogAt < 60_000) return false;
  lastUnavailableLogAt = now;
  return true;
}

export async function checkPersistentRateLimit(
  scope: string,
  key: string,
  options: RateLimitOptions,
  d1?: D1Database | null,
): Promise<RateLimitResult> {
  const memoryFallback = () => checkRateLimit(`${scope}:${key}`, options);

  if (d1) {
    try {
      const now = Date.now();
      const safeScope = String(scope || 'default').trim().slice(0, 120) || 'default';
      const safeKey = String(key || 'unknown').trim() || 'unknown';
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(safeKey));
      const keyHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const max = Math.max(1, Math.trunc(options.max));
      const windowMs = Math.max(1_000, Math.trunc(options.windowMs));
      const row = await d1.prepare(`
        INSERT INTO security_rate_limits (scope, key_hash, window_start_ms, expires_at_ms, hits)
        VALUES (?1, ?2, ?3, ?4, 1)
        ON CONFLICT (scope, key_hash) DO UPDATE SET
          window_start_ms = CASE
            WHEN security_rate_limits.expires_at_ms <= excluded.window_start_ms
            THEN excluded.window_start_ms ELSE security_rate_limits.window_start_ms END,
          expires_at_ms = CASE
            WHEN security_rate_limits.expires_at_ms <= excluded.window_start_ms
            THEN excluded.expires_at_ms ELSE security_rate_limits.expires_at_ms END,
          hits = CASE
            WHEN security_rate_limits.expires_at_ms <= excluded.window_start_ms
            THEN 1 ELSE MIN(security_rate_limits.hits + 1, ?5 + 1) END
        RETURNING hits, expires_at_ms AS expiresAtMs
      `).bind(safeScope, keyHash, now, now + windowMs, max)
        .first<{ hits: number; expiresAtMs: number }>();

      if (!row) return memoryFallback();
      if (Math.random() < 0.02) {
        try {
          await d1.prepare(
            'DELETE FROM security_rate_limits WHERE expires_at_ms < ?1',
          ).bind(now - 10 * 60_000).run();
        } catch {
          // A limpeza oportunista nunca muda a decisão do limite.
        }
      }
      if (row.hits <= max) return { allowed: true, retryAfterSeconds: 0 };
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((row.expiresAtMs - now) / 1000)),
      };
    } catch (err) {
      if (shouldLogUnavailable()) {
        logServerError('[persistent-rate-limit] D1 indisponivel; usando fallback em memoria', err, { scope });
      }
      return memoryFallback();
    }
  }

  // Compatibilidade temporária para ambientes antigos sem binding D1.
  const fallback = memoryFallback();
  if (!fallback.allowed) return fallback;

  try {
    const client = getAdminClient();
    const { data, error } = await client.rpc('check_security_rate_limit', {
      p_scope: scope,
      p_key: key,
      p_max: options.max,
      p_window_seconds: Math.max(1, Math.ceil(options.windowMs / 1000))
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return fallback;

    return {
      allowed: Boolean(row.allowed),
      retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds || 0))
    };
  } catch (err) {
    if (shouldLogUnavailable()) {
      logServerError('[persistent-rate-limit] Supabase indisponivel; usando fallback em memoria', err, { scope });
    }
    return fallback;
  }
}
