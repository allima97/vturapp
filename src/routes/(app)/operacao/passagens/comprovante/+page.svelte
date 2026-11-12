<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import {
    loadAirportCodeCityLookup,
    type AirportCodeCityLookup
  } from '$lib/airportCodeCityLookup';
  import { apiFetch } from '$lib/services/api';
  import { diffDaysISODate } from '$lib/date';
  import { toUserMessage } from '$lib/utils/errors';
  import type {
    PassagemImportada,
    PassageiroPassagem,
    TrechoPassagem
  } from '$lib/passagens/importacao';

  let item: PassagemImportada | null = null;
  let cidades: AirportCodeCityLookup = {};
  let cidadesIndisponiveis = false;
  let error = '';
  let loading = true;

  function cidade(codigo: string, informada?: string) {
    return informada?.trim() || cidades[codigo.trim().toUpperCase()] || '';
  }

  function aeroporto(codigo: string, informada?: string) {
    const nome = cidade(codigo, informada);
    return nome ? `${nome} (${codigo})` : codigo;
  }

  function data(value: string, completa = false) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return value || 'Não informada';
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'UTC',
      ...(completa ? { weekday: 'long' as const } : {}),
      day: '2-digit',
      month: completa ? ('long' as const) : ('short' as const),
      year: 'numeric'
    }).format(date);
  }

  function horario(value: string) {
    return value.includes('T') ? value.split('T')[1] : '';
  }

  function avisoChegada(saida: string, chegada: string) {
    const dias = diffDaysISODate(saida, chegada);
    if (dias === null || dias <= 0) return '';
    if (dias === 1) return 'Chegada no dia seguinte (+1)';
    return `Chegada ${dias} dias depois (+${dias})`;
  }

  function tituloTrecho(trechos: TrechoPassagem[], indice: number) {
    if (
      trechos.length === 2 &&
      trechos[0].origem.toUpperCase() === trechos[1].destino.toUpperCase() &&
      trechos[0].destino.toUpperCase() === trechos[1].origem.toUpperCase()
    )
      return indice === 0 ? 'IDA' : 'VOLTA';
    return `TRECHO ${indice + 1}`;
  }

  function destinoDaRota(trechos: TrechoPassagem[]) {
    const ultimo = trechos[trechos.length - 1];
    const terminaNaOrigem =
      trechos.length > 1 &&
      ultimo.destino.trim().toUpperCase() === trechos[0].origem.trim().toUpperCase();
    return trechos[terminaNaOrigem ? trechos.length - 2 : trechos.length - 1];
  }

  function resumoRotas(trechos: TrechoPassagem[]) {
    const grupos: TrechoPassagem[][] = [];
    for (const trecho of trechos) {
      const grupo = grupos[grupos.length - 1];
      if (
        !grupo ||
        grupo[grupo.length - 1].destino.trim().toUpperCase() !== trecho.origem.trim().toUpperCase()
      ) {
        grupos.push([trecho]);
      } else {
        grupo.push(trecho);
      }
    }
    return grupos
      .map((grupo) => {
        const origem = grupo[0];
        const destino = destinoDaRota(grupo);
        return `${aeroporto(origem.origem, origem.cidadeOrigem)} / ${aeroporto(destino.destino, destino.cidadeDestino)}`;
      })
      .join(' e ');
  }

  function assentos(indice: number) {
    return (
      item?.passageiros
        .map((p) => p.assentos[indice])
        .filter(Boolean)
        .join(', ') || 'Não informados'
    );
  }

  function resumoPassageiros(passageiros: PassageiroPassagem[]) {
    const categorias = [
      {
        quantidade: passageiros.filter((p) => p.tipo === 'ADT').length,
        singular: 'Adulto',
        plural: 'Adultos'
      },
      {
        quantidade: passageiros.filter((p) => p.tipo === 'CHD').length,
        singular: 'Criança',
        plural: 'Crianças'
      },
      {
        quantidade: passageiros.filter((p) => p.tipo === 'INF').length,
        singular: 'Infant',
        plural: 'Infants'
      },
      {
        quantidade: passageiros.filter((p) => !p.tipo).length,
        singular: 'Não informado',
        plural: 'Não informados'
      }
    ];
    return (
      categorias
        .filter(({ quantidade }) => quantidade > 0)
        .map(
          ({ quantidade, singular, plural }) =>
            `${quantidade} ${quantidade === 1 ? singular : plural}`
        )
        .join(' + ') || '0'
    );
  }

  onMount(async () => {
    try {
      const id = $page.url.searchParams.get('id');
      if (!id) throw new Error('Identificação da passagem não informada.');
      const [response, lookup] = await Promise.all([
        apiFetch<{ item: PassagemImportada }>('/api/v1/passagens', {
          query: { id },
          noCache: true,
          redirectOnForbidden: false
        }),
        loadAirportCodeCityLookup()
      ]);
      cidades = lookup;
      cidadesIndisponiveis = Object.keys(lookup).length === 0;
      item = {
        ...response.item,
        trechos: response.item.trechos.map((trecho) => ({
          ...trecho,
          origem: trecho.origem.toUpperCase(),
          destino: trecho.destino.toUpperCase()
        }))
      };
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
      {#if cidadesIndisponiveis}
        <p role="status">
          Não foi possível consultar as cidades dos aeroportos. Você pode informá-las ao editar a
          passagem.
        </p>
      {/if}
      <a
        href={`/operacao/passagens?editar=${encodeURIComponent($page.url.searchParams.get('id') || '')}`}
        >Editar</a
      >
      <button type="button" on:click={() => window.print()}>Imprimir / Salvar em PDF</button>
    </div>
    <header class="cabecalho">
      <strong>{[...new Set(item.trechos.map((trecho) => trecho.companhia))].join(' / ')}</strong>
      <span>COMPROVANTE DE VIAGEM</span>
    </header>
    <div class="reserva">
      <div>
        <span class="rotulo">CÓDIGO DE RESERVA (PNR)</span>
        <strong class="localizador">{item.localizador}</strong>
      </div>
      <div class="resumo">
        <p>
          <strong>Rota:</strong>
          {resumoRotas(item.trechos)}
        </p>
        <p>
          <strong>Passageiros:</strong>
          {resumoPassageiros(item.passageiros)}
        </p>
        {#if item.emissao}<p><strong>Emissão:</strong> {data(item.emissao, true)}</p>{/if}
      </div>
    </div>
    <h2>ITINERÁRIO DE VOO</h2>
    {#each item.trechos as trecho, i}
      <section class="trecho">
        <div class="trecho-cabecalho">
          <strong>{tituloTrecho(item.trechos, i)} — {data(trecho.saida, true)}</strong>
          <strong>Voo {trecho.voo}</strong>
        </div>
        <div class="trecho-corpo">
          <div class="trajeto">
            <div class="local">
              <strong class="codigo">{trecho.origem}</strong>
              <strong>{cidade(trecho.origem, trecho.cidadeOrigem) || 'Cidade não informada'}</strong
              >
              <p>{data(trecho.saida)} — <strong>{horario(trecho.saida)}</strong></p>
            </div>
            <div class="duracao">
              <strong>DURAÇÃO: {trecho.duracao || 'Não informada'}</strong><span>✈</span>
              {#if avisoChegada(trecho.saida, trecho.chegada)}
                <small>{avisoChegada(trecho.saida, trecho.chegada)}</small>
              {/if}
            </div>
            <div class="local destino">
              <strong class="codigo">{trecho.destino}</strong>
              <strong
                >{cidade(trecho.destino, trecho.cidadeDestino) || 'Cidade não informada'}</strong
              >
              <p>{data(trecho.chegada)} — <strong>{horario(trecho.chegada)}</strong></p>
            </div>
          </div>
          <div class="detalhes">
            <div><span class="rotulo">COMPANHIA</span><strong>{trecho.companhia}</strong></div>
            <div>
              <span class="rotulo">CLASSE</span><strong>{trecho.classe || 'Não informada'}</strong>
            </div>
            <div>
              <span class="rotulo">TARIFA</span><strong>{trecho.tarifa?.trim() || '-'}</strong>
            </div>
            <div><span class="rotulo">ASSENTOS</span><strong>{assentos(i)}</strong></div>
            <div>
              <span class="rotulo">STATUS DO VOO</span><strong
                >{trecho.status || 'Não informado'}</strong
              >
            </div>
          </div>
        </div>
      </section>
    {/each}
    <h2>PASSAGEIROS E BILHETES ELETRÔNICOS</h2>
    <table>
      <thead
        ><tr
          ><th>Nome do passageiro</th><th>Tipo</th><th>Número do bilhete</th><th
            >Status do bilhete</th
          ></tr
        ></thead
      >
      <tbody>
        {#each item.passageiros as passageiro}
          <tr
            ><td><strong>{passageiro.nome}</strong></td><td
              >{passageiro.tipo === 'ADT'
                ? 'Adulto'
                : passageiro.tipo === 'CHD'
                  ? 'Criança'
                  : passageiro.tipo === 'INF'
                    ? 'Infant'
                    : 'Não informado'}</td
            ><td>{passageiro.bilhete || 'Não informado'}</td><td
              >{passageiro.status || 'Não informado'}</td
            ></tr
          >
        {/each}
      </tbody>
    </table>
    <footer>
      {[...new Set(item.trechos.map((trecho) => trecho.companhia))].join(' / ')} — Reserva: {item.localizador}
    </footer>
  {/if}
</div>

<style>
  .comprovante {
    box-sizing: border-box;
    width: 100%;
    padding: 24px;
    color: #17233c;
    background: white;
    font-family: Arial, sans-serif;
    font-size: 13px;
  }
  .acoes {
    text-align: right;
    margin-bottom: 20px;
  }
  .acoes p {
    color: #92400e;
  }
  .acoes button,
  .acoes a {
    display: inline-block;
    padding: 9px 14px;
    border: 1px solid #0075ca;
    border-radius: 6px;
    cursor: pointer;
  }
  .acoes a {
    margin-right: 8px;
    color: #17233c;
    text-decoration: none;
  }
  .cabecalho {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
    border-bottom: 2px solid #0075ca;
    padding-bottom: 14px;
  }
  .cabecalho strong {
    color: #0075ca;
    font-size: 22px;
    text-transform: uppercase;
  }
  .cabecalho span {
    color: #475569;
    font-size: 14px;
    font-weight: bold;
    text-align: right;
  }
  .reserva {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    background: #f6f8fb;
    border: 1px solid #cbd5e1;
    border-left: 4px solid #0075ca;
    border-radius: 4px;
    padding: 14px 18px;
    margin-top: 18px;
  }
  .rotulo {
    display: block;
    color: #64748b;
    font-size: 10px;
    font-weight: bold;
  }
  .localizador {
    display: block;
    font-size: 26px;
    letter-spacing: 1px;
  }
  .resumo {
    text-align: right;
  }
  p {
    margin: 3px 0;
  }
  h2 {
    font-size: 15px;
    border-bottom: 1px solid #dbe3ec;
    padding-bottom: 7px;
    margin: 20px 0 10px;
  }
  .trecho {
    border: 1px solid #cbd5e1;
    border-radius: 5px;
    margin-bottom: 12px;
    break-inside: avoid;
    overflow: hidden;
  }
  .trecho-cabecalho {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 14px;
    background: #101b33;
    color: white;
  }
  .trecho-corpo {
    padding: 12px 14px;
  }
  .trajeto {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 12px;
    align-items: center;
  }
  .local > strong {
    display: block;
  }
  .codigo {
    color: #0075ca;
    font-size: 22px;
  }
  .local p {
    margin-top: 5px;
    color: #475569;
  }
  .destino {
    text-align: right;
  }
  .duracao {
    display: flex;
    flex-direction: column;
    align-items: center;
    color: #64748b;
    font-size: 10px;
    text-align: center;
  }
  .duracao span {
    display: flex;
    align-items: center;
    width: 110px;
    max-width: 100%;
    color: #0075ca;
    font-size: 18px;
  }
  .duracao span::before,
  .duracao span::after {
    content: '';
    flex: 1;
    height: 2px;
    background: #cbd5e1;
  }
  .duracao small {
    font-size: 10px;
  }
  .detalhes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 10px;
    border-top: 1px dashed #dbe3ec;
    margin-top: 12px;
    padding-top: 10px;
  }
  .detalhes strong {
    display: block;
    overflow-wrap: anywhere;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 9px 10px;
    text-align: left;
    border-bottom: 1px solid #dbe3ec;
    overflow-wrap: anywhere;
  }
  th {
    background: #f1f5f9;
    color: #334155;
    font-size: 10px;
    text-transform: uppercase;
  }
  tr {
    break-inside: avoid;
  }
  footer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #dbe3ec;
    color: #64748b;
    font-size: 11px;
  }
  @media (max-width: 600px) {
    .cabecalho,
    .reserva {
      flex-wrap: wrap;
    }
    .resumo {
      text-align: left;
    }
    .detalhes {
      grid-template-columns: repeat(2, 1fr);
    }
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
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  }
</style>
