<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import type { EstadoCidadeGeografica } from '$lib/features/vendas/cidadeGeograficaEstado';
  import { apiFetch } from '$lib/services/api';
  import AtribuicaoGeoNames from '$lib/components/AtribuicaoGeoNames.svelte';

  type Cidade = {
    id: string;
    nome?: string | null;
    label?: string | null;
    estado?: string | null;
    uf?: string | null;
    sigla?: string | null;
    pais_nome?: string | null;
    subdivisao_nome?: string | null;
    subdivisao?: { nome?: string | null; sigla?: string | null } | null;
  };
  type Destino = {
    id: string;
    nome: string;
    label: string;
    cidade_interna_id: string | null;
  };
  type Resultado = {
    items: Destino[];
    podeHaverMais: boolean;
    cidades_legadas: Cidade[];
    legadas_pode_haver_mais: boolean;
  };

  export let id: string;
  export let label = 'Cidade';
  export let value = '';
  export let cities: Cidade[] = [];
  export let required = false;
  export let disabled = false;
  export let error = '';
  export let estado: EstadoCidadeGeografica;
  export let urlBusca = '/api/v1/vendas/cidades-geograficas';
  export let urlConsulta = '/api/v1/vendas/cidades-busca';

  const dispatch = createEventDispatcher<{ loaded: Cidade[]; select: Cidade }>();
  let input: HTMLInputElement;
  let container: HTMLDivElement;
  let texto = '';
  let aberto = false;
  let carregando = false;
  let vinculando = false;
  let erroBusca = '';
  let resultados: Resultado | null = null;
  let exata = false;
  let pais = '';
  let offsetGeo = 0;
  let offsetLegadas = 0;
  let sequencia = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function cidadeLabel(cidade: Cidade) {
    if (cidade.label) return cidade.label;
    const nome = cidade.nome || '';
    const estado =
      cidade.estado ||
      cidade.uf ||
      cidade.sigla ||
      cidade.subdivisao_nome ||
      cidade.subdivisao?.sigla ||
      cidade.subdivisao?.nome;
    return estado ? `${nome} (${estado})` : nome;
  }

  function atualizarPendencia() {
    const pendente = vinculando || (Boolean(texto.trim()) && !value);
    estado.texto = texto;
    estado.pendente = pendente;
    if (input)
      input.setCustomValidity(pendente ? 'Selecione uma cidade da lista ou limpe o campo.' : '');
  }

  function alterarTexto(event: Event) {
    texto = (event.currentTarget as HTMLInputElement).value;
    value = '';
    vinculando = false;
    sequencia++;
    if (timer) clearTimeout(timer);
    resultados = null;
    erroBusca = '';
    aberto = true;
    exata = false;
    offsetGeo = 0;
    offsetLegadas = 0;
    atualizarPendencia();
    dispatch('select', { id: '' });
    timer = setTimeout(() => void buscar(), 300);
  }

  async function buscar(exato = false, geo = 0, legadas = 0) {
    if (vinculando) return;
    if (timer) clearTimeout(timer);
    const query = texto.trim();
    const atual = ++sequencia;
    if (!query || (!exato && Array.from(query).length < 2)) {
      resultados = null;
      carregando = false;
      return;
    }
    if (exato && pais.trim() && !/^[a-z]{2}$/i.test(pais.trim())) {
      erroBusca = 'Informe um código de país com duas letras, como BR ou IT.';
      carregando = false;
      return;
    }
    carregando = true;
    erroBusca = '';
    try {
      const resultado = await apiFetch<Resultado>(urlBusca, {
        query: {
          q: query,
          exata: exato ? 1 : 0,
          pais: exato ? pais.trim() : '',
          offset_geografico: exato ? geo : 0,
          offset_legadas: legadas
        },
        noCache: true
      });
      if (atual !== sequencia) return;
      resultados = resultado;
      exata = exato;
      offsetGeo = geo;
      offsetLegadas = legadas;
    } catch {
      if (atual !== sequencia) return;
      resultados = null;
      erroBusca = 'Não foi possível buscar cidades. Tente novamente.';
    } finally {
      if (atual === sequencia) carregando = false;
    }
  }

  function confirmar(cidade: Cidade) {
    value = cidade.id;
    texto = cidadeLabel(cidade);
    vinculando = false;
    aberto = false;
    resultados = null;
    erroBusca = '';
    dispatch('loaded', [cidade]);
    dispatch('select', cidade);
    atualizarPendencia();
  }

  async function selecionar(destino: Destino) {
    const atual = ++sequencia;
    if (timer) clearTimeout(timer);
    carregando = false;
    texto = destino.label;
    value = '';
    vinculando = true;
    erroBusca = '';
    atualizarPendencia();
    try {
      let cidadeId = destino.cidade_interna_id;
      if (!cidadeId) {
        const resposta = await apiFetch<{
          item: { id: string; destino_geografico_id: string };
        }>('/api/v1/destinos-geograficos/referencia', {
          method: 'POST',
          body: { id: destino.id }
        });
        if (atual !== sequencia) return;
        if (!resposta.item?.id || resposta.item.destino_geografico_id !== destino.id)
          throw new Error('Resposta de vínculo inválida.');
        cidadeId = resposta.item.id;
      }
      if (atual !== sequencia) return;
      confirmar({ id: cidadeId, nome: destino.nome, label: destino.label });
    } catch {
      if (atual !== sequencia) return;
      vinculando = false;
      erroBusca = 'Não foi possível vincular esta cidade. Selecione novamente.';
      atualizarPendencia();
    }
  }

  function selecionarLegada(cidade: Cidade) {
    sequencia++;
    if (timer) clearTimeout(timer);
    carregando = false;
    confirmar(cidade);
  }

  onMount(async () => {
    if (estado.pendente && !value) {
      texto = estado.texto;
      aberto = true;
      atualizarPendencia();
      void buscar();
      return;
    }
    const inicial = value;
    if (!inicial) {
      atualizarPendencia();
      return;
    }
    const local = cities.find((cidade) => cidade.id === inicial);
    if (local) {
      texto = cidadeLabel(local);
      atualizarPendencia();
      return;
    }
    const atual = ++sequencia;
    vinculando = true;
    atualizarPendencia();
    try {
      const cidade = await apiFetch<Cidade>(urlConsulta, {
        query: { id: inicial },
        noCache: true
      });
      if (atual !== sequencia || value !== inicial) return;
      if (cidade.id !== inicial) throw new Error('Cidade inválida.');
      texto = cidadeLabel(cidade);
      dispatch('loaded', [cidade]);
      vinculando = false;
      atualizarPendencia();
    } catch {
      if (atual !== sequencia || value !== inicial) return;
      vinculando = false;
      value = '';
      texto = inicial;
      erroBusca = 'Não foi possível carregar a cidade salva. Selecione-a novamente.';
      aberto = true;
      atualizarPendencia();
    }
  });

  onDestroy(() => {
    sequencia++;
    if (timer) clearTimeout(timer);
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
  <label for={id} class="mb-1 block text-sm font-medium text-slate-700">
    {label}{required ? ' *' : ''}
  </label>
  <input
    {id}
    bind:this={input}
    value={texto}
    {required}
    {disabled}
    on:input={alterarTexto}
    on:focus={() => (aberto = true)}
    autocomplete="off"
    aria-expanded={aberto}
    aria-invalid={Boolean(error || erroBusca || (texto.trim() && !value))}
    placeholder="Digite e selecione a cidade"
    class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
  />
  <AtribuicaoGeoNames />
  {#if error}<p class="mt-1 text-xs text-red-600" role="alert">{error}</p>{/if}
  {#if vinculando}<p class="mt-1 text-xs text-slate-500">Validando cidade...</p>{/if}
  {#if erroBusca}<p class="mt-1 text-xs text-red-600" role="alert">{erroBusca}</p>{/if}
  {#if aberto && texto.trim()}
    <div
      class="absolute z-50 mt-1 max-h-80 w-full overflow-auto rounded-lg border bg-white shadow-lg"
    >
      {#if carregando}
        <p class="px-3 py-2 text-sm text-slate-500">Buscando cidades...</p>
      {:else if resultados}
        {#if resultados.items.length}
          <p class="px-3 py-2 text-xs font-semibold">Destinos geográficos</p>
          {#each resultados.items as destino (destino.id)}
            <button
              type="button"
              class="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              on:click={() => void selecionar(destino)}>{destino.label}</button
            >
          {/each}
        {/if}
        {#if resultados.cidades_legadas.length}
          <p class="px-3 py-2 text-xs font-semibold">Cidades já cadastradas</p>
          {#each resultados.cidades_legadas as cidade (cidade.id)}
            <button
              type="button"
              class="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              on:click={() => selecionarLegada(cidade)}>{cidadeLabel(cidade)}</button
            >
          {/each}
        {/if}
        {#if !resultados.items.length && !resultados.cidades_legadas.length}
          <p class="px-3 py-2 text-sm">Nenhuma cidade encontrada.</p>
        {/if}
        {#if resultados.podeHaverMais && !exata}
          <p class="px-3 py-2 text-xs">Há mais destinos. Refine a busca ou use o nome exato.</p>
        {/if}
        {#if exata && offsetGeo > 0}
          <button
            type="button"
            disabled={vinculando}
            class="px-3 py-2 text-xs"
            on:click={() => void buscar(true, Math.max(0, offsetGeo - 8), offsetLegadas)}
            >Destinos anteriores</button
          >
        {/if}
        {#if exata && resultados.podeHaverMais}
          <button
            type="button"
            disabled={vinculando}
            class="px-3 py-2 text-xs"
            on:click={() => void buscar(true, offsetGeo + 8, offsetLegadas)}
            >Próximos destinos</button
          >
        {/if}
        {#if offsetLegadas > 0}
          <button
            type="button"
            disabled={vinculando}
            class="px-3 py-2 text-xs"
            on:click={() => void buscar(exata, offsetGeo, Math.max(0, offsetLegadas - 8))}
            >Cidades anteriores</button
          >
        {/if}
        {#if resultados.legadas_pode_haver_mais}
          <button
            type="button"
            disabled={vinculando}
            class="px-3 py-2 text-xs"
            on:click={() => void buscar(exata, offsetGeo, offsetLegadas + 8)}
            >Próximas cidades</button
          >
        {/if}
      {/if}
      <div class="flex items-center gap-2 border-t p-2">
        <label for={`${id}-pais`} class="text-xs">País</label>
        <input
          id={`${id}-pais`}
          bind:value={pais}
          maxlength="2"
          placeholder="BR"
          class="w-14 rounded border px-1 text-sm"
        />
        <button
          type="button"
          disabled={vinculando}
          class="text-xs underline"
          on:click={() => void buscar(true)}>Buscar nome exato</button
        >
      </div>
    </div>
  {/if}
</div>
