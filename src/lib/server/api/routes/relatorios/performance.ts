/**
 * GET /api/v1/relatorios/performance?company_id=&mes=AAAA-MM
 *
 * Relatório de performance da agência. Pedido do usuário em 25/09/2026.
 * Quem vê: admin do sistema e master (empresas do seu escopo) e gestor (a própria empresa).
 * As vendas vêm das mesmas contribuições por recibo do Ranking/Dashboard; as regras de agregação
 * estão em `$lib/server/performance/performance.ts` (com testes).
 */
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureModuloAccess,
  fetchRankingVendedoresByCompanyIds,
  getAdminClient,
  isUuid,
  NO_MATCH_COMPANY_ID,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse,
} from '$lib/server/v1';
import { fetchVendasKpiReciboContributions, type VendasKpiReciboContribution } from '$lib/server/vendas-kpis';
import { getPlatformExecutionContext } from '$lib/server/readModelRebuild';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { addDaysISODate, diffDaysISODate, monthRangeFromKey, todayISODateLocal } from '$lib/date';
import { chunkArray } from '$lib/utils/array';
import { deriveStatus } from '../orcamentos/list';
import {
  montarRelatorioPerformance,
  type ContribuicaoPerformance,
  type OrcamentoPerformance,
  type PagamentoVenda,
  type PassageiroVenda,
} from '$lib/server/performance/performance';

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? '' : String(v));
const uniq = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.map((v) => str(v).trim()).filter(isUuid)));

async function selectIn(client: SupabaseClient, table: string, columns: string, column: string, ids: string[]): Promise<Row[]> {
  if (ids.length === 0) return [];
  const partes = await Promise.all(
    chunkArray(ids).map(async (lote) => {
      const { data, error } = await client.from(table).select(columns).in(column, lote).limit(10000);
      if (error) throw error;
      return (data || []) as unknown as Row[];
    }),
  );
  return partes.flat();
}

/** cidade_id → { cidade, país } */
async function resolverCidades(client: SupabaseClient, cidadeIds: string[]) {
  const cidades = await selectIn(client, 'cidades', 'id, nome, subdivisao_id', 'id', uniq(cidadeIds));
  const subdivisoes = await selectIn(client, 'subdivisoes', 'id, pais_id', 'id', uniq(cidades.map((c) => str(c.subdivisao_id))));
  const paises = await selectIn(client, 'paises', 'id, nome', 'id', uniq(subdivisoes.map((s) => str(s.pais_id))));
  const paisPorSub = new Map(subdivisoes.map((s) => [str(s.id), str(paises.find((p) => str(p.id) === str(s.pais_id))?.nome) || null]));
  return new Map(
    cidades.map((c) => [str(c.id), { cidade: str(c.nome) || null, pais: paisPorSub.get(str(c.subdivisao_id)) || null }]),
  );
}

async function enriquecerContribuicoes(client: SupabaseClient, contribs: VendasKpiReciboContribution[]) {
  const vendaIds = uniq(contribs.map((c) => c.vendaId));
  const reciboIds = uniq(contribs.map((c) => c.reciboId));
  const [vendas, recibos] = await Promise.all([
    selectIn(client, 'vendas', 'id, destino_cidade_id, data_embarque', 'id', vendaIds),
    selectIn(client, 'vendas_recibos', 'id, destino_cidade_id, data_inicio', 'id', reciboIds),
  ]);
  const vendaMap = new Map(vendas.map((v) => [str(v.id), v]));
  const reciboMap = new Map(recibos.map((r) => [str(r.id), r]));
  const cidades = await resolverCidades(client, [
    ...vendas.map((v) => str(v.destino_cidade_id)),
    ...recibos.map((r) => str(r.destino_cidade_id)),
  ]);

  return contribs.map((c): ContribuicaoPerformance => {
    const recibo = reciboMap.get(str(c.reciboId));
    const venda = vendaMap.get(str(c.vendaId));
    const cidadeId = str(recibo?.destino_cidade_id) || str(venda?.destino_cidade_id);
    const destino = cidades.get(cidadeId);
    return {
      vendaId: c.vendaId ? str(c.vendaId) : null,
      vendaKey: c.vendaKey,
      reciboNumero: c.reciboNumero || null,
      vendedorId: c.vendedorId || null,
      produtoNome: c.produtoNome || null,
      bruto: Number(c.bruto || 0),
      taxas: Number(c.taxas || 0),
      destinoPais: destino?.pais || null,
      destinoCidade: destino?.cidade || c.destinoNome || null,
      embarque: str(recibo?.data_inicio) || str(venda?.data_embarque) || null,
    };
  });
}

async function buscarPassageiros(client: SupabaseClient, vendaIds: string[]): Promise<PassageiroVenda[]> {
  const viagens = await selectIn(client, 'viagens', 'id, venda_id', 'venda_id', vendaIds);
  const vendaPorViagem = new Map(viagens.map((v) => [str(v.id), str(v.venda_id)]));
  const pax = await selectIn(client, 'viagem_passageiros', 'viagem_id, cliente_id', 'viagem_id', uniq(viagens.map((v) => str(v.id))));
  const clientes = await selectIn(client, 'clientes', 'id, nascimento', 'id', uniq(pax.map((p) => str(p.cliente_id))));
  const nascimento = new Map(clientes.map((c) => [str(c.id), str(c.nascimento) || null]));
  return pax
    .filter((p) => vendaPorViagem.get(str(p.viagem_id)) && str(p.cliente_id))
    .map((p) => ({
      vendaId: vendaPorViagem.get(str(p.viagem_id)) as string,
      clienteId: str(p.cliente_id),
      nascimento: nascimento.get(str(p.cliente_id)) ?? null,
    }));
}

async function buscarOrcamentos(client: SupabaseClient, userIds: string[], inicio: string, fim: string): Promise<OrcamentoPerformance[]> {
  if (userIds.length === 0) return [];
  const quotes = (
    await Promise.all(
      chunkArray(userIds).map(async (lote) => {
        const { data, error } = await client
          .from('quote')
          .select('id, status, status_negociacao, destino_cidade_id, data_embarque')
          .in('created_by', lote)
          .gte('created_at', `${inicio}T00:00:00`)
          .lte('created_at', `${fim}T23:59:59.999`)
          .limit(10000);
        if (error) throw error;
        return (data || []) as unknown as Row[];
      }),
    )
  ).flat();
  const itens = await selectIn(client, 'quote_item', 'quote_id, item_type, cidade_id, city_name, order_index', 'quote_id', uniq(quotes.map((q) => str(q.id))));
  const itensPorQuote = new Map<string, Row[]>();
  for (const item of itens) {
    const lista = itensPorQuote.get(str(item.quote_id)) || [];
    lista.push(item);
    itensPorQuote.set(str(item.quote_id), lista);
  }
  for (const lista of itensPorQuote.values()) lista.sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0));
  const cidades = await resolverCidades(client, [
    ...quotes.map((q) => str(q.destino_cidade_id)),
    ...itens.map((i) => str(i.cidade_id)),
  ]);

  return quotes.map((q) => {
    const lista = itensPorQuote.get(str(q.id)) || [];
    const cidadeId = str(q.destino_cidade_id) || str(lista.find((i) => str(i.cidade_id))?.cidade_id);
    const destino = cidades.get(cidadeId);
    const tipos = Array.from(new Set(lista.map((i) => str(i.item_type).trim()).filter(Boolean)));
    return {
      id: str(q.id),
      status: deriveStatus({ status: str(q.status) || null, status_negociacao: str(q.status_negociacao) || null }),
      produtos: tipos,
      destinoPais: destino?.pais || null,
      destinoCidade: destino?.cidade || str(lista.find((i) => str(i.city_name))?.city_name) || null,
      embarque: str(q.data_embarque) || null,
    };
  });
}

function anoAntes(iso: string) {
  const [a, m, d] = iso.split('-').map(Number);
  // 29/02 → 28/02 no ano anterior
  const ultimo = new Date(Date.UTC(a - 1, m, 0)).getUTCDate();
  return `${a - 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

export async function handleRelatoriosPerformanceGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['relatorios'], 1, 'Sem acesso a Relatórios.');
      if (!scope.isMaster && !scope.isGestor) {
        return json({ error: 'Relatório disponível para master e gestor.' }, { status: 403, headers: NO_STORE_HEADERS });
      }
    }

    const { searchParams } = event.url;
    const companyIds = resolveScopedCompanyIds(scope, searchParams.get('company_id'));
    const companyId = companyIds.length === 1 && companyIds[0] !== NO_MATCH_COMPANY_ID ? companyIds[0] : '';
    if (!companyId) {
      return json({ error: 'Selecione uma empresa do seu acesso.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const hoje = todayISODateLocal();
    const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(str(searchParams.get('mes'))) ? str(searchParams.get('mes')) : hoje.slice(0, 7);
    const range = monthRangeFromKey(mes);
    if (!range) return json({ error: 'Mês inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    // Dados até D-1 (ontem); mês passado vai até o último dia.
    const ontem = addDaysISODate(hoje, -1) as string;
    const corte = ontem < range.fim ? ontem : range.fim;
    const diasNoMes = (diffDaysISODate(range.inicio, range.fim) ?? 0) + 1;
    const diasAteCorte = corte < range.inicio ? 0 : (diffDaysISODate(range.inicio, corte) ?? 0) + 1;
    const fimConsulta = corte < range.inicio ? range.inicio : corte;

    const readModelOptions = {
      mode: 'stale-while-revalidate' as const,
      executionContext: getPlatformExecutionContext(event.platform),
      fallbackToRawOnReadError: true,
      fallbackToRawWhenEmpty: true,
    };

    const mesAnterior = monthRangeFromKey(addDaysISODate(range.inicio, -1)?.slice(0, 7) || '');

    const [companyRows, equipe, usuariosEmpresa, parametros, atualRaw, anteriorRaw] = await Promise.all([
      selectIn(client, 'companies', 'id, nome_fantasia, nome_empresa, owner_user_id', 'id', [companyId]),
      fetchRankingVendedoresByCompanyIds(client, [companyId]),
      selectIn(client, 'users', 'id, nome_completo, email', 'company_id', [companyId]),
      selectIn(client, 'parametros_comissao', 'company_id, usar_taxas_na_meta, foco_valor', 'company_id', [companyId]),
      diasAteCorte > 0
        ? fetchVendasKpiReciboContributions(client, { dataInicio: range.inicio, dataFim: fimConsulta, companyIds: [companyId], vendedorIds: [] }, readModelOptions)
        : Promise.resolve({ contributions: [] as VendasKpiReciboContribution[] }),
      diasAteCorte > 0
        ? fetchVendasKpiReciboContributions(client, { dataInicio: anoAntes(range.inicio), dataFim: anoAntes(fimConsulta), companyIds: [companyId], vendedorIds: [] }, readModelOptions)
        : Promise.resolve({ contributions: [] as VendasKpiReciboContribution[] }),
    ]);

    const company = companyRows[0] || {};
    const equipeIds = uniq(equipe.map((u) => u.id));
    const usuarioIds = uniq(usuariosEmpresa.map((u) => str(u.id)));

    const [atual, anoAnterior, metas, owner] = await Promise.all([
      enriquecerContribuicoes(client, atualRaw.contributions),
      enriquecerContribuicoes(client, anteriorRaw.contributions),
      equipeIds.length
        ? (async () => {
            const { data, error } = await client
              .from('metas_vendedor')
              .select('vendedor_id, meta_geral, periodo, ativo')
              .eq('ativo', true)
              .gte('periodo', range.inicio)
              .lte('periodo', range.fim)
              .in('vendedor_id', equipeIds)
              .limit(1000);
            if (error) throw error;
            return (data || []) as Row[];
          })()
        : Promise.resolve([] as Row[]),
      company.owner_user_id ? selectIn(client, 'users', 'id, nome_completo, email', 'id', [str(company.owner_user_id)]) : Promise.resolve([] as Row[]),
    ]);

    const vendaIdsAtual = uniq(atual.map((c) => c.vendaId));
    const vendaIdsAnterior = uniq(anoAnterior.map((c) => c.vendaId));
    const [passageiros, passageirosAnoAnterior, pagamentosRows, orcamentos, orcamentosMesAnterior] = await Promise.all([
      buscarPassageiros(client, vendaIdsAtual),
      buscarPassageiros(client, vendaIdsAnterior),
      selectIn(client, 'vendas_pagamentos', 'venda_id, forma_nome, valor_total', 'venda_id', vendaIdsAtual),
      buscarOrcamentos(client, usuarioIds, range.inicio, fimConsulta),
      mesAnterior ? buscarOrcamentos(client, usuarioIds, mesAnterior.inicio, mesAnterior.fim) : Promise.resolve([]),
    ]);

    const nomes: Record<string, string> = {};
    for (const u of [...usuariosEmpresa, ...equipe]) nomes[str((u as Row).id)] = str((u as Row).nome_completo) || str((u as Row).email);
    const faltando = uniq(atual.map((c) => c.vendedorId)).filter((id) => !nomes[id]);
    for (const u of await selectIn(client, 'users', 'id, nome_completo, email', 'id', faltando)) {
      nomes[str(u.id)] = str(u.nome_completo) || str(u.email);
    }

    const parametro = parametros[0];
    const relatorio = montarRelatorioPerformance({
      corte: diasAteCorte > 0 ? corte : range.inicio,
      diasNoMes,
      diasAteCorte,
      meta: metas.reduce((s, m) => s + Number(m.meta_geral || 0), 0),
      focoLiquido: str(parametro?.foco_valor).toLowerCase() === 'liquido',
      usarTaxasNaMeta: Boolean(parametro?.usar_taxas_na_meta),
      nomesVendedores: nomes,
      atual,
      anoAnterior,
      passageiros,
      passageirosAnoAnterior,
      pagamentos: pagamentosRows.map((p): PagamentoVenda => ({
        vendaId: str(p.venda_id),
        forma: str(p.forma_nome),
        valor: Number(p.valor_total || 0),
      })),
      orcamentos: diasAteCorte > 0 ? orcamentos : [],
      orcamentosMesAnterior,
    });

    return json(
      {
        empresa: {
          id: companyId,
          nome: str(company.nome_fantasia) || str(company.nome_empresa) || 'Empresa',
          responsavel: str(owner[0]?.nome_completo) || str(owner[0]?.email) || null,
        },
        mes,
        dadosAte: diasAteCorte > 0 ? corte : null,
        ...relatorio,
      },
      { headers: DYNAMIC_READ_HEADERS },
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao gerar o relatório de performance.');
  }
}
