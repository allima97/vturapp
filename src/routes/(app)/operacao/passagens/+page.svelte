<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import FieldInput from '$lib/components/ui/form/FieldInput.svelte';
  import FieldTextarea from '$lib/components/ui/form/FieldTextarea.svelte';
  import { toast } from '$lib/stores/ui';
  import { confirmAction } from '$lib/stores/confirm';
  import { apiFetch, ApiError } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';
  import {
    importarTextoPassagem,
    type PassagemImportada,
    type TrechoPassagem,
    type PassageiroPassagem
  } from '$lib/passagens/importacao';

  type ListaItem = { id: string; localizador: string; updated_at: string };
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
    saida: '',
    chegada: '',
    status: '',
    duracao: '',
    classe: ''
  });
  const passageiroVazio = (): PassageiroPassagem => ({
    nome: '',
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
  let editando = false;
  let loading = true;
  let saving = false;
  let error = '';

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
  onMount(carregar);

  function novo() {
    id = '';
    form = vazio();
    texto = '';
    avisos = [];
    editando = true;
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
        assentos: resultado.dados.trechos.map((_, indice) => passageiro.assentos[indice] || '')
      }))
    };
    avisos = resultado.avisos;
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
  async function abrir(itemId: string) {
    try {
      const result = await apiFetch<{ item: PassagemSalva }>('/api/v1/passagens', {
        query: { id: itemId },
        noCache: true,
        redirectOnForbidden: false
      });
      id = result.item.id;
      form = {
        localizador: result.item.localizador,
        emissao: result.item.emissao,
        trechos: result.item.trechos,
        passageiros: result.item.passageiros.map((passageiro) => ({
          ...passageiro,
          assentos: result.item.trechos.map((_, indice) => passageiro.assentos[indice] || '')
        }))
      };
      avisos = [];
      texto = '';
      editando = true;
    } catch (err) {
      toast.error(toUserMessage(err, 'Não foi possível abrir a passagem.'));
    }
  }
  async function salvar() {
    saving = true;
    try {
      const result = await apiFetch<{ id: string }>('/api/v1/passagens', {
        method: 'POST',
        body: { ...form, id },
        redirectOnForbidden: false
      });
      id = result.id;
      toast.success('Passagem salva.');
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
  <Card title="Passagens salvas" color="operacao">
    <svelte:fragment slot="actions">
      <Button color="operacao" on:click={novo} disabled={loading || !!error}>Nova passagem</Button>
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
            <span class="font-medium text-slate-900">Localizador: {item.localizador}</span>
            <div class="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" on:click={() => abrir(item.id)}>Abrir</Button>
              <Button
                variant="secondary"
                size="sm"
                href={`/operacao/passagens/comprovante?id=${encodeURIComponent(item.id)}`}
                target="_blank"
                rel="noopener noreferrer">Comprovante</Button
              >
              <Button variant="danger" size="sm" on:click={() => excluir(item.id)}>Excluir</Button>
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

  {#if editando}
    <Card title={id ? 'Editar passagem' : 'Nova passagem'} color="operacao">
      <div class="space-y-6">
        <FieldTextarea
          id="texto-reserva"
          label="Texto da reserva"
          bind:value={texto}
          rows={6}
          helper="Cole o texto copiado da reserva. O reconhecimento é inicial e pode variar conforme o sistema; revise todos os dados."
        />
        <Button type="button" variant="secondary" on:click={analisar} disabled={saving}
          >Analisar texto</Button
        >
        {#if avisos.length}
          <div
            role="status"
            class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            {#each avisos as aviso}<p>{aviso}</p>{/each}
          </div>
        {/if}
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
        <section class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h3 class="font-semibold text-slate-900">Trechos de voo</h3>
            <Button variant="secondary" size="sm" on:click={adicionarTrecho}
              >Adicionar trecho</Button
            >
          </div>
          {#each form.trechos as trecho, i}
            <div class="space-y-3 rounded-lg border border-slate-200 p-4">
              <div class="flex items-center justify-between gap-2">
                <h4 class="font-medium">Trecho {i + 1}</h4>
                <Button variant="secondary" size="sm" on:click={() => removerTrecho(i)}
                  >Remover trecho</Button
                >
              </div>
              <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <FieldInput
                  id={`companhia-${i}`}
                  label="Companhia aérea"
                  bind:value={trecho.companhia}
                  required
                />
                <FieldInput id={`voo-${i}`} label="Voo" bind:value={trecho.voo} required />
                <FieldInput id={`classe-${i}`} label="Classe" bind:value={trecho.classe} />
                <FieldInput id={`origem-${i}`} label="Origem" bind:value={trecho.origem} required />
                <FieldInput
                  id={`destino-${i}`}
                  label="Destino"
                  bind:value={trecho.destino}
                  required
                />
                <FieldInput
                  id={`duracao-${i}`}
                  label="Duração"
                  bind:value={trecho.duracao}
                  placeholder="Ex.: 01:19"
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
              </div>
              {#if id}
                <p class="text-right text-sm text-slate-500">
                  O comprovante usa a última versão salva.
                </p>
              {/if}
            </div>
          {/each}
        </section>
        <section class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h3 class="font-semibold text-slate-900">Passageiros e bilhetes</h3>
            <Button
              variant="secondary"
              size="sm"
              on:click={() => (form.passageiros = [...form.passageiros, passageiroVazio()])}
              >Adicionar passageiro</Button
            >
          </div>
          {#each form.passageiros as passageiro, i}
            <div class="space-y-3 rounded-lg border border-slate-200 p-4">
              <div class="flex items-center justify-between gap-2">
                <h4 class="font-medium">Passageiro {i + 1}</h4>
                <Button
                  variant="secondary"
                  size="sm"
                  on:click={() => (form.passageiros = form.passageiros.filter((_, n) => n !== i))}
                  >Remover passageiro</Button
                >
              </div>
              <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <FieldInput
                  id={`passageiro-${i}`}
                  label="Nome"
                  bind:value={passageiro.nome}
                  required
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
              </div>
            </div>
          {/each}
        </section>
        <div class="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" on:click={() => (editando = false)} disabled={saving}
            >Fechar</Button
          >
          <Button color="operacao" on:click={salvar} loading={saving}>Salvar passagem</Button>
          {#if id}<Button
              variant="secondary"
              href={`/operacao/passagens/comprovante?id=${encodeURIComponent(id)}`}
              target="_blank"
              rel="noopener noreferrer">Gerar comprovante</Button
            >{/if}
        </div>
      </div>
    </Card>
  {/if}
</div>
