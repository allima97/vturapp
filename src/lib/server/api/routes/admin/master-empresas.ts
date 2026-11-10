// Migrado para Hono de src/routes/api/v1/admin/master-empresas/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { ensureCanManageCompanies, getAccessibleCompanyIds } from '$lib/server/admin';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { cleanStringSet, chunkArray, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

const MAX_MASTER_EMPRESAS_BODY_BYTES = 16 * 1024;

type MasterEmpresaRow = {
  id?: string | null;
  master_id?: string | null;
  company_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
};

export async function handleAdminMasterEmpresasGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    ensureCanManageCompanies(scope);

    const companyId = String(event.url.searchParams.get('company_id') || '').trim();
    const buildQuery = (companyIdsFilter: string[] | null) => {
      let query = client
        .from('master_empresas')
        .select('id, master_id, company_id, status, created_at, approved_at')
        .order('created_at', { ascending: false });

      if (companyId) query = query.eq('company_id', companyId);
      else if (companyIdsFilter && companyIdsFilter.length > 0)
        query = query.in('company_id', companyIdsFilter);

      return query;
    };

    const fetchRows = async () => {
      if (scope.isAdmin || companyId) {
        const { data, error: queryError } = await buildQuery(null);
        if (queryError) throw queryError;
        return data || [];
      }

      const accessible = getAccessibleCompanyIds(scope);
      if (!accessible.length) return [];
      if (accessible.length <= QUERY_IN_BATCH_SIZE) {
        const { data, error: queryError } = await buildQuery(accessible);
        if (queryError) throw queryError;
        return data || [];
      }

      const rows: MasterEmpresaRow[] = [];
      for (const batch of chunkArray(accessible)) {
        const { data, error: queryError } = await buildQuery(batch);
        if (queryError) throw queryError;
        rows.push(...((data || []) as MasterEmpresaRow[]));
      }

      return rows.sort((left, right) =>
        String(right?.created_at || '').localeCompare(String(left?.created_at || ''))
      );
    };

    return json({ items: await fetchRows() }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar vinculos master.');
  }
}

export async function handleAdminMasterEmpresasPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_MASTER_EMPRESAS_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};

    ensureCanManageCompanies(scope);

    const action = String(body.action || 'save')
      .trim()
      .toLowerCase();
    const id = String(body.id || '').trim();
    const masterId = String(body.master_id || '').trim();
    const companyId = String(body.company_id || '').trim();
    const status = String(body.status || 'approved').trim() || 'approved';
    const accessible = scope.isAdmin ? null : getAccessibleCompanyIds(scope);
    const accessibleSet = accessible ? cleanStringSet(accessible) : null;

    if (action === 'delete') {
      if (!id)
        return new Response('Vinculo nao informado.', { status: 400, headers: NO_STORE_HEADERS });

      // ✅ Verifica ownership antes de deletar
      if (!scope.isAdmin) {
        const { data: vinculo } = await client
          .from('master_empresas')
          .select('company_id')
          .eq('id', id)
          .maybeSingle();
        if (!vinculo || !accessibleSet?.has(String(vinculo.company_id || '').trim())) {
          return new Response('Vinculo fora do escopo.', {
            status: 403,
            headers: NO_STORE_HEADERS
          });
        }
      }

      const { error: deleteError } = await client.from('master_empresas').delete().eq('id', id);
      if (deleteError) throw deleteError;
      return json({ id, deleted: true }, { headers: NO_STORE_HEADERS });
    }

    if (action === 'update') {
      if (!id)
        return new Response('Vinculo nao informado.', { status: 400, headers: NO_STORE_HEADERS });

      // ✅ Verifica ownership antes de atualizar
      if (!scope.isAdmin) {
        const { data: vinculo } = await client
          .from('master_empresas')
          .select('company_id')
          .eq('id', id)
          .maybeSingle();
        if (!vinculo || !accessibleSet?.has(String(vinculo.company_id || '').trim())) {
          return new Response('Vinculo fora do escopo.', {
            status: 403,
            headers: NO_STORE_HEADERS
          });
        }
      }

      const { error: updateError } = await client
        .from('master_empresas')
        .update({
          status,
          approved_at: status === 'approved' ? new Date().toISOString() : null
        })
        .eq('id', id);
      if (updateError) throw updateError;
      return json({ id, updated: true }, { headers: NO_STORE_HEADERS });
    }

    // action === 'save' (insert)
    if (!masterId || !companyId) {
      return new Response('Master e empresa sao obrigatorios.', {
        status: 400,
        headers: NO_STORE_HEADERS
      });
    }

    if (!scope.isAdmin && !accessibleSet?.has(companyId)) {
      return new Response('Empresa fora do escopo permitido.', {
        status: 403,
        headers: NO_STORE_HEADERS
      });
    }

    const { error: insertError } = await client.from('master_empresas').insert({
      master_id: masterId,
      company_id: companyId,
      status,
      approved_at: status === 'approved' ? new Date().toISOString() : null
    });
    if (insertError) throw insertError;

    return json({ created: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar vinculo master.');
  }
}
