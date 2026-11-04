<script lang="ts">
  import { FieldInput, FieldSelect } from '$lib/components/ui';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { formatBRL } from './formatadores';
  import {
    type RotInvestimento,
    addItem,
    moveDown,
    moveUp,
    newInvestimento,
    removeItem
  } from './tipos';
  import { ChevronDown, ChevronUp, Plus, Trash2 } from '$lib/icons';

  let {
    INVESTIMENTO_TIPO_OPTIONS,
    investimentos = $bindable(),
    onInvestimentoChange,
    totalInvestimento
  }: {
    INVESTIMENTO_TIPO_OPTIONS: string[];
    investimentos: RotInvestimento[];
    onInvestimentoChange: (
      index: number,
      field: 'valor_por_pessoa' | 'qtd_apto' | 'valor_por_apto',
      rawValue: string
    ) => void;
    totalInvestimento: number;
  } = $props();
</script>

<Card title="Investimento" color="clientes">
  <div class="mb-3 flex flex-wrap gap-2">
    <Button
      type="button"
      variant="secondary"
      size="sm"
      on:click={() => {
        investimentos = addItem(investimentos, newInvestimento);
      }}
    >
      <Plus size={13} class="mr-1" />
      Adicionar linha
    </Button>
  </div>

  {#if investimentos.length === 0}
    <p class="py-6 text-center text-sm text-slate-400">Nenhuma linha de investimento adicionada.</p>
  {:else}
    <div class="space-y-3">
      {#each investimentos as inv, index}
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
                ariaLabel="Mover linha de investimento para cima"
                title="Mover linha de investimento para cima"
                on:click={() => {
                  investimentos = moveUp(investimentos, index);
                }}
              >
                <ChevronUp size={13} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                class_name="text-slate-400 hover:text-slate-600"
                disabled={index === investimentos.length - 1}
                ariaLabel="Mover linha de investimento para baixo"
                title="Mover linha de investimento para baixo"
                on:click={() => {
                  investimentos = moveDown(investimentos, index);
                }}
              >
                <ChevronDown size={13} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                class_name="text-slate-400 hover:text-red-600"
                ariaLabel="Remover linha de investimento"
                title="Remover linha de investimento"
                on:click={() => {
                  investimentos = removeItem(investimentos, index);
                }}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <FieldSelect
                label="Tipo"
                bind:value={inv.tipo}
                options={INVESTIMENTO_TIPO_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                class_name="w-full"
              />
            </div>
            <div>
              <FieldInput
                label="Valor por pessoa (R$)"
                type="number"
                value={inv.valor_por_pessoa ?? ''}
                class_name="w-full"
                on:input={(e) =>
                  onInvestimentoChange(
                    index,
                    'valor_por_pessoa',
                    (e.target as HTMLInputElement).value
                  )}
              />
            </div>
            <div>
              <FieldInput
                label="Qtd. aptos"
                type="number"
                value={inv.qtd_apto ?? ''}
                class_name="w-full"
                on:input={(e) =>
                  onInvestimentoChange(index, 'qtd_apto', (e.target as HTMLInputElement).value)}
              />
            </div>
            <div>
              <FieldInput
                label="Valor por apto (R$)"
                type="number"
                value={inv.valor_por_apto ?? ''}
                class_name="w-full"
                helper="(calc.)"
                readonly
              />
            </div>
          </div>
        </div>
      {/each}
    </div>

    <div
      class="mt-4 rounded-lg bg-slate-100 px-4 py-2 text-right text-sm font-medium text-slate-700"
    >
      Total por pessoa: <span class="text-clientes-700 font-bold"
        >R$ {formatBRL(totalInvestimento)}</span
      >
    </div>
  {/if}
</Card>
