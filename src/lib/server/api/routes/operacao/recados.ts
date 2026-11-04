// Migrado para Hono de src/routes/api/v1/operacao/recados/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  getAdminClient,
  isUuid,
  NO_MATCH_COMPANY_ID,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { cleanStringSet, chunkArray, dedupeById, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

const MAX_OPERACAO_RECADO_BODY_BYTES = 64 * 1024;
const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

type JsonBody = Record<string, unknown>;
type RecadoRow = {
  id?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};
type UsuarioRow = {
  id?: string | null;
  nome_completo?: string | null;
  [key: string]: unknown;
};
type ReceiverRow = {
  company_id?: string | null;
};

export async function handleOperacaoRecadosGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const allowedCompanyIds = resolveScopedCompanyIds(scope);

    const { searchParams } = event.url;
    const receiverId = String(searchParams.get('receiver_id') || '').trim();
    if (receiverId && !isUuid(receiverId)) {
      return json({ error: 'receiver_id invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const buildRecadosQuery = (companyIdsFilter?: string[]) => {
      // Busca recados enviados ou recebidos pelo usuário atual
      let query = client
        .from('mural_recados')
        .select(`
          id, company_id, sender_id, receiver_id, assunto, conteudo, created_at,
          sender_deleted, receiver_deleted,
          sender:users!sender_id(id, nome_completo, email),
          receiver:users!receiver_id(id, nome_completo, email)
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (receiverId) {
        // Thread específica
        query = query.or(`and(sender_id.eq.${scope.userId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${scope.userId})`);
      } else {
        // Todos os recados do usuário
        query = query.or(`sender_id.eq.${scope.userId},receiver_id.eq.${scope.userId}`);
      }

      if (companyIdsFilter && companyIdsFilter.length > 0) {
        query = query.in('company_id', companyIdsFilter);
      }

      return query;
    };

    const fetchRecados = async () => {
      if (scope.isAdmin) return buildRecadosQuery();
      if (allowedCompanyIds[0] === NO_MATCH_COMPANY_ID) return { data: [], error: null };
      if (allowedCompanyIds.length <= QUERY_IN_BATCH_SIZE) return buildRecadosQuery(allowedCompanyIds);

      const rows: RecadoRow[] = [];
      for (const batch of chunkArray(allowedCompanyIds)) {
        const result = await buildRecadosQuery(batch);
        if (result.error) return { data: null, error: result.error } as typeof result;
        rows.push(...(result.data || []));
      }

      return {
        data: dedupeById(rows)
          .sort((left, right) => String(right?.created_at || '').localeCompare(String(left?.created_at || '')))
          .slice(0, 200),
        error: null
      };
    };

    const { data, error: queryError } = await fetchRecados();
    if (queryError) {
      // Tabela recados pode não existir em todos os ambientes
      if (String(queryError.code || '').includes('42P01') || String(queryError.message || '').includes('does not exist')) {
        return json({ items: [], usuarios: [] }, { headers: DYNAMIC_READ_HEADERS });
      }
      throw queryError;
    }

    // Busca usuários da empresa para lista de destinatários
    const buildUsersQuery = (companyIdsFilter?: string[]) => {
      let usersQuery = client
        .from('users')
        .select('id, nome_completo, email')
        .eq('active', true)
        .neq('id', scope.userId)
        .order('nome_completo')
        .limit(100);

      if (companyIdsFilter && companyIdsFilter.length > 0) {
        usersQuery = usersQuery.in('company_id', companyIdsFilter);
      }

      return usersQuery;
    };

    const fetchUsuarios = async () => {
      if (scope.isAdmin) return buildUsersQuery();
      if (allowedCompanyIds[0] === NO_MATCH_COMPANY_ID) return { data: [], error: null };
      if (allowedCompanyIds.length <= QUERY_IN_BATCH_SIZE) return buildUsersQuery(allowedCompanyIds);

      const rows: UsuarioRow[] = [];
      for (const batch of chunkArray(allowedCompanyIds)) {
        const result = await buildUsersQuery(batch);
        if (result.error) return { data: null, error: result.error } as typeof result;
        rows.push(...(result.data || []));
        if (dedupeById(rows).length >= 100) break;
      }

      return {
        data: dedupeById(rows)
          .sort((left, right) =>
            PT_BR_COLLATOR.compare(String(left?.nome_completo || ''), String(right?.nome_completo || ''))
          )
          .slice(0, 100),
        error: null
      };
    };

    const { data: usersData, error: usersError } = await fetchUsuarios();
    if (usersError) throw usersError;

    return json({ items: data || [], usuarios: usersData || [] }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar recados.');
  }
}

export async function handleOperacaoRecadosPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_OPERACAO_RECADO_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const allowedCompanyIds = resolveScopedCompanyIds(scope);
    const allowedCompanySet = cleanStringSet(allowedCompanyIds);

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as JsonBody)
        : {};
    const { receiver_id, assunto, conteudo } = body;

    if (!String(conteudo || '').trim()) {
      return json({ error: 'Conteúdo obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const receiverIdValue = String(receiver_id || '').trim();
    const receiverId = isUuid(receiverIdValue) ? receiverIdValue : null;
    let receiverCompanyId: string | null = null;
    if (receiverId) {
      const { data: receiver, error: receiverError } = await client
        .from('users')
        .select('id, company_id, active')
        .eq('id', receiverId)
        .eq('active', true)
        .maybeSingle();
      if (receiverError) throw receiverError;
      if (!receiver) return json({ error: 'Destinatário não encontrado.' }, { status: 404, headers: NO_STORE_HEADERS });
      receiverCompanyId = String((receiver as ReceiverRow)?.company_id || '').trim() || null;
      if (!scope.isAdmin && !allowedCompanySet.has(receiverCompanyId || '')) {
        return json({ error: 'Destinatário fora do escopo da empresa.' }, { status: 403, headers: NO_STORE_HEADERS });
      }
    }

    const payloadCompanyId =
      receiverCompanyId
        ? receiverCompanyId
        : scope.companyId || allowedCompanyIds.find((id) => id !== NO_MATCH_COMPANY_ID) || null;
    if (!payloadCompanyId && !scope.isAdmin) {
      return json({ error: 'Empresa inválida.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const payload = {
      company_id: payloadCompanyId,
      sender_id: scope.userId,
      receiver_id: receiverId,
      assunto: String(assunto || '').trim() || null,
      conteudo: String(conteudo).trim(),
      sender_deleted: false,
      receiver_deleted: false
    };

    const { data, error: insertError } = await client.from('mural_recados').insert(payload).select('id').single();
    if (insertError) throw insertError;

    return json({ ok: true, id: data?.id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao enviar recado.');
  }
}

export async function handleOperacaoRecadosDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id)) return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    // Marca como deletado pelo remetente ou destinatário
    const { data: recado } = await client.from('mural_recados').select('sender_id, receiver_id').eq('id', id).maybeSingle();
    if (!recado) return json({ error: 'Recado não encontrado.' }, { status: 404, headers: NO_STORE_HEADERS });

    const isSender = recado.sender_id === scope.userId;
    const isReceiver = recado.receiver_id === scope.userId;

    if (!isSender && !isReceiver && !scope.isAdmin) {
      return json({ error: 'Sem permissão.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const update = isSender ? { sender_deleted: true } : { receiver_deleted: true };
    const { error: updateError } = await client.from('mural_recados').update(update).eq('id', id);
    if (updateError) throw updateError;

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir recado.');
  }
}
