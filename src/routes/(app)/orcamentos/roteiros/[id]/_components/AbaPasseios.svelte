<script lang="ts">
  import { FieldDatalistInput, FieldInput, FieldSelect, FieldTextarea } from '$lib/components/ui';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import {
    type RotPasseio,
    addItem,
    moveDown,
    moveUp,
    newPasseio,
    removeItem,
    updateItem
  } from './tipos';
  import { ChevronDown, ChevronUp, Plus, Trash2 } from '$lib/icons';
  import CidadeRoteiro from './CidadeRoteiro.svelte';
  import {
    chaveCidadeCatalogo,
    consultarCatalogoCidade,
    type CidadeCatalogo
  } from '$lib/catalogoOpcionaisBusca';
  import { chaveNomeOpcional } from '$lib/importarOpcionais';
  import { toUserMessage } from '$lib/utils/errors';

  let {
    PASSEIO_TIPO_OPTIONS,
    handleImportPasseioText,
    passeioImportError,
    passeioImportMsg,
    passeioImportText = $bindable(),
    passeios = $bindable(),
    sugestoes
  }: {
    PASSEIO_TIPO_OPTIONS: string[];
    handleImportPasseioText: () => void;
    passeioImportError: string | null;
    passeioImportMsg: string | null;
    passeioImportText: string;
    passeios: RotPasseio[];
    sugestoes: Record<string, string[]>;
  } = $props();

  type CatalogoPasseios = {
    estado: 'carregando' | 'pronto' | 'erro';
    nomes: string[];
    erro?: string;
  };
  let catalogosPasseios: Record<string, CatalogoPasseios> = $state({});

  async function consultarCatalogo(cidade: CidadeCatalogo) {
    const items = await consultarCatalogoCidade(cidade);
    return [
      ...new Map(
        items
          .map((item) => String(item.nome ?? '').trim())
          .filter(Boolean)
          .map((nome) => [chaveNomeOpcional(nome), nome])
      ).values()
    ];
  }

  async function buscarCatalogo(cidade: CidadeCatalogo) {
    const chave = chaveCidadeCatalogo(cidade);
    const existente = catalogosPasseios[chave];
    if (existente && existente.estado !== 'erro') return;
    catalogosPasseios[chave] = { estado: 'carregando', nomes: [] };
    try {
      catalogosPasseios[chave] = {
        estado: 'pronto',
        nomes: await consultarCatalogo(cidade)
      };
    } catch (err) {
      catalogosPasseios[chave] = {
        estado: 'erro',
        nomes: [],
        erro: toUserMessage(err, 'Erro ao carregar sugestões de passeios.')
      };
    }
  }

  function opcoesIngressos(valor: string) {
    const opcoes = [
      { value: 'Incluído', label: 'Incluído' },
      { value: 'Não incluído', label: 'Não incluído' }
    ];
    if (valor && !opcoes.some((opcao) => opcao.value === valor))
      opcoes.unshift({ value: valor, label: valor });
    return opcoes;
  }

  $effect(() => {
    const cidades = [
      ...new Map(
        passeios
          .map(
            (passeio) =>
              [
                chaveCidadeCatalogo(passeio),
                { cidade: String(passeio.cidade ?? '').trim(), cidade_id: passeio.cidade_id }
              ] as const
          )
          .filter(([chave]) => chave)
      ).values()
    ];
    const timer = setTimeout(() => {
      for (const cidade of cidades) void buscarCatalogo(cidade);
    }, 350);
    return () => clearTimeout(timer);
  });
</script>

<Card title="Passeios e Serviços" color="clientes">
  <div class="mb-3 flex flex-wrap gap-2">
    <Button
      type="button"
      variant="secondary"
      size="sm"
      on:click={() => {
        passeios = addItem(passeios, newPasseio);
      }}
    >
      <Plus size={13} class="mr-1" />
      Adicionar passeio
    </Button>
  </div>

  {#if passeios.length === 0}
    <p class="py-6 text-center text-sm text-slate-400">Nenhum passeio adicionado.</p>
  {:else}
    <div class="space-y-3">
      {#each passeios as passeio, index (passeio)}
        <div class="relative rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div class="absolute top-3 right-3 flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class_name="text-slate-400 hover:text-slate-600"
              disabled={index === 0}
              ariaLabel="Mover passeio para cima"
              title="Mover passeio para cima"
              on:click={() => {
                passeios = moveUp(passeios, index);
              }}
            >
              <ChevronUp size={13} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class_name="text-slate-400 hover:text-slate-600"
              disabled={index === passeios.length - 1}
              ariaLabel="Mover passeio para baixo"
              title="Mover passeio para baixo"
              on:click={() => {
                passeios = moveDown(passeios, index);
              }}
            >
              <ChevronDown size={13} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class_name="text-slate-400 hover:text-red-600"
              ariaLabel="Remover passeio"
              title="Remover passeio"
              on:click={() => {
                passeios = removeItem(passeios, index);
              }}
            >
              <Trash2 size={13} />
            </Button>
          </div>

          <details>
            <summary
              class="flex cursor-pointer list-none items-center justify-between gap-3 pr-28 text-sm font-semibold"
            >
              <span class="truncate"
                >{String(passeio.passeio ?? '').trim() || `Passeio ${index + 1}`}</span
              >
              <span aria-hidden="true" class="text-lg">
                <span class="indicador-mais">+</span><span class="indicador-menos">−</span>
              </span>
            </summary>
            <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              <div class="col-span-2">
                <CidadeRoteiro bind:destino={passeios[index]} fieldId={`passeio-cidade-${index}`} />
              </div>
              <div class="col-span-2">
                <FieldDatalistInput
                  label="Passeio / Serviço"
                  bind:value={passeio.passeio}
                  placeholder="Nome do passeio"
                  class_name="w-full"
                  options={catalogosPasseios[chaveCidadeCatalogo(passeio)]?.nomes ?? []}
                  helper={(() => {
                    const catalogo = catalogosPasseios[chaveCidadeCatalogo(passeio)];
                    if (catalogo?.estado === 'carregando')
                      return 'Carregando sugestões da cidade...';
                    if (catalogo?.estado === 'erro')
                      return catalogo.erro ?? 'Erro ao carregar sugestões.';
                    return null;
                  })()}
                />
              </div>
              <div class="col-span-2">
                <FieldInput
                  label="Fornecedor"
                  bind:value={passeio.fornecedor}
                  placeholder="Fornecedor"
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldInput
                  label="Data início"
                  type="date"
                  bind:value={passeio.data_inicio}
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldInput
                  label="Data fim"
                  type="date"
                  bind:value={passeio.data_fim}
                  class_name="w-full"
                />
              </div>
              <div>
                <FieldSelect
                  label="Tipo"
                  bind:value={passeio.tipo}
                  options={PASSEIO_TIPO_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                  placeholder={null}
                  class_name="w-full"
                />
              </div>
              {#if passeio.tipo === 'Ingresso' || passeio.tipo === 'Passeio'}
                <div>
                  <FieldSelect
                    label="Ingressos"
                    bind:value={passeio.ingressos}
                    options={opcoesIngressos(passeio.ingressos)}
                    placeholder={null}
                    class_name="w-full"
                  />
                </div>
              {/if}
              <div>
                <FieldInput
                  label="Adultos"
                  type="number"
                  value={passeio.qtd_adultos ?? ''}
                  class_name="w-full"
                  on:input={(e) => {
                    passeios = updateItem(passeios, index, {
                      qtd_adultos: Number((e.target as HTMLInputElement).value) || null
                    });
                  }}
                />
              </div>
              <div>
                <FieldInput
                  label="Crianças"
                  type="number"
                  value={passeio.qtd_criancas ?? ''}
                  class_name="w-full"
                  on:input={(e) => {
                    passeios = updateItem(passeios, index, {
                      qtd_criancas: Number((e.target as HTMLInputElement).value) || null
                    });
                  }}
                />
              </div>
              <div>
                <FieldInput
                  label="Valor original (R$)"
                  type="number"
                  value={passeio.valor_original ?? ''}
                  class_name="w-full"
                  on:input={(e) => {
                    passeios = updateItem(passeios, index, {
                      valor_original: Number((e.target as HTMLInputElement).value) || null
                    });
                  }}
                />
              </div>
              <div>
                <FieldInput
                  label="Valor final (R$)"
                  type="number"
                  value={passeio.valor_final ?? ''}
                  class_name="w-full"
                  on:input={(e) => {
                    passeios = updateItem(passeios, index, {
                      valor_final: Number((e.target as HTMLInputElement).value) || null
                    });
                  }}
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
          passeios = addItem(passeios, newPasseio);
        }}
      >
        <Plus size={13} class="mr-1" />
        Adicionar passeio
      </Button>
    </div>
  {/if}

  <div class="mt-6 rounded-xl border border-dashed border-slate-300 p-4">
    <p class="mb-2 text-sm font-medium text-slate-600">Importar passeios por texto</p>
    <FieldTextarea
      bind:value={passeioImportText}
      rows={4}
      class_name="w-full"
      monospace={true}
      placeholder="Cole o texto com dados dos passeios (um por linha ou texto livre)…"
    />
    <div class="mt-2 flex items-center gap-3">
      <Button type="button" variant="secondary" size="sm" on:click={handleImportPasseioText}
        >Importar</Button
      >
      {#if passeioImportMsg}<span class="text-xs text-green-600">{passeioImportMsg}</span>{/if}
      {#if passeioImportError}<span class="text-xs text-red-600">{passeioImportError}</span>{/if}
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
