/**
 * Store de Permissões — vtur-svelte
 *
 * Portabilizado fielmente do vtur-app (src/lib/permissoesStore.ts).
 * Adaptado de React hooks para Svelte writable store.
 *
 * FUNCIONAMENTO:
 *  1. Carrega perfil do usuário (user_types, uso_individual)
 *  2. Carrega modulo_acesso (permissões por módulo)
 *  3. Carrega system_module_settings (módulos desabilitados globalmente)
 *  4. Resolve papel: ADMIN | MASTER | GESTOR | VENDEDOR | OUTRO
 *  5. Armazena acessos: Record<moduloDb, PermissaoNivel>
 *  6. can(moduloLabel) usa MODULO_HERANCA para checar ancestrais
 *  7. canDb(moduloDb) checa diretamente pela chave de BD
 */

import { writable, derived, get } from 'svelte/store';
import type { User } from '$lib/stores/auth';
import { toUserMessage } from '$lib/utils/errors';
import { MAPA_MODULOS, listarModulosComHeranca } from '$lib/config/modulos';

// ---------------------------------------------------------------------------
// TIPOS
// ---------------------------------------------------------------------------

export type PermissaoNivel = 'none' | 'view' | 'create' | 'edit' | 'delete' | 'admin';

/**
 * Papel resolvido do usuário — baseado no tipo de conta.
 * Portabilizado de permissoesStore.ts do vtur-app.
 */
export type Papel = 'ADMIN' | 'MASTER' | 'FINANCEIRO' | 'GESTOR' | 'VENDEDOR' | 'OUTRO';

export interface PermissoesState {
  userId: string | null;
  userEmail: string;
  userType: string;
  papel: Papel;
  /** Compat: flags de papel usadas em páginas legadas do projeto */
  isMaster: boolean;
  isFinanceiro: boolean;
  isGestor: boolean;
  isVendedor: boolean;
  /** Se true, o usuário é admin do sistema (acesso irrestrito) */
  isSystemAdmin: boolean;
  /** Se true, uso individual — o usuário só vê seus próprios dados */
  usoIndividual: boolean;
  /**
   * acessos: chave de BD → nível de permissão.
   * Ex: { 'vendas_consulta': 'edit', 'parametros_crm': 'view' }
   * Compatível com modulo_acesso.modulo do banco.
   */
  acessos: Record<string, PermissaoNivel>;
  /** Módulos desabilitados globalmente no sistema (system_module_settings) */
  disabledModules: string[];
  /** Compat: alias legado para acessos */
  permissoes: Record<string, PermissaoNivel>;
  ready: boolean;
  loading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// HELPERS INTERNOS
// ---------------------------------------------------------------------------

/** Converte nível textual em número para comparação */
const permLevel = (p: PermissaoNivel | undefined): number => {
  switch (p) {
    case 'admin':
      return 5;
    case 'delete':
      return 4;
    case 'edit':
      return 3;
    case 'create':
      return 2;
    case 'view':
      return 1;
    default:
      return 0;
  }
};

/**
 * Resolve o papel do usuário com base no nome do tipo.
 * ADMIN do sistema tem precedência sobre uso_individual —
 * uso_individual diferencia vendedores individuais de equipe,
 * não restringe administradores do sistema.
 */
function resolvePapel(tipoNome: string, usoIndividual: boolean): Papel {
  const nome = tipoNome.toUpperCase();
  // Admin do sistema prevalece sobre uso_individual
  if (nome.includes('ADMIN')) return 'ADMIN';
  if (nome.includes('MASTER')) return 'MASTER';
  if (nome.includes('FINANCEIRO')) return 'FINANCEIRO';
  if (nome.includes('GESTOR')) return 'GESTOR';
  if (usoIndividual) return 'VENDEDOR';
  if (nome.includes('VENDEDOR')) return 'VENDEDOR';
  return 'OUTRO';
}

/**
 * Resolve se o usuário é admin do sistema.
 * ADMIN do sistema = tipo contém "ADMIN" — uso_individual não restringe admin.
 */
function resolveIsSystemAdmin(tipoNome: string, _usoIndividual: boolean): boolean {
  return tipoNome.toUpperCase().includes('ADMIN');
}

/**
 * Quando há múltiplas entradas para o mesmo módulo,
 * escolhe a melhor (ativo > maior nível > mais recente).
 * Portabilizado de pickBestAcesso do vtur-app.
 */
function pickBestPermissao(entries: Array<{ permissao: string; ativo: boolean }>): PermissaoNivel {
  // Prioriza entradas ativas; entre as ativas, pega a de maior nível
  const ativas = entries.filter((e) => e.ativo);
  const fonte = ativas.length > 0 ? ativas : entries;

  const sorted = [...fonte].sort(
    (a, b) => permLevel(b.permissao as PermissaoNivel) - permLevel(a.permissao as PermissaoNivel)
  );

  const best = sorted[0]?.permissao as PermissaoNivel | undefined;

  // Se não há entradas ativas com permissão real, retorna 'none'
  if (!best || ativas.length === 0) return 'none';

  return best || 'none';
}

// ---------------------------------------------------------------------------
// ESTADO INICIAL
// ---------------------------------------------------------------------------

const initialState: PermissoesState = {
  userId: null,
  userEmail: '',
  userType: '',
  papel: 'OUTRO',
  isMaster: false,
  isFinanceiro: false,
  isGestor: false,
  isVendedor: false,
  isSystemAdmin: false,
  usoIndividual: false,
  acessos: {},
  disabledModules: [],
  permissoes: {},
  ready: false,
  loading: false,
  error: null
};

// ---------------------------------------------------------------------------
// STORE FACTORY
// ---------------------------------------------------------------------------

function createPermissoesStore() {
  const { subscribe, set, update } = writable<PermissoesState>(initialState);

  const getErrorField = (error: unknown, field: string): unknown => {
    if (!error || typeof error !== 'object') return undefined;
    return (error as Record<string, unknown>)[field];
  };

  const isPermissionOrSessionError = (error: unknown) => {
    const code = String(getErrorField(error, 'code') || '').toUpperCase();
    const status = Number(
      getErrorField(error, 'status') || getErrorField(error, 'statusCode') || 0
    );
    const message = String(getErrorField(error, 'message') || '').toLowerCase();
    return (
      code === '42501' ||
      code === 'PGRST301' ||
      status === 401 ||
      status === 403 ||
      message.includes('permission denied') ||
      message.includes('row-level security') ||
      message.includes('jwt')
    );
  };

  const isTransientNetworkError = (error: unknown) => {
    const message = String(getErrorField(error, 'message') || '').toLowerCase();
    return (
      message.includes('failed to fetch') ||
      message.includes('err_connection_closed') ||
      message.includes('networkerror')
    );
  };

  // ------------------------------------------------------------------
  // INIT — carrega tudo do Dados
  // ------------------------------------------------------------------
  async function init(dados: {
    auth: { getUser: () => Promise<any>; getSession: () => Promise<any> };
    from: (table: string) => any;
  }): Promise<void> {
    update((s) => ({ ...s, loading: true, error: null }));

    try {
      let user: User | null = null;
      try {
        const {
          data: { user: directUser }
        } = await dados.auth.getUser();
        user = directUser;
      } catch (getUserError) {
        if (!isTransientNetworkError(getUserError)) {
          throw getUserError;
        }

        const {
          data: { session }
        } = await dados.auth.getSession();
        user = session?.user ?? null;
      }

      if (!user) {
        set(initialState);
        return;
      }

      // 1. Perfil do usuário
      const { data: profile, error: profileErr } = await dados
        .from('users')
        .select('id, email, uso_individual, user_types(name)')
        .eq('id', user.id)
        .single();

      if (profileErr) {
        throw profileErr;
      }

      const userTypeData = profile?.user_types as { name: string }[] | { name: string } | null;
      const userTypeName = Array.isArray(userTypeData) ? userTypeData[0]?.name : userTypeData?.name;
      const userType = String(userTypeName || '').toUpperCase();
      const usoIndividual = Boolean(profile?.uso_individual);

      const papel = resolvePapel(userType, usoIndividual);
      const isSystemAdmin = resolveIsSystemAdmin(userType, usoIndividual);

      // 2. Permissões por módulo (modulo_acesso)
      // Carrega TODOS os registros (ativo ou não) para pickBestPermissao
      const { data: acessosRaw, error: acessosErr } = await dados
        .from('modulo_acesso')
        .select('modulo, permissao, ativo')
        .eq('usuario_id', user.id);

      if (acessosErr) {
        throw acessosErr;
      }

      // Agrupa por módulo para escolher o melhor quando houver duplicatas
      const grouped: Record<string, Array<{ permissao: string; ativo: boolean }>> = {};
      for (const a of acessosRaw || []) {
        const key = String(a.modulo || '')
          .toLowerCase()
          .trim();
        if (!key) continue;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push({ permissao: a.permissao, ativo: Boolean(a.ativo) });
      }

      const acessos: Record<string, PermissaoNivel> = {};
      for (const [modulo, entries] of Object.entries(grouped)) {
        const best = pickBestPermissao(entries);
        if (best !== 'none') {
          acessos[modulo] = best;
        }
      }

      // 3. Módulos desabilitados globalmente
      let disabledModules: string[] = [];
      try {
        const settingsResp = await dados
          .from('system_module_settings')
          .select('module_key, enabled')
          .eq('enabled', false);

        if (!settingsResp.error) {
          disabledModules = (settingsResp.data || []).map((m: any) =>
            String(m.module_key || '').toLowerCase()
          );
        } else {
          const code = String(settingsResp.error.code || '').toLowerCase();
          const message = String(settingsResp.error.message || '').toLowerCase();
          const relationMissing = code === '42p01' || message.includes('does not exist');

          // Compatibilidade com bases antigas que ainda usam system_module_catalog.
          if (relationMissing) {
            const legacyResp = await dados
              .from('system_module_catalog')
              .select('key, enabled')
              .eq('enabled', false);

            if (!legacyResp.error) {
              disabledModules = (legacyResp.data || []).map((m: any) =>
                String(m.key || '').toLowerCase()
              );
            }
          }
        }
      } catch {
        // Tabela pode não existir em instâncias antigas — ignorar silenciosamente
      }
      set({
        userId: user.id,
        userEmail: profile?.email || user.email || '',
        userType,
        papel,
        isMaster: papel === 'MASTER',
        isFinanceiro: papel === 'FINANCEIRO',
        isGestor: papel === 'GESTOR',
        isVendedor: papel === 'VENDEDOR',
        isSystemAdmin,
        usoIndividual,
        acessos,
        disabledModules,
        permissoes: acessos,
        ready: true,
        loading: false,
        error: null
      });
    } catch (err) {
      const normalizedError = new Error(toUserMessage(err, 'Erro ao carregar permissões'));

      const finalMessage = isPermissionOrSessionError(err)
        ? 'Sessao invalida ou sem permissao para carregar contexto. Faca login novamente.'
        : normalizedError.message;

      update((s) => ({
        ...s,
        loading: false,
        ready: true,
        error: finalMessage
      }));

      throw new Error(finalMessage);
    }
  }

  // ------------------------------------------------------------------
  // canDb — verifica por chave de BD (ex: "parametros_crm")
  // Portabilizado do vtur-app canDb()
  // ------------------------------------------------------------------
  function canDb(moduloDb: string, nivel: PermissaoNivel = 'view'): boolean {
    const state = get({ subscribe });

    if (state.isSystemAdmin) return true;

    const key = String(moduloDb || '')
      .toLowerCase()
      .trim();

    // Verifica permissão individual do usuário primeiro
    const perm = state.acessos[key] ?? 'none';
    const hasIndividualPerm = permLevel(perm) >= permLevel(nivel);

    // Módulo desabilitado globalmente — NÃO bloqueia se o usuário tem permissão individual ativa
    // (igual ao comportamento do vtur-app: permissão individual prevalece sobre disable global)
    if (state.disabledModules.includes(key) && !hasIndividualPerm) {
      return false;
    }

    return hasIndividualPerm;
  }

  // ------------------------------------------------------------------
  // can — verifica por label humano COM herança de módulos
  // Ex: can("CRM") checa CRM + Parametros (via MODULO_HERANCA)
  // Portabilizado do vtur-app can()
  // ------------------------------------------------------------------
  function can(moduloLabel: string, nivel: PermissaoNivel = 'view'): boolean {
    const state = get({ subscribe });

    if (state.isSystemAdmin) return true;

    // Resolve módulo + ancestrais via MODULO_HERANCA
    const labels = listarModulosComHeranca(moduloLabel);

    return labels.some((label) => {
      const modDb = MAPA_MODULOS[label] || label;
      // Checa pela chave DB
      if (canDb(modDb, nivel)) return true;
      // Checa também pelo label diretamente (fallback para chaves sem mapeamento)
      if (String(modDb).toLowerCase() !== String(label).toLowerCase()) {
        return canDb(label, nivel);
      }
      return false;
    });
  }

  // ------------------------------------------------------------------
  // getPermissao — retorna o nível atual para um módulo (por label)
  // Portabilizado do vtur-app getPermissao()
  // ------------------------------------------------------------------
  function getPermissao(moduloLabel: string): PermissaoNivel {
    const state = get({ subscribe });

    if (state.isSystemAdmin) return 'admin';

    const labels = listarModulosComHeranca(moduloLabel);
    let bestLevel = 0;

    for (const label of labels) {
      const modDb = String(MAPA_MODULOS[label] || label).toLowerCase();
      const perm = state.acessos[modDb] ?? 'none';
      const level = permLevel(perm as PermissaoNivel);
      if (level > bestLevel) bestLevel = level;
    }

    const levels: PermissaoNivel[] = ['none', 'view', 'create', 'edit', 'delete', 'admin'];
    return levels[bestLevel] ?? 'none';
  }

  // ------------------------------------------------------------------
  // createCanChecker — retorna derived store reativo para uso em templates
  // Útil em: $: canEdit = permissoes.createCanChecker('Vendas', 'edit')
  // ------------------------------------------------------------------
  function createCanChecker(moduloLabel: string, nivel: PermissaoNivel = 'view') {
    return derived({ subscribe }, ($state) => {
      if ($state.isSystemAdmin) return true;
      // Cria snapshot temporário para reusar lógica do can()
      const labels = listarModulosComHeranca(moduloLabel);
      return labels.some((label) => {
        const modDb = String(MAPA_MODULOS[label] || label).toLowerCase();
        if ($state.disabledModules.includes(modDb)) return false;
        const perm = ($state.acessos[modDb] ?? 'none') as PermissaoNivel;
        if (permLevel(perm) >= permLevel(nivel)) return true;
        if (modDb !== label.toLowerCase()) {
          const permLabel = ($state.acessos[label.toLowerCase()] ?? 'none') as PermissaoNivel;
          return permLevel(permLabel) >= permLevel(nivel);
        }
        return false;
      });
    });
  }

  // ------------------------------------------------------------------
  // refresh — recarrega permissões
  // ------------------------------------------------------------------
  async function refresh(dados: {
    auth: { getUser: () => Promise<any>; getSession: () => Promise<any> };
    from: (table: string) => any;
  }): Promise<void> {
    await init(dados);
  }

  // ------------------------------------------------------------------
  // reset — limpa o store (logout)
  // ------------------------------------------------------------------
  function reset(): void {
    set(initialState);
  }

  return {
    subscribe,
    init,
    can,
    canDb,
    getPermissao,
    createCanChecker,
    refresh,
    reset
  };
}

export const permissoes = createPermissoesStore();
