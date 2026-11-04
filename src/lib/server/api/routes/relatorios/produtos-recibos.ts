// Migrado para Hono de src/routes/api/v1/relatorios/produtos-recibos/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveScopedVendedorIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import {
  fetchSalesReportRows,
  getReceiptProductDescriptor,
  getVendaStatus
} from '$lib/server/relatorios';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';

function parseUuidList(raw?: string | null) {
  return String(raw || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    );
}

export async function handleRelatoriosProdutosRecibosGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['relatorios_produtos', 'relatorios', 'produtos', 'vendas'],
        1,
        'Sem acesso a Relatorios.'
      );
    }

    const inicio = String(event.url.searchParams.get('inicio') || '').trim();
    const fim = String(event.url.searchParams.get('fim') || '').trim();
    const statusFilter = String(event.url.searchParams.get('status') || '')
      .trim()
      .toLowerCase();
    const companyIds = resolveScopedCompanyIds(scope, event.url.searchParams.get('company_id'));
    const vendedorIds = await resolveScopedVendedorIds(
      client,
      scope,
      event.url.searchParams.get('vendedor_ids')
    );
    const tipoProdutoIds = new Set(parseUuidList(event.url.searchParams.get('tipo_produto_ids')));
    const tipoProdutoIdsList = Array.from(tipoProdutoIds).sort();

    const payload = await getCachedReadModel({
      key: buildReadModelCacheKey('relatorios:produtos-recibos', {
        userId: user.id,
        inicio,
        fim,
        statusFilter,
        companyIds,
        vendedorIds,
        tipoProdutoIds: tipoProdutoIdsList
      }),
      tags: [
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.catalog,
        ...scopeCacheTags({ companyIds, vendedorIds, userId: user.id })
      ],
      ttlMs: 300_000,
      staleTtlMs: 1_800_000,
      loader: async () => {
        const rows = await fetchSalesReportRows(client, {
          dataInicio: inicio || null,
          dataFim: fim || null,
          companyIds,
          vendedorIds,
          selectMode: 'basic'
        });

        return rows
          .map((row) => {
            const status = getVendaStatus(row);
            const recibos = (Array.isArray(row.recibos) ? row.recibos : [])
              .filter((recibo) => {
                if (tipoProdutoIds.size === 0) return true;
                const tipoId = String(recibo?.tipo_produtos?.id || '').trim();
                return tipoId ? tipoProdutoIds.has(tipoId) : false;
              })
              .map((recibo) => ({
                id: recibo?.id || null,
                numero_recibo: null,
                produto_id: recibo?.tipo_produtos?.id || null,
                produto_resolvido_id: recibo?.produto_resolvido?.id || null,
                data_venda: row.data_venda,
                destino_cidade_id: recibo?.destino_cidade?.id || row.destino_cidade?.id || null,
                valor_total: Number(recibo?.valor_total || 0),
                valor_taxas: Number(recibo?.valor_taxas || 0),
                valor_du: Number(recibo?.valor_du || 0),
                produtos: recibo?.tipo_produtos || null,
                produto_resolvido: recibo?.produto_resolvido || null
              }));

            return {
              id: row.id,
              vendedor_id: row.vendedor_id,
              cliente_id: row.cliente_id,
              destino_id: row.destinos?.id || null,
              produto_id: null,
              destino_cidade_id: row.destino_cidade?.id || null,
              data_venda: row.data_venda,
              data_embarque: row.data_embarque,
              valor_total: Number(row.valor_total || 0),
              status,
              destino_cidade: row.destino_cidade || null,
              destinos: row.destinos || null,
              vendas_recibos:
                recibos.length > 0
                  ? recibos
                  : [
                      {
                        id: null,
                        numero_recibo: null,
                        produto_id: null,
                        produto_resolvido_id: null,
                        data_venda: row.data_venda,
                        valor_total: Number(row.valor_total || 0),
                        valor_taxas: Number(row.valor_taxas || 0),
                        valor_du: 0,
                        produtos: null,
                        produto_resolvido: row.destinos
                          ? {
                              id: row.destinos.id || null,
                              nome: getReceiptProductDescriptor(null, row).produto,
                              tipo_produto: row.destinos.tipo_produto || null
                            }
                          : null
                      }
                    ]
            };
          })
          .filter((row) => !statusFilter || row.status === statusFilter)
          .filter(
            (row) =>
              tipoProdutoIds.size === 0 ||
              row.vendas_recibos.some((recibo: { produto_id?: string | null }) =>
                tipoProdutoIds.has(String(recibo?.produto_id || ''))
              )
          );
      }
    });

    return json(payload, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar relatorio de produtos por recibo.');
  }
}
