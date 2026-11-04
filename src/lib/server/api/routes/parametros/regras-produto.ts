// Migrado para Hono de src/routes/api/v1/parametros/regras-produto/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateCatalogReadModels } from '$lib/server/readModelCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_BODY_BYTES = 64 * 1024;

type RegraProdutoRow = {
  id: string;
  produto_id: string;
  rule_id: string | null;
  fix_meta_nao_atingida: number | null;
  fix_meta_atingida: number | null;
  fix_super_meta: number | null;
  tipo_produtos?: { nome: string | null } | null;
  commission_rule?: { nome: string | null } | null;
};

type RegraProdutoBody = {
  id?: unknown;
  produto_id?: unknown;
  rule_id?: unknown;
  fix_meta_nao_atingida?: unknown;
  fix_meta_atingida?: unknown;
  fix_super_meta?: unknown;
};

function readBody(value: unknown): RegraProdutoBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    id: body.id,
    produto_id: body.produto_id,
    rule_id: body.rule_id,
    fix_meta_nao_atingida: body.fix_meta_nao_atingida,
    fix_meta_atingida: body.fix_meta_atingida,
    fix_super_meta: body.fix_super_meta
  };
}

export async function handleParametrosRegrasProdutoGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['parametros'], 1, 'Sem acesso a Parâmetros.');
    }

    const { data, error } = await client
      .from('product_commission_rule')
      .select(
        'id, produto_id, rule_id, fix_meta_nao_atingida, fix_meta_atingida, fix_super_meta, tipo_produtos(nome), commission_rule(nome)'
      )
      .order('tipo_produtos(nome)', { ascending: true, nullsFirst: false })
      .limit(5000);

    if (error) throw error;

    return json(
      { items: (data || []) as unknown as RegraProdutoRow[] },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar regras por produto.');
  }
}

export async function handleParametrosRegrasProdutoPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['parametros'], 2, 'Sem permissão para salvar regras por produto.');
    }

    const body = readBody(bodyResult.data);
    const idRaw = String(body.id || '').trim();
    const produtoId = String(body.produto_id || '').trim();
    const ruleId = body.rule_id ? String(body.rule_id).trim() : null;

    if (!isUuid(produtoId)) {
      return json({ error: 'Produto inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (ruleId && !isUuid(ruleId)) {
      return json(
        { error: 'Regra de comissão inválida.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const payload = {
      produto_id: produtoId,
      rule_id: ruleId && isUuid(ruleId) ? ruleId : null,
      fix_meta_nao_atingida:
        body.fix_meta_nao_atingida != null ? Number(body.fix_meta_nao_atingida) : null,
      fix_meta_atingida: body.fix_meta_atingida != null ? Number(body.fix_meta_atingida) : null,
      fix_super_meta: body.fix_super_meta != null ? Number(body.fix_super_meta) : null
    };

    let result;
    if (idRaw && isUuid(idRaw)) {
      const { data: updated, error: updateError } = await client
        .from('product_commission_rule')
        .update(payload)
        .eq('id', idRaw)
        .select('id')
        .single();
      if (updateError) throw updateError;
      result = updated;
    } else {
      const { data: inserted, error: insertError } = await client
        .from('product_commission_rule')
        .insert(payload)
        .select('id')
        .single();
      if (insertError) throw insertError;
      result = inserted;
    }

    invalidateCatalogReadModels({ userId: user.id });
    return json({ ok: true, id: result?.id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar regra por produto.');
  }
}

export async function handleParametrosRegrasProdutoDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['parametros'],
        5,
        'Sem permissão para excluir regras por produto.'
      );
    }

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { error: deleteError } = await client
      .from('product_commission_rule')
      .delete()
      .eq('id', id);
    if (deleteError) throw deleteError;

    invalidateCatalogReadModels({ userId: user.id });
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir regra por produto.');
  }
}
