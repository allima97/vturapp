<script lang="ts">
  import { FieldDatalistInput, FieldInput, FieldSelect, FieldTextarea } from '$lib/components/ui';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { type RotHotel, addItem, moveDown, moveUp, newHotel, removeItem, updateItem } from './tipos';
  import { ChevronDown, ChevronUp, Plus, Trash2 } from '$lib/icons';
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';

  let { HOTEL_CATEGORIA_OPTIONS, HOTEL_REGIME_OPTIONS, handleImportHotelText, hoteis = $bindable(), hotelImportError, hotelImportMsg, hotelImportText = $bindable(), onHotelDateChange, sugestoes }: { HOTEL_CATEGORIA_OPTIONS: string[]; HOTEL_REGIME_OPTIONS: string[]; handleImportHotelText: () => void; hoteis: RotHotel[]; hotelImportError: string | null; hotelImportMsg: string | null; hotelImportText: string; onHotelDateChange: (index: number, field: 'data_inicio' | 'data_fim', value: string) => void; sugestoes: Record<string, string[]> } = $props();
</script>

<Card title="Hotéis" color="clientes">
  <div class="mb-3 flex flex-wrap gap-2">
    <Button type="button" variant="secondary" size="sm" on:click={() => { hoteis = addItem(hoteis, newHotel); }}>
      <Plus size={13} class="mr-1" />
      Adicionar hotel
    </Button>
  </div>

  {#if hoteis.length === 0}
    <p class="py-6 text-center text-sm text-slate-400">Nenhum hotel adicionado.</p>
  {:else}
    <div class="space-y-3">
      {#each hoteis as hotel, index}
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-500">Hotel {index + 1}</span>
            <div class="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                class_name="text-slate-400 hover:text-slate-600"
                disabled={index === 0}
                ariaLabel="Mover hotel para cima"
                title="Mover hotel para cima"
                on:click={() => { hoteis = moveUp(hoteis, index); }}
              >
                <ChevronUp size={13} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                class_name="text-slate-400 hover:text-slate-600"
                disabled={index === hoteis.length - 1}
                ariaLabel="Mover hotel para baixo"
                title="Mover hotel para baixo"
                on:click={() => { hoteis = moveDown(hoteis, index); }}
              >
                <ChevronDown size={13} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                class_name="text-slate-400 hover:text-red-600"
                ariaLabel="Remover hotel"
                title="Remover hotel"
                on:click={() => { hoteis = removeItem(hoteis, index); }}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <div class="col-span-2">
              <CidadeDestinoAutocomplete
                label="Cidade"
                bind:value={hotel.cidade}
                placeholder="Cidade"
                class_name="w-full"
                endpoint="/api/v1/orcamentos/cidades-busca"
              />
            </div>
            <div class="col-span-2">
              <FieldInput
                label="Hotel"
                bind:value={hotel.hotel}
                placeholder="Nome do hotel"
                class_name="w-full"
              />
            </div>
            <div class="col-span-2">
              <FieldInput
                label="Endereço"
                bind:value={hotel.endereco}
                placeholder="Endereço"
                class_name="w-full"
              />
            </div>
            <div>
              <FieldInput
                label="Data entrada"
                type="date"
                value={hotel.data_inicio}
                class_name="w-full"
                on:change={(e) => onHotelDateChange(index, 'data_inicio', (e.target as HTMLInputElement).value)}
              />
            </div>
            <div>
              <FieldInput
                label="Data saída"
                type="date"
                value={hotel.data_fim}
                class_name="w-full"
                on:change={(e) => onHotelDateChange(index, 'data_fim', (e.target as HTMLInputElement).value)}
              />
            </div>
            <div>
              <FieldInput
                label="Noites"
                type="number"
                value={hotel.noites ?? ''}
                class_name="w-full"
                placeholder="Auto"
                on:input={(e) => { hoteis = updateItem(hoteis, index, { noites: Number((e.target as HTMLInputElement).value) || null }); }}
              />
            </div>
            <div>
              <FieldInput
                label="Qtd. aptos"
                type="number"
                value={hotel.qtd_apto ?? ''}
                class_name="w-full"
                on:input={(e) => { hoteis = updateItem(hoteis, index, { qtd_apto: Number((e.target as HTMLInputElement).value) || null }); }}
              />
            </div>
            <div>
              <FieldInput
                label="Apto (tipo)"
                bind:value={hotel.apto}
                placeholder="Ex: Duplo"
                class_name="w-full"
              />
            </div>
            <div>
              <FieldSelect
                label="Categoria"
                bind:value={hotel.categoria}
                options={HOTEL_CATEGORIA_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                class_name="w-full"
              />
            </div>
            <div>
              <FieldSelect
                label="Regime"
                bind:value={hotel.regime}
                options={HOTEL_REGIME_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                class_name="w-full"
              />
            </div>
            <div>
              <FieldInput
                label="Tipo tarifa"
                bind:value={hotel.tipo_tarifa}
                placeholder="Ex: Cortesia"
                class_name="w-full"
              />
            </div>
            <div>
              <FieldInput
                label="Adultos"
                type="number"
                value={hotel.qtd_adultos ?? ''}
                class_name="w-full"
                on:input={(e) => { hoteis = updateItem(hoteis, index, { qtd_adultos: Number((e.target as HTMLInputElement).value) || null }); }}
              />
            </div>
            <div>
              <FieldInput
                label="Crianças"
                type="number"
                value={hotel.qtd_criancas ?? ''}
                class_name="w-full"
                on:input={(e) => { hoteis = updateItem(hoteis, index, { qtd_criancas: Number((e.target as HTMLInputElement).value) || null }); }}
              />
            </div>
            <div>
              <FieldInput
                label="Valor original (R$)"
                type="number"
                value={hotel.valor_original ?? ''}
                class_name="w-full"
                on:input={(e) => { hoteis = updateItem(hoteis, index, { valor_original: Number((e.target as HTMLInputElement).value) || null }); }}
              />
            </div>
            <div>
              <FieldInput
                label="Valor final (R$)"
                type="number"
                value={hotel.valor_final ?? ''}
                class_name="w-full"
                on:input={(e) => { hoteis = updateItem(hoteis, index, { valor_final: Number((e.target as HTMLInputElement).value) || null }); }}
              />
            </div>
          </div>
        </div>
      {/each}
    </div>
    <div class="mt-3 flex flex-wrap gap-2">
      <Button type="button" variant="secondary" size="sm" on:click={() => { hoteis = addItem(hoteis, newHotel); }}>
        <Plus size={13} class="mr-1" />
        Adicionar hotel
      </Button>
    </div>
  {/if}

  <!-- Import por texto -->
  <div class="mt-6 rounded-xl border border-dashed border-slate-300 p-4">
    <p class="mb-2 text-sm font-medium text-slate-600">Importar hotéis por texto</p>
    <FieldTextarea bind:value={hotelImportText} rows={4} class_name="w-full" monospace={true}
      placeholder="Cole o texto com dados dos hotéis (um por linha ou texto livre)…" />
    <div class="mt-2 flex items-center gap-3">
      <Button type="button" variant="secondary" size="sm" on:click={handleImportHotelText}>Importar</Button>
      {#if hotelImportMsg}<span class="text-xs text-green-600">{hotelImportMsg}</span>{/if}
      {#if hotelImportError}<span class="text-xs text-red-600">{hotelImportError}</span>{/if}
    </div>
  </div>
</Card>
