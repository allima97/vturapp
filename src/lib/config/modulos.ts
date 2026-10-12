/**
 * Configuração central de módulos do sistema.
 *
 * Portabilizado fielmente do vtur-app (src/config/modulos.ts).
 * Rotas adaptadas para o padrão SvelteKit (/(app)/...).
 *
 * IMPORTANTE: Este arquivo é a fonte de verdade para:
 *  - MAPA_MODULOS  → label humano → chave no banco (modulo_acesso.modulo)
 *  - ROTAS_MODULOS → pathname URL → label do módulo
 *  - MODULO_HERANCA → herança de permissões entre módulos
 *  - SECOES_PERMISSOES → agrupamento visual na tela de permissões
 *  - descobrirModulo() → identifica o módulo pela URL atual
 */

// ---------------------------------------------------------------------------
// MAPA_MODULOS: label humano → chave de banco (modulo_acesso.modulo)
// ---------------------------------------------------------------------------
export const MAPA_MODULOS: Record<string, string> = {
  Dashboard: 'dashboard',
  Financeiro: 'financeiro',
  NotasFiscais: 'financeiro_notas_fiscais',
  Vendas: 'vendas_consulta',
  Orcamentos: 'orcamentos',
  Clientes: 'clientes',
  Consultoria: 'consultoria_online',
  'Consultoria Online': 'consultoria_online',

  // Cadastros
  Cadastros: 'cadastros',
  Paises: 'cadastros_paises',
  Subdivisoes: 'cadastros_estados',
  Cidades: 'cadastros_cidades',
  Destinos: 'cadastros_destinos',
  Produtos: 'cadastros_produtos',
  Circuitos: 'circuitos',
  ProdutosLote: 'cadastros_lote',
  Fornecedores: 'cadastros_fornecedores',

  // Relatórios
  Relatorios: 'relatorios',
  RelatorioVendas: 'relatorios_vendas',
  RelatorioDestinos: 'relatorios_destinos',
  RelatorioProdutos: 'relatorios_produtos',
  RelatorioClientes: 'relatorios_clientes',

  // Parâmetros
  Parametros: 'parametros',
  TipoProdutos: 'parametros_tipo_produtos',
  TipoPacotes: 'parametros_tipo_pacotes',
  Metas: 'parametros_metas',
  RegrasComissao: 'parametros_regras_comissao',
  ParametrosAvisos: 'parametros_avisos',
  Avisos: 'parametros_avisos',
  Equipe: 'parametros_equipe',
  Escalas: 'parametros_escalas',
  Cambios: 'parametros_cambios',
  'Orcamentos (PDF)': 'parametros_orcamentos',
  'Formas de Pagamento': 'parametros_formas_pagamento',
  CRM: 'parametros_crm',
  CrmTemplates: 'parametros_crm',

  // Admin
  Admin: 'admin',
  AdminDashboard: 'admin_dashboard',
  AdminUsers: 'admin_users',
  AdminLogs: 'admin_logs',
  AdminEmpresas: 'admin_empresas',
  AdminFinanceiro: 'admin_financeiro',
  AdminPlanos: 'admin_planos',
  AdminUserTypes: 'admin_user_types',
  AdminSystemModules: 'admin_system_modules',

  // Master
  MasterEmpresas: 'master_empresas',
  MasterUsuarios: 'master_usuarios',
  MasterPermissoes: 'master_permissoes',

  // Operação
  Operacao: 'operacao',
  Agenda: 'operacao_agenda',
  Todo: 'operacao_todo',
  Tarefas: 'operacao_todo',
  'Mural de Recados': 'operacao_recados',
  'Minhas Preferências': 'operacao_preferencias',
  'Documentos Viagens': 'operacao_documentos_viagens',
  Vouchers: 'operacao_vouchers',
  Campanhas: 'operacao_campanhas',
  Viagens: 'operacao_viagens',
  'Controle de SAC': 'operacao_controle_sac',
  Comissionamento: 'comissionamento',

  'Ranking de vendas': 'relatorios_ranking_vendas',
  Perfil: 'perfil',
};

// ---------------------------------------------------------------------------
// MODULO_ALIASES: mapa lowercase para lookup rápido
// ---------------------------------------------------------------------------
export const MODULO_ALIASES: Record<string, string> = Object.entries(MAPA_MODULOS).reduce(
  (acc, [label, modulo]) => {
    acc[label.toLowerCase()] = modulo;
    return acc;
  },
  {} as Record<string, string>,
);

// ---------------------------------------------------------------------------
// ROTAS_MODULOS: pathname (SvelteKit) → label do módulo
// Rotas do SvelteKit ficam sob /(app)/ mas o pathname não inclui o grupo.
// ---------------------------------------------------------------------------
export const ROTAS_MODULOS: Record<string, string> = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/dashboard/logs': 'Admin',
  '/dashboard/admin': 'Admin',
  '/dashboard/permissoes': 'Admin',
  '/dashboard/master': 'Dashboard',
  '/dashboard/gestor': 'Dashboard',
  '/dashboard/financeiro': 'Dashboard',
  '/dashboard/vendedor': 'Dashboard',
  '/dashboard/geral': 'Dashboard',

  // Admin
  '/admin': 'Admin',
  '/admin/permissoes': 'Admin',
  '/admin/empresas': 'AdminEmpresas',
  '/admin/usuarios': 'AdminUsers',
  '/admin/tipos-usuario': 'AdminUserTypes',
  '/admin/financeiro': 'AdminFinanceiro',
  '/admin/planos': 'AdminPlanos',
  '/admin/modulos-sistema': 'AdminSystemModules',
  '/admin/crm': 'Admin',
  '/admin/aniversariantes': 'Admin',
  '/admin/avisos': 'Admin',
  '/admin/email': 'Admin',
  '/admin/parametros-importacao': 'Admin',
  '/admin/fix-recibos': 'Admin',

  // Master
  '/master/empresas': 'MasterEmpresas',
  '/master/usuarios': 'MasterUsuarios',
  '/master/permissoes': 'MasterPermissoes',
  '/master': 'MasterEmpresas',

  // Vendas
  '/vendas': 'Vendas',
  '/vendas/nova': 'Vendas',

  // Orçamentos / Clientes
  '/orcamentos': 'Orcamentos',
  '/clientes': 'Clientes',
  '/aniversariantes': 'Dashboard',

  // Cadastros
  '/cadastros': 'Cadastros',
  '/cadastros/produtos': 'Produtos',
  '/cadastros/circuitos': 'Circuitos',
  '/cadastros/lote': 'ProdutosLote',
  '/cadastros/paises': 'Paises',
  '/cadastros/estados': 'Subdivisoes',
  '/cadastros/cidades': 'Cidades',
  '/cadastros/destinos': 'Destinos',
  '/cadastros/fornecedores': 'Fornecedores',

  // Relatórios
  '/relatorios': 'Relatorios',
  '/relatorios/vendas': 'RelatorioVendas',
  '/relatorios/vendas-por-destino': 'RelatorioDestinos',
  '/relatorios/vendas-por-produto': 'RelatorioProdutos',
  '/relatorios/vendas-por-cliente': 'RelatorioClientes',
  '/relatorios/ranking-vendas': 'Ranking de vendas',
  '/relatorios/ranking': 'Ranking de vendas',
  '/relatorios/ranking-vendas/view': 'Dashboard',
  '/relatorios/desempenho': 'Relatorios',

  // Parâmetros
  '/parametros': 'Parametros',
  '/parametros/tipo-pacotes': 'TipoPacotes',
  '/parametros/tipo-produtos': 'TipoProdutos',
  '/parametros/equipe': 'Equipe',
  '/parametros/escalas': 'Escalas',
  '/parametros/cambios': 'Cambios',
  '/parametros/crm': 'CRM',
  '/parametros/avisos': 'Avisos',
  '/parametros/vouchers': 'Parametros',
  '/parametros/orcamentos': 'Orcamentos (PDF)',
  '/parametros/formas-pagamento': 'Formas de Pagamento',
  '/parametros/metas': 'Metas',
  '/parametros/notificacoes': 'Parametros',
  '/parametros/integracoes': 'Parametros',
  '/parametros/empresa': 'Parametros',

  // Financeiro
  '/financeiro': 'Financeiro',
  '/financeiro/caixa': 'Financeiro',
  '/financeiro/notas-fiscais': 'NotasFiscais',
  '/financeiro/ajustes-vendas': 'Financeiro',
  '/financeiro/comissoes': 'Comissionamento',
  '/financeiro/comissoes/regras': 'RegrasComissao',
  '/financeiro/regras': 'RegrasComissao',
  '/financeiro/formas-pagamento': 'Formas de Pagamento',
  '/comissoes': 'Comissionamento',

  // Operação
  '/operacao/agenda': 'Agenda',
  '/operacao/tarefas': 'Tarefas',
  '/operacao/todo': 'Tarefas',
  '/operacao/ultimas-compras': 'Operacao',
  '/operacao/acompanhamento': 'Operacao',
  '/operacao/recados': 'Mural de Recados',
  '/operacao/minhas-preferencias': 'Minhas Preferências',
  '/operacao/documentos-viagens': 'Documentos Viagens',
  '/operacao/vouchers': 'Vouchers',
  '/operacao/viagens': 'Viagens',
  '/operacao/campanhas': 'Campanhas',
  '/operacao/comissionamento': 'Comissionamento',
  '/operacao/controle-sac': 'Controle de SAC',

  // Misc
  '/chat': 'Mural de Recados',
  '/metas/vendedor': 'Metas',
  '/comissoes/fechamento': 'Comissionamento',
  '/perfil': 'Perfil',
  '/perfil/personalizar': 'Perfil',
  '/perfil/escala': 'Perfil',
  '/consultoria-online': 'Consultoria Online',
  '/documentacao': 'Admin',
};

// ---------------------------------------------------------------------------
// MODULO_HERANCA: módulo filho → lista de módulos pai que também concedem acesso
//
// Regra: se o usuário tem permissão em qualquer módulo pai, também tem no filho.
// Evita-se herdar de "Parametros" diretamente para não conceder acesso indireto.
// ---------------------------------------------------------------------------
export const MODULO_HERANCA: Record<string, string[]> = {
  Agenda: ['Operacao'],
  Todo: ['Operacao'],
  Tarefas: ['Operacao'],
  'Mural de Recados': ['Operacao'],
  'Minhas Preferências': ['Operacao'],
  'Documentos Viagens': ['Operacao'],
  Vouchers: ['Operacao', 'Viagens'],
  'Controle de SAC': ['Operacao'],
  Campanhas: ['Operacao'],
  CRM: ['Parametros'],
  ParametrosAvisos: ['Parametros'],
  Avisos: ['Parametros'],
  'Formas de Pagamento': ['Financeiro'],
};

// ---------------------------------------------------------------------------
// MODULO_REVERSE: chave DB → label (para normalizeModuloLabel)
// ---------------------------------------------------------------------------
const MODULO_REVERSE: Record<string, string> = Object.entries(MAPA_MODULOS).reduce(
  (acc, [label, key]) => {
    acc[String(key)] = label;
    return acc;
  },
  {} as Record<string, string>,
);

// ---------------------------------------------------------------------------
// FUNÇÕES UTILITÁRIAS
// ---------------------------------------------------------------------------

/** Converte chave de BD para label humano */
export function normalizeModuloLabel(modulo: string): string {
  return MODULO_REVERSE[modulo] || modulo;
}

/**
 * Retorna o módulo e todos os seus ancestrais via MODULO_HERANCA.
 * Usado pelo can() para checar permissão com herança.
 */
export function listarModulosComHeranca(modulo: string): string[] {
  const inicio = normalizeModuloLabel(modulo);
  const result: string[] = [];
  const visitado = new Set<string>();

  const visitar = (atual: string) => {
    if (!atual || visitado.has(atual)) return;
    visitado.add(atual);
    result.push(atual);
    const pais = MODULO_HERANCA[atual] || [];
    for (const modulo of pais) {
      visitar(modulo);
    }
  };

  visitar(inicio);
  return result;
}

/**
 * Identifica o módulo pela URL atual (pathname).
 * Usa match mais específico (mais longo) primeiro.
 */
export function descobrirModulo(pathname: string): string | null {
  if (pathname === '/') return ROTAS_MODULOS['/'] ?? null;

  const entradas = Object.keys(ROTAS_MODULOS)
    .filter((rota) => rota !== '/')
    .sort((a, b) => b.length - a.length);

  for (const rota of entradas) {
    if (pathname.startsWith(rota)) return ROTAS_MODULOS[rota];
  }
  return null;
}

// ---------------------------------------------------------------------------
// SEÇÕES DE PERMISSÕES (para agrupar na tela de gerenciamento)
// ---------------------------------------------------------------------------
export type ModuloSecaoPermissoes = {
  id: string;
  titulo: string;
  modulos: string[];
  includes?: string[];
};

export type ModuloSecaoPermissoesResolved = {
  id: string;
  titulo: string;
  modulos: string[];
  applyModulos: string[];
  includes: string[];
};

export const SECOES_PERMISSOES: ModuloSecaoPermissoes[] = [
  {
    id: 'trial',
    titulo: 'Trial',
    modulos: [
      'Dashboard',
      'Vendas',
      'Orcamentos',
      'Clientes',
      'Circuitos',
      'Comissionamento',
      'Operacao',
    ],
  },
  {
    id: 'basica',
    titulo: 'Básica',
    includes: ['trial'],
    modulos: [
      'Consultoria Online',
      'Viagens',
      'Tarefas',
      'Agenda',
      'Mural de Recados',
      'Campanhas',
      'Perfil',
      'Minhas Preferências',
      'Documentos Viagens',
      'Vouchers',
    ],
  },
  {
    id: 'relatorios',
    titulo: 'Relatórios',
    modulos: [
      'Relatorios',
      'RelatorioVendas',
      'RelatorioDestinos',
      'RelatorioProdutos',
      'RelatorioClientes',
    ],
  },
  {
    id: 'financeiro',
    titulo: 'Financeiro',
    modulos: [
      'Financeiro',
      'NotasFiscais',
      'Comissionamento',
      'Vendas',
      'Formas de Pagamento',
      'RegrasComissao',
    ],
  },
  {
    id: 'gestor',
    titulo: 'Gestor',
    modulos: [
      'Ranking de vendas',
      'Controle de SAC',
      'Metas',
      'Equipe',
      'Escalas',
    ],
  },
  {
    id: 'master',
    titulo: 'Master',
    modulos: ['MasterEmpresas', 'MasterUsuarios', 'MasterPermissoes'],
  },
  {
    id: 'cadastro',
    titulo: 'Cadastro',
    modulos: [
      'Cadastros',
      'Paises',
      'Subdivisoes',
      'Cidades',
      'Destinos',
      'Produtos',
      'ProdutosLote',
      'Fornecedores',
    ],
  },
  {
    id: 'parametros',
    titulo: 'Parâmetros',
    modulos: [
      'Parametros',
      'TipoProdutos',
      'TipoPacotes',
      'RegrasComissao',
      'Avisos',
      'CRM',
      'Cambios',
      'Orcamentos (PDF)',
      'Formas de Pagamento',
    ],
  },
  {
    id: 'admin',
    titulo: 'Admin',
    modulos: [
      'Admin',
      'AdminDashboard',
      'AdminUsers',
      'AdminLogs',
      'AdminEmpresas',
      'AdminFinanceiro',
      'AdminPlanos',
      'AdminUserTypes',
      'AdminSystemModules',
    ],
  },
];

// ---------------------------------------------------------------------------
// HELPERS PARA TELA DE PERMISSÕES
// ---------------------------------------------------------------------------

const normalizeSecaoKey = (value: string) => value.trim().toLowerCase();

function buildBaseModuloMap(modulosBase: string[]) {
  const map = new Map<string, string>();
  for (const modulo of modulosBase) {
    map.set(normalizeSecaoKey(modulo), modulo);
  }
  return map;
}

function resolveSecaoApplyModulos(
  secao: ModuloSecaoPermissoes,
  defsById: Record<string, ModuloSecaoPermissoes>,
  baseMap: Map<string, string>,
  visited: Set<string>,
): string[] {
  if (!secao?.id) return [];
  if (visited.has(secao.id)) return [];
  visited.add(secao.id);

  const result: string[] = [];
  const seen = new Set<string>();
  const push = (moduloLabel: string) => {
    const resolved = baseMap.get(normalizeSecaoKey(moduloLabel));
    if (!resolved) return;
    const key = normalizeSecaoKey(resolved);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(resolved);
  };

  for (const includedId of secao.includes || []) {
    const included = defsById[includedId];
    if (!included) continue;
    for (const modulo of resolveSecaoApplyModulos(included, defsById, baseMap, visited)) {
      push(modulo);
    }
  }
  for (const modulo of secao.modulos || []) {
    push(modulo);
  }

  return result;
}

export function agruparModulosPorSecao(modulosBase: string[]): ModuloSecaoPermissoesResolved[] {
  const baseMap = buildBaseModuloMap(modulosBase);
  const defsById = SECOES_PERMISSOES.reduce(
    (acc, secao) => {
      acc[secao.id] = secao;
      return acc;
    },
    {} as Record<string, ModuloSecaoPermissoes>,
  );

  const usedKeys = new Set<string>();
  const grupos: ModuloSecaoPermissoesResolved[] = [];

  for (const secao of SECOES_PERMISSOES) {
    const modulos: string[] = [];
    for (const label of secao.modulos || []) {
      const modulo = baseMap.get(normalizeSecaoKey(label));
      if (modulo) modulos.push(modulo);
    }

    const applyModulos = resolveSecaoApplyModulos(secao, defsById, baseMap, new Set<string>());
    for (const modulo of applyModulos) {
      usedKeys.add(normalizeSecaoKey(modulo));
    }

    if (!modulos.length && !applyModulos.length) continue;

    grupos.push({
      id: secao.id,
      titulo: secao.titulo,
      modulos,
      applyModulos,
      includes: secao.includes || [],
    });
  }

  const outros = (modulosBase || []).filter(
    (modulo) => !usedKeys.has(normalizeSecaoKey(modulo)),
  );
  if (outros.length) {
    grupos.push({
      id: 'outros',
      titulo: 'Outros',
      modulos: outros,
      applyModulos: outros,
      includes: [],
    });
  }

  return grupos;
}

/** Lista de módulos visíveis para Admin (todos) */
export const MODULOS_ADMIN_PERMISSOES: string[] = (() => {
  const seen = new Map<string, string>();
  const list: string[] = [];

  const addLabel = (label: string) => {
    const key = MAPA_MODULOS[label] || label;
    const normalizedKey = String(key).toLowerCase();
    if (seen.has(normalizedKey)) return;
    list.push(label);
    seen.set(normalizedKey, label);
  };

  for (const label of Object.keys(MAPA_MODULOS)) {
    addLabel(label);
  }
  for (const label of Object.values(ROTAS_MODULOS)) {
    addLabel(label);
  }

  return list;
})();

/** Lista de módulos visíveis para Master (exclui admin_*) */
export const MODULOS_MASTER_PERMISSOES: string[] = MODULOS_ADMIN_PERMISSOES.filter((label) => {
  const key = String(MAPA_MODULOS[label] || label).toLowerCase();
  if (key === 'admin' || key.startsWith('admin_')) return false;
  if (key === 'master_permissoes') return true;
  if (key === 'master' || key.startsWith('master_')) return false;
  return true;
});
