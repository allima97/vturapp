<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import FieldInput from '$lib/components/ui/form/FieldInput.svelte';
  import FieldSelect from '$lib/components/ui/form/FieldSelect.svelte';
  import FieldDatalistInput from '$lib/components/ui/form/FieldDatalistInput.svelte';
  import FieldTextarea from '$lib/components/ui/form/FieldTextarea.svelte';
  import { toast } from '$lib/stores/ui';
  import { confirmAction } from '$lib/stores/confirm';
  import { apiFetch, ApiError } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';
  import { nomePassageiroMaiusculo } from '$lib/passagens/nome';
  import { resumoRotas, type TrechoRota } from '$lib/passagens/rotas';
  import {
    loadAirportCodeCityLookup,
    type AirportCodeCityLookup
  } from '$lib/airportCodeCityLookup';
  import {
    importarTextoPassagem,
    type PassagemImportada,
    type TrechoPassagem,
    type PassageiroPassagem
  } from '$lib/passagens/importacao';

  type ListaItem = {
    id: string;
    localizador: string;
    updated_at: string;
    primeiroPassageiro: string;
    quantidadePassageiros: number;
    dataVoo: string;
    rota: TrechoRota[];
  };
  type PassagemSalva = PassagemImportada & { id: string };
  const vazio = (): PassagemImportada => ({
    localizador: '',
    emissao: '',
    trechos: [],
    passageiros: []
  });
  const trechoVazio = (): TrechoPassagem => ({
    companhia: '',
    voo: '',
    origem: '',
    destino: '',
    cidadeOrigem: '',
    cidadeDestino: '',
    saida: '',
    chegada: '',
    status: '',
    duracao: '',
    classe: '',
    tarifa: ''
  });
  const passageiroVazio = (): PassageiroPassagem => ({
    nome: '',
    tipo: '',
    bilhete: '',
    status: '',
    assentos: form.trechos.map(() => '')
  });

  let items: ListaItem[] = [];
  let pagina = 1;
  let hasMore = false;
  let form = vazio();
  let id = '';
  let texto = '';
  let avisos: string[] = [];
  let arquivo: File | null = null;
  let processandoArquivo = false;
  let progressoArquivo = '';
  let erroArquivo = '';
  let textoDeArquivo = false;
  let revisaoArquivoPendente = false;
  let revisaoConfirmada = false;
  let editando = false;
  let modoEdicao = false;
  let montado = false;
  let pedidoAbertura = 0;
  let loading = true;
  let saving = false;
  let error = '';
  let erroAbertura = '';
  let cidades: AirportCodeCityLookup = {};
  let cidadesIndisponiveis = false;
  const classes = ['Econômica', 'Econômica Premium', 'Executiva', 'Primeira Classe'];
  const tarifas = ['Light', 'Standard', 'FULL', 'Classic'];

  async function carregar() {
    loading = true;
    error = '';
    try {
      const result = await apiFetch<{ items: ListaItem[]; hasMore: boolean }>('/api/v1/passagens', {
        query: { pagina },
        noCache: true,
        redirectOnForbidden: false
      });
      items = result.items;
      hasMore = result.hasMore;
    } catch (err) {
      error =
        err instanceof ApiError && err.status === 403
          ? 'Sem acesso a passagens. Verifique sua permissão e, se aplicável, o vínculo com uma empresa.'
          : toUserMessage(err, 'Não foi possível carregar passagens.');
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    void carregar();
    montado = true;
    void loadAirportCodeCityLookup().then((lookup) => {
      cidades = lookup;
      cidadesIndisponiveis = Object.keys(lookup).length === 0;
    });
  });

  $: if (montado) sincronizarPagina($page.url);

  function sincronizarPagina(url: URL) {
    const pedido = ++pedidoAbertura;
    editando = false;
    modoEdicao = false;
    id = '';
    form = vazio();
    texto = '';
    avisos = [];
    arquivo = null;
    textoDeArquivo = false;
    revisaoArquivoPendente = false;
    revisaoConfirmada = false;
    erroArquivo = '';
    progressoArquivo = '';
    erroAbertura = '';
    const editarId = url.searchParams.get('editar');
    if (editarId) void abrir(editarId, pedido);
    else if (url.searchParams.get('nova') === '1') novo();
  }

  function cidadeSugerida(codigo: string) {
    return cidades[codigo.trim().toUpperCase()] || '';
  }

  function resumoLista(item: ListaItem) {
    const nome = item.primeiroPassageiro
      ? nomePassageiroMaiusculo(item.primeiroPassageiro)
      : 'Passageiro não informado';
    const quantidade = String(item.quantidadePassageiros ?? 0).padStart(2, '0');
    const data = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(item.dataVoo || '');
    const civil = data
      ? new Date(Date.UTC(Number(data[1]), Number(data[2]) - 1, Number(data[3])))
      : null;
    const dataFormatada =
      data &&
      civil &&
      civil.getUTCFullYear() === Number(data[1]) &&
      civil.getUTCMonth() === Number(data[2]) - 1 &&
      civil.getUTCDate() === Number(data[3])
        ? `${data[3]}/${data[2]}/${data[1]}`
        : 'Data não informada';
    const rota = resumoRotas(
      item.rota || [],
      (codigo, informada) =>
        informada?.trim() || cidadeSugerida(codigo) || codigo || 'Não informado'
    );
    return `${nome} x ${quantidade} → ${dataFormatada} → ${rota || 'Rota não informada'}`;
  }

  function formatarAeroporto(event: Event, trecho: TrechoPassagem, campo: 'origem' | 'destino') {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const inicio = input.selectionStart;
    const fim = input.selectionEnd;
    input.value = input.value.toUpperCase();
    trecho[campo] = input.value;
    if (inicio !== null && fim !== null) input.setSelectionRange(inicio, fim);
  }

  function formatarNomePassageiro(event: Event, passageiro: PassageiroPassagem) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const valor = input.value;
    const inicio = input.selectionStart;
    const fim = input.selectionEnd;
    const formatado = nomePassageiroMaiusculo(valor);
    input.value = formatado;
    passageiro.nome = formatado;
    if (inicio !== null && fim !== null) {
      input.setSelectionRange(
        nomePassageiroMaiusculo(valor.slice(0, inicio)).length,
        nomePassageiroMaiusculo(valor.slice(0, fim)).length
      );
    }
  }

  function formatarDuracao(event: Event, trecho: TrechoPassagem) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const valor = input.value.replace(/[^\d:]/g, '');
    const partes = valor.split(':');
    const formatado =
      partes.length > 1
        ? `${partes[0].slice(0, 2)}:${partes.slice(1).join('').slice(0, 2)}`
        : valor.length > 2
          ? `${valor.slice(0, 2)}:${valor.slice(2, 4)}`
          : valor;
    input.value = formatado;
    trecho.duracao = formatado;
  }

  function novo() {
    id = '';
    form = vazio();
    texto = '';
    avisos = [];
    arquivo = null;
    textoDeArquivo = false;
    revisaoArquivoPendente = false;
    revisaoConfirmada = false;
    erroArquivo = '';
    progressoArquivo = '';
    editando = true;
    modoEdicao = true;
  }
  function iniciarNovaPassagem() {
    if ($page.url.searchParams.get('nova') === '1' && !$page.url.searchParams.has('editar')) {
      pedidoAbertura++;
      novo();
    } else {
      void goto('/operacao/passagens?nova=1');
    }
  }
  async function analisar() {
    if (!texto.trim()) {
      toast.error('Cole o texto da reserva para analisar.');
      return;
    }
    if (
      (form.localizador || form.trechos.length || form.passageiros.length) &&
      !(await confirmAction('A análise substituirá os dados em revisão. Deseja continuar?'))
    )
      return;
    const resultado = importarTextoPassagem(texto);
    form = {
      ...resultado.dados,
      passageiros: resultado.dados.passageiros.map((passageiro) => ({
        ...passageiro,
        nome: nomePassageiroMaiusculo(passageiro.nome),
        assentos: resultado.dados.trechos.map((_, indice) => passageiro.assentos[indice] || '')
      }))
    };
    avisos = resultado.avisos;
    if (textoDeArquivo) {
      avisos = [
        'O reconhecimento pode omitir ou alterar dados. Compare todos os trechos, passageiros, datas e assentos com o arquivo original antes de confirmar.',
        `Foram reconhecidos ${resultado.dados.trechos.length} trecho(s) e ${resultado.dados.passageiros.length} passageiro(s). Confira se não faltou nenhum.`,
        ...avisos
      ];
    }
    revisaoArquivoPendente = textoDeArquivo;
    revisaoConfirmada = false;
  }
  async function lerArquivo() {
    if (!arquivo) {
      erroArquivo = 'Selecione um PDF ou uma imagem para importar.';
      return;
    }
    if (
      texto.trim() &&
      !(await confirmAction('A extração substituirá o texto atual. Deseja continuar?'))
    )
      return;
    const pedido = pedidoAbertura;
    processandoArquivo = true;
    erroArquivo = '';
    try {
      const { extrairTextoArquivo } = await import('$lib/passagens/arquivo');
      const extraido = await extrairTextoArquivo(arquivo, (mensagem) => {
        if (pedido === pedidoAbertura) progressoArquivo = mensagem;
      });
      if (pedido !== pedidoAbertura) return;
      if (!extraido.trim())
        throw new Error('Nenhum texto foi reconhecido. Tente outra imagem ou PDF.');
      texto = extraido;
      textoDeArquivo = true;
      progressoArquivo = 'Texto extraído. Confira e corrija o texto antes de analisar.';
    } catch (err) {
      if (pedido === pedidoAbertura)
        erroArquivo = toUserMessage(err, 'Não foi possível ler o arquivo.');
    } finally {
      processandoArquivo = false;
    }
  }
  function adicionarTrecho() {
    form.trechos = [...form.trechos, trechoVazio()];
    form.passageiros = form.passageiros.map((passageiro) => ({
      ...passageiro,
      assentos: [...passageiro.assentos, '']
    }));
  }
  function removerTrecho(indice: number) {
    form.trechos = form.trechos.filter((_, n) => n !== indice);
    form.passageiros = form.passageiros.map((passageiro) => ({
      ...passageiro,
      assentos: passageiro.assentos.filter((_, n) => n !== indice)
    }));
  }
  function moverTrecho(indice: number, deslocamento: -1 | 1) {
    const destino = indice + deslocamento;
    if (destino < 0 || destino >= form.trechos.length) return;
    const trechos = [...form.trechos];
    [trechos[indice], trechos[destino]] = [trechos[destino], trechos[indice]];
    form.trechos = trechos;
    form.passageiros = form.passageiros.map((passageiro) => {
      const assentos = form.trechos.map((_, n) => passageiro.assentos[n] || '');
      [assentos[indice], assentos[destino]] = [assentos[destino], assentos[indice]];
      return { ...passageiro, assentos };
    });
  }
  function moverPassageiro(indice: number, deslocamento: -1 | 1) {
    const destino = indice + deslocamento;
    if (destino < 0 || destino >= form.passageiros.length) return;
    const passageiros = [...form.passageiros];
    [passageiros[indice], passageiros[destino]] = [passageiros[destino], passageiros[indice]];
    form.passageiros = passageiros;
  }
  async function abrir(itemId: string, pedido: number) {
    try {
      const result = await apiFetch<{ item: PassagemSalva }>('/api/v1/passagens', {
        query: { id: itemId },
        noCache: true,
        redirectOnForbidden: false
      });
      if (pedido !== pedidoAbertura) return;
      id = result.item.id;
      form = {
        localizador: result.item.localizador,
        emissao: result.item.emissao,
        trechos: result.item.trechos.map((trecho) => ({
          ...trecho,
          origem: trecho.origem.toUpperCase(),
          destino: trecho.destino.toUpperCase(),
          cidadeOrigem: trecho.cidadeOrigem || '',
          cidadeDestino: trecho.cidadeDestino || '',
          tarifa: trecho.tarifa || ''
        })),
        passageiros: result.item.passageiros.map((passageiro) => ({
          ...passageiro,
          nome: nomePassageiroMaiusculo(passageiro.nome),
          tipo: passageiro.tipo || '',
          assentos: result.item.trechos.map((_, indice) => passageiro.assentos[indice] || '')
        }))
      };
      avisos = [];
      texto = '';
      editando = true;
      modoEdicao = $page.url.searchParams.get('origem') === 'comprovante';
    } catch (err) {
      if (pedido === pedidoAbertura)
        erroAbertura = toUserMessage(err, 'Não foi possível abrir a passagem.');
    }
  }
  async function salvar() {
    if (!modoEdicao || saving) return;
    if (revisaoArquivoPendente && !revisaoConfirmada) {
      toast.error('Confirme a revisão dos dados importados antes de salvar.');
      return;
    }
    if (
      form.trechos.some((trecho) => trecho.duracao && !/^\d{1,2}:[0-5]\d$/.test(trecho.duracao))
    ) {
      toast.error('Informe a duração no formato horas:minutos, por exemplo 10:19.');
      return;
    }
    saving = true;
    const pedido = pedidoAbertura;
    const novaPassagem = !id;
    try {
      const result = await apiFetch<{ id: string }>('/api/v1/passagens', {
        method: 'POST',
        body: { ...form, id },
        redirectOnForbidden: false
      });
      toast.success('Passagem salva.');
      if (pedido !== pedidoAbertura) return;
      id = result.id;
      modoEdicao = false;
      avisos = [];
      revisaoArquivoPendente = false;
      if (novaPassagem) {
        await goto(`/operacao/passagens?editar=${encodeURIComponent(result.id)}`, {
          replaceState: true
        });
      }
      await carregar();
    } catch (err) {
      toast.error(toUserMessage(err, 'Não foi possível salvar a passagem.'));
    } finally {
      saving = false;
    }
  }
  async function excluir(itemId: string) {
    if (!(await confirmAction('Deseja excluir esta passagem?'))) return;
    try {
      await apiFetch('/api/v1/passagens', {
        method: 'DELETE',
        query: { id: itemId },
        redirectOnForbidden: false
      });
      if (id === itemId) {
        editando = false;
        id = '';
        form = vazio();
      }
      toast.success('Passagem excluída.');
      await carregar();
    } catch (err) {
      toast.error(toUserMessage(err, 'Não foi possível excluir a passagem.'));
    }
  }
</script>

<PageHeader
  title="Passagem"
  subtitle="Importe e revise os dados da reserva antes de gerar o comprovante."
  color="operacao"
/>

<div class="space-y-5">
  {#if !$page.url.searchParams.has('editar') && $page.url.searchParams.get('nova') !== '1'}
    <Card title="Passagens salvas" color="operacao">
      <svelte:fragment slot="actions">
        <Button color="operacao" on:click={iniciarNovaPassagem} disabled={loading || !!error}
          >Nova passagem</Button
        >
      </svelte:fragment>
      {#if loading}
        <p class="text-sm text-slate-500">Carregando passagens...</p>
      {:else if error}
        <p role="alert" class="text-sm text-red-700">{error}</p>
      {:else if !items.length}
        <p class="text-sm text-slate-500">Nenhuma passagem salva.</p>
      {:else}
        <ul class="divide-y divide-slate-200">
          {#each items as item (item.id)}
            <li class="flex flex-wrap items-center justify-between gap-3 py-3">
              <div class="min-w-0">
                <span class="font-medium text-slate-900">Localizador: {item.localizador}</span>
                <span class="text-sm text-slate-700"> — {resumoLista(item)}</span>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  on:click={() => goto(`/operacao/passagens?editar=${encodeURIComponent(item.id)}`)}
                  >Abrir</Button
                >
                <Button
                  variant="secondary"
                  size="sm"
                  href={`/operacao/passagens/comprovante?id=${encodeURIComponent(item.id)}`}
                  >Comprovante</Button
                >
                <Button variant="danger" size="sm" on:click={() => excluir(item.id)}>Excluir</Button
                >
              </div>
            </li>
          {/each}
        </ul>
      {/if}
      {#if !loading && !error && (pagina > 1 || hasMore)}
        <div class="mt-4 flex flex-wrap items-center justify-end gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={pagina === 1}
            on:click={() => {
              pagina -= 1;
              void carregar();
            }}>Anterior</Button
          >
          <span class="text-sm text-slate-600">Página {pagina}</span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasMore}
            on:click={() => {
              pagina += 1;
              void carregar();
            }}>Próxima</Button
          >
        </div>
      {/if}
    </Card>
  {:else if erroAbertura}
    <Card title="Passagem" color="operacao">
      <p role="alert" class="mb-4 text-sm text-red-700">{erroAbertura}</p>
      <Button variant="secondary" href="/operacao/passagens">Voltar</Button>
    </Card>
  {:else if !editando}
    <Card title="Passagem" color="operacao">
      <p role="status" class="text-sm text-slate-500">Carregando passagem...</p>
      <Button variant="secondary" href="/operacao/passagens">Voltar</Button>
    </Card>
  {:else}
    <Card
      title={id ? (modoEdicao ? 'Editar passagem' : 'Dados da passagem') : 'Nova passagem'}
      color="operacao"
    >
      <svelte:fragment slot="actions">
        <Button
          variant="secondary"
          href={$page.url.searchParams.get('origem') === 'comprovante' && id
            ? `/operacao/passagens/comprovante?id=${encodeURIComponent(id)}`
            : '/operacao/passagens'}
          disabled={saving || processandoArquivo}>Voltar</Button
        >
      </svelte:fragment>
      <div class="space-y-6">
        {#if !id}
          <details class="importacao-editavel rounded-lg border border-slate-200 p-4">
            <summary class="flex cursor-pointer items-center justify-between gap-2 font-medium">
              <span>Importar reserva por texto, PDF ou imagem</span>
              <span class="trecho-toggle" aria-hidden="true"></span>
            </summary>
            <div class="mt-3 space-y-3">
              <div class="space-y-2">
                <label for="arquivo-reserva" class="block text-sm font-medium text-slate-700">
                  PDF ou imagem da reserva
                </label>
                <input
                  id="arquivo-reserva"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  disabled={processandoArquivo}
                  on:change={(event) => {
                    arquivo = event.currentTarget.files?.[0] ?? null;
                    erroArquivo = '';
                    progressoArquivo = '';
                  }}
                />
                <p class="text-sm text-slate-600">
                  Até 10 MB e 10 páginas. O arquivo é processado no navegador.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  on:click={lerArquivo}
                  disabled={saving || processandoArquivo}>Extrair texto do arquivo</Button
                >
                {#if progressoArquivo}<p role="status" class="text-sm text-slate-600">
                    {progressoArquivo}
                  </p>{/if}
                {#if erroArquivo}<p role="alert" class="text-sm text-red-700">{erroArquivo}</p>{/if}
              </div>
              <FieldTextarea
                id="texto-reserva"
                label="Texto da reserva"
                bind:value={texto}
                rows={6}
                helper="Cole o texto copiado da reserva. O reconhecimento é inicial e pode variar conforme o sistema; revise todos os dados."
              />
              <Button
                type="button"
                variant="secondary"
                on:click={analisar}
                disabled={saving || processandoArquivo}>Analisar texto</Button
              >
            </div>
          </details>
        {/if}
        {#if avisos.length}
          <div
            role="status"
            class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            {#each avisos as aviso}<p>{aviso}</p>{/each}
          </div>
        {/if}
        {#if revisaoArquivoPendente}
          <label
            class="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <input type="checkbox" bind:checked={revisaoConfirmada} />
            <span
              >Revisei e confirmei os dados importados, incluindo voos, datas, passageiros e
              assentos.</span
            >
          </label>
        {/if}
        <fieldset disabled={!modoEdicao || saving} class="grid grid-cols-2 gap-3">
          <FieldInput
            id="passagem-localizador"
            label="Localizador (PNR)"
            bind:value={form.localizador}
            required
          />
          <FieldInput
            id="passagem-emissao"
            label="Data de emissão"
            type="date"
            bind:value={form.emissao}
          />
        </fieldset>
        <section class="space-y-3">
          {#if cidadesIndisponiveis}
            <p role="status" class="text-sm text-amber-700">
              Não foi possível consultar as cidades dos aeroportos. Informe-as manualmente nos
              trechos.
            </p>
          {/if}
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h3 class="font-semibold text-slate-900">Trechos de voo</h3>
            {#if modoEdicao}<Button
                variant="secondary"
                size="sm"
                disabled={saving}
                on:click={adicionarTrecho}>Adicionar trecho</Button
              >{/if}
          </div>
          {#each form.trechos as trecho, i (trecho)}
            <details class="trecho-editavel rounded-lg border border-slate-200 p-4">
              <summary class="flex cursor-pointer items-center justify-between gap-2 font-medium">
                <span
                  >Trecho {i + 1}{#if trecho.origem && trecho.destino}
                    — {trecho.origem} → {trecho.destino}{/if}</span
                >
                <span class="trecho-toggle" aria-hidden="true"></span>
              </summary>
              <div class="mt-3 space-y-3">
                {#if modoEdicao}<div class="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={saving || i === 0}
                      ariaLabel={`Mover trecho ${i + 1} para cima`}
                      on:click={() => moverTrecho(i, -1)}>↑ Mover para cima</Button
                    >
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={saving || i === form.trechos.length - 1}
                      ariaLabel={`Mover trecho ${i + 1} para baixo`}
                      on:click={() => moverTrecho(i, 1)}>↓ Mover para baixo</Button
                    >
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={saving}
                      on:click={() => removerTrecho(i)}>Remover trecho</Button
                    >
                  </div>{/if}
                <fieldset
                  disabled={!modoEdicao || saving}
                  class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <FieldInput
                    id={`companhia-${i}`}
                    label="Companhia aérea"
                    bind:value={trecho.companhia}
                    required
                  />
                  <FieldInput id={`voo-${i}`} label="Voo" bind:value={trecho.voo} required />
                  <FieldDatalistInput
                    id={`classe-${i}`}
                    label="Classe"
                    bind:value={trecho.classe}
                    options={classes}
                    placeholder="Selecione ou digite"
                  />
                  <FieldDatalistInput
                    id={`tarifa-${i}`}
                    label="Tarifa"
                    bind:value={trecho.tarifa}
                    options={tarifas}
                    placeholder="Selecione ou digite"
                  />
                  <FieldInput
                    id={`origem-${i}`}
                    label="Aeroporto de origem"
                    bind:value={trecho.origem}
                    required
                    on:input={(event) => formatarAeroporto(event, trecho, 'origem')}
                  />
                  <FieldInput
                    id={`cidade-origem-${i}`}
                    label="Cidade de origem"
                    bind:value={trecho.cidadeOrigem}
                    placeholder={cidadeSugerida(trecho.origem) || 'Informe a cidade'}
                    helper="Deixe vazio para usar a cidade sugerida pelo código do aeroporto."
                  />
                  <FieldInput
                    id={`destino-${i}`}
                    label="Aeroporto de destino"
                    bind:value={trecho.destino}
                    required
                    on:input={(event) => formatarAeroporto(event, trecho, 'destino')}
                  />
                  <FieldInput
                    id={`cidade-destino-${i}`}
                    label="Cidade de destino"
                    bind:value={trecho.cidadeDestino}
                    placeholder={cidadeSugerida(trecho.destino) || 'Informe a cidade'}
                    helper="Deixe vazio para usar a cidade sugerida pelo código do aeroporto."
                  />
                  <FieldInput
                    id={`duracao-${i}`}
                    label="Duração"
                    bind:value={trecho.duracao}
                    placeholder="Ex.: 10:19"
                    maxlength={5}
                    helper="Horas e minutos, por exemplo 10:19."
                    on:input={(event) => formatarDuracao(event, trecho)}
                  />
                  <FieldInput
                    id={`saida-${i}`}
                    label="Saída (horário local)"
                    type="datetime-local"
                    bind:value={trecho.saida}
                    required
                  />
                  <FieldInput
                    id={`chegada-${i}`}
                    label="Chegada (horário local)"
                    type="datetime-local"
                    bind:value={trecho.chegada}
                    required
                  />
                  <FieldInput
                    id={`status-voo-${i}`}
                    label="Status do voo"
                    bind:value={trecho.status}
                  />
                </fieldset>
                {#if id && modoEdicao}
                  <p class="text-right text-sm text-slate-500">
                    O comprovante usa a última versão salva.
                  </p>
                {/if}
              </div>
            </details>
          {/each}
        </section>
        <section class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h3 class="font-semibold text-slate-900">Passageiros e bilhetes</h3>
            {#if modoEdicao}<Button
                variant="secondary"
                size="sm"
                disabled={saving}
                on:click={() => (form.passageiros = [...form.passageiros, passageiroVazio()])}
                >Adicionar passageiro</Button
              >{/if}
          </div>

          {#each form.passageiros as passageiro, i (passageiro)}
            <details class="passageiro-editavel rounded-lg border border-slate-200 p-4">
              <summary class="flex cursor-pointer items-center justify-between gap-2 font-medium">
                <span
                  >Passageiro {i + 1}{#if passageiro.nome}
                    — {passageiro.nome}{/if}</span
                >
                <span class="trecho-toggle" aria-hidden="true"></span>
              </summary>
              <div class="mt-3 space-y-3">
                {#if modoEdicao}<div class="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={saving || i === 0}
                      ariaLabel={`Mover passageiro ${i + 1} para cima`}
                      on:click={() => moverPassageiro(i, -1)}>↑ Mover para cima</Button
                    >
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={saving || i === form.passageiros.length - 1}
                      ariaLabel={`Mover passageiro ${i + 1} para baixo`}
                      on:click={() => moverPassageiro(i, 1)}>↓ Mover para baixo</Button
                    >
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={saving}
                      on:click={() =>
                        (form.passageiros = form.passageiros.filter((_, n) => n !== i))}
                      >Remover passageiro</Button
                    >
                  </div>{/if}
                <fieldset
                  disabled={!modoEdicao || saving}
                  class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <FieldInput
                    id={`passageiro-${i}`}
                    label="Nome"
                    bind:value={passageiro.nome}
                    on:input={(event) => formatarNomePassageiro(event, passageiro)}
                    required
                  />
                  <FieldSelect
                    id={`tipo-passageiro-${i}`}
                    label="Tipo de passageiro"
                    bind:value={passageiro.tipo}
                    placeholder={null}
                    options={[
                      { value: '', label: 'Não informado' },
                      { value: 'ADT', label: 'Adulto' },
                      { value: 'CHD', label: 'Criança' },
                      { value: 'INF', label: 'Infant' }
                    ]}
                  />
                  <FieldInput
                    id={`bilhete-${i}`}
                    label="Número do bilhete"
                    bind:value={passageiro.bilhete}
                  />
                  <FieldInput
                    id={`status-bilhete-${i}`}
                    label="Status do bilhete"
                    bind:value={passageiro.status}
                  />
                  {#each form.trechos as trecho, j}
                    <FieldInput
                      id={`assento-${i}-${j}`}
                      label={`Assento — trecho ${j + 1}${trecho.voo ? ` (${trecho.voo})` : ''}`}
                      bind:value={passageiro.assentos[j]}
                    />
                  {/each}
                </fieldset>
              </div>
            </details>
          {/each}
        </section>
        <div class="flex flex-wrap justify-end gap-3">
          <Button
            variant="secondary"
            href="/operacao/passagens"
            disabled={saving || processandoArquivo}>Fechar</Button
          >
          {#if modoEdicao}<Button
              color="operacao"
              on:click={salvar}
              loading={saving}
              disabled={processandoArquivo}>Salvar passagem</Button
            >{:else}<Button color="operacao" on:click={() => (modoEdicao = true)}>Editar</Button
            >{/if}
          {#if id}<Button
              variant="secondary"
              href={`/operacao/passagens/comprovante?id=${encodeURIComponent(id)}&origem=edicao`}
              >Gerar comprovante</Button
            >{/if}
        </div>

        <style>
          .trecho-editavel summary,
          .passageiro-editavel summary,
          .importacao-editavel summary {
            list-style: none;
          }
          .trecho-editavel summary::-webkit-details-marker,
          .passageiro-editavel summary::-webkit-details-marker,
          .importacao-editavel summary::-webkit-details-marker {
            display: none;
          }
          .trecho-toggle::before {
            content: '+';
            font-size: 1.25rem;
          }
          .trecho-editavel[open] .trecho-toggle::before,
          .passageiro-editavel[open] .trecho-toggle::before,
          .importacao-editavel[open] .trecho-toggle::before {
            content: '−';
          }
        </style>
      </div>
    </Card>
  {/if}
</div>
