<script lang="ts">
  import { FieldInput, FieldSelect, FieldTextarea } from '$lib/components/ui';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import {
    type RotTransporte,
    addItem,
    moveDown,
    moveUp,
    newTransporte,
    removeItem,
    updateItem
  } from './tipos';
  import { ChevronDown, ChevronUp, Plus, Trash2 } from '$lib/icons';
  import { formatHorario } from '$lib/utils/inputFormatting';

  let {
    TRANSPORTE_TIPO_OPTIONS,
    TRANSPORTE_TIPO_VOO_OPTIONS,
    aereoImportError,
    aereoImportMsg,
    aereoImportText = $bindable(),
    handleImportAereoText,
    onAereoValorChange,
    transportes = $bindable()
  }: {
    TRANSPORTE_TIPO_OPTIONS: string[];
    TRANSPORTE_TIPO_VOO_OPTIONS: string[];
    aereoImportError: string | null;
    aereoImportMsg: string | null;
    aereoImportText: string;
    handleImportAereoText: () => void;
    onAereoValorChange: (index: number, field: 'valor_total' | 'taxas', rawValue: string) => void;
    transportes: RotTransporte[];
  } = $props();

  function deslocamentoChegada(valor: string | null | undefined) {
    return String(valor || '').match(/\s*\(\s*[+-]\d+\s*\)\s*$/)?.[0] || '';
  }

  function horarioExibido(valor: string | null | undefined) {
    const original = String(valor || '');
    const semDeslocamento = original
      .slice(0, original.length - deslocamentoChegada(original).length)
      .trim();
    const horas = semDeslocamento.match(/^(\d{1,2})\s*h$/i);
    if (horas) return `${horas[1].padStart(2, '0')}:00`;
    if (
      !/^(?:\d{1,4}|\d{1,2}\s*:\s*\d{0,2}|\d{1,2}\s*h\s*\d{1,2}\s*(?:min|m)?)$/i.test(
        semDeslocamento
      )
    )
      return original;
    return formatHorario(semDeslocamento);
  }

  function atualizarHorario(
    event: Event,
    transporte: RotTransporte,
    campo: 'hora_saida' | 'hora_chegada' | 'duracao_voo'
  ) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const deslocamento =
      campo === 'hora_chegada' && !deslocamentoChegada(input.value)
        ? deslocamentoChegada(transporte.hora_chegada)
        : '';
    transporte[campo] = input.value ? `${input.value}${deslocamento}` : '';
  }

  function formatarDataResumo(value: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
  }

  function tituloTrecho(transporte: RotTransporte, index: number): string {
    const trecho = String(transporte.trecho ?? '').trim() || `Trecho ${index + 1}`;
    const data = formatarDataResumo(transporte.data_voo || transporte.data_inicio);
    return data ? `${trecho} - ${data}` : trecho;
  }
</script>

<Card title="Passagem Aérea" color="clientes">
  <div class="mb-3 flex flex-wrap gap-2">
    <Button
      type="button"
      variant="secondary"
      size="sm"
      on:click={() => {
        transportes = addItem(transportes, newTransporte);
      }}
    >
      <Plus size={13} class="mr-1" />
      Adicionar trecho
    </Button>
  </div>

  {#if transportes.length === 0}
    <p class="py-6 text-center text-sm text-slate-400">Nenhum trecho aéreo adicionado.</p>
  {:else}
    <div class="space-y-3">
      {#each transportes as transporte, index}
        <div class="relative rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div class="mb-2 flex gap-1 sm:absolute sm:top-3 sm:right-3 sm:mb-0">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class_name="text-slate-400 hover:text-slate-600"
              disabled={index === 0}
              ariaLabel="Mover trecho para cima"
              title="Mover trecho para cima"
              on:click={() => {
                transportes = moveUp(transportes, index);
              }}
            >
              <ChevronUp size={13} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class_name="text-slate-400 hover:text-slate-600"
              disabled={index === transportes.length - 1}
              ariaLabel="Mover trecho para baixo"
              title="Mover trecho para baixo"
              on:click={() => {
                transportes = moveDown(transportes, index);
              }}
            >
              <ChevronDown size={13} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class_name="text-slate-400 hover:text-red-600"
              ariaLabel="Remover trecho"
              title="Remover trecho"
              on:click={() => {
                transportes = removeItem(transportes, index);
              }}
            >
              <Trash2 size={13} />
            </Button>
          </div>

          <details>
            <summary
              class="flex cursor-pointer list-none items-center justify-between gap-3 pr-28 text-sm font-semibold"
            >
              <span class="truncate">{tituloTrecho(transporte, index)}</span>
              <span aria-hidden="true" class="text-lg">
                <span class="indicador-mais">+</span><span class="indicador-menos">−</span>
              </span>
            </summary>
            <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              <div>
                <FieldSelect
                  label="Tipo"
                  bind:value={transporte.tipo}
                  options={TRANSPORTE_TIPO_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                  placeholder={null}
                  class_name="w-full"
                />
              </div>
              <div class="col-span-2">
                <FieldInput
                  label="Trecho"
                  bind:value={transporte.trecho}
                  placeholder="Ex: GRU → LIS"
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldInput
                  label="Cia. Aérea"
                  bind:value={transporte.cia_aerea}
                  placeholder="Ex: LATAM"
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldInput
                  label="Número do voo"
                  bind:value={transporte.descricao}
                  placeholder="Ex: LA 123"
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldInput
                  label="Data do voo"
                  type="date"
                  bind:value={transporte.data_voo}
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldSelect
                  label="Tipo voo"
                  bind:value={transporte.tipo_voo}
                  options={TRANSPORTE_TIPO_VOO_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                  placeholder={null}
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldInput
                  label="Classe reserva"
                  bind:value={transporte.classe_reserva}
                  placeholder="Ex: Econômica"
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldInput
                  label="Hora saída"
                  value={horarioExibido(transporte.hora_saida)}
                  mask="time"
                  on:input={(event) => atualizarHorario(event, transporte, 'hora_saida')}
                  placeholder="HH:MM"
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldInput
                  label="Aeroporto saída"
                  bind:value={transporte.aeroporto_saida}
                  placeholder="Ex: GRU"
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldInput
                  label="Duração voo"
                  value={horarioExibido(transporte.duracao_voo)}
                  mask="time"
                  on:input={(event) => atualizarHorario(event, transporte, 'duracao_voo')}
                  placeholder="HH:MM"
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldInput
                  label="Data chegada"
                  type="date"
                  bind:value={transporte.data_fim}
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldInput
                  label="Hora chegada"
                  value={horarioExibido(transporte.hora_chegada)}
                  mask="time"
                  helper={deslocamentoChegada(transporte.hora_chegada)
                    ? `Chegada em outro dia: ${deslocamentoChegada(transporte.hora_chegada).trim()}`
                    : null}
                  on:input={(event) => atualizarHorario(event, transporte, 'hora_chegada')}
                  placeholder="HH:MM"
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldInput
                  label="Aeroporto chegada"
                  bind:value={transporte.aeroporto_chegada}
                  placeholder="Ex: LIS"
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldInput
                  label="Tarifa"
                  bind:value={transporte.tarifa_nome}
                  placeholder="Ex: Light"
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldInput
                  label="Reembolso"
                  bind:value={transporte.reembolso_tipo}
                  placeholder="Ex: Reembolsável"
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldInput
                  label="Adultos"
                  type="number"
                  value={transporte.qtd_adultos ?? ''}
                  class_name="w-full"
                  on:input={(e) => {
                    transportes = updateItem(transportes, index, {
                      qtd_adultos: Number((e.target as HTMLInputElement).value) || null
                    });
                  }}
                />
              </div>
              <div>
                <FieldInput
                  label="Crianças"
                  type="number"
                  value={transporte.qtd_criancas ?? ''}
                  class_name="w-full"
                  on:input={(e) => {
                    transportes = updateItem(transportes, index, {
                      qtd_criancas: Number((e.target as HTMLInputElement).value) || null
                    });
                  }}
                />
              </div>
              <div>
                <FieldInput
                  money
                  label="Valor total (R$)"
                  type="number"
                  value={transporte.valor_total ?? ''}
                  class_name="w-full"
                  on:moneyInput={(e) => onAereoValorChange(index, 'valor_total', e.detail)}
                />
              </div>
              <div>
                <FieldInput
                  money
                  label="Taxas (R$)"
                  type="number"
                  value={transporte.taxas ?? ''}
                  class_name="w-full"
                  on:moneyInput={(e) => onAereoValorChange(index, 'taxas', e.detail)}
                />
              </div>
              <div>
                <FieldInput
                  label="Categoria"
                  bind:value={transporte.categoria}
                  placeholder="Ex: Executiva"
                  class_name="w-full"
                />
              </div>
              <div class="col-span-2">
                <FieldInput
                  label="Observação"
                  bind:value={transporte.observacao}
                  placeholder="Observações"
                  class_name="w-full"
                />
              </div>
            </div>
          </details>
        </div>
      {/each}
    </div>
    <div class="mt-3 flex flex-wrap gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        on:click={() => {
          transportes = addItem(transportes, newTransporte);
        }}
      >
        <Plus size={13} class="mr-1" />
        Adicionar trecho
      </Button>
    </div>
  {/if}

  <div class="mt-6 rounded-xl border border-dashed border-slate-300 p-4">
    <p class="mb-2 text-sm font-medium text-slate-600">Importar passagens por texto</p>
    <FieldTextarea
      bind:value={aereoImportText}
      rows={4}
      class_name="w-full"
      monospace={true}
      placeholder="Cole o texto com dados das passagens (um trecho por linha ou texto livre)…"
    />
    <div class="mt-2 flex items-center gap-3">
      <Button type="button" variant="secondary" size="sm" on:click={handleImportAereoText}
        >Importar</Button
      >
      {#if aereoImportMsg}<span class="text-xs text-green-600">{aereoImportMsg}</span>{/if}
      {#if aereoImportError}<span class="text-xs text-red-600">{aereoImportError}</span>{/if}
    </div>
  </div>
</Card>

<style>
  details > summary .indicador-menos,
  details[open] > summary .indicador-mais {
    display: none;
  }
  details[open] > summary .indicador-menos {
    display: inline;
  }
</style>
