import {
  ensureModuloAccess,
  getAdminClient,
  NO_MATCH_COMPANY_ID,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  type UserScope
} from '$lib/server/v1';
import type { RequestEvent } from '@sveltejs/kit';

type DadosAdminClient = ReturnType<typeof getAdminClient>;

type MuralAttachmentRow = Record<string, unknown> & {
  storage_bucket?: string | null;
  storage_path?: string | null;
  download_url?: string | null;
};

type MuralRecadoRow = Record<string, unknown> & {
  arquivos?: MuralAttachmentRow[] | null;
};

type MuralAttachmentWithStorage = MuralAttachmentRow & {
  storage_bucket: string;
  storage_path: string;
};

function hasAttachmentStorage(arquivo: MuralAttachmentRow): arquivo is MuralAttachmentWithStorage {
  return Boolean(arquivo?.storage_bucket && arquivo?.storage_path);
}

export const PRIVATE_JSON_SHORT_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, max-age=5',
  Vary: 'Cookie'
};

export const NO_STORE_JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Vary: 'Cookie'
};

export const NO_STORE_TEXT_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-store',
  Vary: 'Cookie'
};

export function privateJsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: PRIVATE_JSON_SHORT_HEADERS
  });
}

export function noStoreJsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: NO_STORE_JSON_HEADERS
  });
}

export function noStoreTextResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: NO_STORE_TEXT_HEADERS
  });
}

export async function requireMuralScope(event: RequestEvent, minLevel = 1) {
  const client = getAdminClient();
  const user = await requireAuthenticatedUser(event);
  const scope = await resolveUserScope(client, user.id);

  if (!scope.isAdmin) {
    ensureModuloAccess(
      scope,
      ['operacao_recados'],
      minLevel,
      minLevel >= 2 ? 'Sem permissão para gerenciar recados.' : 'Sem acesso ao Mural de Recados.'
    );
  }

  return { client, user, scope };
}

export async function assertCompanyAccess(
  _client: DadosAdminClient,
  scope: UserScope,
  companyId: string
) {
  if (scope.isAdmin) return null;

  const scopedCompanyIds = resolveScopedCompanyIds(scope, companyId);
  const allowed =
    scopedCompanyIds.length > 0 &&
    scopedCompanyIds[0] !== NO_MATCH_COMPANY_ID &&
    scopedCompanyIds.includes(companyId);
  if (!allowed) return noStoreTextResponse('Sem acesso a empresa.', 403);

  return null;
}

export async function fetchRecados(client: DadosAdminClient, companyId: string) {
  const baseSelect =
    'id, company_id, sender_id, receiver_id, assunto, conteudo, created_at, sender_deleted, receiver_deleted, sender:sender_id(id, nome_completo, email), receiver:receiver_id(id, nome_completo, email), leituras:mural_recados_leituras(read_at, user_id, user:user_id(id, nome_completo, email))';
  const selectWithAttachments = `${baseSelect}, arquivos:mural_recados_arquivos(id, company_id, recado_id, uploaded_by, file_name, storage_bucket, storage_path, mime_type, size_bytes, created_at)`;

  const fetchRows = async (select: string) =>
    client
      .from('mural_recados')
      .select(select)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(100);

  let supportsAttachments = true;
  let resp = await fetchRows(selectWithAttachments);
  if (resp.error) {
    const msg = String(resp.error.message || '').toLowerCase();
    if (msg.includes('mural_recados_arquivos')) {
      supportsAttachments = false;
      resp = await fetchRows(baseSelect);
    }
  }
  if (resp.error) throw resp.error;

  const recados = (resp.data || []) as unknown as MuralRecadoRow[];
  return {
    recados: await withSignedAttachmentUrls(client, recados),
    supportsAttachments
  };
}

async function withSignedAttachmentUrls(client: DadosAdminClient, recados: MuralRecadoRow[]) {
  const files = recados.flatMap((recado) =>
    (recado.arquivos || []).filter(hasAttachmentStorage).map((arquivo) => ({ recado, arquivo }))
  );

  await Promise.all(
    files.map(async ({ arquivo }) => {
      try {
        const { data } = await client.storage
          .from(arquivo.storage_bucket)
          .createSignedUrl(arquivo.storage_path, 15 * 60);
        arquivo.download_url = data?.signedUrl || null;
      } catch {
        arquivo.download_url = null;
      }
    })
  );

  return recados;
}

export async function fetchUsuariosEmpresa(client: DadosAdminClient, companyId: string) {
  const { data, error } = await client
    .from('users')
    .select('id, nome_completo, email, user_types(name)')
    .eq('company_id', companyId)
    .eq('uso_individual', false)
    .eq('active', true)
    .order('nome_completo', { ascending: true });
  if (error) throw error;
  return data || [];
}
