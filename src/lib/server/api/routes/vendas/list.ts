// Migrado para Hono de src/routes/api/v1/vendas/list/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler mudou). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  fetchMasterEmpresas,
  fetchRankingVendedoresByCompanyIds,
  getAdminClient,
  isUuid,
  logServerError,
  normalizeText,
  parseIntSafe,
  requireAuthenticatedUser,
  resolveAccessibleClientIds,
  resolveScopedCompanyIds,
  resolveScopedVendedorIds,
  resolveUserScope,
  sanitizePostgrestSearchTerm,
  toErrorResponse
} from '$lib/server/v1';
import { todayISODateLocal } from '$lib/date';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import {
  cleanStringSet,
  chunkArray,
  QUERY_IN_BATCH_SIZE,
  uniqueCleanStrings
} from '$lib/utils/array';

const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

type VendaStatus = 'confirmada' | 'pendente' | 'cancelada' | 'concluida';
type VendaTipo = 'pacote' | 'hotel' | 'passagem' | 'servico';

type VendaRow = {
  id: string;
  numero_venda: string | null;
  vendedor_id: string | null;
  cliente_id: string | null;
  company_id: string | null;
  data_venda: string | null;
  data_embarque: string | null;
  data_final: string | null;
  valor_total: number | null;
  valor_total_bruto: number | null;
  valor_taxas: number | null;
  cancelada: boolean | null;
  clientes?: { nome?: string | null; whatsapp?: string | null } | null;
  vendedor?: { nome_completo?: string | null } | null;
  destino_cidade?: { id?: string | null; nome?: string | null } | null;
  destinos?: { nome?: string | null; cidade_id?: string | null } | null;
  recibos?: Array<{
    id?: string | null;
    numero_recibo?: string | null;
    numero_reserva?: string | null;
    destino_cidade?: { id?: string | null; nome?: string | null } | null;
    tipo_pacote?: string | null;
    valor_total?: number | null;
    valor_taxas?: number | null;
    valor_du?: number | null;
    valor_rav?: number | null;
    data_inicio?: string | null;
    data_fim?: string | null;
    tipo_produtos?: { id?: string | null; nome?: string | null; tipo?: string | null } | null;
    produto_resolvido?: { id?: string | null; nome?: string | null } | null;
  }> | null;
};

type VendaItem = {
  id: string;
  codigo: string;
  cliente: string;
  cliente_id: string;
  vendedor_id: string;
  destino: string;
  destino_cidade: string;
  data_venda: string | null;
  data_embarque: string | null;
  data_final: string | null;
  valor_total: number;
  valor_total_bruto: number;
  valor_taxas: number;
  status: VendaStatus;
  vendedor: string;
  tipo: VendaTipo;
  recibos: string[];
  produtos: string[];
  conciliado: boolean | null;
  total_seguro: number;
  created_at?: string | null;
};

type CampoBusca = 'todos' | 'cliente' | 'vendedor' | 'destino' | 'produto' | 'recibo';

type IdRow = {
  id?: string | null;
};

type VendaIdRow = {
  venda_id?: string | null;
};

type VendaDestinoHydrationRow = {
  id?: string | null;
  destino_id?: string | null;
  destino_cidade_id?: string | null;
};

type ProdutoHydrationRow = {
  id?: string | null;
  nome?: string | null;
  cidade_id?: string | null;
};

type CidadeHydrationRow = {
  id?: string | null;
  nome?: string | null;
};

const MAX_SEARCH_CANDIDATES = 1000;
const VALID_CAMPO_BUSCA = new Set<CampoBusca>([
  'todos',
  'cliente',
  'vendedor',
  'destino',
  'produto',
  'recibo'
]);
const PUSHABLE_STATUS_FILTERS = new Set(['cancelada', 'concluida', 'confirmada', 'pendente']);

function getResultCount(result: unknown) {
  const value = (result as { count?: unknown } | null)?.count;
  return typeof value === 'number' ? value : null;
}

function dedupeVendaRows(rows: VendaRow[]) {
  const map = new Map<string, VendaRow>();
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (id && !map.has(id)) map.set(id, row);
  }
  return Array.from(map.values()).sort((left, right) =>
    String(right?.data_venda || '').localeCompare(String(left?.data_venda || ''))
  );
}

function deriveVendaStatus(row: VendaRow): VendaStatus {
  if (row.cancelada) return 'cancelada';
  const todayIso = todayISODateLocal();
  if (row.data_final && row.data_final < todayIso) return 'concluida';
  if (row.data_embarque && row.data_embarque >= todayIso) return 'confirmada';
  return 'pendente';
}

function deriveVendaTipo(row: VendaRow): VendaTipo {
  const firstReceipt = Array.isArray(row.recibos) ? row.recibos[0] : null;
  const reference = normalizeText(
    [
      firstReceipt?.tipo_pacote,
      firstReceipt?.tipo_produtos?.nome,
      firstReceipt?.tipo_produtos?.tipo
    ].join(' ')
  );

  if (reference.includes('seguro') || reference.includes('servico')) return 'servico';
  if (reference.includes('hotel') || reference.includes('resort')) return 'hotel';
  if (
    reference.includes('passagem') ||
    reference.includes('aereo') ||
    reference.includes('fretamento') ||
    reference.includes('transporte')
  )
    return 'passagem';
  return 'pacote';
}

function getReceipts(row: VendaRow) {
  return Array.isArray(row.recibos) ? row.recibos : [];
}

function getReciboValorRanking(recibo: NonNullable<VendaRow['recibos']>[number]) {
  return Math.max(0, Number(recibo?.valor_total || 0) - Number(recibo?.valor_rav || 0));
}

function deriveValorTotal(row: VendaRow) {
  const recibos = getReceipts(row);
  if (recibos.length > 0) {
    const totalRecibos = recibos.reduce((sum, recibo) => sum + getReciboValorRanking(recibo), 0);
    if (totalRecibos > 0) return totalRecibos;
  }
  return Number(row.valor_total || 0);
}

function deriveValorTotalBruto(row: VendaRow) {
  const valorBruto = Number(row.valor_total_bruto || 0);
  if (valorBruto > 0) return valorBruto;
  return deriveValorTotal(row);
}

function deriveValorTaxas(row: VendaRow) {
  const recibos = getReceipts(row);
  const taxasRecibos = recibos.reduce((sum, recibo) => {
    return sum + Number(recibo?.valor_taxas || 0) + Number(recibo?.valor_du || 0);
  }, 0);
  const valorTaxasBase = Number(row.valor_taxas || 0);
  return valorTaxasBase > 0 ? valorTaxasBase : taxasRecibos;
}

function deriveConciliado(row: VendaRow): boolean | null {
  const recibos = getReceipts(row);
  if (recibos.length === 0) return null;
  const allPositive = recibos.every((recibo) => Number(recibo?.valor_total || 0) > 0);
  return allPositive;
}

function formatVendaItem(row: VendaRow): VendaItem {
  const recibos = getReceipts(row);
  const totalSeguro = recibos.reduce((sum, recibo) => {
    const tipo = String(recibo?.tipo_produtos?.tipo || '').toLowerCase();
    const nome = String(
      recibo?.tipo_produtos?.nome || recibo?.produto_resolvido?.nome || ''
    ).toLowerCase();
    const isSeguro = tipo.includes('seguro') || nome.includes('seguro');
    return sum + (isSeguro ? getReciboValorRanking(recibo) : 0);
  }, 0);
  const produtos = recibos
    .map((recibo) =>
      String(recibo?.produto_resolvido?.nome || recibo?.tipo_produtos?.nome || '').trim()
    )
    .filter(Boolean);
  const destinoNome = String(row.destinos?.nome || '').trim();
  const cidadeDestino = String(row.destino_cidade?.nome || '').trim();
  const cidadesRecibos = Array.from(
    new Set(
      recibos.map((recibo) => String(recibo?.destino_cidade?.nome || '').trim()).filter(Boolean)
    )
  );
  const destinoDisplay =
    cidadesRecibos.join(', ') || cidadeDestino || destinoNome || 'Destino nao informado';

  return {
    id: row.id,
    codigo: String(row.numero_venda || '').trim() || `VD-${row.id.slice(0, 8).toUpperCase()}`,
    cliente: String(row.clientes?.nome || 'Cliente sem nome'),
    cliente_id: String(row.cliente_id || ''),
    vendedor_id: String(row.vendedor_id || ''),
    destino: destinoDisplay,
    destino_cidade: cidadeDestino || '-',
    data_venda: row.data_venda,
    data_embarque: row.data_embarque,
    data_final: row.data_final,
    valor_total: deriveValorTotal(row),
    valor_total_bruto: deriveValorTotalBruto(row),
    valor_taxas: deriveValorTaxas(row),
    status: deriveVendaStatus(row),
    vendedor: String(row.vendedor?.nome_completo || 'Equipe VTUR'),
    tipo: deriveVendaTipo(row),
    recibos: recibos
      .map((recibo) => String(recibo?.numero_recibo || recibo?.numero_reserva || '').trim())
      .filter(Boolean),
    produtos,
    conciliado: deriveConciliado(row),
    total_seguro: totalSeguro
  };
}

function matchesBusca(item: VendaItem, busca: string, campo: CampoBusca) {
  if (!busca) return true;
  const query = normalizeText(busca);
  const matchCliente = normalizeText(item.cliente).includes(query);
  const matchVendedor = normalizeText(item.vendedor).includes(query);
  const matchDestino = normalizeText([item.destino, item.destino_cidade].join(' ')).includes(query);
  const matchProduto = item.produtos.some((produto) => normalizeText(produto).includes(query));
  const matchRecibo = item.recibos.some((recibo) => normalizeText(recibo).includes(query));

  switch (campo) {
    case 'cliente':
      return matchCliente;
    case 'vendedor':
      return matchVendedor;
    case 'destino':
      return matchDestino;
    case 'produto':
      return matchProduto;
    case 'recibo':
      return matchRecibo;
    default:
      return (
        matchCliente ||
        matchVendedor ||
        matchDestino ||
        matchProduto ||
        matchRecibo ||
        normalizeText(item.codigo).includes(query)
      );
  }
}

function computeKpisFromRows(rows: VendaRow[]) {
  let totalVendas = 0;
  let totalTaxas = 0;
  let totalSeguro = 0;

  for (const row of rows) {
    const recibos = getReceipts(row);
    if (recibos.length > 0) {
      totalVendas += recibos.reduce((sum, recibo) => sum + getReciboValorRanking(recibo), 0);
      totalTaxas += recibos.reduce(
        (sum, recibo) => sum + Number(recibo?.valor_taxas || 0) + Number(recibo?.valor_du || 0),
        0
      );
      totalSeguro += recibos.reduce((sum, recibo) => {
        const tipo = String(recibo?.tipo_produtos?.tipo || '').toLowerCase();
        const nome = String(
          recibo?.tipo_produtos?.nome || recibo?.produto_resolvido?.nome || ''
        ).toLowerCase();
        const isSeguro = tipo.includes('seguro') || nome.includes('seguro');
        return sum + (isSeguro ? getReciboValorRanking(recibo) : 0);
      }, 0);
      continue;
    }

    totalVendas += Number(row.valor_total || 0);
    totalTaxas += Number(row.valor_taxas || 0);
  }

  return {
    totalVendas,
    totalTaxas,
    totalLiquido: totalVendas - totalTaxas,
    totalSeguro
  };
}

function uniqueIds(values: Array<string | null | undefined>, limit = MAX_SEARCH_CANDIDATES) {
  return uniqueCleanStrings(values).filter(isUuid).slice(0, limit);
}

function buildSearchParts(searchTerm: string, digits: string, columns: string[]) {
  return columns
    .flatMap((column) => {
      if (column === 'cpf' || column.includes('recibo') || column.includes('reserva')) {
        return digits ? [`${column}.ilike.%${digits}%`] : [];
      }
      return searchTerm ? [`${column}.ilike.%${searchTerm}%`] : [];
    })
    .filter(Boolean);
}

function createVendaIdQuery(client: ReturnType<typeof getAdminClient>) {
  return client.from('vendas').select('id');
}

type VendaIdQuery = ReturnType<typeof createVendaIdQuery>;

function applyVendaIdScope(
  query: VendaIdQuery,
  params: {
    inicio: string;
    fim: string;
    companyIds: string[];
    vendedorIds: string[];
    companyIdsFilter?: string[];
    vendedorIdsFilter?: string[];
    statusQuery?: string;
  }
) {
  if (params.inicio) query = query.gte('data_venda', params.inicio);
  if (params.fim) query = query.lte('data_venda', params.fim);
  const companyIdsFilter = params.companyIdsFilter || params.companyIds;
  const vendedorIdsFilter = params.vendedorIdsFilter || params.vendedorIds;
  if (companyIdsFilter.length > 0) query = query.in('company_id', companyIdsFilter);
  if (vendedorIdsFilter.length > 0) query = query.in('vendedor_id', vendedorIdsFilter);

  const todayIso = todayISODateLocal();
  switch (params.statusQuery) {
    case 'cancelada':
      query = query.eq('cancelada', true);
      break;
    case 'concluida':
      query = query.eq('cancelada', false).lt('data_final', todayIso);
      break;
    case 'confirmada':
      query = query.eq('cancelada', false).gte('data_embarque', todayIso);
      break;
    case 'pendente':
      query = query
        .eq('cancelada', false)
        .or(`data_final.is.null,data_final.gte.${todayIso}`)
        .or(`data_embarque.is.null,data_embarque.lt.${todayIso}`);
      break;
  }

  return query;
}

async function fetchScopedVendaIds(
  client: ReturnType<typeof getAdminClient>,
  params: {
    inicio: string;
    fim: string;
    companyIds: string[];
    vendedorIds: string[];
    statusQuery?: string;
    clienteIds?: string[];
    vendedorIdsFilter?: string[];
    vendaIds?: string[];
    orParts?: string[];
  }
) {
  const rows: Array<{ id?: string | null }> = [];

  const runQuery = async (configure?: (query: VendaIdQuery) => VendaIdQuery) => {
    const companyBatches =
      params.companyIds.length > QUERY_IN_BATCH_SIZE
        ? chunkArray(params.companyIds)
        : [params.companyIds];
    const vendedorBatches =
      params.vendedorIds.length > QUERY_IN_BATCH_SIZE
        ? chunkArray(params.vendedorIds)
        : [params.vendedorIds];

    for (const companyBatch of companyBatches) {
      for (const vendedorBatch of vendedorBatches) {
        let scopedQuery = client
          .from('vendas')
          .select('id')
          .order('data_venda', { ascending: false })
          .limit(MAX_SEARCH_CANDIDATES);
        scopedQuery = applyVendaIdScope(scopedQuery, {
          ...params,
          companyIdsFilter: companyBatch,
          vendedorIdsFilter: vendedorBatch
        });
        if (configure) scopedQuery = configure(scopedQuery);
        const { data, error } = await scopedQuery;
        if (error) throw error;
        rows.push(...((data || []) as Array<{ id?: string | null }>));
      }
    }
  };

  if (params.orParts && params.orParts.length > 0) {
    await runQuery((query) => query.or(params.orParts!.join(',')));
  }

  for (const batch of chunkArray(uniqueIds(params.clienteIds || []))) {
    await runQuery((query) => query.in('cliente_id', batch));
  }

  for (const batch of chunkArray(uniqueIds(params.vendedorIdsFilter || []))) {
    await runQuery((query) => query.in('vendedor_id', batch));
  }

  for (const batch of chunkArray(uniqueIds(params.vendaIds || []))) {
    await runQuery((query) => query.in('id', batch));
  }

  return uniqueIds(rows.map((row) => row.id));
}

async function resolveVendaSearchIds(
  client: ReturnType<typeof getAdminClient>,
  params: {
    searchQuery: string;
    campoBusca: CampoBusca;
    inicio: string;
    fim: string;
    companyIds: string[];
    vendedorIds: string[];
    statusQuery?: string;
  }
) {
  const raw = String(params.searchQuery || '').trim();
  const searchTerm = sanitizePostgrestSearchTerm(raw, 80);
  const digits = raw.replace(/\D/g, '').slice(0, 30);
  if (searchTerm.length < 2 && digits.length < 2) {
    return { applied: false, vendaIds: [] as string[] };
  }

  const includeAll = params.campoBusca === 'todos';
  const vendaOrParts: string[] = [];
  if (includeAll) {
    if (searchTerm.length >= 2) vendaOrParts.push(`numero_venda.ilike.%${searchTerm}%`);
    if (isUuid(raw)) vendaOrParts.push(`id.eq.${raw}`);
  }

  const companyBatches =
    params.companyIds.length > QUERY_IN_BATCH_SIZE
      ? chunkArray(params.companyIds)
      : [params.companyIds];

  // --- Disparar todos os lookups de candidatos em PARALELO ---
  const [reciboVendaIds, clienteIds, vendedorIds, destinoAndProdutoIds] = await Promise.all([
    // 1. Busca por recibo
    includeAll || params.campoBusca === 'recibo'
      ? (async () => {
          const receiptOrParts = buildSearchParts(searchTerm, digits, [
            'numero_recibo',
            'numero_recibo_normalizado',
            'numero_reserva'
          ]);
          if (receiptOrParts.length === 0) return [] as string[];
          const { data, error } = await client
            .from('vendas_recibos')
            .select('venda_id')
            .or(receiptOrParts.join(','))
            .limit(MAX_SEARCH_CANDIDATES);
          if (error) throw error;
          return uniqueIds(((data || []) as VendaIdRow[]).map((row) => row?.venda_id));
        })()
      : Promise.resolve([] as string[]),

    // 2. Busca por cliente
    includeAll || params.campoBusca === 'cliente'
      ? (async () => {
          const clienteOrParts = buildSearchParts(searchTerm, digits, [
            'nome',
            'email',
            'cpf',
            'telefone',
            'whatsapp'
          ]);
          if (clienteOrParts.length === 0) return [] as string[];
          const results = await Promise.all(
            companyBatches.map(async (companyBatch) => {
              let query = client
                .from('clientes')
                .select('id')
                .or(clienteOrParts.join(','))
                .limit(300);
              if (companyBatch.length > 0) query = query.in('company_id', companyBatch);
              const { data, error } = await query;
              if (error) throw error;
              return uniqueIds(
                ((data || []) as IdRow[]).map((row) => row?.id),
                300
              );
            })
          );
          return results.flat();
        })()
      : Promise.resolve([] as string[]),

    // 3. Busca por vendedor
    (includeAll || params.campoBusca === 'vendedor') && searchTerm.length >= 2
      ? (async () => {
          const results = await Promise.all(
            companyBatches.map(async (companyBatch) => {
              let query = client
                .from('users')
                .select('id')
                .or(`nome_completo.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
                .limit(100);
              if (companyBatch.length > 0) query = query.in('company_id', companyBatch);
              const { data, error } = await query;
              if (error) throw error;
              return uniqueIds(
                ((data || []) as IdRow[]).map((row) => row?.id),
                100
              );
            })
          );
          return results.flat();
        })()
      : Promise.resolve([] as string[]),

    // 4. Busca por destino/produto — lookup em produtos, tipo_produtos e cidades em paralelo
    (includeAll || params.campoBusca === 'destino' || params.campoBusca === 'produto') &&
    searchTerm.length >= 2
      ? (async () => {
          const inclueProduto = params.campoBusca === 'produto' || includeAll;
          const [produtosResult, tiposResult, cidadesResult] = await Promise.all([
            client
              .from('produtos')
              .select('id, cidade_id')
              .ilike('nome', `%${searchTerm}%`)
              .limit(300),
            inclueProduto
              ? client
                  .from('tipo_produtos')
                  .select('id')
                  .or(`nome.ilike.%${searchTerm}%,tipo.ilike.%${searchTerm}%`)
                  .limit(300)
              : Promise.resolve({ data: [], error: null }),
            client.from('cidades').select('id').ilike('nome', `%${searchTerm}%`).limit(300)
          ]);
          if (produtosResult.error) throw produtosResult.error;
          if (tiposResult.error) throw tiposResult.error;
          if (cidadesResult.error) throw cidadesResult.error;

          const produtosRows = (produtosResult.data || []) as Array<{
            id?: string | null;
            cidade_id?: string | null;
          }>;
          const tiposRows = (tiposResult.data || []) as IdRow[];
          const cidadesRows = (cidadesResult.data || []) as IdRow[];
          const productIds = uniqueIds(
            produtosRows.map((row) => row?.id),
            300
          );
          const tipoProdutoIds = uniqueIds(
            tiposRows.map((row) => row?.id),
            300
          );
          const cityIds = uniqueIds(
            [...produtosRows.map((row) => row?.cidade_id), ...cidadesRows.map((row) => row?.id)],
            300
          );

          // Lookup de vendas/recibos por produto, tipo e cidade — tudo em paralelo
          const recibosByProductBatches = chunkArray(productIds).map((batch) =>
            client
              .from('vendas_recibos')
              .select('venda_id')
              .in('produto_resolvido_id', batch)
              .limit(MAX_SEARCH_CANDIDATES)
          );
          const recibosByTipoBatches = chunkArray(tipoProdutoIds).map((batch) =>
            client
              .from('vendas_recibos')
              .select('venda_id')
              .in('produto_id', batch)
              .limit(MAX_SEARCH_CANDIDATES)
          );
          const cityBatchLookups = chunkArray(cityIds).flatMap((batch) => [
            client
              .from('vendas')
              .select('id')
              .in('destino_cidade_id', batch)
              .limit(MAX_SEARCH_CANDIDATES),
            client
              .from('vendas_recibos')
              .select('venda_id')
              .in('destino_cidade_id', batch)
              .limit(MAX_SEARCH_CANDIDATES)
          ]);

          const allResults = await Promise.all([
            ...recibosByProductBatches,
            ...recibosByTipoBatches,
            ...cityBatchLookups
          ]);

          const vendaIdSet = new Set<string>();
          for (const result of allResults) {
            if (result.error) continue; // tolerante a falhas parciais
            for (const row of result.data || []) {
              const rowRecord = row as { id?: unknown; venda_id?: unknown };
              const id = String(rowRecord?.venda_id || rowRecord?.id || '').trim();
              if (isUuid(id)) vendaIdSet.add(id);
            }
          }
          return Array.from(vendaIdSet);
        })()
      : Promise.resolve([] as string[])
  ]);

  const candidateVendaIds = uniqueIds([...reciboVendaIds, ...destinoAndProdutoIds]);
  const candidateClienteIds = uniqueIds(clienteIds);
  const candidateVendedorIds = uniqueIds(vendedorIds);

  const vendaIds = await fetchScopedVendaIds(client, {
    inicio: params.inicio,
    fim: params.fim,
    companyIds: params.companyIds,
    vendedorIds: params.vendedorIds,
    statusQuery: params.statusQuery,
    clienteIds: candidateClienteIds,
    vendedorIdsFilter: candidateVendedorIds,
    vendaIds: candidateVendaIds,
    orParts: vendaOrParts
  });

  return { applied: true, vendaIds };
}

async function hydrateDestinosFromVendaIds(
  client: ReturnType<typeof getAdminClient>,
  rows: VendaRow[]
) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const rowsWithoutDestination = rows.filter((row) => {
    if (row.destinos?.nome || row.destino_cidade?.nome) return false;
    return !getReceipts(row).some((recibo) => String(recibo?.destino_cidade?.nome || '').trim());
  });
  if (rowsWithoutDestination.length === 0) return;

  const vendaIds = uniqueCleanStrings(rowsWithoutDestination.map((row) => row?.id));
  if (vendaIds.length === 0) return;

  try {
    const vendaDestinos: VendaDestinoHydrationRow[] = [];
    for (const batch of chunkArray(vendaIds)) {
      const { data, error: vendaDestinosError } = await client
        .from('vendas')
        .select('id, destino_id, destino_cidade_id')
        .in('id', batch)
        .limit(Math.max(500, batch.length));

      if (vendaDestinosError) {
        logServerError(
          '[vendas/list] could not load venda destino ids for hydration',
          vendaDestinosError
        );
        return;
      }
      vendaDestinos.push(...((data || []) as VendaDestinoHydrationRow[]));
    }

    const destinoByVendaId = new Map<string, { destino_id: string; destino_cidade_id: string }>();
    for (const row of vendaDestinos) {
      const id = String(row?.id || '').trim();
      if (!id) continue;
      destinoByVendaId.set(id, {
        destino_id: String(row?.destino_id || '').trim(),
        destino_cidade_id: String(row?.destino_cidade_id || '').trim()
      });
    }

    const destinos = Array.from(destinoByVendaId.values());
    const produtoIds = uniqueCleanStrings(destinos.map((row) => row.destino_id));
    const cidadeIds = uniqueCleanStrings(destinos.map((row) => row.destino_cidade_id));

    const produtosData: ProdutoHydrationRow[] = [];
    for (const batch of chunkArray(produtoIds)) {
      const { data, error } = await client
        .from('produtos')
        .select('id, nome, cidade_id')
        .in('id', batch)
        .limit(Math.max(500, batch.length));
      if (error) {
        logServerError('[vendas/list] could not load produtos for destino hydration', error);
        break;
      }
      produtosData.push(...((data || []) as ProdutoHydrationRow[]));
    }

    const cidadesData: CidadeHydrationRow[] = [];
    for (const batch of chunkArray(cidadeIds)) {
      const { data, error } = await client
        .from('cidades')
        .select('id, nome')
        .in('id', batch)
        .limit(Math.max(500, batch.length));
      if (error) {
        logServerError('[vendas/list] could not load cidades for destino hydration', error);
        break;
      }
      cidadesData.push(...((data || []) as CidadeHydrationRow[]));
    }

    const produtosById = new Map<string, { nome: string; cidade_id: string }>();
    for (const row of produtosData) {
      const id = String(row?.id || '').trim();
      if (!id) continue;
      produtosById.set(id, {
        nome: String(row?.nome || '').trim(),
        cidade_id: String(row?.cidade_id || '').trim()
      });
    }

    const cidadesById = new Map<string, string>();
    for (const row of cidadesData) {
      const id = String(row?.id || '').trim();
      if (!id) continue;
      cidadesById.set(id, String(row?.nome || '').trim());
    }

    for (const row of rows) {
      if (row.destinos?.nome && row.destino_cidade?.nome) continue;

      const destino = destinoByVendaId.get(String(row.id || '').trim());
      if (!destino) continue;

      const produto = destino.destino_id ? produtosById.get(destino.destino_id) : null;
      if (!row.destinos?.nome && produto?.nome) {
        row.destinos = {
          nome: produto.nome,
          cidade_id: produto.cidade_id || null
        };
      }

      const cidadeId = destino.destino_cidade_id || produto?.cidade_id || '';
      const cidadeNome = cidadeId ? cidadesById.get(cidadeId) : '';
      if (!row.destino_cidade?.nome && cidadeNome) {
        row.destino_cidade = {
          id: cidadeId,
          nome: cidadeNome
        };
      }
    }
  } catch (err) {
    logServerError('[vendas/list] destino hydration skipped due to runtime error', err);
  }
}

async function fetchVendaRowsWithFallback(
  client: ReturnType<typeof getAdminClient>,
  params: {
    openId: string;
    inicio: string;
    fim: string;
    companyIds: string[];
    vendedorIds: string[];
    clienteId: string;
    scopeIsAdmin: boolean;
    accessibleClientIds: string[];
    vendaIds: string[];
    statusQuery?: string;
    useRange?: boolean;
    page?: number;
    pageSize?: number;
  }
) {
  const buildBaseQuery = (
    selectClause: string,
    overrides: {
      accessibleClientIds?: string[];
      vendaIds?: string[];
      companyIds?: string[];
      vendedorIds?: string[];
    } = {}
  ) => {
    let query = params.useRange
      ? client
          .from('vendas')
          .select(selectClause, { count: 'exact' })
          .order('data_venda', { ascending: false })
          .range(
            (Math.max(1, Number(params.page || 1)) - 1) *
              Math.max(1, Number(params.pageSize || 20)),
            (Math.max(1, Number(params.page || 1)) - 1) *
              Math.max(1, Number(params.pageSize || 20)) +
              Math.max(1, Number(params.pageSize || 20)) -
              1
          )
      : client
          .from('vendas')
          .select(selectClause)
          .order('data_venda', { ascending: false })
          .limit(5000);

    if (params.openId) query = query.eq('id', params.openId);
    if (params.vendaIds.length > 0) query = query.in('id', overrides.vendaIds || params.vendaIds);
    if (params.inicio) query = query.gte('data_venda', params.inicio);
    if (params.fim) query = query.lte('data_venda', params.fim);
    const companyIdsFilter = overrides.companyIds || params.companyIds;
    const vendedorIdsFilter = overrides.vendedorIds || params.vendedorIds;
    if (companyIdsFilter.length > 0) query = query.in('company_id', companyIdsFilter);
    if (vendedorIdsFilter.length > 0) query = query.in('vendedor_id', vendedorIdsFilter);
    if (params.clienteId) query = query.eq('cliente_id', params.clienteId);
    else if (
      !params.scopeIsAdmin &&
      params.vendedorIds.length === 0 &&
      params.accessibleClientIds.length > 0
    ) {
      query = query.in('cliente_id', overrides.accessibleClientIds || params.accessibleClientIds);
    }

    const todayIso = todayISODateLocal();
    switch (params.statusQuery) {
      case 'cancelada':
        query = query.eq('cancelada', true);
        break;
      case 'concluida':
        query = query.eq('cancelada', false).lt('data_final', todayIso);
        break;
      case 'confirmada':
        query = query.eq('cancelada', false).gte('data_embarque', todayIso);
        break;
      case 'pendente':
        query = query
          .eq('cancelada', false)
          .or(`data_final.is.null,data_final.gte.${todayIso}`)
          .or(`data_embarque.is.null,data_embarque.lt.${todayIso}`);
        break;
    }

    return query;
  };

  const runBaseQuery = async (selectClause: string) => {
    const shouldBatchVendaFilter = !params.useRange && params.vendaIds.length > QUERY_IN_BATCH_SIZE;
    const shouldBatchClientFilter =
      !shouldBatchVendaFilter &&
      !params.scopeIsAdmin &&
      !params.clienteId &&
      params.vendedorIds.length === 0 &&
      params.accessibleClientIds.length > QUERY_IN_BATCH_SIZE;
    const shouldBatchCompanyFilter =
      !params.useRange && params.companyIds.length > QUERY_IN_BATCH_SIZE;
    const shouldBatchVendedorFilter =
      !params.useRange && params.vendedorIds.length > QUERY_IN_BATCH_SIZE;

    if (
      shouldBatchVendaFilter ||
      shouldBatchClientFilter ||
      shouldBatchCompanyFilter ||
      shouldBatchVendedorFilter
    ) {
      const rows: VendaRow[] = [];
      const vendaBatches = shouldBatchVendaFilter ? chunkArray(params.vendaIds) : [undefined];
      const clientBatches = shouldBatchClientFilter
        ? chunkArray(params.accessibleClientIds)
        : [undefined];
      const companyBatches = shouldBatchCompanyFilter ? chunkArray(params.companyIds) : [undefined];
      const vendedorBatches = shouldBatchVendedorFilter
        ? chunkArray(params.vendedorIds)
        : [undefined];

      for (const vendaBatch of vendaBatches) {
        for (const clientBatch of clientBatches) {
          for (const companyBatch of companyBatches) {
            for (const vendedorBatch of vendedorBatches) {
              const result = await buildBaseQuery(selectClause, {
                vendaIds: vendaBatch,
                accessibleClientIds: clientBatch,
                companyIds: companyBatch,
                vendedorIds: vendedorBatch
              });
              if (result.error) {
                return { data: null, error: result.error } as typeof result;
              }
              rows.push(...((result.data || []) as unknown as VendaRow[]));
            }
          }
        }
      }

      return { data: dedupeVendaRows(rows), error: null };
    }

    return buildBaseQuery(selectClause);
  };

  const enrichedSelect = `
    id,
    numero_venda,
    vendedor_id,
    cliente_id,
    company_id,
    data_venda,
    data_embarque,
    data_final,
    valor_total,
    valor_total_bruto,
    valor_taxas,
    cancelada,
    clientes (nome, whatsapp),
    vendedor:users!vendedor_id (nome_completo),
    destino_cidade:cidades!destino_cidade_id (id, nome),
    destinos:produtos!destino_id (nome, cidade_id),
    recibos:vendas_recibos (
      numero_recibo,
      numero_reserva,
      destino_cidade:cidades!destino_cidade_id (nome),
      tipo_pacote,
      valor_total,
      valor_taxas,
      valor_du,
      valor_rav,
      tipo_produtos (nome, tipo),
      produto_resolvido:produtos!produto_resolvido_id (nome)
    )
  `;

  const enrichedResult = await runBaseQuery(enrichedSelect);
  if (!enrichedResult.error) {
    return {
      rows: Array.isArray(enrichedResult.data)
        ? (enrichedResult.data as unknown as VendaRow[])
        : [],
      count: getResultCount(enrichedResult)
    };
  }

  logServerError(
    '[vendas/list] enriched select failed, falling back to minimal select',
    enrichedResult.error
  );

  const fallbackSelect = `
    id,
    numero_venda,
    vendedor_id,
    cliente_id,
    company_id,
    data_venda,
    data_embarque,
    data_final,
    valor_total,
    valor_taxas,
    cancelada,
    clientes (nome),
    destino_cidade:cidades!vendas_destino_cidade_id_fkey (id, nome),
    destinos:produtos!vendas_destino_id_fkey (nome, cidade_id),
    recibos:vendas_recibos (
      numero_recibo,
      numero_reserva,
      tipo_pacote,
      valor_total,
      valor_taxas,
      valor_du,
      valor_rav
    )
  `;

  const fallbackResult = await runBaseQuery(fallbackSelect);
  if (!fallbackResult.error) {
    return {
      rows: Array.isArray(fallbackResult.data)
        ? (fallbackResult.data as unknown as VendaRow[])
        : [],
      count: getResultCount(fallbackResult)
    };
  }

  logServerError(
    '[vendas/list] FK fallback failed, trying legacy fallback select',
    fallbackResult.error
  );

  const legacyFallbackSelect = `
    id,
    numero_venda,
    vendedor_id,
    cliente_id,
    company_id,
    data_venda,
    data_embarque,
    data_final,
    valor_total,
    valor_taxas,
    cancelada,
    clientes (nome),
    recibos:vendas_recibos (
      numero_recibo,
      numero_reserva,
      tipo_pacote,
      valor_total,
      valor_taxas,
      valor_du,
      valor_rav
    )
  `;

  const legacyFallbackResult = await runBaseQuery(legacyFallbackSelect);
  if (legacyFallbackResult.error) {
    logServerError(
      '[vendas/list] legacy fallback failed, returning empty list',
      legacyFallbackResult.error
    );
    return { rows: [], count: 0 };
  }

  return {
    rows: Array.isArray(legacyFallbackResult.data)
      ? (legacyFallbackResult.data as unknown as VendaRow[])
      : [],
    count: getResultCount(legacyFallbackResult)
  };
}

export async function handleVendasListGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster) {
      ensureModuloAccess(scope, ['vendas_consulta', 'vendas'], 1, 'Sem acesso a Vendas.');
    }

    const { searchParams } = event.url;
    const inicio = String(searchParams.get('inicio') || '').trim();
    const fim = String(searchParams.get('fim') || '').trim();
    const page = parseIntSafe(searchParams.get('page'), 1);
    const pageSize = Math.min(200, parseIntSafe(searchParams.get('pageSize'), 20));
    const all = String(searchParams.get('all') || '').trim() === '1';
    const openId = String(searchParams.get('id') || '').trim();
    const includeKpisParam = String(searchParams.get('include_kpis') || '').trim();
    const kpisParam = String(searchParams.get('kpis') || '').trim();
    const includeKpis = includeKpisParam === '1' || kpisParam === '1';
    const includeVendedores = String(searchParams.get('include_vendedores') || '').trim() === '1';
    const searchQuery = String(searchParams.get('q') || '').trim();
    const campoBuscaRaw =
      String(searchParams.get('campo') || 'todos')
        .trim()
        .toLowerCase() || 'todos';
    const campoBusca = (
      VALID_CAMPO_BUSCA.has(campoBuscaRaw as CampoBusca) ? (campoBuscaRaw as CampoBusca) : 'todos'
    ) as CampoBusca;
    const statusQuery = String(searchParams.get('status') || '')
      .trim()
      .toLowerCase();
    const tipoQuery = String(searchParams.get('tipo') || '')
      .trim()
      .toLowerCase();
    const clienteId = String(searchParams.get('cliente_id') || '').trim();
    const requestedCompanyId = searchParams.get('company_id') || searchParams.get('empresa_id');
    const requestedVendedorRaw =
      searchParams.get('vendedor_ids') || searchParams.get('vendedor_id');
    const tipoNome = String(scope.tipoNome || '').toUpperCase();
    const isMasterByType = tipoNome.includes('MASTER');
    const isFinanceiroByType = tipoNome.includes('FINANCEIRO');
    const isGestorByType = tipoNome.includes('GESTOR');

    let companyIds = resolveScopedCompanyIds(scope, requestedCompanyId);
    if (isMasterByType && !scope.isMaster) {
      const masterCompanies = await fetchMasterEmpresas(client, scope.userId);
      if (masterCompanies.length > 0) {
        const requested = String(requestedCompanyId || '').trim();
        const masterCompanySet = cleanStringSet(masterCompanies);
        companyIds = requested
          ? masterCompanySet.has(requested)
            ? [requested]
            : []
          : masterCompanies;
      }
    }

    const vendedorIds = await resolveScopedVendedorIds(client, scope, requestedVendedorRaw);
    const hasRequestedVendedorFilter = String(requestedVendedorRaw || '').trim().length > 0;
    const requestedVendedorResolvedEmpty = hasRequestedVendedorFilter && vendedorIds.length === 0;
    const effectiveVendedorIds =
      isMasterByType || isFinanceiroByType || isGestorByType
        ? hasRequestedVendedorFilter
          ? vendedorIds
          : []
        : vendedorIds;

    const accessibleClientIds =
      !scope.isAdmin &&
      !isMasterByType &&
      !isFinanceiroByType &&
      !isGestorByType &&
      effectiveVendedorIds.length === 0
        ? await resolveAccessibleClientIds(client, {
            companyIds,
            vendedorIds: effectiveVendedorIds
          })
        : [];

    const canPushStatusToDb = !statusQuery || PUSHABLE_STATUS_FILTERS.has(statusQuery);
    const searchPrefilter = searchQuery
      ? await resolveVendaSearchIds(client, {
          searchQuery,
          campoBusca,
          inicio,
          fim,
          companyIds,
          vendedorIds: effectiveVendedorIds,
          statusQuery: canPushStatusToDb ? statusQuery : undefined
        })
      : { applied: false, vendaIds: [] as string[] };
    const searchVendaIds = searchPrefilter.applied ? searchPrefilter.vendaIds : [];
    const canUseDbPagination =
      !all &&
      !openId &&
      !includeKpis &&
      (!searchQuery || (searchPrefilter.applied && searchVendaIds.length <= QUERY_IN_BATCH_SIZE)) &&
      canPushStatusToDb &&
      !tipoQuery &&
      companyIds.length <= QUERY_IN_BATCH_SIZE &&
      effectiveVendedorIds.length <= QUERY_IN_BATCH_SIZE &&
      accessibleClientIds.length <= QUERY_IN_BATCH_SIZE;

    const vendedoresPromise = includeVendedores
      ? (async () => {
          const usersData =
            companyIds.length > 0
              ? await fetchRankingVendedoresByCompanyIds(client, companyIds)
              : [];

          return (usersData || [])
            .map((row) => ({
              id: String(row.id || ''),
              nome_completo: String(row.nome_completo || row.email || 'Usuário sem nome')
            }))
            .filter((row) => row.id)
            .sort((a, b) => PT_BR_COLLATOR.compare(a.nome_completo, b.nome_completo));
        })()
      : Promise.resolve([] as Array<{ id: string; nome_completo: string }>);

    const dataResult = requestedVendedorResolvedEmpty
      ? { rows: [] as VendaRow[], count: 0 }
      : searchPrefilter.applied && searchVendaIds.length === 0
        ? { rows: [] as VendaRow[], count: 0 }
        : await getCachedReadModel<{ rows: VendaRow[]; count: number | null }>({
            key: buildReadModelCacheKey('vendas-list:rows', {
              openId,
              inicio,
              fim,
              companyIds,
              vendedorIds: effectiveVendedorIds,
              clienteId,
              scopeId:
                !scope.isAdmin && !isMasterByType && !isFinanceiroByType && !isGestorByType
                  ? user.id
                  : null,
              statusQuery,
              tipoQuery,
              searchQuery,
              campoBusca,
              searchPrefilterApplied: searchPrefilter.applied,
              searchCandidateCount: searchVendaIds.length,
              all,
              includeKpis,
              useRange: canUseDbPagination,
              page: canUseDbPagination ? page : null,
              pageSize: canUseDbPagination ? pageSize : null,
              accessibleClientCount: accessibleClientIds.length
            }),
            tags: [
              READ_MODEL_TAGS.sales,
              READ_MODEL_TAGS.clients,
              READ_MODEL_TAGS.catalog,
              READ_MODEL_TAGS.users,
              ...scopeCacheTags({ companyIds, vendedorIds: effectiveVendedorIds, userId: user.id })
            ],
            ttlMs: 120_000,
            staleTtlMs: 600_000,
            loader: () =>
              fetchVendaRowsWithFallback(client, {
                openId,
                inicio,
                fim,
                companyIds,
                vendedorIds: effectiveVendedorIds,
                clienteId,
                scopeIsAdmin: scope.isAdmin,
                accessibleClientIds,
                vendaIds: searchVendaIds,
                statusQuery,
                useRange: canUseDbPagination,
                page,
                pageSize
              })
          });
    const data = dataResult.rows;

    await hydrateDestinosFromVendaIds(client, data as VendaRow[]);

    const items = (data as VendaRow[])
      .map((row) => formatVendaItem(row))
      .filter((item) => (statusQuery ? item.status === statusQuery : true))
      .filter((item) => (tipoQuery ? item.tipo === tipoQuery : true))
      .filter((item) => matchesBusca(item, searchQuery, campoBusca));

    const total = canUseDbPagination ? Number(dataResult.count ?? items.length) : items.length;
    const payloadItems =
      all || openId || canUseDbPagination
        ? items
        : items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    const vendedores = await vendedoresPromise;

    return json(
      {
        page,
        pageSize,
        total,
        items: payloadItems,
        ...(includeKpis ? { kpis: computeKpisFromRows(data as VendaRow[]) } : {}),
        ...(includeVendedores ? { vendedores } : {})
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar vendas.');
  }
}
