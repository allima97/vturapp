<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldTextarea } from '$lib/components/ui';
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';
  import SeletorDestinoGeografico from '$lib/components/SeletorDestinoGeografico.svelte';
  import {
    MAX_TEXTO_IMPORTACAO_BYTES,
    parseImportacaoOpcionais,
    type CidadeImportada
  } from '$lib/importarOpcionais';
  import { apiPost } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';

  export let onImported: () => void;
  export let geografico = false;
  export let salvando = false;
  let texto = '';
  let cidadeUnica = '';
  let cidadeUnicaConfirmada: string | null = null;
  let cidadeUnicaId = '';
  let cidadeUnicaValida = false;
  let grupos: CidadeImportada[] = [];
  let erro = '';
  let resultado = '';
  let leitura = 0;

  function limparPrevia() {
    grupos = [];
    erro = '';
    resultado = '';
  }

  async function carregarArquivo(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const seq = ++leitura;
    limparPrevia();
    texto = '';
    try {
      if (!/\.(md|txt)$/i.test(file.name)) throw new Error('Selecione um arquivo .md ou .txt.');
      if (file.size > MAX_TEXTO_IMPORTACAO_BYTES)
        throw new Error('O arquivo deve ter no máximo 512 KB.');
      const buffer = await file.arrayBuffer();
      const conteudo = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      if (seq === leitura) texto = conteudo;
    } catch (err) {
      if (seq === leitura)
        erro =
          err instanceof TypeError
            ? 'O arquivo deve estar codificado em UTF-8.'
            : toUserMessage(err, 'Erro ao ler arquivo.');
    } finally {
      input.value = '';
    }
  }

  function analisar() {
    leitura++;
    limparPrevia();
    try {
      grupos = parseImportacaoOpcionais(texto, 'cidade');
    } catch (err) {
      erro = toUserMessage(err, 'Não foi possível analisar o texto.');
    }
  }

  async function importar() {
    const cidadeInvalida = geografico
      ? !cidadeUnica.trim() || !cidadeUnicaId || !cidadeUnicaValida
      : !cidadeUnicaConfirmada || cidadeUnicaConfirmada !== cidadeUnica;
    if (cidadeInvalida) {
      erro = 'Selecione e confirme a cidade na lista de sugestões antes de importar.';
      return;
    }
    const items = grupos.flatMap((grupo) =>
      grupo.passeios.map((passeio) => ({
        ...passeio,
        cidade: cidadeUnica,
        ...(geografico ? { cidade_id: cidadeUnicaId } : {})
      }))
    );
    salvando = true;
    erro = '';
    try {
      const resposta = await apiPost<{ importados: number; ignorados: number }>(
        '/api/v1/opcionais/importar',
        { items }
      );
      resultado = `${resposta.importados} passeio(s) importado(s); ${resposta.ignorados} duplicado(s) ignorado(s).`;
      grupos = [];
      cidadeUnica = '';
      cidadeUnicaConfirmada = null;
      cidadeUnicaId = '';
      cidadeUnicaValida = false;
      texto = '';
      onImported();
    } catch (err) {
      erro = toUserMessage(err, 'Erro ao importar passeios.');
    } finally {
      salvando = false;
    }
  }
</script>

<div>
  <p class="mb-3 text-sm text-slate-600">
    Cole o texto ou escolha um arquivo .md ou .txt em UTF-8. Nenhum passeio é salvo sem sua
    confirmação.
  </p>
  <div class="mb-4">
    {#if geografico}
      <SeletorDestinoGeografico
        fieldId="import-cidade-unica"
        label="Cidade para todos os passeios"
        bind:value={cidadeUnica}
        bind:destinoId={cidadeUnicaId}
        bind:valid={cidadeUnicaValida}
        disabled={salvando}
        required
      />
    {:else}
      <CidadeDestinoAutocomplete
        id="import-cidade-unica"
        label="Cidade para todos os passeios"
        bind:value={cidadeUnica}
        endpoint="/api/v1/opcionais/cidades"
        disabled={salvando}
        required
        onSelect={(cidade) => {
          cidadeUnicaConfirmada = cidade;
        }}
      />
    {/if}
  </div>
  <p class="mb-2 text-sm text-slate-500">
    Escreva o título de cada passeio em uma linha e a descrição na próxima linha com texto. Linhas
    em branco são ignoradas. Repita para os demais passeios e confira a prévia. Não inclua a cidade
    no texto.
  </p>
  <label for="arquivo-opcionais" class="mb-1 block text-sm font-medium">Arquivo (.md ou .txt)</label
  >
  <input
    id="arquivo-opcionais"
    type="file"
    accept=".md,.txt,text/plain,text/markdown"
    disabled={salvando}
    on:change={carregarArquivo}
    class="mb-3 block w-full text-sm"
  />
  <FieldTextarea
    id="texto-importar-opcionais"
    label="Texto para importar"
    bind:value={texto}
    rows={10}
    monospace
    disabled={salvando}
    on:input={() => {
      leitura++;
      limparPrevia();
    }}
    placeholder={'Nome do passeio\nDescrição do passeio\n\nOutro passeio\nDescrição do outro passeio'}
  />
  <div class="mt-3">
    <Button type="button" variant="secondary" disabled={salvando} on:click={analisar}
      >Analisar e conferir</Button
    >
  </div>
  {#if erro}<p role="alert" class="mt-3 text-sm text-red-700">{erro}</p>{/if}
  {#if resultado}<p role="status" class="mt-3 text-sm text-green-700">{resultado}</p>{/if}
  {#if grupos.length}
    <div class="mt-4 space-y-4">
      <p class="text-sm font-semibold">
        Confira os passeios e confirme a cidade selecionada acima.
      </p>
      {#each grupos as grupo}
        <div class="rounded-lg border border-slate-200 p-3">
          <ul class="mt-3 space-y-2">
            {#each grupo.passeios as passeio}
              <li>
                <strong class="text-sm">{passeio.nome}</strong>
                <p class="text-sm whitespace-pre-line text-slate-600">
                  {passeio.descricao || '(Sem descrição)'}
                </p>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
      <p class="text-sm text-slate-500">
        Passeios com o mesmo nome na mesma cidade serão ignorados, inclusive duplicados no próprio
        arquivo.
      </p>
      <Button type="button" disabled={salvando} on:click={importar}
        >{salvando ? 'Salvando...' : 'Salvar passeios'}</Button
      >
    </div>
  {/if}
</div>
