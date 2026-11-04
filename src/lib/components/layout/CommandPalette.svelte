<!--
  Fase 5.1: busca rápida no menu (Ctrl+K / ⌘K, ou o botão "Buscar" do topo).

  Lista só o que o menu lateral mostra para o usuário (mesma regra de permissões e de
  "Personalizar Menu": o Sidebar publica os itens em `menuVisivel`). Não busca dados,
  não chama API e não muda nenhuma regra: só leva para a tela escolhida.

  Teclado: ↑/↓ escolhem, Enter abre, Esc fecha. Padrão "combobox" com lista (ARIA).
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import { Search } from '$lib/icons';
  import { menuVisivel, type ItemNavegacao } from '$lib/stores/navegacao';
  import { filtrarItens, isAtalhoBusca } from './commandPalette';

  export let open = false;

  const LIST_ID = 'vtur-busca-rapida-lista';
  const INPUT_ID = 'vtur-busca-rapida-campo';

  let busca = '';
  let ativo = 0;
  let inputEl: HTMLInputElement | null = null;
  let listEl: HTMLUListElement | null = null;
  let focoAnterior: HTMLElement | null = null;

  $: resultados = filtrarItens($menuVisivel, busca);
  $: if (ativo >= resultados.length) ativo = Math.max(0, resultados.length - 1);
  $: optionId = (index: number) => `${LIST_ID}-${index}`;

  // Ao abrir: limpa a busca e põe o foco no campo (depois que a janela prende o foco).
  $: if (open) void prepararAbertura();

  async function prepararAbertura() {
    busca = '';
    ativo = 0;
    await tick();
    inputEl?.focus();
  }

  function abrir() {
    focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    open = true;
  }

  function fechar() {
    open = false;
    const alvo = focoAnterior;
    focoAnterior = null;
    if (alvo && document.contains(alvo)) void tick().then(() => alvo.focus());
  }

  async function escolher(item: ItemNavegacao | undefined) {
    if (!item) return;
    focoAnterior = null;
    open = false;
    if ($page.url.pathname !== item.href) await goto(item.href);
  }

  async function mostrarAtivo() {
    await tick();
    listEl
      ?.querySelector<HTMLElement>(`#${CSS.escape(optionId(ativo))}`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  function handleInputKeydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    const total = resultados.length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (total) ativo = (ativo + 1) % total;
      void mostrarAtivo();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (total) ativo = (ativo - 1 + total) % total;
      void mostrarAtivo();
    } else if (event.key === 'Home' && total) {
      event.preventDefault();
      ativo = 0;
      void mostrarAtivo();
    } else if (event.key === 'End' && total) {
      event.preventDefault();
      ativo = total - 1;
      void mostrarAtivo();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void escolher(resultados[ativo]);
    }
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (!isAtalhoBusca(event)) return;
    // Com outra janela aberta, o atalho não abre uma segunda por cima.
    if (!open && document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    event.preventDefault();
    if (open) fechar();
    else abrir();
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<Dialog bind:open title="Buscar no menu" size="md" showCancel={false} onclose={fechar}>
  <div class="space-y-3">
    <div class="relative">
      <Search
        size={16}
        class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
      <input
        bind:this={inputEl}
        bind:value={busca}
        id={INPUT_ID}
        type="text"
        role="combobox"
        autocomplete="off"
        spellcheck="false"
        placeholder="Nome da tela (ex.: vendas, conciliação)"
        aria-label="Buscar tela"
        aria-autocomplete="list"
        aria-expanded={resultados.length > 0}
        aria-controls={LIST_ID}
        aria-activedescendant={resultados.length > 0 ? optionId(ativo) : undefined}
        class="vtur-input focus:border-primary-500 block w-full rounded-lg border border-gray-300 bg-gray-50 py-2.5 pr-3 pl-9 text-sm text-gray-900 focus:ring-blue-200"
        on:input={() => (ativo = 0)}
        on:keydown={handleInputKeydown}
      />
    </div>

    {#if resultados.length > 0}
      <ul
        bind:this={listEl}
        id={LIST_ID}
        role="listbox"
        aria-label="Telas encontradas"
        class="max-h-[55vh] overflow-y-auto rounded-lg border border-slate-200"
      >
        {#each resultados as item, index (item.href)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <li
            id={optionId(index)}
            role="option"
            aria-selected={index === ativo}
            class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm {index === ativo
              ? 'bg-slate-100 text-slate-900'
              : 'text-slate-700'}"
            on:mousemove={() => (ativo = index)}
            on:click={() => escolher(item)}
          >
            {#if item.icon}
              <svelte:component
                this={item.icon}
                size={16}
                class="text-slate-500"
                aria-hidden="true"
              />
            {/if}
            <span class="min-w-0 flex-1 truncate font-medium">{item.nome}</span>
            <span class="shrink-0 text-xs text-slate-400">{item.secao}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p
        class="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500"
        role="status"
      >
        Nenhuma tela encontrada para “{busca}”.
      </p>
    {/if}
  </div>

  <svelte:fragment slot="actions">
    <p class="mr-auto hidden text-xs text-slate-400 sm:block">
      ↑ ↓ para escolher · Enter para abrir · Esc para fechar
    </p>
  </svelte:fragment>
</Dialog>
