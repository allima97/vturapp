/**
 * Testes F2-06 — production-guard e safe-logger.
 *
 * Cobre:
 *   A. isDebugPath — identifica paths de debug/prova
 *   B. isProduction — identifica ambiente
 *   C. productionGuard — middleware bloqueia em prod, libera em dev
 *   D. isSensitiveKey — detecta chaves sensíveis
 *   E. sanitize — remove campos sensíveis recursivamente
 *   F. sanitizeError — remove stack trace em prod
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

import { isDebugPath, isProduction, productionGuard } from './production-guard';
import { isSensitiveKey, sanitize, sanitizeError } from './safe-logger';
import type { ApiEnv } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria um app Hono mínimo com o middleware e um handler sentinel.
 * O env de bindings é passado como terceiro argumento em app.request().
 */
function makeApp() {
  const app = new Hono<ApiEnv>();
  app.use('*', productionGuard);
  app.get('/api/v2/f2-proof/tenant-isolation', (c) =>
    c.json({ ok: true, route: 'proof' })
  );
  app.get('/api/v2/health', (c) => c.json({ ok: true, route: 'health' }));
  return app;
}

/** Env de bindings fake para testes. */
function fakeEnv(environment: string | undefined): Record<string, unknown> {
  return {
    PUBLIC_ENVIRONMENT: environment,
    DB: {},
    R2: {},
    KV_BINDING: {},
    BETTER_AUTH_SECRET: 'test-secret',
    RESEND_API_KEY: 'test-key',
    event: {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A. isDebugPath
// ─────────────────────────────────────────────────────────────────────────────

describe('A. isDebugPath', () => {
  it('identifica /api/v2/f2-proof/*', () => {
    expect(isDebugPath('/api/v2/f2-proof/tenant-isolation')).toBe(true);
    expect(isDebugPath('/api/v2/f2-proof')).toBe(true);
  });

  it('identifica /api/v2/debug/*', () => {
    expect(isDebugPath('/api/v2/debug/info')).toBe(true);
  });

  it('não bloqueia rotas normais', () => {
    expect(isDebugPath('/api/v2/health')).toBe(false);
    expect(isDebugPath('/api/v2/invites')).toBe(false);
    expect(isDebugPath('/api/auth/session')).toBe(false);
  });

  it('aceita prefixos customizados', () => {
    expect(isDebugPath('/admin/panel', ['/admin'])).toBe(true);
    expect(isDebugPath('/api/v2/health', ['/admin'])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. isProduction
// ─────────────────────────────────────────────────────────────────────────────

describe('B. isProduction', () => {
  it('retorna true para "production"', () => {
    expect(isProduction('production')).toBe(true);
  });

  it('retorna false para outros valores', () => {
    expect(isProduction('development')).toBe(false);
    expect(isProduction('staging')).toBe(false);
    expect(isProduction(undefined)).toBe(false);
    expect(isProduction('')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. productionGuard middleware
// ─────────────────────────────────────────────────────────────────────────────

describe('C. productionGuard middleware', () => {
  it('libera endpoint de prova em desenvolvimento', async () => {
    const app = makeApp();
    const res = await app.request('/api/v2/f2-proof/tenant-isolation', {}, fakeEnv('development') as any);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.route).toBe('proof');
  });

  it('bloqueia endpoint de prova em produção com 404', async () => {
    const app = makeApp();
    const res = await app.request('/api/v2/f2-proof/tenant-isolation', {}, fakeEnv('production') as any);
    expect(res.status).toBe(404);
    const body: any = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });

  it('libera rota normal em produção', async () => {
    const app = makeApp();
    const res = await app.request('/api/v2/health', {}, fakeEnv('production') as any);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.route).toBe('health');
  });

  it('libera endpoint de prova quando env é undefined', async () => {
    const app = makeApp();
    const res = await app.request('/api/v2/f2-proof/tenant-isolation', {}, fakeEnv(undefined) as any);
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. isSensitiveKey
// ─────────────────────────────────────────────────────────────────────────────

describe('D. isSensitiveKey', () => {
  it('identifica chaves sensíveis conhecidas', () => {
    expect(isSensitiveKey('password')).toBe(true);
    expect(isSensitiveKey('token')).toBe(true);
    expect(isSensitiveKey('secret')).toBe(true);
    expect(isSensitiveKey('authorization')).toBe(true);
    expect(isSensitiveKey('BETTER_AUTH_SECRET')).toBe(true);
    expect(isSensitiveKey('RESEND_API_KEY')).toBe(true);
  });

  it('é case-insensitive', () => {
    expect(isSensitiveKey('PASSWORD')).toBe(true);
    expect(isSensitiveKey('Token')).toBe(true);
    expect(isSensitiveKey('API_KEY')).toBe(true);
  });

  it('não marca campos normais como sensíveis', () => {
    expect(isSensitiveKey('userId')).toBe(false);
    expect(isSensitiveKey('empresaId')).toBe(false);
    expect(isSensitiveKey('email')).toBe(false);
    expect(isSensitiveKey('nome')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. sanitize
// ─────────────────────────────────────────────────────────────────────────────

describe('E. sanitize', () => {
  it('substitui campos sensíveis por [REDACTED]', () => {
    const input = { userId: '123', password: 'supersecret', nome: 'João' };
    const result = sanitize(input) as Record<string, unknown>;
    expect(result['userId']).toBe('123');
    expect(result['password']).toBe('[REDACTED]');
    expect(result['nome']).toBe('João');
  });

  it('funciona recursivamente em objetos aninhados', () => {
    const input = {
      user: {
        id: 'abc',
        auth: { token: 'tok123', role: 'admin' },
      },
    };
    const result = sanitize(input) as Record<string, Record<string, Record<string, unknown>>>;
    expect(result['user']['auth']['token']).toBe('[REDACTED]');
    expect(result['user']['auth']['role']).toBe('admin');
  });

  it('preserva arrays sanitizando cada item', () => {
    const input = [
      { id: 1, secret: 'a' },
      { id: 2, secret: 'b' },
    ];
    const result = sanitize(input) as Array<Record<string, unknown>>;
    expect(result[0]['id']).toBe(1);
    expect(result[0]['secret']).toBe('[REDACTED]');
  });

  it('retorna primitivos inalterados', () => {
    expect(sanitize('string')).toBe('string');
    expect(sanitize(42)).toBe(42);
    expect(sanitize(null)).toBe(null);
    expect(sanitize(true)).toBe(true);
  });

  it('respeita limite de profundidade', () => {
    const deep: Record<string, unknown> = {};
    let current = deep;
    for (let i = 0; i < 10; i++) {
      current['nested'] = {};
      current = current['nested'] as Record<string, unknown>;
    }
    current['leaf'] = 'value';
    // Não deve lançar exceção — apenas cortar com [DEEP]
    expect(() => sanitize(deep, 5)).not.toThrow();
  });

  it('não modifica o objeto original', () => {
    const input = { password: 'original' };
    sanitize(input);
    expect(input.password).toBe('original');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. sanitizeError
// ─────────────────────────────────────────────────────────────────────────────

describe('F. sanitizeError', () => {
  it('inclui stack em não-produção', () => {
    const err = new Error('teste');
    const result = sanitizeError(err, false);
    expect(result.message).toBe('teste');
    expect(result.stack).toBeTruthy();
  });

  it('omite stack em produção', () => {
    const err = new Error('teste prod');
    const result = sanitizeError(err, true);
    expect(result.message).toBe('teste prod');
    expect(result.stack).toBeUndefined();
  });

  it('lida com não-Error', () => {
    const result = sanitizeError('string error', false);
    expect(result.message).toBe('string error');
  });

  it('preserva nome do erro', () => {
    const err = new TypeError('tipo errado');
    const result = sanitizeError(err, false);
    expect(result.name).toBe('TypeError');
  });
});
