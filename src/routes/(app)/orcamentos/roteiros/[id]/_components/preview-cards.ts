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

function chipsHtml(itens: string[]) {
  const vistos = new Set<string>();
  const limpos = itens.map(text).filter((item) => {
    const key = item.toLowerCase();
    if (!item || vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
  if (!limpos.length) return '';
  return `<div class="chks">${limpos
    .map((item) => `<div class="chk">${quoteCheckIcon}<span>${escapeHtml(item)}</span></div>`)
    .join('')}</div>`;
}

function passageirosChipText(adultos: number, criancas: number, infant: number) {
  const partes: string[] = [];
  if (adultos > 0) partes.push(`${adultos} ${adultos === 1 ? 'adulto' : 'adultos'}`);
  if (criancas > 0) partes.push(`${criancas} ${criancas === 1 ? 'criança' : 'crianças'}`);
  if (infant > 0) partes.push(`${infant} ${infant === 1 ? 'infant' : 'infants'}`);
  return partes.join(' e ');
}

function etiquetasCarro(labels: string[]) {
  const sigla = /^[A-Z0-9]{2,5}$/;
  const frase = (value: string) =>
    value
      .split(/\s+/)
      .map((word, index) =>
        sigla.test(word)
          ? word
          : index === 0
            ? word.charAt(0).toUpperCase() + word.slice(1).toLocaleLowerCase('pt-BR')
            : word.toLocaleLowerCase('pt-BR')
      )
      .join(' ');
  const tags: string[] = [];
  const siglas: string[] = [];
  const flush = () => {
    if (siglas.length) tags.push(siglas.splice(0).join(' + '));
  };
  for (const label of labels) {
    const value = text(label);
    if (!value) continue;
    if (sigla.test(value)) {
      siglas.push(value);
      continue;
    }
    flush();
    tags.push(frase(value));
  }
  flush();
  return tags;
}

export function renderPreviewHotels(items: RotHotel[], formatDate: FormatDate) {
  return Array.from(groupByCity(items, 'Hotéis'), ([city, hotels]) =>
    hotels
      .map((hotel) => {
        const start = formatDate(hotel.data_inicio);
        const end = formatDate(hotel.data_fim);
        const noites = hotel.noites && hotel.noites > 0 ? hotel.noites : 0;
        const cidadeCurta = nomeCidadeNoPdf(city);
        const kicker = [
          cidadeCurta,
          'Hotel',
          noites ? `${noites} ${noites === 1 ? 'Noite' : 'Noites'}` : ''
        ]
          .filter(Boolean)
          .join(' · ');
        const checkin = start ? `Check-in: ${start}` : '';
        const checkout = end ? `Check-out: ${end}` : '';
        const estadia =
          checkin && checkout
            ? `<div class="rtf rota"><span class="lg"><span class="rt rota">${escapeHtml(checkin)}</span></span>${conector()}<span class="lg"><span class="rt rota">${escapeHtml(checkout)}</span></span></div>`
            : checkin || checkout
              ? `<div class="rt rota">${escapeHtml(checkin || checkout)}</div>`
              : '';
        const detalhe = [text(hotel.categoria), text(hotel.apto)].filter(Boolean).join(' · ');
        const passageiros = passageirosChipText(
          Number(hotel.qtd_adultos) || 0,
          Number(hotel.qtd_criancas) || 0,
          0
        );
        const content = [
          `<div class="rot-hotel"><div>${serviceIconSvg('hotel')}</div><div>`,
          text(hotel.hotel)
            ? `<div class="rot-item-title"><b>${escapeHtml(text(hotel.hotel))}</b></div>`
            : '',
          kicker ? `<div class="lb">${escapeHtml(kicker)}</div>` : '',
          estadia,
          detalhe ? `<div class="mu sm">${escapeHtml(detalhe)}</div>` : '',
          chipsHtml([text(hotel.regime), passageiros]),
          `</div></div>`
        ].join('');
        return card(
          content,
          [city, hotel.hotel, hotel.categoria, hotel.apto, hotel.regime, passageiros].join('\n')
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
          'Carro',
          dias != null && dias > 0 ? `${dias} ${dias === 1 ? 'Diária' : 'Diárias'}` : ''
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
        const chips = chipsHtml(etiquetasCarro(detalhes.incluidos ?? []));
        const content = [
          `<div class="rot-hotel"><div>${serviceIconSvg('aluguel_carro')}</div><div>`,
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

function pontosTrechoTrem(segmento: QuoteFlightSegment): [string, string] {
  const [routeFrom = '', routeTo = ''] = text(segmento.trecho).split(/\s*(?:→|->)\s*|\s+-\s+/);
  return [
    nomeCidadeNoPdf(text(segmento.aeroporto_saida) || routeFrom) || '—',
    nomeCidadeNoPdf(text(segmento.aeroporto_chegada) || routeTo) || '—'
  ];
}

function pernaTrem(segmento: QuoteFlightSegment, formatDate: FormatDate, index: number) {
  const [from, to] = pontosTrechoTrem(segmento);
  const dataSaida = formatDate(segmento.data_voo || segmento.data_fim);
  const saida = text(segmento.hora_saida).replace(/\s*\(\+\d+\)\s*$/, '');
  const chegada = text(segmento.hora_chegada).replace(/\s*\(\+\d+\)\s*$/, '');
  const rotulo = ['Trem', dataSaida && dataSaida !== '-' ? dataSaida : '']
    .filter(Boolean)
    .join(' · ');
  const carrier = [text(segmento.cia_aerea), text(segmento.numero_voo)].filter(Boolean).join(' · ');
  return [
    `<div class="lb"${index ? ' style="margin-top:8px"' : ''}>${escapeHtml(rotulo)}</div>`,
    `<div class="rt rota">${escapeHtml(from)}${saida ? ` <span class="mu">${escapeHtml(saida)}</span>` : ''} <span aria-hidden="true">→</span> ${escapeHtml(to)}${chegada ? ` <span class="mu">${escapeHtml(chegada)}</span>` : ''}</div>`,
    carrier ? `<div class="mu sm">${escapeHtml(carrier)}</div>` : ''
  ].join('');
}

export function renderPreviewTrens(items: RotPasseio[], formatDate: FormatDate) {
  return Array.from(groupByCity(items, 'Trem'), ([city, trens]) =>
    trens
      .map((item) => {
        const detalhes = detalhesPasseio(item);
        const segmentos = Array.isArray(detalhes.segmentos) ? detalhes.segmentos : [];
        const cidadesRota = Array.from(
          new Set(
            segmentos
              .flatMap((seg) => pontosTrechoTrem(seg))
              .filter((ponto) => ponto && ponto !== '—')
          )
        );
        const tituloRota = cidadesRota.length >= 2 ? cidadesRota.join(' → ') : '';
        const passeioTxt = text(item.passeio);
        const titulo = tituloRota || passeioTxt || 'Trem';
        const normTxt = (valor: string) =>
          valor
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
        // Descrição que é só a rota repetida (ex.: "Las Vegas - Los Angeles"
        // para o título "Los Angeles → Las Vegas") não deve sair de novo.
        const passeioNorm = passeioTxt ? normTxt(passeioTxt) : '';
        const restoRota = cidadesRota.reduce(
          (acc, cidade) => acc.replace(normTxt(cidade), ''),
          passeioNorm
        );
        const passeioEhRota =
          passeioNorm !== '' &&
          restoRota === '' &&
          cidadesRota.every((cidade) => passeioNorm.includes(normTxt(cidade)));
        const passeioExtra =
          passeioTxt && !passeioEhRota && normTxt(passeioTxt) !== normTxt(tituloRota || titulo)
            ? passeioTxt
            : '';
        const periodo = periodoTexto(item, formatDate);
        const pernas = segmentos.map((seg, index) => pernaTrem(seg, formatDate, index)).join('');
        const chips = chipsHtml(
          segmentos.flatMap((seg) => [
            text(seg.classe_reserva),
            text(seg.assentos) ? `Assentos ${text(seg.assentos)}` : ''
          ])
        );
        const content = [
          `<div class="rot-hotel"><div>${serviceIconSvg('trem')}</div><div>`,
          `<div class="rot-item-title"><b>${escapeHtml(titulo)}</b></div>`,
          pernas || (periodo ? `<p class="meta">${escapeHtml(periodo)}</p>` : ''),
          passeioExtra ? `<div class="mu sm">${escapeHtml(passeioExtra)}</div>` : '',
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
        const detalhes = detalhesPasseio(item);
        const titulo = text(item.passeio) || 'Seguro Viagem';
        const periodo = periodoTexto(item, formatDate);
        const dias = diasItem('seguro', item.data_inicio, item.data_fim);
        const contagem =
          dias != null ? `- ${String(dias).padStart(2, '0')} ${dias === 1 ? 'dia' : 'dias'}` : '';
        const rotulo = ['Seguro Viagem', [periodo, contagem].filter(Boolean).join(' ')]
          .filter(Boolean)
          .join(' · ');
        const passageiros = passageirosChipText(
          Number(item.qtd_adultos) || 0,
          Number(item.qtd_criancas) || 0,
          Number(detalhes.infant) || 0
        );
        const linhaCinza = text(item.fornecedor);
        const content = [
          `<div class="rot-hotel"><div>${serviceIconSvg('seguro')}</div><div>`,
          `<div class="rot-item-title"><b>${escapeHtml(titulo)}</b></div>`,
          `<div class="lb">${escapeHtml(rotulo)}</div>`,
          linhaCinza ? `<div class="mu sm">${escapeHtml(linhaCinza)}</div>` : '',
          chipsHtml([passageiros]),
          `</div></div>`
        ].join('');
        return card(
          content,
          [city, item.passeio, item.fornecedor, periodo, passageiros].join('\n')
        );
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
            `<div class="lb">${escapeHtml(kicker)}</div>`,
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
