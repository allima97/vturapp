// Migrado para Hono de src/routes/api/v1/admin/modulos-sistema/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { registrarLog } from '$lib/server/auditLog';
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_MODULOS_SISTEMA_BODY_BYTES = 16 * 1024;

type SystemModuleSettingsRow = {
  module_key?: string | null;
  enabled?: boolean | null;
  reason?: string | null;
};

// Catálogo de módulos do sistema
const MODULOS_CATALOGO = [
  { key: 'vendas', label: 'Vendas' },
  { key: 'vendas_consulta', label: 'Consulta de Vendas' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'orcamentos', label: 'Orçamentos' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'financeiro_notas_fiscais', label: 'Notas Fiscais' },
  { key: 'comissionamento', label: 'Comissionamento' },
  { key: 'comissoes', label: 'Comissões' },
  { key: 'conciliacao', label: 'Conciliação' },
  { key: 'operacao_conciliacao', label: 'Conciliação Operacional' },
  { key: 'parametros_regras_comissao', label: 'Regras de Comissão' },
  { key: 'parametros_formas_pagamento', label: 'Formas de Pagamento' },
  { key: 'operacao', label: 'Operação' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'tarefas', label: 'Tarefas' },
  { key: 'viagens', label: 'Viagens' },
  { key: 'vouchers', label: 'Vouchers' },
  { key: 'relatorios', label: 'Relatórios' },
  { key: 'relatorios_ranking_vendas', label: 'Ranking de Vendas' },
  { key: 'cadastros', label: 'Cadastros' },
  { key: 'parametros', label: 'Parâmetros' },
  { key: 'metas', label: 'Metas' },
  { key: 'escalas', label: 'Escalas' },
  { key: 'equipe', label: 'Equipe' },
  { key: 'cambios', label: 'Câmbios' },
  { key: 'controle_sac', label: 'Controle SAC' },
  { key: 'documentos_viagens', label: 'Documentos de Viagens' },
  { key: 'admin', label: 'Administração' },
  { key: 'admin_users', label: 'Admin - Usuários' },
  { key: 'admin_financeiro', label: 'Admin - Financeiro' }
];

export async function handleAdminModulosSistemaGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      return json(
        { error: 'Somente administradores podem acessar módulos do sistema.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    // Busca módulos desabilitados
    const { data, error: queryError } = await client
      .from('system_module_settings')
      .select('module_key, enabled, reason')
      .limit(200);

    if (queryError) {
      // Tabela pode não existir
      if (String(queryError.code || '').includes('42P01')) {
        return json(
          { table_missing: true, catalog: MODULOS_CATALOGO, disabled: [], rows: [] },
          { headers: DYNAMIC_READ_HEADERS }
        );
      }
      throw queryError;
    }

    const rows = (data || []) as SystemModuleSettingsRow[];
    const disabled = rows.reduce((acc: string[], row) => {
      const moduleKey = String(row.module_key || '').trim();
      if (row.enabled === false && moduleKey) acc.push(moduleKey);
      return acc;
    }, []);

    return json(
      {
        table_missing: false,
        catalog: MODULOS_CATALOGO,
        disabled,
        rows
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar módulos do sistema.');
  }
}

export async function handleAdminModulosSistemaPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_MODULOS_SISTEMA_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      return json(
        { error: 'Somente administradores podem alterar módulos do sistema.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};
    const { module_key, enabled, reason } = body;

    if (!module_key)
      return json({ error: 'module_key obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });

    const payload = {
      module_key,
      enabled: enabled !== false,
      reason: String(reason || '').trim() || null
    };

    // Upsert direto — elimina a race condition do check-then-insert
    // (SELECT seguido de INSERT pode causar duplicate key se dois requests chegam ao mesmo tempo)
    const { error: upsertError } = await client
      .from('system_module_settings')
      .upsert(payload, { onConflict: 'module_key' });
    if (upsertError) throw upsertError;

    // Auditoria: lista completa de módulos desligados depois de salvar (formato do histórico).
    registrarLog(event, {
      userId: user.id,
      modulo: 'Admin',
      acao: 'modulos_globais_atualizados',
      detalhes: async () => {
        const { data } = await client
          .from('system_module_settings')
          .select('module_key')
          .eq('enabled', false);
        return {
          disabled_modules: ((data || []) as Array<{ module_key: string | null }>)
            .map((row) => String(row.module_key || ''))
            .filter(Boolean)
        };
      }
    });

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar módulo do sistema.');
  }
}
