import { json } from '@sveltejs/kit';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { toPasskeyErrorResponse, verifyRegistration } from '$lib/server/passkeys';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import type { RequestHandler } from './$types';

const MAX_PASSKEY_REGISTER_BODY_BYTES = 32 * 1024;
type RegistrationResponsePayload = Parameters<typeof verifyRegistration>[0]['response'];

type PasskeyRegisterVerifyBody = {
  challengeId?: string;
  response?: RegistrationResponsePayload;
  name?: string;
};

function readPasskeyRegisterVerifyBody(value: unknown): PasskeyRegisterVerifyBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    challengeId: typeof body.challengeId === 'string' ? body.challengeId : undefined,
    response: body.response as RegistrationResponsePayload | undefined,
    name: typeof body.name === 'string' ? body.name : undefined
  };
}

export const POST: RequestHandler = async (event) => {
  try {
    const originError = rejectCrossOriginRequest(event.request, 'Origem inválida.');
    if (originError) return originError;

    const { session, user } = await event.locals.safeGetSession();
    if (!session || !user) {
      return json({ error: 'Sessao invalida.' }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const bodyResult = await readJsonBodyLimited(event.request, MAX_PASSKEY_REGISTER_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;
    const body = readPasskeyRegisterVerifyBody(bodyResult.data);
    const challengeId = String(body?.challengeId || '').trim();
    const response = body?.response;
    const name = String(body?.name || 'Passkey').trim();

    if (!challengeId || !response) {
      return json(
        { error: 'Dados da passkey incompletos.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    await verifyRegistration({
      event,
      user: { id: user.id, email: user.email },
      challengeId,
      response,
      name
    });

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toPasskeyErrorResponse(err, 'Erro ao cadastrar passkey.');
  }
};
