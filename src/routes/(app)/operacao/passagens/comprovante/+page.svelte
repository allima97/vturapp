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

  function capitalizar(texto: string) {
    return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
  }

  function dataHoraCurta(value: string) {
    const h = horario(value);
    return [data(value), h].filter(Boolean).join(' • ');
  }

  function duracaoFormatada(value: string) {
    const v = (value || '').trim();
    const m = /^(\d{1,2})\s*[:h]\s*(\d{2})/i.exec(v);
    return m ? `${m[1].padStart(2, '0')}h${m[2]}` : v;
  }

  function rotaModerno(trechos: TrechoPassagem[]) {
    const primeiro = trechos[0];
    const ultimo = trechos[trechos.length - 1];
    if (!primeiro || !ultimo) return { rota: '', detalhe: '' };
    const idaVolta =
      trechos.length > 1 && ultimo.destino.toUpperCase() === primeiro.origem.toUpperCase();
    const fimIda = idaVolta ? Math.ceil(trechos.length / 2) - 1 : trechos.length - 1;
    const destino = trechos[fimIda];
    const conexoes = [
      ...new Set(trechos.slice(0, fimIda).map((t) => aeroporto(t.destino, t.cidadeDestino)))
    ];
    const rota = `${aeroporto(primeiro.origem, primeiro.cidadeOrigem)} ${idaVolta ? '⇄' : '→'} ${aeroporto(destino.destino, destino.cidadeDestino)}`;
    const detalhe = [
      conexoes.length ? `Conexão via ${conexoes.join(', ')}` : idaVolta ? '' : 'Voo direto',
      idaVolta ? 'Ida e volta' : '',
      capitalizar(data(primeiro.saida, true))
    ]
      .filter(Boolean)
      .join(' • ');
    return { rota, detalhe };
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
    {:else if modeloPdf === 'bilhete'}
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
    {@const rotaInfo = rotaModerno(item.trechos)}
    <div class="mod-doc">
      <div class="mod-kicker-bar"><span></span><span></span><span></span></div>
      <header class="mod-cabecalho">
        <div class="mod-cia-linha">{cias} • Bilhete Eletrônico</div>
        <h1 class="mod-titulo">COMPROVANTE DE VIAGEM</h1>
        <div class="mod-meta-linha">
          <span>
            <svg class="mod-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            <b>Passageiros:</b> {resumoPassageiros(item.passageiros)}
          </span>
          {#if item.emissao}
            <span class="mod-meta-sep">•</span>
            <span>
              <svg class="mod-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              <b>Emissão:</b> {data(item.emissao, true)}
            </span>
          {/if}
        </div>
      </header>
      <section class="mod-resumo">
        <div class="mod-resumo-rota">
          <div class="mod-card-label">Rota da Viagem</div>
          <div class="mod-rota-valor">{rotaInfo.rota}</div>
          {#if rotaInfo.detalhe}<div class="mod-rota-data">{rotaInfo.detalhe}</div>{/if}
        </div>
        <div class="mod-pnr-card">
          <div class="mod-card-label">Código de Reserva (PNR)</div>
          <strong class="mod-pnr-codigo">{item.localizador}</strong>
        </div>
      </section>
      <h2 class="mod-sec-titulo">Itinerário de Voo</h2>
      {#each item.trechos as trecho, i}
        <section class="mod-trecho">
          <div class="mod-trecho-header">
            <span class="mod-trecho-badge">{tituloTrecho(item.trechos, i)}</span>
            <span class="mod-trecho-data">{capitalizar(data(trecho.saida, true))}</span>
            <span class="mod-trecho-cia">{trecho.companhia} • Voo {trecho.voo}</span>
          </div>
          <div class="mod-trajeto">
            <div class="mod-local">
              <strong class="mod-iata">{trecho.origem}</strong>
              <span class="mod-cidade-nome">{cidade(trecho.origem, trecho.cidadeOrigem) || 'Cidade não informada'}</span>
              <span class="mod-horario">{dataHoraCurta(trecho.saida)}</span>
            </div>
            <div class="mod-centro">
              <span class="mod-voo-pill">Voo {trecho.voo}</span>
              <span class="mod-duracao">Duração: {duracaoFormatada(trecho.duracao) || 'Não informada'}</span>
            </div>
            <div class="mod-local mod-local-destino">
              <strong class="mod-iata">{trecho.destino}</strong>
              <span class="mod-cidade-nome">{cidade(trecho.destino, trecho.cidadeDestino) || 'Cidade não informada'}</span>
              <span class="mod-horario">{dataHoraCurta(trecho.chegada)}</span>
              {#if avisoChegada(trecho.saida, trecho.chegada)}
                <small class="aviso-chegada">{avisoChegada(trecho.saida, trecho.chegada)}</small>
              {/if}
            </div>
          </div>
          <div class="mod-grade">
            <div class="mod-campo"><span class="mod-rotulo">Companhia</span><strong>{trecho.companhia.toUpperCase()}</strong></div>
            <div class="mod-campo"><span class="mod-rotulo">Classe</span><strong>{trecho.classe || '—'}</strong></div>
            <div class="mod-campo"><span class="mod-rotulo">Tarifa</span><strong>{trecho.tarifa || '—'}</strong></div>
            <div class="mod-campo"><span class="mod-rotulo">Assentos</span><strong>{assentos(i) || '—'}</strong></div>
            <div class="mod-campo"><span class="mod-rotulo">Status do Voo</span><strong>{trecho.status ? `✓ ${trecho.status}` : '—'}</strong></div>
          </div>
        </section>
      {/each}
      <h2 class="mod-sec-titulo">Passageiros e Bilhetes Eletrônicos</h2>
      <table class="mod-tabela">
        <thead>
          <tr>
            <th>Nome do passageiro</th><th>Tipo</th><th>Número do bilhete</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {#each item.passageiros as passageiro}
            <tr>
              <td class="mod-pax-nome">{nomePassageiroMaiusculo(passageiro.nome)}</td>
              <td>{passageiro.tipo === 'ADT' ? 'Adulto' : passageiro.tipo === 'CHD' ? 'Criança' : passageiro.tipo === 'INF' ? 'Infant' : 'Não informado'}</td>
              <td class="mod-bilhete">{passageiro.bilhete || 'Não informado'}</td>
              <td class="mod-pax-status">{passageiro.status ? `✓ ${passageiro.status}` : 'Não informado'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <aside class="mod-atencao">
        <div class="mod-atencao-titulo">
          <svg class="mod-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          Atenção ao horário de seu embarque!
        </div>
        <ul>
          <li>Apresente-se no aeroporto indicado com pelo menos <b>3 horas de antecedência</b> para voos internacionais e <b>2 horas de antecedência</b> para voos nacionais.</li>
          <li>Para um maior controle, baixe o aplicativo da companhia aérea (<b>{cias}</b>) e acompanhe a situação de seu voo utilizando o código de reserva <b>{item.localizador}</b>.</li>
        </ul>
      </aside>
      <footer class="mod-rodape"><span>{cias.toUpperCase()} • Reserva: {item.localizador}</span></footer>
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
  :global(.bilhete-top) {
    padding-bottom: 14px;
    border-bottom: 2px solid #1B2C80;
  }
  :global(.bilhete-cia-linha) {
    display: block;
    color: #1B2C80;
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  :global(.bilhete-titulo) {
    margin: 4px 0 0;
    color: #1B2C80;
    font-size: 24px;
    font-weight: bold;
  }
  :global(.bilhete-meta) {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    margin-top: 10px;
    font-size: 12px;
    color: #4B5563;
  }
  :global(.bilhete-rota-card) {
    border: 1px solid #C5CED9;
    border-left: 4px solid #1B2C80;
    border-radius: 6px;
    background: #EEF2F7;
    padding: 14px 18px;
    margin-top: 16px;
    break-inside: avoid;
  }
  :global(.bilhete-rota-label) {
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #6B7280;
    margin-bottom: 6px;
  }
  :global(.bilhete-rota-grande) {
    font-size: 22px;
    font-weight: bold;
    color: #1B2C80;
  }
  :global(.bilhete-rota-sub) {
    margin-top: 6px;
    font-size: 12px;
    color: #4B5563;
  }
  :global(.bilhete-pnr-card) {
    border: 1px solid #C5CED9;
    border-radius: 6px;
    padding: 12px 18px;
    margin-top: 12px;
    display: flex;
    align-items: baseline;
    gap: 14px;
    break-inside: avoid;
  }
  :global(.bilhete-pnr-label) {
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #6B7280;
  }
  :global(.bilhete-pnr-codigo) {
    color: #1B2C80;
    font-size: 26px;
    letter-spacing: 2px;
  }
  :global(.bilhete-trecho) {
    border: 1px solid #C5CED9;
    border-radius: 8px;
    margin-bottom: 12px;
    overflow: hidden;
    break-inside: avoid;
  }
  :global(.bilhete-trecho-top) {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 14px;
    background: #D0DAEA;
    color: #1B2C80;
    font-size: 11px;
    font-weight: bold;
  }
  :global(.bilhete-trajeto) {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 12px;
    align-items: center;
    padding: 14px;
  }
  :global(.bilhete-local > strong),
  :global(.bilhete-local > span) {
    display: block;
  }
  :global(.bilhete-codigo) {
    color: #1B2C80;
    font-size: 24px;
    letter-spacing: 1px;
  }
  :global(.bilhete-local > span) {
    color: #1F2937;
    font-size: 12px;
  }
  :global(.bilhete-quando) {
    color: #6B7280 !important;
    font-size: 11px !important;
  }
  :global(.bilhete-destino) {
    text-align: right;
  }
  :global(.bilhete-meio) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    color: #6B7280;
    font-size: 10px;
    text-align: center;
  }
  :global(.bilhete-voo-linha) {
    font-weight: bold;
    color: #1B2C80;
  }
  :global(.bilhete-duracao) {
    font-weight: bold;
  }
  :global(.bilhete-grade) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 10px;
    border-top: 1px dashed #C5CED9;
    padding: 10px 14px;
  }
  :global(.bilhete-campo strong) {
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

  /* ─── Modelo Moderno (canônico — mesmos tokens de Orçamento/Roteiro) ───── */
  .mod-doc { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #1F2937; }
  .mod-doc, .mod-doc :global(*) { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .mod-kicker-bar { display: flex; width: 210px; height: 3px; margin: 0 auto 12px; overflow: hidden; }
  .mod-kicker-bar span { flex: 1; }
  .mod-kicker-bar span:nth-child(1) { background: #1B2C80; }
  .mod-kicker-bar span:nth-child(2) { background: #4472C4; }
  .mod-kicker-bar span:nth-child(3) { background: #9AAAC2; }
  .mod-cabecalho { text-align: center; margin-bottom: 22px; }
  .mod-cia-linha { font-size: 12px; font-weight: bold; letter-spacing: 3px; color: #4472C4; text-transform: uppercase; margin-bottom: 6px; }
  .mod-titulo { font-size: 32px; font-weight: bold; color: #1B2C80; margin: 0 0 10px; line-height: 1.15; letter-spacing: .3px; }
  .mod-meta-linha { font-size: 13px; color: #4B5563; display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; align-items: center; }
  .mod-meta-linha b { color: #1F2937; }
  .mod-meta-sep { color: #6B7280; }
  .mod-meta-linha > span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .mod-meta-linha > span.mod-meta-sep { gap: 0; }
  .mod-ico { display: inline-block; flex-shrink: 0; width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .mod-resumo { display: flex; align-items: center; gap: 24px; background: #D0DAEA; border: 1px solid #9AAAC2; border-radius: 10px; padding: 18px 22px; margin-bottom: 16px; break-inside: avoid; }
  .mod-resumo-rota { flex: 1; min-width: 0; }
  .mod-card-label { font-size: 11px; font-weight: bold; letter-spacing: 1.5px; color: #4472C4; text-transform: uppercase; margin-bottom: 6px; }
  .mod-rota-valor { font-size: 18px; font-weight: bold; color: #1B2C80; line-height: 1.35; }
  .mod-rota-data { font-size: 12.5px; color: #4B5563; margin-top: 6px; line-height: 1.5; }
  .mod-pnr-card { flex: 0 0 225px; background: #fff; border: 1.5px solid #4472C4; border-radius: 8px; padding: 12px 14px; text-align: center; }
  .mod-pnr-card .mod-card-label { margin-bottom: 4px; }
  .mod-pnr-codigo { display: block; font-size: 28px; font-weight: bold; color: #1B2C80; letter-spacing: 2px; line-height: 1.2; }
  .mod-sec-titulo { font-size: 18px; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase; color: #1B2C80; text-align: center; border-bottom: 3px solid #D0DAEA; padding-bottom: 10px; margin: 20px 0 12px; break-after: avoid; page-break-after: avoid; }
  .mod-trecho { border: 1px solid #9AAAC2; border-radius: 10px; margin-bottom: 18px; overflow: hidden; background: #fff; break-inside: avoid; page-break-inside: avoid; }
  .mod-trecho-header { display: flex; align-items: center; gap: 14px; padding: 9px 16px; background: #D0DAEA; border-bottom: 1px solid #9AAAC2; }
  .mod-trecho-badge { background: #1B2C80; color: #fff; font-size: 12px; font-weight: bold; letter-spacing: 1px; padding: 3px 10px; border-radius: 4px; text-transform: uppercase; }
  .mod-trecho-data { font-size: 13.5px; color: #1B2C80; font-weight: bold; }
  .mod-trecho-cia { font-size: 13.5px; color: #1B2C80; font-weight: bold; margin-left: auto; }
  .mod-trajeto { display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: stretch; }
  .mod-local { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; }
  .mod-local-destino { text-align: right; align-items: flex-end; }
  .mod-iata { font-size: 32px; font-weight: bold; color: #1B2C80; letter-spacing: 1px; line-height: 1.05; }
  .mod-cidade-nome { font-size: 14px; color: #4472C4; font-weight: bold; }
  .mod-horario { font-size: 13.5px; color: #1F2937; font-weight: bold; margin-top: 4px; }
  .mod-centro { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 10px; padding: 26px 10px 14px; border-left: 1px dashed #C5CED9; border-right: 1px dashed #C5CED9; }
  .mod-voo-pill { background: #D0DAEA; border: 1px solid #9AAAC2; border-radius: 4px; padding: 5px 10px; font-size: 14px; font-weight: bold; color: #1B2C80; }
  .mod-duracao { font-size: 13px; font-weight: bold; color: #4B5563; }
  .mod-grade { display: grid; grid-template-columns: 1.55fr 1fr 1fr 1.4fr 1.05fr; gap: 0 10px; align-items: center; border-top: 1px solid #C5CED9; padding: 12px 14px; background: #F7F9FC; }
  .mod-campo { display: flex; flex-direction: column; gap: 6px; }
  .mod-rotulo { display: block; font-size: 12px; font-weight: bold; letter-spacing: 1px; color: #4B5563; text-transform: uppercase; }
  .mod-campo strong { font-size: 13px; color: #1F2937; }
  .mod-tabela { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 14px; margin-bottom: 18px; }
  .mod-tabela thead th { background: #D0DAEA; color: #1B2C80; font-weight: bold; text-align: left; padding: 12px 14px; font-size: 13px; letter-spacing: .5px; text-transform: uppercase; }
  .mod-tabela thead th:first-child { border-top-left-radius: 8px; }
  .mod-tabela thead th:last-child { border-top-right-radius: 8px; }
  .mod-tabela tbody td { padding: 12px 14px; border-bottom: 1px solid #EEF2F7; color: #1F2937; vertical-align: middle; }
  .mod-tabela tbody tr:nth-child(even) td { background: #F7F9FC; }
  .mod-tabela tbody tr { break-inside: avoid; page-break-inside: avoid; }
  .mod-pax-nome, .mod-pax-status { font-weight: bold; }
  .mod-bilhete { font-family: 'Courier New', Courier, monospace; font-weight: bold; letter-spacing: .5px; }
  .mod-atencao { background: #F7F9FC; border: 1px solid #C5CED9; border-left: 4px solid #1B2C80; border-radius: 8px; padding: 14px 18px; margin: 16px 0; font-size: 13.5px; break-inside: avoid; page-break-inside: avoid; }
  .mod-atencao-titulo { display: flex; align-items: center; gap: 4px; font-size: 14px; font-weight: bold; letter-spacing: .8px; color: #1B2C80; text-transform: uppercase; margin-bottom: 8px; }
  .mod-atencao ul { margin: 0; padding-left: 20px; }
  .mod-atencao li { color: #1F2937; line-height: 1.55; margin-bottom: 4px; }
  .mod-atencao b { color: #1F2937; }
  .mod-rodape { display: flex; justify-content: space-between; align-items: center; color: #6B7280; font-size: 12px; border-top: 1px solid #C5CED9; padding-top: 8px; margin-top: 24px; }
  @media print {
    .mod-trecho, .mod-atencao, .mod-resumo { break-inside: avoid; page-break-inside: avoid; }
  }
</style>
