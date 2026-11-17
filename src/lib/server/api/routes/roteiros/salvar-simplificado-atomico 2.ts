import { normalizeNamePtBr } from '$lib/server/data/legado-rules';

type Dia = { cidade?: unknown; cidade_id?: unknown; data?: unknown; descricao?: unknown };

export async function salvarRoteiroSimplificadoAtomico(
  db: D1Database,
  input: {
    id: string | null;
    userId: string;
    companyId: string | null;
    nome: string;
    duracao: unknown;
    inicioCidade: unknown;
    fimCidade: unknown;
    dias: unknown[];
  }
): Promise<string | null> {
  const id = input.id ?? crypto.randomUUID();
  const duracao = Number(input.duracao || 0) || null;
  const inicio = String(input.inicioCidade || '').trim() || null;
  const fim = String(input.fimCidade || '').trim() || null;
  const nome = normalizeNamePtBr(input.nome);
  const statements: D1PreparedStatement[] = [
    input.id
      ? db
          .prepare(
            'UPDATE legado_roteiro_personalizado SET nome = ?, duracao = ?, inicio_cidade = ?, fim_cidade = ?, updated_at = ? WHERE id = ? AND created_by = ?'
          )
          .bind(nome, duracao, inicio, fim, new Date().toISOString(), id, input.userId)
      : db
          .prepare(
            "INSERT INTO legado_roteiro_personalizado (id, created_by, company_id, nome, duracao, inicio_cidade, fim_cidade, opcionais) VALUES (?, ?, ?, ?, ?, ?, ?, '[]')"
          )
          .bind(id, input.userId, input.companyId, nome, duracao, inicio, fim)
  ];
  if (input.dias.length) {
    statements.push(
      db
        .prepare(
          'DELETE FROM legado_roteiro_dia WHERE roteiro_id = ? AND EXISTS (SELECT 1 FROM legado_roteiro_personalizado WHERE id = ? AND created_by = ?)'
        )
        .bind(id, id, input.userId)
    );
    for (const [index, raw] of input.dias.entries()) {
      const dia: Dia = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      statements.push(
        db
          .prepare(
            'INSERT INTO legado_roteiro_dia (id, roteiro_id, created_by, company_id, ordem, cidade, cidade_id, data, descricao) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM legado_roteiro_personalizado WHERE id = ? AND created_by = ?)'
          )
          .bind(
            crypto.randomUUID(),
            id,
            input.userId,
            input.companyId,
            index + 1,
            String(dia.cidade || '').trim(),
            typeof dia.cidade_id === 'string' ? dia.cidade_id : null,
            typeof dia.data === 'string' ? dia.data : null,
            String(dia.descricao || '').trim(),
            id,
            input.userId
          )
      );
    }
  }
  const results = await db.batch(statements);
  return results[0].meta.changes === 1 ? id : null;
}
