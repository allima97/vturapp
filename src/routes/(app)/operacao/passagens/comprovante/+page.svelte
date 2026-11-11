<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { apiFetch } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';
  import type { PassagemImportada } from '$lib/passagens/importacao';

  let item: PassagemImportada | null = null;
  let error = '';
  let loading = true;
  function formatarData(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/.exec(value);
    return match ? `${match[3]}/${match[2]}/${match[1]} — ${match[4]}` : value;
  }
  onMount(async () => {
    try {
      const id = $page.url.searchParams.get('id');
      if (!id) throw new Error('Identificação da passagem não informada.');
      const response = await apiFetch<{ item: PassagemImportada }>('/api/v1/passagens', {
        query: { id },
        noCache: true,
        redirectOnForbidden: false
      });
      item = response.item;
    } catch (err) {
      error = toUserMessage(err, 'Não foi possível carregar o comprovante.');
    } finally {
      loading = false;
    }
  });
</script>

<div class="comprovante">
  {#if loading}
    <p>Carregando comprovante...</p>
  {:else if error}
    <p role="alert">{error}</p>
  {:else if item}
    <div class="acoes">
      <button type="button" on:click={() => window.print()}>Imprimir / Salvar em PDF</button>
    </div>
    <header>
      <h1>COMPROVANTE DE VIAGEM</h1>
      <p>
        Companhia aérea: {[...new Set(item.trechos.map((trecho) => trecho.companhia))].join(' / ')}
      </p>
      <p class="pnr">CÓDIGO DE RESERVA (PNR): <strong>{item.localizador}</strong></p>
      <p>Passageiros: {item.passageiros.length}</p>
      {#if item.emissao}<p>Emissão: {item.emissao.split('-').reverse().join('/')}</p>{/if}
    </header>
    <h2>ITINERÁRIO DE VOO</h2>
    {#each item.trechos as trecho, i}
      <section>
        <h3>TRECHO {i + 1} — {trecho.voo}</h3>
        <div class="trajeto">
          <div>
            <strong>{trecho.origem}</strong>
            <p>{formatarData(trecho.saida)}</p>
          </div>
          <div class="detalhes">
            <p>COMPANHIA: {trecho.companhia}</p>
            <p>CLASSE: {trecho.classe || 'Não informada'}</p>
            <p>DURAÇÃO: {trecho.duracao || 'Não informada'}</p>
          </div>
          <div>
            <strong>{trecho.destino}</strong>
            <p>{formatarData(trecho.chegada)}</p>
          </div>
        </div>
        <p>STATUS: {trecho.status || 'Não informado'}</p>
      </section>
    {/each}
    <h2>PASSAGEIROS E BILHETES ELETRÔNICOS</h2>
    <table>
      <thead
        ><tr
          ><th>Nome do passageiro</th><th>Número do bilhete</th><th>Status</th><th
            >Assentos por trecho</th
          ></tr
        ></thead
      >
      <tbody
        >{#each item.passageiros as passageiro}<tr
            ><td>{passageiro.nome}</td><td>{passageiro.bilhete || 'Não informado'}</td><td
              >{passageiro.status || 'Não informado'}</td
            ><td
              >{passageiro.assentos
                .map((assento, i) => (assento ? `${i + 1}: ${assento}` : ''))
                .filter(Boolean)
                .join(' · ') || 'Não informados'}</td
            ></tr
          >{/each}</tbody
      >
    </table>
    <footer>
      Comprovante de viagem • PNR: {item.localizador}<br />Confira as informações e documentos
      diretamente com a companhia aérea.
    </footer>
  {/if}
</div>

<style>
  .comprovante {
    max-width: 860px;
    margin: 0 auto;
    padding: 24px;
    color: #172554;
    background: white;
    font-family: Arial, sans-serif;
    font-size: 13px;
  }
  .acoes {
    text-align: right;
    margin-bottom: 20px;
  }
  .acoes button {
    padding: 9px 14px;
    border: 1px solid #1e3a8a;
    border-radius: 6px;
    cursor: pointer;
  }
  header {
    border-top: 6px solid #1e3a8a;
    border-bottom: 1px solid #cbd5e1;
    padding: 15px 0;
  }
  h1 {
    font-size: 19px;
    margin: 0 0 12px;
  }
  h2 {
    font-size: 14px;
    background: #e8eef8;
    padding: 10px;
    margin-top: 22px;
  }
  h3 {
    font-size: 13px;
    color: #1e3a8a;
  }
  p {
    margin: 6px 0;
  }
  .pnr strong {
    font-size: 20px;
  }
  section {
    border: 1px solid #d5deeb;
    border-radius: 5px;
    padding: 12px;
    margin: 10px 0;
    break-inside: avoid;
  }
  .trajeto {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
    align-items: start;
  }
  .trajeto strong {
    font-size: 19px;
  }
  .detalhes {
    font-size: 11px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 9px;
    text-align: left;
    border-bottom: 1px solid #d5deeb;
    overflow-wrap: anywhere;
  }
  th {
    background: #f1f5f9;
    font-size: 11px;
    text-transform: uppercase;
  }
  footer {
    margin-top: 28px;
    padding-top: 10px;
    border-top: 1px solid #cbd5e1;
    font-size: 11px;
  }
  @media print {
    :global(body *) {
      visibility: hidden;
    }
    :global(.comprovante),
    :global(.comprovante *) {
      visibility: visible;
    }
    .acoes {
      display: none;
    }
    .comprovante {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      padding: 0;
      max-width: none;
    }
  }
</style>
