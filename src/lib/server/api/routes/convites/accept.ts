// Migrado para Hono de src/routes/api/v1/convites/accept/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getAdminClient, isUuid, logServerError, requireAuthenticatedUser } from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_CONVITE_ACCEPT_BODY_BYTES = 32 * 1024;

type ConviteRow = {
  id?: string | null;
  status?: string | null;
  invited_email?: string | null;
  invited_user_id?: string | null;
  company_id?: string | null;
  user_type_id?: string | null;
  invited_by_role?: string | null;
  expires_at?: string | null;
  uso_individual?: boolean | null;
};

type PerfilExistenteRow = {
  id?: string | null;
  company_id?: string | null;
  uso_individual?: boolean | null;
};

type UserProfilePayload = {
  id?: string;
  email: string;
  uso_individual: boolean;
  company_id: string | null;
  user_type_id: string;
  active: boolean;
  created_by_gestor: boolean;
  updated_at?: string;
};

type ConviteUpdatePayload = {
  invited_user_id?: string;
  status?: 'cancelled';
  cancelled_at?: string;
};

function readErrorField(error: unknown, field: string) {
  return error && typeof error === 'object' ? (error as Record<string, unknown>)[field] : undefined;
}

function errorMessage(error: unknown) {
  return String(readErrorField(error, 'message') || error || '');
}

function isTableMissing(error: unknown) {
  const code = String(readErrorField(error, 'code') || '');
  const message = errorMessage(error).toLowerCase();
  return code === '42P01' || message.includes('does not exist');
}

function isMissingColumn(error: unknown, column: string) {
  const code = String(readErrorField(error, 'code') || '');
  const message = errorMessage(error).toLowerCase();
  return code === '42703' && message.includes(column.toLowerCase());
}

function errorJson(message: string, status: number) {
  return json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

export const handleConvitesAcceptPost = async (event: RequestEvent) => {
  try {
    const { request } = event;
    const originError = rejectCrossOriginRequest(request);
    if (originError) return originError;

    const user = await requireAuthenticatedUser(event);
    const adminClient = getAdminClient();

    const bodyResult = await readJsonBodyLimited(request, MAX_CONVITE_ACCEPT_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;
    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};
    const inviteId = String(body.invite_id || '').trim();
    if (!inviteId) return errorJson('invite_id e obrigatorio.', 400);
    if (!isUuid(inviteId)) return errorJson('invite_id invalido.', 400);

    const email = String(user.email || '')
      .trim()
      .toLowerCase();
    if (!email) return errorJson('Conta sem e-mail.', 400);

    const { data: convite, error: conviteErr } = await adminClient
      .from('user_convites')
      .select(
        'id, status, invited_email, invited_user_id, company_id, user_type_id, invited_by_role, expires_at, uso_individual'
      )
      .eq('id', inviteId)
      .limit(1)
      .maybeSingle();

    if (conviteErr) {
      if (isTableMissing(conviteErr)) {
        return errorJson('Tabela public.user_convites nao existe. Aplique a migration.', 500);
      }
      if (isMissingColumn(conviteErr, 'expires_at')) {
        return errorJson(
          'Coluna public.user_convites.expires_at ausente. Aplique a migration.',
          500
        );
      }
      throw conviteErr;
    }

    const conviteRow = convite as ConviteRow | null;

    if (!conviteRow?.id) return errorJson('Convite nao encontrado.', 404);

    const status = String(conviteRow.status || '').toLowerCase();
    if (status !== 'pending') {
      return errorJson('Convite nao esta pendente.', 409);
    }

    const invitedEmail = String(conviteRow.invited_email || '')
      .trim()
      .toLowerCase();
    if (invitedEmail !== email) {
      return errorJson('Convite nao corresponde a este e-mail.', 403);
    }

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

    const alreadyBoundId = conviteRow.invited_user_id || null;
    if (alreadyBoundId && alreadyBoundId !== user.id) {
      return errorJson('Convite ja foi associado a outro usuario.', 409);
    }

    const companyId = String(conviteRow.company_id || '').trim();
    const userTypeId = String(conviteRow.user_type_id || '').trim();
    const usoIndividual = Boolean(conviteRow.uso_individual);
    if ((!usoIndividual && !companyId) || !userTypeId) {
      return errorJson('Convite invalido (empresa/cargo ausente).', 400);
    }

    const { data: perfilExistente, error: perfilErr } = await adminClient
      .from('users')
      .select('id, company_id, uso_individual')
      .eq('id', user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const perfilRow = perfilExistente as PerfilExistenteRow | null;
    const companyAtual = String(perfilRow?.company_id || '').trim();
    const usoAtual = perfilRow?.uso_individual;

    if (!usoIndividual && companyAtual && companyAtual !== companyId && usoAtual === false) {
      return errorJson('Usuario ja vinculado a outra empresa.', 409);
    }

    const createdByGestor = String(conviteRow.invited_by_role || '').toUpperCase() === 'GESTOR';

    if (!perfilRow?.id) {
      const insertPayload: UserProfilePayload = {
        id: user.id,
        email,
        uso_individual: usoIndividual,
        company_id: usoIndividual ? null : companyId,
        user_type_id: userTypeId,
        active: true,
        created_by_gestor: createdByGestor
      };
      const { error: insertErr } = await adminClient.from('users').insert(insertPayload);
      if (insertErr) throw insertErr;
    } else {
      const updatePayload: UserProfilePayload = {
        email,
        uso_individual: usoIndividual,
        company_id: usoIndividual ? null : companyId,
        user_type_id: userTypeId,
        active: true,
        created_by_gestor: createdByGestor,
        updated_at: new Date().toISOString()
      };
      const { error: updateErr } = await adminClient
        .from('users')
        .update(updatePayload)
        .eq('id', user.id);
      if (updateErr) throw updateErr;
    }

    const conviteUpdatePayload: ConviteUpdatePayload = { invited_user_id: user.id };
    await adminClient.from('user_convites').update(conviteUpdatePayload).eq('id', inviteId);

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error: unknown) {
    logServerError('[convites/accept] falha ao aceitar convite', error);
    return errorJson('Erro interno ao aceitar convite.', 500);
  }
};
