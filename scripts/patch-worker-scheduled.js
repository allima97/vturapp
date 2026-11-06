// scripts/patch-worker-scheduled.js
//
// Pos-build: injeta o handler `scheduled` no _worker.js gerado pelo adapter-cloudflare.
//
// O adapter-cloudflare nao suporta nativamente o evento `scheduled` do Cloudflare Workers.
// Este script appenda o handler ao worker gerado, permitindo que o Cloudflare Cron Trigger
// (configurado em wrangler.toml como [triggers] crons = ["a cada 5 minutos"]) dispare
// a reconstrucao do read model de ranking periodicamente.
//
// O handler faz uma chamada interna ao endpoint GET /api/v1/read-model/rebuild,
// passando o CRON_SECRET via header x-cron-secret.
//
// Uso: node scripts/patch-worker-scheduled.js
// (chamado automaticamente pelo script cf:build no package.json)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const WORKER_PATH = resolve('.svelte-kit/cloudflare/_worker.js');

if (!existsSync(WORKER_PATH)) {
  console.error('[patch-worker] _worker.js nao encontrado em:', WORKER_PATH);
  console.error('[patch-worker] Execute `npm run build` antes de rodar este script.');
  process.exit(1);
}

const original = readFileSync(WORKER_PATH, 'utf-8');

// Evitar injecao dupla
if (original.includes('__scheduled_handler_injected__')) {
  console.log('[patch-worker] Handler scheduled ja injetado. Nada a fazer.');
  process.exit(0);
}

const scheduledHandler = `

// __scheduled_handler_injected__
// Handler de Cron Trigger - injetado por scripts/patch-worker-scheduled.js
const __originalWorker = worker_default;
const __patchedWorker = {
  ...(__originalWorker || {}),

  async scheduled(event, env, ctx) {
    const cronSecret = String(env.CRON_SECRET || '').trim();
    const baseUrl = String(env.WORKER_BASE_URL || '').trim();

    if (!baseUrl) {
      console.warn('[cron] WORKER_BASE_URL nao configurada. Pulando rebuild do read model.');
      return;
    }

    const url = \`\${baseUrl}/api/v1/read-model/rebuild\`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-cron-secret': cronSecret,
          // Qual cron disparou (ex.: "7 6 * * *" = rodada noturna). O endpoint só
          // considera este header depois de validar o x-cron-secret.
          'x-cron-schedule': String(event.cron || ''),
          'user-agent': 'cf-cron-internal/1.0',
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error(\`[cron] rebuild falhou: \${response.status} \${body.slice(0, 200)}\`);
      } else {
        const body = await response.json().catch(() => ({}));
        console.log(\`[cron] rebuild concluido: \${JSON.stringify(body)}\`);
      }
    } catch (err) {
      console.error('[cron] erro ao chamar endpoint de rebuild:', err);
    }
  },
};
export { __patchedWorker as default };
`;

// Remover o export default original para nao ter dois exports conflitantes
const patched =
  original
    .replace(
      /^export\s*\{[^}]*worker_default\s+as\s+default[^}]*\};?\s*$/m,
      '// export default substituido pelo patch-worker-scheduled (ver abaixo)'
    )
    .replace(
      /^export default worker_default;?\s*$/m,
      '// export default substituido pelo patch-worker-scheduled (ver abaixo)'
    ) + scheduledHandler;

writeFileSync(WORKER_PATH, patched, 'utf-8');
console.log('[patch-worker] Handler scheduled injetado com sucesso em', WORKER_PATH);
