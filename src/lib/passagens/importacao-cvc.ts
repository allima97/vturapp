import type { PassagemImportada, TipoPassageiro } from './importacao';

const DATA = '(\\d{2}/\\d{2}/\\d{4})';
const HORA = '(\\d{2}:\\d{2})';
const VOO = new RegExp(
  `([A-Z0-9]{2})\\s*(\\d{1,4})\\s*([A-Z]{3})\\s*-\\s*([A-ZÀ-Ü ]+?)\\s*${DATA}\\s*${HORA}\\s*([A-Z]{3})\\s*-\\s*([A-ZÀ-Ü ]+?)\\s*${DATA}\\s*${HORA}\\s*([^\\n]*?)(?=\\s*[A-Z0-9]{2}\\s*\\d{1,4}\\s*[A-Z]{3}\\s*-|\\n|$)`,
  'gi'
);

function dataHora(data: string, hora: string) {
  const [dia, mes, ano] = data.split('/');
  return `${ano}-${mes}-${dia}T${hora}`;
}

export function importarCvc(texto: string): { dados: PassagemImportada; avisos: string[] } | null {
  const semImagens = texto.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ');
  const reserva = /reserva\s+cia\.?\s*a[ée]rea/i.exec(semImagens);
  const trechos = /\btrechos/i.exec(semImagens);
  const passageiros = /\bpassageiros/i.exec(semImagens);
  if (!reserva || !trechos || !passageiros || reserva.index > trechos.index) return null;

  const dados: PassagemImportada = { localizador: '', emissao: '', trechos: [], passageiros: [] };
  const avisos: string[] = [];
  const blocoReserva = semImagens.slice(reserva.index, trechos.index);
  const reservas = Array.from(
    blocoReserva.matchAll(
      /([A-Z0-9]{2})[ \t]*-[ \t]*([A-ZÀ-Ü][A-ZÀ-Ü .&'-]*?)(?: {2,}|\t+)([A-Z0-9]{6})(?=[ \t]|$)|([A-Z0-9]{2})[ \t]*-[ \t]*([A-ZÀ-Ü](?:[A-ZÀ-Ü .&'-]*?[A-ZÀ-Ü.'-])?)(?=[A-Z0-9]{0,5}\d)([A-Z0-9]{6})(?=[ \t]*HST)/gim
    ),
    (match) => ({
      codigo: (match[1] || match[4]).toUpperCase(),
      companhia: (match[2] || match[5]).trim(),
      localizador: (match[3] || match[6]).toUpperCase()
    })
  );
  const linhaReserva = reservas.length === 1 ? reservas[0] : undefined;
  const codigoCia = linhaReserva?.codigo || '';
  const companhia = linhaReserva?.companhia || '';
  if (linhaReserva) dados.localizador = linhaReserva.localizador;
  if (reservas.length > 1)
    avisos.push(
      'Há mais de uma reserva de companhia aérea; confira o localizador e as companhias.'
    );

  const fimTrechos = /pol[ií]tica\s+de\s+multa/i.exec(semImagens.slice(trechos.index));
  const blocoTrechos = semImagens.slice(
    trechos.index,
    fimTrechos ? trechos.index + fimTrechos.index : passageiros.index
  );
  for (const match of blocoTrechos.matchAll(VOO)) {
    const codigo = match[1].toUpperCase();
    const familia = match[11].trim().replace(/\s+/g, ' ');
    const classe = /^economy\b/i.test(familia) ? 'Econômica' : '';
    const tarifa = classe ? familia.replace(/^economy\s*/i, '') : familia;
    dados.trechos.push({
      companhia: codigo === codigoCia ? companhia : '',
      voo: `${codigo} ${match[2]}`,
      origem: match[3].toUpperCase(),
      destino: match[7].toUpperCase(),
      saida: dataHora(match[5], match[6]),
      chegada: dataHora(match[9], match[10]),
      status: '',
      duracao: '',
      classe,
      tarifa
    });
  }

  const fimPassageiros = /\bcontratante/i.exec(semImagens.slice(passageiros.index));
  const blocoPassageiros = semImagens.slice(
    passageiros.index,
    fimPassageiros ? passageiros.index + fimPassageiros.index : undefined
  );
  const cabecalho = /nascimento/i.exec(blocoPassageiros);
  if (cabecalho) {
    const linhas = blocoPassageiros.slice(cabecalho.index + cabecalho[0].length);
    const entrada =
      /([A-ZÀ-Ü][A-ZÀ-Ü \t.'-]*?)[ \t]*(ADT|CHD|INF)[ \t]*(?:\d{1,3}[A-Z][ \t]*)?[\d., \t-]*?\d{2}\/\d{2}\/\d{4}(?=\s|[A-ZÀ-Ü]|$)/gi;
    for (const match of linhas.matchAll(entrada)) {
      const tipo = match[2].toUpperCase();
      if (tipo !== 'ADT' && tipo !== 'CHD' && tipo !== 'INF') continue;
      const partes = match[1]
        .trim()
        .split(/\s{2,}|\t+/)
        .filter(Boolean);
      const nome =
        partes.length === 2 ? `${partes[0].trim()} ${partes[1].trim()}` : match[1].trim();
      dados.passageiros.push({
        nome,
        tipo: tipo satisfies TipoPassageiro,
        bilhete: '',
        status: '',
        assentos: []
      });
      if (
        partes.length !== 2 &&
        !avisos.includes(
          'Confira os nomes: o texto não preservou a separação entre nome e sobrenome.'
        )
      )
        avisos.push('Confira os nomes: o texto não preservou a separação entre nome e sobrenome.');
    }
  }
  if (dados.trechos.some((trecho) => !trecho.companhia))
    avisos.push('Confira a companhia aérea dos trechos não identificados.');
  return { dados, avisos };
}
