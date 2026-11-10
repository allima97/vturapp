// Migrado para Hono de src/routes/api/v1/read-model/rebuild/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  getAdminClient,
  isUuid,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import {
  markNightlyReadModelMonthsDirty,
  NIGHTLY_READ_MODEL_CRON,
  rebuildReadModelForCompanyMonth
} from '$lib/server/readModelRebuild';

/**
 * POST /api/v1/read-model/rebuild
 *
 * Reconstrói o read model de ranking/KPIs para empresas e meses específicos.
 * Chamado:
 *   1. Após salvar/editar venda (fire-and-forget assíncrono)
 *   2. Pelo Cloudflare Cron Trigger a cada 5 minutos (via GET /api/v1/read-model/rebuild)
 *   3. Manualmente por admins
 *
 * Body: { company_ids?: string[], month_keys?: string[] }
 *       Se omitidos, processa todos os dirty da(s) empresa(s) do scope.
 *
 * GET (usado pelo cron — não requer auth, valida via secret header)
 */

const CRON_SECRET_HEADER = 'x-cron-secret';
// Expressão do cron que disparou a chamada (enviada por scripts/patch-worker-scheduled.js).
const CRON_SCHEDULE_HEADER = 'x-cron-schedule';

type RebuildRequestBody = {
  company_ids?: unknown;
  month_keys?: unknown;
};

type CronEnv = {
  CRON_SECRET?: string | null;
};

type PlatformWithEnv = {
  env?: CronEnv | null;
};

type GlobalWithEnv = typeof globalThis & {
  __env__?: CronEnv | null;
};

function getCronEnv(event: RequestEvent): CronEnv {
  return (
    (event.platform as PlatformWithEnv | undefined)?.env ??
    (globalThis as GlobalWithEnv).__env__ ??
    {}
  );
}

export async function handleReadModelRebuildPost(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro) {
      return json({ error: 'Sem permissão.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    let body: RebuildRequestBody = {};
    try {
      const parsedBody = await event.request.json();
      body = parsedBody && typeof parsedBody === 'object' ? (parsedBody as RebuildRequestBody) : {};
    } catch {
      body = {};
    }

    const requestedCompanyIds: string[] = Array.isArray(body.company_ids)
      ? body.company_ids.filter(isUuid)
      : scope.isAdmin
        ? []
        : scope.companyIds.filter(isUuid);

    const monthKeys: string[] = Array.isArray(body.month_keys)
      ? body.month_keys.filter((k: unknown) => typeof k === 'string' && /^\d{4}-\d{2}$/.test(k))
      : [];

    const result = await rebuildReadModelForCompanyMonth(client, {
      companyIds: requestedCompanyIds,
      monthKeys,
      rebuildAll: requestedCompanyIds.length === 0 && scope.isAdmin
    });

    return json({ ok: true, ...result }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao reconstruir read model.');
  }
}

/**
 * GET — usado pelo Cloudflare Cron Trigger.
 * Valida via header secret configurado em wrangler.toml (CRON_SECRET).
 * Processa todos os status dirty encontrados no banco.
 */
export async function handleReadModelRebuildGet(event: RequestEvent) {
  try {
    // Validar secret do cron para evitar execuções não autorizadas
    const privateEnv = getCronEnv(event);
    const cronSecret = String(privateEnv.CRON_SECRET || '').trim();
    const providedSecret = String(event.request.headers.get(CRON_SECRET_HEADER) || '').trim();

    // Sem CRON_SECRET configurado o endpoint ficava aberto para qualquer um
    // disparar rebuild de todas as empresas. Agora exige o secret sempre.
    if (!cronSecret) {
      logServerError(
        '[read-model/rebuild] CRON_SECRET não configurado no Worker — cron recusado',
        new Error('CRON_SECRET ausente')
      );
      return json({ error: 'Cron não configurado.' }, { status: 503, headers: NO_STORE_HEADERS });
    }
    if (providedSecret !== cronSecret) {
      return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const client = getAdminClient();

    // Rodada noturna: antes de reconstruir, marca os meses que podem estar
    // desatualizados (ver markNightlyReadModelMonthsDirty). Falha aqui não impede
    // a reconstrução normal dos meses já marcados.
    let nightly: { companies: number; marked: number } | null = null;
    if (
      String(event.request.headers.get(CRON_SCHEDULE_HEADER) || '').trim() ===
      NIGHTLY_READ_MODEL_CRON
    ) {
      try {
        nightly = await markNightlyReadModelMonthsDirty(client);
      } catch (error) {
        logServerError('[read-model/rebuild] rodada noturna falhou ao marcar meses', error);
      }
    }

    const result = await rebuildReadModelForCompanyMonth(client, {
      companyIds: [],
      monthKeys: [],
      rebuildAll: true
    });

    return json(
      { ok: true, cron: true, ...(nightly ? { nightly } : {}), ...result },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logServerError('[read-model/rebuild] cron rebuild falhou', err);
    return toErrorResponse(err, 'Erro no cron rebuild.');
  }
}
