/**
 * Handler `scheduled()` nativo do Cloudflare Workers.
 *
 * Este módulo substitui o scripts/patch-worker-scheduled.js na nova aplicação.
 * O cron NÃO usa endpoint HTTP nem segredo em header — a lógica é executada
 * diretamente dentro do Worker.
 *
 * Configuração em wrangler.toml:
 *   [triggers]
 *   crons = ["* /5 * * * *", "7 6 * * *"]
 *
 * Crons registrados:
 * - CRON_FIVE_MIN ("* /5 * * * *") — reservado para tarefas incrementais futuras
 * - CRON_NIGHTLY  ("7 6 * * *")  — reservado para tarefas noturnas futuras
 *
 * F5-02: o read model usa consultas ao vivo (ADR-007), eliminando a necessidade
 * de rebuild periódico por cron. Os triggers permanecem registrados para uso
 * futuro (ex: digest de notificações, expiração de convites, limpeza de sessões).
 * Nenhuma lógica de rebuild é executada nesta fase.
 *
 * Prova de idempotência (F5-02):
 * - handleFiveMin e handleNightly não têm efeitos colaterais observáveis
 *   nesta fase; o handler é puro log + retorno.
 * - Garantia por design: nenhuma escrita D1, nenhum envio de e-mail/push.
 *   Múltiplas invocações no mesmo minuto produzem o mesmo estado final.
 */

/** Identificadores dos crons configurados em wrangler.toml */
export const CRON_FIVE_MIN = '*/5 * * * *';
export const CRON_NIGHTLY = '7 6 * * *';

/**
 * Env mínimo esperado pelo handler scheduled.
 * Campos adicionais serão acrescentados quando os handlers tiverem lógica real.
 */
export interface ScheduledEnv {
  DB: D1Database;
  KV_BINDING: KVNamespace;
}

/**
 * Resultado de uma execução do handler scheduled.
 * Permite testes introspectivos sem side effects.
 */
export interface ScheduledResult {
  schedule: string;
  handled: boolean;
  note: string;
}

/**
 * Handler principal do evento `scheduled` do Cloudflare Workers.
 *
 * Chamado pelo Worker quando um cron trigger dispara.
 * Não tem acesso a `Request` nem pode retornar `Response`.
 * Retorna ScheduledResult para facilitar testes.
 */
export async function handleScheduled(
  event: ScheduledEvent,
  env: ScheduledEnv,
  ctx: ExecutionContext
): Promise<ScheduledResult> {
  const schedule = event.cron;

  console.log(`[cron] disparado: ${schedule} em ${new Date().toISOString()}`);

  switch (schedule) {
    case CRON_FIVE_MIN:
      return handleFiveMin(env, ctx);

    case CRON_NIGHTLY:
      return handleNightly(env, ctx);

    default:
      console.warn(`[cron] schedule desconhecido: ${schedule}`);
      return { schedule, handled: false, note: 'schedule não reconhecido' };
  }
}

/**
 * Cron a cada 5 minutos.
 *
 * ADR-007: consultas ao vivo eliminam a necessidade de rebuild por cron.
 * Reservado para F6+: digest de notificações incrementais, heartbeat de saúde.
 * Idempotente: sem escritas D1 ou envios externos nesta fase.
 */
async function handleFiveMin(env: ScheduledEnv, _ctx: ExecutionContext): Promise<ScheduledResult> {
  void env; // sem uso nesta fase — removido quando lógica real for adicionada
  console.log('[cron:5min] sem lógica ativa (ADR-007: live queries; F6+ usará para notificações)');
  return {
    schedule: CRON_FIVE_MIN,
    handled: true,
    note: 'noop — ADR-007 removeu necessidade de rebuild; reservado para F6+',
  };
}

/**
 * Cron noturno (03:07 BRT).
 *
 * ADR-007: marcação de meses para rebuild foi descartada.
 * Reservado para F6+: expiração de convites, limpeza de sessões antigas.
 * Idempotente: sem escritas D1 ou envios externos nesta fase.
 */
async function handleNightly(
  env: ScheduledEnv,
  _ctx: ExecutionContext
): Promise<ScheduledResult> {
  void env;
  console.log(
    '[cron:nightly] sem lógica ativa (ADR-007: rebuild noturno descartado; reservado para F6+)'
  );
  return {
    schedule: CRON_NIGHTLY,
    handled: true,
    note: 'noop — ADR-007 removeu necessidade de rebuild; reservado para F6+',
  };
}
