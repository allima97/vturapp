// Migrado para Hono de src/routes/api/v1/pagamentos/upload/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { readFormDataBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { validateUploadedFile } from '$lib/server/uploadValidation';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import {
  invalidateReadModelCache,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_REQUEST_SIZE_BYTES = MAX_FILE_SIZE_BYTES + 512 * 1024;

function invalidatePagamentoReadModels(companyId: string | null | undefined, userId: string) {
  invalidateReadModelCache({
    tags: [
      READ_MODEL_TAGS.payments,
      READ_MODEL_TAGS.sales,
      READ_MODEL_TAGS.finance,
      READ_MODEL_TAGS.dashboard,
      READ_MODEL_TAGS.vendasKpis,
      READ_MODEL_TAGS.ranking,
      READ_MODEL_TAGS.comissoes
    ],
    scopeTags: scopeCacheTags({ companyIds: companyId ? [companyId] : [], userId })
  });
}

// POST - Upload de comprovante de pagamento (armazena no bucket viagens-documentos)
export async function handlePagamentosUploadPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    ensureModuloAccess(scope, ['financeiro'], 2, 'Sem permissão para anexar comprovantes.');

    const formDataResult = await readFormDataBodyLimited(
      event.request,
      MAX_REQUEST_SIZE_BYTES,
      'Arquivo muito grande. Tamanho máximo: 5MB.'
    );
    if (!formDataResult.ok) return formDataResult.response;
    const formData = formDataResult.formData;
    const file = formData.get('file') as File;
    const pagamentoId = formData.get('pagamento_id') as string;

    if (!file || !pagamentoId) {
      return json(
        { success: false, error: 'Arquivo e ID do pagamento são obrigatórios.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!isUuid(String(pagamentoId || '').trim())) {
      return json(
        { success: false, error: 'ID do pagamento inválido.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { data: pagamentoAtual, error: pagamentoAtualError } = await client
      .from('vendas_pagamentos')
      .select('id, company_id')
      .eq('id', pagamentoId)
      .maybeSingle();
    if (pagamentoAtualError) throw pagamentoAtualError;
    if (!pagamentoAtual) {
      return json(
        { success: false, error: 'Pagamento não encontrado.' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const targetCompanyId = String(
      (pagamentoAtual as { company_id?: string | null })?.company_id || ''
    ).trim();
    if (!scope.isAdmin) {
      const allowedCompanyIds = resolveScopedCompanyIds(scope, null);
      if (
        !targetCompanyId ||
        allowedCompanyIds.length === 0 ||
        !allowedCompanyIds.includes(targetCompanyId)
      ) {
        return json(
          { success: false, error: 'Pagamento fora do escopo da empresa.' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }
    }

    const validation = await validateUploadedFile(file, {
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      maxSizeBytes: MAX_FILE_SIZE_BYTES
    });
    if (!validation.ok) {
      const error =
        validation.error === 'Arquivo muito grande.'
          ? 'Arquivo muito grande. Tamanho máximo: 5MB.'
          : 'Tipo de arquivo não permitido. Use JPG, PNG, WebP ou PDF.';
      return json({ success: false, error }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const timestamp = Date.now();
    const fileName = `comprovantes/${pagamentoId}/${timestamp}-${crypto.randomUUID()}.${validation.extension}`;

    const { error: uploadError } = await client.storage
      .from('viagens-documentos')
      .upload(fileName, file, { contentType: validation.mimeType, upsert: false });

    if (uploadError) throw uploadError;

    const { data: signedData } = await client.storage
      .from('viagens-documentos')
      .createSignedUrl(fileName, 60 * 60);
    const comprovanteUrl = signedData?.signedUrl || null;
    const comprovanteRef = `storage://viagens-documentos/${fileName}`;

    // Guarda uma referência interna; o acesso real deve ocorrer por URL assinada.
    const { data: pagamento, error: updateError } = await client
      .from('vendas_pagamentos')
      .update({ observacoes: comprovanteRef, updated_at: new Date().toISOString() })
      .eq('id', pagamentoId)
      .select('id, venda_id, company_id, observacoes, updated_at')
      .single();

    if (updateError) {
      await client.storage
        .from('viagens-documentos')
        .remove([fileName])
        .catch(() => undefined);
      throw updateError;
    }

    invalidatePagamentoReadModels(targetCompanyId, user.id);
    return json(
      { success: true, item: pagamento, comprovante_url: comprovanteUrl },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao fazer upload do comprovante.');
  }
}
