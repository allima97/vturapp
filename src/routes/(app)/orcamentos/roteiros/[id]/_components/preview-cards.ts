import { escapeHtml } from '$lib/utils/html';
import { quoteCheckIcon, serviceIconSvg } from '$lib/quote/pdfIcons';
import { nomeCidadeNoPdf, requiresPrintContinuation } from '$lib/utils/printLayout';
import { diasItem, resumoInformacoesVeiculo } from '$lib/quote/detalhesItem';
import type { QuoteFlightSegment } from '$lib/quote/flights';
import type { RotHotel, RotPasseio, RotPasseioDetalhes } from './tipos';

export { renderPreviewFlights } from '$lib/quote/printFlights';

type FormatDate = (value: string | null | undefined) => string;

function cityTitle(city: string) {
  return `<div class="roteiro-card-city">${escapeHtml(nomeCidadeNoPdf(city))}</div>`;
}

function iconeDoPasseio(tipo: string) {
  const nome = tipo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (nome.includes('seguro')) return 'seguro';
  if (nome.includes('ingresso')) return 'ingresso';
  if (nome.includes('transfer')) return 'transfer';
  if (nome.includes('show')) return 'show';
  if (nome.includes('trem') || nome.includes('ferro')) return 'trem';
  if (nome.includes('carro')) return 'aluguel_carro';
  return 'passeio';
}

export function buildRoteiroCardSection(
  title: string,
  content: string,
  sectionClass = '',
  subtitle = ''
) {
  if (!content.trim()) return '';
  const subtitulo = subtitle
    ? `<span class="roteiro-print-subtitle">${escapeHtml(subtitle)}</span>`
    : '';
  return `<section class="roteiro-print-section ${escapeHtml(sectionClass)}"><table class="roteiro-print-table"><thead><tr><th><h2 class="rot-sh">${escapeHtml(title)}${subtitulo}</h2></th></tr></thead><tbody>${content}</tbody></table></section>`;
}

function text(value: string | null | undefined) {
  return String(value || '').trim();
}

function groupByCity<T extends { cidade: string }>(items: T[], fallback: string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const city = text(item.cidade) || fallback;
    const group = groups.get(city) || [];
    group.push(item);
    groups.set(city, group);
  }
  return groups;
}

function card(content: string, source: string) {
  const longo = requiresPrintContinuation(source) ? ' roteiro-card--long' : '';
  return `<tr class="${longo.trim()}"><td><article class="roteiro-card${longo}">${content}</article></td></tr>`;
}

function conector() {
  return `<span class="md">${`<span class="lni"><span class="ln" style="width:50px"></span></span>`}</span>`;
}

function chip(label: string) {
  const value = text(label);
  if (!value || value === '-') return '';
  return `<div class="chks"><div class="chk">${quoteCheckIcon}<span>${escapeHtml(value)}</span></div></div>`;
}

export function renderPreviewHotels(items: RotHotel[], formatDate: FormatDate) {
  return Array.from(groupByCity(items, 'Hotéis'), ([city, hotels]) =>
    hotels
      .map((hotel) => {
        const start = formatDate(hotel.data_inicio);
        const end = formatDate(hotel.data_fim);
        const noites = hotel.noites && hotel.noites > 0 ? hotel.noites : 0;
        const kicker = noites ? `HOTEL · ${noites} ${noites === 1 ? 'NOITE' : 'NOITES'}` : 'HOTEL';
        const checkin = start ? `Check-in: ${start}` : '';
        const checkout = end ? `Check-out: ${end}` : '';
        const estadia =
          checkin && checkout
            ? `<div class="rtf rota"><span class="lg"><span class="rt rota">${escapeHtml(checkin)}</span></span>${conector()}<span class="lg"><span class="rt rota">${escapeHtml(checkout)}</span></span></div>`
            : checkin || checkout
              ? `<div class="rt rota">${escapeHtml(checkin || checkout)}</div>`
              : '';
        const detalhe = [text(hotel.apto), text(hotel.endereco)].filter(Boolean).join(' · ');
        const content = [
          `<div class="rot-hotel"><div>${serviceIconSvg('hotel')}</div><div>`,
          cityTitle(city),
          text(hotel.hotel)
            ? `<div class="rot-item-title"><b>${escapeHtml(text(hotel.hotel))}</b></div>`
            : '',
          `<div class="lb">${escapeHtml(kicker)}</div>`,
          estadia,
          detalhe ? `<div class="mu sm">${escapeHtml(detalhe)}</div>` : '',
          chip(text(hotel.regime)),
          `</div></div>`
        ].join('');
        return card(
          content,
          [city, hotel.hotel, hotel.endereco, hotel.apto, hotel.regime].join('\n')
        );
      })
      .join('')
  ).join('');
}

export type CategoriaPasseioPdf = 'carro' | 'trem' | 'seguro' | 'geral';

export function categoriaPasseioPdf(tipo: string): CategoriaPasseioPdf {
  const nome = tipo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (nome.includes('carro')) return 'carro';
  if (nome.includes('trem') || nome.includes('ferro')) return 'trem';
  if (nome.includes('seguro')) return 'seguro';
  return 'geral';
}

function detalhesPasseio(item: RotPasseio): RotPasseioDetalhes {
  const raw = item.detalhes;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // detalhes inválido — ignora
    }
  }
  return { incluidos: [], segmentos: [] };
}

function passageirosTexto(item: RotPasseio) {
  const partes: string[] = [];
  const adultos = Number(item.qtd_adultos) || 0;
  const criancas = Number(item.qtd_criancas) || 0;
  if (adultos > 0) partes.push(`${adultos} ${adultos === 1 ? 'adulto' : 'adultos'}`);
  if (criancas > 0) partes.push(`${criancas} ${criancas === 1 ? 'criança' : 'crianças'}`);
  return partes.join(' · ');
}

function chipsHtml(itens: string[]) {
  const limpos = itens.map(text).filter(Boolean);
  if (!limpos.length) return '';
  return `<div class="chks">${limpos
    .map((item) => `<div class="chk">${quoteCheckIcon}<span>${escapeHtml(item)}</span></div>`)
    .join('')}</div>`;
}

function periodoTexto(item: RotPasseio, formatDate: FormatDate) {
  const start = formatDate(item.data_inicio);
  const end = formatDate(item.data_fim);
  if (start && end && start !== end) return `${start} a ${end}`;
  return start || end || '';
}

export function renderPreviewCarros(items: RotPasseio[], formatDate: FormatDate) {
  return Array.from(groupByCity(items, 'Aluguel de carro'), ([city, carros]) =>
    carros
      .map((item) => {
        const detalhes = detalhesPasseio(item);
        const dias = diasItem('aluguel_carro', item.data_inicio, item.data_fim);
        const tituloBase = text(item.passeio) || 'Aluguel de carro';
        const cambio = text(detalhes.cambio);
        const titulo =
          cambio && !tituloBase.toLowerCase().includes(cambio.toLowerCase())
            ? `${tituloBase} ${cambio.toLowerCase()}`
            : tituloBase;
        const kicker = [
          'CARRO',
          dias != null && dias > 0 ? `${dias} ${dias === 1 ? 'DIÁRIA' : 'DIÁRIAS'}` : ''
        ]
          .filter(Boolean)
          .join(' · ');
        const retirada = nomeCidadeNoPdf(city);
        const devolucao = nomeCidadeNoPdf(text(detalhes.cidade_devolucao));
        const grupo = (
          cidade: string,
          loja: string,
          rotulo: string,
          data: string,
          hora: string
        ) => {
          const tituloGrupo = [cidade, loja].filter(Boolean).join(' · ');
          const info = data ? `${rotulo}: ${data}${hora ? ` às ${hora}` : ''}` : '';
          return `<span class="lg"><span class="rt rota">${escapeHtml(tituloGrupo)}</span>${info ? `<span class="ct">${escapeHtml(info)}</span>` : ''}</span>`;
        };
        const rota =
          retirada || devolucao
            ? `<div class="rtf rota">${grupo(retirada, text(detalhes.loja_retirada), 'Retirada', formatDate(item.data_inicio), text(detalhes.hora_retirada))}${conector()}${grupo(devolucao, text(detalhes.loja_devolucao), 'Devolução', formatDate(item.data_fim), text(detalhes.hora_devolucao))}</div>`
            : '';
        const veiculo = resumoInformacoesVeiculo({
          assentos: detalhes.assentos ?? '',
          portas: detalhes.portas ?? '',
          malas: detalhes.malas ?? '',
          combustivel: detalhes.combustivel ?? ''
        });
        const linhaCinza =
          [text(detalhes.locadora), veiculo].filter(Boolean).join(' · ') || 'Aluguel de carro';
        const quantidade = Number(detalhes.quantidade) || 0;
        const chips = chipsHtml([
          ...(detalhes.incluidos ?? []),
          quantidade > 0 ? `${quantidade} ${quantidade === 1 ? 'carro' : 'carros'}` : ''
        ]);
        const content = [
          `<div class="rot-hotel"><div>${serviceIconSvg('aluguel_carro')}</div><div>`,
          cityTitle(city),
          `<div class="rot-item-title"><b>${escapeHtml(titulo)}</b></div>`,
          `<div class="lb">${escapeHtml(kicker)}</div>`,
          rota,
          `<div class="mu sm">${escapeHtml(linhaCinza)}</div>`,
          chips,
          `</div></div>`
        ].join('');
        return card(content, [city, item.passeio, detalhes.locadora, linhaCinza].join('\n'));
      })
      .join('')
  ).join('');
}

function codigoLocal(value: string) {
  const token = text(value).split(',')[0].trim();
  return /^[A-Za-z]{3}$/.test(token) ? token.toUpperCase() : '';
}

function ladoTrem(sigla: string, hora: string, info: string) {
  return `<span class="lg"><span><b>${escapeHtml(sigla)}</b>${hora ? ` <span class="mu">· ${escapeHtml(hora)}</span>` : ''}</span>${info ? `<span class="ct">${escapeHtml(info)}</span>` : ''}</span>`;
}

function pernaTrem(segmento: QuoteFlightSegment, formatDate: FormatDate) {
  const [routeFrom = '', routeTo = ''] = text(segmento.trecho).split(/\s*(?:→|->)\s*|\s+-\s+/);
  const fromCode = codigoLocal(segmento.aeroporto_saida);
  const toCode = codigoLocal(segmento.aeroporto_chegada);
  const fromCity = nomeCidadeNoPdf(text(segmento.aeroporto_saida) || routeFrom);
  const toCity = nomeCidadeNoPdf(text(segmento.aeroporto_chegada) || routeTo);
  const from = fromCode || fromCity || '—';
  const to = toCode || toCity || '—';
  const saida = formatDate(segmento.data_voo);
  const chegada = formatDate(segmento.data_fim || segmento.data_voo);
  const horaSaida = text(segmento.hora_saida);
  const horaChegada = text(segmento.hora_chegada);
  const infoSaida = [fromCity && fromCity.toUpperCase() !== from ? fromCity : '', saida]
    .filter(Boolean)
    .join(' – ');
  const infoChegada = [toCity && toCity.toUpperCase() !== to ? toCity : '', chegada]
    .filter(Boolean)
    .join(' – ');
  const meio = [text(segmento.numero_voo), text(segmento.cia_aerea), text(segmento.tarifa_nome)]
    .filter(Boolean)
    .join(' · ');
  return `<div class="rtf">${ladoTrem(from, horaSaida, infoSaida)}<span class="md">${meio ? `<span>${escapeHtml(meio)}</span>` : ''}${conector()}</span>${ladoTrem(to, horaChegada, infoChegada)}</div>`;
}

export function renderPreviewTrens(items: RotPasseio[], formatDate: FormatDate) {
  return Array.from(groupByCity(items, 'Trem'), ([city, trens]) =>
    trens
      .map((item) => {
        const detalhes = detalhesPasseio(item);
        const segmentos = Array.isArray(detalhes.segmentos) ? detalhes.segmentos : [];
        const titulo = text(item.passeio) || 'Trem';
        const periodo = periodoTexto(item, formatDate);
        const pernas = segmentos.map((seg) => pernaTrem(seg, formatDate)).join('');
        const chips = chipsHtml([
          passageirosTexto(item),
          ...segmentos.map((seg) =>
            [text(seg.classe_reserva), text(seg.assentos) ? `Assentos ${text(seg.assentos)}` : '']
              .filter(Boolean)
              .join(' · ')
          )
        ]);
        const content = [
          `<div class="rot-hotel"><div>${serviceIconSvg('trem')}</div><div>`,
          cityTitle(city),
          `<div class="rot-item-title"><b>${escapeHtml(titulo)}</b></div>`,
          `<div class="lb">TREMO</div>`,
          pernas || (periodo ? `<p class="meta">${escapeHtml(periodo)}</p>` : ''),
          periodo && pernas ? `<p class="meta">${escapeHtml(periodo)}</p>` : '',
          chips,
          `</div></div>`
        ].join('');
        return card(content, [city, item.passeio, ...segmentos.map((s) => s.trecho)].join('\n'));
      })
      .join('')
  ).join('');
}

export function renderPreviewSeguros(items: RotPasseio[], formatDate: FormatDate) {
  return Array.from(groupByCity(items, 'Seguro Viagem'), ([city, seguros]) =>
    seguros
      .map((item) => {
        const titulo = text(item.passeio) || 'Seguro Viagem';
        const periodo = periodoTexto(item, formatDate);
        const passageiros = passageirosTexto(item);
        const linhaCinza = [text(item.fornecedor), passageiros].filter(Boolean).join(' · ');
        const content = [
          `<div class="rot-hotel"><div>${serviceIconSvg('seguro')}</div><div>`,
          cityTitle(city),
          `<div class="rot-item-title"><b>${escapeHtml(titulo)}</b></div>`,
          `<div class="lb">SEGURO VIAGEM</div>`,
          periodo ? `<p class="meta">${escapeHtml(periodo)}</p>` : '',
          linhaCinza ? `<div class="mu sm">${escapeHtml(linhaCinza)}</div>` : '',
          text(item.ingressos) ? `<p>${escapeHtml(text(item.ingressos))}</p>` : '',
          `</div></div>`
        ].join('');
        return card(content, [city, item.passeio, item.fornecedor].join('\n'));
      })
      .join('')
  ).join('');
}

export function renderPreviewPasseios(items: RotPasseio[], formatDate: FormatDate) {
  return Array.from(groupByCity(items, 'Serviços'), ([city, passeios]) =>
    passeios
      .map((item) => {
        const start = formatDate(item.data_inicio);
        const end = formatDate(item.data_fim);
        const date = start && end && start !== end ? `${start} a ${end}` : start || end || '-';
        const kicker = text(item.tipo) || 'Passeio';
        return card(
          [
            `<div class="rot-hotel"><div>${serviceIconSvg(iconeDoPasseio(kicker))}</div><div>`,
            cityTitle(city),
            `<div class="lb">${escapeHtml(kicker.toUpperCase())}</div>`,
            text(item.passeio)
              ? `<div class="rot-item-title"><b>${escapeHtml(text(item.passeio))}</b></div>`
              : '',
            date && date !== '-' ? `<p class="meta">${escapeHtml(date)}</p>` : '',
            text(item.ingressos) ? `<p>${escapeHtml(text(item.ingressos))}</p>` : '',
            `</div></div>`
          ].join(''),
          [city, item.passeio, item.ingressos].join('\n')
        );
      })
      .join('')
  ).join('');
}
