<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
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
  let modo: 'cidade' | 'arquivo' = 'cidade';
  let texto = '';
  let grupos: CidadeImportada[] = [];
  let cidades: string[] = [];
  let cidadesConfirmadas: (string | null)[] = [];
  let cidadesIds: string[] = [];
  let cidadesValidas: boolean[] = [];
  let erro = '';
  let resultado = '';
  let salvando = false;
  let leitura = 0;

  function limparPrevia() {
    grupos = [];
    cidades = [];
    cidadesConfirmadas = [];
    cidadesIds = [];
    cidadesValidas = [];
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
      grupos = parseImportacaoOpcionais(texto, modo);
      cidades = grupos.map(() => '');
      cidadesConfirmadas = grupos.map(() => null);
      cidadesIds = grupos.map(() => '');
      cidadesValidas = grupos.map(() => false);
    } catch (err) {
      erro = toUserMessage(err, 'Não foi possível analisar o texto.');
    }
  }

  async function importar() {
    if (
      geografico
        ? cidadesIds.some((id, index) => !id || !cidadesValidas[index])
        : cidadesConfirmadas.some((cidade, index) => !cidade || cidade !== cidades[index])
    ) {
      erro = 'Selecione e confirme cada cidade na lista de sugestões antes de importar.';
      return;
    }
    const items = grupos.flatMap((grupo, index) =>
      grupo.passeios.map((passeio) =>
        geografico
          ? { ...passeio, cidade: cidades[index], cidade_id: cidadesIds[index] }
          : { ...passeio, cidade: cidadesConfirmadas[index] || '' }
      )
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
      cidades = [];
      cidadesConfirmadas = [];
      cidadesIds = [];
      cidadesValidas = [];
      texto = '';
      onImported();
    } catch (err) {
      erro = toUserMessage(err, 'Erro ao importar passeios.');
    } finally {
      salvando = false;
    }
  }
</script>

<Card title="Importar passeios opcionais">
  <p class="mb-3 text-sm text-slate-600">
    Cole o texto ou escolha um arquivo .md ou .txt em UTF-8. Nenhum passeio é salvo sem sua
    confirmação.
  </p>
  <fieldset class="mb-3 space-y-2">
    <legend class="text-sm font-semibold">Como identificar as cidades?</legend>
    <label class="flex gap-2 text-sm"
      ><input
        type="radio"
        name="modo-importacao"
        value="cidade"
        bind:group={modo}
        disabled={salvando}
        on:change={limparPrevia}
      /> Selecionar uma cidade para todos os passeios</label
    >
    <label class="flex gap-2 text-sm"
      ><input
        type="radio"
        name="modo-importacao"
        value="arquivo"
        bind:group={modo}
        disabled={salvando}
        on:change={limparPrevia}
      /> Identificar e confirmar cada cidade do texto</label
    >
  </fieldset>
  <p class="mb-2 text-sm text-slate-500">
    Use <code>#### Nome do passeio</code> e, na linha seguinte, <code>##### Descrição</code>. No
    modo de várias cidades, inicie cada grupo com <code>## Cidade, região, país</code>.
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
    placeholder={'#### Nome do passeio\n##### Descrição do passeio'}
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
        Confira os passeios e selecione cada cidade na lista de sugestões.
      </p>
      {#each grupos as grupo, index}
        <div class="rounded-lg border border-slate-200 p-3">
          {#if grupo.cidadeOriginal}<p class="mb-2 text-sm">
              Cidade indicada no texto: <strong>{grupo.cidadeOriginal}</strong>
            </p>{/if}
          {#if geografico}
            <SeletorDestinoGeografico
              fieldId={`import-cidade-${index}`}
              label="Cidade confirmada no sistema"
              bind:value={cidades[index]}
              bind:destinoId={cidadesIds[index]}
              bind:valid={cidadesValidas[index]}
              disabled={salvando}
              required
            />
          {:else}
            <CidadeDestinoAutocomplete
              id={`import-cidade-${index}`}
              label="Cidade confirmada no sistema"
              bind:value={cidades[index]}
              endpoint="/api/v1/opcionais/cidades"
              disabled={salvando}
              onSelect={(cidade) => {
                cidadesConfirmadas[index] = cidade;
              }}
            />
          {/if}
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
        >{salvando ? 'Importando...' : 'Confirmar importação'}</Button
      >
    </div>
  {/if}
</Card>
