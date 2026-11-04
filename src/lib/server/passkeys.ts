import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  WebAuthnCredential
} from '@simplewebauthn/server';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from '@simplewebauthn/server';
import type { RequestEvent } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';
import { getDataContext } from '$lib/server/data';
import { openUserSession } from '$lib/server/data/authApi';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { getAdminClient, isProductionRuntime, isUuid, logServerError } from '$lib/server/v1';

const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;

type PasskeyRow = {
  id: string;
  user_id: string;
  user_email: string;
  name: string;
  credential_id: string;
  public_key: string;
  counter: number | string | null;
  transports: AuthenticatorTransportFuture[] | string[] | null;
  device_type: string | null;
  backed_up: boolean | null;
  aaguid: string | null;
  origin: string | null;
  rp_id: string | null;
  last_used_at: string | null;
  created_at: string;
};

type ChallengeRow = {
  id: string;
  user_id: string | null;
  type: 'registration' | 'authentication';
  challenge: string;
  expires_at: string;
  used_at: string | null;
};

type ErrorDetails = {
  code?: string | null;
  message?: string | null;
  status?: number;
  body?: {
    message?: string | null;
  } | null;
};

type DadosLinkData = {
  properties?: {
    hashed_token?: string | null;
  } | null;
};

type ExistingPasskeyRow = {
  credential_id?: string | null;
  transports?: unknown;
};

function errorDetails(err: unknown): ErrorDetails {
  return err && typeof err === 'object' ? (err as ErrorDetails) : {};
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function randomCredentialId() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function getPasskeyRp(event: RequestEvent) {
  return {
    rpName: 'VTUR',
    rpID: event.url.hostname,
    origin: event.url.origin
  };
}

function normalizeEmail(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeTransports(value?: unknown): AuthenticatorTransportFuture[] {
  if (!Array.isArray(value)) return [];

  const transports: AuthenticatorTransportFuture[] = [];
  for (const item of value) {
    if (item) transports.push(item as AuthenticatorTransportFuture);
  }
  return transports;
}

function isMissingPasskeyTable(err: unknown) {
  const details = errorDetails(err);
  const code = String(details.code || '').toLowerCase();
  const message = String(details.message || '').toLowerCase();
  return (
    code === '42p01' ||
    message.includes('auth_passkeys') ||
    message.includes('auth_passkey_challenges')
  );
}

function passkeyUnavailable(): never {
  throw error(503, 'Passkeys ainda não estão habilitadas neste ambiente.');
}

export function toPasskeyErrorResponse(err: unknown, fallbackMessage: string) {
  const details = errorDetails(err);
  const status = typeof details.status === 'number' ? details.status : 500;
  if (status >= 500) {
    logServerError('[passkeys] erro interno', err, { fallbackMessage });
  }

  const rawMessage = String(details.body?.message || details.message || fallbackMessage);
  const message =
    isProductionRuntime() && status >= 500 && status !== 503 ? fallbackMessage : rawMessage;

  if (status === 404) {
    return json({ error: message || fallbackMessage }, { status: 400, headers: NO_STORE_HEADERS });
  }

  return json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

async function storeChallenge(params: {
  userId?: string | null;
  type: 'registration' | 'authentication';
  challenge: string;
}) {
  const admin = getAdminClient();
  const expiresAt = new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS).toISOString();

  const { data, error: insertError } = await admin
    .from('auth_passkey_challenges')
    .insert({
      user_id: params.userId ?? null,
      type: params.type,
      challenge: params.challenge,
      expires_at: expiresAt
    })
    .select('id')
    .single();

  if (insertError || !data?.id) {
    logServerError('[passkeys] falha ao gravar challenge', insertError);
    if (isMissingPasskeyTable(insertError)) passkeyUnavailable();
    throw error(500, 'Erro ao preparar passkey.');
  }

  return data.id as string;
}

async function getChallenge(challengeId: string, type: 'registration' | 'authentication') {
  if (!isUuid(challengeId)) {
    throw error(400, 'Solicitação de passkey inválida. Tente novamente.');
  }

  const admin = getAdminClient();
  const { data, error: challengeError } = await admin
    .from('auth_passkey_challenges')
    .select('id, user_id, type, challenge, expires_at, used_at')
    .eq('id', challengeId)
    .eq('type', type)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (challengeError) {
    logServerError('[passkeys] falha ao buscar challenge', challengeError);
    if (isMissingPasskeyTable(challengeError)) passkeyUnavailable();
    throw error(500, 'Erro ao validar passkey.');
  }

  if (!data) {
    throw error(400, 'Solicitação de passkey expirada. Tente novamente.');
  }

  return data as ChallengeRow;
}

async function consumeChallenge(challengeId: string) {
  const admin = getAdminClient();
  const { error: updateError } = await admin
    .from('auth_passkey_challenges')
    .update({ used_at: new Date().toISOString() })
    .eq('id', challengeId)
    .is('used_at', null);

  if (updateError) {
    logServerError('[passkeys] falha ao marcar challenge como usado', updateError);
  }
}

async function createDadosSessionForUser(event: RequestEvent, userId: string) {
  const context = getDataContext();
  if (!context) throw error(500, 'Banco indisponivel.');
  context.cookies = {
    get: (name) => event.cookies.get(name),
    set: (name, value, options) =>
      event.cookies.set(name, value, { path: '/', ...(options || {}) }),
    delete: (name, options) => event.cookies.delete(name, { path: '/', ...(options || {}) })
  };
  const admin = getAdminClient();
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  const user = userData?.user;
  if (userError || !user?.email) {
    logServerError('[passkeys] falha ao buscar usuario auth', userError);
    throw error(401, 'Usuário da passkey não encontrado.');
  }
  await openUserSession(context, userId);
  return {
    user,
    session: { access_token: 'cookie', refresh_token: 'cookie', user },
    storageKey: 'sessao'
  };
}

export async function listPasskeys(userId: string) {
  const admin = getAdminClient();
  const { data, error: listError } = await admin
    .from('auth_passkeys')
    .select('id, name, transports, device_type, backed_up, last_used_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (listError) {
    logServerError('[passkeys] falha ao listar passkeys', listError);
    if (isMissingPasskeyTable(listError)) passkeyUnavailable();
    throw error(500, 'Erro ao carregar passkeys.');
  }

  return data || [];
}

export async function deletePasskey(userId: string, passkeyId: string) {
  if (!isUuid(passkeyId)) {
    throw error(400, 'Passkey inválida.');
  }

  const admin = getAdminClient();
  const { error: deleteError } = await admin
    .from('auth_passkeys')
    .delete()
    .eq('id', passkeyId)
    .eq('user_id', userId);

  if (deleteError) {
    logServerError('[passkeys] falha ao remover passkey', deleteError);
    if (isMissingPasskeyTable(deleteError)) passkeyUnavailable();
    throw error(500, 'Erro ao remover passkey.');
  }
}

export async function buildRegistrationOptions(
  event: RequestEvent,
  user: { id: string; email?: string | null }
) {
  const admin = getAdminClient();
  const { rpName, rpID } = getPasskeyRp(event);
  const email = normalizeEmail(user.email) || user.id;

  const { data: existing, error: existingError } = await admin
    .from('auth_passkeys')
    .select('credential_id, transports')
    .eq('user_id', user.id);

  if (existingError) {
    logServerError('[passkeys] falha ao buscar passkeys existentes', existingError);
    if (isMissingPasskeyTable(existingError)) passkeyUnavailable();
    throw error(500, 'Erro ao preparar cadastro de passkey.');
  }

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(user.id),
    userName: email,
    userDisplayName: email,
    timeout: 60000,
    attestationType: 'none',
    excludeCredentials: ((existing || []) as ExistingPasskeyRow[])
      .filter((row) => Boolean(row.credential_id))
      .map((row) => ({
        id: String(row.credential_id),
        transports: normalizeTransports(row.transports)
      })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required'
    }
  });

  const challengeId = await storeChallenge({
    userId: user.id,
    type: 'registration',
    challenge: options.challenge
  });

  return { challengeId, options };
}

export async function verifyRegistration(params: {
  event: RequestEvent;
  user: { id: string; email?: string | null };
  challengeId: string;
  response: RegistrationResponseJSON;
  name?: string | null;
}) {
  const challenge = await getChallenge(params.challengeId, 'registration');
  try {
    if (challenge.user_id !== params.user.id) {
      throw error(403, 'Passkey não pertence ao usuário atual.');
    }

    const { origin, rpID } = getPasskeyRp(params.event);
    const verification = await verifyRegistrationResponse({
      response: params.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw error(400, 'Não foi possível validar a passkey.');
    }

    const {
      credential,
      credentialDeviceType,
      credentialBackedUp,
      aaguid,
      origin: credentialOrigin,
      rpID: credentialRpID
    } = verification.registrationInfo;
    const transports = credential.transports ?? params.response.response.transports ?? [];
    const email = normalizeEmail(params.user.email) || params.user.id;

    const admin = getAdminClient();
    const { error: insertError } = await admin.from('auth_passkeys').insert({
      user_id: params.user.id,
      user_email: email,
      name:
        String(params.name || 'Passkey')
          .trim()
          .slice(0, 80) || 'Passkey',
      credential_id: credential.id,
      public_key: bytesToBase64Url(credential.publicKey),
      counter: credential.counter,
      transports,
      device_type: credentialDeviceType,
      backed_up: credentialBackedUp,
      aaguid,
      origin: credentialOrigin,
      rp_id: credentialRpID || rpID
    });

    if (insertError) {
      if (String(errorDetails(insertError).code || '') === '23505') {
        throw error(409, 'Esta passkey já está cadastrada.');
      }

      logServerError('[passkeys] falha ao salvar passkey', insertError);
      throw error(500, 'Erro ao salvar passkey.');
    }
  } finally {
    await consumeChallenge(challenge.id);
  }
}

export async function buildAuthenticationOptions(event: RequestEvent, email?: string | null) {
  const admin = getAdminClient();
  const { rpID } = getPasskeyRp(event);
  const normalizedEmail = normalizeEmail(email);

  let passkeys: Array<Pick<PasskeyRow, 'user_id' | 'credential_id' | 'transports'>> = [];
  let challengeUserId: string | null = null;
  if (normalizedEmail) {
    const { data, error: listError } = await admin
      .from('auth_passkeys')
      .select('user_id, credential_id, transports')
      .eq('user_email', normalizedEmail);

    if (listError) {
      logServerError('[passkeys] falha ao buscar passkeys por email', listError);
      if (isMissingPasskeyTable(listError)) passkeyUnavailable();
      throw error(500, 'Erro ao preparar login por passkey.');
    }

    passkeys = (data || []) as Array<Pick<PasskeyRow, 'user_id' | 'credential_id' | 'transports'>>;
    challengeUserId = passkeys[0]?.user_id || null;
  }

  const allowCredentials = normalizedEmail
    ? passkeys.length > 0
      ? passkeys.map((row) => ({
          id: row.credential_id,
          transports: normalizeTransports(row.transports)
        }))
      : [{ id: randomCredentialId(), transports: [] }]
    : undefined;

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    timeout: 60000,
    userVerification: 'required'
  });

  const challengeId = await storeChallenge({
    userId: challengeUserId,
    type: 'authentication',
    challenge: options.challenge
  });

  return { challengeId, options };
}

export async function verifyAuthentication(params: {
  event: RequestEvent;
  challengeId: string;
  response: AuthenticationResponseJSON;
}) {
  const challenge = await getChallenge(params.challengeId, 'authentication');
  try {
    const admin = getAdminClient();
    const { data: passkey, error: passkeyError } = await admin
      .from('auth_passkeys')
      .select(
        'id, user_id, user_email, name, credential_id, public_key, counter, transports, device_type, backed_up, aaguid, origin, rp_id, last_used_at, created_at'
      )
      .eq('credential_id', params.response.id)
      .maybeSingle();

    if (passkeyError) {
      logServerError('[passkeys] falha ao buscar credencial', passkeyError);
      if (isMissingPasskeyTable(passkeyError)) passkeyUnavailable();
      throw error(500, 'Erro ao validar passkey.');
    }

    if (!passkey) {
      throw error(401, 'Passkey não cadastrada neste sistema.');
    }

    const row = passkey as PasskeyRow;
    if (challenge.user_id && challenge.user_id !== row.user_id) {
      throw error(403, 'Passkey não pertence à solicitação de login.');
    }

    const { origin, rpID } = getPasskeyRp(params.event);
    const credential: WebAuthnCredential = {
      id: row.credential_id,
      publicKey: base64UrlToBytes(row.public_key),
      counter: Number(row.counter || 0),
      transports: normalizeTransports(row.transports)
    };

    const verification = await verifyAuthenticationResponse({
      response: params.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential,
      requireUserVerification: true
    });

    if (!verification.verified) {
      throw error(401, 'Passkey inválida.');
    }

    const { authenticationInfo } = verification;
    const { error: updateError } = await admin
      .from('auth_passkeys')
      .update({
        counter: authenticationInfo.newCounter,
        device_type: authenticationInfo.credentialDeviceType,
        backed_up: authenticationInfo.credentialBackedUp,
        origin: authenticationInfo.origin,
        rp_id: authenticationInfo.rpID,
        last_used_at: new Date().toISOString()
      })
      .eq('id', row.id);

    if (updateError) {
      logServerError('[passkeys] passkey validada, mas contador nao foi atualizado', updateError);
    }

    return createDadosSessionForUser(params.event, row.user_id);
  } finally {
    await consumeChallenge(challenge.id);
  }
}
