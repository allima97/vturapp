/**
 * GET /api/v1/lgpd/meus-dados
 *
 * Retorna todos os dados pessoais do usuário autenticado armazenados no sistema.
 * LGPD Art. 18, I e II: confirmação de tratamento e acesso aos dados.
 *
 * Requer autenticação (usuário interno da plataforma).
 */
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getAdminClient, requireAuthenticatedUser, logServerError } from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';

export async function handleLgpdMeusDadosGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);

    // Dados do perfil do usuário
    const { data: perfil } = await client
      .from('users')
      .select('id, nome_completo, email: auth.users(email), telefone, cidade, estado, created_at, updated_at, use_individual, active')
      .eq('id', user.id)
      .maybeSingle();

    // Logs de auditoria gerados pelo usuário
    const { data: logs } = await client
      .from('logs')
      .select('modulo, acao, created_at, ip')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    // Dados de MFA registrados
    const { data: mfaFactors } = await client.auth.admin.listFactors(user.id).catch(() => ({ data: null }));

    return json({
      titular: {
        id: user.id,
        email: user.email,
        perfil: perfil ?? null,
      },
      tratamento: {
        finalidade: 'Gestão de usuários da plataforma de agência de viagens',
        base_legal: 'Contrato (LGPD Art. 7, V)',
        dados_tratados: ['nome', 'email', 'telefone', 'cidade', 'estado', 'logs_de_acesso'],
        responsavel: 'Operadora da plataforma vturapp',
        contato_dpo: 'privacidade@vturapp.com.br',
        politica_privacidade: '/privacidade',
      },
      historico_acessos: (logs ?? []).map((l) => ({
        modulo: l.modulo,
        acao: l.acao,
        data: l.created_at,
        ip: l.ip
      })),
      autenticacao: {
        mfa_ativo: Array.isArray(mfaFactors?.totp) && mfaFactors.totp.length > 0,
        fatores_count: mfaFactors?.totp?.length ?? 0
      },
      exportado_em: new Date().toISOString()
    }, { headers: NO_STORE_HEADERS });

  } catch (err) {
    logServerError('[lgpd/meus-dados] erro', err);
    return json({ error: 'Erro ao carregar dados.' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
