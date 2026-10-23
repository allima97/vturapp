/**
 * auditLog.ts — trilha de auditoria na tabela `logs` (mesma tabela e MESMO
 * formato que o vturapp original gravava até mai/2026).
 *
 * Colunas: user_id, modulo, acao, detalhes (jsonb), ip, user_agent.
 * Os nomes de `modulo` e `acao` usados aqui são exatamente os que já existem
 * no histórico (ex.: modulo 'Vendas' + acao 'venda_criada'), para que a tela
 * /dashboard/logs e qualquer consulta antiga continuem funcionando igual.
 *
 * Regras:
 *  - NUNCA quebra a operação de negócio: qualquer falha vira só log de erro.
 *  - Não bloqueia a resposta: grava em background (waitUntil quando existir).
 */

import type { RequestEvent } from '@sveltejs/kit';
import { getAdminClient, logServerError } from '$lib/server/v1';

export type AuditModulo = 'Vendas' | 'Clientes' | 'Cadastros' | 'Parametros' | 'Escalas' | 'Admin' | 'perfil' | 'LGPD';

/** Ações já existentes no histórico da tabela `logs` para o módulo Vendas. */
export type AuditAcaoVendas =
  | 'venda_criada'
  | 'venda_atualizada'
  | 'venda_cancelada'
  // sem precedente no historico do vturapp original; criada em 24/09/2026 so
  // para auditoria da exclusao definitiva (DELETE /api/v1/vendas/[id])
  | 'venda_excluida'
  | 'vendas_mescladas'
  | 'recibo_excluido'
  | 'recibo_principal_atualizado'
  | 'recibo_complementar_vinculado'
  | 'recibo_complementar_removido';

/**
 * Ações dos demais módulos (Fase 1, pendência "estender a auditoria"). Nomes, módulo e
 * formato de `detalhes` copiados do histórico da tabela `logs` (gravado pelo sistema antigo
 * até mai/2026). Login/MFA ficam de fora: as rotas de api/auth não são alteradas.
 */
export type AuditAcaoOutros =
  | 'cliente_criado' // Clientes: payload gravado (+ created_by)
  | 'cliente_editado' // Clientes: { id, payload }
  | 'cliente_excluido' // Clientes: { id }
  | 'cidade_criada' // Cadastros: payload { nome, descricao, subdivisao_id }
  | 'cidade_editada' // Cadastros: { id, payload }
  | 'cidade_excluida' // Cadastros: { id }
  | 'parametros_sistema_salvos' // Parametros: payload de parametros_comissao (sem updated_at)
  | 'quote_print_settings_salvos' // Parametros: campos de quote_print_settings (sem dono/empresa)
  | 'escala_dia_salva' // Escalas
  | 'escala_dia_lote_salvo' // Escalas
  | 'permissoes_atualizadas' // Admin: { permissoes: { modulo: permissao }, usuario_alterado_id }
  | 'modulos_globais_atualizados' // Admin: { disabled_modules: string[] }
  | 'perfil_atualizado' // perfil: payload gravado em users
  | 'lgpd_anonimizacao'   // LGPD: anonimização de titular (Art. 18)
  | 'lgpd_solicitacao_recebida'; // LGPD: nova solicitação de direito (Art. 18)

export type AuditAcao = AuditAcaoVendas | AuditAcaoOutros;

type AuditEvent = Pick<RequestEvent, 'request' | 'getClientAddress'> & {
  platform?: unknown;
};

const MAX_USER_AGENT = 500;

function resolveIp(event: AuditEvent): string | null {
  const cf = event.request.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  try {
    const addr = event.getClientAddress();
    if (addr) return addr;
  } catch {
    // adapter sem IP disponível
  }
  const xff = event.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return xff || null;
}

function resolveWaitUntil(platform: unknown): ((p: Promise<unknown>) => void) | null {
  const ctx =
    platform && typeof platform === 'object'
      ? (platform as { ctx?: { waitUntil?: (p: Promise<unknown>) => void } }).ctx
      : null;
  return ctx && typeof ctx.waitUntil === 'function' ? ctx.waitUntil.bind(ctx) : null;
}

/**
 * Registra um evento de auditoria. Fire-and-forget: não lança erro e não
 * precisa de await.
 */
export function registrarLog(
  event: AuditEvent,
  params: {
    userId?: string | null;
    modulo: AuditModulo;
    acao: AuditAcao;
    /**
     * Objeto pronto, ou uma função assíncrona que monta os detalhes em background
     * (para quando é preciso ler algo do banco sem atrasar a resposta).
     */
    detalhes?: Record<string, unknown> | null | (() => Promise<Record<string, unknown> | null>);
  },
): void {
  let row: Record<string, unknown>;
  try {
    row = {
      user_id: params.userId || null,
      modulo: params.modulo,
      acao: params.acao,
      detalhes: typeof params.detalhes === 'function' ? null : (params.detalhes ?? null),
      ip: resolveIp(event),
      user_agent: (event.request.headers.get('user-agent') || '').slice(0, MAX_USER_AGENT) || null,
    };
  } catch (err) {
    logServerError('[auditLog] falha ao montar registro', err, { acao: params.acao });
    return;
  }

  const task = (async () => {
    try {
      if (typeof params.detalhes === 'function') {
        row.detalhes = (await params.detalhes()) ?? null;
      }
      const { error } = await getAdminClient().from('logs').insert(row);
      if (error) throw error;
    } catch (err) {
      logServerError('[auditLog] falha ao gravar log de auditoria', err, {
        modulo: params.modulo,
        acao: params.acao,
      });
    }
  })();

  const waitUntil = resolveWaitUntil(event.platform);
  if (waitUntil) waitUntil(task);
}
