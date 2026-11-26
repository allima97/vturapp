// Reaproveitamento da IA de roteiros: tudo o que evita pagar tokens de novo.
//
// 1. Cache de resultado (roteiro_ia_cache): pedido idêntico → devolve o que
//    já foi gerado, sem chamar a IA. As datas não entram na chave (a IA
//    trabalha com dia 1..N), então o mesmo roteiro serve para outras datas.
// 2. Lista de referência de opcionais: catálogo da agência (a1, a2…) ou, se a
//    cidade não tem catálogo, a biblioteca do que a IA já escreveu (b1…).
//    A IA escolhe pelo código; nome e descrição vêm daqui.
// 3. Biblioteca (roteiro_ia_opcionais): opcionais novos escritos pela IA
//    ficam guardados por cidade para as próximas gerações.
import { chaveCidadeOpcional, chaveIdentidadeCidade } from '$lib/catalogoOpcionais';
import { chaveNomeOpcional } from '$lib/importarOpcionais';
import type { PedidoRoteiroIA } from '$lib/roteiroIA/tipos';
import { logServerError } from '$lib/server/v1';
import type { SaidaNormalizada } from './esquema';
import { VERSAO_PROMPT, diasDoPedido, type ReferenciaOpcional } from './prompt';

/** Resultado guardado deixa de valer depois de tanto tempo sem uso. */
const VALIDADE_CACHE_DIAS = 180;
const MAX_REFERENCIAS_AGENCIA = 25;
const MAX_REFERENCIAS_BIBLIOTECA = 12;

export type DestinoResolvido = { nome: string; id: string | null };

const norm = (s: string) =>
  s
    .normalize('NFC')
    .toLocaleLowerCase('pt-BR')
    .replace(/[\s.,;:!?"'()]+/g, ' ')
    .trim();

async function sha256(texto: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Chave do cache: tudo o que muda o texto gerado, e nada mais. Datas ficam
 * de fora de propósito; o catálogo da agência entra (se a agência muda o
 * catálogo, o roteiro é gerado de novo). A biblioteca da IA não entra: ela
 * cresce a cada geração e mudaria a chave sem necessidade (o resultado
 * guardado já tem os textos expandidos).
 */
export async function chaveCacheRoteiro(params: {
  pedido: PedidoRoteiroIA;
  destinos: DestinoResolvido[];
  referencias: ReferenciaOpcional[];
  modelo: string;
}) {
  const { pedido } = params;
  const base = {
    v: VERSAO_PROMPT,
    m: params.modelo,
    o: norm(pedido.origem),
    d: params.destinos.map((d) => d.id || norm(d.nome)),
    n: diasDoPedido(pedido),
    a: pedido.adultos,
    c: pedido.criancas,
    p: norm(pedido.perfil),
    obs: norm(pedido.observacoes),
    cat: params.referencias
      .filter((r) => r.ref.startsWith('a'))
      .map((r) => `${chaveCidadeOpcional(r.cidade)}|${chaveNomeOpcional(r.nome)}|${r.descricao}`)
  };
  return sha256(JSON.stringify(base));
}

export async function lerCacheRoteiro(
  db: D1Database | undefined,
  chave: string
): Promise<SaidaNormalizada | null> {
  if (!db) return null;
  try {
    const limite = new Date(Date.now() - VALIDADE_CACHE_DIAS * 864e5).toISOString();
    const row = await db
      .prepare('SELECT saida FROM roteiro_ia_cache WHERE chave = ?1 AND ultimo_uso >= ?2')
      .bind(chave, limite)
      .first<{ saida: string }>();
    if (!row) return null;
    const saida = JSON.parse(row.saida) as SaidaNormalizada;
    if (!Array.isArray(saida?.dias) || !saida.dias.length) return null;
    await db
      .prepare(
        `UPDATE roteiro_ia_cache SET acertos = acertos + 1,
           ultimo_uso = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE chave = ?1`
      )
      .bind(chave)
      .run();
    return saida;
  } catch (err) {
    // Tabela ausente ou JSON corrompido: segue gerando normalmente.
    logServerError('[roteiro-ia] falha ao ler cache', err);
    return null;
  }
}

export async function gravarCacheRoteiro(
  db: D1Database | undefined,
  params: { chave: string; modelo: string; saida: SaidaNormalizada; uso: unknown }
) {
  if (!db) return;
  try {
    await db
      .prepare(
        `INSERT INTO roteiro_ia_cache (chave, modelo, saida, uso) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (chave) DO UPDATE SET modelo = excluded.modelo, saida = excluded.saida,
           uso = excluded.uso, ultimo_uso = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
      )
      .bind(
        params.chave,
        params.modelo,
        JSON.stringify(params.saida),
        JSON.stringify(params.uso ?? {})
      )
      .run();
    // Limpeza ocasional do que expirou (não precisa ser a cada gravação).
    if (Math.random() < 0.05) {
      const limite = new Date(Date.now() - VALIDADE_CACHE_DIAS * 864e5).toISOString();
      await db.prepare('DELETE FROM roteiro_ia_cache WHERE ultimo_uso < ?1').bind(limite).run();
    }
  } catch (err) {
    logServerError('[roteiro-ia] falha ao gravar cache', err);
  }
}

/**
 * Lista de referência por cidade: catálogo da agência quando existe; senão,
 * o que a IA já escreveu antes para a cidade (biblioteca).
 */
export async function carregarReferencias(
  db: D1Database | undefined,
  destinos: DestinoResolvido[]
): Promise<ReferenciaOpcional[]> {
  if (!db) return [];
  const referencias: ReferenciaOpcional[] = [];
  const vistas = new Set<string>();
  let a = 0;
  let b = 0;
  for (const destino of destinos) {
    const identidade = chaveIdentidadeCidade(destino.nome, destino.id);
    if (vistas.has(identidade)) continue;
    vistas.add(identidade);
    const agencia = await db
      .prepare(
        `SELECT nome, descricao FROM catalogo_opcionais
         WHERE (?1 IS NOT NULL AND cidade_id = ?1) OR (cidade_chave = ?2)
         ORDER BY nome LIMIT ${MAX_REFERENCIAS_AGENCIA}`
      )
      .bind(destino.id, chaveCidadeOpcional(destino.nome))
      .all<{ nome: string; descricao: string | null }>();
    const itensAgencia = agencia.results || [];
    if (itensAgencia.length) {
      for (const p of itensAgencia)
        referencias.push({
          ref: `a${++a}`,
          cidade: destino.nome,
          nome: p.nome,
          descricao: p.descricao || ''
        });
      continue;
    }
    try {
      const biblioteca = await db
        .prepare(
          `SELECT nome, descricao FROM roteiro_ia_opcionais WHERE cidade_chave = ?1
           ORDER BY usos DESC, nome LIMIT ${MAX_REFERENCIAS_BIBLIOTECA}`
        )
        .bind(identidade)
        .all<{ nome: string; descricao: string }>();
      for (const p of biblioteca.results || [])
        referencias.push({
          ref: `b${++b}`,
          cidade: destino.nome,
          nome: p.nome,
          descricao: p.descricao
        });
    } catch {
      // Biblioteca ainda não migrada: a IA escreve os opcionais dessa cidade.
    }
  }
  return referencias;
}

/**
 * Guarda os opcionais NOVOS escritos pela IA e conta o uso dos que vieram da
 * biblioteca. Melhor esforço: falha aqui nunca derruba a geração.
 */
export async function gravarBibliotecaOpcionais(
  db: D1Database | undefined,
  saida: SaidaNormalizada,
  destinos: DestinoResolvido[],
  usadosBiblioteca: ReferenciaOpcional[]
) {
  if (!db) return;
  const idPorCidade = new Map(destinos.map((d) => [chaveCidadeOpcional(d.nome), d.id]));
  const comandos: D1PreparedStatement[] = [];
  for (const grupo of saida.opcionais) {
    const id = idPorCidade.get(chaveCidadeOpcional(grupo.cidade)) ?? null;
    const identidade = chaveIdentidadeCidade(grupo.cidade, id);
    for (const p of grupo.passeios) {
      if (!p.novo || !p.nome) continue;
      comandos.push(
        db
          .prepare(
            `INSERT INTO roteiro_ia_opcionais (id, cidade_chave, cidade, nome, nome_chave, descricao)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT (cidade_chave, nome_chave) DO UPDATE SET usos = usos + 1,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
          )
          .bind(
            crypto.randomUUID(),
            identidade,
            grupo.cidade,
            p.nome,
            chaveNomeOpcional(p.nome),
            p.descricao
          )
      );
    }
  }
  for (const r of usadosBiblioteca) {
    const id = idPorCidade.get(chaveCidadeOpcional(r.cidade)) ?? null;
    comandos.push(
      db
        .prepare(
          `UPDATE roteiro_ia_opcionais SET usos = usos + 1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE cidade_chave = ?1 AND nome_chave = ?2`
        )
        .bind(chaveIdentidadeCidade(r.cidade, id), chaveNomeOpcional(r.nome))
    );
  }
  if (!comandos.length) return;
  try {
    await db.batch(comandos);
  } catch (err) {
    logServerError('[roteiro-ia] falha ao gravar biblioteca de opcionais', err);
  }
}
