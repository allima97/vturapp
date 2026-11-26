// POST /api/v1/roteiros/gerar-ia — rascunho de roteiro gerado pelo Claude.
// A IA só preenche os campos do formulário (dias, opcionais, inclusões);
// nada é salvo aqui: o consultor revisa na tela e salva pelo fluxo normal.
import { json, type RequestEvent } from '@sveltejs/kit';
import { chaveCidadeOpcional } from '$lib/catalogoOpcionais';
import { roteiroGeograficoAtivo } from '$lib/config/destinosGeograficos';
import { registrarLog } from '$lib/server/auditLog';
import { buscarDestinosExatos } from '$lib/server/destinosBusca';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { ErroClaude, MODELO_PADRAO, chamarFerramentaClaude } from '$lib/server/roteiroIA/claude';
import { FERRAMENTA_ROTEIRO, type SaidaBrutaRoteiro } from '$lib/server/roteiroIA/esquema';
import {
  posProcessarRoteiroIA,
  validarPedidoRoteiroIA,
  type ResolverCidade
} from '$lib/server/roteiroIA/posProcessar';
import {
  PROMPT_SISTEMA_ROTEIRO,
  montarMensagemPedido,
  type CatalogoCidadeIA
} from '$lib/server/roteiroIA/prompt';
import {
  ensureModuloAccess,
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { carregarPermissaoRoteiroIA } from '$lib/server/roteiroIA/permissao';

const MAX_BODY_BYTES = 16 * 1024;
/** Gerações por usuário a cada 24 h. */
const LIMITE_DIARIO = 30;

const erro = (message: string, status: number) =>
  json({ error: message }, { status, headers: NO_STORE_HEADERS });

async function carregarCatalogo(db: D1Database, cidades: { nome: string; id: string | null }[]) {
  const catalogo: CatalogoCidadeIA[] = [];
  for (const c of cidades) {
    const r = await db
      .prepare(
        `SELECT nome, descricao FROM catalogo_opcionais
         WHERE (?1 IS NOT NULL AND cidade_id = ?1) OR (cidade_chave = ?2)
         ORDER BY nome LIMIT 25`
      )
      .bind(c.id, chaveCidadeOpcional(c.nome))
      .all<{ nome: string; descricao: string | null }>();
    catalogo.push({
      cidade: c.nome,
      passeios: (r.results || []).map((p: { nome: string; descricao: string | null }) => ({
        nome: p.nome,
        descricao: p.descricao || ''
      }))
    });
  }
  return catalogo;
}

export async function handleRoteirosGerarIaPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    ensureModuloAccess(scope, ['Orcamentos'], 2, 'Sem acesso para criar Roteiros.');

    const env = event.platform?.env;
    const apiKey = env?.ANTHROPIC_API_KEY?.trim();
    if (!apiKey)
      return erro('Geração com IA não configurada (falta ANTHROPIC_API_KEY no servidor).', 503);
    const modelo = env?.ROTEIRO_IA_MODELO?.trim() || MODELO_PADRAO;

    // Liberação por usuário: o admin decide quem pode usar a IA. Admins
    // sempre podem (mesma regra do resto do sistema), os demais precisam de
    // uma liberação explícita em /admin/permissoes/<usuario>.
    const permissaoIA = await carregarPermissaoRoteiroIA(env?.DB, user.id);
    if (!scope.isAdmin && !permissaoIA.liberado)
      return erro(
        'A geração de roteiro por IA ainda não está liberada para o seu usuário. Fale com o administrador.',
        403
      );

    const limiteDiaEfetivo = permissaoIA.limiteDia ?? LIMITE_DIARIO;
    const limiteDia = await checkPersistentRateLimit(
      'roteiro-ia-dia',
      user.id,
      { max: limiteDiaEfetivo, windowMs: 24 * 60 * 60_000 },
      env?.DB
    );
    if (!limiteDia.allowed)
      return erro(
        `Limite de ${limiteDiaEfetivo} geração(ões) por dia atingido. Tente novamente mais tarde.`,
        429
      );

    if (permissaoIA.limiteMes != null) {
      const limiteMes = await checkPersistentRateLimit(
        'roteiro-ia-mes',
        user.id,
        { max: permissaoIA.limiteMes, windowMs: 30 * 24 * 60 * 60_000 },
        env?.DB
      );
      if (!limiteMes.allowed)
        return erro(
          `Limite de ${permissaoIA.limiteMes} geração(ões) por mês atingido. Tente novamente mais tarde.`,
          429
        );
    }

    const pedido = validarPedidoRoteiroIA(bodyResult.data);
    if (typeof pedido === 'string') return erro(pedido, 400);

    // Cidades conferidas na base geográfica (quando ativa) — mesma busca da tela.
    const geoDb = roteiroGeograficoAtivo ? env?.GEO_DB : undefined;
    const resolverCidade: ResolverCidade = async (nome) => {
      if (!geoDb) return null;
      const { items } = await buscarDestinosExatos(geoDb, nome, 'pt', '', 0);
      const primeiro = items[0];
      return primeiro ? { cidade: primeiro.nome, cidade_id: primeiro.id, geografica: true } : null;
    };

    const destinosResolvidos = await Promise.all(
      pedido.destinos.map(async (nome) => {
        const r = await resolverCidade(nome).catch(() => null);
        return { nome: r?.cidade || nome, id: r?.cidade_id ?? null };
      })
    );
    const catalogo = env?.DB ? await carregarCatalogo(env.DB, destinosResolvidos) : [];

    const mensagem = montarMensagemPedido(pedido, catalogo);
    let rascunho;
    let ultimaFalha: unknown;
    let uso = {};
    let modeloUsado = modelo;
    // Uma nova tentativa automática se a IA falhar de forma recuperável
    // ou devolver algo que não passa na validação.
    for (let tentativa = 1; tentativa <= 2 && !rascunho; tentativa++) {
      try {
        const resultado = await chamarFerramentaClaude({
          apiKey,
          modelo,
          sistema: PROMPT_SISTEMA_ROTEIRO,
          mensagem,
          ferramenta: FERRAMENTA_ROTEIRO
        });
        uso = resultado.uso;
        modeloUsado = resultado.modelo;
        rascunho = await posProcessarRoteiroIA(
          resultado.entrada as SaidaBrutaRoteiro,
          pedido,
          resolverCidade,
          resultado.modelo
        );
      } catch (err) {
        ultimaFalha = err;
        if (err instanceof ErroClaude && !err.tentarDeNovo) break;
      }
    }
    if (!rascunho) {
      if (ultimaFalha instanceof ErroClaude) return erro(ultimaFalha.message, ultimaFalha.status);
      logServerError('[roteiro-ia] saída inválida da IA', ultimaFalha);
      return erro('A IA não conseguiu montar um roteiro válido. Tente novamente.', 502);
    }

    // Auditoria sem dados de cliente: só o pedido de viagem e o consumo.
    registrarLog(event, {
      userId: user.id,
      modulo: 'Roteiros',
      acao: 'roteiro_ia_gerado',
      detalhes: {
        modelo: modeloUsado,
        destinos: pedido.destinos,
        data_inicio: pedido.data_inicio,
        data_fim: pedido.data_fim,
        dias: rascunho.dias.length,
        opcionais: rascunho.opcionais.reduce((s, g) => s + g.passeios.length, 0),
        uso
      }
    });

    return json(rascunho, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logServerError('[roteiro-ia] falha ao gerar roteiro', err);
    return toErrorResponse(err, 'Erro ao gerar roteiro com IA.');
  }
}
