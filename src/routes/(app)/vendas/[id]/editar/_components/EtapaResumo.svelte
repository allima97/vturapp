<script lang="ts">
  import {
    FieldCheckbox,
    FieldInput,
    FieldSelect,
    FieldTextarea,
    FormPanel
  } from '$lib/components/ui';
  import { formatMoney } from '$lib/features/vendas/form';
  import type { VendaEditForm } from './types';

  export let venda: VendaEditForm;
  export let fechamentoFinanceiroOk: boolean;
  export let diferencaFinanceira: number;
  export let totalRecibos: number;
  export let totalTaxas: number;
  export let totalPagamentos: number;

  const vendaStatusOptions = [
    { value: 'pendente', label: 'Pendente' },
    { value: 'confirmada', label: 'Confirmada' },
    { value: 'concluida', label: 'Concluída' },
    { value: 'cancelada', label: 'Cancelada' }
  ];
</script>

<FormPanel
  title="Resumo e observações"
  description="Confira totais, status e notas internas"
  class_name="border-green-200"
>
  <div
    class="mb-4 rounded-xl border px-4 py-3 {fechamentoFinanceiroOk
      ? 'border-green-200 bg-green-50 text-green-700'
      : 'border-amber-200 bg-amber-50 text-amber-700'}"
  >
    {#if fechamentoFinanceiroOk}
      <p class="text-sm font-medium">Recibos e pagamentos estão conciliados.</p>
    {:else}
      <p class="text-sm font-medium">
        Há diferença entre recibos e pagamentos: {formatMoney(diferencaFinanceira)}
      </p>
    {/if}
  </div>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-4">
    <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p class="text-xs tracking-wide text-slate-500 uppercase">Total recibos</p>
      <p class="mt-2 text-lg font-semibold text-slate-900">{formatMoney(totalRecibos)}</p>
    </div>
    <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p class="text-xs tracking-wide text-slate-500 uppercase">Taxas</p>
      <p class="mt-2 text-lg font-semibold text-slate-900">{formatMoney(totalTaxas)}</p>
    </div>
    <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p class="text-xs tracking-wide text-slate-500 uppercase">Pagamentos</p>
      <p class="mt-2 text-lg font-semibold text-slate-900">{formatMoney(totalPagamentos)}</p>
    </div>
    <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <FieldSelect
        label="Status"
        bind:value={venda.status}
        options={vendaStatusOptions}
        class_name="mt-0"
      />
    </div>
  </div>

  <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
    <FieldInput
      money
      id="venda-editar-total"
      label="Valor total da venda"
      bind:value={venda.valor_total}
      class_name="w-full"
    />
    <FieldInput
      money
      id="venda-editar-total-bruto"
      label="Valor total bruto"
      bind:value={venda.valor_total_bruto}
      class_name="w-full"
    />
    <FieldInput
      money
      id="venda-editar-total-pago"
      label="Valor total pago"
      bind:value={venda.valor_total_pago}
      class_name="w-full"
    />
    <FieldInput
      money
      id="venda-editar-nao-comissionado"
      label="Valor não comissionado"
      bind:value={venda.valor_nao_comissionado}
      class_name="w-full"
    />
  </div>

  <div class="mt-4">
    <FieldCheckbox
      id="cancelada"
      label="Venda cancelada"
      bind:checked={venda.cancelada}
      color="vendas"
    />
  </div>

  <FieldTextarea
    id="venda-editar-observacoes"
    label="Observações"
    bind:value={venda.notas}
    rows={4}
    class_name="mt-4 w-full"
    placeholder="Observações internas da venda"
  />
</FormPanel>
