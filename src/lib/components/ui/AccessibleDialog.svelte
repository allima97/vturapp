<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { createEventDispatcher } from 'svelte';

  export let open = false;
  export let labelledBy: string;
  export let describedBy: string | undefined = undefined;
  export let dismissable = true;
  export let className = '';

  let element: HTMLDialogElement;
  let returnFocusTo: HTMLElement | null = null;
  const dispatch = createEventDispatcher<{ close: void }>();

  onMount(() => {
    const observer = new MutationObserver(() => syncDialogState());
    observer.observe(element, { attributes: true, attributeFilter: ['data-open'] });
    syncDialogState();
    return () => observer.disconnect();
  });

  $: if (element) syncDialogState(open);

  function syncDialogState(requestedOpen = open) {
    if (!element) return;
    const shouldOpen = requestedOpen || element.hasAttribute('data-open');
    if (shouldOpen && !element.open) {
      returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
      void focusDialogContent();
    } else if (!shouldOpen && element.open) {
      element.close();
    }
  }

  async function focusDialogContent() {
    await tick();
    element.querySelector<HTMLElement>('[autofocus], input, select, textarea, button, a[href]')?.focus();
  }

  function handleClose() {
    open = false;
    dispatch('close');
    queueMicrotask(() => {
      returnFocusTo?.focus();
      returnFocusTo = null;
    });
  }

  function handleClick(event: MouseEvent) {
    if (dismissable && event.target === element) element.close();
  }
</script>

<dialog
  bind:this={element}
  aria-labelledby={labelledBy}
  aria-describedby={describedBy}
  class={`vtur-accessible-dialog ${className}`.trim()}
  on:close={handleClose}
  on:click={handleClick}
>
  <slot />
</dialog>

<style>
  dialog.vtur-accessible-dialog {
    width: min(calc(100% - 1.25rem), 42rem);
    max-height: min(90dvh, 54rem);
    padding: 0;
    overflow: auto;
    border: 1px solid var(--vtur-border-subtle);
    border-radius: var(--vtur-radius-card);
    color: var(--vtur-text);
    background: var(--vtur-surface);
    box-shadow: 0 24px 90px rgb(15 23 42 / 24%);
  }

  dialog.vtur-accessible-dialog::backdrop {
    background: rgb(15 23 42 / 55%);
    backdrop-filter: blur(2px);
  }

  @media (max-width: 40rem) {
    dialog.vtur-accessible-dialog {
      width: calc(100% - 1rem);
      max-height: 94dvh;
    }
  }
</style>
