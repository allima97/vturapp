<script lang="ts">
  import { FieldInput, FieldTextarea } from '$lib/components/ui';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import {
    MAX_CIDADES_OPCIONAIS,
    MAX_PASSEIOS_POR_CIDADE,
    type RoteiroOpcionalCidade
  } from '$lib/roteiroOpcionais';
  import CidadeRoteiro from './CidadeRoteiro.svelte';
  import type { OpcionalCatalogo } from '$lib/catalogoOpcionais';
  import {
    chaveCidadeCatalogo,
    consultarCatalogoCidade,
    type CidadeCatalogo
  } from '$lib/catalogoOpcionaisBusca';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { chaveNomeOpcional } from '$lib/importarOpcionais';
  import { untrack } from 'svelte';

  let {
    opcionais = $bindable(),
    cidadesItinerario = [],
    passeiosIncorporados = []
  }: {
    opcionais: RoteiroOpcionalCidade[];
    cidadesItinerario?: CidadeCatalogo[];
    passeiosIncorporados?: { cidade: string; cidade_id?: string | null; passeio: string }[];
  } = $props();
  type CatalogoCidade = {
    estado: 'carregando' | 'pronto' | 'erro';
    items: OpcionalCatalogo[];
    erro?: string;
  };
  let catalogos: Record<string, CatalogoCidade> = $state({});
  let adicionandoTodos = $state(false);
  const sequencias = new Map<string, number>();

  function jaAdicionado(cidade: RoteiroOpcionalCidade, item: OpcionalCatalogo) {
    return cidade.passeios.some((p) => chaveNomeOpcional(p.nome) === chaveNomeOpcional(item.nome));
  }

  function jaIncorporado(item: OpcionalCatalogo) {
    return passeiosIncorporados.some(
      (passeio) =>
        chaveCidadeCatalogo(passeio) === chaveCidadeCatalogo(item) &&
        chaveNomeOpcional(passeio.passeio) === chaveNomeOpcional(item.nome)
    );
  }

  function naoAdicionados(cidade: RoteiroOpcionalCidade) {
    const items = catalogos[chaveCidadeCatalogo(cidade)]?.items ?? [];
    return items.filter((item) => !jaAdicionado(cidade, item) && !jaIncorporado(item));
  }

  async function buscar(cidade: CidadeCatalogo) {
    const chave = chaveCidadeCatalogo(cidade);
    if (!chave) return;
    const seq = (sequencias.get(chave) ?? 0) + 1;
    sequencias.set(chave, seq);
    catalogos[chave] = { estado: 'carregando', items: [] };
    try {
      const items = await consultarCatalogoCidade(cidade);
      if (sequencias.get(chave) === seq) catalogos[chave] = { estado: 'pronto', items };
    } catch (err) {
      if (sequencias.get(chave) === seq)
        catalogos[chave] = {
          estado: 'erro',
          items: [],
          erro: toUserMessage(err, 'Erro ao buscar opcionais.')
        };
    }
  }

  $effect(() => {
    const cidades = [
      ...new Map(
        opcionais.map((cidade) => [
          chaveCidadeCatalogo(cidade),
          { cidade: String(cidade.cidade ?? '').trim(), cidade_id: cidade.cidade_id }
        ])
      ).entries()
    ].filter(([chave]) => chave);
    let cancelado = false;
    const timer = setTimeout(() => {
      const pendentes = cidades.filter(([chave]) => !untrack(() => catalogos[chave]));
      let proximo = 0;
      const worker = async () => {
        while (!cancelado && proximo < pendentes.length) {
          const [, cidade] = pendentes[proximo++];
          await buscar(cidade);
        }
      };
      for (let i = 0; i < Math.min(4, pendentes.length); i++) void worker();
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  });

  function adicionar(cidade: RoteiroOpcionalCidade, item: OpcionalCatalogo) {
    if (
      !cidade ||
      !opcionais.includes(cidade) ||
      chaveCidadeCatalogo(cidade) !== chaveCidadeCatalogo(item)
    ) {
      toast.error('A cidade foi removida do roteiro. Busque novamente.');
      return;
    }
    if (jaAdicionado(cidade, item)) {
      toast.warning('Este passeio já está na cidade.');
      return;
    }
    if (jaIncorporado(item)) {
      toast.warning('Este passeio já foi incorporado ao roteiro.');
      return;
    }
    if (cidade.passeios.length >= MAX_PASSEIOS_POR_CIDADE) {
      toast.error(`Cada cidade pode ter até ${MAX_PASSEIOS_POR_CIDADE} passeios.`);
      return;
    }
    cidade.passeios = [...cidade.passeios, { nome: item.nome, descricao: item.descricao }];
    toast.success('Opcional adicionado ao roteiro. Salve o roteiro para manter a alteração.');
  }

  async function adicionarTodos(cidadeUnica?: RoteiroOpcionalCidade) {
    if (adicionandoTodos) return;
    const alvos = new Map<string, { destino: CidadeCatalogo; cidade?: RoteiroOpcionalCidade }>();
    const cidades = cidadeUnica ? [cidadeUnica] : opcionais;
    for (const cidade of cidades) {
      const nome = String(cidade.cidade ?? '').trim();
      const destino = { cidade: nome, cidade_id: cidade.cidade_id };
      const chave = chaveCidadeCatalogo(destino);
      if (chave && !alvos.has(chave)) alvos.set(chave, { destino, cidade });
    }
    if (!cidadeUnica) {
      for (const cidade of cidadesItinerario) {
        const destino = { cidade: cidade.cidade.trim(), cidade_id: cidade.cidade_id };
        const chave = chaveCidadeCatalogo(destino);
        if (chave && !alvos.has(chave)) alvos.set(chave, { destino });
      }
    }
    if (!alvos.size) {
      toast.warning('Adicione ou selecione uma cidade antes de buscar opcionais.');
      return;
    }

    adicionandoTodos = true;
    try {
      const encontrados = new Map<string, OpcionalCatalogo[]>();
      for (const [chave, alvo] of alvos) {
        encontrados.set(chave, await consultarCatalogoCidade(alvo.destino));
      }
      const totalCatalogo = [...encontrados.values()].reduce(
        (total, items) => total + items.length,
        0
      );

      const alteracoes: {
        cidade: RoteiroOpcionalCidade;
        passeios: RoteiroOpcionalCidade['passeios'];
        nova: boolean;
      }[] = [];
      let total = 0;
      for (const [chave, alvo] of alvos) {
        if (
          alvo.cidade &&
          (!opcionais.includes(alvo.cidade) || chaveCidadeCatalogo(alvo.cidade) !== chave)
        )
          throw new Error('Uma cidade foi alterada ou removida. Tente novamente.');
        const existente =
          alvo.cidade ?? opcionais.find((cidade) => chaveCidadeCatalogo(cidade) === chave);
        const cidade = existente ?? {
          cidade: alvo.destino.cidade,
          ...(alvo.destino.cidade_id ? { cidade_id: alvo.destino.cidade_id } : {}),
          passeios: []
        };
        const passeios = [...cidade.passeios];
        for (const item of encontrados.get(chave) ?? []) {
          if (chaveCidadeCatalogo(item) !== chave)
            throw new Error('O catálogo retornou um passeio de outra cidade. Tente novamente.');
          if (!jaAdicionado({ ...cidade, passeios }, item) && !jaIncorporado(item)) {
            passeios.push({ nome: item.nome, descricao: item.descricao });
            total++;
          }
        }
        if (passeios.length > MAX_PASSEIOS_POR_CIDADE)
          throw new Error(
            `${alvo.destino.cidade} excede o limite de ${MAX_PASSEIOS_POR_CIDADE} passeios por cidade. Adicione os passeios desejados individualmente.`
          );
        if (passeios.length > cidade.passeios.length)
          alteracoes.push({ cidade, passeios, nova: !existente });
      }
      if (opcionais.length + alteracoes.filter((item) => item.nova).length > MAX_CIDADES_OPCIONAIS)
        throw new Error(`O roteiro excederia o limite de ${MAX_CIDADES_OPCIONAIS} cidades.`);
      for (const [chave, items] of encontrados) {
        sequencias.set(chave, (sequencias.get(chave) ?? 0) + 1);
        catalogos[chave] = { estado: 'pronto', items };
      }
      for (const item of alteracoes) item.cidade.passeios = item.passeios;
      opcionais = [
        ...opcionais,
        ...alteracoes.filter((item) => item.nova).map((item) => item.cidade)
      ];
      if (total)
        toast.success(
          `${total} passeio(s) adicionado(s). Salve o roteiro para manter a alteração.`
        );
      else if (totalCatalogo === 0)
        toast.warning(
          'Nenhum passeio foi encontrado no catálogo para as cidades do roteiro. Confira se os opcionais estão cadastrados para essas cidades.'
        );
      else
        toast.warning(
          'Nenhum passeio novo: todos os passeios encontrados no catálogo já estão em Opcionais ou incorporados ao roteiro.'
        );
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao adicionar opcionais.'));
    } finally {
      adicionandoTodos = false;
    }
  }

  function adicionarCidadesItinerario() {
    const chaves = new Set(opcionais.map(chaveCidadeCatalogo));
    const novas: RoteiroOpcionalCidade[] = [];
    for (const destino of cidadesItinerario) {
      const cidade = String(destino.cidade ?? '').trim();
      const chave = chaveCidadeCatalogo(destino);
      if (chave && !chaves.has(chave)) {
        chaves.add(chave);
        novas.push({
          cidade,
          ...(destino.cidade_id ? { cidade_id: destino.cidade_id } : {}),
          passeios: []
        });
      }
    }
    if (!novas.length) {
      toast.warning('Não há novas cidades do itinerário para adicionar.');
      return;
    }
    opcionais = [...opcionais, ...novas];
  }
  function mover(index: number, delta: number) {
    const next = [...opcionais];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    opcionais = next;
  }
</script>

<Card title="Opcionais por cidade" color="clientes">
  <p class="mb-4 text-sm text-slate-500">
    Sugestões de passeios e atividades sem data marcada, organizadas por cidade. Aparecem no PDF
    como opcionais e não entram no valor do roteiro.
  </p>
  <Button
    type="button"
    variant="secondary"
    size="sm"
    on:click={() => {
      opcionais = [...opcionais, { cidade: '', passeios: [] }];
    }}>Adicionar cidade</Button
  >
  <Button type="button" variant="secondary" size="sm" on:click={adicionarCidadesItinerario}>
    Adicionar cidades do itinerário
  </Button>
  <Button
    type="button"
    variant="secondary"
    size="sm"
    disabled={adicionandoTodos}
    on:click={() => adicionarTodos()}
  >
    {adicionandoTodos
      ? 'Adicionando opcionais...'
      : 'Adicionar todos os opcionais das cidades do roteiro'}
  </Button>
  <a class="ml-2 text-sm text-blue-700 underline" href="/cadastros/opcionais">
    Gerenciar catálogo de opcionais
  </a>
  {#if opcionais.length === 0}
    <p class="py-6 text-center text-sm text-slate-400">Nenhuma cidade adicionada aos opcionais.</p>
  {/if}
  <div class="mt-4 space-y-4">
    {#each opcionais as cidade, index (cidade)}
      <details class="rounded-xl border border-slate-200 p-4">
        <summary
          class="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold"
        >
          <span
            >{String(cidade.cidade ?? '').trim() || `Cidade ${index + 1} (sem nome)`} (+{cidade
              .passeios.length}) {#if catalogos[chaveCidadeCatalogo(cidade)]?.estado === 'pronto'}
              (-{naoAdicionados(cidade).length})
            {:else if String(cidade.cidade ?? '').trim()}
              (-?)
            {/if}</span
          >
          <span aria-hidden="true" class="text-lg">
            <span class="indicador-mais">+</span><span class="indicador-menos">−</span>
          </span>
        </summary>
        <div class="mt-4">
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <span class="mr-auto text-sm font-semibold">Cidade {index + 1}</span>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              disabled={index === 0}
              on:click={() => mover(index, -1)}>Subir cidade</Button
            >
            <Button
              type="button"
              variant="secondary"
              size="xs"
              disabled={index === opcionais.length - 1}
              on:click={() => mover(index, 1)}>Descer cidade</Button
            >
            <Button
              type="button"
              variant="secondary"
              size="xs"
              on:click={() => {
                opcionais = opcionais.filter((_, i) => i !== index);
              }}>Remover cidade</Button
            >
          </div>
          <CidadeRoteiro
            bind:destino={opcionais[index]}
            fieldId={`opcional-cidade-${index}`}
            required
          />
          <div class="mt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!String(cidade.cidade ?? '').trim()}
              on:click={() => buscar({ cidade: cidade.cidade, cidade_id: cidade.cidade_id })}
            >
              Atualizar catálogo desta cidade
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={adicionandoTodos}
              on:click={() => adicionarTodos(cidade)}
            >
              Adicionar todos os opcionais desta cidade
            </Button>
          </div>
          <h3 class="mt-4 text-sm font-semibold">
            Adicionados ao roteiro ({cidade.passeios.length})
          </h3>
          <div class="my-3 space-y-3">
            {#each cidade.passeios as passeio, passeioIndex (passeio)}
              <details class="rounded-lg bg-slate-50 p-3">
                <summary
                  class="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold"
                >
                  <span
                    >{String(passeio.nome ?? '').trim() ||
                      `Passeio ${passeioIndex + 1} (sem nome)`}</span
                  >
                  <span aria-hidden="true" class="text-lg">
                    <span class="indicador-mais">+</span><span class="indicador-menos">−</span>
                  </span>
                </summary>
                <div class="mt-3 space-y-2">
                  <FieldInput
                    label="Nome do passeio opcional"
                    required
                    bind:value={passeio.nome}
                    placeholder="Ex.: Passeio e jantar no Bairro Gótico"
                  />
                  <FieldTextarea
                    label="Descrição"
                    bind:value={passeio.descricao}
                    rows={4}
                    placeholder="Descreva a experiência e as recomendações para o viajante."
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    on:click={() => {
                      cidade.passeios = cidade.passeios.filter((_, i) => i !== passeioIndex);
                    }}>Remover opcional</Button
                  >
                </div>
              </details>
            {/each}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            on:click={() => {
              cidade.passeios = [...cidade.passeios, { nome: '', descricao: '' }];
            }}>Adicionar passeio opcional</Button
          >
          <div class="mt-4">
            <h3 class="text-sm font-semibold">Não adicionados do catálogo</h3>
            {#if !String(cidade.cidade ?? '').trim()}
              <p class="mt-2 text-sm text-slate-500">
                Selecione uma cidade para consultar o catálogo.
              </p>
            {:else if catalogos[chaveCidadeCatalogo(cidade)]?.estado === 'erro'}
              <p role="alert" class="mt-2 text-sm text-red-700">
                {catalogos[chaveCidadeCatalogo(cidade)].erro} Use “Atualizar catálogo desta cidade” para
                tentar novamente.
              </p>
            {:else if catalogos[chaveCidadeCatalogo(cidade)]?.estado !== 'pronto'}
              <p class="mt-2 text-sm text-slate-500">Buscando opcionais do catálogo...</p>
            {:else if naoAdicionados(cidade).length === 0}
              <p class="mt-2 text-sm text-slate-500">Nenhum passeio disponível para adicionar.</p>
            {:else}
              <div class="mt-2 space-y-3">
                {#each naoAdicionados(cidade) as item (item.id)}
                  <details class="rounded-lg bg-slate-50 p-3">
                    <summary
                      class="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold"
                    >
                      <span>{item.nome}</span>
                      <span aria-hidden="true" class="text-lg"
                        ><span class="indicador-mais">+</span><span class="indicador-menos">−</span
                        ></span
                      >
                    </summary>
                    <div class="mt-3 space-y-2">
                      <p class="text-sm whitespace-pre-line text-slate-600">
                        {item.descricao || '(Sem descrição)'}
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        on:click={() => adicionar(cidade, item)}>Adicionar ao roteiro</Button
                      >
                    </div>
                  </details>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </details>
    {/each}
  </div>
  {#if opcionais.length > 0}
    <div class="mt-3">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        on:click={() => {
          opcionais = [...opcionais, { cidade: '', passeios: [] }];
        }}>Adicionar cidade</Button
      >
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
</style>
