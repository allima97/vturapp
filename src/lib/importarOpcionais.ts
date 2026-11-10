export type PasseioImportado = { nome: string; descricao: string };
export type CidadeImportada = { cidadeOriginal: string; passeios: PasseioImportado[] };

export const MAX_OPCIONAIS_IMPORTACAO = 100;
export const MAX_TEXTO_IMPORTACAO_BYTES = 512 * 1024;

function removerExplicacao(texto: string, tipo: 'cidade' | 'nome' | 'descricao') {
  const expressoes = {
    cidade: /\s*\(aqui\s+é\s+a\s+cidade\)\s*$/i,
    nome: /\s*\(aqui\s+é\s+o\s+nome\s+do\s+passeio\)\s*$/i,
    descricao: /\s*\(aqui\s+é\s+a\s+descrição\s+do\s+passeio\)\s*$/i
  };
  return texto.replace(expressoes[tipo], '').trim();
}

export function parseImportacaoOpcionais(texto: string, modo: 'cidade' | 'arquivo') {
  if (new TextEncoder().encode(texto).byteLength > MAX_TEXTO_IMPORTACAO_BYTES)
    throw new Error('O texto deve ter no máximo 512 KB.');
  const grupos: CidadeImportada[] = [];
  let grupo: CidadeImportada | undefined;
  let passeio: PasseioImportado | undefined;
  let total = 0;
  let linhaEmBranco = false;
  if (modo === 'cidade') {
    grupo = { cidadeOriginal: '', passeios: [] };
    grupos.push(grupo);
  }
  const linhas = texto.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (const [indice, linhaOriginal] of linhas.entries()) {
    const linha = linhaOriginal.trim();
    if (!linha) {
      if (passeio?.descricao) linhaEmBranco = true;
      continue;
    }
    const cabecalho = /^(#{2,5})\s+(.+?)\s*#*\s*$/.exec(linha);
    if (/^#{1,6}(?:\s|$)/.test(linha) && !cabecalho)
      throw new Error(`Linha ${indice + 1}: cabeçalho inválido ou vazio.`);
    if (cabecalho?.[1] === '##') {
      if (modo === 'cidade')
        throw new Error(`Linha ${indice + 1}: remova a cidade do texto no modo de cidade única.`);
      const cidade = removerExplicacao(cabecalho[2], 'cidade');
      if (!cidade || cidade.length > 200) throw new Error(`Linha ${indice + 1}: cidade inválida.`);
      grupo = { cidadeOriginal: cidade, passeios: [] };
      grupos.push(grupo);
      passeio = undefined;
      linhaEmBranco = false;
      continue;
    }
    if (cabecalho?.[1] === '####') {
      if (!grupo) throw new Error(`Linha ${indice + 1}: informe a cidade antes do passeio.`);
      const nome = removerExplicacao(cabecalho[2], 'nome');
      if (!nome || nome.length > 300)
        throw new Error(`Linha ${indice + 1}: nome do passeio inválido (até 300 caracteres).`);
      passeio = { nome, descricao: '' };
      linhaEmBranco = false;
      grupo.passeios.push(passeio);
      total++;
      if (total > MAX_OPCIONAIS_IMPORTACAO)
        throw new Error(`Importe até ${MAX_OPCIONAIS_IMPORTACAO} passeios por vez.`);
      continue;
    }
    if (!passeio)
      throw new Error(`Linha ${indice + 1}: esperava um título de passeio iniciado por ####.`);
    if (cabecalho && cabecalho[1] !== '#####')
      throw new Error(`Linha ${indice + 1}: cabeçalho não reconhecido.`);
    const textoDescricao = removerExplicacao(cabecalho?.[2] ?? linha, 'descricao');
    if (textoDescricao) {
      const separador = passeio.descricao ? (linhaEmBranco ? '\n\n' : '\n') : '';
      passeio.descricao += separador + textoDescricao;
    }
    linhaEmBranco = false;
    if (passeio.descricao.length > 20000)
      throw new Error(`Linha ${indice + 1}: descrição excede 20.000 caracteres.`);
  }
  if (!total) throw new Error('Nenhum passeio encontrado. Inicie cada nome com ####.');
  if (grupos.some((item) => item.passeios.length === 0))
    throw new Error('Cada cidade deve conter pelo menos um passeio.');
  return grupos;
}

export function chaveNomeOpcional(nome: string | null | undefined) {
  return String(nome ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFC')
    .toLocaleLowerCase('pt-BR');
}
