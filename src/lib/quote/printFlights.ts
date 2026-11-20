import { diffDaysISODate, formatISODateBR } from '$lib/date';
import { escapeHtml } from '$lib/utils/html';
import { nomeCidadeNoPdf, requiresPrintContinuation } from '$lib/utils/printLayout';
import { quoteCheckIcon, serviceIconSvg } from '$lib/quote/pdfIcons';

export type PrintFlight = {
  trecho: string;
  cidade_saida?: string;
  cidade_chegada?: string;
  cia_aerea: string;
  fornecedor?: string;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  data_voo: string;
  classe_reserva: string;
  hora_saida: string;
  aeroporto_saida: string;
  duracao_voo: string;
  hora_chegada: string;
  aeroporto_chegada: string;
  tarifa_nome: string;
};

function text(value: string | null | undefined) {
  return String(value || '').trim();
}

function dataBr(value: string | null | undefined) {
  const formatted = formatISODateBR(value);
  return formatted === '-' ? '' : formatted;
}

function codigo(value: string) {
  const token = text(value).split(',')[0].trim();
  return /^[A-Za-z]{3}$/.test(token) ? token.toUpperCase() : '';
}

function conector() {
  return `<span class="lni"><span class="ln" style="width:50px"></span></span>`;
}

export function renderPreviewFlights(
  items: PrintFlight[],
  formatDate: (value: string | null | undefined) => string,
  extraHtml = ''
) {
  return items
    .map((item, index) => {
      const [routeFrom = '', routeTo = ''] = text(item.trecho).split(/\s*(?:→|->)\s*|\s+-\s+/);
      const fromCode = codigo(item.aeroporto_saida);
      const toCode = codigo(item.aeroporto_chegada);
      const fromCity = nomeCidadeNoPdf(text(item.cidade_saida) || routeFrom);
      const toCity = nomeCidadeNoPdf(text(item.cidade_chegada) || routeTo);
      const from = fromCode || fromCity;
      const to = toCode || toCity;
      const saida =
        dataBr(item.data_voo || item.data_inicio) || formatDate(item.data_voo || item.data_inicio);
      const chegada =
        dataBr(item.data_fim || item.data_voo || item.data_inicio) ||
        formatDate(item.data_fim || item.data_voo || item.data_inicio);
      const horaSaida = text(item.hora_saida).replace(/\s*\(\+\d+\)\s*$/, '');
      const horaChegada = text(item.hora_chegada).replace(/\s*\(\+\d+\)\s*$/, '');
      const offset = diffDaysISODate(item.data_voo || item.data_inicio, item.data_fim);
      const plus = offset != null && offset > 0 ? `<span class="p1">+${offset}</span>` : '';
      const voo = text(item.descricao);
      const cia = [text(item.cia_aerea), text(item.fornecedor)]
        .filter((valor, indice, todas) => valor && todas.indexOf(valor) === indice)
        .join(' · ');
      const tituloPartes = [fromCity, toCity].filter(
        (cidade, indice, todas) =>
          cidade &&
          cidade.toUpperCase() !== from &&
          cidade.toUpperCase() !== to &&
          todas.indexOf(cidade) === indice
      );
      const titulo = tituloPartes.length >= 2 ? tituloPartes.join(' → ') : '';
      const origemInfo = [fromCity && fromCity.toUpperCase() !== from ? fromCity : '', saida]
        .filter(Boolean)
        .join(' – ');
      const destinoInfo = [toCity && toCity.toUpperCase() !== to ? toCity : '', chegada]
        .filter(Boolean)
        .join(' – ');
      const lado = (sigla: string, hora: string, info: string, extra = '') =>
        `<span class="lg"><span><b>${escapeHtml(sigla)}</b>${hora ? ` <span class="mu">· ${escapeHtml(hora)}</span>` : ''}${extra ? ` ${extra}` : ''}</span>${info ? `<span class="ct">${escapeHtml(info)}</span>` : ''}</span>`;
      const rota =
        from || to
          ? `<div class="rtf">${lado(from || '—', horaSaida, origemInfo)}<span class="md">${voo ? `<span>${escapeHtml(voo)}</span>` : ''}${conector()}${cia ? `<span>${escapeHtml(cia)}</span>` : ''}</span>${lado(to || '—', horaChegada, destinoInfo, plus)}</div>`
          : '';
      const chips = [text(item.classe_reserva), text(item.tarifa_nome)].filter(Boolean);
      const chipsHtml = chips.length
        ? `<div class="chks">${chips.map((chip) => `<div class="chk">${quoteCheckIcon}<span>${escapeHtml(chip)}</span></div>`).join('')}</div>`
        : '';
      const longo = requiresPrintContinuation(
        [
          item.trecho,
          item.cia_aerea,
          item.fornecedor,
          item.descricao,
          item.classe_reserva,
          item.tarifa_nome
        ].join('\n')
      );
      return `<tr class="${longo ? 'roteiro-card--long' : ''}"><td><div class="row rot-row roteiro-card${longo ? ' roteiro-card--long' : ''}"><div>${serviceIconSvg('passagem')}</div><div>${titulo ? `<div class="rot-item-title"><b>${escapeHtml(titulo)}</b></div>` : ''}${rota}${chipsHtml}${index === items.length - 1 ? extraHtml : ''}</div></div></td></tr>`;
    })
    .join('');
}

export const roteiroFlightStyles = '';
