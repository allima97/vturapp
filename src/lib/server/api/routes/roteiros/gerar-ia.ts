// POST /api/v1/roteiros/gerar-ia — rascunho de roteiro gerado pelo Claude.
// A IA só preenche os campos do formulário (dias, opcionais, inclusões);
// nada é salvo no roteiro aqui: o consultor revisa na tela e salva pelo
// fluxo normal.
//
// Economia de tokens (ver reaproveitamento.ts):
// - pedido idêntico já gerado (mesmos destinos/duração/viajantes/perfil/
//   observações/catálogo/modelo, em QUALQUER data) volta do cache, sem IA e
//   sem contar no limite do usuário — a menos que ele peça "versão nova";
// - opcionais de catálogo/biblioteca vão e voltam só como código;
// - sem nova tentativa depois de timeout (a chamada pode ter sido cobrada).
import { json, type RequestEvent } from '@sveltejs/kit';
import { roteiroGeograficoAtivo } from '$lib/config/destinosGeograficos';
import { registrarLog } from '$lib/server/auditLog';
import { buscarDestinosExatos } from '$lib/server/destinosBusca';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { ErroClaude, type UsoClaude } from '$lib/server/roteiroIA/claude';
import {
  carregarConfigIA,
  chaveDoProvedor,
  custoEstimadoUSD,
  gerarComIA
} from '$lib/server/roteiroIA/provedores';
import {
  FERRAMENTA_ROTEIRO,
  type SaidaBrutaRoteiro,
  type SaidaNormalizada
} from '$lib/server/roteiroIA/esquema';
import {
  normalizarSaidaIA,
  posProcessarRoteiroIA,
  validarPedidoRoteiroIA,
  type ResolverCidade
} from '$lib/server/roteiroIA/posProcessar';
import {
  PROMPT_SISTEMA_ROTEIRO,
  diasDoPedido,
  montarMensagemPedido
} from '$lib/server/roteiroIA/prompt';
import {
  carregarReferencias,
  chaveCacheRoteiro,
  gravarBibliotecaOpcionais,
  gravarCacheRoteiro,
  lerCacheRoteiro
} from '$lib/server/roteiroIA/reaproveitamento';
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

/** Teto de saída proporcional ao roteiro (protege contra respostas que não param). */
const maxTokensPara = (dias: number, destinos: number) =>
  Math.min(16_000, 1_500 + dias * 220 + destinos * 350);

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
    // Provedor/modelo escolhidos pelo admin em /admin/ia (Claude ou Groq).
    const config = await carregarConfigIA(env?.DB, env);
    const modelo = config.modelo.id;
    const apiKey = chaveDoProvedor(env, config.modelo.provedor);
    if (!apiKey)
      return erro(
        `Geração com IA não configurada (falta ${config.modelo.provedor === 'groq' ? 'GROQ_API_KEY' : 'ANTHROPIC_API_KEY'} no servidor).`,
        503
      );

    // Liberação por usuário: o admin decide quem pode usar a IA. Admins
    // sempre podem (mesma regra do resto do sistema), os demais precisam de
    // uma liberação explícita em /admin/permissoes/<usuario>.
    const permissaoIA = await carregarPermissaoRoteiroIA(env?.DB, user.id);
    if (!scope.isAdmin && !permissaoIA.liberado)
      return erro(
        'A geração de roteiro por IA ainda não está liberada para o seu usuário. Fale com o administrador.',
        403
      );

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

    const destinos = await Promise.all(
      pedido.destinos.map(async (nome) => {
        const r = await resolverCidade(nome).catch(() => null);
        return { nome: r?.cidade || nome, id: r?.cidade_id ?? null };
      })
    );
    const referencias = await carregarReferencias(env?.DB, destinos);
    const chave = await chaveCacheRoteiro({ pedido, destinos, referencias, modelo });

    // ── 1. Reaproveitamento: mesmo pedido já gerado → zero tokens ─────────
    if (!pedido.nova_versao) {
      const guardado = await lerCacheRoteiro(env?.DB, chave);
      if (guardado) {
        try {
          const rascunho = await posProcessarRoteiroIA(guardado, pedido, resolverCidade, modelo);
          registrarLog(event, {
            userId: user.id,
            modulo: 'Roteiros',
            acao: 'roteiro_ia_reaproveitado',
            detalhes: {
              modelo,
              destinos: pedido.destinos,
              dias: rascunho.dias.length,
              custo_estimado_usd: 0
            }
          });
          return json({ ...rascunho, reaproveitado: true }, { headers: NO_STORE_HEADERS });
        } catch (err) {
          // Guardado inválido para este pedido: segue para uma geração nova.
          logServerError('[roteiro-ia] resultado guardado inválido', err);
        }
      }
    }

    // ── 2. Limites: só contam gerações que chamam a IA ────────────────────
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

    // ── 3. Geração ────────────────────────────────────────────────────────
    const totalDias = diasDoPedido(pedido);
    const mensagem = montarMensagemPedido(
      { ...pedido, destinos: destinos.map((d) => d.nome) },
      referencias
    );
    let rascunho;
    let normalizada: SaidaNormalizada | null = null;
    let usadasBiblioteca: ReturnType<typeof normalizarSaidaIA>['usadasBiblioteca'] = [];
    let ultimaFalha: unknown;
    const usos: UsoClaude[] = [];
    let modeloUsado = modelo;
    // Nova tentativa só quando a falha não foi cobrada (IA ocupada/indisponível)
    // ou quando a resposta veio inutilizável. Timeout não repete: a primeira
    // chamada pode ter sido cobrada inteira e a tela já estaria no limite.
    for (let tentativa = 1; tentativa <= 2 && !rascunho; tentativa++) {
      try {
        const resultado = await gerarComIA({
          modelo: config.modelo,
          apiKey,
          sistema: PROMPT_SISTEMA_ROTEIRO,
          mensagem,
          ferramenta: FERRAMENTA_ROTEIRO,
          maxTokens: maxTokensPara(totalDias, destinos.length)
        });
        usos.push(resultado.uso);
        modeloUsado = resultado.modelo;
        const n = normalizarSaidaIA(resultado.entrada as SaidaBrutaRoteiro, referencias, totalDias);
        normalizada = n.saida;
        usadasBiblioteca = n.usadasBiblioteca;
        rascunho = await posProcessarRoteiroIA(
          normalizada,
          pedido,
          resolverCidade,
          resultado.modelo
        );
      } catch (err) {
        ultimaFalha = err;
        if (err instanceof ErroClaude && (!err.tentarDeNovo || err.status === 504)) break;
      }
    }
    if (!rascunho || !normalizada) {
      if (ultimaFalha instanceof ErroClaude) return erro(ultimaFalha.message, ultimaFalha.status);
      logServerError('[roteiro-ia] saída inválida da IA', ultimaFalha);
      return erro('A IA não conseguiu montar um roteiro válido. Tente novamente.', 502);
    }

    const uso = usos.reduce<Required<UsoClaude>>(
      (t, u) => ({
        input_tokens: t.input_tokens + (u.input_tokens || 0),
        output_tokens: t.output_tokens + (u.output_tokens || 0),
        cache_creation_input_tokens:
          t.cache_creation_input_tokens + (u.cache_creation_input_tokens || 0),
        cache_read_input_tokens: t.cache_read_input_tokens + (u.cache_read_input_tokens || 0)
      }),
      {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      }
    );

    // Guarda para os próximos pedidos iguais e alimenta a biblioteca da cidade.
    await Promise.all([
      gravarCacheRoteiro(env?.DB, { chave, modelo: modeloUsado, saida: normalizada, uso }),
      gravarBibliotecaOpcionais(env?.DB, normalizada, destinos, usadasBiblioteca)
    ]);

    // Auditoria sem dados de cliente: só o pedido de viagem e o consumo.
    registrarLog(event, {
      userId: user.id,
      modulo: 'Roteiros',
      acao: 'roteiro_ia_gerado',
      detalhes: {
        provedor: config.modelo.provedor,
        modelo: modeloUsado,
        destinos: pedido.destinos,
        data_inicio: pedido.data_inicio,
        data_fim: pedido.data_fim,
        dias: rascunho.dias.length,
        opcionais: rascunho.opcionais.reduce((s, g) => s + g.passeios.length, 0),
        referencias: referencias.length,
        tentativas: usos.length,
        nova_versao: Boolean(pedido.nova_versao),
        uso,
        custo_estimado_usd: custoEstimadoUSD(modelo, uso)
      }
    });

    return json({ ...rascunho, reaproveitado: false }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logServerError('[roteiro-ia] falha ao gerar roteiro', err);
    return toErrorResponse(err, 'Erro ao gerar roteiro com IA.');
  }
}
