// Migrado para Hono de src/routes/api/v1/parametros/sistema/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { registrarLog } from '$lib/server/auditLog';
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import {
  createDefaultConciliacaoBandRules,
  normalizeConciliacaoTipo,
  sanitizeConciliacaoBandRules,
  sanitizeConciliacaoTiers,
  type ParametrosConciliacaoShape
} from '$lib/utils/conciliacao';
import { invalidateSalesReadModels } from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_PARAMETROS_SISTEMA_BODY_BYTES = 256 * 1024;
const TEXT_NO_STORE_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  ...NO_STORE_HEADERS
};

const DEFAULT_PARAMS = {
  company_id: null,
  owner_user_id: null,
  owner_user_nome: null,
  usar_taxas_na_meta: false,
  foco_valor: 'bruto',
  modo_corporativo: false,
  politica_cancelamento: 'cancelar_venda',
  foco_faturamento: 'bruto',
  conciliacao_sobrepoe_vendas: false,
  conciliacao_regra_ativa: false,
  conciliacao_tipo: 'GERAL',
  conciliacao_meta_nao_atingida: null,
  conciliacao_meta_atingida: null,
  conciliacao_super_meta: null,
  conciliacao_tiers: [],
  conciliacao_faixas_loja: createDefaultConciliacaoBandRules({
    usar_taxas_na_meta: false,
    conciliacao_regra_ativa: false,
    conciliacao_tipo: 'GERAL',
    conciliacao_meta_nao_atingida: null,
    conciliacao_meta_atingida: null,
    conciliacao_super_meta: null,
    conciliacao_tiers: []
  }),
  mfa_obrigatorio: false,
  exportacao_pdf: false,
  exportacao_excel: false
};

const PARAMETROS_COMISSAO_COLUMNS = [
  'id',
  'company_id',
  'owner_user_id',
  'usar_taxas_na_meta',
  'foco_valor',
  'modo_corporativo',
  'politica_cancelamento',
  'foco_faturamento',
  'conciliacao_sobrepoe_vendas',
  'conciliacao_regra_ativa',
  'conciliacao_tipo',
  'conciliacao_meta_nao_atingida',
  'conciliacao_meta_atingida',
  'conciliacao_super_meta',
  'conciliacao_tiers',
  'conciliacao_faixas_loja',
  'mfa_obrigatorio',
  'exportacao_pdf',
  'exportacao_excel',
  'created_at',
  'updated_at'
];

type UserParamRow = {
  company_id?: unknown;
  nome_completo?: unknown;
};

type ParametrosComissaoRow = {
  id?: unknown;
  company_id?: unknown;
  owner_user_id?: unknown;
  usar_taxas_na_meta?: unknown;
  foco_valor?: unknown;
  modo_corporativo?: unknown;
  politica_cancelamento?: unknown;
  foco_faturamento?: unknown;
  conciliacao_sobrepoe_vendas?: unknown;
  conciliacao_regra_ativa?: unknown;
  conciliacao_tipo?: unknown;
  conciliacao_meta_nao_atingida?: unknown;
  conciliacao_meta_atingida?: unknown;
  conciliacao_super_meta?: unknown;
  conciliacao_tiers?: unknown;
  conciliacao_faixas_loja?: unknown;
  mfa_obrigatorio?: unknown;
  exportacao_pdf?: unknown;
  exportacao_excel?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

type ParametrosSistemaBody = ParametrosComissaoRow & {
  readonly?: unknown;
};

function readErrorField(error: unknown, field: string) {
  return error && typeof error === 'object' ? (error as Record<string, unknown>)[field] : undefined;
}

function isMissingColumn(error: unknown) {
  const message = String(readErrorField(error, 'message') || '');
  const match =
    message.match(/column ["']?([a-zA-Z0-9_]+)["']? does not exist/i) ||
    message.match(/Could not find the ['"]([a-zA-Z0-9_]+)['"] column/i);
  return match?.[1] || null;
}

async function selectParametrosComissao(
  client: ReturnType<typeof getAdminClient>,
  companyId: string | null
) {
  let columns = [...PARAMETROS_COMISSAO_COLUMNS];

  for (let attempt = 0; attempt <= PARAMETROS_COMISSAO_COLUMNS.length; attempt += 1) {
    const result = await client
      .from('parametros_comissao')
      .select(columns.join(', '))
      .eq('company_id', companyId)
      .maybeSingle();

    const missingColumn = isMissingColumn(result.error);
    if (missingColumn && columns.includes(missingColumn)) {
      columns = columns.filter((column) => column !== missingColumn);
      continue;
    }

    return result;
  }

  return client
    .from('parametros_comissao')
    .select('id, company_id, owner_user_id, created_at, updated_at')
    .eq('company_id', companyId)
    .maybeSingle();
}

async function upsertWithFallback(
  client: ReturnType<typeof getAdminClient>,
  payload: Record<string, unknown>
) {
  const currentPayload = { ...payload };
  const removableKeys = new Set([
    'conciliacao_sobrepoe_vendas',
    'conciliacao_regra_ativa',
    'conciliacao_tipo',
    'conciliacao_meta_nao_atingida',
    'conciliacao_meta_atingida',
    'conciliacao_super_meta',
    'conciliacao_tiers',
    'conciliacao_faixas_loja',
    'mfa_obrigatorio',
    'exportacao_pdf',
    'exportacao_excel',
    'modo_corporativo',
    'politica_cancelamento',
    'foco_faturamento'
  ]);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await client
      .from('parametros_comissao')
      .upsert(currentPayload, { onConflict: 'company_id' })
      .select('id')
      .single();

    if (!response.error) return response.data;

    const missingColumn = isMissingColumn(response.error);
    if (!missingColumn || !removableKeys.has(missingColumn) || !(missingColumn in currentPayload)) {
      throw response.error;
    }

    delete currentPayload[missingColumn];
  }

  throw new Error('Nao foi possivel salvar parametros com fallback de schema.');
}

function canAccessParametros(scope: Awaited<ReturnType<typeof resolveUserScope>>) {
  return (
    scope.isAdmin ||
    Boolean(scope.permissoes.parametros) ||
    Boolean(scope.permissoes.admin) ||
    Boolean(scope.permissoes.admin_financeiro)
  );
}

export async function handleParametrosSistemaGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!canAccessParametros(scope)) {
      return new Response('Sem acesso aos parametros do sistema.', {
        status: 403,
        headers: TEXT_NO_STORE_HEADERS
      });
    }

    const { data: userRow, error: userError } = await client
      .from('users')
      .select('company_id, nome_completo')
      .eq('id', user.id)
      .maybeSingle();

    if (userError) throw userError;

    const currentUser = userRow as UserParamRow | null;
    const companyId = String(currentUser?.company_id || '').trim() || null;
    const ownerNome = String(currentUser?.nome_completo || '').trim() || null;

    const { data, error: queryError } = await selectParametrosComissao(client, companyId);

    if (queryError) throw queryError;

    const paramsRow = data as ParametrosComissaoRow | null;
    const ownerUserId = String(paramsRow?.owner_user_id || '').trim();
    let ownerUserNome = ownerNome;

    if (ownerUserId) {
      const { data: ownerRow } = await client
        .from('users')
        .select('nome_completo')
        .eq('id', ownerUserId)
        .maybeSingle();
      const owner = ownerRow as UserParamRow | null;
      ownerUserNome = String(owner?.nome_completo || ownerUserNome || '').trim() || ownerUserNome;
    }

    if (!paramsRow) {
      return json(
        {
          params: {
            ...DEFAULT_PARAMS,
            company_id: companyId,
            owner_user_id: user.id,
            owner_user_nome: ownerNome
          },
          ultima_atualizacao: null,
          origem: 'default',
          owner_nome: ownerNome
        },
        { headers: DYNAMIC_READ_HEADERS }
      );
    }

    const conciliacaoContext: ParametrosConciliacaoShape = {
      usar_taxas_na_meta: Boolean(paramsRow.usar_taxas_na_meta),
      foco_valor: String(paramsRow.foco_valor || 'bruto') === 'liquido' ? 'liquido' : 'bruto',
      foco_faturamento:
        String(paramsRow.foco_faturamento || 'bruto') === 'liquido' ? 'liquido' : 'bruto',
      conciliacao_sobrepoe_vendas: Boolean(paramsRow.conciliacao_sobrepoe_vendas),
      conciliacao_regra_ativa: Boolean(paramsRow.conciliacao_regra_ativa),
      conciliacao_tipo: normalizeConciliacaoTipo(String(paramsRow.conciliacao_tipo || '')),
      conciliacao_meta_nao_atingida:
        paramsRow.conciliacao_meta_nao_atingida != null
          ? Number(paramsRow.conciliacao_meta_nao_atingida)
          : null,
      conciliacao_meta_atingida:
        paramsRow.conciliacao_meta_atingida != null
          ? Number(paramsRow.conciliacao_meta_atingida)
          : null,
      conciliacao_super_meta:
        paramsRow.conciliacao_super_meta != null ? Number(paramsRow.conciliacao_super_meta) : null,
      conciliacao_tiers: sanitizeConciliacaoTiers(paramsRow.conciliacao_tiers)
    };

    const normalizedParams = {
      id: paramsRow.id || null,
      company_id: companyId,
      owner_user_id: ownerUserId || user.id,
      owner_user_nome: ownerUserNome,
      usar_taxas_na_meta: conciliacaoContext.usar_taxas_na_meta,
      foco_valor: conciliacaoContext.foco_valor,
      modo_corporativo: Boolean(paramsRow.modo_corporativo),
      politica_cancelamento:
        String(paramsRow.politica_cancelamento || 'cancelar_venda') === 'estornar_recibos'
          ? 'estornar_recibos'
          : 'cancelar_venda',
      foco_faturamento: conciliacaoContext.foco_faturamento,
      conciliacao_sobrepoe_vendas: conciliacaoContext.conciliacao_sobrepoe_vendas,
      conciliacao_regra_ativa: conciliacaoContext.conciliacao_regra_ativa,
      conciliacao_tipo: conciliacaoContext.conciliacao_tipo,
      conciliacao_meta_nao_atingida: conciliacaoContext.conciliacao_meta_nao_atingida,
      conciliacao_meta_atingida: conciliacaoContext.conciliacao_meta_atingida,
      conciliacao_super_meta: conciliacaoContext.conciliacao_super_meta,
      conciliacao_tiers: conciliacaoContext.conciliacao_tiers,
      mfa_obrigatorio: Boolean(paramsRow.mfa_obrigatorio),
      exportacao_pdf: Boolean(paramsRow.exportacao_pdf),
      exportacao_excel: Boolean(paramsRow.exportacao_excel)
    };

    return json(
      {
        params: {
          ...normalizedParams,
          conciliacao_faixas_loja: sanitizeConciliacaoBandRules(
            paramsRow.conciliacao_faixas_loja,
            conciliacaoContext
          )
        },
        ultima_atualizacao: paramsRow.updated_at || paramsRow.created_at || null,
        origem: 'banco',
        owner_nome: ownerUserNome
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar parametros do sistema.');
  }
}

export async function handleParametrosSistemaPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_PARAMETROS_SISTEMA_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as ParametrosSistemaBody)
        : {};

    if (!canAccessParametros(scope) || (!scope.isAdmin && body.readonly === true)) {
      return new Response('Sem permissao para editar parametros do sistema.', {
        status: 403,
        headers: TEXT_NO_STORE_HEADERS
      });
    }

    const { data: userRow, error: userError } = await client
      .from('users')
      .select('company_id, nome_completo')
      .eq('id', user.id)
      .maybeSingle();

    if (userError) throw userError;

    const currentUser = userRow as UserParamRow | null;
    const companyId = String(currentUser?.company_id || '').trim() || null;
    const ownerNome = String(currentUser?.nome_completo || '').trim() || null;

    const normalizedBody: ParametrosConciliacaoShape = {
      usar_taxas_na_meta: Boolean(body.usar_taxas_na_meta),
      foco_valor: String(body.foco_valor || 'bruto') === 'liquido' ? 'liquido' : 'bruto',
      foco_faturamento:
        String(body.foco_faturamento || 'bruto') === 'liquido' ? 'liquido' : 'bruto',
      conciliacao_sobrepoe_vendas: Boolean(body.conciliacao_sobrepoe_vendas),
      conciliacao_regra_ativa: Boolean(body.conciliacao_regra_ativa),
      conciliacao_tipo: normalizeConciliacaoTipo(String(body.conciliacao_tipo || '')),
      conciliacao_meta_nao_atingida:
        body.conciliacao_meta_nao_atingida === '' || body.conciliacao_meta_nao_atingida == null
          ? null
          : Number(body.conciliacao_meta_nao_atingida),
      conciliacao_meta_atingida:
        body.conciliacao_meta_atingida === '' || body.conciliacao_meta_atingida == null
          ? null
          : Number(body.conciliacao_meta_atingida),
      conciliacao_super_meta:
        body.conciliacao_super_meta === '' || body.conciliacao_super_meta == null
          ? null
          : Number(body.conciliacao_super_meta),
      conciliacao_tiers: sanitizeConciliacaoTiers(body.conciliacao_tiers),
      mfa_obrigatorio: Boolean(body.mfa_obrigatorio),
      exportacao_pdf: Boolean(body.exportacao_pdf),
      exportacao_excel: Boolean(body.exportacao_excel)
    };

    const payload = {
      company_id: companyId,
      owner_user_id: user.id,
      ...normalizedBody,
      modo_corporativo: Boolean(body.modo_corporativo),
      politica_cancelamento:
        String(body.politica_cancelamento || 'cancelar_venda') === 'estornar_recibos'
          ? 'estornar_recibos'
          : 'cancelar_venda',
      conciliacao_faixas_loja: sanitizeConciliacaoBandRules(
        body.conciliacao_faixas_loja,
        normalizedBody
      ),
      updated_at: new Date().toISOString()
    };

    const result = await upsertWithFallback(client, payload);
    {
      // Mesmo formato do histórico: o payload salvo, sem updated_at.
      const { updated_at: _updatedAt, ...detalhes } = payload;
      registrarLog(event, {
        userId: user.id,
        modulo: 'Parametros',
        acao: 'parametros_sistema_salvos',
        detalhes
      });
    }
    invalidateSalesReadModels({
      companyIds: companyId ? [companyId] : [],
      userId: user.id
    });

    return json(
      {
        id: result?.id || null,
        owner_nome: ownerNome
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar parametros do sistema.');
  }
}
