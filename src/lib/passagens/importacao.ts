export type TrechoPassagem = {
  companhia: string;
  voo: string;
  origem: string;
  destino: string;
  cidadeOrigem?: string;
  cidadeDestino?: string;
  saida: string;
  chegada: string;
  status: string;
  duracao: string;
  classe: string;
};

export type PassageiroPassagem = {
  nome: string;
  bilhete: string;
  status: string;
  assentos: string[];
};

export type PassagemImportada = {
  localizador: string;
  emissao: string;
  trechos: TrechoPassagem[];
  passageiros: PassageiroPassagem[];
};

export type ResultadoImportacaoPassagem = {
  dados: PassagemImportada;
  avisos: string[];
};

const DATA_HORA = '\\d{2}/\\d{2}/\\d{4}\\s*-\\s*\\d{2}:\\d{2}';
const SEGMENTO = new RegExp(
  `^(.+?)\\s+([A-Z0-9]{2})\\s*(\\d{1,4})\\s+(${DATA_HORA})\\s+(${DATA_HORA})\\s+([A-Z]{2})\\s+([A-Z]{3})(?:\\s*-\\s*[A-Za-z]{3})?\\s+([A-Z]{3})(?:\\s*-\\s*[A-Za-z]{3})?\\s+\\S+\\s+(\\d{1,2}:\\d{2})(?:\\s+([A-Z]))?(?:\\s+.*)?$`,
  'i'
);

function dataHoraLocal(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}):(\d{2})$/.exec(value);
  if (!match) return '';
  return `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}`;
}

/**
 * Importação conservadora de texto estruturado. Campos não reconhecidos ficam
 * vazios para revisão; o texto copiado pode variar entre sistemas de reservas.
 */
export function importarTextoPassagem(texto: string): ResultadoImportacaoPassagem {
  const dados: PassagemImportada = { localizador: '', emissao: '', trechos: [], passageiros: [] };
  const linhas = texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);
  let secao = '';
  let linhaLocalizadorPendente = false;
  for (const linha of linhas) {
    const nomeSecao = linha.toLocaleLowerCase('pt-BR');
    if (/^loc(?:\s|\t)+prazo\b/i.test(linha)) {
      linhaLocalizadorPendente = true;
      continue;
    }
    if (linhaLocalizadorPendente) {
      const primeiraColuna = /^([A-Z0-9]{5,8})(?:\s|$)/i.exec(linha);
      if (primeiraColuna) dados.localizador = primeiraColuna[1].toUpperCase();
      linhaLocalizadorPendente = false;
    }
    if (/^segmentos\b/.test(nomeSecao)) {
      secao = 'segmentos';
      continue;
    }
    if (/^passageiros\b/.test(nomeSecao)) {
      secao = 'passageiros';
      continue;
    }
    if (/^assentos\b/.test(nomeSecao)) {
      secao = 'assentos';
      continue;
    }
    const localizador = /^(?:loc|localizador|pnr)\s*[:=]\s*([A-Z0-9]{5,8})\s*$/i.exec(linha);
    if (localizador) {
      dados.localizador = localizador[1].toUpperCase();
      continue;
    }
    if (secao === 'segmentos') {
      const match = SEGMENTO.exec(linha);
      if (match) {
        dados.trechos.push({
          companhia: match[1].trim(),
          voo: `${match[2].toUpperCase()} ${match[3]}`,
          saida: dataHoraLocal(match[4]),
          chegada: dataHoraLocal(match[5]),
          status: match[6].toUpperCase(),
          origem: match[7].toUpperCase(),
          destino: match[8].toUpperCase(),
          duracao: match[9],
          classe: match[10] || ''
        });
      }
    }
    if (secao === 'passageiros') {
      const colunas = linha
        .split(/\t+|\s{2,}/)
        .map((parte) => parte.trim())
        .filter(Boolean);
      const faixa = colunas.findIndex((parte) => /^(ADT|CHD|INF)$/i.test(parte));
      if (faixa >= 0 && colunas[faixa + 1] && colunas[faixa + 2]) {
        dados.passageiros.push({
          nome: `${colunas[faixa + 1]}, ${colunas[faixa + 2]}`,
          bilhete: '',
          status: colunas[faixa + 4] || '',
          assentos: []
        });
      }
    }
    if (secao === 'assentos') {
      const colunas = linha
        .split(/\t+|\s{2,}/)
        .map((parte) => parte.trim())
        .filter(Boolean);
      if (colunas.length > 1 && colunas[0].includes('/')) {
        const [sobrenome, nome] = colunas[0].split('/');
        const passageiro = dados.passageiros.find(
          (item) =>
            item.nome.toLocaleUpperCase('pt-BR') ===
            `${sobrenome}, ${nome}`.toLocaleUpperCase('pt-BR')
        );
        if (passageiro && colunas.slice(1).every((assento) => /^[0-9]{1,3}[A-Z]$/i.test(assento))) {
          passageiro.assentos = colunas.slice(1, dados.trechos.length + 1);
        }
      }
    }
  }
  const avisos = [
    'Confira todos os dados importados antes de salvar. O formato de texto pode variar entre sistemas.',
    'Confira passageiros, bilhetes e assentos e preencha os campos não reconhecidos.'
  ];
  if (!dados.localizador) avisos.push('Localizador não reconhecido: informe-o manualmente.');
  if (!dados.trechos.length) avisos.push('Nenhum trecho reconhecido: informe os voos manualmente.');
  return { dados, avisos };
}
