/// <reference types="@cloudflare/vitest-pool-workers" />

import { beforeAll, describe, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';

describe('rate limit persistente em D1', () => {
  beforeAll(async () => {
    const migrations = (env as unknown as Record<string, unknown>).TEST_MIGRATIONS as Parameters<
      typeof applyD1Migrations
    >[1];
    await applyD1Migrations(env.DB, migrations);
  });

  it('compartilha contagem no D1 e persiste somente o hash da chave', async () => {
    const scope = `rate-limit-test-${crypto.randomUUID()}`;
    const key = '203.0.113.44:usuario@exemplo.test';
    const options = { max: 5, windowMs: 60_000 };

    expect(await checkPersistentRateLimit(scope, key, options, env.DB)).toEqual({
      allowed: true,
      retryAfterSeconds: 0
    });
    expect(await checkPersistentRateLimit(scope, key, options, env.DB)).toEqual({
      allowed: true,
      retryAfterSeconds: 0
    });

    const stored = await env.DB.prepare(
      'SELECT hits, key_hash FROM security_rate_limits WHERE scope = ?1'
    )
      .bind(scope)
      .first<{ hits: number; key_hash: string }>();

    expect(stored?.hits).toBe(2);
    expect(stored?.key_hash).not.toContain('203.0.113.44');
    expect(stored?.key_hash).not.toContain('usuario@exemplo.test');
    expect(stored?.key_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('bloqueia novas chamadas ao atingir o limite e informa o tempo restante', async () => {
    const scope = `rate-limit-deny-${crypto.randomUUID()}`;
    const options = { max: 2, windowMs: 60_000 };

    expect((await checkPersistentRateLimit(scope, 'same-client', options, env.DB)).allowed).toBe(
      true
    );
    expect((await checkPersistentRateLimit(scope, 'same-client', options, env.DB)).allowed).toBe(
      true
    );
    const denied = await checkPersistentRateLimit(scope, 'same-client', options, env.DB);

    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(60);
    const stored = await env.DB.prepare('SELECT hits FROM security_rate_limits WHERE scope = ?1')
      .bind(scope)
      .first<{ hits: number }>();
    expect(stored?.hits).toBe(3);
  });

  it('reinicia a janela expirada sem carregar hits anteriores', async () => {
    const scope = `rate-limit-expired-${crypto.randomUUID()}`;
    const key = 'expired-client';
    const now = Date.now();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    const keyHash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');
    await env.DB.prepare(
      `
      INSERT INTO security_rate_limits (scope, key_hash, window_start_ms, expires_at_ms, hits)
      VALUES (?1, ?2, ?3, ?4, 9)
    `
    )
      .bind(scope, keyHash, now - 120_000, now - 60_000)
      .run();

    expect(
      await checkPersistentRateLimit(scope, key, { max: 2, windowMs: 60_000 }, env.DB)
    ).toEqual({
      allowed: true,
      retryAfterSeconds: 0
    });
    const stored = await env.DB.prepare('SELECT hits FROM security_rate_limits WHERE scope = ?1')
      .bind(scope)
      .first<{ hits: number }>();
    expect(stored?.hits).toBe(1);
  });
});
