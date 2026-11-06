<script lang="ts">
  import { Button, FieldCheckbox, FieldInput, FieldSelect, FormPanel } from '$lib/components/ui';
  import { CreditCard, Plus, Trash2 } from '$lib/icons';
  import type { Option, PagamentoEditForm } from './types';

  export let pagamentos: PagamentoEditForm[];
  export let errors: Record<string, string>;
  export let formasPagamento: Option[];
  export let addPagamento: () => void;
  export let removePagamento: (index: number) => void;
  export let syncFormaNome: (index: number) => void;
  export let rebuildParcelas: (index: number) => void;
  export let addParcela: (index: number) => void;
  export let removeParcela: (index: number, parcelaIndex: number) => void;
</script>

<FormPanel
  title="Pagamentos"
  description="Ajuste os pagamentos e o parcelamento"
  class_name="border-green-200"
>
  <div class="mb-4 flex items-center justify-between">
    <p class="text-sm text-slate-600">
      Configure forma de pagamento, parcelamento e comissionamento por pagamento.
    </p>
    <Button type="button" variant="secondary" on:click={addPagamento}
      ><Plus size={16} class="mr-2" />Adicionar pagamento</Button
    >
  </div>

  {#if errors.pagamentos}
    <p role="alert" class="mb-3 text-xs text-red-600">{errors.pagamentos}</p>
  {/if}

  <div class="space-y-4">
    {#each pagamentos as pagamento, index}
      <div class="rounded-xl border border-slate-200 p-4">
        <div class="mb-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-green-50 p-2 text-green-700"><CreditCard size={18} /></div>
            <p class="font-semibold text-slate-900">Pagamento {index + 1}</p>
          </div>
          <Button type="button" variant="ghost" on:click={() => removePagamento(index)}
            ><Trash2 size={16} /></Button
          >
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <FieldSelect
              id={`venda-editar-pagamento-forma-${index}`}
              label="Forma"
              bind:value={pagamento.forma_pagamento_id}
              options={[
                { value: '', label: 'Selecione uma opção' },
                ...formasPagamento.map((forma) => ({ value: forma.id, label: forma.nome || '' }))
              ]}
              class_name="w-full"
              error={errors[`pagamento_forma_${index}`]}
              required
              on:change={() => syncFormaNome(index)}
            />
            {#if !pagamento.forma_pagamento_id}
              <FieldInput
                id={`venda-editar-pagamento-forma-manual-${index}`}
                bind:value={pagamento.forma_nome}
                class_name="mt-2 w-full"
                placeholder="Informe a forma manualmente"
              />
            {/if}
          </div>
          <div>
            <FieldInput
              id={`venda-editar-pagamento-operacao-${index}`}
              label="Operação"
              bind:value={pagamento.operacao}
              class_name="w-full"
            />
          </div>
          <div>
            <FieldInput
              id={`venda-editar-pagamento-plano-${index}`}
              label="Plano"
              bind:value={pagamento.plano}
              class_name="w-full"
            />
          </div>
          <div>
            <FieldInput
              id={`venda-editar-pagamento-bruto-${index}`}
              label="Valor bruto"
              bind:value={pagamento.valor_bruto}
              class_name="w-full"
            />
          </div>
          <div>
            <FieldInput
              id={`venda-editar-pagamento-desconto-${index}`}
              label="Desconto"
              bind:value={pagamento.desconto_valor}
              class_name="w-full"
            />
          </div>
          <div>
            <FieldInput
              id={`venda-editar-pagamento-total-${index}`}
              label="Total"
              bind:value={pagamento.valor_total}
              class_name="w-full"
            />
          </div>
          <div>
            <div class="flex gap-2">
              <FieldInput
                id={`venda-editar-pagamento-parcelas-${index}`}
                label="Qtd. parcelas"
                type="number"
                min="1"
                bind:value={pagamento.parcelas_qtd}
                class_name="w-full"
              />
              <Button type="button" variant="ghost" on:click={() => rebuildParcelas(index)}
                >Gerar</Button
              >
            </div>
          </div>
          <div>
            <FieldInput
              id={`venda-editar-pagamento-valor-parcela-${index}`}
              label="Valor da parcela"
              bind:value={pagamento.parcelas_valor}
              class_name="w-full"
            />
          </div>
          <div>
            <FieldInput
              id={`venda-editar-pagamento-vencimento-${index}`}
              label="1º vencimento"
              type="date"
              bind:value={pagamento.vencimento_primeira}
              class_name="w-full"
            />
          </div>
          <div class="flex items-end">
            <FieldCheckbox
              label="Paga comissão"
              bind:checked={pagamento.paga_comissao}
              color="vendas"
            />
          </div>
        </div>

        <div class="mt-4 rounded-xl border border-slate-200 p-3">
          <div class="mb-3 flex items-center justify-between">
            <p class="text-sm font-medium text-slate-700">Parcelas</p>
            <Button type="button" variant="ghost" on:click={() => addParcela(index)}
              >Adicionar parcela</Button
            >
          </div>
          {#if pagamento.parcelas.length === 0}
            <p class="text-xs text-slate-500">Nenhuma parcela cadastrada.</p>
          {:else}
            <div class="space-y-2">
              {#each pagamento.parcelas as parcela, parcelaIndex}
                <div class="grid grid-cols-1 gap-2 md:grid-cols-4">
                  <FieldInput
                    bind:value={parcela.numero}
                    class_name="w-full"
                    placeholder="Número"
                  />
                  <FieldInput bind:value={parcela.valor} class_name="w-full" placeholder="Valor" />
                  <FieldInput type="date" bind:value={parcela.vencimento} class_name="w-full" />
                  <Button
                    type="button"
                    variant="danger"
                    on:click={() => removeParcela(index, parcelaIndex)}>Remover</Button
                  >
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</FormPanel>
