<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import { RefreshCcw } from '$lib/icons';
  import { formatDateTime, formatMoney } from './formatters';
  import type { ConciliacaoChange } from './types';

  export let changes: ConciliacaoChange[];
  export let alteracoesPendentes: ConciliacaoChange[];
  export let changesLoading: boolean;
  export let reverting: boolean;
  export let loadChanges: () => void | Promise<void>;
  export let revertPendingChanges: () => void | Promise<void>;
</script>

<Card title="Histórico de alterações" color="financeiro" class="mb-6">
  <div class="mb-3 flex flex-wrap gap-2">
    <Button variant="secondary" on:click={loadChanges}><RefreshCcw size={16} class="mr-2" />Atualizar lista</Button>
    <Button variant="secondary" on:click={revertPendingChanges} disabled={alteracoesPendentes.length === 0} loading={reverting}>
      <RefreshCcw size={16} class="mr-2" />Reverter pendentes
    </Button>
  </div>
  {#if changesLoading}
    <LoadingState />
  {:else}
  <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
    <table class="table-mobile-cards min-w-[980px] w-full text-sm">
      <thead class="bg-slate-50 text-slate-700">
        <tr>
          <th class="px-3 py-2 text-center">Quando</th>
          <th class="px-3 py-2 text-center">Recibo</th>
          <th class="px-3 py-2 text-center">Campo</th>
          <th class="px-3 py-2 text-right">Taxa (antes)</th>
          <th class="px-3 py-2 text-right">Taxa (novo)</th>
          <th class="px-3 py-2 text-center">Origem</th>
          <th class="px-3 py-2 text-center">Por</th>
          <th class="px-3 py-2 text-center">Revertido</th>
        </tr>
      </thead>
      <tbody>
        {#each changes as item}
          <tr class="border-t border-slate-100">
            <td class="px-3 py-2">{formatDateTime(item.changed_at)}</td>
            <td class="px-3 py-2">{item.numero_recibo || '-'}</td>
            <td class="px-3 py-2">{item.field}</td>
            <td class="px-3 py-2 text-right">{formatMoney(item.old_value)}</td>
            <td class="px-3 py-2 text-right">{formatMoney(item.new_value)}</td>
            <td class="px-3 py-2">{item.actor === 'user' ? 'manual' : 'cron'}</td>
            <td class="px-3 py-2">{item.changed_by_user?.nome_completo || item.changed_by_user?.email || '-'}</td>
            <td class="px-3 py-2">{item.reverted_at ? formatDateTime(item.reverted_at) : 'Pendente'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {/if}
</Card>
