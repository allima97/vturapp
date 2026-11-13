<script lang="ts">
  import { FieldInput, FieldTextarea } from '$lib/components/ui';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { type RotDia, addItem, moveDown, moveUp, newDia, removeItem } from './tipos';
  import CidadeRoteiro from './CidadeRoteiro.svelte';
  import { ChevronDown, ChevronUp, FileText, Plus, Trash2 } from '$lib/icons';
  import { formatISODateBR } from '$lib/date';

  let {
    dias = $bindable(),
    diasImportError = $bindable(),
    diasImportMsg = $bindable(),
    showDiasBusca = $bindable(),
    showDiasImport = $bindable(),
    sugestoes,
    buscarDescricoes,
    abrirBuscaDias
  }: {
    dias: RotDia[];
    diasImportError: string | null;
    diasImportMsg: string | null;
    showDiasBusca: boolean;
    showDiasImport: boolean;
    sugestoes: Record<string, string[]>;
    buscarDescricoes?: (dia: RotDia) => void;
    abrirBuscaDias?: () => void;
  } = $props();

  function tituloDia(dia: RotDia, index: number) {
    const percurso = String(dia.percurso ?? '').trim() || `Dia ${index + 1}`;
    const data = String(dia.data ?? '').trim();
    if (!data) return percurso;
    const formatada = formatISODateBR(data);
    return `${percurso} - ${formatada === '-' ? data : formatada.replaceAll('/', '-')}`;
  }
</script>

<Card title="Itinerário dia a dia" color="clientes">
  <div class="mb-3 flex flex-wrap gap-2">
    <Button
      type="button"
      variant="secondary"
      size="sm"
      on:click={() => {
        showDiasImport = true;
        diasImportError = null;
        diasImportMsg = null;
      }}
    >
      <FileText size={13} class="mr-1" />
      Importar dia a dia
    </Button>
    <Button
      type="button"
      variant="secondary"
      size="sm"
      on:click={() => {
        if (abrirBuscaDias) abrirBuscaDias();
        else showDiasBusca = true;
      }}
    >
      Buscar dias no banco
    </Button>
    <Button
      type="button"
      variant="secondary"
      size="sm"
      on:click={() => {
        dias = addItem(dias, newDia);
      }}
    >
      <Plus size={13} class="mr-1" />
      Adicionar dia
    </Button>
  </div>

  {#if dias.length === 0}
    <p class="py-6 text-center text-sm text-slate-400">
      Nenhum dia adicionado. Clique em "Adicionar dia" ou "Buscar dias no banco".
    </p>
  {:else}
    <div class="space-y-2">
      {#each dias as dia, index (dia)}
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div class="dia-cabecalho flex items-start justify-between gap-2">
            <details class="min-w-0 flex-1">
              <summary
                class="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold"
              >
                <span class="flex min-w-0 items-center gap-2">
                  <span
                    class="bg-clientes-100 text-clientes-700 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  >
                    {index + 1}
                  </span>
                  <span class="truncate">{tituloDia(dia, index)}</span>
                </span>
                <span aria-hidden="true" class="text-lg">
                  <span class="indicador-mais">+</span><span class="indicador-menos">−</span>
                </span>
              </summary>
              <div class="dia-campos mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <CidadeRoteiro bind:destino={dias[index]} fieldId={`dia-cidade-${index}`} />
                <FieldInput
                  label="Percurso"
                  bind:value={dia.percurso}
                  placeholder="Ex: São Paulo → Lisboa"
                  class_name="w-full"
                />
                <FieldInput label="Data" type="date" bind:value={dia.data} class_name="w-full" />
              </div>
              <div class="mt-3">
                <FieldTextarea
                  label="Descrição"
                  bind:value={dia.descricao}
                  placeholder="Atividades do dia"
                  rows={3}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  class_name="mt-2"
                  disabled={!dia.cidade.trim() || Boolean(dia.cidade_pendente)}
                  on:click={() => buscarDescricoes?.(dia)}
                >
                  Buscar descrições desta cidade
                </Button>
              </div>
            </details>
            <div class="dia-acoes flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                class_name="text-slate-400 hover:text-slate-600"
                disabled={index === 0}
                ariaLabel="Mover dia para cima"
                title="Mover dia para cima"
                on:click={() => {
                  dias = moveUp(dias, index);
                }}
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
                on:click={() => {
                  dias = moveDown(dias, index);
                }}
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
                on:click={() => {
                  dias = removeItem(dias, index);
                }}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          </div>
        </div>
      {/each}
    </div>
    <div class="mt-3 flex flex-wrap gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        on:click={() => {
          dias = addItem(dias, newDia);
        }}
      >
        <Plus size={13} class="mr-1" />
        Adicionar dia
      </Button>
    </div>
  {/if}
</Card>

<style>
  details > summary .indicador-menos,
  details[open] > summary .indicador-mais {
    display: none;
  }
  details[open] > summary .indicador-menos {
    display: inline;
  }

  @media (max-width: 640px) {
    .dia-cabecalho {
      position: relative;
    }

    .dia-cabecalho > details > summary {
      min-height: 40px;
      padding-right: 136px;
    }

    .dia-campos {
      grid-template-columns: minmax(0, 1fr);
    }

    .dia-cabecalho,
    .dia-acoes {
      flex-wrap: nowrap !important;
    }

    .dia-acoes {
      position: absolute;
      top: 0;
      right: 0;
      width: auto !important;
      flex: none;
    }

    .dia-acoes :global(button) {
      width: 40px !important;
      min-width: 40px !important;
    }
  }
</style>
