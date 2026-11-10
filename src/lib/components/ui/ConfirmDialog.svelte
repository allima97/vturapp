<script lang="ts">
  import { AlertTriangle } from '$lib/icons';
  import Dialog from './Dialog.svelte';
  import type { ConfirmColor } from '$lib/stores/confirm';

  export let open = false;
  export let title = 'Confirmar ação';
  export let message = 'Tem certeza de que deseja continuar?';
  export let confirmLabel = 'Confirmar';
  export let cancelLabel = 'Cancelar';
  export let confirmVariant: 'primary' | 'danger' = 'primary';
  export let color: ConfirmColor = 'financeiro';
  export let loading = false;
  export let dismissable = false;

  export let onConfirm: (() => void) | undefined = undefined;
  export let onCancel: (() => void) | undefined = undefined;

  function handleCancel() {
    open = false;
    onCancel?.();
  }

  function handleConfirm() {
    onConfirm?.();
  }
</script>

<Dialog
  bind:open
  {title}
  {color}
  size="sm"
  {dismissable}
  showCancel={true}
  cancelText={cancelLabel}
  showConfirm={true}
  confirmText={confirmLabel}
  {confirmVariant}
  {loading}
  onCancel={handleCancel}
  onConfirm={handleConfirm}
>
  <div class="flex flex-col items-center gap-4 py-2 text-center">
    <div
      class="flex h-12 w-12 items-center justify-center rounded-full {confirmVariant === 'danger'
        ? 'bg-red-50 text-red-600'
        : 'bg-amber-50 text-amber-600'}"
    >
      <AlertTriangle size={26} />
    </div>
    {#if message}
      <p class="text-sm leading-relaxed text-slate-500">{message}</p>
    {/if}
    <slot />
  </div>
</Dialog>
