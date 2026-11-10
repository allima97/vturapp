<script lang="ts">
  import { Button } from '$lib/components/ui';
  import type { VoucherProvider } from '$lib/vouchers/types';

  export let providers: { value: VoucherProvider; label: string; color: string }[];
  export let provider: VoucherProvider;
  export let setVoucherProvider: (provider: VoucherProvider) => void;
</script>

<section class="border-clientes-100 mb-6 rounded-xl border bg-white p-5 shadow-xs">
  <div class="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p class="text-clientes-600 text-sm font-medium">Primeiro passo</p>
      <h2 class="text-xl font-bold text-slate-900">Escolha o fornecedor do voucher</h2>
      <p class="text-sm text-slate-500">
        A importação e os campos abaixo seguem o padrão do fornecedor selecionado.
      </p>
    </div>
    <div class="text-sm font-medium text-slate-600">
      Selecionado: {providers.find((providerOption) => providerOption.value === provider)?.label}
    </div>
  </div>

  <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
    {#each providers as providerOption}
      <Button
        type="button"
        variant={provider === providerOption.value ? 'primary' : 'outline'}
        size="lg"
        class_name={`min-h-[72px]! justify-start! rounded-xl! border-2! px-5! py-4! text-left! ${
          provider === providerOption.value ? 'shadow-md!' : 'bg-white! hover:bg-slate-50!'
        }`}
        on:click={() => setVoucherProvider(providerOption.value)}
      >
        <span class="mr-3 h-4 w-4 shrink-0 rounded-full {providerOption.color}"></span>
        <span>
          <span class="block font-semibold">{providerOption.label}</span>
          <span class="block text-xs opacity-75">Usar modelo {providerOption.label}</span>
        </span>
      </Button>
    {/each}
  </div>
</section>
