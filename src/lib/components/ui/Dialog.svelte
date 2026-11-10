<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Modal } from './flowbite-legacy';
  import Button from './Button.svelte';
  import { dialogLabel, nextDialogLabelId } from './dialogLabel';

  type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';
  type DialogColor =
    | 'clientes'
    | 'orcamentos'
    | 'operacao'
    | 'financeiro'
    | 'vendas'
    | 'blue'
    | 'green'
    | 'orange'
    | 'teal';

  export let open = false;
  export let title = '';
  export let size: DialogSize = 'md';
  export let color: DialogColor = 'blue';
  export let dismissable = true;
  export let respectAppShell = false;

  export let showCancel = true;
  export let cancelText = 'Cancelar';
  export let showConfirm = false;
  export let confirmText = 'Confirmar';
  export let confirmVariant: 'primary' | 'danger' = 'primary';
  export let loading = false;

  export let description: string | null = null;
  export let maxWidth: string | null = null;
  export let confirmDisabled = false;

  export let onCancel: ((e?: Event) => void) | undefined = undefined;
  export let onConfirm: ((e?: Event) => void) | undefined = undefined;
  export let onclose: ((e?: Event) => void) | undefined = undefined;

  // Acessibilidade (Fase 3.6): o título e a descrição nomeiam o role="dialog".
  const labelId = nextDialogLabelId();
  const descriptionId = `${labelId}-desc`;

  const dispatch = createEventDispatcher<{
    cancel: Event | undefined;
    confirm: Event | undefined;
    close: Event | undefined;
  }>();

  const toneClasses: Record<DialogColor, string> = {
    clientes: 'vtur-dialog--clientes',
    orcamentos: 'vtur-dialog--orcamentos',
    operacao: 'vtur-dialog--operacao',
    financeiro: 'vtur-dialog--financeiro',
    vendas: 'vtur-dialog--vendas',
    blue: 'vtur-dialog--clientes',
    green: 'vtur-dialog--vendas',
    orange: 'vtur-dialog--financeiro',
    teal: 'vtur-dialog--operacao'
  };

  const sizeMap: Record<DialogSize, 'sm' | 'md' | 'lg' | 'xl'> = {
    sm: 'sm',
    md: 'md',
    lg: 'lg',
    xl: 'xl',
    full: 'xl'
  };

  function emitClose(e?: Event) {
    onclose?.(e);
    dispatch('close', e);
  }

  function handleCancel(e?: Event) {
    open = false;
    onCancel?.(e);
    dispatch('cancel', e);
    emitClose(e);
  }

  function handleConfirm(e?: Event) {
    onConfirm?.(e);
    dispatch('confirm', e);
  }

  $: dialogToneClass = toneClasses[color] ?? toneClasses.blue;
  $: dialogSize = sizeMap[size] ?? 'md';
  $: contentClass =
    size === 'full' ? 'vtur-dialog__surface vtur-dialog__surface--full' : 'vtur-dialog__surface';
  $: dialogClass = respectAppShell
    ? 'vtur-dialog-shell vtur-dialog-shell--respect-app'
    : 'vtur-dialog-shell';
  $: inlineStyle = maxWidth ? `max-width:${maxWidth};` : undefined;
</script>

<Modal
  bind:open
  title=""
  size={dialogSize}
  autoclose={false}
  outsideclose={dismissable}
  {dismissable}
  class={contentClass}
  classDialog={dialogClass}
  classBackdrop="vtur-dialog-backdrop"
  on:close={(e) => {
    if (!open) emitClose(e);
  }}
>
  <svelte:fragment slot="header">
    <div class={`vtur-dialog__accent ${dialogToneClass}`.trim()}></div>
    <div class="vtur-dialog__header">
      <div class="min-w-0">
        <h3
          id={labelId}
          class="vtur-dialog__title"
          use:dialogLabel={{ labelId, descriptionId: description ? descriptionId : null }}
        >
          {title}
        </h3>
        {#if description}
          <p id={descriptionId} class="vtur-dialog__description">{description}</p>
        {/if}
      </div>
    </div>
  </svelte:fragment>

  <div class="vtur-dialog__body" style={inlineStyle}>
    <slot />
  </div>

  <svelte:fragment slot="footer">
    {#if showCancel || showConfirm || $$slots.actions}
      <div class="vtur-dialog__footer">
        <div class="vtur-dialog__footer-actions">
          {#if showCancel}
            <Button variant="secondary" on:click={handleCancel} disabled={loading}>
              {cancelText}
            </Button>
          {/if}
          {#if showConfirm}
            <Button
              variant={confirmVariant}
              color={confirmVariant === 'primary' ? color : undefined}
              on:click={handleConfirm}
              disabled={confirmDisabled}
              {loading}
            >
              {confirmText}
            </Button>
          {/if}
          <slot name="actions" />
        </div>
      </div>
    {/if}
  </svelte:fragment>
</Modal>
