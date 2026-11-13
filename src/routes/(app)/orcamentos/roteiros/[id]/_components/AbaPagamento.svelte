<script lang="ts">
  import { FieldCheckbox, FieldDatalistInput, FieldInput, FieldSelect } from '$lib/components/ui';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { formatBRL } from './formatadores';
  import {
    type RotPagamento,
    addItem,
    moveDown,
    moveUp,
    newPagamento,
    removeItem,
    updateItem
  } from './tipos';
  import { ChevronDown, ChevronUp, Plus, Trash2 } from '$lib/icons';

  let {
    PAGAMENTO_SERVICO_OPTIONS,
    mostrarInformacoesPdf = $bindable(),
    mostrarPagamentoPdf = $bindable(),
    mostrarRodapePdf = $bindable(),
    pagamentos = $bindable(),
    sugestoes,
    totalPagamento
  }: {
    PAGAMENTO_SERVICO_OPTIONS: string[];
    mostrarInformacoesPdf: boolean;
    mostrarPagamentoPdf: boolean;
    mostrarRodapePdf: boolean;
    pagamentos: RotPagamento[];
    sugestoes: Record<string, string[]>;
    totalPagamento: number;
  } = $props();
</script>

<Card title="Pagamento" color="clientes">
  <div class="mb-3 flex flex-wrap gap-2">
    <Button
      type="button"
      variant="secondary"
      size="sm"
      on:click={() => {
        pagamentos = addItem(pagamentos, newPagamento);
      }}
    >
      <Plus size={13} class="mr-1" />
      Adicionar linha
    </Button>
  </div>

  {#if pagamentos.length === 0}
    <p class="py-6 text-center text-sm text-slate-400">Nenhuma linha de pagamento adicionada.</p>
  {:else}
    <div class="space-y-3">
      {#each pagamentos as pag, index}
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-500">Linha {index + 1}</span>
            <div class="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                class_name="text-slate-400 hover:text-slate-600"
                disabled={index === 0}
                ariaLabel="Mover linha de pagamento para cima"
                title="Mover linha de pagamento para cima"
                on:click={() => {
                  pagamentos = moveUp(pagamentos, index);
                }}
              >
                <ChevronUp size={13} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                class_name="text-slate-400 hover:text-slate-600"
                disabled={index === pagamentos.length - 1}
                ariaLabel="Mover linha de pagamento para baixo"
                title="Mover linha de pagamento para baixo"
                on:click={() => {
                  pagamentos = moveDown(pagamentos, index);
                }}
              >
                <ChevronDown size={13} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                class_name="text-slate-400 hover:text-red-600"
                ariaLabel="Remover linha de pagamento"
                title="Remover linha de pagamento"
                on:click={() => {
                  pagamentos = removeItem(pagamentos, index);
                }}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="col-span-2">
              <FieldSelect
                label="Serviço"
                bind:value={pag.servico}
                options={[
                  ...PAGAMENTO_SERVICO_OPTIONS.map((opt) => ({ value: opt, label: opt })),
                  ...pagamentos
                    .map((p) => p.servico)
                    .filter((s) => s && !PAGAMENTO_SERVICO_OPTIONS.includes(s))
                    .map((custom) => ({ value: custom, label: custom }))
                ]}
                class_name="w-full"
              />
            </div>
            <div class="col-span-2">
              <FieldDatalistInput
                label="Forma de pagamento"
                bind:value={pag.forma_pagamento}
                placeholder="Ex: Crédito, PIX, Boleto"
                options={sugestoes['forma_pagamento'] || []}
                class_name="w-full"
                listId="sugestoes-forma-pagamento"
              />
              <datalist id="sugestoes-forma-pagamento">
                {#each sugestoes['forma_pagamento'] || [] as s}<option value={s}></option>{/each}
              </datalist>
            </div>
            <div>
              <FieldInput
                money
                label="Valor total com taxas (R$)"
                type="number"
                value={pag.valor_total_com_taxas ?? ''}
                class_name="w-full"
                on:moneyInput={(e) => {
                  pagamentos = updateItem(pagamentos, index, {
                    valor_total_com_taxas: Number(e.detail) || null
                  });
                }}
              />
            </div>
            <div>
              <FieldInput
                money
                label="Taxas (R$)"
                type="number"
                value={pag.taxas ?? ''}
                class_name="w-full"
                on:moneyInput={(e) => {
                  pagamentos = updateItem(pagamentos, index, {
                    taxas: Number(e.detail) || null
                  });
                }}
              />
            </div>
          </div>
        </div>
      {/each}
    </div>

    <div
      class="mt-4 rounded-lg bg-slate-100 px-4 py-2 text-right text-sm font-medium text-slate-700"
    >
      Total: <span class="text-clientes-700 font-bold">R$ {formatBRL(totalPagamento)}</span>
    </div>
  {/if}

  <div class="mt-6 rounded-xl border border-dashed border-slate-300 p-4">
    <p class="mb-3 text-sm font-medium text-slate-600">Exibição no PDF</p>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FieldCheckbox
        label="Mostrar seção de Pagamento"
        helper="Desmarque para omitir a seção de pagamento no PDF."
        bind:checked={mostrarPagamentoPdf}
        color="clientes"
      />
      <FieldCheckbox
        label="Mostrar Informações importantes"
        helper="Desmarque para omitir a seção de informações importantes no PDF."
        bind:checked={mostrarInformacoesPdf}
        color="clientes"
      />
      <FieldCheckbox
        label="Mostrar rodapé de termos"
        helper="Desmarque para omitir o rodapé com os termos e condições no PDF."
        bind:checked={mostrarRodapePdf}
        color="clientes"
      />
    </div>
  </div>
</Card>
