/**
 * kvInvalidation.ts
 *
 * Invalidação distribuída via Cloudflare KV.
 *
 * PROBLEMA:
 *   Em Cloudflare Workers, cada instância tem seu próprio Map em memória.
 *   Quando uma venda é salva e o cache é invalidado via invalidateSalesReadModels(),
 *   apenas a instância que processou o request tem seu cache limpo.
 *   Outras instâncias continuam servindo dados stale até o TTL expirar (30s).
 *
 * SOLUÇÃO:
 *   Armazenamos um "epoch de invalidação" no KV, com TTL curto.
 *   Cada instância verifica o epoch do KV periodicamente (no início de requests críticos).
 *   Se o epoch do KV for maior que o epoch local, a instância invalida seu cache.
 *
 * TRADE-OFFS:
 *   - Latência: 1 leitura KV por verificação (~1-5ms p/ Cloudflare KV)
 *   - Consistência: eventual — pode levar até POLL_INTERVAL_MS para propagar
 *   - Não requer bindings extras além do KV namespace "KV_CACHE"
 *
 * CONFIGURAÇÃO (wrangler.toml):
 *   [[kv_namespaces]]
 *   binding = "KV_BINDING"
 *   id = "60fa423718914712bec4f489d41c3dd6"
 */

import {
  getCachedReadModel,
  invalidateReadModelCache,
  READ_MODEL_TAGS,
  registerSalesInvalidationPublisher
} from '$lib/server/readModelCache';
import { logServerError } from '$lib/server/v1';

const KV_EPOCH_KEY = 'invalidation:sales:epoch';
// Verificar KV a cada 2s: reduz a janela de inconsistência cross-instance de 5s para 2s.
// O overhead é mínimo — leitura KV é ~1ms e fire-and-forget (não bloqueia requests).
const POLL_INTERVAL_MS = 2_000;
const KV_EPOCH_TTL_SECONDS = 300; // TTL de 5 minutos no KV (apenas para limpeza automática)

// Estado local da instância
let localEpoch = 0;
let lastKvCheckAt = 0;
let kvNamespaceRef: KVNamespace | null = null;

export type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

function isKVNamespace(value: unknown): value is KVNamespace {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { get?: unknown }).get === 'function' &&
    typeof (value as { put?: unknown }).put === 'function'
  );
}

/**
 * Inicializa a referência ao KV namespace.
 * Deve ser chamado com o env do Worker (event.platform.env).
 * Idempotente — só guarda a referência na primeira chamada.
 */
export function initKvNamespace(env: Record<string, unknown> | null | undefined) {
  if (!env) return;
  const kv = env.KV_BINDING;
  if (isKVNamespace(kv)) {
    kvNamespaceRef = kv;
  }
}

/**
 * Retorna true se o KV namespace está disponível.
 */
export function isKvAvailable(): boolean {
  return kvNamespaceRef !== null;
}

/**
 * Retorna a referência ao KV namespace (ou null se ainda não inicializado).
 * Usado por readModelCache.ts para o cache L2 de valores (ver getCachedReadModel
 * com a opção `kv`).
 */
export function getKvNamespace(): KVNamespace | null {
  return kvNamespaceRef;
}

/**
 * Retorna o epoch de invalidação conhecido por ESTA instância (atualizado por
 * checkKvEpochAsync() a cada poll, ou imediatamente por publishKvInvalidationAsync()
 * na própria instância que publicou). Começa em 0 numa instância fria que ainda
 * não fez nenhum poll -- isso é seguro: instâncias frias compartilham o mesmo
 * "epoch:0" até a primeira sincronização, e nenhuma dado real foi perdido porque
 * epoch 0 nunca é publicado por publishKvInvalidationAsync (que usa Date.now()).
 *
 * Usado por readModelCache.ts para "particionar" as chaves do cache L2 em KV por
 * epoch -- assim, quando um epoch novo é publicado, as entradas do epoch anterior
 * ficam orfãs (nunca mais lidas) e somem sozinhas pelo próprio TTL, sem precisar
 * de delete ativo por chave (KV não tem invalidação por tag/prefixo).
 */
export function getKnownEpoch(): number {
  return localEpoch;
}

/**
 * Verifica se o epoch do KV é maior que o epoch local.
 * Se sim, invalida o cache desta instância.
 *
 * Throttled por POLL_INTERVAL_MS para não bater no KV em toda request.
 * Fire-and-forget — não bloqueia a request.
 */
export function checkKvEpochAsync(): void {
  if (!kvNamespaceRef) return;

  const now = Date.now();
  if (now - lastKvCheckAt < POLL_INTERVAL_MS) return;
  lastKvCheckAt = now;

  const kv = kvNamespaceRef;
  Promise.resolve(kv.get(KV_EPOCH_KEY))
    .then((rawEpoch) => {
      if (!rawEpoch) return;
      const kvEpoch = Number(rawEpoch);
      if (!Number.isFinite(kvEpoch)) return;
      if (kvEpoch > localEpoch) {
        localEpoch = kvEpoch;
        // Invalida dados transacionais locais para forçar recarga do DB
        invalidateReadModelCache({
          tags: [
            READ_MODEL_TAGS.sales,
            READ_MODEL_TAGS.dashboard,
            READ_MODEL_TAGS.vendasKpis,
            READ_MODEL_TAGS.ranking,
            READ_MODEL_TAGS.comissoes,
            READ_MODEL_TAGS.conciliacao
          ]
        });
      }
    })
    .catch((err) => {
      // Silencioso — KV indisponível não deve quebrar requests
      logServerError('[kvInvalidation] falha ao verificar epoch do KV', err);
    });
}

/**
 * Publica um novo epoch de invalidação no KV.
 * Deve ser chamado após mutações de vendas/recibos.
 * Fire-and-forget — não bloqueia a response.
 */
export function publishKvInvalidationAsync(scope?: { companyIds?: string[] | null }): void {
  if (!kvNamespaceRef) return;

  const kv = kvNamespaceRef;
  const newEpoch = Date.now();
  localEpoch = newEpoch; // Atualiza epoch local imediatamente

  // Se temos scope específico, publicar epoch por empresa também
  const companyIds: string[] = [];
  for (const companyId of scope?.companyIds || []) {
    if (companyId) companyIds.push(companyId);
  }

  const writes: Promise<void>[] = [
    Promise.resolve(kv.put(KV_EPOCH_KEY, String(newEpoch), { expirationTtl: KV_EPOCH_TTL_SECONDS }))
  ];

  for (const companyId of companyIds) {
    const companyKey = `invalidation:sales:company:${companyId}`;
    writes.push(
      Promise.resolve(kv.put(companyKey, String(newEpoch), { expirationTtl: KV_EPOCH_TTL_SECONDS }))
    );
  }

  Promise.all(writes).catch((err) => {
    logServerError('[kvInvalidation] falha ao publicar epoch no KV', err);
  });
}

// Liga invalidateSalesReadModels() (readModelCache.ts) a publishKvInvalidationAsync
// acima: garante que TODA invalidacao de vendas -- em qualquer endpoint,
// presente ou futuro -- tambem propague o epoch via KV para as demais
// instancias do Worker, sem depender de cada endpoint lembrar de chamar
// publishKvInvalidationAsync() separadamente.
registerSalesInvalidationPublisher(publishKvInvalidationAsync);

// ---------------------------------------------------------------------------
// Cache L2 (valor real) compartilhado entre instâncias via KV.
// ---------------------------------------------------------------------------
//
// getCachedReadModel() (readModelCache.ts) já resolve o cache LOCAL (por
// instância) com TTL/stale-while-revalidate. O problema que ele não resolve
// sozinho: uma instância FRIA (Map em memória vazio) sempre recomputa do zero
// no Postgres, mesmo que outra instância tenha acabado de calcular o mesmo
// valor há poucos segundos.
//
// getCachedReadModelWithKv() adiciona uma camada extra SÓ no caminho de
// "cache miss local": antes de rodar o loader real (que bate no Postgres),
// tenta ler um valor recente do KV; se achar, usa ele e evita a query. Quando
// o loader real roda (por miss local E miss no KV), o resultado é gravado de
// volta no KV (fire-and-forget) para a próxima instância fria reaproveitar.
//
// SEGURANÇA / CONSISTÊNCIA -- por que isso não piora o que já existe:
//
// 1. Particionamento por epoch: a chave no KV inclui o epoch de invalidação
//    conhecido por ESTA instância (`e${localEpoch}`). Como KV não tem
//    invalidação por tag/prefixo, usamos o próprio epoch como "geração" da
//    chave -- quando um epoch novo é publicado (publishKvInvalidationAsync,
//    chamado após toda mutação de vendas/recibos), as entradas do epoch
//    anterior ficam orfãs (nenhuma instância que já sincronizou volta a lê-las)
//    e somem sozinhas pelo próprio TTL da entrada, sem precisar de delete
//    ativo por chave.
//
// 2. TTL da entrada no KV = kvTtlSeconds (default 30s, o MESMO teto já usado
//    hoje para dados transacionais em memória -- TRANSACTIONAL_TTL_MS em
//    readModelCache.ts). Isto é: uma instância fria não pode ficar mais
//    desatualizada, na pior hipótese, do que uma instância já quente já fica
//    hoje. Não é uma nova categoria de risco, é o MESMO teto de frescor já
//    aceito no design atual, só estendido para cobrir instâncias frias (que
//    hoje, paradoxalmente, são as ÚNICAS que sempre leem o dado mais fresco
//    possível do Postgres -- o preço de sempre pagar o round-trip completo).
//
// 3. Pior caso de composição: se uma instância lê um valor do KV com quase
//    kvTtlSeconds de idade e o cacheia localmente com um TTL cheio por cima,
//    o teto passa a ser de até ~2x kvTtlSeconds (~60s). Isso ainda fica
//    dentro do teto de "stale" já aceito hoje pelo próprio design do cache
//    local (TRANSACTIONAL_STALE_TTL_MS = 120s, usado no padrão
//    stale-while-revalidate já existente) -- não é um novo patamar de risco
//    para o sistema.
//
// ADOÇÃO: opcional, por chamada -- só ative (`kv: true` em vez de chamar
// getCachedReadModel diretamente) em read models cujo valor é serializável em
// JSON e cuja janela de até ~60s de desatualização em cenário de pico seja
// aceitável (o mesmo crivo que já se aplica hoje aos dados com tag
// transacional). Ver resolveAccessibleClientIds (v1.ts) e
// resolveCompanyClienteIds (clientes.ts) para os dois primeiros usos.

const KV_READ_MODEL_PREFIX = 'read-model';
// Mesmo teto do TTL transacional em memória (readModelCache.ts) -- ver
// justificativa (2) acima.
const DEFAULT_KV_TTL_SECONDS = 30;

type KvReadModelOptions<T> = {
  key: string;
  tags?: string[];
  ttlMs?: number;
  staleTtlMs?: number;
  /** TTL da entrada no KV, em segundos. Default: DEFAULT_KV_TTL_SECONDS (30s). */
  kvTtlSeconds?: number;
  loader: () => Promise<T>;
};

type KvReadModelEnvelope<T> = {
  value: T;
  writtenAt: number;
};

/**
 * Igual a getCachedReadModel(), mas com um cache L2 compartilhado via KV no
 * caminho de miss local. Ver comentário acima para as garantias de
 * consistência. Uso: mesma assinatura de getCachedReadModel, só troca o nome
 * da chamada e opcionalmente passa `kvTtlSeconds`.
 */
export async function getCachedReadModelWithKv<T>(options: KvReadModelOptions<T>): Promise<T> {
  const kv = kvNamespaceRef;
  const kvTtlSeconds = Math.max(1, options.kvTtlSeconds ?? DEFAULT_KV_TTL_SECONDS);
  // Epoch capturado no momento da chamada -- ver nota sobre revalidação em
  // background na documentação do módulo (race rara e inofensiva, na pior
  // hipótese gera uma escrita perdida numa geração órfã).
  const kvKey = `${KV_READ_MODEL_PREFIX}:e${localEpoch}:${options.key}`;

  const loaderWithKv = async (): Promise<T> => {
    if (kv) {
      try {
        const raw = await kv.get(kvKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<KvReadModelEnvelope<T>>;
          if (
            parsed &&
            typeof parsed.writtenAt === 'number' &&
            Date.now() - parsed.writtenAt <= kvTtlSeconds * 1000
          ) {
            return parsed.value as T;
          }
        }
      } catch (err) {
        logServerError('[kvInvalidation] falha ao ler cache L2 do KV', err);
      }
    }

    const fresh = await options.loader();

    if (kv) {
      try {
        const envelope: KvReadModelEnvelope<T> = { value: fresh, writtenAt: Date.now() };
        const serialized = JSON.stringify(envelope);
        Promise.resolve(kv.put(kvKey, serialized, { expirationTtl: kvTtlSeconds })).catch((err) => {
          logServerError('[kvInvalidation] falha ao escrever cache L2 no KV', err);
        });
      } catch (err) {
        // Valor não serializável em JSON -- não usa o cache L2 para ele,
        // mas o cache local (getCachedReadModel) continua funcionando normal.
        logServerError('[kvInvalidation] valor não serializável para cache L2', err);
      }
    }

    return fresh;
  };

  return getCachedReadModel({
    key: options.key,
    tags: options.tags,
    ttlMs: options.ttlMs,
    staleTtlMs: options.staleTtlMs,
    loader: loaderWithKv
  });
}
