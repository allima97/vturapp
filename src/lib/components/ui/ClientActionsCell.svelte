<script lang="ts">
  import Button from './Button.svelte';
  export let onEdit: ((event: MouseEvent) => void) | undefined = undefined;
</script>

<Button variant="outline" size="sm" on:click={(event) => onEdit?.(event)}>Editar</Button>
