<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import { RefreshCcw } from '$lib/icons';
  import { formatDateTime } from './formatters';
  import type { ConciliacaoExecution } from './types';

  export let executions: ConciliacaoExecution[];
  export let executionsLoading: boolean;
  export let loadExecutions: () => void | Promise<void>;
</script>

<Card title="Execuções" color="financeiro" class="mb-6">
  <div class="mb-3 flex flex-wrap gap-2">
    <Button variant="secondary" on:click={loadExecutions}>
      <RefreshCcw size={16} class="mr-2" />
      Atualizar execuções
    </Button>
  </div>
  {#if executionsLoading}
    <LoadingState />
  {:else}
  <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
    <table class="table-mobile-cards min-w-[980px] w-full text-sm">
      <thead class="bg-slate-50 text-slate-700">
        <tr>
          <th class="px-3 py-2 text-center">Quando</th>
          <th class="px-3 py-2 text-center">Origem</th>
          <th class="px-3 py-2 text-right">Checados</th>
          <th class="px-3 py-2 text-right">Conciliados</th>
          <th class="px-3 py-2 text-right">Taxas atualizadas</th>
          <th class="px-3 py-2 text-right">Pendentes após execução</th>
          <th class="px-3 py-2 text-center">Status</th>
        </tr>
      </thead>
      <tbody>
        {#each executions as item}
          <tr class="border-t border-slate-100">
            <td class="px-3 py-2">{formatDateTime(item.created_at)}</td>
            <td class="px-3 py-2">{item.actor === 'user' ? 'manual' : 'cron'}</td>
            <td class="px-3 py-2 text-right">{item.checked}</td>
            <td class="px-3 py-2 text-right">{item.reconciled}</td>
            <td class="px-3 py-2 text-right">{item.updated_taxes}</td>
            <td class="px-3 py-2 text-right">{item.still_pending}</td>
            <td class="px-3 py-2">{item.status}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {/if}
</Card>
