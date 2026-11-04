import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient, isUuid, logServerError } from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_CONVITE_ACTIVATE_BODY_BYTES = 32 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InviteActivateBody = {
  invite_id?: string;
  email?: string;
  password?: string;
  nome?: string;
};

type UserInviteRow = {
  id: string;
  status?: string | null;
  invited_email?: string | null;
  invited_user_id?: string | null;
  company_id?: string | null;
  user_type_id?: string | null;
  invited_by_role?: string | null;
  expires_at?: string | null;
  uso_individual?: boolean | null;
};

function errorJson(message: string, status: number) {
  return json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function isEmailLike(value: string) {
  return EMAIL_PATTERN.test(value);
}

function readInviteActivateBody(value: unknown): InviteActivateBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    invite_id: typeof body.invite_id === 'string' ? body.invite_id : undefined,
    email: typeof body.email === 'string' ? body.email : undefined,
    password: typeof body.password === 'string' ? body.password : undefined,
    nome: typeof body.nome === 'string' ? body.nome : undefined
  };
}

function authAlreadyExists(error: unknown) {
  const anyError = error as Record<string, unknown>;
  const message = String(anyError?.message || anyError?.error_description || '').toLowerCase();
  const status = Number(anyError?.status || 0);
  return status === 422 || message.includes('already') || message.includes('registered') || message.includes('exists');
}

export const POST: RequestHandler = async (event) => {
  try {
    const originError = rejectCrossOriginRequest(event.request, 'Origem inválida.');
    if (originError) return originError;

    const bodyResult = await readJsonBodyLimited(event.request, MAX_CONVITE_ACTIVATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;
    const body = readInviteActivateBody(bodyResult.data);
    const inviteId = String(body.invite_id || '').trim();
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const nome = String(body.nome || '').trim();

    const rateLimit = await checkPersistentRateLimit(
      'auth-convite-activate',
      `${event.getClientAddress?.() || 'unknown'}:${email || inviteId || 'empty'}`,
      { max: 8, windowMs: 60_000 },
      event.platform?.env?.DB,
    );
    if (!rateLimit.allowed) {
      return json(
        { error: 'Muitas tentativas. Aguarde alguns segundos e tente novamente.' },
        { status: 429, headers: { ...NO_STORE_HEADERS, 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      );
    }

    if (!inviteId || !isUuid(inviteId)) return errorJson('Convite invalido.', 400);
    if (!email || !isEmailLike(email)) return errorJson('E-mail invalido.', 400);
    if (!nome) return errorJson('Nome obrigatorio.', 400);
    if (password.length < 8) return errorJson('A senha deve ter pelo menos 8 caracteres.', 400);

    const adminClient = getAdminClient();
    const { data: convite, error: conviteErr } = await adminClient
      .from('user_convites')
      .select('id, status, invited_email, invited_user_id, company_id, user_type_id, invited_by_role, expires_at, uso_individual')
      .eq('id', inviteId)
      .maybeSingle();

    if (conviteErr) throw conviteErr;
    if (!convite?.id) return errorJson('Convite nao encontrado.', 404);
    const conviteRow = convite as UserInviteRow;

    const status = String(conviteRow.status || '').toLowerCase();
    if (status !== 'pending') return errorJson('Convite nao esta pendente.', 409);

    const invitedEmail = normalizeEmail(conviteRow.invited_email);
    if (invitedEmail !== email) return errorJson('Convite nao corresponde a este e-mail.', 403);

    const expiresAtRaw = String(conviteRow.expires_at || '');
    if (expiresAtRaw) {
      const expiresAt = new Date(expiresAtRaw);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
        await adminClient
          .from('user_convites')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
          .eq('id', inviteId);
        return errorJson('Convite expirado. Solicite um novo convite.', 410);
      }
    }

    const companyId = String(conviteRow.company_id || '').trim();
    const userTypeId = String(conviteRow.user_type_id || '').trim();
    const usoIndividual = Boolean(conviteRow.uso_individual);
    if ((!usoIndividual && !companyId) || !userTypeId) return errorJson('Convite incompleto. Solicite um novo convite.', 400);

    let authUserId = String(conviteRow.invited_user_id || '').trim();
    let createdAuthUser = false;

    if (authUserId) {
      const { data: existingAuthUser, error: existingAuthErr } = await adminClient.auth.admin.getUserById(authUserId);
      if (existingAuthErr) throw existingAuthErr;

      const authEmail = normalizeEmail(existingAuthUser?.user?.email);
      if (authEmail && authEmail !== email) {
        return errorJson('Convite esta vinculado a uma conta de e-mail diferente.', 409);
      }

      const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(authUserId, {
        password,
        email_confirm: true,
        user_metadata: {
          nome_completo: nome,
          invite_id: inviteId
        }
      });
      if (updateAuthErr) throw updateAuthErr;
    } else {
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          nome_completo: nome,
          invite_id: inviteId
        }
      });

      if (createErr) {
        if (authAlreadyExists(createErr)) {
          return errorJson('Conta ja existente para este e-mail. Faca login e abra novamente o convite.', 409);
        }
        throw createErr;
      }

      authUserId = String(created?.user?.id || '').trim();
      createdAuthUser = true;
      if (!authUserId) return errorJson('Falha ao criar usuario do convite.', 500);
    }

    const createdByGestor = String(conviteRow.invited_by_role || '').toUpperCase() === 'GESTOR';
    const nowIso = new Date().toISOString();

    const { error: profileErr } = await adminClient
      .from('users')
      .upsert(
        {
          id: authUserId,
          email,
          nome_completo: nome,
          uso_individual: usoIndividual,
          company_id: usoIndividual ? null : companyId,
          user_type_id: userTypeId,
          active: true,
          created_by_gestor: createdByGestor,
          updated_at: nowIso
        },
        { onConflict: 'id' }
      );
    if (profileErr) throw profileErr;

    const { data: updatedInvite, error: updateInviteErr } = await adminClient
      .from('user_convites')
      .update({
        invited_user_id: authUserId,
        status: 'accepted',
        accepted_at: nowIso
      })
      .eq('id', inviteId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (updateInviteErr) throw updateInviteErr;
    if (!updatedInvite?.id) {
      if (createdAuthUser) {
        await adminClient.auth.admin.deleteUser(authUserId).catch((cleanupErr) => {
          logServerError('[auth/convite/activate] falha ao limpar usuario criado em corrida', cleanupErr);
        });
      }
      return errorJson('Convite ja foi usado ou cancelado.', 409);
    }

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logServerError('[auth/convite/activate] falha ao ativar convite', err);
    return errorJson('Erro ao ativar convite.', 500);
  }
};
