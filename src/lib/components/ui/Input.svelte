<script lang="ts">
  import { Input, Label } from './flowbite-legacy';
  import type { Component } from 'svelte';
  import { buildVturInputClasses } from './inputContract';

  type IconComponent = Component<{ class?: string }>;

  export let label: string | null = null;
  export let value: string = '';
  export let placeholder: string = '';
  export let type: 'text' | 'email' | 'password' | 'number' | 'date' | 'tel' = 'text';
  export let required = false;
  export let disabled = false;
  export let error: string | null = null;
  export let helper: string | null = null;
  export let icon: IconComponent | null = null;
  export let class_name = '';

  $: inputClasses = buildVturInputClasses(
    error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
  );
</script>

<div class={class_name}>
  {#if label}
    <Label class="mb-2 {required ? 'after:ml-0.5 after:text-red-500 after:content-["*"]' : ''}">
      {label}
    </Label>
  {/if}

  {#if icon}
    <Input
      {type}
      bind:value
      {placeholder}
      {disabled}
      {required}
      wrapperClass="relative w-full"
      color={error ? 'red' : 'base'}
      class={inputClasses}
    >
      <svelte:component this={icon} slot="left" class="h-5 w-5 text-gray-500" />
    </Input>
  {:else}
    <Input
      {type}
      bind:value
      {placeholder}
      {disabled}
      {required}
      color={error ? 'red' : 'base'}
      class={inputClasses}
    />
  {/if}

  {#if error}
    <p role="alert" class="mt-1 text-sm text-red-600">{error}</p>
  {:else if helper}
    <p class="mt-1 text-sm text-gray-500">{helper}</p>
  {/if}
</div>
