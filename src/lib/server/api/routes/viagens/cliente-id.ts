// Migrado para Hono de src/routes/api/v1/viagens/cliente/[id]/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { normalizeViagemStatus } from '$lib/viagens/status';
import { syncViagensStatus } from '$lib/server/viagensStatus';
import { ensureClienteAccess } from '$lib/server/clientes';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import { chunkArray, dedupeById as dedupeRowsById, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

type ViagemClienteRow = {
  id: string | null;
  venda_id: string | null;
  orcamento_id: string | null;
  cliente_id: string | null;
  company_id: string | null;
  responsavel_user_id: string | null;
  origem: string | null;
  destino: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: string | null;
  observacoes: string | null;
  follow_up_text: string | null;
  follow_up_fechado: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  recibo_id: string | null;
};

type VendaIdRow = {
  id: string | null;
};

export async function handleViagensClienteIdGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['operacao_viagens', 'viagens', 'operacao'],
        1,
        'Sem acesso a Viagens.'
      );
    }

    const { params } = event;
    const clienteId = params.id;

    if (!clienteId) {
      return json({ success: false, error: 'ID do cliente é obrigatório' }, { status: 400 });
    }

    const { searchParams } = event.url;
    const filters = await ensureClienteAccess(
      client,
      scope,
      clienteId,
      searchParams.get('empresa_id'),
      searchParams.get('vendedor_ids') || searchParams.get('vendedor_id'),
      1
    );
    const companyIds =
      filters.companyIds.length > 0
        ? filters.companyIds
        : resolveScopedCompanyIds(scope, searchParams.get('empresa_id'));

    const cacheKey = buildReadModelCacheKey('viagens:cliente', {
      clienteId,
      companyIds,
      vendedorIds: filters.vendedorIds,
      userId: user.id,
      isAdmin: scope.isAdmin
    });
    const payload = await getCachedReadModel({
      key: cacheKey,
      tags: [
        READ_MODEL_TAGS.trips,
        READ_MODEL_TAGS.clients,
        READ_MODEL_TAGS.sales,
        ...scopeCacheTags({
          companyIds,
          vendedorIds: filters.vendedorIds,
          userId: user.id
        })
      ],
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        // Busca viagens do cliente específico
        const fetchViagens = async (companyBatch?: string[]) => {
          let query = client
            .from('viagens')
            .select(
              `
        id, 
        venda_id, 
        orcamento_id, 
        cliente_id, 
        company_id, 
        responsavel_user_id, 
        origem, 
        destino, 
        data_inicio, 
        data_fim, 
        status, 
        observacoes, 
        follow_up_text,
        follow_up_fechado,
        created_at, 
        updated_at,
        recibo_id
      `
            )
            .eq('cliente_id', clienteId)
            .order('data_inicio', { ascending: false })
            .limit(100);

          if (companyBatch && companyBatch.length > 0) {
            query = query.in('company_id', companyBatch);
          }

          const { data, error } = await query;

          if (error) {
            throw error;
          }

          return (data || []) as ViagemClienteRow[];
        };

        let data: ViagemClienteRow[] = [];
        if (companyIds.length > QUERY_IN_BATCH_SIZE) {
          for (const batch of chunkArray(companyIds)) {
            data.push(...(await fetchViagens(batch)));
          }
          data = dedupeRowsById(data).sort((a, b) =>
            String(b?.data_inicio || '').localeCompare(String(a?.data_inicio || ''))
          );
        } else {
          data = await fetchViagens(companyIds.length > 0 ? companyIds : undefined);
        }

        let scopedRows = data || [];
        if (filters.vendedorIds.length > 0) {
          const vendedorIdSet = new Set(filters.vendedorIds);
          const vendaIds = Array.from(
            new Set(scopedRows.map((row) => String(row?.venda_id || '').trim()).filter(Boolean))
          );
          let vendaIdsPermitidas = new Set<string>();

          if (vendaIds.length > 0) {
            const vendasRows: VendaIdRow[] = [];
            for (const vendaBatch of chunkArray(vendaIds)) {
              for (const vendedorBatch of chunkArray(filters.vendedorIds)) {
                const { data: batchRows, error: vendasError } = await client
                  .from('vendas')
                  .select('id')
                  .in('id', vendaBatch)
                  .in('vendedor_id', vendedorBatch);
                if (vendasError) throw vendasError;
                vendasRows.push(...(batchRows || []));
              }
            }
            vendaIdsPermitidas = new Set(
              (vendasRows || []).map((row) => String(row?.id || '').trim()).filter(Boolean)
            );
          }

          scopedRows = scopedRows.filter((row) => {
            const responsavelId = String(row?.responsavel_user_id || '').trim();
            const vendaId = String(row?.venda_id || '').trim();
            return (
              (responsavelId && vendedorIdSet.has(responsavelId)) ||
              (vendaId && vendaIdsPermitidas.has(vendaId))
            );
          });
        }

        const resolvedStatuses = await syncViagensStatus(client, scopedRows);

        // Busca dados do cliente
        const { data: clienteData } = await client
          .from('clientes')
          .select('id, nome')
          .eq('id', clienteId)
          .single();

        const items = scopedRows.map((row) => ({
          id: row.id,
          venda_id: row.venda_id,
          orcamento_id: row.orcamento_id,
          cliente_id: row.cliente_id,
          cliente_nome: clienteData?.nome || 'Cliente não encontrado',
          origem: row.origem || '',
          destino: row.destino || 'Destino não informado',
          data_inicio: row.data_inicio,
          data_fim: row.data_fim,
          status: resolvedStatuses.get(String(row.id || '')) || normalizeViagemStatus(row.status),
          observacoes: row.observacoes || '',
          follow_up_text: row.follow_up_text || '',
          follow_up_fechado: row.follow_up_fechado || false,
          recibo_id: row.recibo_id,
          created_at: row.created_at
        }));

        return { success: true, items, total: items.length };
      }
    });

    return json(payload, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    logServerError('[viagens/cliente] falha ao carregar viagens do cliente', err);
    return toErrorResponse(err, 'Erro ao carregar viagens do cliente.');
  }
}
