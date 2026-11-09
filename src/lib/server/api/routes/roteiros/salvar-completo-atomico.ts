import { prepareWrite } from '$lib/server/data/query';
import {
  confirmacaoCorresponde,
  identificarRemocoesOpcionais,
  identificarRemocoesRegistros,
  type RegistroCidade
} from '$lib/roteiroIdentidadesRemovidas';
import { registroOpcionalIdValido } from '$lib/roteiroOpcionais';
import { identificarOpcionaisLegados } from '$lib/server/roteiroOpcionaisLegados';
import {
  IdentificacaoRegistroError,
  identificarRegistrosLegados,
  rotuloRegistro,
  type ColecaoRegistro
} from '$lib/server/roteiroRegistrosLegados';

type TabelaFilha =
  | 'roteiro_dia'
  | 'roteiro_hotel'
  | 'roteiro_passeio'
  | 'roteiro_transporte'
  | 'roteiro_investimento'
  | 'roteiro_pagamento';

type Escopo = {
  userId?: string | null;
  companyId?: string | null;
  isAdmin?: boolean;
  isGestor?: boolean;
  isMaster?: boolean;
};

function identificador(value: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error('Identificador SQL inválido.');
  return `"${value}"`;
}

type RegistroSalvo = RegistroCidade & { ordem: number | null };

const TABELAS_REGISTRO = [
  ['dias', 'roteiro_dia'],
  ['hoteis', 'roteiro_hotel'],
  ['passeios', 'roteiro_passeio']
] as const;

function ordenarRegistros(itens: readonly RegistroSalvo[]) {
  return itens
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if ((a.item.ordem === null) !== (b.item.ordem === null))
        return a.item.ordem === null ? 1 : -1;
      if (a.item.ordem !== null && b.item.ordem !== null && a.item.ordem !== b.item.ordem)
        return a.item.ordem - b.item.ordem;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

function identidadesOpcionais(items: unknown[]) {
  const ids = new Set<string>();
  return items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { cidade_id: null };
    const grupo = item as Record<string, unknown>;
    let registro_id: string | undefined;
    if ('registro_id' in grupo) {
      if (!registroOpcionalIdValido(grupo.registro_id))
        throw new Error('Identificação salva do grupo de opcionais inválida.');
      registro_id = grupo.registro_id.toLowerCase();
      if (ids.has(registro_id))
        throw new Error('Identificação salva do grupo de opcionais duplicada.');
      ids.add(registro_id);
    }
    return {
      ...(registro_id ? { registro_id } : {}),
      cidade_id: typeof grupo.cidade_id === 'string' ? grupo.cidade_id : null
    };
  });
}

export class SalvamentoRoteiroAtomico {
  private readonly statements: D1PreparedStatement[] = [];
  private readonly condicao: string;
  private readonly parametros: (string | null)[];
  private readonly revisaoNova: string | null;
  private readonly registros: Partial<Record<ColecaoRegistro, RegistroSalvo[]>> = {};
  private opcionais: ReturnType<typeof identidadesOpcionais> | undefined;
  private novo = false;

  constructor(
    private readonly db: D1Database,
    private readonly id: string,
    scope: Escopo,
    private readonly revisaoEsperada?: string,
    private readonly protecao?: { confirmadas: unknown }
  ) {
    this.revisaoNova = revisaoEsperada === undefined ? null : crypto.randomUUID();
    if (!scope.isAdmin && !scope.isGestor && !scope.isMaster) {
      this.condicao = 'id = ? AND created_by = ?';
      this.parametros = [id, scope.userId ?? null];
    } else if (scope.companyId && !scope.isAdmin && !scope.isMaster) {
      this.condicao = 'id = ? AND company_id = ?';
      this.parametros = [id, scope.companyId];
    } else {
      this.condicao = 'id = ?';
      this.parametros = [id];
    }
  }

  principal(payload: Record<string, unknown>, novo: boolean) {
    this.novo = novo;
    if (this.protecao && Array.isArray(payload.opcionais)) {
      this.opcionais = identidadesOpcionais(payload.opcionais);
    }
    const values = prepareWrite(
      'roteiro_personalizado',
      novo ? { ...payload, id: this.id } : payload,
      novo ? 'insert' : 'update'
    );
    if (this.revisaoNova !== null) values.revisao = this.revisaoNova;
    const keys = Object.keys(values);
    const columns = keys.map(identificador);
    const sql = novo
      ? `INSERT INTO legado_roteiro_personalizado (${columns.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
      : `UPDATE legado_roteiro_personalizado SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE ${this.condicao}${this.revisaoEsperada === undefined ? '' : ' AND revisao = ?'}`;
    this.statements.push(
      this.db
        .prepare(sql)
        .bind(
          ...keys.map((key) => values[key]),
          ...(novo ? [] : this.parametros),
          ...(!novo && this.revisaoEsperada !== undefined ? [this.revisaoEsperada] : [])
        )
    );
  }

  private get condicaoFilhos() {
    return `${this.condicao}${this.revisaoNova === null ? '' : ' AND revisao = ?'}`;
  }

  private get parametrosFilhos() {
    return this.revisaoNova === null ? this.parametros : [...this.parametros, this.revisaoNova];
  }

  excluir(tabela: TabelaFilha) {
    const campo = this.colecao(tabela);
    if (this.protecao && campo) this.registros[campo] = [];
    this.statements.push(
      this.db
        .prepare(
          `DELETE FROM ${identificador(`legado_${tabela}`)} WHERE roteiro_id = ? AND EXISTS (SELECT 1 FROM legado_roteiro_personalizado WHERE ${this.condicaoFilhos})`
        )
        .bind(this.id, ...this.parametrosFilhos)
    );
  }

  inserir(tabela: TabelaFilha, rows: object[]) {
    for (const row of rows) {
      const bruto = { ...(row as Record<string, unknown>) };
      const campo = this.colecao(tabela);
      const registroId = this.registrar(campo, bruto);
      if (registroId) bruto.id = registroId;
      else delete bruto.id;
      const values = prepareWrite(tabela, { ...bruto, roteiro_id: this.id });
      const keys = Object.keys(values);
      this.statements.push(
        this.db
          .prepare(
            `INSERT INTO ${identificador(`legado_${tabela}`)} (${keys.map(identificador).join(', ')}) SELECT ${keys.map(() => '?').join(', ')} WHERE EXISTS (SELECT 1 FROM legado_roteiro_personalizado WHERE ${this.condicaoFilhos})`
          )
          .bind(...keys.map((key) => values[key]), ...this.parametrosFilhos)
      );
    }
  }

  private colecao(tabela: TabelaFilha): ColecaoRegistro | null {
    if (tabela === 'roteiro_dia') return 'dias';
    if (tabela === 'roteiro_hotel') return 'hoteis';
    if (tabela === 'roteiro_passeio') return 'passeios';
    return null;
  }

  private registrar(campo: ColecaoRegistro | null, bruto: Record<string, unknown>) {
    if (!this.protecao || !campo || !this.registros[campo]) return undefined;
    let registroId: string | undefined;
    if (bruto.id != null && bruto.id !== '') {
      const rotulo = rotuloRegistro(campo);
      if (typeof bruto.id !== 'string' || !registroOpcionalIdValido(bruto.id))
        throw new IdentificacaoRegistroError(`Identificação do ${rotulo} inválida.`);
      registroId = bruto.id.toLowerCase();
      if (this.registros[campo].some((item) => item.registro_id === registroId))
        throw new IdentificacaoRegistroError(`Identificação do ${rotulo} duplicada.`);
    }
    this.registros[campo].push({
      ...(registroId ? { registro_id: registroId } : {}),
      cidade_id: typeof bruto.cidade_id === 'string' ? bruto.cidade_id : null,
      ordem: typeof bruto.ordem === 'number' && Number.isFinite(bruto.ordem) ? bruto.ordem : null
    });
    return registroId;
  }

  private async idsDeOutroRoteiro(tabela: string, ids: string[]) {
    if (!ids.length) return false;
    const encontrados = await this.db
      .prepare(
        `SELECT id FROM ${identificador(`legado_${tabela}`)} WHERE lower(id) IN (${ids.map(() => '?').join(', ')}) AND IFNULL(roteiro_id, '') != ? LIMIT 1`
      )
      .bind(...ids, this.id)
      .all();
    return encontrados.results.length > 0;
  }

  private async validarIdsDisponiveis() {
    if (!this.protecao) return null;
    for (const [campo, tabela] of TABELAS_REGISTRO) {
      const ids = (this.registros[campo] ?? [])
        .map((item) => item.registro_id)
        .filter((id): id is string => Boolean(id));
      if (await this.idsDeOutroRoteiro(tabela, ids))
        return `Identificação do ${rotuloRegistro(campo)} pertence a outro roteiro.`;
    }
    return null;
  }

  private async remocoesDaColecao(
    campo: ColecaoRegistro,
    tabela: string
  ): Promise<ReturnType<typeof identificarRemocoesRegistros>> {
    const atuais = this.registros[campo] ?? [];
    const rows = await this.db
      .prepare(
        `SELECT id, cidade_id FROM ${identificador(`legado_${tabela}`)} WHERE roteiro_id = ? ORDER BY ordem IS NULL, ordem, id`
      )
      .bind(this.id)
      .all<{ id: string; cidade_id: string | null }>();
    const anteriores = rows.results.map((row) => ({
      registro_id: row.id.toLowerCase(),
      cidade_id: row.cidade_id
    }));
    if (atuais.length > 0 && atuais.every((item) => !item.registro_id)) {
      const posicao = (item: { cidade_id: string | null }) => ({ cidade_id: item.cidade_id });
      return identificarRemocoesRegistros(
        campo,
        await identificarRegistrosLegados(
          anteriores.map(posicao),
          campo,
          this.id,
          this.revisaoEsperada ?? ''
        ),
        await identificarRegistrosLegados(
          ordenarRegistros(atuais).map(posicao),
          campo,
          this.id,
          this.revisaoEsperada ?? ''
        )
      );
    }
    return identificarRemocoesRegistros(campo, anteriores, atuais);
  }

  private async verificarIdentidades() {
    if (!this.protecao || this.novo || this.revisaoEsperada === undefined) return null;
    const principal = await this.db
      .prepare(
        `SELECT opcionais FROM legado_roteiro_personalizado WHERE ${this.condicao} AND revisao = ?`
      )
      .bind(...this.parametros, this.revisaoEsperada)
      .first<{ opcionais: string | null }>();
    if (!principal) return null;
    const removidasFilhas = [];
    for (const [campo, tabela] of TABELAS_REGISTRO) {
      if (!(campo in this.registros)) continue;
      removidasFilhas.push(...(await this.remocoesDaColecao(campo, tabela)));
    }
    let removidasOpcionais: ReturnType<typeof identificarRemocoesOpcionais> = [];
    if (this.opcionais) {
      const opcionais: unknown = JSON.parse(principal.opcionais ?? '[]');
      const identificados = await identificarOpcionaisLegados(
        opcionais,
        this.id,
        this.revisaoEsperada
      );
      removidasOpcionais = identificarRemocoesOpcionais(
        identidadesOpcionais(identificados),
        this.opcionais
      );
    }
    const removidas = [...removidasFilhas, ...removidasOpcionais].sort((a, b) =>
      a.colecao === b.colecao
        ? a.cidade_id.localeCompare(b.cidade_id, 'en')
        : a.colecao.localeCompare(b.colecao, 'en')
    );
    return removidas.length && !confirmacaoCorresponde(this.protecao.confirmadas, removidas)
      ? removidas
      : null;
  }

  async executar() {
    if (!this.statements.length) throw new Error('Salvamento sem roteiro principal.');
    const erroIdentificacao = await this.validarIdsDisponiveis();
    if (erroIdentificacao) return { atualizado: false, revisao: null, erroIdentificacao };
    const removidas = await this.verificarIdentidades();
    if (removidas) return { atualizado: false, revisao: null, identidadesRemovidas: removidas };
    const results = await this.db.batch(this.statements);
    return {
      atualizado: results[0].meta.changes === 1,
      revisao: results[0].meta.changes === 1 ? this.revisaoNova : null
    };
  }
}
