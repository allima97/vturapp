/**
 * Handler `scheduled()` nativo do Cloudflare Workers.
 *
 * Este módulo substitui o scripts/patch-worker-scheduled.js na nova aplicação.
 * O cron NÃO usa endpoint HTTP nem segredo em header — a lógica é executada
 * diretamente dentro do Worker.
 *
 * Configuração em wrangler.toml:
 *   [triggers]
 *   crons = ["* /5 * * * *", "7 6 * * *"]   (sem espaço antes do 5)
 *
 * Como usar no entry point do Worker (ver docs/f1/F1-02-stack.md):
 *   import { handleScheduled } from '$lib/server/cron';
 *   export default { fetch: ..., scheduled: handleScheduled };
 *
 * Crons:
 * - "* /5 * * * *" = a cada 5 min  → CRON_FIVE_MIN  → rebuild incremental do read model
 * - "7 6 * * *"    = 03:07 Brasília → CRON_NIGHTLY   → marcar meses anteriores para rebuild
 *
 * F4-04: lógica real de rebuild do read model será implementada nesta fase.
 * Por ora, o handler registra apenas a execução.
 */

/** Identificadores dos crons configurados em wrangler.toml */
export const CRON_FIVE_MIN = '*/5 * * * *';
export const CRON_NIGHTLY = '7 6 * * *';

/**
 * Env mínimo esperado pelo handler scheduled.
 * Será expandido em F4-04 com as operações D1 reais.
 */
export interface ScheduledEnv {
  DB: D1Database;
  KV_BINDING: KVNamespace;
}

/**
 * Handler principal do evento `scheduled` do Cloudflare Workers.
 *
 * Chamado pelo Worker quando um cron trigger dispara.
 * Não tem acesso a `Request` nem pode retornar `Response`.
 */
export async function handleScheduled(
  event: ScheduledEvent,
  env: ScheduledEnv,
  ctx: ExecutionContext
): Promise<void> {
  const schedule = event.cron;

  console.log(`[cron] disparado: ${schedule} em ${new Date().toISOString()}`);

  switch (schedule) {
    case CRON_FIVE_MIN:
      await handleFiveMin(env, ctx);
      break;

    case CRON_NIGHTLY:
      await handleNightly(env, ctx);
      break;

    default:
      console.warn(`[cron] schedule desconhecido: ${schedule}`);
  }
}

/**
 * Cron a cada 5 minutos — rebuild incremental do read model.
 * F4-04: implementar lógica real de rebuild.
 */
async function handleFiveMin(env: ScheduledEnv, _ctx: ExecutionContext): Promise<void> {
  // TODO F4-04: buscar empresas com read model dirty e reconstruir
  console.log('[cron:5min] placeholder — lógica de rebuild em F4-04');
  void env; // silenciar lint até F4-04
}

/**
 * Cron noturno (03:07 BRT) — marcar meses anteriores para rebuild.
 * F4-04: implementar lógica real de marcação.
 */
async function handleNightly(env: ScheduledEnv, _ctx: ExecutionContext): Promise<void> {
  // TODO F4-04: marcar meses anteriores como dirty para rebuild noturno
  console.log('[cron:nightly] placeholder — lógica de marcação em F4-04');
  void env;
}
