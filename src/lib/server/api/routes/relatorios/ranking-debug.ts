// Migrado para Hono de src/routes/api/v1/relatorios/ranking-debug/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
/**
 * Endpoint de diagnóstico e correção de recibos problemáticos da conciliação.
 *
 * GET  /api/v1/relatorios/ranking-debug?docs=084185,083862,084186
 *      → Lista linhas da conciliação com vendedor atribuído e valores
 *
 * POST /api/v1/relatorios/ranking-debug
 *      Body: { action: "fix_vendor", id: "<uuid>", vendedor_id: "<uuid>" }
 *      → Atualiza ranking_vendedor_id do registro
 *
 *      Body: { action: "fix_valor", id: "<uuid>", valor_lancamentos: 18148, valor_venda_real: 18148 }
 *      → Atualiza valor_lancamentos e valor_venda_real do registro
 *
 * REMOVER após correções.
 */
import { json } from '@sveltejs/kit';
import {
  fetchRankingVendedoresByCompanyIds,
  getAdminClient,
  isDebugEndpointEnabled,
  isRankingEligibleUser,
  logServerError,
  NO_MATCH_COMPANY_ID,
  parseIntSafe,
  parseUuidList,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  sanitizePostgrestSearchTerm,
  toErrorResponse
} from '$lib/server/v1';
import { findEquipeVturVendedor } from '$lib/conciliacao/baixaRac';
import { monthRangeFromKey } from '$lib/date';
import { fetchVendasKpiReciboContributions } from '$lib/server/vendas-kpis';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { chunkArray } from '$lib/utils/array';
import { invalidateSalesReadModels } from '$lib/server/readModelCache';

const DEBUG_HEADERS = NO_STORE_HEADERS;
const MAX_DEBUG_CONTRIBUICOES = 2000;
const MAX_RANKING_DEBUG_BODY_BYTES = 64 * 1024;
const UNFILTERED_VENDEDOR_VALUES = new Set([
  '*',
  'all',
  'todos',
  'todas',
  'todo',
  'toda',
  'null',
  'undefined'
]);
const SEGURO_FAIXAS_COMISSAO = new Set(['SEGURO_32_35', 'SEGURO_35_38']);

type DebugUserRow = {
  id?: string | null;
  nome_completo?: string | null;
  email?: string | null;
  company_id?: string | null;
  active?: boolean | null;
  uso_individual?: boolean | null;
};

type RankingDebugConcRow = {
  id?: string | null;
  documento?: string | null;
  status?: string | null;
  descricao?: string | null;
  movimento_data?: string | null;
  valor_lancamentos?: number | null;
  valor_venda_real?: number | null;
  valor_taxas?: number | null;
  valor_descontos?: number | null;
  valor_abatimentos?: number | null;
  valor_nao_comissionavel?: number | null;
  is_seguro_viagem?: boolean | null;
  faixa_comissao?: string | null;
  ranking_vendedor_id?: string | null;
  company_id?: string | null;
};

type RankingDebugConcEntry = RankingDebugConcRow & {
  _estornado?: boolean;
};

type RankingDebugAuditoriaEntry = RankingDebugConcEntry & {
  _bruto: number;
  _isSeguro: boolean;
};

type RankingDebugSemVendedorEntry = {
  documento: string | null | undefined;
  bruto: number;
  motivo: 'uso_individual' | 'sem_ranking_vendedor_id';
  ranking_vendedor_nome?: string;
  movimento_data?: string | null;
};

type RankingDebugDocumentoRow = RankingDebugConcRow & {
  venda_id?: string | null;
  venda_recibo_id?: string | null;
};

type RankingDebugDocumentoResumo = {
  documento: string;
  core_numerico: string;
  movimento_data: string | null | undefined;
  status: string | null | undefined;
  valor_lancamentos: number | null | undefined;
  valor_bruto_calculado: number;
  valor_taxas: number | null | undefined;
  linked_venda_id: string | null | undefined;
  linked_recibo_id: string | null | undefined;
};

type RankingDebugPostBody = {
  action?: string;
  id?: string;
  vendedor_id?: string;
  valor_lancamentos?: number | string | null;
  valor_venda_real?: number | string | null;
};

type RankingDebugValorUpdate = {
  valor_lancamentos?: number;
  valor_venda_real?: number;
};

type VendaDebugReciboRow = {
  id?: string | null;
  numero_recibo?: string | null;
  data_venda?: string | null;
};

type VendaDebugRow = {
  id?: string | null;
  vendedor_id?: string | null;
  vendas_recibos?: VendaDebugReciboRow[] | null;
};

function debugJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(DEBUG_HEADERS)) headers.set(key, value);
  return json(body, {
    ...init,
    headers
  });
}

function hasExplicitVendedorFilter(value?: string | null) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

  return Boolean(normalized) && !UNFILTERED_VENDEDOR_VALUES.has(normalized);
}

function canUseRankingDebug(scope: Awaited<ReturnType<typeof resolveUserScope>>) {
  return scope.isAdmin || scope.isMaster || scope.isGestor;
}

function canMutateRankingDebug(scope: Awaited<ReturnType<typeof resolveUserScope>>) {
  return scope.isAdmin || scope.isMaster;
}

function canAccessCompany(
  scope: Awaited<ReturnType<typeof resolveUserScope>>,
  companyId: string | null | undefined
) {
  const normalizedCompanyId = String(companyId || '').trim();
  if (scope.isAdmin) return true;
  return Boolean(normalizedCompanyId && scope.companyIds.includes(normalizedCompanyId));
}

function resolveDebugCompanyIds(
  scope: Awaited<ReturnType<typeof resolveUserScope>>,
  requestedCompanyId?: string | null
) {
  const ids = resolveScopedCompanyIds(scope, requestedCompanyId);
  if (!scope.isAdmin && ids.length === 0) return scope.companyIds;
  return ids;
}

function applyCompanyScope<T extends { in: (column: string, values: string[]) => T }>(
  query: T,
  scope: Awaited<ReturnType<typeof resolveUserScope>>,
  requestedCompanyId?: string | null
) {
  const companyIds = resolveDebugCompanyIds(scope, requestedCompanyId);
  return companyIds.length > 0 ? query.in('company_id', companyIds) : query;
}

export async function handleRelatoriosRankingDebugGet(event: RequestEvent) {
  try {
    if (!isDebugEndpointEnabled(event)) {
      return debugJson({ error: 'Not found' }, { status: 404 });
    }

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    if (!canUseRankingDebug(scope)) {
      return debugJson({ error: 'Sem acesso.' }, { status: 403 });
    }

    // Modo contribuições canônicas do ranking/KPIs:
    // ?contribuicoes_mes=2026-04
    const contribuicoesMes = event.url.searchParams.get('contribuicoes_mes');
    if (contribuicoesMes) {
      if (!/^\d{4}-\d{2}$/.test(String(contribuicoesMes))) {
        return debugJson({ error: 'Mes invalido.' }, { status: 400 });
      }
      const range = monthRangeFromKey(contribuicoesMes);
      if (!range) {
        return debugJson({ error: 'Mes invalido.' }, { status: 400 });
      }
      const { inicio, fim } = range;
      const requestedLimit = parseIntSafe(
        event.url.searchParams.get('limit'),
        MAX_DEBUG_CONTRIBUICOES
      );
      const maxContribuicoes = Math.max(1, Math.min(requestedLimit, MAX_DEBUG_CONTRIBUICOES));
      const companyIds = resolveDebugCompanyIds(scope, event.url.searchParams.get('empresa_id'));
      const requestedVendedorRaw =
        event.url.searchParams.get('vendedor_ids') || event.url.searchParams.get('vendedor_id');
      const hasRequestedVendedorFilter = hasExplicitVendedorFilter(requestedVendedorRaw);
      let vendedorIds = parseUuidList(requestedVendedorRaw);

      if (hasRequestedVendedorFilter && vendedorIds.length === 0) {
        vendedorIds = [NO_MATCH_COMPANY_ID];
      }

      if (!hasRequestedVendedorFilter && vendedorIds.length === 0 && companyIds.length > 0) {
        const companyUsers = await fetchRankingVendedoresByCompanyIds(client, companyIds);

        vendedorIds = (companyUsers || [])
          .map((row) => String(row?.id || '').trim())
          .filter(Boolean);
      }

      const vendedorMap = new Map<string, string>();
      if (vendedorIds.length > 0) {
        for (const vendedorBatch of chunkArray(vendedorIds)) {
          const { data: usersRows, error: usersError } = await client
            .from('users')
            .select('id, nome_completo, email')
            .in('id', vendedorBatch)
            .limit(5000);

          if (usersError) throw usersError;
          for (const row of usersRows || []) {
            vendedorMap.set(
              String(row?.id || ''),
              String(row?.nome_completo || row?.email || row?.id || '')
            );
          }
        }
      }

      const canonical = await fetchVendasKpiReciboContributions(client, {
        dataInicio: inicio,
        dataFim: fim,
        companyIds,
        vendedorIds
      });

      const porVendedor = new Map<
        string,
        {
          vendedor_id: string;
          vendedor_nome: string;
          total: number;
          taxas: number;
          seguro: number;
          recibos: number;
        }
      >();
      for (const item of canonical.contributions) {
        const vendedorId = String(item.vendedorId || '').trim();
        if (!vendedorId) continue;
        const current = porVendedor.get(vendedorId) || {
          vendedor_id: vendedorId,
          vendedor_nome: vendedorMap.get(vendedorId) || vendedorId,
          total: 0,
          taxas: 0,
          seguro: 0,
          recibos: 0
        };
        current.total += Number(item.bruto || 0);
        current.taxas += Number(item.taxas || 0);
        if (item.isSeguro) current.seguro += Number(item.bruto || 0);
        current.recibos += 1;
        porVendedor.set(vendedorId, current);
      }

      return debugJson({
        periodo: `${inicio} a ${fim}`,
        empresas: companyIds,
        vendedores_considerados: vendedorIds.length,
        resumo_kpi: canonical.agg,
        por_vendedor: Array.from(porVendedor.values())
          .map((row) => ({
            ...row,
            total: Math.round(row.total * 100) / 100,
            taxas: Math.round(row.taxas * 100) / 100,
            seguro: Math.round(row.seguro * 100) / 100
          }))
          .sort((a, b) => b.total - a.total),
        total_contribuicoes: canonical.contributions.length,
        contribuicoes_truncadas: canonical.contributions.length > maxContribuicoes,
        contribuicoes: canonical.contributions.slice(0, maxContribuicoes).map((item) => ({
          ...item,
          vendedorNome: vendedorMap.get(String(item.vendedorId || '')) || item.vendedorId
        }))
      });
    }

    // Modo diagnóstico por vendedor: ?vendedor=Leonardo&mes=2026-04
    const vendedorBusca = sanitizePostgrestSearchTerm(event.url.searchParams.get('vendedor'), 80);
    const mesBusca = event.url.searchParams.get('mes') || '2026-04';
    if (vendedorBusca.length >= 2) {
      const range = monthRangeFromKey(mesBusca);
      if (!range) {
        return debugJson({ error: 'Mes invalido.' }, { status: 400 });
      }
      const { inicio, fim } = range;

      // 1. Encontrar o(s) user(s) com esse nome
      let usersQuery = client
        .from('users')
        .select('id, nome_completo')
        .ilike('nome_completo', `%${vendedorBusca}%`)
        .limit(5);
      usersQuery = applyCompanyScope(usersQuery, scope, event.url.searchParams.get('empresa_id'));
      const { data: usersData } = await usersQuery;
      const users = (usersData || []) as DebugUserRow[];
      const userIds = users.map((u) => String(u.id || '').trim()).filter(Boolean);
      const userNomes: Record<string, string> = Object.fromEntries(
        users.map((u) => [String(u.id || ''), String(u.nome_completo || '')])
      );

      if (userIds.length === 0)
        return debugJson({ erro: `Nenhum usuário encontrado com nome "${vendedorBusca}"` });

      // 2. Buscar todos os registros de conciliação atribuídos a esse(s) vendedor(es)
      const { data: concRows, error: concErr } = await client
        .from('conciliacao_recibos')
        .select(
          'id, documento, status, descricao, movimento_data, valor_lancamentos, valor_venda_real, valor_taxas, valor_descontos, valor_abatimentos, valor_nao_comissionavel, is_seguro_viagem, faixa_comissao, ranking_vendedor_id, company_id'
        )
        .in('ranking_vendedor_id', userIds)
        .gte('movimento_data', inicio)
        .lte('movimento_data', fim)
        .order('movimento_data', { ascending: true });
      if (concErr) throw concErr;

      // Agrupa por documento (dedup — pega o mais recente por documento, ignora ESTORNO)
      const docMapVendedor = new Map<string, RankingDebugConcEntry>();
      for (const r of (concRows || []) as RankingDebugConcRow[]) {
        const doc = String(r.documento || '').trim();
        const status = String(r.status || '').toUpperCase();
        if (!doc) continue;
        const existing = docMapVendedor.get(doc);
        if (!existing) {
          docMapVendedor.set(doc, { ...r, _estornado: status === 'ESTORNO' });
        } else {
          if (status === 'ESTORNO') existing._estornado = true;
        }
      }
      const recibosVendedor = Array.from(docMapVendedor.values()).filter((r) => !r._estornado);

      const calcBruto = (r: RankingDebugConcEntry) => {
        const lanc = Number(r.valor_lancamentos || 0);
        const desc = Number(r.valor_descontos || 0);
        const abat = Number(r.valor_abatimentos || 0);
        const naoC = Math.max(0, Number(r.valor_nao_comissionavel || 0));
        return Math.max(0, lanc - desc - abat - naoC);
      };
      const isSeguro = (r: RankingDebugConcEntry) =>
        Boolean(r.is_seguro_viagem) || SEGURO_FAIXAS_COMISSAO.has(String(r.faixa_comissao || ''));

      const totalBruto = recibosVendedor.reduce((s: number, r) => s + calcBruto(r), 0);
      const totalSeguro = recibosVendedor
        .filter(isSeguro)
        .reduce((s: number, r) => s + calcBruto(r), 0);
      const totalReal = recibosVendedor.reduce(
        (s: number, r) => s + Number(r.valor_venda_real || 0),
        0
      );

      // 3. Buscar também registros onde o documento aparece mas está atribuído a OUTRO vendedor
      // — para detectar se recibos que deveriam ser do Leonardo foram para o Márcio
      // Primeiro pegar os documentos das vendas do usuário via vendas_recibos
      const vendasRows: VendaDebugRow[] = [];
      for (const userBatch of chunkArray(userIds)) {
        const { data } = await client
          .from('vendas')
          .select('id, vendedor_id, vendas_recibos(id, numero_recibo, data_venda)')
          .in('vendedor_id', userBatch)
          .gte('created_at', `${inicio}T00:00:00`)
          .lte('created_at', `${fim}T23:59:59`)
          .limit(200);
        vendasRows.push(...((data || []) as VendaDebugRow[]));
      }

      const docsDasVendas: string[] = [];
      for (const v of vendasRows || []) {
        for (const r of v.vendas_recibos || []) {
          if (r.numero_recibo) docsDasVendas.push(String(r.numero_recibo));
        }
      }

      // 4. Para esses documentos, ver quem está atribuído na conciliação
      let concAtribuicaoOutros: Array<RankingDebugConcRow & { ranking_vendedor_nome: string }> = [];
      if (docsDasVendas.length > 0) {
        const outrosRawRows: RankingDebugConcRow[] = [];
        const userIdSet = new Set(userIds);
        for (const docsBatch of chunkArray(docsDasVendas)) {
          const { data } = await client
            .from('conciliacao_recibos')
            .select(
              'id, documento, status, descricao, movimento_data, valor_lancamentos, valor_venda_real, ranking_vendedor_id'
            )
            .in('documento', docsBatch)
            .gte('movimento_data', inicio)
            .lte('movimento_data', fim)
            .limit(100);
          outrosRawRows.push(...((data || []) as RankingDebugConcRow[]));
        }
        const outrosRows = outrosRawRows.filter(
          (row) => !userIdSet.has(String(row.ranking_vendedor_id || '').trim())
        );
        // Resolver nomes dos outros vendedores
        const outrosIdSet = new Set<string>();
        for (const row of outrosRows || []) {
          if (row.ranking_vendedor_id) outrosIdSet.add(row.ranking_vendedor_id);
        }
        const outrosIds = Array.from(outrosIdSet);
        const outrosUsers: DebugUserRow[] = [];
        for (const outrosBatch of chunkArray(outrosIds)) {
          const { data } = await client
            .from('users')
            .select('id, nome_completo')
            .in('id', outrosBatch);
          outrosUsers.push(...((data || []) as DebugUserRow[]));
        }
        const outrosNomes: Record<string, string> = Object.fromEntries(
          outrosUsers.map((u) => [String(u.id || ''), String(u.nome_completo || '')])
        );
        concAtribuicaoOutros = (outrosRows || []).map((r) => ({
          ...r,
          ranking_vendedor_nome:
            outrosNomes[String(r.ranking_vendedor_id || '')] ||
            String(r.ranking_vendedor_id || '') ||
            '(sem vendedor)'
        }));
      }

      return debugJson({
        vendedor_buscado: vendedorBusca,
        periodo: `${inicio} a ${fim}`,
        usuarios_encontrados: usersData,
        total_bruto_conciliacao: Math.round(totalBruto * 100) / 100,
        total_seguro_conciliacao: Math.round(totalSeguro * 100) / 100,
        total_real_conciliacao: Math.round(totalReal * 100) / 100,
        recibos_atribuidos_ao_vendedor: recibosVendedor.map((r) => ({
          id: r.id,
          documento: r.documento,
          status: r.status,
          movimento_data: r.movimento_data,
          valor_lancamentos: r.valor_lancamentos,
          valor_descontos: r.valor_descontos,
          valor_abatimentos: r.valor_abatimentos,
          valor_nao_comissionavel: r.valor_nao_comissionavel,
          valor_bruto_calculado: Math.round(calcBruto(r) * 100) / 100,
          valor_taxas: r.valor_taxas,
          is_seguro: isSeguro(r),
          ranking_vendedor_id: r.ranking_vendedor_id,
          ranking_vendedor_nome:
            userNomes[String(r.ranking_vendedor_id || '')] || r.ranking_vendedor_id,
          company_id: r.company_id
        })),
        possiveis_recibos_desviados: concAtribuicaoOutros,
        resumo: {
          atribuidos_unicos: recibosVendedor.length,
          possiveis_desvios: concAtribuicaoOutros.length
        }
      });
    }

    // Modo listagem de descrições distintas no banco: ?descricoes=1
    const listarDescricoes = event.url.searchParams.get('descricoes');
    if (listarDescricoes) {
      let q = client.from('conciliacao_recibos').select('descricao, status').limit(2000);
      q = applyCompanyScope(q, scope, event.url.searchParams.get('empresa_id'));
      const { data: descRows, error: descErr } = await q;
      if (descErr) throw descErr;
      // Agrupa por (descricao, status) com contagem
      const counts = new Map<string, number>();
      for (const r of descRows || []) {
        const key = `${r.status}||${r.descricao || ''}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const result = Array.from(counts.entries())
        .map(([key, count]) => {
          const [status, descricao] = key.split('||');
          return { status, descricao, count };
        })
        .sort((a, b) => b.count - a.count);
      return debugJson({ descricoes_distintas: result, total_linhas: descRows?.length });
    }

    // Modo busca de usuário: ?busca_usuario=Sandra
    const buscaUsuario = sanitizePostgrestSearchTerm(
      event.url.searchParams.get('busca_usuario'),
      80
    );
    if (buscaUsuario.length >= 2) {
      let usuariosQuery = client
        .from('users')
        .select('id, nome_completo')
        .ilike('nome_completo', `%${buscaUsuario}%`)
        .limit(10);
      usuariosQuery = applyCompanyScope(
        usuariosQuery,
        scope,
        event.url.searchParams.get('empresa_id')
      );
      const { data: usuarios, error: userErr } = await usuariosQuery;
      if (userErr) throw userErr;
      return debugJson({ usuarios: usuarios || [] });
    }

    // ── Modo auditoria por mês: ?auditoria_mes=2026-04&empresa_id=<uuid> ──
    // Retorna totais brutos da conciliação por vendedor (com e sem vendor) + recibos sem vendedor
    const auditoriaMes = event.url.searchParams.get('auditoria_mes');
    if (auditoriaMes) {
      const range = monthRangeFromKey(auditoriaMes);
      if (!range) {
        return debugJson({ error: 'Mes invalido.' }, { status: 400 });
      }
      const { inicio, fim } = range;
      const empresaId = event.url.searchParams.get('empresa_id');

      // Metas informadas (valores de fechamento externos)
      const metasExternas: Record<string, number> = {
        LAZARO: 430121.61,
        MARCIO: 367805.28,
        LEONARDO: 326281.57,
        ANDERSON: 235824.53,
        ANDRE: 209151.28,
        TATIANA: 117471.1,
        SANDRA: 117639.55
      };

      // 1. Buscar todos os recibos de conciliação do período
      let concQ = client
        .from('conciliacao_recibos')
        .select(
          'id, documento, movimento_data, valor_lancamentos, valor_venda_real, valor_taxas, valor_descontos, valor_abatimentos, valor_nao_comissionavel, ranking_vendedor_id, is_seguro_viagem, faixa_comissao, is_baixa_rac, status'
        )
        .gte('movimento_data', inicio)
        .lte('movimento_data', fim)
        .neq('is_baixa_rac', true)
        .limit(5000);
      concQ = applyCompanyScope(concQ, scope, empresaId);
      const { data: concRows, error: concErr } = await concQ;
      if (concErr) throw concErr;

      // Agrupar por documento (pegar único por documento, somando estornos)
      const porDocumento = new Map<string, RankingDebugConcEntry>();
      for (const r of (concRows || []) as RankingDebugConcRow[]) {
        const doc = String(r.documento || '').trim();
        if (!doc) continue;
        const status = String(r.status || '').toUpperCase();
        const existing = porDocumento.get(doc);
        if (!existing) {
          porDocumento.set(doc, { ...r, _estornado: status === 'ESTORNO' });
        } else {
          // Se houver ESTORNO, marca como estornado
          if (status === 'ESTORNO') existing._estornado = true;
        }
      }

      // Filtrar estornados e calcular valor_bruto para cada um
      const recibosAtivos: RankingDebugAuditoriaEntry[] = [];
      for (const r of porDocumento.values()) {
        if (r._estornado) continue;
        const lancamentos = Number(r.valor_lancamentos || 0);
        const descontos = Number(r.valor_descontos || 0);
        const abatimentos = Number(r.valor_abatimentos || 0);
        const naoComis = Math.max(0, Number(r.valor_nao_comissionavel || 0));
        const bruto = Math.max(0, lancamentos - descontos - abatimentos - naoComis);
        recibosAtivos.push({
          ...r,
          _bruto: bruto,
          _isSeguro:
            Boolean(r.is_seguro_viagem) ||
            SEGURO_FAIXAS_COMISSAO.has(String(r.faixa_comissao || ''))
        });
      }

      // 2. Resolver nomes dos vendedores
      const vendedorIdsSet = new Set<string>();
      for (const r of recibosAtivos) {
        if (r.ranking_vendedor_id) vendedorIdsSet.add(r.ranking_vendedor_id);
      }
      const nomesMap: Record<string, string> = {};
      const companyMap: Record<string, string> = {};
      const usoIndividualSet = new Set<string>();
      if (vendedorIdsSet.size > 0) {
        for (const vendedorBatch of chunkArray(Array.from(vendedorIdsSet))) {
          const { data: usersData } = await client
            .from('users')
            .select('id, nome_completo, company_id, active, uso_individual')
            .in('id', vendedorBatch);
          for (const u of usersData || []) {
            nomesMap[u.id] = u.nome_completo || u.id;
            companyMap[u.id] = u.company_id || '';
            if (u.uso_individual || !u.active) usoIndividualSet.add(u.id);
          }
        }
      }

      // 3. Agregar por vendedor
      const porVendedor: Record<
        string,
        {
          nome: string;
          total_bruto: number;
          total_seguro: number;
          qtd: number;
          recibos_sem_vendedor_bruto: number;
        }
      > = {};
      let semVendedorBruto = 0;
      let semVendedorQtd = 0;
      let invalidVendedorBruto = 0;
      const semVendedorRecibos: RankingDebugSemVendedorEntry[] = [];

      for (const r of recibosAtivos) {
        const vid = String(r.ranking_vendedor_id || '').trim();
        const isInvalid = vid && usoIndividualSet.has(vid);
        if (!vid || isInvalid) {
          semVendedorBruto += r._bruto;
          semVendedorQtd++;
          if (isInvalid) {
            invalidVendedorBruto += r._bruto;
            semVendedorRecibos.push({
              documento: r.documento,
              bruto: r._bruto,
              motivo: 'uso_individual',
              ranking_vendedor_nome: nomesMap[vid] || vid
            });
          } else {
            semVendedorRecibos.push({
              documento: r.documento,
              bruto: r._bruto,
              motivo: 'sem_ranking_vendedor_id',
              movimento_data: r.movimento_data
            });
          }
          continue;
        }
        if (!porVendedor[vid]) {
          porVendedor[vid] = {
            nome: nomesMap[vid] || vid,
            total_bruto: 0,
            total_seguro: 0,
            qtd: 0,
            recibos_sem_vendedor_bruto: 0
          };
        }
        porVendedor[vid].total_bruto += r._bruto;
        porVendedor[vid].qtd++;
        if (r._isSeguro) porVendedor[vid].total_seguro += r._bruto;
      }

      // 4. Comparar com metas externas
      const comparacao = Object.entries(porVendedor)
        .map(([vid, dados]) => {
          const primeiroNome = dados.nome.split(' ')[0].toUpperCase();
          // Tenta casar pelo primeiro nome
          let metaKey = Object.keys(metasExternas).find(
            (k) => primeiroNome.startsWith(k) || k.startsWith(primeiroNome)
          );
          // Casos especiais
          if (primeiroNome === 'LAZARO' || primeiroNome === 'LÁZARO') metaKey = 'LAZARO';
          if (primeiroNome === 'MARCIO' || primeiroNome === 'MÁRCIO') metaKey = 'MARCIO';
          if (primeiroNome === 'ANDRE' || primeiroNome === 'ANDRÉ') metaKey = 'ANDRE';
          const metaExterna = metaKey ? metasExternas[metaKey] : null;
          const diferenca =
            metaExterna != null ? Math.round((dados.total_bruto - metaExterna) * 100) / 100 : null;
          return {
            vendedor_id: vid,
            nome: dados.nome,
            qtd_recibos: dados.qtd,
            total_bruto_conciliacao: Math.round(dados.total_bruto * 100) / 100,
            total_seguro_conciliacao: Math.round(dados.total_seguro * 100) / 100,
            meta_fechamento_externo: metaExterna,
            diferenca_bruta: diferenca,
            pct_diferenca:
              metaExterna != null && metaExterna > 0
                ? Math.round((diferenca! / metaExterna) * 10000) / 100
                : null
          };
        })
        .sort((a, b) => b.total_bruto_conciliacao - a.total_bruto_conciliacao);

      return debugJson({
        periodo: `${inicio} a ${fim}`,
        total_recibos_ativos: recibosAtivos.length,
        total_sem_vendedor: semVendedorQtd,
        total_bruto_sem_vendedor: Math.round(semVendedorBruto * 100) / 100,
        total_bruto_invalido_uso_individual: Math.round(invalidVendedorBruto * 100) / 100,
        por_vendedor: comparacao,
        recibos_sem_vendedor: semVendedorRecibos.slice(0, 100)
      });
    }

    // ── Modo cross-referência: ?docs_por_vendedor=Andre&mes=2026-04 ──
    // Lista TODOS os documentos que o sistema atribui a um vendedor via conciliação
    // (fetchEffectiveConciliacaoReceipts logic), para comparar com relatório externo.
    // Inclui: documento, movimento_data, ranking_vendedor_id, linked_venda_id, linked_recibo_id
    const docsPorVendedor = sanitizePostgrestSearchTerm(
      event.url.searchParams.get('docs_por_vendedor'),
      80
    );
    if (docsPorVendedor.length >= 2) {
      const mesBusca2 = event.url.searchParams.get('mes') || '2026-04';
      const range2 = monthRangeFromKey(mesBusca2);
      if (!range2) {
        return debugJson({ error: 'Mes invalido.' }, { status: 400 });
      }
      const inicio2 = range2.inicio;
      const fim2 = range2.fim;

      // Encontrar usuário
      let usersQuery2 = client
        .from('users')
        .select('id, nome_completo')
        .ilike('nome_completo', `%${docsPorVendedor}%`)
        .limit(5);
      usersQuery2 = applyCompanyScope(usersQuery2, scope, event.url.searchParams.get('empresa_id'));
      const { data: usersData2 } = await usersQuery2;
      const users2 = (usersData2 || []) as DebugUserRow[];
      const userIds2 = users2.map((u) => String(u.id || '').trim()).filter(Boolean);
      if (userIds2.length === 0)
        return debugJson({ erro: `Nenhum usuário encontrado com nome "${docsPorVendedor}"` });

      // Buscar TODOS os registros de conciliação do período com ranking_vendedor_id desse usuário
      const { data: concRows2, error: concErr2 } = await client
        .from('conciliacao_recibos')
        .select(
          'id, documento, status, movimento_data, valor_lancamentos, valor_venda_real, valor_taxas, valor_descontos, valor_abatimentos, valor_nao_comissionavel, ranking_vendedor_id, venda_id, venda_recibo_id'
        )
        .in('ranking_vendedor_id', userIds2)
        .gte('movimento_data', inicio2)
        .lte('movimento_data', fim2)
        .neq('is_baixa_rac', true)
        .order('documento', { ascending: true });
      if (concErr2) throw concErr2;

      // Agrupar por documento, dedup (ignorar ESTORNO)
      const docMap2 = new Map<string, RankingDebugDocumentoRow & { _estornado?: boolean }>();
      for (const r of (concRows2 || []) as RankingDebugDocumentoRow[]) {
        const doc = String(r.documento || '').trim();
        const status = String(r.status || '').toUpperCase();
        if (!doc) continue;
        const existing = docMap2.get(doc);
        if (!existing) {
          docMap2.set(doc, { ...r, _estornado: status === 'ESTORNO' });
        } else {
          if (status === 'ESTORNO') existing._estornado = true;
        }
      }
      const recibosAtivos2 = Array.from(docMap2.values()).filter((r) => !r._estornado);

      // Extrair o "core" numérico de cada documento para comparação
      const resultado: RankingDebugDocumentoResumo[] = recibosAtivos2.map((r) => {
        const doc = String(r.documento || '').trim();
        const digits = doc.replace(/\D/g, '');
        const core =
          digits.length >= 10
            ? digits.slice(-10).replace(/^0+/, '') || digits.slice(-10)
            : digits.replace(/^0+/, '') || digits;
        const lanc = Number(r.valor_lancamentos || 0);
        const desc = Number(r.valor_descontos || 0);
        const abat = Number(r.valor_abatimentos || 0);
        const naoC = Math.max(0, Number(r.valor_nao_comissionavel || 0));
        const bruto = Math.max(0, lanc - desc - abat - naoC);
        return {
          documento: doc,
          core_numerico: core,
          movimento_data: r.movimento_data,
          status: r.status,
          valor_lancamentos: r.valor_lancamentos,
          valor_bruto_calculado: Math.round(bruto * 100) / 100,
          valor_taxas: r.valor_taxas,
          linked_venda_id: r.venda_id,
          linked_recibo_id: r.venda_recibo_id
        };
      });

      const totalBruto2 = resultado.reduce((s: number, r) => s + r.valor_bruto_calculado, 0);

      return debugJson({
        vendedor_buscado: docsPorVendedor,
        usuarios_encontrados: usersData2,
        periodo: `${inicio2} a ${fim2}`,
        total_documentos_atribuidos: resultado.length,
        total_bruto: Math.round(totalBruto2 * 100) / 100,
        documentos: resultado
      });
    }

    const docsParam = event.url.searchParams.get('docs') || '084185,083862,084186';
    const docNumbers: string[] = [];
    for (const doc of docsParam.split(',')) {
      const trimmed = doc.trim();
      if (trimmed) docNumbers.push(trimmed);
    }

    // Monta variações do número: com e sem prefixo 5630-0000
    const docVariants: string[] = [];
    for (const doc of docNumbers) {
      docVariants.push(doc);
      docVariants.push(`5630-0000${doc}`);
    }

    // 1. Buscar linhas de conciliacao_recibos
    let concRowsQuery = client
      .from('conciliacao_recibos')
      .select(
        'id, documento, status, descricao, movimento_data, valor_lancamentos, valor_venda_real, venda_id, venda_recibo_id, ranking_vendedor_id, company_id'
      )
      .in('documento', docVariants)
      .order('movimento_data', { ascending: true });
    concRowsQuery = applyCompanyScope(
      concRowsQuery,
      scope,
      event.url.searchParams.get('empresa_id')
    );
    const { data: concRows, error: concErr } = await concRowsQuery;
    if (concErr) throw concErr;

    // 2. Resolver nomes dos vendedores atribuídos
    const vendedorIdsToResolve = new Set<string>();
    for (const r of concRows || []) {
      if (r.ranking_vendedor_id) vendedorIdsToResolve.add(r.ranking_vendedor_id);
    }
    const vendedorNomes: Record<string, string> = {};
    if (vendedorIdsToResolve.size > 0) {
      for (const vendedorBatch of chunkArray(Array.from(vendedorIdsToResolve))) {
        const { data: usersData } = await client
          .from('users')
          .select('id, nome_completo')
          .in('id', vendedorBatch);
        for (const u of usersData || []) {
          vendedorNomes[u.id] = u.nome_completo || u.id;
        }
      }
    }

    const enrichedRows = ((concRows || []) as RankingDebugConcRow[]).map((r) => ({
      ...r,
      ranking_vendedor_nome:
        vendedorNomes[String(r.ranking_vendedor_id || '')] ||
        r.ranking_vendedor_id ||
        '(sem vendedor)'
    }));

    return debugJson(
      {
        docs_pesquisados: docVariants,
        conciliacao_rows: enrichedRows,
        resumo: {
          linhas_encontradas: enrichedRows.length
        }
      },
      { headers: DEBUG_HEADERS }
    );
  } catch (err) {
    logServerError('[ranking-debug] erro GET', err);
    const response = toErrorResponse(err, 'Erro no diagnóstico do ranking.');
    for (const [key, value] of Object.entries(DEBUG_HEADERS)) response.headers.set(key, value);
    return response;
  }
}

export async function handleRelatoriosRankingDebugPost(event: RequestEvent) {
  try {
    if (!isDebugEndpointEnabled(event)) {
      return debugJson({ error: 'Not found' }, { status: 404 });
    }
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_RANKING_DEBUG_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    if (!canMutateRankingDebug(scope)) {
      return debugJson({ error: 'Sem acesso.' }, { status: 403 });
    }

    const body: RankingDebugPostBody =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as RankingDebugPostBody)
        : {};
    const { action, id } = body;

    if (!id || typeof id !== 'string') {
      return debugJson({ error: 'id é obrigatório' }, { status: 400 });
    }

    const { data: registroRec, error: registroError } = await client
      .from('conciliacao_recibos')
      .select('company_id')
      .eq('id', id)
      .maybeSingle();
    if (registroError) throw registroError;
    if (!registroRec) return debugJson({ error: 'Registro não encontrado.' }, { status: 404 });

    const companyIdRec = String(registroRec?.company_id || '').trim() || null;
    if (!canAccessCompany(scope, companyIdRec)) {
      return debugJson({ error: 'Sem acesso à empresa do recibo.' }, { status: 403 });
    }

    if (action === 'fix_vendor') {
      const { vendedor_id } = body;
      if (!vendedor_id) return debugJson({ error: 'vendedor_id é obrigatório' }, { status: 400 });

      // Nunca permitir atribuição de "Equipe vtur" como vendedor de um recibo
      const equipeVturVendedor = await findEquipeVturVendedor(client, companyIdRec);
      if (equipeVturVendedor?.id && vendedor_id === equipeVturVendedor.id) {
        return debugJson(
          { error: 'Não é permitido atribuir "Equipe vtur" como vendedor de um recibo.' },
          { status: 422 }
        );
      }
      const { data: vendedorRow, error: vendedorError } = await client
        .from('users')
        .select(
          'id, nome_completo, email, company_id, active, uso_individual, participa_ranking, user_types(name)'
        )
        .eq('id', vendedor_id)
        .maybeSingle();
      if (vendedorError) throw vendedorError;
      if (
        !vendedorRow ||
        vendedorRow.company_id !== companyIdRec ||
        !isRankingEligibleUser(vendedorRow)
      ) {
        return debugJson(
          { error: 'Vendedor fora do escopo da empresa ou inelegível para ranking.' },
          { status: 422 }
        );
      }

      const { data, error } = await client
        .from('conciliacao_recibos')
        .update({
          ranking_vendedor_id: vendedor_id,
          ranking_assigned_by: user.id,
          ranking_assigned_at: new Date().toISOString(),
          last_checked_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('id, documento, ranking_vendedor_id, ranking_assigned_by, ranking_assigned_at');
      if (error) throw error;
      // Muda o vendedor do ranking: limpa cache em memoria/KV da empresa
      // (o read model persistido ja e marcado dirty pelo trigger do banco).
      invalidateSalesReadModels({ companyIds: companyIdRec ? [companyIdRec] : [] });
      return debugJson({ ok: true, updated: data });
    } else if (action === 'fix_valor') {
      const updates: RankingDebugValorUpdate = {};
      if (body.valor_lancamentos != null)
        updates.valor_lancamentos = Number(body.valor_lancamentos);
      if (body.valor_venda_real != null) updates.valor_venda_real = Number(body.valor_venda_real);
      if (Object.keys(updates).length === 0) {
        return debugJson({ error: 'Nenhum valor fornecido para atualizar' }, { status: 400 });
      }

      const { data, error } = await client
        .from('conciliacao_recibos')
        .update(updates)
        .eq('id', id)
        .select('id, documento, valor_lancamentos, valor_venda_real');
      if (error) throw error;
      invalidateSalesReadModels({ companyIds: companyIdRec ? [companyIdRec] : [] });
      return debugJson({ ok: true, updated: data });
    } else {
      return debugJson({ error: `Ação desconhecida: ${action}` }, { status: 400 });
    }
  } catch (err) {
    logServerError('[ranking-debug] erro POST', err);
    const response = toErrorResponse(err, 'Erro na correção.');
    for (const [key, value] of Object.entries(DEBUG_HEADERS)) response.headers.set(key, value);
    return response;
  }
}
