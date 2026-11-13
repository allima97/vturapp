<script lang="ts">
  import { fade } from 'svelte/transition';
  import { X, Edit, FileDown, Printer, Trash2, Copy } from '$lib/icons';
  import Button from '../ui/Button.svelte';
  import LoadingState from '../ui/LoadingState.svelte';
  import { buildVoucherPreviewDocument } from '../../vouchers/preview';
  import type {
    VoucherRecord,
    VoucherAssetRecord,
    VoucherLogoEsquerdo
  } from '../../vouchers/types';
  import { createEventDispatcher } from 'svelte';
  import { isMobile } from '$lib/stores/ui';
  import { onMount } from 'svelte';

  export let open = false;
  export let voucher: VoucherRecord | null = null;
  export let assets: VoucherAssetRecord[] = [];
  export let logoEsquerdo: VoucherLogoEsquerdo = 'vtur';

  let sidebarCollapsed = false;

  // Detecta se a sidebar está colapsada lendo a classe do DOM
  function checkSidebarCollapsed() {
    sidebarCollapsed = !!document.querySelector('.vtur-sidebar--collapsed');
  }

  onMount(() => {
    checkSidebarCollapsed();
    // Observa mudanças de classe na sidebar
    const sidebar = document.querySelector('.vtur-sidebar');
    if (sidebar) {
      const observer = new MutationObserver(checkSidebarCollapsed);
      observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
      return () => observer.disconnect();
    }
  });

  $: if (open) checkSidebarCollapsed();

  $: contentLeft = $isMobile
    ? '0px'
    : sidebarCollapsed
      ? 'calc(1rem + 90px + 1rem)'
      : 'calc(1rem + var(--vtur-sidebar-width) + 1rem)';

  let iframe: HTMLIFrameElement;

  $: docHtml = open && voucher ? buildVoucherPreviewDocument(voucher, assets, logoEsquerdo) : '';

  const dispatch = createEventDispatcher();

  function close() {
    open = false;
    voucher = null;
  }

  function handleEdit() {
    dispatch('edit', voucher);
    close();
  }

  function handleDelete() {
    dispatch('delete', voucher);
  }

  function handleDuplicate() {
    dispatch('duplicate', voucher);
  }

  function handlePrint() {
    printVoucherDocument();
  }

  function handleSavePdf() {
    printVoucherDocument();
  }

  function printVoucherDocument() {
    if (!docHtml) return;

    const htmlWithBase = ensureBaseHref(docHtml);
    const blob = new Blob([htmlWithBase], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    // Fluxo principal: nova aba com Blob URL (mais robusto que document.write).
    const popup = window.open(blobUrl, '_blank');
    if (popup) {
      const cleanup = () => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {
          // noop
        }
      };
      popup.addEventListener(
        'load',
        () => {
          popup.focus();
          popup.print();
          setTimeout(cleanup, 4000);
        },
        { once: true }
      );
      return;
    }

    // Fallback: tenta imprimir o iframe atual se popup estiver bloqueado.
    if (iframe?.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {
          // noop
        }
      }, 1000);
    }
  }

  function ensureBaseHref(html: string) {
    const baseTag = `<base href="${window.location.origin}/">`;
    if (/<base\s+href=/i.test(html)) return html;
    if (/<head[^>]*>/i.test(html))
      return html.replace(/<head[^>]*>/i, (head) => `${head}\n${baseTag}`);
    return `<!doctype html><html><head>${baseTag}</head><body>${html}</body></html>`;
  }
</script>

{#if open && voucher}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="voucher-preview-area fixed z-100 flex flex-col bg-slate-100"
    style="left: {contentLeft}; top: {$isMobile
      ? 'var(--vtur-topbar-height)'
      : 'var(--vtur-desktop-shell-top)'};"
    transition:fade={{ duration: 150 }}
  >
    <!-- Header fixo com ações - Responsivo -->
    <header class="voucher-preview__header shrink-0 border-b border-slate-200 bg-white shadow-xs">
      <div class="voucher-preview__meta min-w-0">
        <h2 class="voucher-preview__title truncate">{voucher.nome}</h2>
        <p class="voucher-preview__subtitle">
          {voucher.provider === 'special_tours'
            ? 'Special Tours'
            : voucher.provider === 'europamundo'
              ? 'Europamundo'
              : 'Sato Tours'}
          {#if voucher.codigo_fornecedor}
            <span class="hidden sm:inline"> • Código: {voucher.codigo_fornecedor}</span>
          {/if}
        </p>
      </div>

      <div class="voucher-preview__actions shrink-0">
        <!-- Botões com ícones apenas no mobile, texto no desktop -->
        <Button variant="primary" on:click={handleEdit} class_name="px-2! md:px-4!">
          <Edit size={18} />
          <span class="ml-2 hidden md:inline">Editar</span>
        </Button>
        <Button variant="secondary" on:click={handlePrint} class_name="px-2! md:px-4!">
          <Printer size={18} />
          <span class="ml-2 hidden md:inline">Imprimir</span>
        </Button>
        <Button variant="primary" on:click={handleSavePdf} class_name="px-2! md:px-4!">
          <FileDown size={18} />
          <span class="ml-2 hidden md:inline">Salvar PDF</span>
        </Button>
        <Button variant="secondary" on:click={handleDuplicate} class_name="px-2! md:px-4!">
          <Copy size={18} />
          <span class="ml-2 hidden md:inline">Duplicar</span>
        </Button>
        <Button variant="danger" on:click={handleDelete} class_name="px-2! md:px-4!">
          <Trash2 size={18} />
          <span class="ml-2 hidden md:inline">Excluir voucher</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class_name="voucher-preview__close"
          title="Fechar"
          on:click={close}
        >
          <X size={20} />
        </Button>
      </div>
    </header>

    <!-- Preview do Voucher -->
    <div class="flex-1 overflow-hidden p-2 md:p-4">
      <div class="mx-auto flex h-full max-w-5xl flex-col">
        {#if docHtml}
          <iframe
            bind:this={iframe}
            srcdoc={docHtml}
            class="w-full flex-1 rounded-lg border border-slate-200 bg-white shadow-lg"
            title="Voucher Preview"
            sandbox="allow-modals allow-same-origin"
            referrerpolicy="no-referrer"
            style="min-height: 0;"
          ></iframe>
        {:else}
          <LoadingState className="flex-1" />
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* left e top vêm via style inline (reativo ao estado da sidebar) */
  .voucher-preview-area {
    right: 0;
    bottom: 0;
  }

  .voucher-preview__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.875rem 1rem;
  }

  .voucher-preview__meta {
    min-width: 0;
  }

  .voucher-preview__title {
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.15;
    color: #0f172a;
  }

  .voucher-preview__subtitle {
    margin-top: 0.15rem;
    font-size: 0.76rem;
    line-height: 1.3;
    color: #64748b;
  }

  .voucher-preview__actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  :global(.voucher-preview__close) {
    padding: 0.5rem !important;
  }

  @media (min-width: 768px) {
    .voucher-preview__header {
      padding: 1rem 1.5rem;
    }

    .voucher-preview__title {
      font-size: 1.25rem;
    }

    .voucher-preview__subtitle {
      font-size: 0.875rem;
    }

    .voucher-preview__actions {
      gap: 0.5rem;
    }
  }

  @media (max-width: 767px) {
    .voucher-preview__header {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }

    .voucher-preview__actions {
      width: 100%;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
  }
</style>
