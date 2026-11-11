<script lang="ts">
  import { destinoIdValido } from '$lib/destinoIdentidade';
  import { aplicarDescricao, destacarBusca, teclaLista } from '$lib/descricoesDia';

  let {
    descricao = $bindable(''),
    cidadeId = null,
    fieldId
  }: {
    descricao: string;
    cidadeId?: string | null;
    fieldId: string;
  } = $props();

  type Item = { texto: string; usos: number };

  let aberto = $state(false);
  let total = $state(0);
  let filtrados = $state(0);
  let pagina = $state(1);
  let paginas = $state(1);
  let consulta = $state('');
  let indice = $state(0);
  let itens = $state<Item[]>([]);
  let pendente = $state<string | null>(null);
  let erro = $state<string | null>(null);
  let buscaId = $derived(`${fieldId}-busca`);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function carregar(id: string, paginaPedida: number, termo: string) {
    const params = new URLSearchParams({
      cidade_id: id,
      pagina: String(paginaPedida),
      limite: '8'
    });
    if (termo.trim()) params.set('q', termo.trim());
    const response = await fetch(`/api/v1/roteiros/descricoes-dia?${params}`);
    if (!response.ok) {
      erro = 'Não foi possível carregar as descrições salvas.';
      return;
    }
    const data = (await response.json()) as {
      total?: number;
      filtrados?: number;
      pagina?: number;
      paginas?: number;
      itens?: Item[];
    };
    total = data.total ?? 0;
    filtrados = data.filtrados ?? 0;
    pagina = data.pagina ?? 1;
    paginas = data.paginas ?? 1;
    itens = data.itens ?? [];
    indice = 0;
    erro = null;
  }

  $effect(() => {
    const id = cidadeId;
    aberto = false;
    pendente = null;
    consulta = '';
    if (!destinoIdValido(id)) {
      total = 0;
      itens = [];
      return;
    }
    void carregar(id, 1, '');
  });

  function agendarBusca(termo: string) {
    consulta = termo;
    if (timer) clearTimeout(timer);
    const id = cidadeId;
    if (!destinoIdValido(id)) return;
    timer = setTimeout(() => void carregar(id, 1, termo), 200);
  }

  function escolher(texto: string) {
    if (descricao.trim()) {
      pendente = texto;
      return;
    }
    descricao = aplicarDescricao(descricao, texto, 'substituir');
    aberto = false;
  }

  function confirmar(modo: 'substituir' | 'acrescentar') {
    if (!pendente) return;
    descricao = aplicarDescricao(descricao, pendente, modo);
    pendente = null;
    aberto = false;
  }

  function teclado(event: KeyboardEvent) {
    if (event.target instanceof HTMLButtonElement && event.key === 'Enter') return;
    const acao = teclaLista(event.key, indice, itens.length);
    if (!acao) return;
    event.preventDefault();
    if (acao.tipo === 'fechar') {
      aberto = false;
      pendente = null;
      return;
    }
    if (acao.tipo === 'mover') {
      indice = acao.indice;
      return;
    }
    const item = itens[indice];
    if (item) escolher(item.texto);
  }
</script>

{#if total > 0}
  <div class="relative mt-1">
    <button
      type="button"
      class="text-xs text-slate-500 underline-offset-2 hover:underline"
      aria-expanded={aberto}
      onclick={() => {
        aberto = !aberto;
        pendente = null;
      }}
    >
      Descrições salvas ({total})
    </button>
    {#if aberto}
      <div
        class="absolute z-20 mt-1 w-full min-w-64 rounded-md border border-slate-200 bg-white p-2 shadow-md"
        onkeydown={teclado}
      >
        <label class="sr-only" for={buscaId}>Buscar nas descrições salvas</label>
        <input
          id={buscaId}
          class="w-full rounded border border-slate-200 px-2 py-1 text-sm"
          placeholder="Buscar por palavra"
          value={consulta}
          oninput={(event) => agendarBusca(event.currentTarget.value)}
        />
        {#if erro}
          <p class="mt-2 text-xs text-red-600" role="alert">{erro}</p>
        {:else if itens.length === 0}
          <p class="mt-2 text-xs text-slate-500">Nenhuma descrição encontrada.</p>
        {:else}
          <ul class="mt-2 max-h-52 space-y-1 overflow-auto">
            {#each itens as item, itemIndex (item.texto)}
              <li>
                <button
                  type="button"
                  class={`w-full rounded px-2 py-1 text-left text-sm ${itemIndex === indice ? 'bg-slate-100' : ''}`}
                  onmouseenter={() => (indice = itemIndex)}
                  onclick={() => escolher(item.texto)}
                >
                  <span class="line-clamp-3">{@html destacarBusca(item.texto, consulta)}</span>
                  <span class="mt-0.5 block text-xs text-slate-500">
                    {item.usos === 1 ? 'usada 1 vez' : `usada ${item.usos} vezes`}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if paginas > 1}
          <div class="mt-2 flex items-center justify-between text-xs">
            <button
              type="button"
              class="disabled:opacity-40"
              disabled={pagina <= 1}
              onclick={() => cidadeId && carregar(cidadeId, pagina - 1, consulta)}
            >
              Anteriores
            </button>
            <span>{pagina} de {paginas}</span>
            <button
              type="button"
              class="disabled:opacity-40"
              disabled={pagina >= paginas}
              onclick={() => cidadeId && carregar(cidadeId, pagina + 1, consulta)}
            >
              Próximas
            </button>
          </div>
        {/if}
        {#if pendente}
          <div class="mt-2 rounded border border-slate-200 p-2 text-xs">
            <p>O campo já tem texto. O que fazer com a descrição salva?</p>
            <div class="mt-2 flex gap-2">
              <button type="button" class="underline" onclick={() => confirmar('substituir')}>
                Substituir
              </button>
              <button type="button" class="underline" onclick={() => confirmar('acrescentar')}>
                Acrescentar
              </button>
            </div>
          </div>
        {/if}
        {#if filtrados > itens.length}
          <p class="sr-only">{filtrados} descrições encontradas</p>
        {/if}
      </div>
    {/if}
  </div>
{/if}
