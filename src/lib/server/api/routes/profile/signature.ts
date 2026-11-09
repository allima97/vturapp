// Migrado para Hono de src/routes/api/v1/profile/signature/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateQuoteReadModels } from '$lib/server/readModelCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_PROFILE_SIGNATURE_BODY_BYTES = 32 * 1024;

type ProfileSignatureBody = {
  signature?: string;
  assinatura?: string;
};

function readProfileSignatureBody(value: unknown): ProfileSignatureBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    signature: typeof body.signature === 'string' ? body.signature : undefined,
    assinatura: typeof body.assinatura === 'string' ? body.assinatura : undefined
  };
}

export const handleProfileSignatureGet = async (event: RequestEvent) => {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    await resolveUserScope(client, user.id);

    const [{ data: userRow, error: userErr }, { data: settingsRow, error: settingsErr }] =
      await Promise.all([
        client
          .from('users')
          .select('id, nome_completo, company_id')
          .eq('id', user.id)
          .maybeSingle(),
        client
          .from('quote_print_settings')
          .select('consultor_nome')
          .eq('owner_user_id', user.id)
          .maybeSingle()
      ]);

    if (userErr) throw userErr;
    if (settingsErr) throw settingsErr;

    const signature = String(settingsRow?.consultor_nome || userRow?.nome_completo || '').trim();

    return json(
      {
        signature,
        assinatura: signature,
        fallbackName: String(userRow?.nome_completo || '').trim(),
        companyId: String(userRow?.company_id || '').trim() || null,
        nome_completo: userRow?.nome_completo || '',
        cargo: ''
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    logServerError('[profile/signature] falha ao carregar assinatura', err);
    return toErrorResponse(err, 'Erro ao carregar assinatura.');
  }
};

export const handleProfileSignaturePatch = async (event: RequestEvent) => {
  try {
    const { request } = event;
    const originError = rejectCrossOriginRequest(request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(request, MAX_PROFILE_SIGNATURE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    await resolveUserScope(client, user.id);

    const body = readProfileSignatureBody(bodyResult.data);
    const signature = String(body?.signature || body?.assinatura || '').trim();

    const { data: userRow, error: userErr } = await client
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();
    if (userErr) throw userErr;

    const { data: existing, error: settingsError } = await client
      .from('quote_print_settings')
      .select('id')
      .eq('owner_user_id', user.id)
      .maybeSingle();
    if (settingsError) throw settingsError;

    const payload = {
      owner_user_id: user.id,
      company_id: userRow?.company_id || null,
      consultor_nome: signature
    };
    const { error } = existing?.id
      ? await client.from('quote_print_settings').update(payload).eq('id', existing.id)
      : await client.from('quote_print_settings').insert(payload);
    if (error) throw error;

    invalidateQuoteReadModels({
      companyIds: userRow?.company_id ? [String(userRow.company_id)] : null,
      userId: user.id
    });
    return json({ ok: true, signature }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logServerError('[profile/signature] falha ao salvar assinatura', err);
    return toErrorResponse(err, 'Erro ao salvar assinatura.');
  }
};
