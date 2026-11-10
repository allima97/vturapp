// Migrado para Hono de src/routes/api/v1/dashboard/comparativo-empresas/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  getMonthRange,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { getPlatformExecutionContext } from '$lib/server/readModelRebuild';
import { fetchVendasKpiReciboContributions } from '$lib/server/vendas-kpis';
import {
  fetchCompanyComparativoReadModelRpc,
  type ReadModelCompanyComparativoRow
} from '$lib/server/reciboContribuicoesReadModel';
import { toFiniteNumber as toNum } from '$lib/utils/values';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmpresaComparativoItem = {
  company_id: string;
  nome: string;
  totalVendas: number;
  qtdVendas: number;
  totalMeta: number;
  atingimentoPct: number;
};

type CompanyRow = {
  id: string | null;
  nome_fantasia: string | null;
  nome_empresa: string | null;
  active?: boolean | null;
};

type VendedorCompanyRow = {
  id: string | null;
  company_id: string | null;
};

type MetaVendedorRow = {
  vendedor_id: string | null;
  meta_geral: number | string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BATCH = 100;

function chunks<T>(arr: T[], size = BATCH): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < arr.length; i += size) r.push(arr.slice(i, i + size));
  return r;
}

function companyLabel(row: CompanyRow): string {
  return String(row?.nome_fantasia || row?.nome_empresa || 'Empresa').trim() || 'Empresa';
}

function hasComparativoData(rows?: ReadModelCompanyComparativoRow[] | null) {
  return Boolean(rows?.some((row) => toNum(row.totalVendas) > 0 || toNum(row.qtdVendas) > 0));
}

const NO_MATCH = '00000000-0000-0000-0000-000000000000';

async function fetchAllVisibleCompanyIds(client: ReturnType<typeof getAdminClient>) {
  return getCachedReadModel<string[]>({
    key: buildReadModelCacheKey('dashboard:comparativo-empresas:all-companies', {}),
    tags: [READ_MODEL_TAGS.dashboard, READ_MODEL_TAGS.catalog],
    ttlMs: 300_000,
    staleTtlMs: 1_800_000,
    loader: async () => {
      const { data, error } = await client.from('companies').select('id, active').limit(1000);

      if (error) throw error;

      return ((data || []) as CompanyRow[])
        .filter((row) => row?.active !== false)
        .map((row) => String(row?.id || '').trim())
        .filter(isUuid);
    }
  });
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function handleDashboardComparativoEmpresasGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    const tipoNome = String(scope.tipoNome || '').toUpperCase();
    const isMaster = tipoNome.includes('MASTER');
    const isAdmin = tipoNome.includes('ADMIN');

    if (!isMaster && !isAdmin) {
      return json({ error: 'Acesso restrito.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const { searchParams } = event.url;
    const { inicio: defInicio, fim: defFim } = getMonthRange();
    const inicio = String(searchParams.get('inicio') || defInicio).trim();
    const fim = String(searchParams.get('fim') || defFim).trim();
    const requestedCompanyId = String(
      searchParams.get('company_id') || searchParams.get('empresa_id') || ''
    ).trim();

    let companyIds = resolveScopedCompanyIds(scope, requestedCompanyId).filter(
      (id) => id !== NO_MATCH
    );
    const hasConfiguredCompanyScope = (scope.companyIds || []).some(isUuid);

    // Master sem master_empresas configurado e Admin sem filtro devem enxergar
    // o mesmo universo exibido nos filtros do dashboard/base: todas as empresas ativas.
    if (
      companyIds.length === 0 &&
      (scope.isAdmin || (scope.isMaster && !hasConfiguredCompanyScope))
    ) {
      if (isUuid(requestedCompanyId)) {
        companyIds = [requestedCompanyId];
      } else if (!requestedCompanyId) {
        companyIds = await fetchAllVisibleCompanyIds(client);
      }
    }

    if (companyIds.length === 0) {
      return json({ inicio, fim, empresas: [] }, { headers: DYNAMIC_READ_HEADERS });
    }

    const useNonBlockingReadModel = companyIds.length > 1 && !isUuid(requestedCompanyId);
    const metaInicio = `${inicio.slice(0, 7)}-01`;
    const metaFim = `${fim.slice(0, 7)}-01`;

    const payload = await getCachedReadModel({
      key: buildReadModelCacheKey('dashboard:comparativo-empresas', {
        cacheVersion: 2,
        userId: user.id,
        inicio,
        fim,
        companyIds
      }),
      tags: [
        READ_MODEL_TAGS.dashboard,
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.users,
        READ_MODEL_TAGS.metas,
        ...scopeCacheTags({ companyIds, userId: user.id })
      ],
      ttlMs: 300_000,
      staleTtlMs: 1_800_000,
      loader: async () => {
        const empresaMapPromise = (async () => {
          const map = new Map<string, string>();
          const batchRows = await Promise.all(
            chunks(companyIds).map(async (batch) => {
              const { data, error } = await client
                .from('companies')
                .select('id, nome_fantasia, nome_empresa')
                .in('id', batch)
                .limit(500);
              if (error) throw error;
              return (data || []) as CompanyRow[];
            })
          );
          for (const row of batchRows.flat()) {
            map.set(String(row.id), companyLabel(row as CompanyRow));
          }
          return map;
        })();

        const [empresaMap, aggregatedRows] = await Promise.all([
          empresaMapPromise,
          fetchCompanyComparativoReadModelRpc(client, {
            dataInicio: inicio,
            dataFim: fim,
            metaInicio,
            metaFim,
            companyIds
          })
        ]);

        if (aggregatedRows && hasComparativoData(aggregatedRows)) {
          const empresas = aggregatedRows
            .map((row) => {
              const totalVendas = Number(toNum(row.totalVendas).toFixed(2));
              const totalMeta = toNum(row.totalMeta);
              return {
                company_id: row.company_id,
                nome: empresaMap.get(row.company_id) || 'Empresa',
                totalVendas,
                qtdVendas: row.qtdVendas,
                totalMeta,
                atingimentoPct:
                  totalMeta > 0 ? Math.round((totalVendas / totalMeta) * 1000) / 10 : 0
              };
            })
            .sort((a, b) => b.totalVendas - a.totalVendas);

          return { inicio, fim, empresas };
        }

        const vendedorCompanyMapPromise = (async () => {
          const map = new Map<string, string>();
          const batchRows = await Promise.all(
            chunks(companyIds).map(async (batch) => {
              const { data, error } = await client
                .from('users')
                .select('id, company_id')
                .in('company_id', batch)
                .eq('active', true)
                .limit(5000);
              if (error) throw error;
              return (data || []) as VendedorCompanyRow[];
            })
          );
          for (const row of batchRows.flat()) {
            map.set(String(row.id), String(row.company_id));
          }
          return map;
        })();

        const contributionsPromise = (async () => {
          let payload = await fetchVendasKpiReciboContributions(
            client,
            {
              dataInicio: inicio,
              dataFim: fim,
              companyIds,
              vendedorIds: []
            },
            useNonBlockingReadModel
              ? {
                  mode: 'stale-while-revalidate',
                  executionContext: getPlatformExecutionContext(event.platform),
                  fallbackToRawOnReadError: true,
                  fallbackToRawWhenEmpty: true
                }
              : undefined
          );

          if (useNonBlockingReadModel && payload.contributions.length === 0) {
            payload = await fetchVendasKpiReciboContributions(
              client,
              {
                dataInicio: inicio,
                dataFim: fim,
                companyIds,
                vendedorIds: []
              },
              { mode: 'blocking' }
            );
          }

          return payload;
        })();

        const [vendedorCompanyMap, { contributions }] = await Promise.all([
          vendedorCompanyMapPromise,
          contributionsPromise
        ]);

        const vendasMap = new Map<string, { total: number; ids: Set<string> }>();
        for (const contribution of contributions) {
          const cid = String(contribution.companyId || '').trim();
          if (!cid || cid === NO_MATCH) continue;

          const total = toNum(contribution.bruto);
          if (total <= 0) continue;

          const entry = vendasMap.get(cid) ?? { total: 0, ids: new Set<string>() };
          entry.total += total;
          entry.ids.add(
            String(contribution.vendaKey || contribution.vendaId || contribution.reciboId)
          );
          vendasMap.set(cid, entry);
        }

        const metaMap = new Map<string, number>();
        const allVendedorIds = Array.from(vendedorCompanyMap.keys());
        if (allVendedorIds.length > 0) {
          const batchRows = await Promise.all(
            chunks(allVendedorIds).map(async (batch) => {
              const { data, error } = await client
                .from('metas_vendedor')
                .select('vendedor_id, meta_geral')
                .eq('ativo', true)
                .gte('periodo', metaInicio)
                .lte('periodo', metaFim)
                .in('vendedor_id', batch)
                .limit(2000);
              if (error) throw error;
              return (data || []) as MetaVendedorRow[];
            })
          );
          for (const row of batchRows.flat()) {
            const cid = vendedorCompanyMap.get(String(row.vendedor_id)) || '';
            if (!cid) continue;
            metaMap.set(cid, (metaMap.get(cid) ?? 0) + toNum(row.meta_geral));
          }
        }

        const allCids = new Set([...companyIds, ...vendasMap.keys()]);
        const empresas: EmpresaComparativoItem[] = [];

        for (const cid of allCids) {
          if (cid === NO_MATCH) continue;
          const venda = vendasMap.get(cid);
          const totalVendas = Number((venda?.total ?? 0).toFixed(2));
          const qtdVendas = venda?.ids.size ?? 0;
          const totalMeta = metaMap.get(cid) ?? 0;
          const atingimentoPct =
            totalMeta > 0 ? Math.round((totalVendas / totalMeta) * 1000) / 10 : 0;
          empresas.push({
            company_id: cid,
            nome: empresaMap.get(cid) || 'Empresa',
            totalVendas,
            qtdVendas,
            totalMeta,
            atingimentoPct
          });
        }

        empresas.sort((a, b) => b.totalVendas - a.totalVendas);
        return { inicio, fim, empresas };
      }
    });

    return json(payload, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar comparativo por empresa.');
  }
}
