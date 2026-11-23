<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/stores';
  import Button from '$lib/components/ui/Button.svelte';
  import { nomePassageiroMaiusculo } from '$lib/passagens/nome';
  import { formatarDataPassagem as data } from '$lib/passagens/data';
  import { resumoRotas } from '$lib/passagens/rotas';
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
  let modeloPdf: 'padrao' | 'bilhete' | 'moderno' = 'padrao';
  let cidades: AirportCodeCityLookup = {};
  let cidadesIndisponiveis = false;
  let error = '';
  let loading = true;
  let tituloAnterior: string | null = null;

  function restaurarTitulo() {
    if (tituloAnterior !== null) {
      document.title = tituloAnterior;
      tituloAnterior = null;
    }
    window.removeEventListener('afterprint', restaurarTitulo);
  }

  function imprimir() {
    if (!item) return;
    if (tituloAnterior === null) tituloAnterior = document.title;
    document.title = item.localizador;
    window.addEventListener('afterprint', restaurarTitulo);
    try {
      window.print();
    } catch (err) {
      restaurarTitulo();
      throw err;
    }
  }

  onDestroy(() => {
    if (tituloAnterior !== null) restaurarTitulo();
  });

  function cidade(codigo: string, informada?: string) {
    return informada?.trim() || cidades[codigo.trim().toUpperCase()] || '';
  }

  function aeroporto(codigo: string, informada?: string) {
    const nome = cidade(codigo, informada);
    return nome ? `${nome} (${codigo})` : codigo;
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
  <div class="acoes">
    <Button
      variant="secondary"
      href={$page.url.searchParams.get('origem') === 'edicao' && $page.url.searchParams.get('id')
        ? `/operacao/passagens?editar=${encodeURIComponent($page.url.searchParams.get('id') || '')}`
        : '/operacao/passagens'}>Voltar</Button
    >
    {#if item}
      <Button
        variant="secondary"
        href={`/operacao/passagens?editar=${encodeURIComponent($page.url.searchParams.get('id') || '')}&origem=comprovante`}
        >Editar</Button
      >
      <Button color="operacao" on:click={imprimir}>Imprimir / Salvar em PDF</Button>
      {#if item}
        <label class="modelo-select"
          >Modelo
          <select bind:value={modeloPdf}>
            <option value="padrao">Padrão</option>
            <option value="bilhete">Bilhete</option>
            <option value="moderno">Moderno</option>
          </select>
        </label>
      {/if}
    {/if}
  </div>
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
    </div>
    {#if modeloPdf === 'padrao'}
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
          {resumoRotas(item.trechos, aeroporto)}
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
                <small class="aviso-chegada">{avisoChegada(trecho.saida, trecho.chegada)}</small>
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
            ><td><strong>{nomePassageiroMaiusculo(passageiro.nome)}</strong></td><td
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
    <aside class="aviso-embarque" aria-label="Orientações de embarque">
      <strong>Atenção ao horário de seu embarque!</strong>
      <p>
        Apresente-se no aeroporto indicado com pelo menos 3 horas de antecedência para voos
        internacionais e 2 horas de antecedência para voos nacionais.
      </p>
      <p>
        <strong>
          Para um maior controle, baixe o aplicativo da companhia aérea e acompanhe a situação de
          seu voo.
        </strong>
      </p>
    </aside>
    <footer>
      {[...new Set(item.trechos.map((trecho) => trecho.companhia))].join(' / ')} — Reserva: {item.localizador}
    </footer>
    {:else}
    {@const cias = [...new Set(item.trechos.map((trecho) => trecho.companhia))].join(' / ')}
    <header class="bilhete-top">
      <div>
        <span class="bilhete-cia-linha">{cias} • Bilhete eletrônico</span>
        <h1 class="bilhete-titulo">Comprovante de Viagem</h1>
      </div>
    </header>
    <div class="bilhete-meta">
      <span>Passageiros: {resumoPassageiros(item.passageiros)}</span>
      {#if item.emissao}<span>• Emissão: {data(item.emissao, true)}</span>{/if}
    </div>
    {@const primeiro = item.trechos[0]}
    {@const ultimo = item.trechos[item.trechos.length - 1]}
    {@const conexoes = [...new Set(item.trechos.slice(0, -1).map((t) => t.destino))]}
    <section class="bilhete-rota-card">
      <div class="bilhete-rota-label">Rota da Viagem</div>
      <div class="bilhete-rota-grande">
        {primeiro ? `${cidade(primeiro.origem, primeiro.cidadeOrigem) || primeiro.origem} (${primeiro.origem})` : ''}
        →
        {ultimo ? `${cidade(ultimo.destino, ultimo.cidadeDestino) || ultimo.destino} (${ultimo.destino})` : ''}
      </div>
      {#if conexoes.length || primeiro}
        <div class="bilhete-rota-sub">
          {#if conexoes.length}Conexão via {conexoes.map((c) => `${cidade(c) || c} (${c})`).join(', ')} • {/if}
          {#if primeiro}{data(primeiro.saida, true)}{/if}
        </div>
      {/if}
    </section>
    <section class="bilhete-pnr-card">
      <div class="bilhete-pnr-label">Código de Reserva (PNR)</div>
      <strong class="bilhete-pnr-codigo">{item.localizador}</strong>
    </section>
    <h2>ITINERÁRIO DE VOO</h2>
    {#each item.trechos as trecho, i}
      <section class="bilhete-trecho">
        <div class="bilhete-trecho-top">
          <span>{tituloTrecho(item.trechos, i)}&nbsp;&nbsp;{data(trecho.saida, true)}</span>
          <strong>{trecho.companhia} • Voo {trecho.voo}</strong>
        </div>
        <div class="bilhete-trajeto">
          <div class="bilhete-local">
            <strong class="bilhete-codigo">{trecho.origem}</strong>
            <span>{cidade(trecho.origem, trecho.cidadeOrigem) || 'Cidade não informada'}</span>
            <span class="bilhete-quando">{data(trecho.saida)} • {horario(trecho.saida)}</span>
          </div>
          <div class="bilhete-meio">
            <span class="bilhete-voo-linha">Voo {trecho.voo}</span>
            <span class="bilhete-duracao">Duração: {trecho.duracao || 'Não informada'}</span>
            {#if avisoChegada(trecho.saida, trecho.chegada)}
              <small class="aviso-chegada">{avisoChegada(trecho.saida, trecho.chegada)}</small>
            {/if}
          </div>
          <div class="bilhete-local bilhete-destino">
            <strong class="bilhete-codigo">{trecho.destino}</strong>
            <span>{cidade(trecho.destino, trecho.cidadeDestino) || 'Cidade não informada'}</span>
            <span class="bilhete-quando">{data(trecho.chegada)} • {horario(trecho.chegada)}</span>
          </div>
        </div>
        <div class="bilhete-grade">
          <div class="bilhete-campo"><span class="rotulo">COMPANHIA</span><strong>{trecho.companhia}</strong></div>
          <div class="bilhete-campo"><span class="rotulo">CLASSE</span><strong>{trecho.classe || 'Não informada'}</strong></div>
          <div class="bilhete-campo"><span class="rotulo">TARIFA</span><strong>{trecho.tarifa?.trim() || '-'}</strong></div>
          <div class="bilhete-campo"><span class="rotulo">ASSENTOS</span><strong>{assentos(i)}</strong></div>
          <div class="bilhete-campo"><span class="rotulo">STATUS DO VOO</span><strong>{trecho.status || 'Não informado'}{trecho.status ? ' ✓' : ''}</strong></div>
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
            ><td><strong>{nomePassageiroMaiusculo(passageiro.nome)}</strong></td><td
              >{passageiro.tipo === 'ADT'
                ? 'Adulto'
                : passageiro.tipo === 'CHD'
                  ? 'Criança'
                  : passageiro.tipo === 'INF'
                    ? 'Infant'
                    : 'Não informado'}</td
            ><td>{passageiro.bilhete || 'Não informado'}</td><td
              >{passageiro.status || 'Não informado'}{passageiro.status ? ' ✓' : ''}</td
            ></tr
          >
        {/each}
      </tbody>
    </table>
    <aside class="aviso-embarque" aria-label="Orientações de embarque">
      <strong>Atenção ao horário de seu embarque!</strong>
      <p>
        Apresente-se no aeroporto indicado com pelo menos 3 horas de antecedência para voos
        internacionais e 2 horas de antecedência para voos nacionais.
      </p>
      <p>
        <strong>
          Para um maior controle, baixe o aplicativo da companhia aérea ({cias}) e acompanhe a
          situação de seu voo utilizando o código de reserva {item.localizador}.
        </strong>
      </p>
    </aside>
    <footer>{cias} • Reserva: {item.localizador}</footer>
    {:else if modeloPdf === 'moderno'}
    {@const cias = [...new Set(item.trechos.map((trecho) => trecho.companhia))].join(' / ')}
    {@const primeiro3 = item.trechos[0]}
    {@const ultimo3 = item.trechos[item.trechos.length - 1]}
    {@const conexoes3 = [...new Set(item.trechos.slice(0, -1).map((t) => t.destino))]}
    <div class="mod-doc">
      <header class="mod-cabecalho">
        <div class="mod-cia-linha">{cias.toUpperCase()} • BILHETE ELETRÔNICO</div>
        <h1 class="mod-titulo">COMPROVANTE DE VIAGEM</h1>
        <div class="mod-meta-linha">
          <span>&#128101; {resumoPassageiros(item.passageiros)}</span>
          {#if item.emissao}<span>&#128197; Emissão: {data(item.emissao, true)}</span>{/if}
        </div>
      </header>
      <div class="mod-cards-row">
        <section class="mod-info-card mod-rota-card">
          <div class="mod-card-label">ROTA DA VIAGEM</div>
          <div class="mod-rota-valor">
            {primeiro3 ? primeiro3.origem : ''}
            {#each conexoes3 as c}{' → ' + c}{/each}
            {ultimo3 ? ' → ' + ultimo3.destino : ''}
          </div>
          {#if primeiro3}<div class="mod-rota-data">{data(primeiro3.saida, true)}</div>{/if}
        </section>
        <section class="mod-info-card mod-pnr-card">
          <div class="mod-card-label">CÓDIGO DE RESERVA (PNR)</div>
          <strong class="mod-pnr-codigo">{item.localizador}</strong>
        </section>
      </div>
      <h2 class="mod-sec-titulo">ITINERÁRIO DE VOO</h2>
      {#each item.trechos as trecho, i}
        <section class="mod-trecho">
          <div class="mod-trecho-header">
            <span class="mod-trecho-badge">{tituloTrecho(item.trechos, i)}</span>
            <span class="mod-trecho-data">{data(trecho.saida, true)}</span>
            <span class="mod-trecho-cia">{trecho.companhia} • Voo {trecho.voo}</span>
          </div>
          <div class="mod-trajeto">
            <div class="mod-local">
              <strong class="mod-iata">{trecho.origem}</strong>
              <span class="mod-cidade-nome">{cidade(trecho.origem, trecho.cidadeOrigem) || 'Cidade não informada'}</span>
              <span class="mod-horario">{data(trecho.saida)} {horario(trecho.saida)}</span>
            </div>
            <div class="mod-seta-col">
              <div class="mod-linha-h"></div>
              <span class="mod-aviao">✈</span>
            </div>
            <div class="mod-local mod-local-destino">
              <strong class="mod-iata">{trecho.destino}</strong>
              <span class="mod-cidade-nome">{cidade(trecho.destino, trecho.cidadeDestino) || 'Cidade não informada'}</span>
              <span class="mod-horario">{data(trecho.chegada)} {horario(trecho.chegada)}</span>
              {#if avisoChegada(trecho.saida, trecho.chegada)}
                <small class="aviso-chegada">{avisoChegada(trecho.saida, trecho.chegada)}</small>
              {/if}
            </div>
          </div>
          <div class="mod-grade">
            <div class="mod-campo"><span class="mod-rotulo">COMPANHIA</span><strong>{trecho.companhia} {trecho.voo}</strong></div>
            <div class="mod-campo"><span class="mod-rotulo">CLASSE</span><strong>{trecho.classe || '—'}</strong></div>
            <div class="mod-campo"><span class="mod-rotulo">TARIFA</span><strong>{trecho.tarifa || '—'}</strong></div>
            <div class="mod-campo"><span class="mod-rotulo">ASSENTOS</span><strong>{assentos(i) || '—'}</strong></div>
            <div class="mod-campo"><span class="mod-rotulo">STATUS DO VOO</span><strong>{trecho.status || '—'}</strong></div>
          </div>
        </section>
      {/each}
      <h2 class="mod-sec-titulo">PASSAGEIROS E BILHETES ELETRÔNICOS</h2>
      <table class="mod-tabela">
        <thead>
          <tr>
            <th>Nome do passageiro</th><th>Tipo</th><th>Número do bilhete</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {#each item.passageiros as passageiro}
            <tr>
              <td><strong>{nomePassageiroMaiusculo(passageiro.nome)}</strong></td>
              <td>{passageiro.tipo === 'ADT' ? 'Adulto' : passageiro.tipo === 'CHD' ? 'Criança' : passageiro.tipo === 'INF' ? 'Infant' : 'Não informado'}</td>
              <td>{passageiro.bilhete || 'Não informado'}</td>
              <td>{passageiro.status || 'Não informado'}{passageiro.status ? ' ✓' : ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <aside class="mod-atencao">
        <strong>&#9888; Atenção ao horário de seu embarque!</strong>
        <p>Apresente-se no aeroporto indicado com pelo menos 3 horas de antecedência para voos internacionais e 2 horas de antecedência para voos nacionais.</p>
        <p><strong>Para um maior controle, baixe o aplicativo da companhia aérea ({cias}) e acompanhe a situação de seu voo utilizando o código de reserva {item.localizador}.</strong></p>
      </aside>
      <footer class="mod-rodape"><span>{cias} • Reserva: {item.localizador}</span><span class="mod-rodape-pag"></span></footer>
    </div>
    {/if}
  {/if}
</div>

<style>
  .comprovante {
    box-sizing: border-box;
    width: 100%;
    padding: 24px;
    color: #1F2937;
    background: white;
    font-family: Arial, sans-serif;
    font-size: 13px;
  }
  .acoes {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    margin-bottom: 20px;
  }
  .acoes p {
    color: #92400e;
  }
  .cabecalho {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
    border-bottom: 2px solid #243AA3;
    padding-bottom: 14px;
  }
  .cabecalho strong {
    color: #243AA3;
    font-size: 22px;
    text-transform: uppercase;
  }
  .cabecalho span {
    color: #6B7280;
    font-size: 14px;
    font-weight: bold;
    text-align: right;
  }
  .reserva {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    background: #EEF2F7;
    border: 1px solid #C5CED9;
    border-left: 4px solid #243AA3;
    border-radius: 4px;
    padding: 14px 18px;
    margin-top: 18px;
  }
  .rotulo {
    display: block;
    color: #6B7280;
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
    border-bottom: 1px solid #C5CED9;
    padding-bottom: 7px;
    margin: 20px 0 10px;
  }
  .trecho {
    border: 1px solid #C5CED9;
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
    background: #D0DAEA;
    color: #1B2C80;
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
    color: #243AA3;
    font-size: 22px;
  }
  .local p {
    margin-top: 5px;
    color: #6B7280;
  }
  .destino {
    text-align: right;
  }
  .duracao {
    display: flex;
    flex-direction: column;
    align-items: center;
    color: #6B7280;
    font-size: 10px;
    text-align: center;
  }
  .duracao span {
    display: flex;
    align-items: center;
    width: 110px;
    max-width: 100%;
    color: #243AA3;
    font-size: 18px;
  }
  .duracao span::before,
  .duracao span::after {
    content: '';
    flex: 1;
    height: 2px;
    background: #243AA3;
  }
  .aviso-chegada {
    color: #92400e;
    font-size: 10px;
    font-weight: 700;
    border: 1px solid #b45309;
    border-radius: 4px;
    padding: 3px 6px;
    margin-top: 4px;
  }
  .detalhes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 10px;
    border-top: 1px dashed #C5CED9;
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
    border-bottom: 1px solid #C5CED9;
    overflow-wrap: anywhere;
  }
  th {
    background: #D0DAEA;
    color: #1B2C80;
    font-size: 10px;
    text-transform: uppercase;
  }
  tr {
    break-inside: avoid;
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
  .aviso-embarque {
    background: #EEF2F7;
    border: 1px solid #C5CED9;
    border-radius: 4px;
    margin-top: 16px;
    padding: 14px 18px;
    break-inside: avoid;
  }
  footer {
    margin-top: 24px;
    color: #6B7280;
    font-size: 11px;
  }
  .modelo-select {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #4B5563;
  }
  .modelo-select select {
    border: 1px solid #C5CED9;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 13px;
    background: #fff;
    color: #1F2937;
  }
  .bilhete-top {
    padding-bottom: 14px;
    border-bottom: 2px solid #1B2C80;
  }
  .bilhete-cia-linha {
    display: block;
    color: #1B2C80;
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .bilhete-titulo {
    margin: 4px 0 0;
    color: #1B2C80;
    font-size: 24px;
    font-weight: bold;
  }
  .bilhete-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    margin-top: 10px;
    font-size: 12px;
    color: #4B5563;
  }
  .bilhete-rota-card {
    border: 1px solid #C5CED9;
    border-left: 4px solid #1B2C80;
    border-radius: 6px;
    background: #EEF2F7;
    padding: 14px 18px;
    margin-top: 16px;
    break-inside: avoid;
  }
  .bilhete-rota-label {
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #6B7280;
    margin-bottom: 6px;
  }
  .bilhete-rota-grande {
    font-size: 22px;
    font-weight: bold;
    color: #1B2C80;
  }
  .bilhete-rota-sub {
    margin-top: 6px;
    font-size: 12px;
    color: #4B5563;
  }
  .bilhete-pnr-card {
    border: 1px solid #C5CED9;
    border-radius: 6px;
    padding: 12px 18px;
    margin-top: 12px;
    display: flex;
    align-items: baseline;
    gap: 14px;
    break-inside: avoid;
  }
  .bilhete-pnr-label {
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #6B7280;
  }
  .bilhete-pnr-codigo {
    color: #1B2C80;
    font-size: 26px;
    letter-spacing: 2px;
  }
  .bilhete-trecho {
    border: 1px solid #C5CED9;
    border-radius: 8px;
    margin-bottom: 12px;
    overflow: hidden;
    break-inside: avoid;
  }
  .bilhete-trecho-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 14px;
    background: #D0DAEA;
    color: #1B2C80;
    font-size: 11px;
    font-weight: bold;
  }
  .bilhete-trajeto {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 12px;
    align-items: center;
    padding: 14px;
  }
  .bilhete-local > strong,
  .bilhete-local > span {
    display: block;
  }
  .bilhete-codigo {
    color: #1B2C80;
    font-size: 24px;
    letter-spacing: 1px;
  }
  .bilhete-local > span {
    color: #1F2937;
    font-size: 12px;
  }
  .bilhete-quando {
    color: #6B7280 !important;
    font-size: 11px !important;
  }
  .bilhete-destino {
    text-align: right;
  }
  .bilhete-meio {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    color: #6B7280;
    font-size: 10px;
    text-align: center;
  }
  .bilhete-voo-linha {
    font-weight: bold;
    color: #1B2C80;
  }
  .bilhete-duracao {
    font-weight: bold;
  }
  .bilhete-grade {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 10px;
    border-top: 1px dashed #C5CED9;
    padding: 10px 14px;
  }
  .bilhete-campo strong {
    display: block;
    font-size: 12px;
    color: #1F2937;
    overflow-wrap: anywhere;
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

  /* ─── Modelo Moderno ───────────────────────────────────────────────────── */
  .mod-doc {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    color: #1F2937;
  }
  .mod-cabecalho {
    border-top: 4px solid #1B2C80;
    border-bottom: 1px solid #C5CED9;
    padding: 18px 0 14px;
    margin-bottom: 18px;
    text-align: center;
  }
  .mod-cia-linha {
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 2px;
    color: #1B2C80;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .mod-titulo {
    font-size: 26px;
    font-weight: bold;
    color: #1B2C80;
    margin: 0 0 8px;
    line-height: 1.1;
  }
  .mod-meta-linha {
    font-size: 12px;
    color: #4B5563;
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
  }
  .mod-cards-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 20px;
  }
  .mod-info-card {
    border: 1.5px solid #C5CED9;
    border-radius: 8px;
    padding: 12px 14px;
  }
  .mod-card-label {
    font-size: 9px;
    font-weight: bold;
    letter-spacing: 1.5px;
    color: #6B7280;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .mod-rota-valor {
    font-size: 13px;
    font-weight: bold;
    color: #1B2C80;
    line-height: 1.4;
  }
  .mod-rota-data {
    font-size: 11px;
    color: #6B7280;
    margin-top: 4px;
  }
  .mod-pnr-codigo {
    display: block;
    font-size: 28px;
    font-weight: bold;
    color: #1B2C80;
    letter-spacing: 2px;
  }
  .mod-sec-titulo {
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #1B2C80;
    border-bottom: 1.5px solid #C5CED9;
    padding-bottom: 6px;
    margin: 20px 0 12px;
  }
  .mod-trecho {
    border: 1.5px solid #C5CED9;
    border-radius: 8px;
    margin-bottom: 12px;
    overflow: hidden;
    break-inside: avoid;
  }
  .mod-trecho-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    background: #EEF2F7;
  }
  .mod-trecho-badge {
    background: #1B2C80;
    color: white;
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 1px;
    padding: 3px 10px;
    border-radius: 20px;
    text-transform: uppercase;
  }
  .mod-trecho-data {
    font-size: 12px;
    color: #374151;
    font-weight: bold;
  }
  .mod-trecho-cia {
    font-size: 12px;
    color: #6B7280;
    margin-left: auto;
  }
  .mod-trajeto {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 10px;
    align-items: center;
    padding: 14px 14px 8px;
  }
  .mod-local {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .mod-local-destino {
    text-align: right;
    align-items: flex-end;
  }
  .mod-iata {
    font-size: 30px;
    font-weight: bold;
    color: #1B2C80;
    letter-spacing: 1px;
    line-height: 1;
  }
  .mod-cidade-nome {
    font-size: 11px;
    color: #374151;
    font-weight: 600;
  }
  .mod-horario {
    font-size: 11px;
    color: #6B7280;
  }
  .mod-seta-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .mod-linha-h {
    width: 60px;
    height: 1.5px;
    background: #243AA3;
  }
  .mod-aviao {
    font-size: 18px;
    color: #243AA3;
  }
  .mod-grade {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0;
    border-top: 1px solid #EEF2F7;
    padding: 10px 14px;
    background: #FAFBFD;
  }
  .mod-campo {
    padding: 4px 6px;
  }
  .mod-rotulo {
    display: block;
    font-size: 9px;
    font-weight: bold;
    letter-spacing: 1px;
    color: #9CA3AF;
    text-transform: uppercase;
    margin-bottom: 2px;
  }
  .mod-campo strong {
    font-size: 11px;
    color: #1F2937;
  }
  .mod-tabela {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-bottom: 16px;
  }
  .mod-tabela thead th {
    background: #1B2C80;
    color: white;
    font-weight: bold;
    text-align: left;
    padding: 8px 10px;
    font-size: 10px;
    letter-spacing: 0.5px;
  }
  .mod-tabela tbody td {
    padding: 8px 10px;
    border-bottom: 1px solid #EEF2F7;
    color: #374151;
    vertical-align: top;
  }
  .mod-tabela tbody tr:last-child td {
    border-bottom: 0;
  }
  .mod-atencao {
    background: #FEF9C3;
    border: 1.5px solid #FDE68A;
    border-radius: 8px;
    padding: 12px 14px;
    margin: 16px 0;
    font-size: 12px;
    break-inside: avoid;
  }
  .mod-atencao strong {
    display: block;
    color: #92400E;
    margin-bottom: 6px;
    font-size: 13px;
  }
  .mod-atencao p {
    margin: 4px 0;
    color: #374151;
  }
  .mod-rodape {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #9CA3AF;
    font-size: 10px;
    border-top: 1px solid #C5CED9;
    padding-top: 8px;
    margin-top: 16px;
  }
  @media print {
    .mod-trecho { break-inside: avoid; page-break-inside: avoid; }
    .mod-atencao { break-inside: avoid; page-break-inside: avoid; }
    .mod-cards-row { grid-template-columns: 1fr 1fr; }
    .mod-cabecalho { padding-top: 16px; padding-bottom: 10px; margin-bottom: 14px; }
    .mod-rodape-pag::after { content: "Pág. " counter(page); }
  }
</style>
