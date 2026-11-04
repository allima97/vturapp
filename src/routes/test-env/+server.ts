import { json } from '@sveltejs/kit';
import { env as publicEnv } from '$env/dynamic/public';
import {
  getAdminClient,
  isDebugEndpointEnabled,
  isProductionRuntime,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';

const DEBUG_HEADERS = NO_STORE_HEADERS;

export async function GET(event) {
  try {
    if (isProductionRuntime()) {
      return json({ error: 'Not found' }, { status: 404, headers: DEBUG_HEADERS });
    }

    if (!isDebugEndpointEnabled(event)) {
      return json({ error: 'Not found' }, { status: 404, headers: DEBUG_HEADERS });
    }

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    if (!scope.isAdmin) {
      return json({ error: 'Acesso negado.' }, { status: 403, headers: DEBUG_HEADERS });
    }

    return json(
      {
        runtime: 'cloudflare-worker',
        d1Present: Boolean(event.platform?.env?.DB),
        r2Present: Boolean(event.platform?.env?.R2),
        publicEnvironment: publicEnv.PUBLIC_ENVIRONMENT ?? null
      },
      { headers: DEBUG_HEADERS }
    );
  } catch (err) {
    logServerError('[test-env] erro ao carregar ambiente', err);
    const response = toErrorResponse(err, 'Erro ao carregar ambiente.');
    for (const [key, value] of Object.entries(DEBUG_HEADERS)) {
      response.headers.set(key, value);
    }
    return response;
  }
}
