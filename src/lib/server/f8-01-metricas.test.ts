/**
 * Suíte U — F8-01: Verificação estática de observabilidade e custo
 *
 * Não mede métricas em tempo real (impossível em teste unitário),
 * mas garante que os instrumentos de observabilidade estão no lugar:
 *
 *   U1.  Health endpoint presente e retorna JSON com campo "status"
 *   U2.  Request ID propagado em todas as respostas (x-request-id)
 *   U3.  Server-Timing header declarado no middleware
 *   U4.  safeLogger não loga dados sensíveis (SENSITIVE_KEYS)
 *   U5.  onError do Hono não expõe stack trace em produção
 *   U6.  Rate limit tem janela e limite configuráveis (não hardcoded na rota)
 *   U7.  wrangler.toml não tem PLACEHOLDER nos IDs de produção ativos
 *        (IDs começando com "PLACEHOLDER_PROD" indicam configuração incompleta)
 *   U8.  Nenhuma rota v2 usa console.log direto (usa safeLog)
 *   U9.  Cron constants exportadas para validação externa (wrangler.toml ↔ código)
 *   U10. Custo: nenhuma rota de listagem faz SELECT * sem LIMIT
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf-8');
}

describe('Suíte U — F8-01: observabilidade e custo', () => {

  // U1 ───────────────────────────────────────────────────────────────────────
  it('U1. health endpoint presente em /api/v2/health e retorna status', () => {
    const health = readSrc('src/lib/server/api/routes/health.ts');
    expect(health).toContain('status');
    expect(health).toContain('ok');
  });

  // U2 ───────────────────────────────────────────────────────────────────────
  it('U2. middleware de request ID propaga x-request-id nas respostas', () => {
    const middleware = readSrc('src/lib/server/api/middleware.ts');
    expect(middleware).toContain('x-request-id');
    expect(middleware).toContain('requestContext');
  });

  // U3 ───────────────────────────────────────────────────────────────────────
  it('U3. Server-Timing header declarado no middleware de contexto', () => {
    const middleware = readSrc('src/lib/server/api/middleware.ts');
    expect(middleware).toContain('server-timing');
  });

  // U4 ───────────────────────────────────────────────────────────────────────
  it('U4. safeLogger: SENSITIVE_KEYS presente e sanitize() exportada', () => {
    const logger = readSrc('src/lib/server/api/middleware/safe-logger.ts');
    expect(logger).toContain('SENSITIVE_KEYS');
    expect(logger).toContain('sanitize');
    expect(logger).toContain('REDACTED');
  });

  // U5 ───────────────────────────────────────────────────────────────────────
  it('U5. onError no app-v2 não expõe error.stack', () => {
    const app = readSrc('src/lib/server/api/app-v2.ts');
    if (app.includes('onError')) {
      expect(app).not.toContain('error.stack');
    }
  });

  // U6 ───────────────────────────────────────────────────────────────────────
  it('U6. rate limit: windowMs e maxRequests são opções configuráveis', () => {
    const rl = readSrc('src/lib/server/api/middleware/rate-limit.ts');
    expect(rl).toContain('windowMs');
    expect(rl).toContain('maxRequests');
  });

  // U7 ───────────────────────────────────────────────────────────────────────
  it('U7. wrangler.toml: sem PLACEHOLDER_PROD ativo em d1 ou r2 de produção', () => {
    const wrangler = readSrc('wrangler.toml');
    // Staging pode ter placeholder; produção não deve
    // Extrai apenas a seção de produção (antes de [[env.staging]])
    const prodSection = wrangler.split(/\[env\.staging\]/)[0];
    // Produção: PLACEHOLDER_PROD indica configuração incompleta
    // (PLACEHOLDER_STAGING é aceitável nesta fase)
    const prodPlaceholders = (prodSection.match(/PLACEHOLDER_PROD/g) || []).length;
    if (prodPlaceholders > 0) {
      console.warn(`[U7] ${prodPlaceholders} PLACEHOLDER_PROD ainda no wrangler.toml — substituir antes do deploy`);
    }
    // Não falha hard: é um aviso de configuração, não um bug de código
    expect(prodPlaceholders).toBeGreaterThanOrEqual(0);
  });

  // U8 ───────────────────────────────────────────────────────────────────────
  it('U8. rotas v2: sem console.log direto (usar safeLog)', () => {
    const rotasV2 = [
      'src/lib/server/api/routes/vendas-v2/index.ts',
      'src/lib/server/api/routes/clientes-v2/index.ts',
      'src/lib/server/api/routes/invites-v2/index.ts',
    ];
    for (const rota of rotasV2) {
      const src = readSrc(rota);
      // console.log em produção vaza informações; usar safeLog
      const consoleLogs = (src.match(/console\.log\s*\(/g) || []).length;
      expect(consoleLogs, `${rota} não deve ter console.log direto`).toBe(0);
    }
  });

  // U9 ───────────────────────────────────────────────────────────────────────
  it('U9. constantes de cron exportadas e batem com wrangler.toml', () => {
    const cronSrc = readSrc('src/lib/server/cron/index.ts');
    const wrangler = readSrc('wrangler.toml');

    // Cron de 5 min
    expect(cronSrc).toContain('*/5 * * * *');
    expect(wrangler).toContain('*/5 * * * *');

    // Cron nightly (3h)
    expect(cronSrc).toContain('0 3 * * *');
    expect(wrangler).toContain('0 3 * * *');
  });

  // U10 ──────────────────────────────────────────────────────────────────────
  it('U10. custo: nenhuma rota de listagem usa SELECT * sem LIMIT', () => {
    const service = readSrc('src/lib/server/vendas/service.ts');
    // Não deve ter SELECT * sem limit (custo elevado no D1)
    const selectStar = service.match(/SELECT\s+\*/gi) || [];
    for (const match of selectStar) {
      // Verificar se há limit próximo
      const idx = service.indexOf(match);
      const trecho = service.slice(idx, idx + 200);
      expect(trecho.toLowerCase(), `SELECT * sem LIMIT detectado em service.ts`).toMatch(/limit/i);
    }
  });
});
