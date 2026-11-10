/**
 * Projeta os papéis v2 de empresa na tabela explícita de permissões por módulo.
 * O perfil legado permanece OUTRO, nunca ADMIN global; o escopo continua sendo
 * limitado pelo vínculo de empresa do usuário.
 */

import { and, eq, like } from 'drizzle-orm';
import { getDb, type DrizzleDb } from '$lib/server/db/client';
import { moduloAcesso, userProfiles, userTypes, type Papel } from '$lib/server/db/schema';
import { MATRIZ_RBAC } from '$lib/server/policy/matrix';

const OUTRO_TYPE_ID = 'vtur-builtin-outro';
const V2_MODULE_PREFIX = 'v2:';
const ACTION_LEVEL: Record<string, { level: number; permission: string }> = {
  ler: { level: 1, permission: 'view' },
  criar: { level: 2, permission: 'create' },
  editar: { level: 3, permission: 'edit' },
  excluir: { level: 4, permission: 'delete' },
  gerenciar: { level: 5, permission: 'admin' }
};

/**
 * Gera statements para aplicar dentro do mesmo D1 batch da alteração de membro.
 * Cada recurso recebe apenas o nível mais alto concedido pela matriz atual.
 */
export async function buildTenantAccessProfileStatements(
  db: DrizzleDb,
  userId: string,
  papel: Papel,
  updatedAt = new Date().toISOString()
) {
  await db
    .insert(userTypes)
    .values({
      id: OUTRO_TYPE_ID,
      name: 'OUTRO',
      description: 'Perfil de empresa com capacidades explícitas por módulo.',
      createdAt: updatedAt
    })
    .onConflictDoNothing();

  const userType = await db
    .select({ id: userTypes.id })
    .from(userTypes)
    .where(eq(userTypes.name, 'OUTRO'))
    .get();
  if (!userType) throw new Error('Não foi possível preparar o tipo de usuário OUTRO.');

  const permissions = new Map<string, string>();
  for (const capability of MATRIZ_RBAC[papel]) {
    const separator = capability.lastIndexOf(':');
    const resource = capability.slice(0, separator);
    const action = capability.slice(separator + 1);
    if (action === 'exportar') {
      permissions.set(`${V2_MODULE_PREFIX}${resource}:exportar`, 'view');
      continue;
    }
    const actionLevel = ACTION_LEVEL[action];
    if (!actionLevel) continue;

    const key = `${V2_MODULE_PREFIX}${resource}`;
    const current = permissions.get(key);
    const currentLevel = current ? ACTION_LEVEL_BY_PERMISSION[current] : 0;
    if (actionLevel.level > currentLevel) permissions.set(key, actionLevel.permission);
  }

  const permissionRows = [...permissions].map(([modulo, permissao]) => ({
    id: crypto.randomUUID(),
    usuarioId: userId,
    modulo,
    permissao,
    ativo: true,
    createdAt: updatedAt,
    updatedAt
  }));

  return [
    db
      .insert(userProfiles)
      .values({
        userId,
        userTypeId: userType.id,
        usoIndividual: false,
        ativo: true,
        participaRanking: false,
        updatedAt
      })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: {
          userTypeId: userType.id,
          usoIndividual: false,
          ativo: true,
          participaRanking: false,
          updatedAt
        }
      }),
    db
      .delete(moduloAcesso)
      .where(
        and(eq(moduloAcesso.usuarioId, userId), like(moduloAcesso.modulo, `${V2_MODULE_PREFIX}%`))
      ),
    ...permissionRows.map((row) => db.insert(moduloAcesso).values(row))
  ] as const;
}

const ACTION_LEVEL_BY_PERMISSION: Record<string, number> = {
  none: 0,
  view: 1,
  create: 2,
  edit: 3,
  delete: 4,
  admin: 5
};

/** Atualiza o perfil de autorização v2 após uma mudança de papel de membro. */
export async function syncTenantAccessProfile(
  d1: D1Database,
  userId: string,
  papel: Papel,
  updatedAt?: string
): Promise<void> {
  const db = getDb(d1);
  const statements = await buildTenantAccessProfileStatements(db, userId, papel, updatedAt);
  await db.batch(
    statements as unknown as [(typeof statements)[number], ...(typeof statements)[number][]]
  );
}
