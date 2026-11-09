<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { apiFetch } from '$lib/services/api';
  import AtribuicaoGeoNames from '$lib/components/AtribuicaoGeoNames.svelte';

  type Destino = {
    id: string;
    nome: string;
    label: string;
    origem: 'geonames' | 'personalizado';
    referencia?: { regiao: string | null };
  };
  type Resultado = { items: Destino[]; podeHaverMais: boolean };

  export let fieldId: string;
  export let destinoId: string | null | undefined = '';
  export let value = '';
  export let label = 'Cidade de destino';
  export let required = false;
  export let disabled = false;
  export let idioma = '';
  export let valid = false;

  const dispatch = createEventDispatcher<{ select: Destino; edit: void }>();
  let input: HTMLInputElement;
  let container: HTMLDivElement;
  let itens: Destino[] = [];
  let aberto = false;
  let carregando = false;
  let erro = '';
  let mais = false;
  let exata = false;
  let pais = '';
  let offset = 0;
  let sequencia = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolvendo = Boolean(destinoId);
  let validacaoFalhou = false;

  $: invalido = validacaoFalhou || (Boolean(value.trim()) && !destinoId);
  $: valid = !resolvendo && !invalido && (!required || Boolean(value.trim() && destinoId));
  $: if (input) {
    input.setCustomValidity(
      resolvendo
        ? 'Aguarde a validação do destino.'
        : required && !value.trim()
          ? 'Selecione um destino.'
          : invalido
            ? 'Selecione um destino na lista.'
            : ''
    );
  }

  function locale() {
    return idioma || (typeof navigator !== 'undefined' ? navigator.language : '') || 'pt';
  }

  async function buscar(query: string, buscaExata = false, proximo = 0) {
    const atual = ++sequencia;
    if ((!buscaExata && Array.from(query.trim()).length < 2) || !query.trim()) {
      itens = [];
      carregando = false;
      mais = false;
      return;
    }
    carregando = true;
    erro = '';
    try {
      const resultado = await apiFetch<Resultado>(
        `/api/v1/destinos-geograficos/${buscaExata ? 'exata' : 'busca'}`,
        {
          query: {
            q: query.trim(),
            idioma: locale(),
            ...(buscaExata ? { pais: pais.trim(), offset: proximo } : { limite: 8 })
          },
          noCache: true
        }
      );
      if (atual !== sequencia) return;
      itens = resultado.items;
      mais = resultado.podeHaverMais;
      exata = buscaExata;
      offset = proximo;
    } catch {
      if (atual === sequencia) {
        itens = [];
        mais = false;
        erro = 'Não foi possível buscar destinos. Tente novamente.';
      }
    } finally {
      if (atual === sequencia) carregando = false;
    }
  }

  function digitar(event: Event) {
    value = (event.currentTarget as HTMLInputElement).value;
    destinoId = '';
    resolvendo = false;
    validacaoFalhou = false;
    aberto = true;
    exata = false;
    erro = '';
    itens = [];
    mais = false;
    sequencia++;
    dispatch('edit');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void buscar(value), 300);
  }

  function selecionar(destino: Destino) {
    sequencia++;
    if (timer) clearTimeout(timer);
    value = destino.label;
    destinoId = destino.id;
    resolvendo = false;
    validacaoFalhou = false;
    carregando = false;
    aberto = false;
    itens = [];
    erro = '';
    dispatch('select', destino);
  }

  function pesquisarExato(proximo = 0) {
    if (timer) clearTimeout(timer);
    if (pais.trim() && !/^[a-z]{2}$/i.test(pais.trim())) {
      erro = 'Informe um código de país com duas letras, como BR ou IT.';
      return;
    }
    void buscar(value, true, proximo);
  }

  onMount(() => {
    if (!destinoId) return;
    const idInicial = destinoId;
    const atual = ++sequencia;
    resolvendo = true;
    apiFetch<{ item: Destino }>('/api/v1/destinos-geograficos/detalhes', {
      query: { id: idInicial, idioma: locale() },
      noCache: true
    })
      .then(({ item }) => {
        if (atual !== sequencia || destinoId !== idInicial) return;
        if (!item || item.id !== idInicial || !item.label)
          throw new Error('Resposta de destino inválida.');
        value = item.label;
      })
      .catch(() => {
        if (atual !== sequencia || destinoId !== idInicial) return;
        validacaoFalhou = true;
        erro = 'Não foi possível validar o destino salvo. Selecione-o novamente.';
        aberto = true;
      })
      .finally(() => {
        if (atual === sequencia) resolvendo = false;
      });
  });

  onDestroy(() => {
    if (timer) clearTimeout(timer);
    sequencia++;
  });
</script>

<div
  bind:this={container}
  class="relative"
  on:focusout={(event) => {
    if (!(event.relatedTarget instanceof Node) || !container.contains(event.relatedTarget))
      aberto = false;
  }}
>
  <label for={fieldId} class="mb-1 block text-sm font-medium text-slate-700">
    {label}{required ? ' *' : ''}
  </label>
  <input
    id={fieldId}
    bind:this={input}
    bind:value
    on:input={digitar}
    on:focus={() => (aberto = true)}
    {required}
    {disabled}
    autocomplete="off"
    aria-invalid={invalido ? 'true' : undefined}
    aria-expanded={aberto}
    placeholder="Digite e selecione o destino"
    class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-100"
  />
  <AtribuicaoGeoNames />
  {#if invalido}
    <p class="mt-1 text-xs text-red-600" role="alert">Selecione um destino na lista.</p>
  {/if}
  {#if aberto && (value.trim() || erro)}
    <div
      class="absolute z-50 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
    >
      {#if carregando}
        <p class="px-3 py-2 text-sm text-slate-500">Buscando destinos...</p>
      {:else if erro}
        <p class="px-3 py-2 text-sm text-red-600" role="alert">{erro}</p>
      {:else if itens.length}
        <ul>
          {#each itens as destino (destino.id)}
            <li>
              <button
                type="button"
                class="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                on:click={() => selecionar(destino)}>{destino.label}</button
              >
            </li>
          {/each}
        </ul>
      {:else if value.trim().length >= 2}
        <p class="px-3 py-2 text-sm text-slate-500">Nenhum destino encontrado.</p>
      {/if}
      {#if mais && !exata}
        <p class="px-3 py-2 text-xs text-slate-600">
          Há mais resultados. Digite mais letras ou use a busca exata.
        </p>
      {/if}
      {#if value.trim()}
        <div class="border-t border-slate-200 px-3 py-2">
          <label for={`${fieldId}-pais`} class="text-xs text-slate-600"
            >País na busca exata (código, opcional)</label
          >
          <div class="mt-1 flex gap-2">
            <input
              id={`${fieldId}-pais`}
              bind:value={pais}
              maxlength="2"
              placeholder="BR"
              class="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <button
              type="button"
              class="text-sm text-indigo-700 underline"
              on:click={() => pesquisarExato()}>Buscar nome exato no GeoNames</button
            >
          </div>
          {#if exata && offset > 0}
            <button
              type="button"
              class="mt-2 mr-3 text-sm text-indigo-700 underline"
              on:click={() => pesquisarExato(Math.max(0, offset - 8))}>Anterior</button
            >
          {/if}
          {#if exata && mais}
            <button
              type="button"
              class="mt-2 text-sm text-indigo-700 underline"
              on:click={() => pesquisarExato(offset + 8)}>Próximos resultados</button
            >
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
