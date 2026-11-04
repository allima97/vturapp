<script lang="ts">
  import { Button as FlowbiteButton } from './flowbite-legacy';
  import { sanitizeHref } from '$lib/security/url';

  type ButtonVariant =
    | 'primary'
    | 'secondary'
    | 'outline'
    | 'ghost'
    | 'danger'
    | 'unstyled'
    | 'selected';
  type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';
  type ButtonColor =
    | 'blue'
    | 'green'
    | 'red'
    | 'yellow'
    | 'purple'
    | 'teal'
    | 'orange'
    | 'crm'
    | 'clientes'
    | 'vendas'
    | 'financeiro'
    | 'operacao'
    | 'orcamentos'
    | 'comissoes';
  type FlowbiteButtonColor =
    | 'none'
    | 'primary'
    | 'blue'
    | 'green'
    | 'red'
    | 'yellow'
    | 'purple'
    | 'light'
    | 'dark'
    | 'alternative';

  export let variant: ButtonVariant = 'primary';
  export let size: ButtonSize = 'md';
  export let color: ButtonColor = 'blue';
  export let loading = false;
  export let disabled = false;
  export let type: 'button' | 'submit' | 'reset' = 'button';
  export let href: string | undefined = undefined;
  export let target: string | null = null;
  export let rel: string | null = null;
  export let id: string | null = null;
  export let title: string | null = null;
  export let ariaLabel: string | null = null;
  export let ariaHaspopup:
    | boolean
    | 'true'
    | 'false'
    | 'menu'
    | 'listbox'
    | 'tree'
    | 'grid'
    | 'dialog'
    | null = null;
  export let ariaExpanded: boolean | null = null;
  /** Opcional: id do elemento que o botão abre/fecha (menus, seções). */
  export let ariaControls: string | null = null;
  export let role: string | null = null;
  export let ariaSelected: boolean | null = null;
  export let ariaPressed: boolean | null = null;
  /** Opcional: controle de foco (ex.: abas com tabindex móvel). */
  export let tabindex: number | null = null;
  export let style: string | null = null;
  export let class_name = '';

  const colorAlias: Record<ButtonColor, string> = {
    blue: 'blue',
    green: 'green',
    red: 'red',
    yellow: 'yellow',
    purple: 'purple',
    teal: 'teal',
    orange: 'orange',
    crm: 'purple',
    clientes: 'blue',
    orcamentos: 'blue',
    vendas: 'teal',
    financeiro: 'orange',
    operacao: 'teal',
    comissoes: 'orange'
  };

  const sizeClasses: Record<ButtonSize, string> = {
    xs: 'px-2.5 py-1.5 text-xs',
    sm: 'px-3.5 py-2 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base'
  };

  const variantClasses: Record<ButtonVariant, string> = {
    primary:
      'border-transparent bg-gradient-to-r from-[#5b5ce6] to-[#3b82f6] text-white hover:from-[#4f46e5] hover:to-[#2563eb] focus:ring-indigo-200 shadow-[0_12px_28px_rgba(79,70,229,0.28)]',
    secondary:
      'border border-slate-300 bg-transparent text-slate-700 hover:bg-transparent hover:border-slate-400 hover:text-slate-900 focus:ring-slate-200 shadow-none',
    outline:
      'border border-slate-300 bg-transparent text-slate-800 hover:bg-transparent hover:border-slate-400 focus:ring-slate-200 shadow-none',
    ghost:
      'border border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-200 shadow-none',
    danger:
      'border-transparent bg-red-600 text-white hover:bg-red-700 focus:ring-red-200 shadow-[0_10px_24px_rgba(220,38,38,0.18)]',
    unstyled:
      'border-transparent bg-transparent text-inherit hover:bg-transparent focus:ring-slate-200 shadow-none',
    selected:
      'border-2 border-blue-500 bg-blue-50 text-slate-900 hover:bg-blue-100 focus:ring-blue-200 shadow-none'
  };

  $: resolvedColor = colorAlias[color] || 'blue';

  // Variantes que controlam 100% das cores via variantClasses — não devem
  // receber a cor Flowbite (que injeta background azul sobrescrevendo bg-transparent)
  const neutralVariants = new Set<ButtonVariant>([
    'secondary',
    'outline',
    'ghost',
    'unstyled',
    'selected'
  ]);
  let flowbiteColor: FlowbiteButtonColor;
  $: flowbiteColor = neutralVariants.has(variant)
    ? 'none'
    : (resolvedColor as unknown as Exclude<FlowbiteButtonColor, 'none'>);

  $: buttonClasses = `vtur-button inline-flex items-center justify-center rounded-xl font-semibold tracking-[0.01em] transition-all duration-150 focus:outline-hidden focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${sizeClasses[size]} ${variantClasses[variant]} ${class_name}`;
  $: safeHref = href ? sanitizeHref(href) || undefined : undefined;
  $: resolvedRel = rel ?? (target === '_blank' ? 'noopener noreferrer' : null);
</script>

{#if safeHref}
  <FlowbiteButton
    href={safeHref}
    id={id ?? undefined}
    {size}
    color={flowbiteColor}
    title={title ?? undefined}
    target={target ?? undefined}
    rel={resolvedRel ?? undefined}
    aria-label={ariaLabel ?? undefined}
    aria-haspopup={ariaHaspopup ?? undefined}
    aria-expanded={ariaExpanded ?? undefined}
    aria-controls={ariaControls ?? undefined}
    role={role ?? undefined}
    aria-selected={ariaSelected ?? undefined}
    aria-pressed={ariaPressed ?? undefined}
    aria-busy={loading ? 'true' : undefined}
    tabindex={tabindex ?? undefined}
    style={style ?? undefined}
    disabled={disabled || loading}
    class={buttonClasses}
    on:click
    on:mousedown
  >
    {#if loading}
      <svg
        class="mr-2 h-4 w-4 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
        ></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
      </svg>
    {/if}
    <slot />
  </FlowbiteButton>
{:else}
  <FlowbiteButton
    {type}
    id={id ?? undefined}
    {size}
    color={flowbiteColor}
    title={title ?? undefined}
    aria-label={ariaLabel ?? undefined}
    aria-haspopup={ariaHaspopup ?? undefined}
    aria-expanded={ariaExpanded ?? undefined}
    aria-controls={ariaControls ?? undefined}
    role={role ?? undefined}
    aria-selected={ariaSelected ?? undefined}
    aria-pressed={ariaPressed ?? undefined}
    aria-busy={loading ? 'true' : undefined}
    tabindex={tabindex ?? undefined}
    style={style ?? undefined}
    disabled={disabled || loading}
    class={buttonClasses}
    on:click
    on:mousedown
  >
    {#if loading}
      <svg
        class="mr-2 h-4 w-4 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
        ></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
      </svg>
    {/if}
    <slot />
  </FlowbiteButton>
{/if}
