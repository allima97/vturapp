import type { DataClient, QueryError } from '$lib/server/data';
import type { UserScope } from '$lib/server/v1';
import { isUuid, normalizeText, parseIntSafe, sanitizePostgrestSearchTerm } from '$lib/server/v1';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';

type QueryResult<T> = { data: T[] | null; error: QueryError | null };
type OptionalResult<T> = { data: T | null; error: QueryError | null };
type CatalogRow = Record<string, unknown> & {
  id?: string;
  nome?: string;
  tipo?: string;
  estado?: string;
  uf?: string;
  pais?: string;
  subdivisao_nome?: string;
  subdivisao?: {
    codigo_admin1?: string | null;
    nome?: string | null;
  } | Array<Record<string, unknown>> | null;
};

function isMissingColumnOrRelation(err: unknown) {
  const error = err as Partial<QueryError> | null | undefined;
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return (
    code === '42703' ||
    code === 'PGRST200' ||
    code === 'PGRST205' ||
    message.includes('42703') ||
    message.includes('PGRST200') ||
    message.includes('PGRST205')
  );
}

async function optionalRows<T>(promise: PromiseLike<QueryResult<T>>) {
  const result = await promise;
  if (result.error) {
    if (isMissingColumnOrRelation(result.error)) return [] as T[];
    throw result.error;
  }
  return (result.data || []) as T[];
}

async function optionalSingle<T>(promise: PromiseLike<OptionalResult<T>>) {
  const result = await promise;
  if (result.error) {
    if (isMissingColumnOrRelation(result.error)) return null;
    throw result.error;
  }
  return result.data || null;
}

export type ProdutoBaseItem = {
  id: string;
  nome: string;
  destino: string | null;
  cidade_id: string | null;
  tipo_produto: string | null;
  informacoes_importantes: string | null;
  atracao_principal: string | null;
  melhor_epoca: string | null;
  duracao_sugerida: string | null;
  nivel_preco: string | null;
  imagem_url: string | null;
  ativo: boolean | null;
  fornecedor_id?: string | null;
  circuito_id?: string | null;
  created_at: string | null;
  updated_at?: string | null;
  todas_as_cidades: boolean;
  valor_neto?: number | null;
  margem?: number | null;
  valor_venda?: number | null;
  moeda?: string | null;
  cambio?: number | null;
  valor_em_reais?: number | null;
};

export type ProdutoTarifaItem = {
  id: string;
  acomodacao: string;
  qte_pax: number;
  tipo: string;
  validade_de: string | null;
  validade_ate: string | null;
  valor_neto: number;
  padrao: string;
  margem: number | null;
  valor_venda: number;
  moeda: string;
  cambio: number;
  valor_em_reais: number;
};

export async function fetchProdutosBase(
  client: DataClient,
  scope: UserScope,
  params: URLSearchParams
) {
  const page = parseIntSafe(params.get('page'), 1);
  const pageSize = Math.min(200, parseIntSafe(params.get('pageSize'), 20));
  const all = String(params.get('all') || '').trim() === '1';
  const search = sanitizePostgrestSearchTerm(params.get('search'));
  const tipoProdutoId = String(params.get('tipo_produto') || '').trim();
  const ativoRaw = String(params.get('ativo') || '').trim();
  const fornecedorId = String(params.get('fornecedor_id') || '').trim();

  let produtosQuery = client
    .from('produtos')
    .select(
      [
        'id',
        'nome',
        'destino',
        'cidade_id',
        'tipo_produto',
        'informacoes_importantes',
        'atracao_principal',
        'melhor_epoca',
        'duracao_sugerida',
        'nivel_preco',
        'imagem_url',
        'ativo',
        'fornecedor_id',
        'circuito_id',
        'created_at',
        'updated_at',
        'todas_as_cidades',
        'valor_neto',
        'margem',
        'valor_venda',
        'moeda',
        'cambio',
        'valor_em_reais'
      ].join(', '),
      { count: 'exact' }
    )
    .order(all || search ? 'nome' : 'created_at', { ascending: Boolean(all || search) });

  if (isUuid(tipoProdutoId)) produtosQuery = produtosQuery.eq('tipo_produto', tipoProdutoId);
  if (ativoRaw === 'true' || ativoRaw === 'false') produtosQuery = produtosQuery.eq('ativo', ativoRaw === 'true');
  if (isUuid(fornecedorId)) produtosQuery = produtosQuery.eq('fornecedor_id', fornecedorId);
  if (!all) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    produtosQuery = produtosQuery.range(from, to);
  }

  if (search) {
    const like = `%${search}%`;
    produtosQuery = produtosQuery.or(
      ['nome.ilike.' + like, 'destino.ilike.' + like, 'atracao_principal.ilike.' + like, 'melhor_epoca.ilike.' + like].join(',')
    );
  }

  const companyTags = scope.companyId ? [scope.companyId] : [];
  const [auxiliares, produtosResp] = await Promise.all([
    getCachedReadModel({
      key: buildReadModelCacheKey('produtos-base:auxiliares', {
        companyId: scope.companyId || null
      }),
      tags: [READ_MODEL_TAGS.catalog, ...scopeCacheTags({ companyIds: companyTags })],
      ttlMs: 600_000,
      staleTtlMs: 3_600_000,
      loader: async () => {
        const [
          paises,
          subdivisoes,
          tipos,
          destinosProdutos,
          cidadesComPais,
          cidadesBase,
          fornecedores
        ] = await Promise.all([
          optionalRows(client.from('paises').select('id, nome').order('nome')),
          optionalRows(client.from('subdivisoes').select('id, nome, codigo_admin1, pais_id').order('nome')),
          optionalRows(client.from('tipo_produtos').select('id, nome, tipo, ativo').eq('ativo', true).order('nome')),
          optionalRows(
            client
              .from('produtos')
              .select('destino, atracao_principal, melhor_epoca')
              .order('destino', { ascending: true })
              .limit(1000)
          ),
          optionalRows(
            client
              .from('cidades')
              .select('id, nome, subdivisao_id, subdivisao:subdivisoes(id, nome, pais_id)')
              .order('nome', { ascending: true })
              .limit(5000)
          ),
          optionalRows(client.from('cidades').select('id, nome').order('nome', { ascending: true }).limit(5000)),
          scope.companyId
            ? optionalRows(
                client
                  .from('fornecedores')
                  .select('id, nome_completo, nome_fantasia')
                  .eq('company_id', scope.companyId)
                  .order('nome_fantasia', { ascending: true })
                  .limit(2000)
              )
            : Promise.resolve([])
        ]);

        return {
          paises,
          subdivisoes,
          tipos,
          destinosProdutos,
          cidadesComPais,
          cidadesBase,
          fornecedores
        };
      }
    }),
    produtosQuery
  ]);

  const {
    paises,
    subdivisoes,
    tipos,
    destinosProdutos,
    cidadesComPais,
    cidadesBase,
    fornecedores
  } = auxiliares;

  if (produtosResp.error) throw produtosResp.error;

  const cidadesMap = new Map<string, CatalogRow>();
  for (const row of cidadesBase as CatalogRow[]) cidadesMap.set(String(row.id), { ...row });
  for (const row of cidadesComPais as CatalogRow[]) {
    cidadesMap.set(String(row.id), {
      ...(cidadesMap.get(String(row.id)) || {}),
      ...row
    });
  }

  let produtos = ((produtosResp.data || []) as unknown as ProdutoBaseItem[]).map((row) => ({
    ...row,
    todas_as_cidades: row?.todas_as_cidades === true || (!row?.cidade_id && row?.todas_as_cidades !== false)
  })) as ProdutoBaseItem[];

  if (search) {
    const term = normalizeText(search);
    produtos = produtos.filter((produto) => {
      const cidade = produto.cidade_id ? cidadesMap.get(produto.cidade_id) : null;
      const subdivisao = Array.isArray(cidade?.subdivisao) ? cidade?.subdivisao[0] : cidade?.subdivisao;
      const estado =
        cidade?.estado ||
        cidade?.uf ||
        cidade?.subdivisao_nome ||
        subdivisao?.codigo_admin1 ||
        subdivisao?.nome ||
        '';
      const pais = cidade?.pais || '';
      const tipo = tipos.find((item) => String((item as CatalogRow).id || '') === produto.tipo_produto) as CatalogRow | undefined;
      return [
        produto.nome,
        produto.destino,
        produto.atracao_principal,
        produto.melhor_epoca,
        cidade?.nome,
        estado,
        pais,
        tipo?.nome,
        tipo?.tipo
      ].some((value) => normalizeText(String(value || '')).includes(term));
    });
  }

  return {
    paises,
    subdivisoes,
    tipos,
    produtos,
    total: search || all ? produtos.length : produtosResp.count ?? produtos.length,
    destinosProdutos,
    cidades: Array.from(cidadesMap.values()),
    fornecedores
  };
}

export async function fetchProdutoById(client: DataClient, id: string) {
  const base = await optionalSingle<ProdutoBaseItem>(
    client
      .from('produtos')
      .select(
        [
          'id',
          'nome',
          'destino',
          'cidade_id',
          'tipo_produto',
          'informacoes_importantes',
          'atracao_principal',
          'melhor_epoca',
          'duracao_sugerida',
          'nivel_preco',
          'imagem_url',
          'ativo',
          'fornecedor_id',
          'circuito_id',
          'created_at',
          'updated_at',
          'todas_as_cidades',
          'valor_neto',
          'margem',
          'valor_venda',
          'moeda',
          'cambio',
          'valor_em_reais'
        ].join(', ')
      )
      .eq('id', id)
      .maybeSingle()
  );

  if (!base) return null;

  const [cidade, tipo, fornecedor, tarifas] = await Promise.all([
    base.cidade_id
      ? optionalSingle(
          client
            .from('cidades')
            .select('id, nome, subdivisao_id, subdivisao:subdivisoes(id, nome, pais_id)')
            .eq('id', base.cidade_id)
            .maybeSingle()
        )
      : Promise.resolve(null),
    base.tipo_produto
      ? optionalSingle(client.from('tipo_produtos').select('id, nome, tipo, ativo').eq('id', base.tipo_produto).maybeSingle())
      : Promise.resolve(null),
    base.fornecedor_id
      ? optionalSingle(client.from('fornecedores').select('id, nome_completo, nome_fantasia').eq('id', base.fornecedor_id).maybeSingle())
      : Promise.resolve(null),
    fetchProdutoTarifas(client, id)
  ]);

  return {
    ...base,
    todas_as_cidades: base?.todas_as_cidades === true || (!base?.cidade_id && base?.todas_as_cidades !== false),
    cidade,
    tipo,
    fornecedor,
    tarifas
  };
}

export async function fetchProdutoTarifas(client: DataClient, produtoId: string) {
  if (!isUuid(produtoId)) return [] as ProdutoTarifaItem[];

  const rows = await optionalRows<ProdutoTarifaItem>(
    client
      .from('produtos_tarifas')
      .select(
        'id, acomodacao, qte_pax, tipo, validade_de, validade_ate, valor_neto, padrao, margem, valor_venda, moeda, cambio, valor_em_reais'
      )
      .eq('produto_id', produtoId)
      .order('validade_de', { ascending: true })
      .limit(500)
  );

  return rows.map((row) => ({
    id: String(row.id || ''),
    acomodacao: String(row.acomodacao || ''),
    qte_pax: Number(row.qte_pax || 0),
    tipo: String(row.tipo || ''),
    validade_de: row.validade_de || null,
    validade_ate: row.validade_ate || null,
    valor_neto: Number(row.valor_neto || 0),
    padrao: String(row.padrao || 'Padrao'),
    margem: row.margem == null ? null : Number(row.margem),
    valor_venda: Number(row.valor_venda || 0),
    moeda: String(row.moeda || 'USD'),
    cambio: Number(row.cambio || 1),
    valor_em_reais: Number(row.valor_em_reais || 0)
  })) as ProdutoTarifaItem[];
}

export function sanitizeProdutoPayload(body: Record<string, unknown>) {
  return {
    nome: String(body?.nome || '').trim(),
    destino: String(body?.destino || '').trim() || null,
    cidade_id: isUuid(String(body?.cidade_id || '')) ? String(body.cidade_id) : null,
    tipo_produto: isUuid(String(body?.tipo_produto || '')) ? String(body.tipo_produto) : null,
    atracao_principal: String(body?.atracao_principal || '').trim() || null,
    melhor_epoca: String(body?.melhor_epoca || '').trim() || null,
    duracao_sugerida: String(body?.duracao_sugerida || body?.duracao || '').trim() || null,
    nivel_preco: String(body?.nivel_preco || '').trim() || null,
    imagem_url: String(body?.imagem_url || '').trim() || null,
    informacoes_importantes: String(body?.informacoes_importantes || body?.descricao || '').trim() || null,
    ativo: body?.ativo !== false,
    fornecedor_id: isUuid(String(body?.fornecedor_id || '')) ? String(body.fornecedor_id) : null,
    circuito_id: isUuid(String(body?.circuito_id || '')) ? String(body.circuito_id) : null,
    todas_as_cidades: body?.todas_as_cidades === true,
    valor_neto: Number(body?.valor_neto || 0) || 0,
    margem: body?.margem == null || body?.margem === '' ? null : Number(body.margem),
    valor_venda: Number(body?.valor_venda || 0) || 0,
    moeda: String(body?.moeda || 'USD').trim() || 'USD',
    cambio: Number(body?.cambio || 1) || 1,
    valor_em_reais: Number(body?.valor_em_reais || 0) || 0
  };
}

function toNullableDate(value: unknown) {
  const raw = String(value || '').trim();
  return raw ? raw : null;
}

export function sanitizeTarifasPayload(produtoId: string, rawTarifas: unknown[]) {
  if (!isUuid(produtoId)) return [];

  return (Array.isArray(rawTarifas) ? rawTarifas : [])
    .map((rawItem) => {
      const item = rawItem && typeof rawItem === 'object' ? (rawItem as Record<string, unknown>) : {};
      return {
        produto_id: produtoId,
        acomodacao: String(item?.acomodacao || '').trim(),
        qte_pax: Math.max(0, Math.trunc(Number(item?.qte_pax || 0) || 0)),
        tipo: String(item?.tipo || '').trim(),
        validade_de: toNullableDate(item?.validade_de),
        validade_ate: toNullableDate(item?.validade_ate),
        valor_neto: Number(item?.valor_neto || 0) || 0,
        padrao: String(item?.padrao || '').trim() === 'Manual' ? 'Manual' : 'Padrao',
        margem: item?.margem == null || item?.margem === '' ? null : Number(item.margem),
        valor_venda: Number(item?.valor_venda || 0) || 0,
        moeda: String(item?.moeda || 'USD').trim() || 'USD',
        cambio: Number(item?.cambio || 1) || 1,
        valor_em_reais: Number(item?.valor_em_reais || 0) || 0
      };
    })
    .filter((item) => item.acomodacao || item.tipo || item.valor_neto || item.valor_venda || item.validade_de || item.validade_ate)
    .slice(0, 400);
}
