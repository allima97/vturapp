import { VTUR_LOGO_PATH } from "$lib/brand";
// Migrado para Hono de src/routes/api/v1/parametros/orcamentos-pdf/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { registrarLog } from '$lib/server/auditLog';
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateQuoteReadModels } from '$lib/server/readModelCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_PARAMETROS_ORCAMENTOS_PDF_BODY_BYTES = 128 * 1024;

const DEFAULT_FOOTER =
  'Preços em real (R$) convertido ao câmbio do dia sujeito a alteração e disponibilidade da tarifa.\n' +
  'Valor da criança válido somente quando acompanhada de dois adultos pagantes no mesmo apartamento.\n' +
  'Este orçamento é apenas uma tomada de preço.\n' +
  'Os serviços citados não estão reservados; a compra somente poderá ser confirmada após a confirmação dos fornecedores.\n' +
  'Este orçamento foi feito com base na menor tarifa para os serviços solicitados, podendo sofrer alteração devido à disponibilidade de lugares no ato da compra.';

export async function handleParametrosOrcamentosPdfGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['parametros_orcamentos', 'parametros'], 1, 'Sem acesso aos parâmetros de orçamento.');
    }

    const { data, error: queryError } = await client
      .from('quote_print_settings')
      .select('id, owner_user_id, company_id, imagem_complementar_url, imagem_complementar_path, consultor_nome, filial_nome, endereco_linha1, endereco_linha2, endereco_linha3, telefone, whatsapp, whatsapp_codigo_pais, email, rodape_texto')
      .eq('owner_user_id', user.id)
      .maybeSingle();

    if (queryError) throw queryError;

    const { data: userRow } = await client.from('users').select('nome_completo, email, company_id').eq('id', user.id).maybeSingle();

    return json({
      settings: {
        id: data?.id || null,
        owner_user_id: data?.owner_user_id || user.id,
        company_id: data?.company_id || userRow?.company_id || null,
        logo_url: VTUR_LOGO_PATH,
        logo_path: null,
        imagem_complementar_url: data?.imagem_complementar_url || null,
        imagem_complementar_path: data?.imagem_complementar_path || null,
        consultor_nome: data?.consultor_nome || userRow?.nome_completo || '',
        filial_nome: data?.filial_nome || '',
        endereco_linha1: data?.endereco_linha1 || '',
        endereco_linha2: data?.endereco_linha2 || '',
        endereco_linha3: data?.endereco_linha3 || '',
        telefone: data?.telefone || '',
        whatsapp: data?.whatsapp || '',
        whatsapp_codigo_pais: data?.whatsapp_codigo_pais || '',
        email: data?.email || userRow?.email || '',
        rodape_texto: data?.rodape_texto || DEFAULT_FOOTER
      }
    }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar parâmetros do orçamento.');
  }
}

export async function handleParametrosOrcamentosPdfPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_PARAMETROS_ORCAMENTOS_PDF_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['parametros_orcamentos', 'parametros'], 2, 'Sem permissão para salvar parâmetros de orçamento.');
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};
    const settings =
      body.settings && typeof body.settings === 'object'
        ? (body.settings as Record<string, unknown>)
        : {};

    const payload: Record<string, string | null> = {
      owner_user_id: user.id,
      company_id: scope.companyId,
      consultor_nome: String(settings?.consultor_nome || '').trim() || null,
      filial_nome: String(settings?.filial_nome || '').trim() || null,
      endereco_linha1: String(settings?.endereco_linha1 || '').trim() || null,
      endereco_linha2: String(settings?.endereco_linha2 || '').trim() || null,
      endereco_linha3: String(settings?.endereco_linha3 || '').trim() || null,
      telefone: String(settings?.telefone || '').trim() || null,
      whatsapp: String(settings?.whatsapp || '').trim() || null,
      whatsapp_codigo_pais: String(settings?.whatsapp_codigo_pais || '').trim() || null,
      email: String(settings?.email || '').trim() || null,
      rodape_texto: String(settings?.rodape_texto || DEFAULT_FOOTER).trim() || DEFAULT_FOOTER
    };

    // Inclui campos de imagem apenas quando presentes no body (para não sobrescrever com null)
    payload.logo_url = VTUR_LOGO_PATH;
    payload.logo_path = null;
    if ('imagem_complementar_url' in (settings || {})) payload.imagem_complementar_url = String(settings.imagem_complementar_url || '').trim() || null;
    if ('imagem_complementar_path' in (settings || {})) payload.imagem_complementar_path = String(settings.imagem_complementar_path || '').trim() || null;

    const { data: existing } = await client.from('quote_print_settings').select('id').eq('owner_user_id', user.id).maybeSingle();

    if (existing?.id) {
      const { error: updateError } = await client.from('quote_print_settings').update(payload).eq('id', existing.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await client.from('quote_print_settings').insert(payload);
      if (insertError) throw insertError;
    }
    {
      // Mesmo formato do histórico: os campos da configuração, sem dono e empresa.
      const { owner_user_id: _owner, company_id: _company, ...detalhes } = payload;
      registrarLog(event, { userId: user.id, modulo: 'Parametros', acao: 'quote_print_settings_salvos', detalhes });
    }

    invalidateQuoteReadModels({
      companyIds: scope.companyId ? [scope.companyId] : null,
      userId: user.id
    });
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar parâmetros do orçamento.');
  }
}
