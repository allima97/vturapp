import { prepareWrite } from '$lib/server/data/query';
import {
  confirmacaoCorresponde,
  identificarRemocoes,
  identificarRemocoesOpcionais,
  type ColecaoIdentidade
} from '$lib/roteiroIdentidadesRemovidas';
import { registroOpcionalIdValido } from '$lib/roteiroOpcionais';
import { identificarOpcionaisLegados } from '$lib/server/roteiroOpcionaisLegados';

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
  private readonly identidades: Partial<Record<ColecaoIdentidade, (string | null)[]>> = {};
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
    if (this.protecao && campo) this.identidades[campo] = [];
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
      const values = prepareWrite(tabela, { ...row, roteiro_id: this.id });
      const campo = this.colecao(tabela);
      if (this.protecao && campo && this.identidades[campo])
        this.identidades[campo].push(
          typeof values.cidade_id === 'string' ? values.cidade_id : null
        );
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

  private colecao(tabela: TabelaFilha): ColecaoIdentidade | null {
    if (tabela === 'roteiro_dia') return 'dias';
    if (tabela === 'roteiro_hotel') return 'hoteis';
    if (tabela === 'roteiro_passeio') return 'passeios';
    return null;
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
    const anteriores: Partial<Record<ColecaoIdentidade, (string | null)[]>> = {};
    for (const [campo, tabela] of [
      ['dias', 'roteiro_dia'],
      ['hoteis', 'roteiro_hotel'],
      ['passeios', 'roteiro_passeio']
    ] as const) {
      if (!(campo in this.identidades)) continue;
      const rows = await this.db
        .prepare(`SELECT cidade_id FROM ${identificador(`legado_${tabela}`)} WHERE roteiro_id = ?`)
        .bind(this.id)
        .all<{ cidade_id: string | null }>();
      anteriores[campo] = rows.results.map((row) => row.cidade_id);
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
    const removidas = [
      ...identificarRemocoes(anteriores, this.identidades),
      ...removidasOpcionais
    ].sort((a, b) =>
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
    const removidas = await this.verificarIdentidades();
    if (removidas) return { atualizado: false, revisao: null, identidadesRemovidas: removidas };
    const results = await this.db.batch(this.statements);
    return {
      atualizado: results[0].meta.changes === 1,
      revisao: results[0].meta.changes === 1 ? this.revisaoNova : null
    };
  }
}
