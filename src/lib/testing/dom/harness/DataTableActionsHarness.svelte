<script lang="ts">
  import DataTable from '$lib/components/ui/DataTable.svelte';

  export let onOpen: (row: { id: string; nome: string }) => void;
  export let onDelete: (row: { id: string; nome: string }) => void;
  export let clickable = true;
  export let actionsFor: (row: { id: string; nome: string }) => boolean = () => true;

  const data = [
    { id: 'a', nome: 'Ana' },
    { id: 'b', nome: 'Bruno' }
  ];
</script>

<DataTable
  {data}
  columns={[{ key: 'nome', label: 'Nome' }]}
  searchable={false}
  filterable={false}
  exportable={false}
  onRowClick={clickable ? onOpen : undefined}
  rowActionsAvailable={actionsFor}
>
  <svelte:fragment slot="row-actions" let:row>
    {#if actionsFor(row)}
      <button type="button" on:click={() => onDelete(row)}>Excluir</button>
    {/if}
  </svelte:fragment>
</DataTable>
