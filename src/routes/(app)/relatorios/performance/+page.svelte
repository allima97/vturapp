<!--
  Relatório de performance da agência.
  Dados: GET /api/v1/relatorios/performance (regras em $lib/server/performance/performance.ts).
  Quem vê: admin do sistema e master (escolhem a empresa) e gestor (a própria empresa).
  "Baixar PDF": abre a impressão do navegador já formatada em A4 (Salvar como PDF).
-->
<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { replaceState } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldInput, FieldSelect } from '$lib/components/ui';
  import { ArrowLeft, Download, RefreshCw } from '$lib/icons';
  import { apiFetch, isCanceledApiError } from '$lib/services/api';
  import { permissoes } from '$lib/stores/permissoes';
  import { toUserMessage } from '$lib/utils/errors';
  import { formatYearMonthLabel } from '$lib/utils/formatters';
  import { todayISODateLocal, formatISODateBR } from '$lib/date';
  import Gauge from '$lib/components/relatorios/performance/Gauge.svelte';
  import BarList from '$lib/components/relatorios/performance/BarList.svelte';
  import VarPill from '$lib/components/relatorios/performance/VarPill.svelte';
  import { inteiro, moeda, moedaCurta, percentual, valorCurto } from '$lib/components/relatorios/performance/formato';
  import type { RelatorioPerformance } from '$lib/server/performance/performance';

  type Resposta = RelatorioPerformance & {
    empresa: { id: string; nome: string; responsavel: string | null };
    mes: string;
    dadosAte: string | null;
  };

  const BUSINESS_COR: Record<string, string> = {
    Consolidadora: 'bg-blue-400',
    Internacional: 'bg-orange-500',
    Marítimo: 'bg-slate-400',
    Nacional: 'bg-amber-400',
    'Não informado': 'bg-slate-200'
  };
  const BUSINESS_ORDEM = ['Consolidadora', 'Internacional', 'Marítimo', 'Nacional', 'Não informado'];

  let empresas: Array<{ id: string; nome: string }> = [];
  let empresaId = '';
  let mes = todayISODateLocal().slice(0, 7);
  let dados: Resposta | null = null;
  let loading = false;
  let erro: string | null = null;
  let controller: AbortController | null = null;
  let seq = 0;

  $: podeVer = !$permissoes.ready || $permissoes.isSystemAdmin || $permissoes.isMaster || $permissoes.isGestor;
  $: escolheEmpresa = empresas.length > 1 || $permissoes.isSystemAdmin;
  $: mesLabel = formatYearMonthLabel(mes);

  async function carregarEmpresas() {
    try {
      const base = await apiFetch<{ empresas?: Array<{ id: string; nome: string; active?: boolean }> }>('/api/v1/relatorios/base', {
        redirectOnForbidden: false
      });
      empresas = (base.empresas || []).filter((e) => e.id).map((e) => ({ id: e.id, nome: e.nome }));
      if (!empresaId && empresas.length > 0) empresaId = empresas[0].id;
    } catch (err) {
      if (!isCanceledApiError(err)) empresas = [];
    }
  }

  async function carregar(semCache = false) {
    if (!podeVer) return;
    if (!empresaId && escolheEmpresa) return;
    const atual = ++seq;
    controller?.abort();
    const c = new AbortController();
    controller = c;
    loading = true;
    erro = null;
    try {
      const resposta = await apiFetch<Resposta>('/api/v1/relatorios/performance', {
        query: { company_id: empresaId || undefined, mes },
        signal: c.signal,
        timeoutMs: 120_000,
        noCache: semCache
      });
      if (atual !== seq) return;
      dados = resposta;
      const params = new URLSearchParams({ mes });
      if (empresaId) params.set('empresa', empresaId);
      replaceState(`/relatorios/performance?${params.toString()}`, {});
    } catch (err) {
      if (isCanceledApiError(err) || atual !== seq) return;
      dados = null;
      erro = toUserMessage(err, 'Erro ao gerar o relatório.');
    } finally {
      if (atual === seq) loading = false;
    }
  }

  async function baixarPdf() {
    if (!dados) return;
    const tituloAnterior = document.title;
    document.title = `Performance - ${dados.empresa.nome} - ${mes}`;
    await tick();
    window.print();
    document.title = tituloAnterior;
  }

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get('mes') || '';
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) mes = m;
    empresaId = params.get('empresa') || '';
    await carregarEmpresas();
    await carregar();
  });

  onDestroy(() => controller?.abort());

  function barraBusiness(valores: Partial<Record<string, number>>) {
    return BUSINESS_ORDEM.filter((b) => (valores[b] || 0) > 0).map((b) => ({ nome: b, pct: valores[b] || 0 }));
  }

  function rotuloAntecipacao(item: { mes: string; ano: string }) {
    return `${item.mes} · ${item.ano}`;
  }
</script>

<svelte:head>
  <title>Relatório de Performance | VTUR</title>
</svelte:head>

<div class="performance-controles" data-print-hide>
  <PageHeader
    title="Relatório de Performance"
    subtitle="Resumo do mês por agência: vendas, metas, produtos, destinos e orçamentos."
    color="financeiro"
    actions={[{ label: 'Relatórios', href: '/relatorios', variant: 'secondary', icon: ArrowLeft }]}
    breadcrumbs={[{ label: 'Relatórios', href: '/relatorios' }, { label: 'Performance' }]}
  />

  {#if podeVer}
    <div class="vtur-card mb-6 flex flex-wrap items-end gap-4 p-4">
      {#if escolheEmpresa}
        <FieldSelect
          id="perf-empresa"
          label="Empresa (agência)"
          bind:value={empresaId}
          placeholder={null}
          options={empresas.map((e) => ({ value: e.id, label: e.nome }))}
          class_name="min-w-[16rem]"
          on:change={() => carregar()}
        />
      {/if}
      <FieldInput id="perf-mes" type="month" label="Mês" bind:value={mes} on:change={() => carregar()} />
      <div class="ml-auto flex gap-2">
        <Button variant="secondary" on:click={() => carregar(true)} loading={loading} ariaLabel="Atualizar relatório">
          <RefreshCw size={16} class="mr-1.5" /> Atualizar
        </Button>
        <Button variant="primary" on:click={baixarPdf} disabled={!dados || loading}>
          <Download size={16} class="mr-1.5" /> Baixar PDF
        </Button>
      </div>
    </div>
  {/if}
</div>

{#if !podeVer}
  <div class="vtur-card p-6 text-sm text-slate-600" role="status">O Relatório de Performance está disponível para master e gestor.</div>
{:else if erro}
  <div role="alert" class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
{:else if loading && !dados}
  <div class="grid grid-cols-2 gap-4 md:grid-cols-4" aria-busy="true" aria-label="Gerando relatório">
    {#each Array(8) as _}<div class="vtur-card h-32 animate-pulse bg-slate-100"></div>{/each}
  </div>
{:else if dados}
  {@const v = dados.vendas}
  <article class="performance space-y-5" aria-busy={loading ? 'true' : undefined} aria-labelledby="perf-titulo">
    <!-- Cabeçalho do relatório -->
    <header class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#1c16a8] px-5 py-3 text-white">
      <p class="text-sm"><span class="font-semibold">Filial:</span> {dados.empresa.nome}</p>
      {#if dados.empresa.responsavel}<p class="text-sm"><span class="font-semibold">Responsável:</span> {dados.empresa.responsavel}</p>{/if}
      <p class="text-right text-xs">Dados até<br /><span class="text-sm font-semibold">{dados.dadosAte ? formatISODateBR(dados.dadosAte) : '—'}</span></p>
    </header>

    <h2 id="perf-titulo" class="text-xl font-bold text-slate-900">Relatório de Performance · <span class="capitalize">{formatYearMonthLabel(dados.mes)}</span></h2>

    <!-- KPIs -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.4fr)] print:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.4fr)]!">
      <div class="grid gap-4">
        <div class="vtur-card p-4">
          <p class="text-sm text-slate-500">Venda Mês</p>
          <p class="text-3xl font-bold text-slate-900">{moedaCurta(v.vendaMes)}</p>
          <VarPill valor={v.variacaoAnoAnterior} legenda="/Ano anterior" />
        </div>
        <div class="vtur-card p-4">
          <p class="text-sm text-slate-500">Venda Consolidadora Mês</p>
          <p class="text-3xl font-bold text-slate-900">{moedaCurta(v.vendaConsolidadora)}</p>
          <VarPill valor={v.variacaoVendaConsolidadora} legenda="/Ano anterior" />
        </div>
      </div>
      <div class="grid gap-4">
        <div class="vtur-card p-4">
          <p class="text-sm text-slate-500">Meta Mês (até D-1)</p>
          <p class="text-3xl font-bold text-slate-900">{moedaCurta(v.metaAteCorte)}</p>
          <VarPill texto={valorCurto(v.gapAteCorte)} negativo={v.gapAteCorte < 0} legenda="Gap (até D-1)" />
        </div>
        <div class="vtur-card p-4">
          <p class="text-sm text-slate-500">Meta Mês (total)</p>
          <p class="text-3xl font-bold text-slate-900">{moedaCurta(v.metaMes)}</p>
          <VarPill texto={valorCurto(v.gapMes)} negativo={v.gapMes < 0} legenda="Gap mês" />
        </div>
      </div>
      <div class="grid gap-4">
        <Gauge titulo="% ICM Mês (até D-1)" valor={v.icmAteCorte} />
        <Gauge titulo="% ICM Mês (total)" valor={v.icmMes} />
      </div>
      <div class="grid gap-4">
        <div class="vtur-card p-4">
          <p class="text-sm text-slate-500">Passageiros Mês</p>
          <p class="text-3xl font-bold text-slate-900">{inteiro(v.passageiros)}</p>
          <VarPill valor={v.variacaoPassageiros} legenda="/Ano anterior" />
        </div>
        <div class="vtur-card p-4">
          <p class="text-sm text-slate-500">Ticket Médio Mês</p>
          <p class="text-3xl font-bold text-slate-900">{moedaCurta(v.ticketMedio)}</p>
          <VarPill valor={v.variacaoTicket} legenda="/Ano anterior" />
        </div>
      </div>
      <BarList titulo="Top 10 Vendedores" itens={dados.topVendedores} />
    </div>

    <!-- Produtos + Business por produto + Faixa etária / Formas de pagamento -->
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,0.9fr)] print:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,0.9fr)]!">
      <section class="vtur-card p-4" aria-label="Produtos">
        <div class="overflow-x-auto">
        <table class="w-full min-w-[520px] text-sm">
          <caption class="sr-only">Venda por produto</caption>
          <thead>
            <tr class="border-b border-slate-200 text-left text-xs text-slate-600">
              <th class="py-2 pr-2 font-semibold">Produtos</th>
              <th class="py-2 pr-2 text-right font-semibold">Venda Mês</th>
              <th class="py-2 pr-2 text-right font-semibold">% Ano anterior</th>
              <th class="py-2 pr-2 text-right font-semibold">Passageiros Mês</th>
              <th class="py-2 text-right font-semibold">TKM Mês</th>
            </tr>
          </thead>
          <tbody>
            {#each dados.produtos as p, i}
              <tr class={i % 2 ? 'bg-slate-50' : ''}>
                <td class="py-1.5 pr-2 text-slate-800">{p.nome}</td>
                <td class="py-1.5 pr-2 text-right tabular-nums">{moeda(p.venda)}</td>
                <td class="py-1.5 pr-2 text-right tabular-nums {p.variacaoAnoAnterior != null && p.variacaoAnoAnterior < 0 ? 'text-red-700' : 'text-emerald-700'}">
                  {#if p.variacaoAnoAnterior == null}—{:else}{p.variacaoAnoAnterior < 0 ? '▼' : '▲'} {percentual(p.variacaoAnoAnterior)}{/if}
                </td>
                <td class="py-1.5 pr-2 text-right tabular-nums">{inteiro(p.passageiros)}</td>
                <td class="py-1.5 text-right tabular-nums">{p.ticketMedio == null ? '' : moeda(p.ticketMedio)}</td>
              </tr>
            {:else}
              <tr><td colspan="5" class="py-6 text-center text-slate-500">Sem vendas no período.</td></tr>
            {/each}
          </tbody>
          <tfoot>
            <tr class="border-t border-slate-200 font-bold">
              <td class="py-2 pr-2">Total</td>
              <td class="py-2 pr-2 text-right tabular-nums">{moeda(dados.totalProdutos.venda)}</td>
              <td class="py-2 pr-2 text-right tabular-nums">{percentual(dados.totalProdutos.variacaoAnoAnterior)}</td>
              <td class="py-2 pr-2 text-right tabular-nums">{inteiro(dados.totalProdutos.passageiros)}</td>
              <td class="py-2 text-right tabular-nums">{dados.totalProdutos.ticketMedio == null ? '' : moeda(dados.totalProdutos.ticketMedio)}</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </section>

      <section class="vtur-card p-4" aria-label="Business por produto">
        <div class="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span class="font-semibold text-slate-800">Business</span>
          {#each BUSINESS_ORDEM.slice(0, 4) as b}
            <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full {BUSINESS_COR[b]}"></span>{b}</span>
          {/each}
        </div>
        <ul class="space-y-2">
          {#each dados.produtos as p}
            <li class="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-xs">
              <span class="truncate text-right text-slate-700">{p.nome}</span>
              <span class="flex h-5 overflow-hidden rounded-sm bg-slate-100" aria-label={barraBusiness(p.business).map((b) => `${b.nome} ${percentual(b.pct)}`).join(', ')}>
                {#each barraBusiness(p.business) as b}
                  <span class="flex h-5 items-center justify-center text-[10px] font-medium text-slate-900 {BUSINESS_COR[b.nome]}" style={`width:${b.pct}%`}>
                    {b.pct >= 12 ? percentual(b.pct) : ''}
                  </span>
                {/each}
              </span>
            </li>
          {/each}
        </ul>
      </section>

      <div class="grid gap-4">
        <BarList titulo="Faixa Etária" itens={dados.faixaEtaria.map((f) => ({ nome: f.nome, pct: f.pct }))} vazio="Sem data de nascimento dos passageiros." />
        <BarList titulo="Top 5 Formas de Pagamento" itens={dados.formasPagamento} />
      </div>
    </div>

    <!-- Business venda -->
    <section class="vtur-card p-4" aria-label="Business Venda">
      <h3 class="text-sm font-semibold text-slate-800">Business Venda</h3>
      <div class="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4 print:grid-cols-4!">
        {#each dados.business as b}
          <div>
            <p class="text-xs font-medium text-slate-600">{b.nome}</p>
            <div class="mt-1 h-4 rounded-sm bg-slate-100">
              <div class="flex h-4 items-center justify-center rounded-sm bg-amber-400 text-[10px] font-semibold" style={`width:${Math.max(b.pct, 0).toFixed(1)}%`}>{b.pct >= 12 ? percentual(b.pct) : ''}</div>
            </div>
            <p class="mt-0.5 text-xs text-slate-600">{percentual(b.pct)} · {moedaCurta(b.valor)}</p>
          </div>
        {/each}
      </div>
    </section>

    <!-- Destinos e antecipação -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 print:grid-cols-4!">
      <BarList titulo="Top 10 Destinos (Nacional)" itens={dados.topDestinosNacional} />
      <BarList titulo="Top 10 Destinos (Internacional)" itens={dados.topDestinosInternacional} />
      <BarList titulo="Antecipação de Compra (Nacional)" subtitulo="% da venda por mês de embarque" itens={dados.antecipacaoNacional.map((a) => ({ nome: rotuloAntecipacao(a), pct: a.pct }))} />
      <BarList titulo="Antecipação de Compra (Internacional)" subtitulo="% da venda por mês de embarque" itens={dados.antecipacaoInternacional.map((a) => ({ nome: rotuloAntecipacao(a), pct: a.pct }))} />
    </div>

    <!-- Orçamentos -->
    <h2 class="pt-2 text-xl font-bold text-slate-900">Orçamentos</h2>
    {#if dados.orcamentos.total === 0}
      <div class="vtur-card p-6 text-sm text-slate-600">
        Nenhum orçamento cadastrado neste mês. Cadastre uma proposta em Orçamentos › Novo Orçamento.
      </div>
    {:else}
      <section class="vtur-card p-4" aria-label="Orçamentos por produto">
        <div class="overflow-x-auto">
        <table class="w-full min-w-[720px] text-sm">
          <caption class="sr-only">Orçamentos por produto e business</caption>
          <thead>
            <tr class="text-left text-xs text-slate-600">
              <th class="py-1 font-semibold">Business</th>
              <th colspan="3" class="py-1 font-semibold">Internacional</th>
              <th colspan="3" class="py-1 font-semibold">Nacional</th>
              <th colspan="3" class="py-1 font-semibold">Total</th>
            </tr>
            <tr class="border-b border-slate-200 text-right text-xs text-slate-600">
              <th class="py-2 text-left font-semibold">Produto</th>
              {#each [0, 1, 2] as _}
                <th class="py-2 font-semibold"># Orçamentos Mês</th>
                <th class="py-2 font-semibold">% Mês Anterior</th>
                <th class="py-2 font-semibold">% Conv. Mês</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each dados.orcamentos.porProduto as p, i}
              <tr class="text-right tabular-nums {i % 2 ? 'bg-slate-50' : ''}">
                <td class="py-1.5 text-left text-slate-800">{p.nome}</td>
                {#each [p.internacional, p.nacional, p.total] as col, j}
                  <td class="py-1.5 {j === 2 ? 'font-semibold' : ''}">{col.quantidade ? inteiro(col.quantidade) : ''}</td>
                  <td class="py-1.5 {col.variacaoMesAnterior != null && col.variacaoMesAnterior < 0 ? 'text-red-700' : ''}">{col.quantidade ? percentual(col.variacaoMesAnterior) : ''}</td>
                  <td class="py-1.5">{col.quantidade ? percentual(col.conversao) : ''}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr class="border-t border-slate-200 text-right font-bold tabular-nums">
              <td class="py-2 text-left">Total</td>
              {#each [dados.orcamentos.totais.internacional, dados.orcamentos.totais.nacional, dados.orcamentos.totais.total] as col}
                <td class="py-2">{inteiro(col.quantidade)}</td>
                <td class="py-2">{percentual(col.variacaoMesAnterior)}</td>
                <td class="py-2">{percentual(col.conversao)}</td>
              {/each}
            </tr>
          </tfoot>
        </table>
        </div>
      </section>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 print:grid-cols-4!">
        <BarList titulo="Business Orçamentos" itens={dados.orcamentos.business} cor="bg-blue-400" />
        {#each [{ t: 'Top 10 Destinos (Nacional)', d: dados.orcamentos.topDestinosNacional }, { t: 'Top 10 Destinos (Internacional)', d: dados.orcamentos.topDestinosInternacional }] as bloco}
          <BarList
            titulo={bloco.t}
            subtitulo={`% Orç. Mês · % Conv. Mês (total ${percentual(bloco.d.conversao)})`}
            cor="bg-blue-400"
            itens={bloco.d.itens.map((d) => ({ nome: d.nome, pct: d.pct, extra: `${percentual(d.pct)} · ${percentual(d.conversao)}` }))}
          />
        {/each}
        <div class="grid gap-4">
          <BarList titulo="Antecipação Nacional (Orçamentos)" cor="bg-blue-400" itens={dados.orcamentos.antecipacaoNacional.map((a) => ({ nome: rotuloAntecipacao(a), pct: a.pct }))} />
          <BarList titulo="Antecipação Internacional (Orçamentos)" cor="bg-blue-400" itens={dados.orcamentos.antecipacaoInternacional.map((a) => ({ nome: rotuloAntecipacao(a), pct: a.pct }))} />
        </div>
      </div>
    {/if}

    <p class="text-xs text-slate-500">
      Valores lançados no VTUR (mesma base do Ranking e do Dashboard). Venda Consolidadora = recibos de operadoras consolidadoras. Meta até D-1 proporcional aos dias corridos.
      Passageiros: os da venda, sem repetir. Orçamentos: os cadastrados no VTUR; conversão = aprovados + fechados.
    </p>
  </article>
{/if}

<style>
  @media print {
    @page {
      size: A4;
      margin: 8mm;
    }
    :global(.vtur-topbar),
    :global(.vtur-skip-link),
    :global(aside),
    :global([data-print-hide]) {
      display: none !important;
    }
    :global(.vtur-layout) {
      margin: 0 !important;
      padding: 0 !important;
    }
    :global(body) {
      background: #fff !important;
    }
    .performance {
      zoom: 0.5;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .performance :global(section),
    .performance :global(.vtur-card) {
      break-inside: avoid;
      box-shadow: none !important;
    }
  }
</style>
