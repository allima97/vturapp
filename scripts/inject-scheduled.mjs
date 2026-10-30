#!/usr/bin/env node
/**
 * scripts/inject-scheduled.mjs
 *
 * Pós-build: adiciona o export `scheduled` ao _worker.js gerado pelo
 * adapter-cloudflare, que não suporta handlers de cron nativamente.
 *
 * Diferença da abordagem legada (patch-worker-scheduled.js):
 *   - LEGADO: sobrescreve o default export e chama endpoint HTTP interno
 *             com CRON_SECRET no header. Requer WORKER_BASE_URL + CRON_SECRET.
 *   - NOVA:   adiciona `export const scheduled` diretamente no módulo JS.
 *             A lógica roda dentro do Worker (sem HTTP, sem segredo em header).
 *             A lógica real (rebuild do read model) é implementada em F4-04.
 *
 * Como funciona:
 *   O adapter-cloudflare gera um _worker.js com `export default { fetch }`.
 *   Para cron triggers, o Cloudflare Workers runtime espera um named export
 *   `scheduled` no mesmo módulo (módulo ESM):
 *
 *     export const scheduled = async (event, env, ctx) => { ... };
 *
 *   Este script appenda esse export ao _worker.js após cada build.
 *
 * Uso:
 *   node scripts/inject-scheduled.mjs
 *   (chamado automaticamente pelo script cf:build no package.json)
 *
 * Referência: docs/f1/F1-02-stack.md
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const WORKER_PATH = resolve('.svelte-kit/cloudflare/_worker.js');
const MARKER = '// __scheduled_injected_v2__';

if (!existsSync(WORKER_PATH)) {
  console.error('[inject-scheduled] _worker.js não encontrado em:', WORKER_PATH);
  console.error('[inject-scheduled] Execute `npm run build` antes de rodar este script.');
  process.exit(1);
}

const original = readFileSync(WORKER_PATH, 'utf-8');

// Idempotência: evitar injeção dupla
if (original.includes(MARKER)) {
  console.log('[inject-scheduled] Handler scheduled já injetado. Nada a fazer.');
  process.exit(0);
}

/**
 * Handler `scheduled` injetado no _worker.js.
 *
 * Lógica espelhada de src/lib/server/cron/index.ts (TypeScript source of truth).
 * Em F4-04 a lógica real de rebuild substituirá os placeholders abaixo.
 *
 * IMPORTANTE: manter em sync com src/lib/server/cron/index.ts.
 */
const scheduledExport = `
${MARKER}
// Handler scheduled — lógica espelhada de src/lib/server/cron/index.ts
// Não usa endpoint HTTP nem segredo em header (ver docs/adr/ADR-001-stack-principal.md)
const __CRON_FIVE_MIN = '*/5 * * * *';
const __CRON_NIGHTLY = '7 6 * * *';

async function __handleScheduled(event, env, ctx) {
  const schedule = event.cron;
  console.log(\`[cron] disparado: \${schedule} em \${new Date().toISOString()}\`);

  switch (schedule) {
    case __CRON_FIVE_MIN:
      // F4-04: rebuild incremental do read model
      console.log('[cron:5min] placeholder — lógica de rebuild em F4-04');
      break;

    case __CRON_NIGHTLY:
      // F4-04: marcar meses anteriores para rebuild noturno
      console.log('[cron:nightly] placeholder — lógica de marcação em F4-04');
      break;

    default:
      console.warn(\`[cron] schedule desconhecido: \${schedule}\`);
  }
}

export const scheduled = __handleScheduled;
`;

writeFileSync(WORKER_PATH, original + scheduledExport, 'utf-8');
console.log('[inject-scheduled] Handler scheduled injetado com sucesso em:', WORKER_PATH);
