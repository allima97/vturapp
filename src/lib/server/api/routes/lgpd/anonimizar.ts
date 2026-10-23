/**
 * POST /api/v1/lgpd/admin/anonimizar
 *
 * Anonimiza dados pessoais de um cliente ou acompanhante.
 * LGPD Art. 18, IV (eliminação) e VI (bloqueio).
 *
 * A exclusão definitiva de registros não é implementada (substituta legal:
 * anonimização — dados não permitem mais identificação do titular).
 * Campos anonimizados: nome, email, telefone, cpf, rg, endereço, data_nascimento.
 * Campos preservados: IDs, company_id, datas de negócio (para auditoria fiscal).
 *
 * Requer role admin (isAdmin).
 */
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited } from '$lib/server/requestGuards';
import { registrarLog } from '$lib/server/auditLog';

const TIPOS_VALIDOS = ['cliente', 'acompanhante'] as const;
type TipoEntidade = typeof TIPOS_VALIDOS[number];

// Placeholder para campo anonimizado — identificável, sem dado pessoal real
const ANON = '[ANONIMIZADO-LGPD]';
const ANON_DATE = '1900-01-01';

export async function handleLgpdAnonimizarPost(event: RequestEvent) {
  try {
    const bodyResult = await readJsonBodyLimited(event.request, 8 * 1024);
    if (!bodyResult.ok) return bodyResult.response;

    const body = bodyResult.data as Record<string, unknown> | null;
    const tipo = String(body?.tipo ?? '').trim() as TipoEntidade;
    const id = String(body?.id ?? '').trim();
    const protocolo_solicitacao = String(body?.protocolo_solicitacao ?? '').trim();

    if (!TIPOS_VALIDOS.includes(tipo)) {
      return json(
        { error: `Tipo inválido. Valores aceitos: ${TIPOS_VALIDOS.join(', ')}` },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      return json({ error: 'Acesso restrito a administradores.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const agora = new Date().toISOString();

    if (tipo === 'cliente') {
      // Verifica se já anonimizado
      const { data: existing } = await client
        .from('clientes')
        .select('id, lgpd_anonimizado')
        .eq('id', id)
        .single();

      if (!existing) {
        return json({ error: 'Cliente não encontrado.' }, { status: 404, headers: NO_STORE_HEADERS });
      }
      if (existing.lgpd_anonimizado) {
        return json({ ok: true, mensagem: 'Este cliente já foi anonimizado anteriormente.' }, { headers: NO_STORE_HEADERS });
      }

      const { error: updateErr } = await client
        .from('clientes')
        .update({
          nome: ANON,
          email: null,
          telefone: null,
          celular: null,
          cpf: null,
          rg: null,
          passaporte: null,
          data_nascimento: ANON_DATE,
          endereco: null,
          complemento: null,
          bairro: null,
          cep: null,
          observacoes: null,
          lgpd_anonimizado: true,
          lgpd_anonimizado_em: agora
        })
        .eq('id', id);

      if (updateErr) throw updateErr;

      // Anonimiza também acompanhantes vinculados a este cliente
      await client
        .from('acompanhantes')
        .update({
          nome: ANON,
          email: null,
          telefone: null,
          celular: null,
          cpf: null,
          rg: null,
          passaporte: null,
          data_nascimento: ANON_DATE,
          lgpd_anonimizado: true,
          lgpd_anonimizado_em: agora
        })
        .eq('cliente_id', id)
        .eq('lgpd_anonimizado', false);

    } else {
      // tipo === 'acompanhante'
      const { data: existing } = await client
        .from('acompanhantes')
        .select('id, lgpd_anonimizado')
        .eq('id', id)
        .single();

      if (!existing) {
        return json({ error: 'Acompanhante não encontrado.' }, { status: 404, headers: NO_STORE_HEADERS });
      }
      if (existing.lgpd_anonimizado) {
        return json({ ok: true, mensagem: 'Este acompanhante já foi anonimizado anteriormente.' }, { headers: NO_STORE_HEADERS });
      }

      const { error: updateErr } = await client
        .from('acompanhantes')
        .update({
          nome: ANON,
          email: null,
          telefone: null,
          celular: null,
          cpf: null,
          rg: null,
          passaporte: null,
          data_nascimento: ANON_DATE,
          lgpd_anonimizado: true,
          lgpd_anonimizado_em: agora
        })
        .eq('id', id);

      if (updateErr) throw updateErr;
    }

    // Marca solicitação LGPD como concluída se protocolo informado
    if (protocolo_solicitacao && /^[0-9a-f-]{36}$/.test(protocolo_solicitacao)) {
      await client
        .from('lgpd_solicitacoes')
        .update({
          status: 'concluida',
          resposta: `Dados anonimizados em ${agora} por ${scope.email ?? scope.userId}. Protocolo: ${protocolo_solicitacao}`,
          respondido_por: user.id,
          respondido_em: agora
        })
        .eq('id', protocolo_solicitacao)
        .in('status', ['recebida', 'em_analise']);
    }

    // Audit log
    registrarLog(event, {
      modulo: 'LGPD',
      acao: 'lgpd_anonimizacao',
      detalhes: { tipo, entidade_id: id, protocolo_solicitacao, anonimizado_por: scope.email }
    });

    return json({
      ok: true,
      mensagem: `Dados do ${tipo} anonimizados com sucesso conforme LGPD Art. 18.`,
      anonimizado_em: agora
    }, { headers: NO_STORE_HEADERS });

  } catch (err) {
    return toErrorResponse(err, 'Erro ao anonimizar dados.');
  }
}
