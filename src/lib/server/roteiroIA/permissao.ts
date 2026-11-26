// Liberação e limites de geração de roteiro por IA, configurados pelo admin
// por usuário (tabela roteiro_ia_permissoes — ver drizzle/0034_*).
// Sem linha para o usuário = não liberado. limite_dia/limite_mes nulos =
// sem limite específico configurado (usa o padrão de segurança do código).

export type RoteiroIaPermissao = {
  liberado: boolean;
  limiteDia: number | null;
  limiteMes: number | null;
};

const SEM_PERMISSAO: RoteiroIaPermissao = { liberado: false, limiteDia: null, limiteMes: null };

export async function carregarPermissaoRoteiroIA(
  db: D1Database | undefined,
  userId: string
): Promise<RoteiroIaPermissao> {
  if (!db) return SEM_PERMISSAO;
  try {
    const row = await db
      .prepare('SELECT liberado, limite_dia, limite_mes FROM roteiro_ia_permissoes WHERE user_id = ?')
      .bind(userId)
      .first<{ liberado: number | null; limite_dia: number | null; limite_mes: number | null }>();
    if (!row) return SEM_PERMISSAO;
    return {
      liberado: Boolean(row.liberado),
      limiteDia:
        typeof row.limite_dia === 'number' && Number.isFinite(row.limite_dia)
          ? row.limite_dia
          : null,
      limiteMes:
        typeof row.limite_mes === 'number' && Number.isFinite(row.limite_mes)
          ? row.limite_mes
          : null
    };
  } catch {
    // Tabela ainda não migrada ou indisponível: trata como não liberado em vez
    // de derrubar a geração com um erro confuso.
    return SEM_PERMISSAO;
  }
}

export type RoteiroIaPermissaoInput = {
  liberado: boolean;
  limiteDia: number | null;
  limiteMes: number | null;
};

/** Normaliza um limite vindo do formulário do admin: vazio/inválido/≤0 vira "sem limite". */
export function normalizarLimiteRoteiroIA(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.trunc(n), 100000);
}

export async function salvarPermissaoRoteiroIA(
  db: D1Database,
  userId: string,
  updatedBy: string,
  input: RoteiroIaPermissaoInput
) {
  await db
    .prepare(
      `INSERT INTO roteiro_ia_permissoes (user_id, liberado, limite_dia, limite_mes, updated_by, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT (user_id) DO UPDATE SET
         liberado = excluded.liberado,
         limite_dia = excluded.limite_dia,
         limite_mes = excluded.limite_mes,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`
    )
    .bind(userId, input.liberado ? 1 : 0, input.limiteDia, input.limiteMes, updatedBy)
    .run();
}
