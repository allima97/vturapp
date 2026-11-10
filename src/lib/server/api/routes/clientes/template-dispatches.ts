// Migrado para Hono de src/routes/api/v1/clientes/template-dispatches/+server.ts — corpo IDÊNTICO ao original
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
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { cleanStringSet, chunkArray, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

const TEMPLATE_DISPATCH_SELECT =
  'id, user_id, company_id, cliente_id, template_id, canal, categoria, status, recipient_name, recipient_contact, subject, sent_at, sent_day, created_at, updated_at';
const MAX_TEMPLATE_DISPATCH_BODY_BYTES = 64 * 1024;

type TemplateDispatchRow = {
  id?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
};

type TemplateDispatchBody = Record<string, unknown>;

type ClienteCompanyRow = {
  company_id?: string | null;
};

export const handleClientesTemplateDispatchesGet = async (event: RequestEvent) => {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['parametros_crm', 'crm', 'clientes'],
        1,
        'Sem acesso a envios de templates.'
      );
    }

    const clienteId = String(event.url.searchParams.get('cliente_id') || '').trim();
    const limit = Math.min(100, Math.max(1, Number(event.url.searchParams.get('limit') || 50)));

    const buildQuery = (companyIdsFilter?: string[]) => {
      let query = client
        .from('cliente_template_dispatches')
        .select(TEMPLATE_DISPATCH_SELECT)
        .order('sent_at', { ascending: false })
        .limit(limit);

      if (!scope.isAdmin) {
        if (scope.isVendedor && !scope.isGestor && !scope.isMaster) {
          query = query.eq('user_id', user.id);
        } else if (companyIdsFilter && companyIdsFilter.length > 0) {
          query = query.in('company_id', companyIdsFilter);
        } else {
          query = query.eq('user_id', user.id);
        }
      }

      if (clienteId && isUuid(clienteId)) {
        query = query.eq('cliente_id', clienteId);
      }

      return query;
    };

    const fetchItems = async () => {
      if (scope.isAdmin || scope.companyIds.length <= QUERY_IN_BATCH_SIZE) {
        const { data, error } = await buildQuery(scope.companyIds);
        if (error) throw error;
        return data || [];
      }

      const rows: TemplateDispatchRow[] = [];
      for (const batch of chunkArray(scope.companyIds)) {
        const { data, error } = await buildQuery(batch);
        if (error) throw error;
        rows.push(...((data || []) as TemplateDispatchRow[]));
      }

      const rowsById = new Map<string, TemplateDispatchRow>();
      for (const row of rows) {
        rowsById.set(String(row?.id || ''), row);
      }

      return Array.from(rowsById.values())
        .sort((left, right) =>
          String(right?.sent_at || right?.created_at || '').localeCompare(
            String(left?.sent_at || left?.created_at || '')
          )
        )
        .slice(0, limit);
    };

    return json({ items: await fetchItems() }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar envios de templates.');
  }
};

export const handleClientesTemplateDispatchesPost = async (event: RequestEvent) => {
  try {
    const { request } = event;
    const originError = rejectCrossOriginRequest(request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(request, MAX_TEMPLATE_DISPATCH_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['parametros_crm', 'crm', 'clientes'],
        2,
        'Sem acesso a enviar templates.'
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as TemplateDispatchBody)
        : {};

    const clienteId = String(body.clienteId || body.cliente_id || '').trim();
    const templateId = String(body.templateId || body.template_id || '').trim();
    const canal = String(body.canal || 'email').toLowerCase();
    const recipientName = String(body.recipientName || body.nomeDestinatario || '').trim();
    const recipientContact = String(body.recipientContact || body.emailDestinatario || '').trim();
    const subject = String(body.subject || body.assunto || '').trim();
    const categoria = String(body.categoria || '').trim();

    if (!clienteId || !isUuid(clienteId)) {
      return json({ error: 'clienteId invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    if (!recipientContact) {
      return json(
        { error: 'recipientContact obrigatorio.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { data: cliente, error: clienteError } = await client
      .from('clientes')
      .select('id, company_id')
      .eq('id', clienteId)
      .maybeSingle();
    if (clienteError) throw clienteError;
    if (!cliente) {
      return json({ error: 'Cliente nao encontrado.' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    const clienteCompanyId = String((cliente as ClienteCompanyRow).company_id || '').trim();
    if (!scope.isAdmin) {
      const scopedCompanySet = cleanStringSet(scope.companyIds);
      const dentroDaEmpresa = clienteCompanyId && scopedCompanySet.has(clienteCompanyId);
      if (!dentroDaEmpresa) {
        return json(
          { error: 'Cliente fora do seu escopo.' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }

      if (scope.isVendedor && !scope.isGestor && !scope.isMaster) {
        const { data: vendaDoUsuario, error: vendaError } = await client
          .from('vendas')
          .select('id')
          .eq('cliente_id', clienteId)
          .eq('vendedor_id', user.id)
          .limit(1);
        if (vendaError) throw vendaError;
        if (!vendaDoUsuario || vendaDoUsuario.length === 0) {
          return json(
            { error: 'Cliente fora do seu escopo.' },
            { status: 403, headers: NO_STORE_HEADERS }
          );
        }
      }
    }

    const payload = {
      user_id: user.id,
      company_id: clienteCompanyId || scope.companyId || null,
      cliente_id: clienteId,
      template_id: templateId || null,
      canal,
      categoria: categoria || '',
      status: 'sent',
      recipient_name: recipientName || null,
      recipient_contact: recipientContact,
      subject: subject || null
    };

    const { data, error } = await client
      .from('cliente_template_dispatches')
      .insert(payload)
      .select(TEMPLATE_DISPATCH_SELECT)
      .single();

    if (error) throw error;

    return json({ success: true, dispatch: data }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao registrar envio de template.');
  }
};
