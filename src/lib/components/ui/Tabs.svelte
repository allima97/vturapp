<script lang="ts">
  import type { Component, ComponentType, SvelteComponent } from 'svelte';
  import { tick } from 'svelte';
  import Button from './Button.svelte';
  import { focusableTabIndex, nextTabIndex } from './tabsKeyboard';

  type IconProps = { class?: string; size?: number | string };
  type IconComponent = Component<IconProps> | ComponentType<SvelteComponent<IconProps>>;

  type TabItem = {
    key: string;
    label: string;
    icon?: IconComponent;
    badge?: string | number | null;
    disabled?: boolean;
  };

  export let items: TabItem[] = [];
  export let activeKey = '';
  export let onSelect: ((key: string) => void) | undefined = undefined;
  export let className = '';
  export let idPrefix = '';
  export let mobileDropdown = false;

  function selectTab(key: string, disabled?: boolean) {
    if (disabled) return;
    activeKey = key;
    onSelect?.(key);
  }

  let listEl: HTMLDivElement;
  $: tabStop = focusableTabIndex(items, activeKey);

  // Setas/Home/End movem entre as abas (padrão WAI-ARIA); o clique continua igual.
  async function handleKeydown(event: KeyboardEvent) {
    const current = items.findIndex((item) => item.key === activeKey);
    const next = nextTabIndex(items, current, event.key);
    if (next === null) return;
    event.preventDefault();
    selectTab(items[next].key, items[next].disabled);
    await tick();
    listEl?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }
</script>

{#if mobileDropdown}
  <select
    class={`vtur-tabs-select ${className}`.trim()}
    aria-label="Selecionar aba"
    value={activeKey}
    on:change={(event) => selectTab(event.currentTarget.value)}
  >
    {#each items as item}
      <option value={item.key} disabled={item.disabled}>
        {item.label}{item.badge != null && item.badge !== '' && item.badge !== 0 ? ` (${item.badge})` : ''}
      </option>
    {/each}
  </select>
{/if}

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
  class={`vtur-tabs ${mobileDropdown ? 'vtur-tabs--collapse' : ''} ${className}`.trim()}
  role="tablist"
  bind:this={listEl}
  on:keydown={handleKeydown}
>
  {#each items as item, index}
    <Button
      type="button"
      variant="unstyled"
      size="sm"
      role="tab"
      id={idPrefix ? `${idPrefix}-tab-${item.key}` : null}
      ariaControls={idPrefix ? `${idPrefix}-panel-${item.key}` : null}
      ariaSelected={activeKey === item.key}
      tabindex={index === tabStop ? 0 : -1}
      class_name={`vtur-tab ${activeKey === item.key ? 'vtur-tab--active' : ''}`.trim()}
      disabled={item.disabled}
      on:click={() => selectTab(item.key, item.disabled)}
    >
      {#if item.icon}
        <svelte:component this={item.icon} size={16} />
      {/if}
      <span>{item.label}</span>
      {#if item.badge != null && item.badge !== '' && item.badge !== 0}
        <span
          class={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
            activeKey === item.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {item.badge}
        </span>
      {/if}
    </Button>
  {/each}
</div>

<style>
  .vtur-tabs-select {
    display: none;
    width: 100%;
    padding: 0.625rem 0.75rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.75rem;
    background: #fff;
    color: #1e3a8a;
    font-size: 0.875rem;
    font-weight: 600;
  }
  @media (max-width: 767px) {
    .vtur-tabs-select {
      display: block;
    }
    :global(.vtur-tabs.vtur-tabs--collapse) {
      display: none;
    }
  }
</style>
