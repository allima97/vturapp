// Migrado para Hono de src/routes/api/v1/clientes/delete/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { rejectCrossOriginRequest } from '$lib/server/requestGuards';

export const handleClientesDeleteDelete = async ({ request }: RequestEvent) => {
  const originError = rejectCrossOriginRequest(request);
  if (originError) return originError;

  return json(
    { error: 'Exclusao de cliente desabilitada.' },
    { status: 403, headers: NO_STORE_HEADERS }
  );
};
