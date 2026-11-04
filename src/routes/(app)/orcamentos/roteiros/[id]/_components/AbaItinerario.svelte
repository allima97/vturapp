<script lang="ts">
  import { FieldDatalistInput, FieldInput } from '$lib/components/ui';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { type RotDia, addItem, moveDown, moveUp, newDia, removeItem } from './tipos';
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';
  import { ChevronDown, ChevronUp, FileText, Plus, Trash2 } from '$lib/icons';

  let { dias = $bindable(), diasImportError = $bindable(), diasImportMsg = $bindable(), showDiasBusca = $bindable(), showDiasImport = $bindable(), sugestoes }: { dias: RotDia[]; diasImportError: string | null; diasImportMsg: string | null; showDiasBusca: boolean; showDiasImport: boolean; sugestoes: Record<string, string[]> } = $props();
</script>

<Card title="Itinerário dia a dia" color="clientes">
  <div class="mb-3 flex flex-wrap gap-2">
    <Button type="button" variant="secondary" size="sm" on:click={() => { showDiasImport = true; diasImportError = null; diasImportMsg = null; }}>
      <FileText size={13} class="mr-1" />
      Importar dia a dia
    </Button>
    <Button type="button" variant="secondary" size="sm" on:click={() => { showDiasBusca = true; }}>
      Buscar dias no banco
    </Button>
    <Button type="button" variant="secondary" size="sm" on:click={() => { dias = addItem(dias, newDia); }}>
      <Plus size={13} class="mr-1" />
      Adicionar dia
    </Button>
  </div>

  {#if dias.length === 0}
    <p class="py-6 text-center text-sm text-slate-400">Nenhum dia adicionado. Clique em "Adicionar dia" ou "Buscar dias no banco".</p>
  {:else}
    <div class="space-y-2">
      {#each dias as dia, index}
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div class="mb-2 flex items-center justify-between">
            <span class="flex h-6 w-6 items-center justify-center rounded-full bg-clientes-100 text-xs font-bold text-clientes-700">
              {index + 1}
            </span>
            <div class="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                class_name="text-slate-400 hover:text-slate-600"
                disabled={index === 0}
                ariaLabel="Mover dia para cima"
                title="Mover dia para cima"
                on:click={() => { dias = moveUp(dias, index); }}
              >
                <ChevronUp size={13} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                class_name="text-slate-400 hover:text-slate-600"
                disabled={index === dias.length - 1}
                ariaLabel="Mover dia para baixo"
                title="Mover dia para baixo"
                on:click={() => { dias = moveDown(dias, index); }}
              >
                <ChevronDown size={13} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                class_name="text-slate-400 hover:text-red-600"
                ariaLabel="Remover dia"
                title="Remover dia"
                on:click={() => { dias = removeItem(dias, index); }}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CidadeDestinoAutocomplete
              label="Cidade"
              bind:value={dia.cidade}
              placeholder="Cidade"
              class_name="w-full"
              endpoint="/api/v1/orcamentos/cidades-busca"
            />
            <FieldInput
              label="Percurso"
              bind:value={dia.percurso}
              placeholder="Ex: São Paulo → Lisboa"
              class_name="w-full"
            />
            <FieldInput
              label="Data"
              type="date"
              bind:value={dia.data}
              class_name="w-full"
            />
            <FieldInput
              label="Descrição"
              bind:value={dia.descricao}
              placeholder="Atividades do dia"
              class_name="w-full"
            />
          </div>
        </div>
      {/each}
    </div>
    <div class="mt-3 flex flex-wrap gap-2">
      <Button type="button" variant="secondary" size="sm" on:click={() => { dias = addItem(dias, newDia); }}>
        <Plus size={13} class="mr-1" />
        Adicionar dia
      </Button>
    </div>
  {/if}
</Card>
