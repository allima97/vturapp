// Migrado para Hono de src/routes/api/v1/admin/maintenance/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { checkRateLimit } from '$lib/server/rateLimit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_MAINTENANCE_BODY_BYTES = 8 * 1024;

async function requireSystemAdmin(client: ReturnType<typeof getAdminClient>, userId: string) {
  const scope = await resolveUserScope(client, userId);
  return scope.isAdmin;
}

export async function handleAdminMaintenanceGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);

    if (!(await requireSystemAdmin(client, user.id))) {
      return json({ error: 'Sem acesso.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const { data, error } = await client
      .from('admin_system_settings')
      .select('maintenance_enabled, maintenance_message, updated_at')
      .eq('singleton', true)
      .maybeSingle();
    if (error) throw error;

    return json(
      {
        maintenance_enabled: Boolean(data?.maintenance_enabled),
        maintenance_message: data?.maintenance_message ?? null,
        updated_at: data?.updated_at ?? null
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar manutencao.');
  }
}

export async function handleAdminMaintenancePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_MAINTENANCE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);

    if (!(await requireSystemAdmin(client, user.id))) {
      return json({ error: 'Sem acesso.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const rl = checkRateLimit(`admin-maintenance:${user.id}`, { max: 20, windowMs: 60_000 });
    if (!rl.allowed) {
      return json(
        { error: 'Muitas requisicoes. Aguarde e tente novamente.' },
        {
          status: 429,
          headers: { ...NO_STORE_HEADERS, 'Retry-After': String(rl.retryAfterSeconds) }
        }
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};

    const payload = {
      singleton: true,
      maintenance_enabled: Boolean(body?.maintenance_enabled),
      maintenance_message: body?.maintenance_message ?? null,
      updated_by: user.id
    };

    const { error } = await client
      .from('admin_system_settings')
      .upsert(payload, { onConflict: 'singleton' });
    if (error) throw error;

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar manutencao.');
  }
}
