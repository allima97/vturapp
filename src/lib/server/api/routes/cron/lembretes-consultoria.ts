// Migrado para Hono de src/routes/api/v1/cron/lembretes-consultoria/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited } from '$lib/server/requestGuards';
import { env } from '$env/dynamic/private';

const MAX_CRON_BODY_BYTES = 4 * 1024;

type CronConsultoriaBody = {
  dryRun?: boolean;
};

function secretMatches(expected: string, received: string | null) {
  const actual = String(received || '');
  if (!expected || actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return diff === 0;
}

function readCronConsultoriaBody(value: unknown): CronConsultoriaBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return typeof body.dryRun === 'boolean' ? { dryRun: body.dryRun } : {};
}

function disabledCronResponse(dryRun: boolean) {
  return json(
    {
      status: 'disabled',
      implemented: false,
      dryRun,
      action: 'none',
      pendentes: 0,
      message:
        'Cron lembretes-consultoria esta desativado: endpoint reservado, sem execucao operacional.'
    },
    { headers: NO_STORE_HEADERS }
  );
}

async function handleCronRequest(request: Request) {
  const CRON_SECRET = env.CRON_SECRET_CONSULTORIA || env.CRON_SECRET;
  const secret = request.headers.get('x-cron-secret');
  if (!CRON_SECRET || !secretMatches(CRON_SECRET, secret)) {
    return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const bodyResult = await readJsonBodyLimited(request, MAX_CRON_BODY_BYTES);
  if (!bodyResult.ok) return bodyResult.response;

  const body = readCronConsultoriaBody(bodyResult.data);
  return disabledCronResponse(Boolean(body.dryRun));
}

export const handleCronLembretesConsultoriaPost = async ({ request }: RequestEvent) => {
  return handleCronRequest(request);
};
