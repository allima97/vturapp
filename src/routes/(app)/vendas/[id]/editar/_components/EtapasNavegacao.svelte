<script lang="ts">
  import { Button } from '$lib/components/ui';

  export let currentStep: number;
  export let goStep: (nextStep: number) => void;
</script>

<div class="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
  <Button
    type="button"
    variant="unstyled"
    class_name="!flex min-h-[76px] w-full flex-col! items-center! justify-center! gap-1 rounded-xl border px-4 py-3 text-center transition-colors duration-150 {currentStep ===
    0
      ? 'border-vendas-400 bg-vendas-50 text-vendas-700'
      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}"
    on:click={() => goStep(0)}
  >
    <p class="text-xs font-semibold tracking-wide uppercase opacity-70">Etapa 1</p>
    <p class="font-semibold">Dados da venda</p>
  </Button>
  <Button
    type="button"
    variant="unstyled"
    class_name="!flex min-h-[76px] w-full flex-col! items-center! justify-center! gap-1 rounded-xl border px-4 py-3 text-center transition-colors duration-150 {currentStep ===
    1
      ? 'border-vendas-400 bg-vendas-50 text-vendas-700'
      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}"
    on:click={() => goStep(1)}
  >
    <p class="text-xs font-semibold tracking-wide uppercase opacity-70">Etapa 2</p>
    <p class="font-semibold">Recibos</p>
  </Button>
  <Button
    type="button"
    variant="unstyled"
    class_name="!flex min-h-[76px] w-full flex-col! items-center! justify-center! gap-1 rounded-xl border px-4 py-3 text-center transition-colors duration-150 {currentStep ===
    2
      ? 'border-vendas-400 bg-vendas-50 text-vendas-700'
      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}"
    on:click={() => goStep(2)}
  >
    <p class="text-xs font-semibold tracking-wide uppercase opacity-70">Etapa 3</p>
    <p class="font-semibold">Forma de pagamento</p>
  </Button>
</div>
