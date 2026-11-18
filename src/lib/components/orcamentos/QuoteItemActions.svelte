<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import { ArrowDown, ArrowUp, X } from '$lib/icons';

  export let index: number;
  export let total: number;
  export let inline = false;
  export let removeClass = 'shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600';

  export let onMove: (index: number, direction: -1 | 1) => void = () => {};
  export let onRemove: (index: number) => void = () => {};

  function hold(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function move(event: MouseEvent, direction: -1 | 1) {
    hold(event);
    onMove(index, direction);
  }

  function remove(event: MouseEvent) {
    hold(event);
    onRemove(index);
  }
</script>

<div
  class={inline
    ? 'quote-item-actions'
    : 'orc-item-acoes ml-auto flex shrink-0 flex-row items-center gap-1 sm:mt-1 sm:ml-0 sm:items-start'}
>
  <div class="flex flex-row gap-1">
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={index === 0}
      on:click={(event) => move(event, -1)}
      on:mousedown={hold}
      ariaLabel={`Mover item ${index + 1} para cima`}
      title="Mover para cima"
      class_name="quote-item-action max-sm:h-8! max-sm:w-8! max-sm:p-0!"
    >
      <ArrowUp size={16} />
    </Button>
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={index === total - 1}
      on:click={(event) => move(event, 1)}
      on:mousedown={hold}
      ariaLabel={`Mover item ${index + 1} para baixo`}
      title="Mover para baixo"
      class_name="quote-item-action max-sm:h-8! max-sm:w-8! max-sm:p-0!"
    >
      <ArrowDown size={16} />
    </Button>
  </div>
  {#if total > 1}
    <Button
      type="button"
      variant="ghost"
      size="sm"
      on:click={remove}
      on:mousedown={hold}
      class_name={`quote-item-action max-sm:h-8! max-sm:w-8! max-sm:p-0! ${removeClass}`}
      ariaLabel="Remover item"
      title="Remover item"
    >
      <X size={18} />
    </Button>
  {/if}
</div>
