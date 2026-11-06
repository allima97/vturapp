<!--
  Fase 5.3: Placar de vendas da equipe (aprovado pelo usuário em 25/09/2026).

  Tela para acompanhar o mês (inclusive numa TV, em tela cheia). NÃO tem cálculo próprio:
  usa a mesma API do Ranking de vendas (/api/v1/relatorios/ranking), a mesma ordem (posicao),
  os mesmos percentuais (alcance_meta, e total/meta do resumo) e as mesmas cores de atingimento.
  Quem pode ver: o mesmo público do pódio do Ranking (admin do sistema, master e gestor).
  Atualiza sozinho a cada minuto enquanto a aba está visível.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import {
    ArrowLeft,
    Maximize,
    Minus,
    RefreshCw,
    TrendingDown,
    TrendingUp,
    Trophy
  } from '$lib/icons';
  import { formatYearMonthLabel } from '$lib/utils/formatters';
  import { toUserMessage } from '$lib/utils/errors';
  import { permissoes } from '$lib/stores/permissoes';
  import { apiFetch, isCanceledApiError } from '$lib/services/api';
  import { monthRangeFromKey, todayISODateLocal } from '$lib/date';
  import { clamp, getAtingimentoColor, percentualDaMeta } from '$lib/features/ranking/atingimento';

  interface VendedorRanking {
    posicao: number;
    vendedor_id: string;
    vendedor_nome: string;
    total_vendas: number;
    total_receita: number;
    total_seguro: number;
    alcance_meta: number;
    meta: number;
    tendencia: 'up' | 'down' | 'stable';
  }

  interface Resumo {
    meta_mes: number;
    meta_seguro: number;
    total_receita: number;
    total_seguro: number;
    total_vendas: number;
  }

  const ATUALIZAR_A_CADA_MS = 60_000;
  const BRL = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  });
  const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

  let mes = todayISODateLocal().slice(0, 7);
  let vendedores: VendedorRanking[] = [];
  let resumo: Resumo = {
    meta_mes: 0,
    meta_seguro: 0,
    total_receita: 0,
    total_seguro: 0,
    total_vendas: 0
  };
  let loading = true;
  let atualizando = false;
  let errorMessage: string | null = null;
  let atualizadoEm: Date | null = null;
  let requestSeq = 0;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let placarEl: HTMLElement | null = null;
  let telaCheia = false;

  async function carregar(manual = false) {
    const seq = ++requestSeq;
    controller?.abort();
    const atual = new AbortController();
    controller = atual;
    if (manual) atualizando = true;
    errorMessage = null;
    const range = monthRangeFromKey(mes);
    try {
      const data = await apiFetch<{ items: VendedorRanking[]; resumo: Resumo }>(
        '/api/v1/relatorios/ranking',
        {
          method: 'GET',
          timeoutMs: 120_000,
          // "Atualizar" manual busca de novo; a automática usa o mesmo cache curto do ranking.
          cacheTtlMs: 30_000,
          noCache: manual,
          signal: atual.signal,
          query: { data_inicio: range?.inicio || `${mes}-01`, data_fim: range?.fim || `${mes}-01` }
        }
      );
      if (seq !== requestSeq) return;
      vendedores = data.items || [];
      resumo = { ...resumo, ...(data.resumo || {}) };
      atualizadoEm = new Date();
    } catch (err: unknown) {
      if (isCanceledApiError(err) || seq !== requestSeq) return;
      errorMessage = toUserMessage(err, 'Erro ao carregar o placar.');
    } finally {
      if (seq === requestSeq) {
        loading = false;
        atualizando = false;
        if (controller === atual) controller = null;
      }
    }
  }

  function iniciarAtualizacao() {
    pararAtualizacao();
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') void carregar();
    }, ATUALIZAR_A_CADA_MS);
  }

  function pararAtualizacao() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function handleVisibilidade() {
    // Ao voltar para a aba, atualiza na hora (sem esperar o próximo minuto).
    if (document.visibilityState === 'visible') void carregar();
  }

  async function alternarTelaCheia() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await placarEl?.requestFullscreen();
    } catch {
      // navegador sem suporte ou bloqueado: segue na tela normal
    }
  }

  function handleFullscreenChange() {
    telaCheia = document.fullscreenElement === placarEl && placarEl !== null;
  }

  onMount(() => {
    const param = new URLSearchParams(window.location.search).get('mes') || '';
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(param)) mes = param;
    void carregar();
    iniciarAtualizacao();
    document.addEventListener('visibilitychange', handleVisibilidade);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
  });

  onDestroy(() => {
    pararAtualizacao();
    controller?.abort();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilidade);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }
  });

  // Mesmo público do pódio no Ranking de vendas.
  $: podeVer =
    !$permissoes.ready || $permissoes.isSystemAdmin || $permissoes.isMaster || $permissoes.isGestor;
  $: mesLabel = formatYearMonthLabel(mes);
  $: pctVendas = percentualDaMeta(resumo.total_receita, resumo.meta_mes);
  $: pctSeguro = percentualDaMeta(resumo.total_seguro, resumo.meta_seguro);
  $: podio = vendedores.slice(0, 3);
  $: atingiramMeta = vendedores.filter(
    (v) => Number(v.meta || 0) > 0 && Number(v.alcance_meta || 0) >= 100
  ).length;

  const MEDALHA = [
    {
      borda: 'border-t-amber-400',
      fundo: 'bg-amber-50/60',
      texto: 'text-amber-700',
      icone: 'text-amber-500'
    },
    {
      borda: 'border-t-slate-400',
      fundo: 'bg-slate-50/60',
      texto: 'text-slate-600',
      icone: 'text-slate-500'
    },
    {
      borda: 'border-t-orange-400',
      fundo: 'bg-orange-50/60',
      texto: 'text-orange-700',
      icone: 'text-orange-500'
    }
  ];
</script>

<svelte:head>
  <title>Placar de Vendas | VTUR</title>
</svelte:head>

<PageHeader
  title="Placar de Vendas"
  subtitle="Acompanhamento do mês da equipe, com atualização automática."
  color="financeiro"
  actions={[
    { label: 'Ranking', href: '/relatorios/ranking', variant: 'secondary', icon: ArrowLeft }
  ]}
  breadcrumbs={[
    { label: 'Relatórios', href: '/relatorios' },
    { label: 'Ranking de Vendas', href: '/relatorios/ranking' },
    { label: 'Placar' }
  ]}
/>

{#if !podeVer}
  <div class="vtur-card p-6 text-sm text-slate-600" role="status">
    O placar da equipe está disponível para gestores. Veja sua posição no
    <a href="/relatorios/ranking" class="font-medium text-blue-700 underline">Ranking de vendas</a>.
  </div>
{:else}
  <section
    bind:this={placarEl}
    class="placar space-y-6 {telaCheia ? 'overflow-y-auto bg-slate-50 p-6 sm:p-10' : ''}"
    aria-labelledby="placar-titulo"
    aria-busy={loading ? 'true' : undefined}
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2
          id="placar-titulo"
          class="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl"
        >
          <Trophy size={24} class="text-amber-500" aria-hidden="true" />
          <span class="capitalize">{mesLabel}</span>
        </h2>
        <p class="text-sm text-slate-500" aria-live="polite">
          {#if atualizadoEm}
            Atualizado às {HORA.format(atualizadoEm)} · atualiza sozinho a cada minuto
          {:else if loading}
            Carregando…
          {/if}
        </p>
      </div>
      <div class="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          on:click={() => carregar(true)}
          loading={atualizando}
          ariaLabel="Atualizar placar agora"
        >
          <RefreshCw size={16} class="mr-1.5" /> Atualizar
        </Button>
        <Button variant="secondary" size="sm" on:click={alternarTelaCheia} ariaPressed={telaCheia}>
          <Maximize size={16} class="mr-1.5" />
          {telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
        </Button>
      </div>
    </div>

    {#if errorMessage}
      <div
        role="alert"
        class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {errorMessage}
      </div>
    {/if}

    <!-- Totais da equipe -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      {#each [{ titulo: 'Vendas da equipe', valor: resumo.total_receita, meta: resumo.meta_mes, pct: pctVendas }, { titulo: 'Seguro viagem', valor: resumo.total_seguro, meta: resumo.meta_seguro, pct: pctSeguro }] as bloco}
        <div class="vtur-card p-5">
          <p class="text-sm font-medium text-slate-500">{bloco.titulo}</p>
          <p class="mt-1 text-3xl font-black tracking-tight text-slate-900 tabular-nums">
            {BRL.format(bloco.valor || 0)}
          </p>
          {#if bloco.meta > 0}
            <div
              class="mt-3 h-3 w-full rounded-full bg-slate-200"
              role="progressbar"
              aria-label={`${bloco.titulo}: ${bloco.pct.toFixed(1)}% da meta`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Number(clamp(bloco.pct, 0, 100).toFixed(1))}
            >
              <div
                class="h-3 rounded-full transition-all"
                style={`width:${clamp(bloco.pct, 0, 100).toFixed(1)}%;background:${getAtingimentoColor(bloco.pct)};`}
              ></div>
            </div>
            <p class="mt-1 text-sm text-slate-600">
              <strong class="text-slate-900">{bloco.pct.toFixed(1)}%</strong> da meta de {BRL.format(
                bloco.meta
              )}
            </p>
          {:else}
            <p class="mt-3 text-sm text-slate-500">Sem meta cadastrada</p>
          {/if}
        </div>
      {/each}
      <div class="vtur-card grid grid-cols-2 gap-4 p-5">
        <div>
          <p class="text-sm font-medium text-slate-500">Vendas no mês</p>
          <p class="mt-1 text-3xl font-black text-slate-900 tabular-nums">{resumo.total_vendas}</p>
        </div>
        <div>
          <p class="text-sm font-medium text-slate-500">Bateram a meta</p>
          <p class="mt-1 text-3xl font-black text-emerald-700 tabular-nums">{atingiramMeta}</p>
        </div>
      </div>
    </div>

    {#if loading && vendedores.length === 0}
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-hidden="true">
        {#each [0, 1, 2] as _}
          <div class="vtur-card h-40 animate-pulse bg-slate-100"></div>
        {/each}
      </div>
    {:else if vendedores.length === 0}
      <div class="vtur-card p-10 text-center text-slate-500">
        Nenhuma venda registrada em {mesLabel}.
      </div>
    {:else}
      <!-- Pódio -->
      <ol class="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Pódio">
        {#each podio as v, i (v.vendedor_id)}
          <li class="vtur-card border-t-4 p-5 text-center {MEDALHA[i].borda} {MEDALHA[i].fundo}">
            <div class="flex items-center justify-center gap-2">
              <Trophy size={i === 0 ? 30 : 24} class={MEDALHA[i].icone} aria-hidden="true" />
              <span class="text-3xl font-black {MEDALHA[i].texto}">{v.posicao}º</span>
            </div>
            <p class="mt-2 truncate text-lg font-semibold text-slate-900">{v.vendedor_nome}</p>
            <p class="text-financeiro-700 mt-1 text-2xl font-black tabular-nums">
              {BRL.format(v.total_receita || 0)}
            </p>
            <p class="mt-1 text-sm text-slate-600">{v.total_vendas} venda(s)</p>
            {#if v.meta > 0}
              <div class="mt-3 h-2 w-full rounded-full bg-slate-200" aria-hidden="true">
                <div
                  class="h-2 rounded-full"
                  style={`width:${clamp(v.alcance_meta, 0, 100).toFixed(1)}%;background:${getAtingimentoColor(v.alcance_meta)};`}
                ></div>
              </div>
              <p class="mt-1 text-sm font-medium text-slate-700">
                {Number(v.alcance_meta || 0).toFixed(1)}% da meta
              </p>
            {/if}
          </li>
        {/each}
      </ol>

      <!-- Todos -->
      <div class="vtur-card overflow-hidden">
        <h3 class="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
          Equipe
        </h3>
        <ol class="divide-y divide-slate-100" aria-label="Classificação da equipe">
          {#each vendedores as v (v.vendedor_id)}
            {@const pct = Number(v.alcance_meta || 0)}
            <li
              class="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-5 py-3 sm:grid-cols-[2.5rem_minmax(8rem,1fr)_minmax(10rem,2fr)_auto_auto] {v.meta >
                0 && pct >= 100
                ? 'bg-emerald-50'
                : ''}"
            >
              <span class="text-lg font-black text-slate-500 tabular-nums">{v.posicao}º</span>
              <span class="min-w-0 truncate font-semibold text-slate-900">{v.vendedor_nome}</span>
              <div class="hidden sm:block">
                {#if v.meta > 0}
                  <div class="h-2.5 w-full rounded-full bg-slate-200" aria-hidden="true">
                    <div
                      class="h-2.5 rounded-full"
                      style={`width:${clamp(pct, 0, 100).toFixed(1)}%;background:${getAtingimentoColor(pct)};`}
                    ></div>
                  </div>
                {:else}
                  <span class="text-xs text-slate-500">Sem meta</span>
                {/if}
              </div>
              <span class="text-right">
                <span class="block font-bold text-slate-900 tabular-nums"
                  >{BRL.format(v.total_receita || 0)}</span
                >
                <span class="block text-xs text-slate-500 tabular-nums">
                  {v.meta > 0 ? `${pct.toFixed(1)}% da meta` : `${v.total_vendas} venda(s)`}
                </span>
              </span>
              <span class="hidden w-20 sm:block">
                {#if v.tendencia === 'up'}
                  <span class="flex items-center gap-1 text-xs font-medium text-green-700"
                    ><TrendingUp size={14} aria-hidden="true" /> Alta</span
                  >
                {:else if v.tendencia === 'down'}
                  <span class="flex items-center gap-1 text-xs font-medium text-red-700"
                    ><TrendingDown size={14} aria-hidden="true" /> Queda</span
                  >
                {:else}
                  <span class="flex items-center gap-1 text-xs font-medium text-slate-500"
                    ><Minus size={14} aria-hidden="true" /> Estável</span
                  >
                {/if}
              </span>
            </li>
          {/each}
        </ol>
      </div>
    {/if}
  </section>
{/if}
