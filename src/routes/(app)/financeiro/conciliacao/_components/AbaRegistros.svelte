<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import {
    exigeRanking,
    formatDate,
    formatDocumentoConciliacao,
    formatMoney,
    formatPercent,
    resolveMetaDifLabel,
    statusImportLabel
  } from './formatters';
  import type { ConciliacaoItem } from './types';

  export let filteredRecords: ConciliacaoItem[];
  export let registrosLoading: boolean;
  export let loading: boolean;
  export let openDetails: (row: ConciliacaoItem) => void | Promise<void>;
</script>

<Card title="Registros" color="financeiro" class="mb-6">
  <div class="mb-3 text-sm text-slate-600">{filteredRecords.length} registro(s) no recorte atual.</div>
  {#if registrosLoading || loading}
    <LoadingState />
  {:else}
  <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
    <table class="table-mobile-cards min-w-[2050px] w-full text-sm">
      <thead class="bg-slate-50 text-slate-700">
        <tr>
          <th class="px-3 py-2 text-center">Data</th>
          <th class="px-3 py-2 text-center">Documento</th>
          <th class="px-3 py-2 text-center">Status</th>
          <th class="px-3 py-2 text-center">Recibo encontrado</th>
          <th class="px-3 py-2 text-center">Vendedor ranking</th>
          <th class="px-3 py-2 text-center">Ranking</th>
          <th class="px-3 py-2 text-center">Meta dif.</th>
          <th class="px-3 py-2 text-right">Lançamentos</th>
          <th class="px-3 py-2 text-right">Taxas (arq)</th>
          <th class="px-3 py-2 text-right">Descontos</th>
          <th class="px-3 py-2 text-right">Abatimentos</th>
          <th class="px-3 py-2 text-right">Não comissionável</th>
          <th class="px-3 py-2 text-right">Venda real</th>
          <th class="px-3 py-2 text-right">Comissão loja</th>
          <th class="px-3 py-2 text-right">% loja</th>
          <th class="px-3 py-2 text-right">Total (sist)</th>
          <th class="px-3 py-2 text-right">Taxas (sist)</th>
          <th class="px-3 py-2 text-right">Diff total</th>
          <th class="px-3 py-2 text-right">Diff taxas</th>
          <th class="px-3 py-2 text-center">Conciliado</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredRecords as row}
          <tr class="cursor-pointer border-t border-slate-100 hover:bg-slate-50" on:click={() => openDetails(row)}>
            <td class="px-3 py-2">{formatDate(row.movimento_data)}</td>
            <td class="px-3 py-2">{formatDocumentoConciliacao(row)}</td>
            <td class="px-3 py-2">{statusImportLabel(row.status)}</td>
            <td class="px-3 py-2">{row.venda_recibo_id ? 'Sim' : 'Não'}</td>
            <td class="px-3 py-2">{row.ranking_vendedor?.nome_completo || 'Não atribuído'}</td>
            <td class="px-3 py-2">{exigeRanking(row.status) ? (row.ranking_vendedor_id ? 'OK' : 'Pendente') : '-'}</td>
            <td class="px-3 py-2">{resolveMetaDifLabel(row.percentual_comissao_loja, row.ranking_produto?.nome)}</td>
            <td class="px-3 py-2 text-right">{formatMoney(row.valor_lancamentos)}</td>
            <td class="px-3 py-2 text-right">{formatMoney(row.valor_taxas)}</td>
            <td class="px-3 py-2 text-right">{formatMoney(row.valor_descontos)}</td>
            <td class="px-3 py-2 text-right">{formatMoney(row.valor_abatimentos)}</td>
            <td class="px-3 py-2 text-right">{formatMoney(row.valor_nao_comissionavel)}</td>
            <td class="px-3 py-2 text-right">{formatMoney(row.valor_venda_real)}</td>
            <td class="px-3 py-2 text-right">{formatMoney(row.valor_comissao_loja)}</td>
            <td class="px-3 py-2 text-right">{formatPercent(row.percentual_comissao_loja)}</td>
            <td class="px-3 py-2 text-right">{formatMoney(row.sistema_valor_total)}</td>
            <td class="px-3 py-2 text-right">{formatMoney(row.sistema_valor_taxas)}</td>
            <td class="px-3 py-2 text-right">{formatMoney(row.diff_total)}</td>
            <td class="px-3 py-2 text-right">{formatMoney(row.diff_taxas)}</td>
            <td class="px-3 py-2">{row.conciliado ? 'Sim' : 'Não'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {/if}
</Card>
