// Migrado para Hono de src/routes/api/v1/conciliacao/status-cronologico/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyId,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { diagnosticarLacunasCronologicas } from '$lib/server/conciliacaoReconcile';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';

/**
 * GET /api/v1/conciliacao/status-cronologico?company_id=...
 *
 * Retorna o diagnóstico completo de lacunas cronológicas para a empresa:
 * - fronteira: último dia com sequência contínua (conciliação liberada até aqui)
 * - dias_faltantes: dias que precisam ser importados para desbloquear
 * - dias_bloqueados: dias já importados mas bloqueados (após lacuna)
 * - dias_importados: todos os dias distintos importados
 * - registros_bloqueados: quantidade de registros pendentes de conciliação bloqueados
 * - aviso: mensagem humanizada para exibir ao usuário
 * - ok: true se não há nenhuma lacuna
 *
 * Use este endpoint ao carregar a tela de importação ou de conciliação para
 * informar proativamente o usuário sobre o que precisa ser importado.
 */
export async function handleConciliacaoStatusCronologicoGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(scope, ['operacao_conciliacao', 'conciliacao'], 1, 'Sem acesso à Conciliação.');
    }

    const { searchParams } = event.url;
    const companyId = resolveScopedCompanyId(scope, searchParams.get('company_id'));

    if (!companyId) return json({ error: 'Selecione uma empresa para verificar a conciliação.' }, { status: 400, headers: NO_STORE_HEADERS });

    const diagnostico = await diagnosticarLacunasCronologicas({ client, companyId });

    const fmt = (d: string) => {
      const [y, m, dia] = d.split('-');
      return `${dia}/${m}/${y}`;
    };

    const temLacuna = diagnostico.diasFaltantes.length > 0;

    const aviso = temLacuna
      ? `A conciliação está bloqueada a partir de ${fmt(diagnostico.fronteira!)}. ` +
        `Arquivos faltantes: ${diagnostico.diasFaltantes.map(fmt).join(', ')}. ` +
        `${diagnostico.registrosBloqueados} registro(s) aguardando nesses dias bloqueados.`
      : diagnostico.fronteira
        ? `Sequência de importação OK até ${fmt(diagnostico.fronteira)}. Nenhuma lacuna detectada.`
        : 'Nenhum arquivo importado ainda.';

    return json({
      ok: !temLacuna,
      fronteira: diagnostico.fronteira,
      dias_importados: diagnostico.diasImportados,
      dias_faltantes: diagnostico.diasFaltantes,
      dias_bloqueados: diagnostico.diasBloqueados,
      dias_sem_movimento: diagnostico.diasSemMovimento,
      registros_bloqueados: diagnostico.registrosBloqueados,
      aviso
    }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao verificar status cronológico da conciliação.');
  }
}
