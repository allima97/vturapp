<script lang="ts">
  import Button from './Button.svelte';
  export let name = '';
  export let email = '';
  export let onOpen: ((event: MouseEvent) => void) | undefined = undefined;
</script>

<div class="client-name-cell">
  <Button type="button" variant="unstyled" size="sm" class_name="client-name" on:click={(event) => { event.stopPropagation(); onOpen?.(event); }}>{name}</Button>
  <small>{email}</small>
</div>

<style>
  :global(.client-name) { border:0; padding:0; color:var(--vtur-primary-700); background:transparent; font-weight:750; text-align:left; cursor:pointer; }
  small { display:block; margin-top:.2rem; color:var(--vtur-text-secondary); }
</style>
