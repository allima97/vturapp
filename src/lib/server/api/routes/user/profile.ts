// Migrado para Hono de src/routes/api/v1/user/profile/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { registrarLog } from '$lib/server/auditLog';
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getAdminClient, requireAuthenticatedUser, toErrorResponse } from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { validateOptionalCPF } from '$lib/utils/validation';

const MAX_USER_PROFILE_BODY_BYTES = 64 * 1024;
const USER_PROFILE_ALLOWED_UPDATE_FIELDS = [
  'nome_completo',
  'cpf',
  'data_nascimento',
  'telefone',
  'whatsapp',
  'rg',
  'cep',
  'endereco',
  'numero',
  'complemento',
  'cidade',
  'estado'
];

type UserProfileBody = Record<string, unknown> & {
  uso_individual?: boolean;
};

function readUserProfileBody(value: unknown): UserProfileBody {
  if (!value || typeof value !== 'object') return {};
  return value as UserProfileBody;
}

export async function handleUserProfileGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);

    const { data, error: queryError } = await client
      .from('users')
      .select(
        `
        id, nome_completo, cpf, data_nascimento, telefone, whatsapp,
        rg, cep, endereco, numero, complemento, cidade, estado, email, uso_individual,
        avatar_url, company_id, created_by_gestor, must_change_password,
        company:companies!company_id(nome_empresa, nome_fantasia, cnpj, endereco, telefone, cidade, estado)
      `
      )
      .eq('id', user.id)
      .maybeSingle();

    if (queryError) throw queryError;
    if (!data)
      return json({ error: 'Perfil não encontrado.' }, { status: 404, headers: NO_STORE_HEADERS });

    return json(data, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar perfil.');
  }
}

export async function handleUserProfilePatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_USER_PROFILE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);

    const body = readUserProfileBody(bodyResult.data);

    if ('cpf' in body && !validateOptionalCPF(body.cpf)) {
      return json(
        { error: 'CPF inválido. Confira os dígitos informados.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const payload: Record<string, unknown> = {};
    // Campos que o usuário pode editar no próprio perfil (apenas colunas que existem no schema)
    for (const key of USER_PROFILE_ALLOWED_UPDATE_FIELDS) {
      if (key in body) {
        payload[key] = body[key] === '' ? null : body[key];
      }
    }

    if ('uso_individual' in body && typeof body.uso_individual === 'boolean') {
      const { data: currentProfile, error: currentProfileError } = await client
        .from('users')
        .select('uso_individual')
        .eq('id', user.id)
        .maybeSingle();
      if (currentProfileError) throw currentProfileError;

      if (currentProfile?.uso_individual === null || currentProfile?.uso_individual === undefined) {
        payload.uso_individual = body.uso_individual;
      }
    }

    if (Object.keys(payload).length === 0) {
      return json(
        { error: 'Nenhum campo para atualizar.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { error: updateError } = await client.from('users').update(payload).eq('id', user.id);
    if (updateError) throw updateError;

    registrarLog(event, {
      userId: user.id,
      modulo: 'perfil',
      acao: 'perfil_atualizado',
      detalhes: { ...payload }
    });

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar perfil.');
  }
}
