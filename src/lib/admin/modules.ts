export const MAPA_MODULOS: Record<string, string> = {
  Dashboard: 'dashboard',
  Financeiro: 'financeiro',
  NotasFiscais: 'financeiro_notas_fiscais',
  Vendas: 'vendas_consulta',
  Orcamentos: 'orcamentos',
  Clientes: 'clientes',
  Consultoria: 'consultoria_online',
  'Consultoria Online': 'consultoria_online',
  Cadastros: 'cadastros',
  Paises: 'cadastros_paises',
  Subdivisoes: 'cadastros_estados',
  Cidades: 'cadastros_cidades',
  Destinos: 'cadastros_destinos',
  Produtos: 'cadastros_produtos',
  Circuitos: 'circuitos',
  ProdutosLote: 'cadastros_lote',
  Fornecedores: 'cadastros_fornecedores',
  Relatorios: 'relatorios',
  RelatorioVendas: 'relatorios_vendas',
  RelatorioDestinos: 'relatorios_destinos',
  RelatorioProdutos: 'relatorios_produtos',
  RelatorioClientes: 'relatorios_clientes',
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
  Admin: 'admin',
  AdminDashboard: 'admin_dashboard',
  AdminUsers: 'admin_users',
  AdminLogs: 'admin_logs',
  AdminEmpresas: 'admin_empresas',
  AdminFinanceiro: 'admin_financeiro',
  AdminPlanos: 'admin_planos',
  AdminUserTypes: 'admin_user_types',
  AdminSystemModules: 'admin_system_modules',
  MasterEmpresas: 'master_empresas',
  MasterUsuarios: 'master_usuarios',
  MasterPermissoes: 'master_permissoes',
  Operacao: 'operacao',
  Agenda: 'operacao_agenda',
  Todo: 'operacao_todo',
  Tarefas: 'operacao_todo',
  'Mural de Recados': 'operacao_recados',
  'Minhas Preferencias': 'operacao_preferencias',
  'Documentos Viagens': 'operacao_documentos_viagens',
  Vouchers: 'operacao_vouchers',
  'Conciliação': 'operacao_conciliacao',
  Conciliacao: 'operacao_conciliacao',
  Campanhas: 'operacao_campanhas',
  Viagens: 'operacao_viagens',
  'Controle de SAC': 'operacao_controle_sac',
  Comissionamento: 'comissionamento',
  'Ranking de vendas': 'relatorios_ranking_vendas',
  Perfil: 'perfil'
};

export const MODULO_ALIASES: Record<string, string> = Object.entries(MAPA_MODULOS).reduce(
  (acc, [label, key]) => {
    acc[label.toLowerCase()] = key;
    acc[key.toLowerCase()] = key;
    return acc;
  },
  {} as Record<string, string>
);

const MODULO_REVERSE: Record<string, string> = Object.entries(MAPA_MODULOS).reduce(
  (acc, [label, key]) => {
    acc[key] = label;
    return acc;
  },
  {} as Record<string, string>
);

const MODULO_PREFERENCIAS: Record<string, string> = {
  consultoria_online: 'Consultoria Online',
  operacao_todo: 'Tarefas',
  operacao_conciliacao: 'Conciliação',
  parametros_avisos: 'Avisos',
  parametros_crm: 'CRM',
  financeiro_notas_fiscais: 'NotasFiscais'
};

export const ROTAS_MODULOS: Record<string, string> = {
  '/dashboard/logs': 'Admin',
  '/dashboard/admin': 'Admin',
  '/dashboard/permissoes': 'Admin',
  '/dashboard/master': 'Dashboard',
  '/dashboard/gestor': 'Dashboard',
  '/dashboard/financeiro': 'Dashboard',
  '/dashboard/vendedor': 'Dashboard',
  '/dashboard/geral': 'Dashboard',
  '/admin/permissoes': 'Admin',
  '/admin/empresas': 'AdminEmpresas',
  '/admin/usuarios': 'AdminUsers',
  '/admin/tipos-usuario': 'AdminUserTypes',
  '/admin/financeiro': 'AdminFinanceiro',
  '/admin/planos': 'AdminPlanos',
  '/admin/modulos-sistema': 'AdminSystemModules',
  '/admin/aniversariantes': 'Admin',
  '/admin/avisos': 'Admin',
  '/admin/crm': 'Admin',
  '/admin/email': 'Admin',
  '/admin/parametros-importacao': 'Admin',
  '/admin/fix-recibos': 'Admin',
  '/master': 'MasterEmpresas',
  '/master/empresas': 'MasterEmpresas',
  '/master/usuarios': 'MasterUsuarios',
  '/master/permissoes': 'MasterPermissoes',
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/vendas': 'Vendas',
  '/orcamentos': 'Vendas',
  '/clientes': 'Clientes',
  '/cadastros/produtos': 'Produtos',
  '/cadastros/circuitos': 'Circuitos',
  '/cadastros/lote': 'ProdutosLote',
  '/cadastros': 'Cadastros',
  '/relatorios': 'Relatorios',
  '/relatorios/vendas': 'RelatorioVendas',
  '/relatorios/vendas-por-destino': 'RelatorioDestinos',
  '/relatorios/vendas-por-produto': 'RelatorioProdutos',
  '/relatorios/vendas-por-cliente': 'RelatorioClientes',
  '/relatorios/ranking-vendas/view': 'Dashboard',
  '/relatorios/ranking-vendas': 'Ranking de vendas',
  '/relatorios/ranking': 'Ranking de vendas',
  '/parametros': 'Parametros',
  '/parametros/tipo-pacotes': 'TipoPacotes',
  '/parametros/equipe': 'Equipe',
  '/parametros/escalas': 'Escalas',
  '/parametros/cambios': 'Cambios',
  '/parametros/crm': 'CRM',
  '/parametros/avisos': 'Avisos',
  '/parametros/vouchers': 'Parametros',
  '/parametros/orcamentos': 'Orcamentos (PDF)',
  '/parametros/formas-pagamento': 'Formas de Pagamento',
  '/admin': 'Admin',
  '/documentacao': 'Admin',
  '/financeiro': 'Financeiro',
  '/financeiro/caixa': 'Financeiro',
  '/financeiro/notas-fiscais': 'NotasFiscais',
  '/financeiro/conciliacao': 'Conciliação',
  '/financeiro/comissoes': 'Comissionamento',
  '/financeiro/comissoes/regras': 'RegrasComissao',
  '/financeiro/regras': 'RegrasComissao',
  '/financeiro/formas-pagamento': 'Formas de Pagamento',
  '/comissoes': 'Comissionamento',
  '/consultoria-online': 'Consultoria Online',
  '/operacao/agenda': 'Agenda',
  '/operacao/tarefas': 'Tarefas',
  '/operacao/todo': 'Tarefas',
  '/operacao/ultimas-compras': 'Operacao',
  '/operacao/recados': 'Mural de Recados',
  '/operacao/minhas-preferencias': 'Minhas Preferencias',
  '/operacao/documentos-viagens': 'Documentos Viagens',
  '/operacao/vouchers': 'Vouchers',
  '/operacao/viagens': 'Viagens',
  '/operacao/conciliacao': 'Conciliação',
  '/financeiro/ajustes-vendas': 'Conciliação',
  '/operacao/campanhas': 'Campanhas',
  '/operacao/comissionamento': 'Comissionamento',
  '/chat': 'Mural de Recados',
  '/operacao/controle-sac': 'Controle de SAC',
  '/metas/vendedor': 'Metas',
  '/comissoes/fechamento': 'Comissionamento',
  '/perfil': 'Perfil',
  '/perfil/personalizar': 'Perfil',
  '/perfil/escala': 'Perfil'
};

export const MODULO_HERANCA: Record<string, string[]> = {
  Agenda: ['Operacao'],
  Todo: ['Operacao'],
  Tarefas: ['Operacao'],
  'Mural de Recados': ['Operacao'],
  'Minhas Preferencias': ['Operacao'],
  'Documentos Viagens': ['Operacao'],
  Vouchers: ['Operacao', 'Viagens'],
  'Controle de SAC': ['Operacao'],
  Campanhas: ['Operacao'],
  'Conciliação': ['Operacao'],
  Conciliacao: ['Operacao'],
  CRM: ['Parametros'],
  ParametrosAvisos: ['Parametros'],
  Avisos: ['Parametros'],
  'Ranking de vendas': ['Relatorios'],
};

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
      'Operacao'
    ]
  },
  {
    id: 'basica',
    titulo: 'Basica',
    includes: ['trial'],
    modulos: [
      'Consultoria Online',
      'Viagens',
      'Tarefas',
      'Agenda',
      'Mural de Recados',
      'Campanhas',
      'Perfil',
      'Minhas Preferencias',
      'Documentos Viagens',
      'Vouchers'
    ]
  },
  {
    id: 'relatorios',
    titulo: 'Relatorios',
    modulos: ['Relatorios', 'RelatorioVendas', 'RelatorioDestinos', 'RelatorioProdutos', 'RelatorioClientes']
  },
  {
    id: 'financeiro',
    titulo: 'Financeiro',
    modulos: [
      'Financeiro',
      'NotasFiscais',
      'Conciliação',
      'Comissionamento',
      'Vendas',
      'Formas de Pagamento',
      'RegrasComissao'
    ]
  },
  {
    id: 'gestor',
    titulo: 'Gestor',
    modulos: ['Ranking de vendas', 'Controle de SAC', 'Conciliação', 'Metas', 'Equipe', 'Escalas']
  },
  {
    id: 'master',
    titulo: 'Master',
    modulos: ['MasterEmpresas', 'MasterUsuarios', 'MasterPermissoes']
  },
  {
    id: 'cadastro',
    titulo: 'Cadastro',
    modulos: ['Cadastros', 'Paises', 'Subdivisoes', 'Cidades', 'Destinos', 'Produtos', 'ProdutosLote', 'Fornecedores']
  },
  {
    id: 'parametros',
    titulo: 'Parametros',
    modulos: [
      'Parametros',
      'TipoProdutos',
      'TipoPacotes',
      'RegrasComissao',
      'Avisos',
      'CRM',
      'Cambios',
      'Orcamentos (PDF)',
      'Formas de Pagamento'
    ]
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
      'AdminSystemModules'
    ]
  }
];

const GLOBAL_MODULE_GROUPS: Record<string, string[]> = {
  Vendas: ['Orcamentos'],
  Financeiro: [
    'NotasFiscais',
    'Conciliação',
    'Comissionamento',
    'Vendas',
    'Formas de Pagamento',
    'RegrasComissao'
  ],
  Cadastros: ['Paises', 'Subdivisoes', 'Cidades', 'Destinos', 'Produtos', 'Circuitos', 'ProdutosLote', 'Fornecedores'],
  Relatorios: ['RelatorioVendas', 'RelatorioDestinos', 'RelatorioProdutos', 'RelatorioClientes', 'Ranking de vendas'],
  Parametros: [
    'TipoProdutos',
    'TipoPacotes',
    'Metas',
    'RegrasComissao',
    'Avisos',
    'CRM',
    'Cambios',
    'Orcamentos (PDF)',
    'Formas de Pagamento',
    'Equipe',
    'Escalas'
  ],
  Operacao: [
    'Agenda',
    'Tarefas',
    'Mural de Recados',
    'Minhas Preferencias',
    'Documentos Viagens',
    'Vouchers',
    'Campanhas',
    'Viagens',
    'Controle de SAC',
    'Conciliação',
    'Comissionamento'
  ],
  Admin: [
    'AdminDashboard',
    'AdminUsers',
    'AdminLogs',
    'AdminEmpresas',
    'AdminFinanceiro',
    'AdminPlanos',
    'AdminUserTypes',
    'AdminSystemModules'
  ],
  MasterPermissoes: ['MasterEmpresas', 'MasterUsuarios']
};

const GLOBAL_MODULE_PARENTS = Object.entries(GLOBAL_MODULE_GROUPS).reduce(
  (acc, [parent, children]) => {
    for (const child of children) {
      const key = normalizeSystemModuleKey(child);
      if (!key) continue;
      const current = acc.get(key) || [];
      current.push(parent);
      acc.set(key, current);
    }
    return acc;
  },
  new Map<string, string[]>()
);

function normalizeSecaoKey(value: string) {
  return String(value || '').trim().toLowerCase();
}

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
  visited: Set<string>
) {
  if (!secao?.id || visited.has(secao.id)) return [];

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

export function normalizeModuloKey(value?: string | null) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return MODULO_ALIASES[raw] || raw.replace(/\s+/g, '_');
}

export function toModuloDbKey(label: string) {
  return MAPA_MODULOS[label] || normalizeModuloKey(label);
}

export function normalizeModuloLabel(modulo: string) {
  return MODULO_REVERSE[modulo] || modulo;
}

export function listarModulosComHeranca(modulo: string) {
  const inicio = normalizeModuloLabel(modulo);
  const result: string[] = [];
  const visitado = new Set<string>();

  const visitar = (atual: string) => {
    if (!atual || visitado.has(atual)) return;
    visitado.add(atual);
    result.push(atual);
    for (const modulo of MODULO_HERANCA[atual] || []) {
      visitar(modulo);
    }
  };

  visitar(inicio);
  return result;
}

export const MODULOS_ADMIN_PERMISSOES: string[] = (() => {
  const seen = new Map<string, string>();
  const list: string[] = [];

  const addLabel = (label: string) => {
    const key = MAPA_MODULOS[label] || label;
    const normalizedKey = String(key).toLowerCase();
    const preferred = MODULO_PREFERENCIAS[normalizedKey];

    if (seen.has(normalizedKey)) {
      if (preferred && label === preferred) {
        const index = list.indexOf(seen.get(normalizedKey) || '');
        if (index >= 0) list[index] = label;
        seen.set(normalizedKey, label);
      }
      return;
    }

    list.push(label);
    seen.set(normalizedKey, label);
  };

  for (const label of Object.keys(MAPA_MODULOS)) {
    addLabel(label);
  }
  return list;
})();

export function agruparModulosPorSecao(modulosBase: string[]): ModuloSecaoPermissoesResolved[] {
  const baseMap = buildBaseModuloMap(modulosBase);
  const defsById = SECOES_PERMISSOES.reduce(
    (acc, secao) => {
      acc[secao.id] = secao;
      return acc;
    },
    {} as Record<string, ModuloSecaoPermissoes>
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
      includes: secao.includes || []
    });
  }

  const outros = (modulosBase || []).filter((modulo) => !usedKeys.has(normalizeSecaoKey(modulo)));
  if (outros.length) {
    grupos.push({
      id: 'outros',
      titulo: 'Outros',
      modulos: outros,
      applyModulos: outros,
      includes: []
    });
  }

  return grupos;
}

export function normalizeSystemModuleKey(value?: string | null) {
  return normalizeModuloKey(value);
}

export function listSystemModuleCatalog(extraLabels: string[] = []) {
  const seen = new Set<string>();
  const result: Array<{ key: string; label: string }> = [];

  const push = (labelValue?: string | null) => {
    const label = String(labelValue || '').trim();
    if (!label) return;

    const key = normalizeSystemModuleKey(MAPA_MODULOS[label] || label);
    if (!key || seen.has(key)) return;

    seen.add(key);
    result.push({
      key,
      label: normalizeModuloLabel(key)
    });
  };

  for (const modulo of MODULOS_ADMIN_PERMISSOES) {
    push(modulo);
  }
  for (const label of extraLabels) {
    push(label);
  }

  return result;
}

export function buildDisabledSystemModuleKeys(
  rows: Array<{ module_key?: string | null; enabled?: boolean | null }> | null | undefined
) {
  const disabled = new Set<string>();

  for (const row of rows || []) {
    if (row?.enabled !== false) continue;
    const key = normalizeSystemModuleKey(row?.module_key);
    if (key) disabled.add(key);
  }

  return Array.from(disabled);
}

export function isMissingSystemModuleSettingsTable(error: unknown) {
  const err = error as { code?: string; message?: string } | null;
  const code = String(err?.code || '').toLowerCase();
  const message = String(err?.message || '').toLowerCase();

  return (
    code === '42p01' ||
    ((message.includes('relation') || message.includes('table')) &&
      message.includes('system_module_settings')) ||
    (message.includes('does not exist') && message.includes('system_module_settings'))
  );
}

function toDisabledSet(disabledModules: Iterable<string> | null | undefined) {
  const set = new Set<string>();
  for (const value of disabledModules || []) {
    const key = normalizeSystemModuleKey(value);
    if (key) set.add(key);
  }
  return set;
}

export function isSystemModuleDisabled(
  modulo: string,
  disabledModules: Iterable<string> | null | undefined,
  isSystemAdmin = false
) {
  if (isSystemAdmin) return false;

  const disabledSet = toDisabledSet(disabledModules);
  if (!disabledSet.size) return false;

  const labels = listarModulosComHeranca(normalizeModuloLabel(modulo));
  const candidates = new Set<string>();
  const queue = [...labels, normalizeModuloLabel(modulo)];
  const visitedParents = new Set<string>();

  while (queue.length > 0) {
    const currentLabel = queue.shift() || '';
    if (!currentLabel) continue;

    const currentKey = normalizeSystemModuleKey(currentLabel);
    if (currentKey) {
      candidates.add(currentKey);
      const dbKey = normalizeSystemModuleKey(MAPA_MODULOS[currentLabel] || currentLabel);
      if (dbKey) candidates.add(dbKey);

      const parents = GLOBAL_MODULE_PARENTS.get(currentKey) || [];
      for (const parentLabel of parents) {
        if (visitedParents.has(parentLabel)) continue;
        visitedParents.add(parentLabel);
        queue.push(parentLabel);
      }
    }
  }

  const directKey = normalizeSystemModuleKey(modulo);
  if (directKey) candidates.add(directKey);

  for (const candidate of candidates) {
    if (disabledSet.has(candidate)) return true;
  }

  return false;
}

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
