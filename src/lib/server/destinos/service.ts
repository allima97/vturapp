/**
 * M10 — Catálogo de destinos turísticos.
 *
 * Destinos são globais (sem empresa_id) e compartilhados entre empresas.
 * Soft delete via campo `ativo`.
 */

import { eq, like, and, asc } from 'drizzle-orm';
import { destinos, type Destino } from '$lib/server/db/schema';
import type { DrizzleDb } from '$lib/server/db/client';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────────

export interface DestinoInput {
  nome: string;
  cidade?: string | null;
  estado?: string | null;
  estadoCod?: string | null;
  pais?: string | null;
  paisCod?: string | null;
  continente?: string | null;
  lat?: number | null;
  lng?: number | null;
  notas?: string | null;
  ativo?: boolean;
}

export interface ListarDestinosOpts {
  busca?: string;
  pais?: string;   // filtra por pais_cod (ISO alpha-2)
  limite?: number;
  incluirInativos?: boolean;
}

export class DestinoError extends Error {
  constructor(
    message: string,
    public readonly code: 'VALIDACAO' | 'NAO_ENCONTRADO'
  ) {
    super(message);
    this.name = 'DestinoError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validação interna
// ─────────────────────────────────────────────────────────────────────────────

function validar(dados: Partial<DestinoInput>, exigirNome = true): string[] {
  const erros: string[] = [];

  if (exigirNome && (!dados.nome || dados.nome.trim().length === 0)) {
    erros.push('nome é obrigatório.');
  }
  if (dados.nome !== undefined && dados.nome.trim().length > 200) {
    erros.push('nome deve ter no máximo 200 caracteres.');
  }
  if (dados.paisCod !== undefined && dados.paisCod !== null) {
    if (!/^[A-Z]{2}$/.test(dados.paisCod)) {
      erros.push('pais_cod deve ser ISO 3166-1 alpha-2 em maiúsculas (ex: "BR").');
    }
  }
  if (dados.lat !== undefined && dados.lat !== null) {
    if (!Number.isFinite(dados.lat) || dados.lat < -90 || dados.lat > 90) {
      erros.push('lat deve ser um número entre -90 e 90.');
    }
  }
  if (dados.lng !== undefined && dados.lng !== null) {
    if (!Number.isFinite(dados.lng) || dados.lng < -180 || dados.lng > 180) {
      erros.push('lng deve ser um número entre -180 e 180.');
    }
  }

  return erros;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function criarDestino(db: DrizzleDb, dados: DestinoInput): Promise<Destino> {
  const erros = validar(dados, true);
  if (erros.length > 0) throw new DestinoError(erros.join(' '), 'VALIDACAO');

  const agora = new Date().toISOString();
  const rows = await db
    .insert(destinos)
    .values({
      nome: dados.nome.trim(),
      cidade: dados.cidade ?? null,
      estado: dados.estado ?? null,
      estadoCod: dados.estadoCod ?? null,
      pais: dados.pais ?? null,
      paisCod: dados.paisCod ?? null,
      continente: dados.continente ?? null,
      lat: dados.lat ?? null,
      lng: dados.lng ?? null,
      notas: dados.notas ?? null,
      ativo: dados.ativo ?? true,
      criadoEm: agora,
      atualizadoEm: agora,
    })
    .returning();

  return rows[0];
}

export async function obterDestino(db: DrizzleDb, id: number): Promise<Destino> {
  const rows = await db.select().from(destinos).where(eq(destinos.id, id)).limit(1);
  if (rows.length === 0) {
    throw new DestinoError(`Destino ${id} não encontrado.`, 'NAO_ENCONTRADO');
  }
  return rows[0];
}

export async function editarDestino(
  db: DrizzleDb,
  id: number,
  dados: Partial<DestinoInput>
): Promise<Destino> {
  await obterDestino(db, id); // lança NAO_ENCONTRADO se não existe

  const erros = validar(dados, false);
  if (erros.length > 0) throw new DestinoError(erros.join(' '), 'VALIDACAO');

  const patch: Record<string, unknown> = { atualizadoEm: new Date().toISOString() };

  if (dados.nome !== undefined) patch['nome'] = dados.nome.trim();
  if ('cidade'     in dados) patch['cidade']     = dados.cidade     ?? null;
  if ('estado'     in dados) patch['estado']     = dados.estado     ?? null;
  if ('estadoCod'  in dados) patch['estadoCod']  = dados.estadoCod  ?? null;
  if ('pais'       in dados) patch['pais']       = dados.pais       ?? null;
  if ('paisCod'    in dados) patch['paisCod']    = dados.paisCod    ?? null;
  if ('continente' in dados) patch['continente'] = dados.continente ?? null;
  if ('lat'        in dados) patch['lat']        = dados.lat        ?? null;
  if ('lng'        in dados) patch['lng']        = dados.lng        ?? null;
  if ('notas'      in dados) patch['notas']      = dados.notas      ?? null;
  if (dados.ativo  !== undefined) patch['ativo'] = dados.ativo;

  await db.update(destinos).set(patch).where(eq(destinos.id, id));
  return obterDestino(db, id);
}

export async function inativarDestino(db: DrizzleDb, id: number): Promise<void> {
  await obterDestino(db, id); // lança NAO_ENCONTRADO se não existe
  await db
    .update(destinos)
    .set({ ativo: false, atualizadoEm: new Date().toISOString() })
    .where(eq(destinos.id, id));
}

export async function listarDestinos(
  db: DrizzleDb,
  opts: ListarDestinosOpts = {}
): Promise<Destino[]> {
  const limite = Math.min(opts.limite ?? 50, 200);

  const condicoes = [];

  if (!opts.incluirInativos) {
    condicoes.push(eq(destinos.ativo, true));
  }
  if (opts.pais) {
    condicoes.push(eq(destinos.paisCod, opts.pais.toUpperCase()));
  }
  if (opts.busca) {
    condicoes.push(like(destinos.nome, `%${opts.busca}%`));
  }

  const query = db
    .select()
    .from(destinos)
    .where(condicoes.length > 0 ? and(...condicoes) : undefined)
    .orderBy(asc(destinos.nome))
    .limit(limite);

  return query;
}
