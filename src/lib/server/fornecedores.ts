import type { DataClient, QueryError } from '$lib/server/data';
import { isUuid, resolveScopedCompanyIds, type UserScope } from '$lib/server/v1';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { chunkArray, dedupeById, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

type RowsResult<T> = { data: T[] | null; error: QueryError | null };
type SingleResult<T> = { data: T | null; error: QueryError | null };

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

async function optionalRows<T>(promise: PromiseLike<RowsResult<T>>) {
  const result = await promise;
  if (result.error) {
    if (isMissingColumnOrRelation(result.error)) return [] as T[];
    throw result.error;
  }
  return (result.data || []) as T[];
}

async function optionalSingle<T>(promise: PromiseLike<SingleResult<T>>) {
  const result = await promise;
  if (result.error) {
    if (isMissingColumnOrRelation(result.error)) return null;
    throw result.error;
  }
  return result.data || null;
}

export type FornecedorRecord = {
  id: string;
  company_id?: string | null;
  nome_completo?: string | null;
  nome_fantasia?: string | null;
  localizacao?: string | null;
  cnpj?: string | null;
  cep?: string | null;
  cidade?: string | null;
  estado?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  telefone_emergencia?: string | null;
  responsavel?: string | null;
  tipo_faturamento?: string | null;
  principais_servicos?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  // Campos computados (não existem no DB)
  produtos_vinculados?: number;
};

type ProdutoFornecedorRow = {
  id?: string | null;
  nome?: string | null;
  destino?: string | null;
  fornecedor_id?: string | null;
};

function normalizeFornecedor(row: FornecedorRecord) {
  const nomeCompleto = String(row?.nome_completo || '').trim() || null;
  const nomeFantasia = String(row?.nome_fantasia || '').trim() || null;
  const responsavel = String(row?.responsavel || '').trim() || null;

  return {
    ...row,
    nome_completo: nomeCompleto,
    nome_fantasia: nomeFantasia,
    localizacao: String(row?.localizacao || '').trim() || 'brasil',
    responsavel
  };
}

export async function fetchFornecedores(client: DataClient, scope: UserScope, params: URLSearchParams) {
  const requestedCompanyId = String(params.get('empresa_id') || '').trim();
  const companyIds = resolveScopedCompanyIds(scope, requestedCompanyId);

  return getCachedReadModel({
    key: buildReadModelCacheKey('fornecedores:list', {
      companyIds,
      requestedCompanyId,
      scopeId: scope.userId
    }),
    tags: [READ_MODEL_TAGS.catalog, ...scopeCacheTags({ companyIds, userId: scope.userId })],
    ttlMs: 120_000,
    staleTtlMs: 600_000,
    loader: async () => {
      const buildBaseQuery = (companyIdsFilter = companyIds) => {
        let query = client
          .from('fornecedores')
          .select('id', { count: 'exact' })
          .order('created_at', { ascending: false })
          .limit(5000);
        if (companyIdsFilter.length > 0) {
          query = query.in('company_id', companyIdsFilter);
        }
        return query;
      };

      const baseRows: Array<{ id?: string | null }> = [];
      let totalCount = 0;
      const companyBatches = companyIds.length > QUERY_IN_BATCH_SIZE ? chunkArray(companyIds) : [companyIds];
      for (const batch of companyBatches) {
        const base = await buildBaseQuery(batch);
        if (base.error) throw base.error;
        totalCount += Number(base.count ?? base.data?.length ?? 0);
        baseRows.push(...((base.data || []) as Array<{ id?: string | null }>));
      }

      const ids: string[] = [];
      for (const row of dedupeById(baseRows)) {
        const id = String(row.id || '');
        if (id) ids.push(id);
      }
      if (ids.length === 0) return { items: [], total: 0 };

      const detailRows: FornecedorRecord[] = [];
      const products: ProdutoFornecedorRow[] = [];
      const fornecedorSelect = [
        'id',
        'company_id',
        'nome_completo',
        'nome_fantasia',
        'localizacao',
        'cnpj',
        'cep',
        'cidade',
        'estado',
        'telefone',
        'whatsapp',
        'telefone_emergencia',
        'responsavel',
        'tipo_faturamento',
        'principais_servicos',
        'created_at',
        'updated_at'
      ].join(', ');

      for (const batch of chunkArray(ids)) {
        detailRows.push(
          ...((await optionalRows(
            client.from('fornecedores').select(fornecedorSelect).in('id', batch)
          )) as unknown as FornecedorRecord[])
        );
        products.push(
          ...((await optionalRows(
            client.from('produtos').select('id, fornecedor_id').in('fornecedor_id', batch).limit(10000)
          )) as unknown as ProdutoFornecedorRow[])
        );
      }

      const productsCount = new Map<string, number>();
      for (const row of products) {
        const key = String(row?.fornecedor_id || '').trim();
        if (!key) continue;
        productsCount.set(key, (productsCount.get(key) || 0) + 1);
      }

      const items = detailRows
        .map((row) => {
          const normalized = normalizeFornecedor(row);
          return {
            ...normalized,
            produtos_vinculados: productsCount.get(normalized.id) || 0
          };
        })
        .sort((a, b) => {
          const aName = String(a.nome_fantasia || a.nome_completo || '').toLowerCase();
          const bName = String(b.nome_fantasia || b.nome_completo || '').toLowerCase();
          return aName.localeCompare(bName);
        });

      return {
        items,
        total: totalCount || items.length
      };
    }
  });
}

export async function fetchFornecedorById(client: DataClient, id: string) {
  const row = await optionalSingle<FornecedorRecord>(
    client
      .from('fornecedores')
      .select(
        [
          'id',
          'company_id',
          'nome_completo',
          'nome_fantasia',
          'localizacao',
          'cnpj',
          'cep',
          'cidade',
          'estado',
          'telefone',
          'whatsapp',
          'telefone_emergencia',
          'responsavel',
          'tipo_faturamento',
          'principais_servicos',
          'created_at',
          'updated_at'
        ].join(', ')
      )
      .eq('id', id)
      .maybeSingle()
  );

  if (!row) return null;

  const produtos = await optionalRows<ProdutoFornecedorRow>(
    client
      .from('produtos')
      .select('id, nome, destino')
      .eq('fornecedor_id', id)
      .order('nome', { ascending: true })
      .limit(200)
  );

  return {
    ...normalizeFornecedor(row),
    produtos,
    vouchers: []
  };
}

export function sanitizeFornecedorPayload(body: Record<string, unknown>, scope: UserScope) {
  const nomeCompleto = String(body?.nome_completo || '').trim();
  const nomeFantasia = String(body?.nome_fantasia || '').trim();
  const localizacao = String(body?.localizacao || '').trim() === 'exterior' ? 'exterior' : 'brasil';
  const companyId = isUuid(String(body?.company_id || '')) ? String(body.company_id) : scope.companyId;

  return {
    company_id: companyId || null,
    nome_completo: nomeCompleto || null,
    nome_fantasia: nomeFantasia || null,
    localizacao,
    cnpj: localizacao === 'brasil' ? String(body?.cnpj || '').trim() || null : null,
    cep: localizacao === 'brasil' ? String(body?.cep || '').trim() || null : null,
    cidade: String(body?.cidade || '').trim() || null,
    estado: String(body?.estado || '').trim() || null,
    telefone: String(body?.telefone || '').trim() || null,
    whatsapp: String(body?.whatsapp || '').trim() || null,
    telefone_emergencia: String(body?.telefone_emergencia || '').trim() || null,
    responsavel: String(body?.responsavel || '').trim() || null,
    tipo_faturamento: String(body?.tipo_faturamento || '').trim() || 'pre_pago',
    principais_servicos: String(body?.principais_servicos || '').trim() || null
  };
}
