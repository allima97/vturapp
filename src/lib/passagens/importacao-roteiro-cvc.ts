import type { PassagemImportada, ResultadoImportacaoPassagem } from './importacao';

const DATA = '(\\d{2}/\\d{2}/\\d{4})';
const HORA = '(\\d{2}:\\d{2})';
const VOO = new RegExp(
  `([A-Z0-9]{2})\\s*(\\d{1,4})\\s*([A-Z]{3})\\s*([A-Z]{3})\\s*${DATA}\\s*${HORA}\\s*${DATA}\\s*${HORA}`,
  'gi'
);

function dataHora(data: string, hora: string) {
  const [dia, mes, ano] = data.split('/');
  return `${ano}-${mes}-${dia}T${hora}`;
}

function escaparRegex(texto: string) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function importarRoteiroCvc(texto: string): ResultadoImportacaoPassagem | null {
  const limpo = texto.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ');
  const titulo = /consulta\s+de\s+roteiro\s+e\s+reserva/i.exec(limpo);
  const cabecalhoPassageiros =
    /passageiros\s*sobrenome\s*nome\s*nascimento\s*sexo\s*idade\s*local\s+de\s+embarque\s*observa[çc][aã]o/i.exec(
      limpo
    );
  const voos = /voo\s+cvc\s*cia\.?/i.exec(limpo);
  const reservas = /reserva\s+de\s+passagens\s+a[ée]reas/i.exec(limpo);
  if (!titulo || !cabecalhoPassageiros || !voos || cabecalhoPassageiros.index > voos.index)
    return null;

  const dados: PassagemImportada = { localizador: '', emissao: '', trechos: [], passageiros: [] };
  const avisos: string[] = [];
  const blocoVoos = limpo.slice(voos.index, reservas?.index ?? undefined);
  const partidas = Array.from(blocoVoos.matchAll(VOO));
  const localizadores: string[] = [];
  for (let i = 0; i < partidas.length; i++) {
    const match = partidas[i];
    const detalhe = blocoVoos.slice(
      match.index + match[0].length,
      partidas[i + 1]?.index ?? undefined
    );
    const localizador =
      /(?:^|\s)([A-Z0-9]{6})\s*([A-Z0-9]{6})\s*\d{2}\/\d{2}\/\d{4}\s*([A-ZÀ-Ü][A-ZÀ-Ü -]*)?/i.exec(
        detalhe
      );
    if (localizador) localizadores.push(localizador[2].toUpperCase());
    dados.trechos.push({
      companhia: '',
      voo: `${match[1].toUpperCase()} ${match[2]}`,
      origem: match[3].toUpperCase(),
      destino: match[4].toUpperCase(),
      saida: dataHora(match[5], match[6]),
      chegada: dataHora(match[7], match[8]),
      status: '',
      duracao: '',
      classe: '',
      tarifa: localizador?.[3]?.trim() || ''
    });
  }
  if (
    localizadores.length === dados.trechos.length &&
    localizadores.length > 0 &&
    new Set(localizadores).size === 1
  ) {
    dados.localizador = localizadores[0];
  } else if (localizadores.length) {
    avisos.push(
      'Confira os localizadores da companhia: não há um único valor confirmado para todos os voos.'
    );
  }

  const inicioFornecedores = /fornecedores/i.exec(limpo);
  const fimFornecedores = /dados\s+da\s+reserva/i.exec(limpo);
  const fornecedores =
    inicioFornecedores && fimFornecedores && inicioFornecedores.index < fimFornecedores.index
      ? limpo.slice(inicioFornecedores.index, fimFornecedores.index)
      : '';
  const companhias = Array.from(
    fornecedores.matchAll(
      /\d{5,}\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .&'-]*?)\s*CLASSE\s+TUR[ÍI]STICA\s*\(A\/A\)\s*\d+\s*-\s*([A-Z]{3})\s*\/\s*([A-Z]{3})/gi
    ),
    (match) => ({
      nome: match[1].trim(),
      origem: match[2].toUpperCase(),
      destino: match[3].toUpperCase()
    })
  );
  if (
    companhias.length === 1 &&
    dados.trechos.length > 0 &&
    new Set(partidas.map((match) => match[1].toUpperCase())).size === 1 &&
    dados.trechos[0].origem === companhias[0].origem &&
    dados.trechos[dados.trechos.length - 1].destino === companhias[0].destino &&
    dados.trechos.every((trecho, i) => i === 0 || dados.trechos[i - 1].destino === trecho.origem)
  ) {
    for (const trecho of dados.trechos) {
      trecho.companhia = companhias[0].nome;
      trecho.classe = 'Classe turística';
    }
  } else if (dados.trechos.length) {
    avisos.push(
      'Confira a companhia e a classe dos voos; não foi possível associá-las com segurança.'
    );
  }

  const blocoPassageiros = limpo.slice(
    cabecalhoPassageiros.index + cabecalhoPassageiros[0].length,
    voos.index
  );
  const fimReservas = reservas ? /or[çc]amento/i.exec(limpo.slice(reservas.index)) : null;
  const blocoReservas = reservas
    ? limpo.slice(reservas.index, fimReservas ? reservas.index + fimReservas.index : undefined)
    : '';
  const linhas =
    /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ \t.'-]*?)\s*(\d{2}\/\d{2}\/\d{4})\s*(?:Masculino|Feminino)\s*\d{1,3}\s*[A-Z]{3}(?:[ \t]*Dados\s+Pessoais)?/gi;
  for (const match of blocoPassageiros.matchAll(linhas)) {
    const original = match[1].trim();
    const partes = original
      .split(/ {2,}|\t+/)
      .map((parte) => parte.trim())
      .filter(Boolean);
    let nome = original;
    if (partes.length === 2) {
      nome = `${partes[1]} ${partes[0]}`;
    } else {
      const palavras = original.split(/\s+/);
      const opcoes: string[] = [];
      for (let i = 1; i < palavras.length; i++) {
        const sobrenome = palavras.slice(0, i).join(' ');
        const primeiroNome = palavras.slice(i).join(' ');
        const busca = new RegExp(
          `${escaparRegex(sobrenome).replace(/ /g, '\\s+')}\\s*/\\s*${escaparRegex(primeiroNome).replace(/ /g, '\\s+')}\\s*[A-Z0-9]{6}\\s*[A-Z0-9]{6}`,
          'i'
        );
        if (busca.test(blocoReservas)) opcoes.push(`${primeiroNome} ${sobrenome}`);
      }
      if (opcoes.length === 1) nome = opcoes[0];
      else if (
        !avisos.includes(
          'Confira os nomes: não foi possível separar nome e sobrenome com segurança.'
        )
      )
        avisos.push('Confira os nomes: não foi possível separar nome e sobrenome com segurança.');
    }
    dados.passageiros.push({ nome, tipo: '', bilhete: '', status: '', assentos: [] });
  }
  if (dados.passageiros.length)
    avisos.push(
      'O roteiro não informa o tipo de passageiro; selecione adulto, criança ou infant após conferir a reserva.'
    );
  return { dados, avisos };
}
