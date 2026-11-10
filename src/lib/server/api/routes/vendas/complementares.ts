// Migrado para Hono de src/routes/api/v1/vendas/complementares/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler mudou). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  normalizeText,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveScopedVendedorIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { fetchSaleForScope } from '$lib/server/salesScope';
import { chunkArray, uniqueCleanStrings } from '$lib/utils/array';

const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

type ReceiptIdRow = {
  id?: string | null;
};

type ComplementaryLinkRow = {
  id?: string | null;
  venda_id?: string | null;
  recibo_id?: string | null;
};

type LinkedReceiptRow = {
  id?: string | null;
  venda_id?: string | null;
  numero_recibo?: string | null;
  valor_total?: number | null;
  produto_resolvido?: Array<{ nome?: string | null }> | null;
};

type LinkedSaleRow = {
  id?: string | null;
  cliente_id?: string | null;
  destino_id?: string | null;
  destino_cidade_id?: string | null;
  clientes?: Array<{ nome?: string | null }> | null;
  destinos?: Array<{ nome?: string | null }> | null;
  destino_cidade?: Array<{ nome?: string | null }> | null;
};

type PairReceiptRow = {
  id?: string | null;
  venda_id?: string | null;
};

type SearchReceiptRow = {
  id?: string | null;
  venda_id?: string | null;
  numero_recibo?: string | null;
  valor_total?: number | null;
  produto_resolvido?: Array<{ nome?: string | null }> | null;
  vendas?: Array<{
    id?: string | null;
    cliente_id?: string | null;
    vendedor_id?: string | null;
    company_id?: string | null;
    clientes?: Array<{ nome?: string | null }> | null;
    destinos?: Array<{ nome?: string | null }> | null;
    destino_cidade?: Array<{ nome?: string | null }> | null;
  }> | null;
};

type ComplementarySuggestion = {
  recibo_id: string;
  venda_id: string;
  numero_recibo: string | null;
  valor_total: number;
  produto_nome: string | null;
  cliente_nome: string;
  destino_nome: string;
  destino_cidade_nome: string;
  sale_receipt_ids: string[];
  resumo: ReturnType<typeof getResumo>;
};

function getResumo(
  recibo?: {
    numero_recibo?: string | null;
    valor_total?: number | null;
    produto_nome?: string | null;
  },
  venda?: {
    cliente_nome?: string | null;
    destino_nome?: string | null;
    destino_cidade_nome?: string | null;
  }
) {
  const numero = recibo?.numero_recibo ? `Recibo ${recibo.numero_recibo}` : 'Recibo';
  const cliente = venda?.cliente_nome || 'Cliente';
  const titulo = `${numero} - ${cliente}`.trim();
  const detalhes = [
    recibo?.produto_nome || '',
    venda?.destino_cidade_nome || venda?.destino_nome || '',
    typeof recibo?.valor_total === 'number' ? BRL_CURRENCY_FORMATTER.format(recibo.valor_total) : ''
  ]
    .filter(Boolean)
    .join(' - ');
  return { titulo, detalhes };
}

function firstNome(value?: Array<{ nome?: string | null }> | { nome?: string | null } | null) {
  if (Array.isArray(value)) return value[0]?.nome || '';
  return value?.nome || '';
}

function firstItem<T>(value?: T[] | T | null) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export async function handleVendasComplementaresGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster) {
      ensureModuloAccess(scope, ['vendas_consulta', 'vendas'], 1, 'Sem acesso a Vendas.');
    }

    const vendaId = String(event.url.searchParams.get('venda_id') || '').trim();
    const busca = normalizeText(String(event.url.searchParams.get('q') || '').trim());
    if (!isUuid(vendaId)) {
      return new Response('venda_id invalido.', { status: 400, headers: NO_STORE_HEADERS });
    }

    const companyIds = resolveScopedCompanyIds(
      scope,
      event.url.searchParams.get('company_id') || event.url.searchParams.get('empresa_id')
    );
    const vendedorIds = await resolveScopedVendedorIds(
      client,
      scope,
      event.url.searchParams.get('vendedor_ids') || event.url.searchParams.get('vendedor_id')
    );
    const shouldApplySellerScope = !scope.isGestor && !scope.isMaster && !scope.isFinanceiro;

    async function loadSearchReceipts() {
      const buildReceiptsQuery = (companyIdsFilter?: string[], vendedorIdsFilter?: string[]) => {
        let receiptsQuery = client
          .from('vendas_recibos')
          .select(
            `
            id,
            venda_id,
            numero_recibo,
            valor_total,
            produto_resolvido:produtos!produto_resolvido_id (nome),
            vendas!inner (
              id,
              cliente_id,
              vendedor_id,
              company_id,
              clientes (nome),
              destinos:produtos!destino_id (nome),
              destino_cidade:cidades!destino_cidade_id (nome)
            )
          `
          )
          .limit(400);

        if (companyIdsFilter && companyIdsFilter.length > 0)
          receiptsQuery = receiptsQuery.in('vendas.company_id', companyIdsFilter);
        if (shouldApplySellerScope && vendedorIdsFilter && vendedorIdsFilter.length > 0)
          receiptsQuery = receiptsQuery.in('vendas.vendedor_id', vendedorIdsFilter);
        return receiptsQuery;
      };

      const scopedReceiptsData: SearchReceiptRow[] = [];
      const companyBatches = companyIds.length > 0 ? chunkArray(companyIds) : [undefined];
      const vendedorBatches =
        shouldApplySellerScope && vendedorIds.length > 0 ? chunkArray(vendedorIds) : [undefined];
      for (const companyBatch of companyBatches) {
        for (const vendedorBatch of vendedorBatches) {
          const { data, error: scopedReceiptsError } = await buildReceiptsQuery(
            companyBatch,
            vendedorBatch
          );
          if (scopedReceiptsError) throw scopedReceiptsError;
          scopedReceiptsData.push(...(data || []));
        }
      }
      return scopedReceiptsData;
    }

    const currentSale = await fetchSaleForScope({
      client,
      scope,
      saleId: vendaId,
      companyIds,
      vendedorIds,
      extraSelect: 'cliente_id'
    });
    if (!currentSale) {
      return new Response('Venda nao encontrada.', { status: 404, headers: NO_STORE_HEADERS });
    }

    // Fase 3.7 (velocidade): consultas que não dependem uma da outra rodam juntas.
    // Antes eram até 7 idas ao banco em fila; agora são 3 rodadas (recibos + vínculos da venda →
    // recibos vinculados → vendas vinculadas + recibos do par + vínculos do par), e a busca de
    // sugestões corre ao lado. Mesmas consultas, mesmo resultado; os erros continuam sendo
    // lançados na mesma ordem de antes (contrato: complementares.contract.test.ts).
    const searchPromise =
      busca.length >= 2 ? loadSearchReceipts() : Promise.resolve([] as SearchReceiptRow[]);
    // Se algo anterior falhar, a busca é descartada sem gerar rejeição solta.
    searchPromise.then(undefined, () => undefined);

    const [currentReceiptsResponse, currentLinksResponse] = await Promise.all([
      client.from('vendas_recibos').select('id').eq('venda_id', vendaId),
      client
        .from('vendas_recibos_complementares')
        .select('id, venda_id, recibo_id')
        .eq('venda_id', vendaId)
    ]);
    const { data: currentReceiptsData, error: currentReceiptsError } = currentReceiptsResponse;
    if (currentReceiptsError) throw currentReceiptsError;

    const currentReceiptIds = ((currentReceiptsData || []) as ReceiptIdRow[])
      .map((row) => String(row?.id || '').trim())
      .filter(Boolean);

    const { data: currentLinksData, error: currentLinksError } = currentLinksResponse;
    if (currentLinksError && String(currentLinksError.code || '') !== '42P01')
      throw currentLinksError;

    const currentLinks: ComplementaryLinkRow[] = Array.isArray(currentLinksData)
      ? currentLinksData
      : [];
    const linkedReceiptIds = currentLinks
      .map((row) => String(row?.recibo_id || '').trim())
      .filter(Boolean);

    const linkedReceiptsData: LinkedReceiptRow[] = [];
    for (const batch of chunkArray(linkedReceiptIds)) {
      const { data, error: linkedReceiptsError } = await client
        .from('vendas_recibos')
        .select(
          `
          id,
          venda_id,
          numero_recibo,
          valor_total,
          produto_resolvido:produtos!produto_resolvido_id (nome)
        `
        )
        .in('id', batch);
      if (linkedReceiptsError) throw linkedReceiptsError;
      linkedReceiptsData.push(...(data || []));
    }

    const linkedSalesIds = uniqueCleanStrings(linkedReceiptsData.map((row) => row?.venda_id));
    const pairSaleIds = uniqueCleanStrings(linkedSalesIds);
    const pairReceiptSaleIds = [vendaId, ...pairSaleIds];

    const loadLinkedSales = async () => {
      const linkedSalesData: LinkedSaleRow[] = [];
      for (const batch of chunkArray(linkedSalesIds)) {
        const { data, error: linkedSalesError } = await client
          .from('vendas')
          .select(
            `
            id,
            cliente_id,
            destino_id,
            destino_cidade_id,
            clientes (nome),
            destinos:produtos!destino_id (nome),
            destino_cidade:cidades!destino_cidade_id (nome)
          `
          )
          .in('id', batch);
        if (linkedSalesError) throw linkedSalesError;
        linkedSalesData.push(...(data || []));
      }
      return linkedSalesData;
    };

    const loadPairReceipts = async () => {
      const pairReceiptsData: PairReceiptRow[] = [];
      for (const batch of chunkArray(pairReceiptSaleIds)) {
        const { data, error: pairReceiptsError } = await client
          .from('vendas_recibos')
          .select('id, venda_id')
          .in('venda_id', batch);
        if (pairReceiptsError) throw pairReceiptsError;
        pairReceiptsData.push(...(data || []));
      }
      return pairReceiptsData;
    };

    const loadAllPairLinks = async () => {
      const allPairLinksData: ComplementaryLinkRow[] = [];
      for (const batch of chunkArray(pairReceiptSaleIds)) {
        const { data, error: allPairLinksError } = await client
          .from('vendas_recibos_complementares')
          .select('id, venda_id, recibo_id')
          .in('venda_id', batch);
        if (allPairLinksError && String(allPairLinksError.code || '') !== '42P01')
          throw allPairLinksError;
        allPairLinksData.push(...(data || []));
      }
      return allPairLinksData;
    };

    const [linkedSalesResult, pairReceiptsResult, allPairLinksResult] = await Promise.allSettled([
      loadLinkedSales(),
      loadPairReceipts(),
      loadAllPairLinks()
    ]);
    if (linkedSalesResult.status === 'rejected') throw linkedSalesResult.reason;
    if (pairReceiptsResult.status === 'rejected') throw pairReceiptsResult.reason;
    if (allPairLinksResult.status === 'rejected') throw allPairLinksResult.reason;
    const linkedSalesData = linkedSalesResult.value;
    const pairReceiptsData = pairReceiptsResult.value;
    const allPairLinksData = allPairLinksResult.value;

    const linkedReceiptsById = Object.fromEntries(
      linkedReceiptsData.map((row) => [
        String(row?.id || ''),
        {
          id: String(row?.id || ''),
          venda_id: String(row?.venda_id || ''),
          numero_recibo: row?.numero_recibo || null,
          valor_total: Number(row?.valor_total || 0),
          produto_nome: firstNome(row?.produto_resolvido) || null
        }
      ])
    );
    const linkedSalesById = Object.fromEntries(
      linkedSalesData.map((row) => [
        String(row?.id || ''),
        {
          id: String(row?.id || ''),
          cliente_nome: firstNome(row?.clientes),
          destino_nome: firstNome(row?.destinos),
          destino_cidade_nome: firstNome(row?.destino_cidade)
        }
      ])
    );

    const receiptsBySale = new Map<string, string[]>();
    for (const row of pairReceiptsData) {
      const saleRef = String(row?.venda_id || '').trim();
      const receiptRef = String(row?.id || '').trim();
      if (!saleRef || !receiptRef) continue;
      const current = receiptsBySale.get(saleRef) || [];
      current.push(receiptRef);
      receiptsBySale.set(saleRef, current);
    }

    const allPairLinks: ComplementaryLinkRow[] = Array.isArray(allPairLinksData)
      ? allPairLinksData
      : [];

    const current = currentLinks.map((link) => {
      const recibo = linkedReceiptsById[String(link?.recibo_id || '')];
      const linkedSaleId = String(recibo?.venda_id || '').trim();
      const sale = linkedSalesById[linkedSaleId];
      const currentSaleReceipts = new Set(receiptsBySale.get(vendaId) || currentReceiptIds);
      const linkedSaleReceipts = new Set(receiptsBySale.get(linkedSaleId) || []);
      const relatedIds = allPairLinks
        .filter((row) => {
          const rowSaleId = String(row?.venda_id || '').trim();
          const rowReceiptId = String(row?.recibo_id || '').trim();
          if (!rowSaleId || !rowReceiptId) return false;
          if (rowSaleId === vendaId && linkedSaleReceipts.has(rowReceiptId)) return true;
          if (rowSaleId === linkedSaleId && currentSaleReceipts.has(rowReceiptId)) return true;
          return false;
        })
        .map((row) => String(row?.id || '').trim())
        .filter(Boolean);

      return {
        id: String(link?.id || ''),
        venda_id: String(link?.venda_id || ''),
        recibo_id: String(link?.recibo_id || ''),
        linked_venda_id: linkedSaleId,
        related_ids: uniqueCleanStrings(relatedIds),
        resumo: getResumo(recibo, sale)
      };
    });

    let suggestions: ComplementarySuggestion[] = [];
    if (busca.length >= 2) {
      const scopedReceiptsData: SearchReceiptRow[] = await searchPromise;

      const currentLinkedIds = new Set<string>();
      for (const item of current) {
        currentLinkedIds.add(item.recibo_id);
      }

      suggestions = scopedReceiptsData
        .map((row) => {
          const linkedSale = firstItem(row?.vendas);
          const linkedSaleId = String(linkedSale?.id || '').trim();
          const reciboId = String(row?.id || '').trim();
          return {
            recibo_id: reciboId,
            venda_id: linkedSaleId,
            numero_recibo: row?.numero_recibo || null,
            valor_total: Number(row?.valor_total || 0),
            produto_nome: firstNome(row?.produto_resolvido) || null,
            cliente_nome: firstNome(linkedSale?.clientes),
            destino_nome: firstNome(linkedSale?.destinos),
            destino_cidade_nome: firstNome(linkedSale?.destino_cidade),
            sale_receipt_ids: receiptsBySale.get(linkedSaleId) || [],
            resumo: getResumo(
              {
                numero_recibo: row?.numero_recibo || null,
                valor_total: Number(row?.valor_total || 0),
                produto_nome: firstNome(row?.produto_resolvido) || null
              },
              {
                cliente_nome: firstNome(linkedSale?.clientes),
                destino_nome: firstNome(linkedSale?.destinos),
                destino_cidade_nome: firstNome(linkedSale?.destino_cidade)
              }
            )
          };
        })
        .filter((item) => item.venda_id && item.venda_id !== vendaId)
        .filter((item) => !currentLinkedIds.has(item.recibo_id))
        .filter((item) => {
          const searchText = normalizeText(
            [
              item.numero_recibo,
              item.produto_nome,
              item.cliente_nome,
              item.destino_nome,
              item.destino_cidade_nome,
              item.recibo_id,
              item.venda_id
            ]
              .filter(Boolean)
              .join(' ')
          );
          return searchText.includes(busca);
        })
        .slice(0, 10);
    }

    return json(
      {
        current_receipt_ids: currentReceiptIds,
        current,
        suggestions
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar recibos complementares.');
  }
}
