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
  <div class="mb-3 text-sm text-slate-600">
    {filteredRecords.length} registro(s) no recorte atual.
  </div>
  {#if registrosLoading || loading}
    <LoadingState />
  {:else}
    <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table class="table-mobile-cards w-full min-w-[2050px] text-sm">
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
            <tr
              class="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
              tabindex="0"
              on:click={() => openDetails(row)}
              on:keydown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openDetails(row);
                }
              }}
            >
              <td data-label="Data" class="px-3 py-2">{formatDate(row.movimento_data)}</td>
              <td data-label="Documento" class="px-3 py-2">{formatDocumentoConciliacao(row)}</td>
              <td data-label="Status" class="px-3 py-2">{statusImportLabel(row.status)}</td>
              <td data-label="Recibo encontrado" class="px-3 py-2"
                >{row.venda_recibo_id ? 'Sim' : 'Não'}</td
              >
              <td data-label="Vendedor ranking" class="px-3 py-2"
                >{row.ranking_vendedor?.nome_completo || 'Não atribuído'}</td
              >
              <td data-label="Ranking" class="px-3 py-2"
                >{exigeRanking(row.status)
                  ? row.ranking_vendedor_id
                    ? 'OK'
                    : 'Pendente'
                  : '-'}</td
              >
              <td data-label="Meta dif." class="px-3 py-2"
                >{resolveMetaDifLabel(row.percentual_comissao_loja, row.ranking_produto?.nome)}</td
              >
              <td data-label="Lançamentos" class="px-3 py-2 text-right"
                >{formatMoney(row.valor_lancamentos)}</td
              >
              <td data-label="Taxas (arq)" class="px-3 py-2 text-right"
                >{formatMoney(row.valor_taxas)}</td
              >
              <td data-label="Descontos" class="px-3 py-2 text-right"
                >{formatMoney(row.valor_descontos)}</td
              >
              <td data-label="Abatimentos" class="px-3 py-2 text-right"
                >{formatMoney(row.valor_abatimentos)}</td
              >
              <td data-label="Não comissionável" class="px-3 py-2 text-right"
                >{formatMoney(row.valor_nao_comissionavel)}</td
              >
              <td data-label="Venda real" class="px-3 py-2 text-right"
                >{formatMoney(row.valor_venda_real)}</td
              >
              <td data-label="Comissão loja" class="px-3 py-2 text-right"
                >{formatMoney(row.valor_comissao_loja)}</td
              >
              <td data-label="% loja" class="px-3 py-2 text-right"
                >{formatPercent(row.percentual_comissao_loja)}</td
              >
              <td data-label="Total (sist)" class="px-3 py-2 text-right"
                >{formatMoney(row.sistema_valor_total)}</td
              >
              <td data-label="Taxas (sist)" class="px-3 py-2 text-right"
                >{formatMoney(row.sistema_valor_taxas)}</td
              >
              <td data-label="Diff total" class="px-3 py-2 text-right"
                >{formatMoney(row.diff_total)}</td
              >
              <td data-label="Diff taxas" class="px-3 py-2 text-right"
                >{formatMoney(row.diff_taxas)}</td
              >
              <td data-label="Conciliado" class="px-3 py-2">{row.conciliado ? 'Sim' : 'Não'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</Card>
