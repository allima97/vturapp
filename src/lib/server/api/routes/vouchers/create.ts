// Migrado para Hono de src/routes/api/v1/vouchers/create/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { ensureModuloAccess, getAdminClient, requireAuthenticatedUser, resolveUserScope, toErrorResponse } from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_VOUCHER_CREATE_BODY_BYTES = 512 * 1024;

// Cria um voucher usando as colunas reais da tabela vouchers
export async function handleVouchersCreatePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_VOUCHER_CREATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['operacao_vouchers', 'vouchers', 'operacao'], 2, 'Sem permissão para criar vouchers.');
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};

    const { data, error } = await client
      .from('vouchers')
      .insert([{
        company_id: scope.companyId,
        created_by: user.id,
        provider: body.provider || 'generic',
        nome: body.nome || 'Voucher',
        codigo_sistema: body.codigo_sistema || null,
        codigo_fornecedor: body.codigo_fornecedor || null,
        reserva_online: body.reserva_online || null,
        operador: body.operador || null,
        resumo: body.resumo || null,
        data_inicio: body.data_inicio || null,
        data_fim: body.data_fim || null,
        ativo: body.ativo !== false,
        passageiros: body.passageiros || null,
        tipo_acomodacao: body.tipo_acomodacao || null,
        extra_data: body.extra_data || {}
      }])
      .select('id, company_id, created_by, provider, nome, codigo_sistema, codigo_fornecedor, reserva_online, operador, resumo, data_inicio, data_fim, ativo, passageiros, tipo_acomodacao, extra_data, created_at, updated_at')
      .single();

    if (error) throw error;

    return json({ success: true, item: data }, { headers: NO_STORE_HEADERS });
  } catch (err: unknown) {
    return toErrorResponse(err, 'Erro ao criar voucher.');
  }
}
