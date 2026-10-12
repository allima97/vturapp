// Migrado para Hono de src/routes/api/v1/admin/system-modules/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { registrarLog } from '$lib/server/auditLog';
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_SYSTEM_MODULES_BODY_BYTES = 64 * 1024;

const SYSTEM_MODULES_CATALOG = [
  'dashboard', 'vendas', 'vendas_consulta', 'orcamentos',
  'clientes', 'consultoria_online', 'cadastros', 'cadastros_paises',
  'cadastros_estados', 'cadastros_cidades', 'cadastros_destinos',
  'cadastros_produtos', 'circuitos', 'cadastros_lote', 'cadastros_fornecedores',
  'relatorios', 'relatorios_vendas', 'relatorios_destinos', 'relatorios_produtos',
  'relatorios_clientes', 'parametros', 'parametros_tipo_produtos',
  'parametros_tipo_pacotes', 'parametros_metas', 'parametros_regras_comissao',
  'parametros_equipe', 'parametros_escalas', 'parametros_cambios',
  'parametros_orcamentos', 'parametros_formas_pagamento', 'operacao',
  'operacao_agenda', 'operacao_todo', 'operacao_chat', 'operacao_documentos_viagens',
  'operacao_vouchers', 'operacao_viagens', 'operacao_controle_sac',
  'operacao_campanhas', 'operacao_conciliacao', 'comissionamento',
  'agenda', 'todo', 'chat', 'vouchers', 'viagens', 'controle de sac',
  'campanhas', 'conciliacao', 'ranking de vendas',
  'relatoriovendas', 'relatoriodestinos', 'relatorioprodutos', 'relatorioclientes',
  'vendas', 'orcamentos', 'consultoria online', 'paises', 'subdivisoes',
  'cidades', 'destinos', 'produtos', 'produtoslote', 'fornecedores',
  'tipoprodutos', 'tipopacotes', 'metas', 'regrascomissao', 'equipe',
  'escalas', 'cambios', 'orcamentos (pdf)', 'formas de pagamento'
];

function normalizeModuleKey(key?: string | null) {
  const raw = String(key || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.replace(/\s+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

type SystemModuleSettingRow = {
  module_key: string;
  enabled?: boolean | null;
  reason?: string | null;
  updated_at?: string | null;
};

type DisabledModuleInput = {
  module_key?: string | null;
  reason?: string | null;
};

type SystemModulesBody = {
  disabled?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toDisabledModuleInput(value: unknown): DisabledModuleInput {
  if (!isRecord(value)) return {};
  return {
    module_key: typeof value.module_key === 'string' ? value.module_key : null,
    reason: typeof value.reason === 'string' ? value.reason : null
  };
}

export const handleAdminSystemModulesGet = async (event: RequestEvent) => {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      return json({ error: 'Sem acesso aos modulos do sistema.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const { data, error } = await client
      .from('system_module_settings')
      .select('module_key, enabled, reason, updated_at')
      .order('module_key', { ascending: true });

    if (error) {
      const code = String(error.code || '').toLowerCase();
      const message = String(error.message || '').toLowerCase();
      const tableMissing = code === '42P01' || message.includes('does not exist') || code === '42501';

      if (tableMissing) {
        logServerError('[admin/system-modules] tabela ausente ou sem permissao', error);
        return json({
          table_missing: true,
          disabled: [],
          rows: [],
          catalog: SYSTEM_MODULES_CATALOG,
          setup_error: 'Tabela system_module_settings nao disponivel.'
        }, { headers: DYNAMIC_READ_HEADERS });
      }
      throw error;
    }

    const rows = (data || []) as SystemModuleSettingRow[];
    const disabled = rows.reduce((acc: string[], row) => {
      if (!row.enabled) acc.push(row.module_key);
      return acc;
    }, []);

    return json(
      {
        table_missing: false,
        disabled,
        rows,
        catalog: SYSTEM_MODULES_CATALOG
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    logServerError('[admin/system-modules] falha ao carregar modulos globais', err);
    return toErrorResponse(err, 'Erro ao carregar modulos globais.');
  }
};

export const handleAdminSystemModulesPost = async (event: RequestEvent) => {
  try {
    const { request } = event;
    const originError = rejectCrossOriginRequest(request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(request, MAX_SYSTEM_MODULES_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      return json({ error: 'Sem acesso aos modulos do sistema.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as SystemModulesBody)
        : {};
    const disabledList = Array.isArray(body?.disabled) ? body.disabled : [];

    // Módulos que devem ficar DESABILITADOS (lista recebida do frontend)
    const disabledNormalized = Array.from(
      new Map(
        disabledList
          .map((item) => toDisabledModuleInput(item))
          .map((item) => ({
            module_key: normalizeModuleKey(item?.module_key),
            reason: String(item?.reason || '').trim() || null
          }))
          .filter((item) => Boolean(item.module_key))
          .map((item) => [item.module_key, item])
      ).values()
    ) as { module_key: string; reason: string | null }[];

    const disabledKeys = new Set<string>();
    for (const item of disabledNormalized) {
      disabledKeys.add(item.module_key);
    }

    // Módulos que devem ficar HABILITADOS (catálogo deduplificado, menos os desabilitados)
    // O SYSTEM_MODULES_CATALOG tem entradas duplicadas (ex: 'vendas', 'orcamentos' aparecem 2x)
    // — deduplificamos via Set para evitar duplicate key no upsert
    const enabledKeys = Array.from(
      new Set(
        SYSTEM_MODULES_CATALOG
          .map(normalizeModuleKey)
          .filter((k) => k && !disabledKeys.has(k))
      )
    );

    // Monta payload completo: desabilitados + habilitados (sem duplicatas)
    // Usa Map para garantir unicidade por module_key antes de enviar ao banco
    const payloadMap = new Map<string, { module_key: string; enabled: boolean; reason: string | null; updated_by: string }>();

    for (const item of disabledNormalized) {
      payloadMap.set(item.module_key, {
        module_key: item.module_key,
        enabled: false,
        reason: item.reason,
        updated_by: user.id
      });
    }
    for (const key of enabledKeys) {
      if (!payloadMap.has(key)) {
        payloadMap.set(key, {
          module_key: key,
          enabled: true,
          reason: null,
          updated_by: user.id
        });
      }
    }

    const upsertPayload = Array.from(payloadMap.values());

    // Usa upsert para evitar DELETE + INSERT que causa duplicate key
    const { error: upsertError } = await client
      .from('system_module_settings')
      .upsert(upsertPayload, { onConflict: 'module_key' });

    if (upsertError) {
      const code = String(upsertError.code || '').toLowerCase();
      const message = String(upsertError.message || '').toLowerCase();
      const tableMissing = code === '42p01' || message.includes('does not exist');

      if (tableMissing) {
        return json(
          { error: 'Tabela system_module_settings nao existe. Aplique a migration.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      throw upsertError;
    }

    registrarLog(event, {
      userId: user.id,
      modulo: 'Admin',
      acao: 'modulos_globais_atualizados',
      detalhes: { disabled_modules: disabledNormalized.map((item) => item.module_key) }
    });

    return json({ ok: true, disabled: disabledNormalized.map((item) => item.module_key) }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logServerError('[admin/system-modules] falha ao salvar modulos globais', err);
    return toErrorResponse(err, 'Erro ao salvar modulos globais.');
  }
};
