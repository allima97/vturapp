<script lang="ts">
  import { Button } from '$lib/components/ui';
  import type { WizardStep } from './types';

  export let steps: WizardStep[];
  export let goToStep: (step: number) => void;
  export let getStepStatus: (stepIndex: number) => 'completed' | 'current' | 'pending';
</script>

<!-- Wizard Steps -->
<div class="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
  <div class="flex flex-wrap">
    {#each steps as step, i}
      {@const status = getStepStatus(i)}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class_name={`flex-1 min-w-[140px] rounded-none! border-0! px-3! py-4! flex flex-col items-center justify-center gap-2 text-sm font-medium transition-all relative ${
          status === 'current'
            ? 'bg-clientes-50! text-clientes-700!'
            : status === 'completed'
              ? 'bg-green-50! text-green-700! hover:bg-green-100!'
              : 'bg-white! text-slate-400! hover:bg-slate-50!'
        }`}
        on:click={() => goToStep(i)}
      >
        <div
          class="flex h-10 w-10 items-center justify-center rounded-full text-lg
          {status === 'current'
            ? 'bg-clientes-500 text-white shadow-lg'
            : status === 'completed'
              ? 'bg-green-500 text-white'
              : 'bg-slate-200 text-slate-500'}"
        >
          <svelte:component this={step.icon} size={20} />
        </div>
        <div class="text-center">
          <p class="hidden font-semibold sm:block">{step.label}</p>
          <p class="hidden text-xs opacity-75 md:block">{step.description}</p>
        </div>
        {#if status === 'current'}
          <div class="bg-clientes-500 absolute right-0 bottom-0 left-0 h-1"></div>
        {/if}
      </Button>
    {/each}
  </div>
</div>
