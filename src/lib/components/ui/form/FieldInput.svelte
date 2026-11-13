<script lang="ts">
  import { Input, Label, Helper } from '../flowbite-legacy';
  import { createEventDispatcher } from 'svelte';
  import type { Component, ComponentType, SvelteComponent } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';
  import Button from '../Button.svelte';
  import { buildVturInputClasses } from '../inputContract';
  import { inputMask, type MaskType } from '$lib/actions/inputMask';
  import { uniqueFieldId } from './fieldId';
  import { validateCPF, validateCNPJ } from '$lib/utils/validation';
  import { formatMoneyInput, moneyInputToDecimal } from '$lib/utils/moneyInput';

  type IconProps = { class?: string; size?: number | string };
  type IconComponent = Component<IconProps> | ComponentType<SvelteComponent<IconProps>>;

  export let label: string | null = null;
  export let srLabel = false;
  export let value: string | number = '';
  export let placeholder: string = '';
  export let type:
    | 'text'
    | 'email'
    | 'password'
    | 'number'
    | 'date'
    | 'datetime-local'
    | 'month'
    | 'tel'
    | 'time'
    | 'url' = 'text';
  export let required = false;
  export let disabled = false;
  export let readonly = false;
  export let autocomplete: HTMLInputAttributes['autocomplete'] | null = null;
  export let error: string | null = null;
  export let helper: string | null = null;
  export let icon: IconComponent | null = null;
  export let prefix: string | null = null;
  export let suffix: string | null = null;
  export let actionIcon: IconComponent | null = null;
  export let actionLabel: string | null = null;
  export let onAction: (() => void) | undefined = undefined;
  export let actionDisabled = false;
  export let id: string | null = null;
  export let name: string | null = null;
  export let list: string | null = null;
  export let min: string | null = null;
  export let max: string | null = null;
  export let step: string | null = null;
  export let maxlength: number | null = null;
  export let class_name = '';

  /**
   * Máscara automática — opcional, não afeta nenhum uso existente.
   * Valores: 'cpf' | 'cnpj' | 'phone' | 'cep' | 'date' | 'rg'
   */
  export let mask: MaskType | undefined = undefined;
  export let documentType: 'cpf' | 'cnpj' | undefined = undefined;
  export let money = false;

  let documentEdited = false;
  let documentBlurred = false;
  let negativePending = false;
  let moneyError: string | null = null;
  const dispatch = createEventDispatcher<{ moneyInput: string }>();

  $: moneyDisplay = negativePending ? '-' : formatMoneyInput(value);

  function handleMoneyInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const raw = input.value;
    const digits = raw.replace(/\D/g, '');
    if (digits.length > 15) {
      moneyError = 'Valor excede o limite permitido. O valor anterior foi mantido.';
      input.value = formatMoneyInput(value);
      input.setCustomValidity(moneyError);
      return;
    }
    const digitsAfterCursor = raw
      .slice(input.selectionStart ?? raw.length)
      .replace(/\D/g, '').length;
    negativePending = raw === '-';
    const decimal = moneyInputToDecimal(raw);
    const number = Number(decimal);
    const minimum = min === null ? null : Number(min);
    const maximum = max === null ? null : Number(max);
    moneyError =
      decimal && minimum !== null && number < minimum
        ? `O valor mínimo é ${formatMoneyInput(minimum)}.`
        : decimal && maximum !== null && number > maximum
          ? `O valor máximo é ${formatMoneyInput(maximum)}.`
          : null;
    input.setCustomValidity(moneyError || '');
    value = type === 'number' && decimal ? Number(decimal) : decimal;
    input.value = negativePending ? '-' : formatMoneyInput(value);
    let cursor = input.value.length;
    let remaining = digitsAfterCursor;
    while (cursor > 0 && remaining > 0) {
      cursor--;
      if (/\d/.test(input.value[cursor])) remaining--;
    }
    input.setSelectionRange(cursor, cursor);
    dispatch('moneyInput', decimal);
  }

  $: documentValue = String(value ?? '').trim();
  $: documentDigits = documentValue.replace(/\D/g, '');
  $: shouldValidateDocument =
    !!documentType &&
    (documentBlurred ||
      (documentEdited && documentDigits.length >= (documentType === 'cpf' ? 11 : 14)));
  $: documentValid =
    documentType === 'cpf' ? validateCPF(documentValue) : validateCNPJ(documentValue);
  $: documentMessage =
    shouldValidateDocument && (documentValue || required)
      ? `${documentType === 'cpf' ? 'CPF' : 'CNPJ'} ${documentValid ? 'válido' : 'inválido'}.`
      : null;
  $: visibleError =
    error || moneyError || (documentMessage && !documentValid ? documentMessage : null);

  $: fieldId = id || uniqueFieldId(label);
  $: describedById = visibleError || documentMessage || helper ? `${fieldId}-desc` : undefined;
  $: inputClasses = buildVturInputClasses(
    'text-sm',
    prefix || icon ? 'pl-10' : '',
    suffix || actionIcon ? 'pr-10' : '',
    visibleError ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'focus:ring-blue-200'
  );
</script>

<div class={class_name}>
  {#if label}
    <Label
      for={fieldId}
      class={srLabel ? 'sr-only' : 'mb-1.5 block text-sm font-medium text-slate-700'}
    >
      {label}{#if required}<span class="ml-0.5 text-red-500" aria-hidden="true">*</span>{/if}
    </Label>
  {/if}

  <div class="relative w-full">
    <div class="relative w-full">
      {#if prefix}
        <span
          class="absolute top-1/2 left-3 z-10 -translate-y-1/2 text-sm text-slate-500 select-none"
          >{prefix}</span
        >
      {/if}

      {#if money}
        {#if icon && !prefix}
          <span
            class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          >
            <svelte:component this={icon} class="h-4 w-4" />
          </span>
        {/if}
        <input
          id={fieldId}
          {name}
          type="text"
          inputmode="decimal"
          value={moneyDisplay}
          placeholder={placeholder || ''}
          {disabled}
          {required}
          {readonly}
          autocomplete={autocomplete ?? undefined}
          aria-invalid={visibleError ? 'true' : undefined}
          aria-describedby={describedById}
          class="{inputClasses} w-full p-2.5"
          on:input={handleMoneyInput}
          on:input
          on:change
          on:blur
          on:focus
          on:keydown
        />
      {:else if mask}
        <!--
        Quando há máscara: usa <input> nativo com a action inputMask.
        O Flowbite Input não expõe o elemento DOM interno, então caímos
        no input nativo com as mesmas classes visuais (vtur-input).
      -->
        {#if icon && !prefix}
          <span
            class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          >
            <svelte:component this={icon} class="h-4 w-4" />
          </span>
        {/if}
        <input
          use:inputMask={{ type: mask }}
          id={fieldId}
          {name}
          {type}
          bind:value
          placeholder={placeholder || ''}
          {disabled}
          {required}
          {readonly}
          autocomplete={autocomplete ?? undefined}
          maxlength={maxlength ?? undefined}
          aria-invalid={visibleError ? 'true' : undefined}
          aria-describedby={describedById}
          class="{inputClasses} w-full p-2.5"
          on:input={() => (documentEdited = true)}
          on:input
          on:change
          on:blur={() => (documentBlurred = true)}
          on:blur
          on:focus
          on:keydown
        />
      {:else if icon}
        <Input
          id={fieldId}
          {name}
          {list}
          {type}
          bind:value
          {placeholder}
          {disabled}
          {required}
          {readonly}
          autocomplete={autocomplete ?? undefined}
          {min}
          {max}
          {step}
          {maxlength}
          wrapperClass="relative w-full"
          aria-invalid={visibleError ? 'true' : undefined}
          aria-describedby={describedById}
          color={visibleError ? 'red' : 'base'}
          class={inputClasses}
          on:input={() => (documentEdited = true)}
          on:input
          on:change
          on:blur={() => (documentBlurred = true)}
          on:blur
          on:focus
          on:keydown
        >
          <svelte:component this={icon} slot="left" class="h-4 w-4 text-slate-400" />
        </Input>
      {:else}
        <Input
          id={fieldId}
          {name}
          {list}
          {type}
          bind:value
          {placeholder}
          {disabled}
          {required}
          {readonly}
          autocomplete={autocomplete ?? undefined}
          {min}
          {max}
          {step}
          {maxlength}
          wrapperClass="relative w-full"
          aria-invalid={visibleError ? 'true' : undefined}
          aria-describedby={describedById}
          color={visibleError ? 'red' : 'base'}
          class={inputClasses}
          on:input={() => (documentEdited = true)}
          on:input
          on:change
          on:blur={() => (documentBlurred = true)}
          on:blur
          on:focus
          on:keydown
        />
      {/if}
      {#if suffix}
        <span
          class="absolute top-1/2 right-3 z-10 -translate-y-1/2 text-sm text-slate-500 select-none"
          >{suffix}</span
        >
      {/if}
    </div>
    {#if actionIcon}
      <Button
        type="button"
        variant="unstyled"
        size="xs"
        class_name="absolute right-3 top-1/2 z-10 -translate-y-1/2 p-0! text-slate-400 transition-colors hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
        ariaLabel={actionLabel ?? undefined}
        disabled={actionDisabled}
        on:click={() => onAction?.()}
      >
        <svelte:component this={actionIcon} class="h-4 w-4" />
      </Button>
    {/if}
  </div>

  {#if visibleError}
    <Helper id={describedById} class="mt-1 text-red-600" aria-live="polite">{visibleError}</Helper>
  {:else if documentMessage}
    <Helper id={describedById} class="mt-1 text-green-700" aria-live="polite"
      >{documentMessage}</Helper
    >
  {:else if helper}
    <Helper id={describedById} class="mt-1 text-slate-500">{helper}</Helper>
  {/if}
</div>
