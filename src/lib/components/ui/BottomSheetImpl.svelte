<script lang="ts">
  import { BottomSheet } from 'svelte-bottom-sheet';
  import { X } from '$lib/icons';
  import Button from './Button.svelte';

  interface Props {
    open?: boolean;
    title?: string;
    maxHeight?: number;
    snapPoints?: number[];
    startingSnapPoint?: number;
    position?: 'bottom' | 'top' | 'left' | 'right';
    showHandle?: boolean;
    showClose?: boolean;
    class_name?: string;
    onclose?: () => void;
    children?: import('svelte').Snippet;
  }

  let {
    open = $bindable(false),
    title = '',
    maxHeight = 0.85,
    snapPoints = [0.5, 0.85],
    startingSnapPoint = 1,
    position = 'bottom',
    showHandle = true,
    showClose = true,
    class_name = '',
    onclose,
    children
  }: Props = $props();

  function handleClose() {
    open = false;
    onclose?.();
  }
</script>

<BottomSheet
  bind:isSheetOpen={open}
  settings={{ maxHeight, snapPoints, startingSnapPoint, position }}
  onclose={handleClose}
>
  <BottomSheet.Overlay class="vtur-bottom-sheet__overlay">
    <BottomSheet.Sheet class="vtur-bottom-sheet__sheet {class_name}">
      {#if showHandle}
        <BottomSheet.Handle class="vtur-bottom-sheet__handle">
          <div class="vtur-bottom-sheet__handle-bar"></div>
        </BottomSheet.Handle>
      {/if}

      {#if title || showClose}
        <div class="vtur-bottom-sheet__header">
          {#if title}
            <h3 class="vtur-bottom-sheet__title">{title}</h3>
          {/if}
          {#if showClose}
            <Button
              variant="ghost"
              size="xs"
              class_name="vtur-bottom-sheet__close"
              ariaLabel="Fechar"
              on:click={handleClose}
            >
              <X size={18} />
            </Button>
          {/if}
        </div>
      {/if}

      <BottomSheet.Content class="vtur-bottom-sheet__content">
        {@render children?.()}
      </BottomSheet.Content>
    </BottomSheet.Sheet>
  </BottomSheet.Overlay>
</BottomSheet>

<style>
  :global(.vtur-bottom-sheet__overlay) {
    background-color: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(2px);
  }

  :global(.vtur-bottom-sheet__sheet) {
    background-color: #ffffff;
    border-top-left-radius: 1.25rem;
    border-top-right-radius: 1.25rem;
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.12);
    display: flex;
    flex-direction: column;
    max-height: 85vh;
  }

  :global(.vtur-bottom-sheet__handle) {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1rem 0.25rem;
    flex-shrink: 0;
  }

  :global(.vtur-bottom-sheet__handle-bar) {
    width: 2.5rem;
    height: 0.25rem;
    background-color: #cbd5e1;
    border-radius: 9999px;
  }

  :global(.vtur-bottom-sheet__header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 1rem 0.25rem;
    flex-shrink: 0;
  }

  :global(.vtur-bottom-sheet__title) {
    font-size: 1.125rem;
    font-weight: 600;
    color: #0f172a;
    margin: 0;
    flex: 1;
    min-width: 0;
  }

  :global(.vtur-bottom-sheet__close) {
    flex-shrink: 0;
    padding: 0.375rem;
    color: #64748b;
  }

  :global(.vtur-bottom-sheet__close:hover) {
    color: #0f172a;
  }

  :global(.vtur-bottom-sheet__content) {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 0.75rem 1rem 1.5rem;
    -webkit-overflow-scrolling: touch;
  }

  /* Inputs dentro do bottom sheet precisam de fonte legível em mobile.
     16px evita zoom automático no iOS Safari e melhora acessibilidade. */
  :global(.vtur-bottom-sheet__content .vtur-input),
  :global(.vtur-bottom-sheet__content input),
  :global(.vtur-bottom-sheet__content select),
  :global(.vtur-bottom-sheet__content textarea) {
    font-size: 16px !important;
  }

  :global(.vtur-bottom-sheet__content label) {
    font-size: 0.9375rem !important;
  }
</style>
