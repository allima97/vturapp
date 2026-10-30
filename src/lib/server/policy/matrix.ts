/**
 * Matriz de capacidades VTUR — F2-03.
 *
 * Define quais ações cada papel (admin/operador/visualizador) pode executar
 * em cada recurso do sistema. Usada pelo `can()` para decisões de autorização.
 *
 * Princípio de menor privilégio:
 *   - admin:        acesso total
 *   - operador:     leitura + escrita; sem gerenciamento de empresa/usuários
 *   - visualizador: somente leitura em recursos de negócio
 *
 * Referência: docs/adr/ADR-003-rbac.md (F2-03)
 */

import type { Papel } from '$lib/server/db/schema';

// ─────────────────────────────────────────────────────────────────────────────
// Recursos e ações
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursos do sistema VTUR.
 * Cada recurso agrupa operações relacionadas.
 */
export const RECURSOS = [
  'empresa',        // configurações da empresa/tenant
  'usuarios',       // lista e gerenciamento de membros
  'convites',       // criação e visualização de convites
  'vendas',         // pacotes e orçamentos de viagem
  'clientes',       // cadastro de clientes
  'financeiro',     // pagamentos, conciliação, comissões
  'relatorios',     // relatórios e exportações
  'configuracoes',  // parâmetros do sistema
  'auditoria',      // logs de auditoria
] as const;

export type Recurso = (typeof RECURSOS)[number];

/**
 * Ações disponíveis por recurso.
 *
 * - `ler`:       GET: listar, visualizar detalhes
 * - `criar`:     POST: criar novos registros
 * - `editar`:    PUT/PATCH: atualizar registros existentes
 * - `excluir`:   DELETE: remover registros
 * - `gerenciar`: ações administrativas (convidar, revogar, configurar)
 * - `exportar`:  gerar arquivos de exportação (PDF, XLSX, CSV)
 */
export const ACOES = ['ler', 'criar', 'editar', 'excluir', 'gerenciar', 'exportar'] as const;

export type Acao = (typeof ACOES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Tipo da matriz
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Conjunto de (recurso, ação) que um papel pode executar.
 * Representado como Set de strings "recurso:acao" para O(1) lookup.
 */
export type PapelCapabilitySet = Set<`${Recurso}:${Acao}`>;

type MatrizRBAC = Record<Papel, PapelCapabilitySet>;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de construção
// ─────────────────────────────────────────────────────────────────────────────

function cap(recurso: Recurso, ...acoes: Acao[]): `${Recurso}:${Acao}`[] {
  return acoes.map((a) => `${recurso}:${a}` as const);
}

function todos(recurso: Recurso): `${Recurso}:${Acao}`[] {
  return ACOES.map((a) => `${recurso}:${a}` as const);
}

// ─────────────────────────────────────────────────────────────────────────────
// Matriz VTUR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Matriz completa de capacidades VTUR.
 *
 * Leitura da tabela:
 *   cap('empresa', 'ler', 'editar')   → ['empresa:ler', 'empresa:editar']
 *   todos('vendas')                   → todas as ações em vendas
 */
const CAPACIDADES_ADMIN: `${Recurso}:${Acao}`[] = [
  // Empresa: admin pode tudo
  ...todos('empresa'),
  // Usuários: admin pode tudo
  ...todos('usuarios'),
  // Convites: admin pode tudo
  ...todos('convites'),
  // Vendas: admin pode tudo
  ...todos('vendas'),
  // Clientes: admin pode tudo
  ...todos('clientes'),
  // Financeiro: admin pode tudo
  ...todos('financeiro'),
  // Relatórios: admin pode tudo
  ...todos('relatorios'),
  // Configurações: admin pode tudo
  ...todos('configuracoes'),
  // Auditoria: somente admin pode ler
  ...todos('auditoria'),
];

const CAPACIDADES_OPERADOR: `${Recurso}:${Acao}`[] = [
  // Empresa: operador só lê (não edita nem gerencia)
  ...cap('empresa', 'ler'),

  // Usuários: operador lê membros (não convida nem revoga)
  ...cap('usuarios', 'ler'),

  // Convites: operador lê (não cria)
  ...cap('convites', 'ler'),

  // Vendas: operador lê, cria, edita, exporta; NÃO exclui nem gerencia
  ...cap('vendas', 'ler', 'criar', 'editar', 'exportar'),

  // Clientes: operador lê, cria, edita; NÃO exclui
  ...cap('clientes', 'ler', 'criar', 'editar'),

  // Financeiro: operador lê e exporta; NÃO gerencia (sem conciliação/ajustes)
  ...cap('financeiro', 'ler', 'exportar'),

  // Relatórios: operador lê e exporta
  ...cap('relatorios', 'ler', 'exportar'),

  // Configurações: operador lê (não edita)
  ...cap('configuracoes', 'ler'),

  // Auditoria: operador NÃO acessa
];

const CAPACIDADES_VISUALIZADOR: `${Recurso}:${Acao}`[] = [
  // Empresa: visualizador lê nome/slug (dados básicos)
  ...cap('empresa', 'ler'),

  // Usuários: visualizador NÃO lista membros
  // Convites: visualizador NÃO acessa

  // Vendas: visualizador lê
  ...cap('vendas', 'ler'),

  // Clientes: visualizador lê
  ...cap('clientes', 'ler'),

  // Financeiro: visualizador NÃO acessa (dados sensíveis)
  // Relatórios: visualizador lê (sem exportar)
  ...cap('relatorios', 'ler'),

  // Configurações: visualizador NÃO acessa
  // Auditoria: visualizador NÃO acessa
];

/**
 * Matriz RBAC compilada.
 * Imutável após inicialização; thread-safe em Workers (single-tenant por request).
 */
export const MATRIZ_RBAC: MatrizRBAC = {
  admin: new Set(CAPACIDADES_ADMIN),
  operador: new Set(CAPACIDADES_OPERADOR),
  visualizador: new Set(CAPACIDADES_VISUALIZADOR),
};

// ─────────────────────────────────────────────────────────────────────────────
// Exportar constante com todas as capacidades para documentação/testes
// ─────────────────────────────────────────────────────────────────────────────

export const TODAS_CAPACIDADES = {
  admin: [...MATRIZ_RBAC.admin].sort(),
  operador: [...MATRIZ_RBAC.operador].sort(),
  visualizador: [...MATRIZ_RBAC.visualizador].sort(),
} as const;
