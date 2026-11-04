import type { DataClient } from '$lib/server/data';
import {
  isViagemStatusPersisted,
  resolveViagemStatus,
  type StatusViagem
} from '$lib/viagens/status';
import { logServerError } from '$lib/server/v1';
import { chunkArray } from '$lib/utils/array';

type ViagemStatusRow = {
  id?: string | null;
  status?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
};

export function resolveStatusFromViagemRow(row: ViagemStatusRow): StatusViagem {
  return resolveViagemStatus({
    status: row?.status,
    data_inicio: row?.data_inicio,
    data_fim: row?.data_fim
  });
}

export async function syncViagemStatusIfNeeded(client: DataClient, row: ViagemStatusRow) {
  const id = String(row?.id || '').trim();
  if (!id) return resolveStatusFromViagemRow(row);

  const resolvedStatus = resolveStatusFromViagemRow(row);
  if (isViagemStatusPersisted(row?.status, resolvedStatus)) return resolvedStatus;

  const { error } = await client
    .from('viagens')
    .update({
      status: resolvedStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    logServerError('[viagens] falha ao sincronizar status', error, { id });
  } else {
    row.status = resolvedStatus;
  }

  return resolvedStatus;
}

export async function syncViagensStatus(client: DataClient, rows: ViagemStatusRow[]) {
  const statuses = new Map<string, StatusViagem>();
  const pendingUpdates = new Map<StatusViagem, string[]>();

  for (const row of rows || []) {
    const id = String(row?.id || '').trim();
    const status = resolveStatusFromViagemRow(row);
    if (id) statuses.set(id, status);
    if (id && !isViagemStatusPersisted(row?.status, status)) {
      const ids = pendingUpdates.get(status) || [];
      ids.push(id);
      pendingUpdates.set(status, ids);
    }
  }

  const updatedAt = new Date().toISOString();
  await Promise.all(
    Array.from(pendingUpdates.entries()).flatMap(([status, ids]) =>
      chunkArray(ids).map(async (batch) => {
        const { error } = await client
          .from('viagens')
          .update({
            status,
            updated_at: updatedAt
          })
          .in('id', batch);

        if (error) {
          logServerError('[viagens] falha ao sincronizar status em lote', error, {
            status,
            count: batch.length
          });
        }
      })
    )
  );

  for (const row of rows || []) {
    const id = String(row?.id || '').trim();
    const status = id ? statuses.get(id) : null;
    if (status) row.status = status;
  }

  return statuses;
}
