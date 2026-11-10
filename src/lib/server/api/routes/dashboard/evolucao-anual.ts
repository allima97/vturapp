// Migrado para Hono de src/routes/api/v1/dashboard/evolucao-anual/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  fetchVendedorIdsByCompanyIds,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { fetchVendasKpiReciboContributions } from '$lib/server/vendas-kpis';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import { cleanStringSet } from '$lib/utils/array';
import { toFiniteNumber as toNum } from '$lib/utils/values';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MesBucket = {
  mes: number; // 1–12
  totalVendas: number;
  qtdVendas: number;
};

export type AnoEvolucao = {
  ano: number;
  meses: MesBucket[]; // always 12 items
  totalAno: number;
  qtdAno: number;
};

export type EvolucaoAnualResult = {
  anos: AnoEvolucao[];
  crescimentoYoY: Record<string, number | null>;
};

type DashboardCompanyRow = {
  id?: string | null;
  active?: boolean | null;
};

type ExecutionContextLike = {
  waitUntil: (promise: Promise<unknown>) => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyMeses(): MesBucket[] {
  return Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    totalVendas: 0,
    qtdVendas: 0
  }));
}

function getExecutionContext(platform: unknown): ExecutionContextLike | null {
  const ctx = platform && typeof platform === 'object' ? (platform as { ctx?: unknown }).ctx : null;
  return ctx &&
    typeof ctx === 'object' &&
    typeof (ctx as ExecutionContextLike).waitUntil === 'function'
    ? (ctx as ExecutionContextLike)
    : null;
}

async function fetchAllVisibleCompanyIds(client: ReturnType<typeof getAdminClient>) {
  return getCachedReadModel<string[]>({
    key: buildReadModelCacheKey('dashboard:evolucao-anual:all-visible-companies', {}),
    tags: [READ_MODEL_TAGS.dashboard, READ_MODEL_TAGS.catalog],
    ttlMs: 300_000,
    staleTtlMs: 1_800_000,
    loader: async () => {
      const { data, error } = await client.from('companies').select('id, active').limit(1000);

      if (error) throw error;

      return ((data || []) as DashboardCompanyRow[])
        .filter((row) => row?.active !== false)
        .map((row) => String(row?.id || '').trim())
        .filter(isUuid);
    }
  });
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function handleDashboardEvolucaoAnualGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    // Acesso: qualquer usuário com permissão de relatórios ou dashboard
    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['relatorios', 'dashboard'],
        1,
        'Sem acesso à análise de desempenho.'
      );
    }

    const tipoNome = String(scope.tipoNome || '').toUpperCase();
    const isMaster = tipoNome.includes('MASTER');
    const isGestor = tipoNome.includes('GESTOR');
    const isVendedor = !isMaster && !isGestor && !scope.isAdmin;
    const hasConfiguredCompanyScope = (scope.companyIds || []).some(isUuid);

    const { searchParams } = event.url;

    // anos: comma-separated, e.g. "2024,2025,2026"
    const anosParam = String(searchParams.get('anos') || '').trim();
    const currentYear = new Date().getFullYear();
    const requestedAnos: number[] = anosParam
      ? anosParam
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n) && n >= 2018 && n <= currentYear + 1)
          .slice(0, 5)
      : [currentYear - 1, currentYear];

    if (requestedAnos.length === 0) {
      return json({ error: 'Nenhum ano válido informado.' }, { status: 400 });
    }

    // Filtros opcionais
    const companyIdParam = searchParams.get('company_id') || null;
    const vendedorIdParam = searchParams.get('vendedor_id') || null;

    // --- Resolve escopo de companyIds e vendedorIds ---
    let effectiveCompanyIds: string[];
    let effectiveVendedorIds: string[] = []; // vazio = sem filtro extra de vendedor

    if (scope.isAdmin) {
      // Admin: filtra só se passou company_id explícito
      effectiveCompanyIds = isUuid(companyIdParam) ? [companyIdParam!] : [];
      if (!companyIdParam) {
        effectiveCompanyIds = await fetchAllVisibleCompanyIds(client);
      }
    } else if (isMaster) {
      const scopedIds = resolveScopedCompanyIds(scope, null);
      const scopedIdSet = cleanStringSet(scopedIds);
      // Filtro por empresa: só aceita empresas do escopo do master
      if (
        companyIdParam &&
        isUuid(companyIdParam) &&
        (!hasConfiguredCompanyScope || scopedIdSet.has(companyIdParam))
      ) {
        effectiveCompanyIds = [companyIdParam];
      } else if (!companyIdParam && !hasConfiguredCompanyScope) {
        effectiveCompanyIds = await fetchAllVisibleCompanyIds(client);
      } else {
        effectiveCompanyIds = scopedIds;
      }
      // Filtro por vendedor: só aceita se pertence a uma das empresas
      if (vendedorIdParam && isUuid(vendedorIdParam)) {
        effectiveVendedorIds = [vendedorIdParam];
      }
    } else if (isGestor) {
      // Gestor: sua empresa + equipe
      effectiveCompanyIds = scope.companyId
        ? [scope.companyId]
        : resolveScopedCompanyIds(scope, null);
      const teamIds = await fetchVendedorIdsByCompanyIds(client, effectiveCompanyIds);
      const teamIdSet = cleanStringSet(teamIds);
      if (vendedorIdParam && isUuid(vendedorIdParam) && teamIdSet.has(vendedorIdParam)) {
        effectiveVendedorIds = [vendedorIdParam];
      } else if (!vendedorIdParam) {
        // sem filtro: busca todos da equipe (mas passaremos vazio para não duplar filtro na query SQL)
        effectiveVendedorIds = [];
      }
    } else {
      // Vendedor: apenas suas próprias vendas
      effectiveCompanyIds = scope.companyId
        ? [scope.companyId]
        : resolveScopedCompanyIds(scope, null);
      effectiveVendedorIds = [scope.userId];
    }

    const cacheKey = buildReadModelCacheKey('dashboard:evolucao-anual-v2', {
      userId: user.id,
      anos: [...requestedAnos].sort(),
      effectiveCompanyIds: [...effectiveCompanyIds].sort(),
      effectiveVendedorIds: [...effectiveVendedorIds].sort()
    });

    const result = await getCachedReadModel<EvolucaoAnualResult>({
      key: cacheKey,
      ttlMs: 300_000,
      staleTtlMs: 1_800_000,
      tags: [
        READ_MODEL_TAGS.dashboard,
        READ_MODEL_TAGS.sales,
        ...scopeCacheTags({ companyIds: effectiveCompanyIds, userId: user.id })
      ],
      loader: async () => {
        const anosOrdenados = [...requestedAnos].sort();
        const dataInicio = `${anosOrdenados[0]}-01-01`;
        const dataFim = `${anosOrdenados[anosOrdenados.length - 1]}-12-31`;
        const useNonBlockingReadModel =
          (scope.isAdmin || isMaster) &&
          effectiveCompanyIds.length > 1 &&
          effectiveVendedorIds.length === 0;

        // IMPORTANTE: passamos vendedorIds vazio para que fetchSalesReportRows filtre
        // apenas por companyIds (AND company_id IN ...) sem duplo filtro AND vendedor_id IN.
        // Para filtro por vendedor específico, filtramos DEPOIS nas contributions.
        const { contributions } = await fetchVendasKpiReciboContributions(
          client,
          {
            dataInicio,
            dataFim,
            companyIds: effectiveCompanyIds,
            vendedorIds: [],
            accessibleClientIds: []
          },
          useNonBlockingReadModel
            ? {
                mode: 'stale-while-revalidate',
                executionContext: getExecutionContext(event.platform),
                fallbackToRawOnReadError: true,
                fallbackToRawWhenEmpty: true
              }
            : undefined
        );

        // Inicializa buckets
        const anosMap = new Map<number, MesBucket[]>();
        for (const ano of requestedAnos) {
          anosMap.set(ano, emptyMeses());
        }

        const totalVendasMap = new Map<string, number>();
        const vendaKeySets = new Map<string, Set<string>>();

        // Set de vendedorIds para filtro pós-query (quando há filtro específico)
        const vendedorFilterSet =
          effectiveVendedorIds.length > 0 ? new Set(effectiveVendedorIds) : null;

        for (const c of contributions) {
          const bruto = toNum(c.bruto);
          if (bruto <= 0) continue;

          // Filtra por vendedor se necessário
          if (vendedorFilterSet && !vendedorFilterSet.has(String(c.vendedorId || ''))) continue;

          // Use reciboDate (format: "YYYY-MM-DD")
          const rawDate = String(c.reciboDate || '').trim();
          if (!rawDate || rawDate.length < 7) continue;

          const ano = parseInt(rawDate.slice(0, 4), 10);
          const mes = parseInt(rawDate.slice(5, 7), 10);
          if (!anosMap.has(ano) || mes < 1 || mes > 12) continue;

          const bucketKey = `${ano}-${mes}`;
          totalVendasMap.set(bucketKey, (totalVendasMap.get(bucketKey) ?? 0) + bruto);

          if (c.vendaKey) {
            if (!vendaKeySets.has(bucketKey)) vendaKeySets.set(bucketKey, new Set());
            vendaKeySets.get(bucketKey)!.add(c.vendaKey);
          }
        }

        // Aplica totais nos buckets
        for (const [ano, meses] of anosMap.entries()) {
          for (const bucket of meses) {
            const bucketKey = `${ano}-${bucket.mes}`;
            bucket.totalVendas = totalVendasMap.get(bucketKey) ?? 0;
            bucket.qtdVendas = vendaKeySets.get(bucketKey)?.size ?? 0;
          }
        }

        // Monta saída
        const anos: AnoEvolucao[] = requestedAnos.map((ano) => {
          const meses = anosMap.get(ano) || emptyMeses();
          const totalAno = meses.reduce((sum, m) => sum + m.totalVendas, 0);
          const qtdAno = meses.reduce((sum, m) => sum + m.qtdVendas, 0);
          return { ano, meses, totalAno, qtdAno };
        });

        // YoY
        const crescimentoYoY: Record<string, number | null> = {};
        for (let i = 1; i < anos.length; i++) {
          const prev = anos[i - 1];
          const curr = anos[i];
          const key = `${prev.ano}->${curr.ano}`;
          crescimentoYoY[key] =
            prev.totalAno > 0
              ? Math.round(((curr.totalAno - prev.totalAno) / prev.totalAno) * 1000) / 10
              : null;
        }

        return { anos, crescimentoYoY };
      }
    });

    return json({ anos: requestedAnos, data: result }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar evolução anual de vendas.');
  }
}
