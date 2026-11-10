type RateLimitOptions = {
  max: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;
const MAX_KEY_LENGTH = 240;
let lastPruneAt = 0;

function hashKey(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeRateLimitKey(key: string) {
  const normalized =
    String(key || 'unknown')
      .replace(/\s+/g, ' ')
      .trim() || 'unknown';
  if (normalized.length <= MAX_KEY_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_KEY_LENGTH)}:${hashKey(normalized)}`;
}

function pruneExpiredBuckets(now: number) {
  if (now - lastPruneAt < 60_000 && buckets.size <= MAX_BUCKETS) return;
  lastPruneAt = now;

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now || buckets.size > MAX_BUCKETS) {
      buckets.delete(key);
    }
  }
}

export function checkRateLimit(key: string, options: RateLimitOptions) {
  const now = Date.now();
  pruneExpiredBuckets(now);

  const safeKey = normalizeRateLimitKey(key);
  const current = buckets.get(safeKey);
  if (!current || current.resetAt <= now) {
    buckets.set(safeKey, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= options.max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
