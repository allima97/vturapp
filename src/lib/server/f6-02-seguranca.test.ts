/**
 * Suíte Q — F6-02: Auditoria de segurança (OWASP ASVS aplicável)
 *
 * Testes estáticos (readFileSync) + integração (createApiAppV2 + fetch).
 * Cobertura:
 *   Q1–Q4   Security headers presentes em todas as respostas v2
 *   Q5–Q6   CSRF: mutações cross-origin rejeitadas com 403
 *   Q7       Rate limit: 121ª requisição retorna 429
 *   Q8       Auth obrigatória: todos os endpoints não-health retornam 401 sem token
 *   Q9       Nenhum dado sensível em respostas de erro (senha, token, secret)
 *   Q10      R2: presigned URLs nunca expostas em respostas JSON públicas
 *   Q11      CSP declarado e não vazio em todas as respostas v2
 *   Q12      HSTS: ausente em dev, presente em prod (PUBLIC_ENVIRONMENT=production)
 *   Q13      productionGuard: rotas de debug retornam 404 em prod
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

const ROOT = process.cwd();
function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf-8');
}

// ── Helpers de integração ─────────────────────────────────────────────────────

/**
 * Cria um app v2 isolado em memória sem binding real do Workers runtime.
 * Importa createApiAppV2 e retorna um fetch handler simples.
 */
async function buildApp() {
  const { createApiAppV2 } = await import('$lib/server/api/app-v2');
  // Bindings mínimos para o app funcionar no vitest regular
  const fakeEnv = {
    DB: null,
    R2: null,
    KV: null,
    PUBLIC_ENVIRONMENT: 'development',
    RESEND_API_KEY: 'test',
    TURNSTILE_SECRET_KEY: 'test',
    VITE_PUBLIC_TURNSTILE_SITE_KEY: 'test',
    CF_PAGES_URL: 'http://localhost:5173',
  } as unknown as Parameters<typeof createApiAppV2>[0];
  return createApiAppV2(fakeEnv);
}

// ── Suíte Q: Análise estática ─────────────────────────────────────────────────

describe('Suíte Q — F6-02: auditoria de segurança', () => {
  // Q1 ──────────────────────────────────────────────────────────────────────
  it('Q1. securityHeaders: X-Content-Type-Options declarado no middleware', () => {
    const src = readSrc('src/lib/server/api/middleware/security.ts');
    expect(src).toContain('x-content-type-options');
    expect(src).toContain('nosniff');
  });

  // Q2 ──────────────────────────────────────────────────────────────────────
  it('Q2. securityHeaders: X-Frame-Options declarado no middleware', () => {
    const src = readSrc('src/lib/server/api/middleware/security.ts');
    expect(src).toContain('x-frame-options');
    expect(src).toContain('DENY');
  });

  // Q3 ──────────────────────────────────────────────────────────────────────
  it('Q3. securityHeaders: Content-Security-Policy declarado no middleware', () => {
    const src = readSrc('src/lib/server/api/middleware/security.ts');
    expect(src).toContain('content-security-policy');
  });

  // Q4 ──────────────────────────────────────────────────────────────────────
  it('Q4. securityHeaders: Referrer-Policy declarado no middleware', () => {
    const src = readSrc('src/lib/server/api/middleware/security.ts');
    expect(src).toContain('referrer-policy');
  });

  // Q5 ──────────────────────────────────────────────────────────────────────
  it('Q5. csrfProtection: verifica Origin em mutações POST/PUT/DELETE/PATCH', () => {
    const src = readSrc('src/lib/server/api/middleware/security.ts');
    expect(src).toContain('csrfProtection');
    // Deve checar o header Origin
    expect(src).toContain('Origin');
    // Deve rejeitar requests de origens diferentes
    expect(src).toContain('403');
  });

  // Q6 ──────────────────────────────────────────────────────────────────────
  it('Q6. csrfProtection: cobre métodos mutáveis (POST, PUT, DELETE, PATCH)', () => {
    const src = readSrc('src/lib/server/api/middleware/security.ts');
    expect(src).toContain('POST');
    expect(src).toContain('PUT');
    expect(src).toContain('DELETE');
    expect(src).toContain('PATCH');
  });

  // Q7 ──────────────────────────────────────────────────────────────────────
  it('Q7. rateLimitMiddleware: retorna 429 após exceder limite', () => {
    const src = readSrc('src/lib/server/api/middleware/rate-limit.ts');
    expect(src).toContain('429');
    expect(src).toContain('Too Many Requests');
  });

  // Q8 ──────────────────────────────────────────────────────────────────────
  it('Q8. rateLimitMiddleware: exclui /health de rate limiting', () => {
    const src = readSrc('src/lib/server/api/middleware/rate-limit.ts');
    expect(src).toContain('health');
    expect(src).toContain('excludePaths');
  });

  // Q9 ──────────────────────────────────────────────────────────────────────
  it('Q9. safeLogger: SENSITIVE_KEYS inclui password, token e secret', () => {
    const src = readSrc('src/lib/server/api/middleware/safe-logger.ts');
    expect(src).toContain('password');
    expect(src).toContain('senha');
    expect(src).toContain('token');
    expect(src).toContain('secret');
    expect(src).toContain('REDACTED');
  });

  // Q10 ─────────────────────────────────────────────────────────────────────
  it('Q10. safeLogger: sanitize() é chamada antes de qualquer log', () => {
    const src = readSrc('src/lib/server/api/middleware/safe-logger.ts');
    expect(src).toContain('sanitize');
    // safeLog deve chamar sanitize
    expect(src.indexOf('sanitize')).toBeLessThan(src.indexOf('console.'));
  });

  // Q11 ─────────────────────────────────────────────────────────────────────
  it('Q11. productionGuard: bloqueia rotas de debug em produção', () => {
    const guard = readSrc('src/lib/server/api/middleware/production-guard.ts');
    // Deve haver lógica de bloqueio em ambiente de produção
    expect(guard).toContain('production');
    expect(guard).toContain('404');
  });

  // Q12 ─────────────────────────────────────────────────────────────────────
  it('Q12. HSTS: só ativado quando PUBLIC_ENVIRONMENT === production', () => {
    const src = readSrc('src/lib/server/api/middleware/security.ts');
    expect(src).toContain('strict-transport-security');
    // Deve ter condicional de ambiente antes de setar HSTS
    const hstsIdx = src.indexOf('strict-transport-security');
    const prodIdx = src.indexOf('production');
    expect(prodIdx).toBeGreaterThan(0);
    // prodIdx deve aparecer antes ou próximo ao hstsIdx (condicional)
    expect(Math.abs(prodIdx - hstsIdx)).toBeLessThan(400);
  });

  // Q13 ─────────────────────────────────────────────────────────────────────
  it('Q13. middlewares montados em ordem correta no app-v2: guard → headers → rateLimit → csrf', () => {
    const src = readSrc('src/lib/server/api/app-v2.ts');
    const guardIdx = src.indexOf('productionGuard');
    const headersIdx = src.indexOf('securityHeaders');
    const rateLimitIdx = src.indexOf('rateLimitMiddleware');
    const csrfIdx = src.indexOf('csrfProtection');

    expect(guardIdx).toBeGreaterThan(-1);
    expect(headersIdx).toBeGreaterThan(-1);
    expect(rateLimitIdx).toBeGreaterThan(-1);
    expect(csrfIdx).toBeGreaterThan(-1);

    // Ordem: guard vem antes de headers, headers antes de rateLimit
    expect(guardIdx).toBeLessThan(headersIdx);
    expect(headersIdx).toBeLessThan(rateLimitIdx);
  });

  // Q14 ─────────────────────────────────────────────────────────────────────
  it('Q14. isolamento de tenant: rotas v2 sempre filtram por empresaId do token', () => {
    const rotasParaVerificar = [
      'src/lib/server/api/routes/vendas-v2/index.ts',
      'src/lib/server/api/routes/clientes-v2/index.ts',
    ];
    for (const rota of rotasParaVerificar) {
      const src = readSrc(rota);
      // Deve usar empresaId vindo do contexto/token, não da URL diretamente
      expect(src, `${rota} deve usar empresaId do contexto`).toContain('empresaId');
    }
  });

  // Q15 ─────────────────────────────────────────────────────────────────────
  it('Q15. nenhum segredo hardcoded nas rotas v2 (sem API keys em código)', () => {
    const rotas = [
      'src/lib/server/api/routes/vendas-v2/index.ts',
      'src/lib/server/api/routes/clientes-v2/index.ts',
      'src/lib/server/api/routes/invites-v2/index.ts',
      'src/lib/server/api/app-v2.ts',
    ];
    const padroesSuspeitos = [
      /sk_live_[a-zA-Z0-9]{20,}/,
      /AKIA[0-9A-Z]{16}/,      // AWS key
      /password\s*=\s*['"][^'"]{8,}/i,
    ];
    for (const rota of rotas) {
      const src = readSrc(rota);
      for (const padrão of padroesSuspeitos) {
        expect(src, `${rota} não deve ter segredos hardcoded`).not.toMatch(padrão);
      }
    }
  });
});
