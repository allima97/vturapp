import { chaveIdentidadeCidade } from './catalogoOpcionais';
import { destinoIdValido } from './destinoIdentidade';
import { chaveNomeOpcional } from './importarOpcionais';
import { printLocationIcon, requiresPrintContinuation } from './utils/printLayout';

export type RoteiroOpcionalCidade = {
  cidade: string;
  cidade_id?: string;
  registro_id?: string;
  cidade_pendente?: boolean;
  cidade_modo_geografico?: boolean;
  passeios: { nome: string; descricao: string }[];
};

export type RoteiroPasseioIncorporado = {
  cidade: string;
  cidade_id?: string | null;
  passeio: string;
};

export const MAX_CIDADES_OPCIONAIS = 100;
export const MAX_PASSEIOS_POR_CIDADE = 100;
const REGISTRO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function registroOpcionalIdValido(value: unknown): value is string {
  return typeof value === 'string' && REGISTRO_ID.test(value);
}

export function atribuirIdsGruposOpcionais(grupos: RoteiroOpcionalCidade[]) {
  return grupos.map((grupo) =>
    grupo.registro_id === undefined ? { ...grupo, registro_id: crypto.randomUUID() } : grupo
  );
}

export function removerPasseiosIncorporados(
  opcionais: RoteiroOpcionalCidade[],
  passeios: RoteiroPasseioIncorporado[]
): RoteiroOpcionalCidade[] {
  const incorporados = new Map<string, Set<string>>();
  for (const passeio of passeios) {
    const cidade =
      passeio.cidade_id || passeio.cidade.trim()
        ? chaveIdentidadeCidade(passeio.cidade, passeio.cidade_id)
        : '';
    const nome = chaveNomeOpcional(passeio.passeio);
    if (!cidade || !nome) continue;
    const nomes = incorporados.get(cidade) ?? new Set<string>();
    nomes.add(nome);
    incorporados.set(cidade, nomes);
  }

  let alterado = false;
  const restantes = opcionais.flatMap((grupo) => {
    const nomesIncorporados = incorporados.get(
      chaveIdentidadeCidade(grupo.cidade, grupo.cidade_id)
    );
    const passeiosRestantes = nomesIncorporados
      ? grupo.passeios.filter((passeio) => !nomesIncorporados.has(chaveNomeOpcional(passeio.nome)))
      : grupo.passeios;
    if (passeiosRestantes.length === grupo.passeios.length) return [grupo];
    alterado = true;
    return passeiosRestantes.length ? [{ ...grupo, passeios: passeiosRestantes }] : [];
  });

  return alterado ? restantes : opcionais;
}

/** Valida antes de gravar; a ordem dos arrays é a ordem exibida no PDF. */
export function parseRoteiroOpcionais(value: unknown): RoteiroOpcionalCidade[] {
  if (!Array.isArray(value) || value.length > MAX_CIDADES_OPCIONAIS)
    throw new Error('Informe até 100 cidades nos opcionais.');
  const registros = new Set<string>();
  return value.map((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.cidade !== 'string' ||
      !Array.isArray(item.passeios) ||
      item.passeios.length > MAX_PASSEIOS_POR_CIDADE
    ) {
      throw new Error('Cidade ou passeios opcionais inválidos.');
    }
    const cidade = item.cidade.trim();
    if (!cidade || cidade.length > 200)
      throw new Error('Informe o nome da cidade dos opcionais (até 200 caracteres).');
    if ('cidade_id' in item && item.cidade_id != null && !destinoIdValido(item.cidade_id))
      throw new Error('Identificação da cidade dos opcionais inválida.');
    const cidadeId =
      'cidade_id' in item && destinoIdValido(item.cidade_id) ? item.cidade_id : undefined;
    let registroId: string | undefined;
    if ('registro_id' in item) {
      if (!registroOpcionalIdValido(item.registro_id))
        throw new Error('Identificação do grupo de opcionais inválida.');
      const normalizado = item.registro_id.toLowerCase();
      if (registros.has(normalizado))
        throw new Error('Identificação do grupo de opcionais duplicada.');
      registros.add(normalizado);
      registroId = normalizado;
    }
    const passeios = item.passeios.map((p: unknown) => {
      if (
        !p ||
        typeof p !== 'object' ||
        !('nome' in p) ||
        !('descricao' in p) ||
        typeof p.nome !== 'string' ||
        typeof p.descricao !== 'string'
      )
        throw new Error('Passeio opcional inválido.');
      const nome = p.nome.trim();
      const descricao = p.descricao.trim();
      if (!nome || nome.length > 300 || descricao.length > 20000)
        throw new Error(
          'Informe o nome do passeio (até 300 caracteres) e uma descrição de até 20.000 caracteres.'
        );
      return { nome, descricao };
    });
    return {
      cidade,
      ...(cidadeId ? { cidade_id: cidadeId } : {}),
      ...(registroId ? { registro_id: registroId } : {}),
      passeios
    };
  });
}

export function buildOpcionaisHtml(
  cidades: RoteiroOpcionalCidade[],
  escape: (text: string) => string,
  formatarCidade: (cidade: string) => string = (cidade) => cidade
): string {
  const grupos = new Map<string, RoteiroOpcionalCidade>();
  for (const cidade of cidades) {
    if (!cidade.cidade || !cidade.passeios.length) continue;
    const chave = chaveIdentidadeCidade(cidade.cidade, cidade.cidade_id);
    const grupo = grupos.get(chave);
    if (grupo) grupo.passeios.push(...cidade.passeios);
    else grupos.set(chave, { ...cidade, passeios: [...cidade.passeios] });
  }
  return Array.from(grupos.values(), (grupo) => {
    const conteudo = grupo.passeios.map((p) => `${p.nome}\n${p.descricao}`).join('\n');
    const longo = grupo.passeios.length > 6 || requiresPrintContinuation(conteudo);
    return `
      <article class="card roteiro-card${longo ? ' roteiro-card--long' : ''}">
        <table class="roteiro-optional-table" role="presentation">
          <thead><tr><td><div class="roteiro-card-city">${printLocationIcon}${escape(formatarCidade(grupo.cidade))}</div></td></tr></thead>
          <tbody><tr><td>${grupo.passeios
            .map(
              (
                p
              ) => `<div class="roteiro-optional-item${requiresPrintContinuation(p.descricao) ? ' roteiro-optional-item--long' : ''}">
              <h3>${escape(p.nome)}</h3>
              ${p.descricao ? `<p>${escape(p.descricao).replace(/\n/g, '<br>')}</p>` : ''}
            </div>`
            )
            .join('')}</td></tr></tbody>
        </table>
      </article>`;
  }).join('');
}
