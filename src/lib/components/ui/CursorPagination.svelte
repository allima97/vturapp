<script lang="ts">
  import Button from './Button.svelte';

  export let page = 1;
  export let hasPrevious = false;
  export let hasNext = false;
  export let loading = false;
  export let onPrevious: (() => void) | undefined = undefined;
  export let onNext: (() => void) | undefined = undefined;
</script>

<nav class="cursor-pagination" aria-label="Paginação de clientes">
  <span aria-live="polite">Página {page}</span>
  <div>
    <Button
      variant="outline"
      size="sm"
      disabled={!hasPrevious || loading}
      on:click={() => onPrevious?.()}
    >Anterior</Button>
    <Button
      variant="outline"
      size="sm"
      disabled={!hasNext || loading}
      loading={loading}
      on:click={() => onNext?.()}
    >Próxima</Button>
  </div>
</nav>

<style>
  .cursor-pagination {
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:.75rem;
    margin-top:1rem;
    color:var(--vtur-text-secondary);
    font-size:.9rem;
  }
  .cursor-pagination > div { display:flex; gap:.5rem; }
  @media (max-width:32rem) {
    .cursor-pagination { align-items:stretch; flex-direction:column; }
    .cursor-pagination > div { display:grid; grid-template-columns:1fr 1fr; }
  }
</style>
