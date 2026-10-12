<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { dev } from '$app/environment';
  import { page } from '$app/stores';
  import { auth } from '$lib/stores/auth';
  import { createSupabaseBrowserClient } from '$lib/db/supabase';
  import { apiPost } from '$lib/services/api';
  import { sidebar, isMobile, toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { descobrirModulo } from '$lib/config/modulos';
  import { DEFAULT_HIDDEN_MENU_KEYS } from '$lib/config/menuDefaults';
  import { menuVisivel } from '$lib/stores/navegacao';
  import {
    AlertCircle,
    Banknote,
    BarChart2,
    BellRing,
    Building2,
    Calendar,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleDollarSign,
    CreditCard,
    FileChartColumn,
    FileText,
    Gift,
    Globe,
    ImagePlus,
    LayoutDashboard,
    LogOut,
    Mail,
    Map as MapIcon,
    MapPin,
    MapPinned,
    Megaphone,
    Menu,
    MessageSquare,
    Package,
    Plane,
    RefreshCw,
    Settings,
    Shield,
    SlidersHorizontal,
    ShoppingCart,
    SquareCheckBig,
    Star,
    Ticket,
    Trophy,
    TrendingUp,
    Truck,
    Users,
    UserCircle,
    Video,
    Wallet
  } from '$lib/icons';
  import { slide } from 'svelte/transition';
  import Button from '$lib/components/ui/Button.svelte';
  import {
    SIDEBAR_EXPANDED_KEY,
    SIDEBAR_COLLAPSED_SECTIONS_KEY,
    readSidebarExpanded,
    readCollapsedSections,
    sectionDomId
  } from './sidebarPrefs';

  type MenuItem = {
    key?: string;
    name: string;
    href?: string;
    icon: typeof LayoutDashboard;
    disabled?: boolean;
    badge?: string;
    systemOnly?: boolean;
  };

  type MenuSection = {
    title: string;
    items: MenuItem[];
    collapsible?: boolean;
  };

  type MenuPrefs = {
    hidden: string[];
  };

  let isMenuExpanded = false;
  let menuPrefsHidden: string[] = [];
  let visibleMenuSections: MenuSection[] = [];
  let visibleMasterItems: MenuItem[] = [];
  let visibleAdminItems: MenuItem[] = [];

  const MENU_PREFS_KEY = 'vtur:menu-prefs';
  const MENU_PREFS_UPDATED_EVENT = 'vtur:menu-prefs-updated';
  const REFRESH_PERMS_AFTER_RELOAD_KEY = 'vtur:refresh-perms-after-reload';

  $: hiddenMenuSet = new Set(menuPrefsHidden);

  $: currentPath = $page.url.pathname;
  $: currentUser = $auth.user;
  $: dashboardHref = $permissoes.isSystemAdmin
    ? '/dashboard/admin'
    : $permissoes.isMaster
      ? '/dashboard/master'
      : $permissoes.isFinanceiro
        ? '/dashboard/financeiro'
        : $permissoes.isGestor
          ? '/dashboard/gestor'
          : '/dashboard/vendedor';
  $: userDisplayName =
    currentUser?.user_metadata?.nome_completo ||
    currentUser?.user_metadata?.nome ||
    currentUser?.email?.split('@')[0] ||
    'Usuario';
  $: userEmail = currentUser?.email || 'Sem email';

  $: menuSections = [
    {
      title: 'INFORMATIVOS',
      collapsible: false,
      items: [
        { key: 'dashboard', name: 'Dashboard', href: dashboardHref, icon: LayoutDashboard },
        { key: 'tarefas', name: 'Tarefas', href: '/operacao/tarefas', icon: SquareCheckBig },
        { key: 'agenda', name: 'Agenda', href: '/operacao/agenda', icon: Calendar },
        { key: 'acompanhamento', name: 'Follow-up', href: '/operacao/acompanhamento', icon: FileText },
        { key: 'recados', name: 'Recados', href: '/operacao/recados', icon: MessageSquare },
        { key: 'aniversariantes', name: 'Aniversariantes', href: '/aniversariantes', icon: Gift }
      ]
    },
    {
      title: 'OPERAÇÃO',
      collapsible: true,
      items: [
        { key: 'vendas', name: 'Vendas', href: '/vendas', icon: CircleDollarSign },
        { key: 'ultimas_compras', name: 'Últimas Compras', href: '/operacao/ultimas-compras', icon: ShoppingCart },
        { key: 'clientes', name: 'Clientes', href: '/clientes', icon: Users },
        { key: 'viagens', name: 'Viagens', href: '/operacao/viagens', icon: Plane },
        { key: 'orcamentos', name: 'Orçamentos', href: '/orcamentos', icon: FileText },
        { key: 'roteiros', name: 'Roteiros', href: '/orcamentos/roteiros', icon: MapIcon },
        { key: 'vouchers', name: 'Vouchers', href: '/operacao/vouchers', icon: Ticket },
        { key: 'controle_sac', name: 'Controle SAC', href: '/operacao/controle-sac', icon: AlertCircle },
        { key: 'campanhas', name: 'Campanhas', href: '/operacao/campanhas', icon: Megaphone },
        { key: 'documentos', name: 'Documentos', href: '/operacao/documentos-viagens', icon: FileText },
        { key: 'consultoria_online', name: 'Consultoria Online', href: '/consultoria-online', icon: Video },
        { key: 'relatorios', name: 'Relatórios', href: '/relatorios', icon: FileChartColumn },
        { key: 'rel_ranking', name: 'Ranking', href: '/relatorios/ranking', icon: Trophy },
        { key: 'rel_desempenho', name: 'Análise de Desempenho', href: '/relatorios/desempenho', icon: BarChart2 }
      ]
    },
    {
      title: 'FINANCEIRO',
      collapsible: true,
      items: [
        { key: 'caixa', name: 'Caixa', href: '/financeiro/caixa', icon: TrendingUp },
        { key: 'vendas_financeiro', name: 'Vendas / Pagamentos', href: '/vendas', icon: CircleDollarSign },
        { key: 'comissoes', name: 'Comissionamento', href: '/financeiro/comissoes', icon: Wallet },
        { key: 'fechamento', name: 'Fechamento', href: '/comissoes/fechamento', icon: Wallet },
        { key: 'ajustes_vendas', name: 'Ajustes Vendas', href: '/financeiro/ajustes-vendas', icon: SlidersHorizontal },
        { key: 'formas_pagamento', name: 'Formas de Pagto', href: '/financeiro/formas-pagamento', icon: CreditCard },
        { key: 'notas_fiscais', name: 'Notas Fiscais', href: '/financeiro/notas-fiscais', icon: FileText },
        { key: 'regras', name: 'Regras', href: '/financeiro/regras', icon: Settings }
      ]
    },
    {
      title: 'PARÂMETROS',
      collapsible: true,
      items: [
        { key: 'parametros', name: 'Parâmetros', href: '/parametros', icon: Settings },
        { key: 'metas', name: 'Metas', href: '/parametros/metas', icon: TrendingUp },
        { key: 'equipe', name: 'Equipe', href: '/parametros/equipe', icon: Users },
        { key: 'escalas', name: 'Escalas', href: '/parametros/escalas', icon: Calendar },
        { key: 'cambios', name: 'Câmbios', href: '/parametros/cambios', icon: Banknote },
        { key: 'tipo_pacotes', name: 'Tipo Pacotes', href: '/parametros/tipo-pacotes', icon: Package },
        { key: 'tipo_produtos', name: 'Tipo Produtos', href: '/parametros/tipo-produtos', icon: Package },
        { key: 'vouchers_assets', name: 'Vouchers', href: '/parametros/vouchers', icon: ImagePlus },
        { key: 'orcamentos_pdf', name: 'Orçamentos PDF', href: '/parametros/orcamentos', icon: FileText },
        { key: 'crm', name: 'CRM', href: '/parametros/crm', icon: MessageSquare },
        { key: 'avisos', name: 'Avisos', href: '/parametros/avisos', icon: BellRing },
        { key: 'empresa', name: 'Empresa', href: '/parametros/empresa', icon: Building2 }
      ]
    },
    {
      title: 'CADASTROS',
      collapsible: true,
      items: [
        { key: 'cadastros_produtos', name: 'Produtos', href: '/cadastros/produtos', icon: Package },
        { key: 'cadastros_circuitos', name: 'Circuitos', href: '/cadastros/circuitos', icon: MapIcon },
        { key: 'cadastros_paises', name: 'Países', href: '/cadastros/paises', icon: Globe },
        { key: 'cadastros_estados', name: 'Estados', href: '/cadastros/estados', icon: MapPinned },
        { key: 'cadastros_cidades', name: 'Cidades', href: '/cadastros/cidades', icon: MapPin },
        { key: 'cadastros_destinos', name: 'Destinos', href: '/cadastros/destinos', icon: MapIcon },
        { key: 'cadastros_lote', name: 'Lote', href: '/cadastros/lote', icon: Package },
        { key: 'cadastros_fornecedores', name: 'Fornecedores', href: '/cadastros/fornecedores', icon: Truck }
      ]
    },
    {
      title: 'PERFIL',
      collapsible: true,
      items: [
        { key: 'meu_perfil', name: 'Meu Perfil', href: '/perfil', icon: UserCircle },
        { key: 'minha_escala', name: 'Minha Escala', href: '/perfil/escala', icon: Calendar },
        { key: 'autenticacao_2fa', name: 'Autenticação 2FA', href: '/perfil/mfa', icon: Shield },
        { key: 'personalizar_menu', name: 'Personalizar Menu', href: '/perfil/personalizar', icon: Settings },
        { key: 'preferencias', name: 'Preferências', href: '/operacao/minhas-preferencias', icon: Star }
      ]
    }
  ] as MenuSection[];

  const masterItems: MenuItem[] = [
    { name: 'Master', href: '/master', icon: Shield },
    { name: 'Usuários', href: '/master/usuarios', icon: Users },
    { name: 'Permissões', href: '/master/permissoes', icon: Shield },
    { name: 'Empresas', href: '/master/empresas', icon: Building2 }
  ];

  const adminItems: MenuItem[] = [
    { key: 'admin_central', name: 'Central Admin', href: '/admin', icon: Shield, systemOnly: true },
    { key: 'admin_dashboard', name: 'Dashboard Admin', href: '/dashboard/admin', icon: LayoutDashboard, systemOnly: true },
    { key: 'admin_planos', name: 'Planos', href: '/admin/planos', icon: CreditCard },
    { key: 'admin_financeiro', name: 'Financeiro', href: '/admin/financeiro', icon: Wallet },
    { key: 'admin_empresas', name: 'Empresas', href: '/admin/empresas', icon: Building2 },
    { key: 'admin_usuarios', name: 'Usuários', href: '/admin/usuarios', icon: Users },
    { key: 'admin_tipos', name: 'Tipos de usuário', href: '/admin/tipos-usuario', icon: Users },
    { key: 'admin_aniversariantes', name: 'Aniversariantes', href: '/admin/aniversariantes', icon: Gift },
    { key: 'admin_avisos', name: 'Avisos', href: '/admin/avisos', icon: Megaphone },
    { key: 'admin_crm', name: 'CRM — Templates', href: '/admin/crm', icon: MessageSquare },
    { key: 'admin_email', name: 'E-mail', href: '/admin/email', icon: Mail },
    { key: 'admin_modulos', name: 'Módulos do sistema', href: '/admin/modulos-sistema', icon: Settings },
    { key: 'admin_permissoes', name: 'Permissões', href: '/admin/permissoes', icon: Shield },
    { key: 'admin_parametros_importacao', name: 'Parâmetros importação', href: '/admin/parametros-importacao', icon: Settings },
    { key: 'admin_fix_recibos', name: 'Correção de recibos', href: '/admin/fix-recibos', icon: RefreshCw },
    { key: 'admin_logs', name: 'Logs', href: '/dashboard/logs', icon: FileText, systemOnly: true },
    { key: 'admin_documentacao', name: 'Documentação', href: '/documentacao', icon: FileText, systemOnly: true }
  ];

  // Seções recolhidas, pelo título (antes era pela posição na lista visível,
  // que muda quando as permissões terminam de carregar).
  let collapsed: Record<string, boolean> = {};
  let asideEl: HTMLElement | null = null;
  let refreshingPerms = false;

  function loadMenuPrefs() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(MENU_PREFS_KEY);
      if (!raw) {
        // Nunca personalizou o menu neste navegador -- aplica o padrão
        // "oculto por padrão" até que o usuário abra "Personalizar Menu"
        // (que então grava a preferência real, explícita, do servidor).
        menuPrefsHidden = [...DEFAULT_HIDDEN_MENU_KEYS];
        return;
      }
      const parsed = JSON.parse(raw) as MenuPrefs;
      menuPrefsHidden = Array.isArray(parsed?.hidden)
        ? parsed.hidden.filter((entry): entry is string => typeof entry === 'string')
        : [];
    } catch {
      menuPrefsHidden = [];
    }
  }

  function isSystemAdminMenuItem(item: MenuItem) {
    const href = item.href || '';
    return (
      item.systemOnly ||
      href === '/admin' ||
      href.startsWith('/admin/') ||
      href.startsWith('/dashboard/admin') ||
      href.startsWith('/dashboard/logs') ||
      href.startsWith('/documentacao')
    );
  }

  function isHiddenByUserPreference(item: MenuItem) {
    if (!item.key) return false;
    if ($permissoes.isSystemAdmin && isSystemAdminMenuItem(item)) return false;
    return hiddenMenuSet.has(item.key);
  }

  function canSeeItem(item: MenuItem) {
    if (!item.href) return true;
    if (isHiddenByUserPreference(item)) return false;
    if (!$permissoes.ready) return true;

    if (item.systemOnly && !$permissoes.isSystemAdmin) return false;
    if (item.key === 'vendas_financeiro' && !$permissoes.isFinanceiro) return false;
    if (item.key === 'ultimas_compras' && !($permissoes.isMaster || $permissoes.isGestor)) return false;
    if (item.key === 'vouchers_assets' && !($permissoes.isMaster || $permissoes.isGestor || $permissoes.isSystemAdmin)) return false;
    if (item.key === 'fechamento' && !$permissoes.isFinanceiro) return false;
    if (item.key === 'notas_fiscais' && !$permissoes.isFinanceiro) return false;
    if (item.key === 'rel_desempenho' && !($permissoes.isMaster || $permissoes.isGestor)) return false;

    if ($permissoes.isFinanceiro) {
      if (item.key === 'vendas') return false;
      if (item.key === 'aniversariantes') return false;
      if (item.href === '/perfil/escala') return permissoes.can('Escalas', 'view');
    }

    if ($permissoes.isSystemAdmin) {
      if (item.href === '/') return false;
      if (item.href.startsWith('/dashboard/admin')) return true;
      if (item.href.startsWith('/dashboard/logs')) return true;
      if (item.href.startsWith('/admin')) return true;
      if (item.href === '/perfil' || item.href.startsWith('/perfil/')) {
        return !item.href.startsWith('/perfil/escala');
      }
      if (item.href.startsWith('/documentacao')) return true;
      return false;
    }

    // Perfil e autenticacao devem permanecer acessiveis mesmo sem modulo mapeado,
    // mas respeitando a preferência de ocultar do usuário.
    if (item.href.startsWith('/perfil')) return !isHiddenByUserPreference(item);

    // /master/permissoes é visível para Master E para quem tem permissão MasterPermissoes
    // (ex: Gestores com essa permissão atribuída) — igual ao vtur-app
    if (item.href === '/master/permissoes' || item.href.startsWith('/master/permissoes/')) {
      return $permissoes.isMaster || permissoes.can('MasterPermissoes', 'view');
    }

    // Demais rotas /master/* seguem gate exclusivo do papel MASTER
    if (item.href.startsWith('/master')) return $permissoes.isMaster;

    const modulo = descobrirModulo(item.href);
    if (!modulo) return false;

    return permissoes.can(modulo, 'view');
  }

  function saveUiPref(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // armazenamento indisponível: a preferência vale só nesta sessão
    }
  }

  function toggleMenuExpanded() {
    isMenuExpanded = !isMenuExpanded;
    saveUiPref(SIDEBAR_EXPANDED_KEY, isMenuExpanded ? '1' : '0');
  }

  const MOBILE_MENU_BUTTON_ID = 'vtur-btn-menu-mobile';

  async function focusFirstMenuLink() {
    await tick();
    asideEl?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
  }

  function toggleMobileMenu() {
    const willOpen = !$sidebar.isOpen;
    sidebar.toggle();
    if (willOpen) void focusFirstMenuLink();
  }

  function closeMobileMenu(returnFocus = false) {
    sidebar.close();
    if (returnFocus) document.getElementById(MOBILE_MENU_BUTTON_ID)?.focus();
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && $isMobile && $sidebar.isOpen) {
      event.preventDefault();
      closeMobileMenu(true);
    }
  }

  // Fecha o menu do celular em qualquer navegação (inclusive voltar/avançar do navegador).
  afterNavigate(() => {
    if ($isMobile && $sidebar.isOpen) sidebar.close();
  });

  onMount(() => {
    loadMenuPrefs();
    try {
      isMenuExpanded = readSidebarExpanded(localStorage.getItem(SIDEBAR_EXPANDED_KEY));
      collapsed = readCollapsedSections(localStorage.getItem(SIDEBAR_COLLAPSED_SECTIONS_KEY));
    } catch {
      // mantém o padrão
    }

    const runPendingPermissionsRefresh = async () => {
      if (typeof window === 'undefined') return;
      if (sessionStorage.getItem(REFRESH_PERMS_AFTER_RELOAD_KEY) !== '1') return;

      sessionStorage.removeItem(REFRESH_PERMS_AFTER_RELOAD_KEY);

      try {
        refreshingPerms = true;
        const supabase = createSupabaseBrowserClient();
        await permissoes.refresh(supabase);
        toast.success('Permissões atualizadas após recarregar a página.');
      } catch (error) {
        if (dev) console.error('Erro ao atualizar permissoes apos reload:', error);
        toast.error('A página foi recarregada, mas não foi possível atualizar as permissões.');
      } finally {
        refreshingPerms = false;
      }
    };

    void runPendingPermissionsRefresh();

    const onStorage = (event: StorageEvent) => {
      if (event.key === MENU_PREFS_KEY) loadMenuPrefs();
    };
    const onPrefsUpdated = () => loadMenuPrefs();

    window.addEventListener('storage', onStorage);
    window.addEventListener(MENU_PREFS_UPDATED_EVENT, onPrefsUpdated);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(MENU_PREFS_UPDATED_EVENT, onPrefsUpdated);
    };
  });

  // hiddenMenuSet e $permissoes são referenciados explicitamente para garantir
  // que o Svelte rastreie estas dependências e recompute os blocos visíveis
  // quando as preferências do usuário OU as permissões mudarem.
  $: {
    hiddenMenuSet;
    $permissoes; // força reatividade quando o store de permissões atualiza
    visibleMenuSections = $permissoes.isSystemAdmin
      ? []
      : menuSections
          .map((section) => ({
            ...section,
            items: section.items.filter((item) => canSeeItem(item)),
          }))
          .filter((section) => section.items.length > 0);

    visibleMasterItems = masterItems.filter((item) => canSeeItem(item));
    visibleAdminItems = $permissoes.isSystemAdmin ? adminItems.filter((item) => canSeeItem(item)) : [];
  }

  // Fase 5.1: a busca rápida (Ctrl+K) mostra exatamente o que este menu mostra.
  $: menuVisivel.set(
    [
      ...visibleMenuSections.flatMap((section) =>
        section.items.map((item) => ({ secao: section.title, item }))
      ),
      ...($permissoes.isMaster ? visibleMasterItems.map((item) => ({ secao: 'MASTER', item })) : []),
      ...visibleAdminItems.map((item) => ({
        secao: $permissoes.isSystemAdmin ? 'ADMINISTRAÇÃO' : 'ADMIN',
        item
      }))
    ]
      .filter(({ item }) => Boolean(item.href) && !item.disabled)
      .map(({ secao, item }) => ({ secao, nome: item.name, href: item.href as string, icon: item.icon }))
  );

  function handleItemClick() {
    if ($isMobile) sidebar.close();
  }

  // Computa o href ativo considerando TODOS os itens do menu;
  // prefere o match mais específico (href mais longo) para evitar
  // duplo destaque quando uma rota pai e uma sub-rota são ambas itens do menu.
  $: allMenuItems = [
    ...menuSections.flatMap((s) => s.items),
    ...masterItems,
    ...adminItems,
  ].filter((item): item is MenuItem & { href: string } => Boolean(item.href));

  $: activeHref = (() => {
    // Ordena por href mais longo primeiro (mais específico vence)
    const sorted = [...allMenuItems].sort(
      (a, b) => (b.href?.length || 0) - (a.href?.length || 0)
    );
    if (currentPath === '/') {
      return sorted.find((item) => item.href === '/')?.href ?? null;
    }
    // Primeiro tenta match exato
    const exact = sorted.find((item) => item.href !== '/' && item.href === currentPath);
    if (exact) return exact.href;
    // Depois tenta startsWith — mas exige que o próximo char seja '/' ou fim de string
    // para evitar que /relatorios bata com /relatorios/vendas sendo o ativo
    const prefix = sorted.find((item) => {
      if (item.href === '/') return false;
      if (!currentPath.startsWith(item.href)) return false;
      const nextChar = currentPath[item.href.length];
      return nextChar === undefined || nextChar === '/';
    });
    return prefix?.href ?? null;
  })();

  function isActive(href?: string): boolean {
    if (!href) return false;
    return href === activeHref;
  }

  function toggleSection(title: string) {
    collapsed = { ...collapsed, [title]: !collapsed[title] };
    saveUiPref(
      SIDEBAR_COLLAPSED_SECTIONS_KEY,
      JSON.stringify(Object.keys(collapsed).filter((key) => collapsed[key]))
    );
  }

  // ── Mapa de rotas → (nome, ícone) para o bottom nav compacto ──
  type NavEntry = { key?: string; name: string; href: string; icon: typeof LayoutDashboard };

  let mobileNavEntries: NavEntry[] = [];
  let visibleMobileNavEntries: NavEntry[] = [];

  $: mobileNavEntries = $permissoes.isSystemAdmin
    ? [
        ...adminItems
          .filter((item): item is MenuItem & { href: string } => Boolean(item.href))
          .map((item) => ({ key: item.key, name: item.name, href: item.href, icon: item.icon })),
        { key: 'meu_perfil', name: 'Perfil', href: '/perfil', icon: UserCircle }
      ]
    : $permissoes.isFinanceiro
      ? [
          { key: 'dashboard', name: 'Dashboard', href: dashboardHref, icon: LayoutDashboard },
          { key: 'caixa', name: 'Caixa', href: '/financeiro/caixa', icon: TrendingUp },
          { key: 'vendas_financeiro', name: 'Vendas', href: '/vendas', icon: CircleDollarSign },
            { key: 'ajustes_vendas', name: 'Ajustes', href: '/financeiro/ajustes-vendas', icon: Settings },
          { key: 'comissoes', name: 'Comissões', href: '/financeiro/comissoes', icon: Wallet },
          { key: 'notas_fiscais', name: 'NF', href: '/financeiro/notas-fiscais', icon: FileText },
          { key: 'meu_perfil', name: 'Perfil', href: '/perfil', icon: UserCircle },
        ]
    : [
        { key: 'dashboard',       name: 'Dashboard',      href: dashboardHref,                    icon: LayoutDashboard },
        { key: 'clientes',        name: 'Clientes',       href: '/clientes',                      icon: Users },
        { key: 'vendas',          name: 'Vendas',         href: '/vendas',                        icon: CircleDollarSign },
        { key: 'ultimas_compras', name: 'Últimas Compras',href: '/operacao/ultimas-compras',      icon: ShoppingCart },
        { key: 'orcamentos',      name: 'Orçamentos',     href: '/orcamentos',                    icon: FileText },
        { key: 'roteiros',        name: 'Roteiros',       href: '/orcamentos/roteiros',           icon: MapIcon },
        { key: 'viagens',         name: 'Viagens',        href: '/operacao/viagens',              icon: Plane },
        { key: 'vouchers',        name: 'Vouchers',       href: '/operacao/vouchers',             icon: Ticket },
        { key: 'tarefas',         name: 'Tarefas',        href: '/operacao/tarefas',              icon: SquareCheckBig },
        { key: 'agenda',          name: 'Agenda',         href: '/operacao/agenda',               icon: Calendar },
        { key: 'acompanhamento',  name: 'Follow-up', href: '/operacao/acompanhamento',       icon: FileText },
        { key: 'controle_sac',    name: 'SAC',            href: '/operacao/controle-sac',         icon: AlertCircle },
        { key: 'campanhas',       name: 'Campanhas',      href: '/operacao/campanhas',            icon: Megaphone },
        { key: 'documentos',      name: 'Documentos',     href: '/operacao/documentos-viagens',   icon: FileText },
        { key: 'consultoria_online', name: 'Consultoria', href: '/consultoria-online',            icon: Video },
        { key: 'aniversariantes', name: 'Aniversariantes',href: '/aniversariantes',               icon: Gift },
        { key: 'preferencias',    name: 'Preferências',   href: '/operacao/minhas-preferencias',  icon: Star },
        { key: 'caixa',           name: 'Caixa',          href: '/financeiro/caixa',              icon: TrendingUp },
        { key: 'comissoes',       name: 'Comissões',      href: '/financeiro/comissoes',          icon: Wallet },
        { key: 'fechamento',      name: 'Fechamento',     href: '/comissoes/fechamento',          icon: Wallet },
        { key: 'relatorios',      name: 'Relatórios',     href: '/relatorios',                    icon: FileChartColumn },
        { key: 'rel_ranking',     name: 'Ranking',        href: '/relatorios/ranking',            icon: Trophy },
        { key: 'rel_desempenho',  name: 'Análise Desempenho', href: '/relatorios/desempenho',     icon: BarChart2 },
        { key: 'parametros',      name: 'Parâmetros',     href: '/parametros',                    icon: Settings },
        $permissoes.isMaster
          ? { name: 'Master',     href: '/master',                 icon: Shield }
          : { name: 'Admin',      href: '/admin',                  icon: Shield },
        { key: 'meu_perfil',      name: 'Perfil',         href: '/perfil',                        icon: UserCircle },
      ];

  $: {
    hiddenMenuSet;
    $permissoes; // força reatividade quando o store de permissões atualiza
    visibleMobileNavEntries = mobileNavEntries.filter((entry) =>
      canSeeItem({ key: entry.key, name: entry.name, href: entry.href, icon: entry.icon })
    );
  }

  // Encontra a entrada mais específica que bate com a rota atual
  $: currentNavEntry = (() => {
    const candidates = visibleMobileNavEntries.length > 0 ? visibleMobileNavEntries : mobileNavEntries;
    const sorted = [...candidates].sort((a, b) => b.href.length - a.href.length);
    if (currentPath === '/') return candidates.find((entry) => entry.href === '/') ?? candidates[0];
    // Exato primeiro
    const exact = sorted.find((entry) => entry.href === currentPath);
    if (exact) return exact;
    // Prefix com boundary de '/'
    const prefix = sorted.find((entry) => {
      if (entry.href === '/') return false;
      if (!currentPath.startsWith(entry.href)) return false;
      const nextChar = currentPath[entry.href.length];
      return nextChar === undefined || nextChar === '/';
    });
    return prefix
      ?? candidates.find((entry) => entry.href === '/perfil')
      ?? candidates[0];
  })();

  async function handleRefreshPermissions() {
    try {
      refreshingPerms = true;
      sessionStorage.setItem(REFRESH_PERMS_AFTER_RELOAD_KEY, '1');
      toast.success('Recarregando a página para atualizar os dados antes das permissões...');
      window.location.reload();
    } catch (error) {
      if (dev) console.error('Erro ao atualizar permissoes:', error);
      toast.error('Não foi possível atualizar as permissões.');
    } finally {
      refreshingPerms = false;
    }
  }

  async function handleLogout() {
    try {
      await apiPost('/auth/logout', null);
      window.location.href = '/auth/login';
    } catch (error) {
      if (dev) console.error('Erro ao fazer logout:', error);
      toast.error('Erro ao fazer logout.');
    }
  }
</script>

<!-- ============================================================
     OVERLAY (mobile: fecha sidebar ao clicar fora)
     ============================================================ -->
{#if $isMobile && $sidebar.isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <!-- Fundo escurecido: fecha no clique; pelo teclado, o menu fecha com Esc. -->
  <div
    class="vtur-sidebar-overlay"
    aria-hidden="true"
    on:click={() => sidebar.close()}
  ></div>
{/if}

<!-- ============================================================
     SIDEBAR
     Desktop: sempre visível, fixo à esquerda
     Mobile: drawer que desliza da esquerda quando aberto
     ============================================================ -->
<svelte:window on:keydown={handleWindowKeydown} />

{#if !$isMobile || $sidebar.isOpen}
  <aside
    id="vtur-menu-lateral"
    bind:this={asideEl}
    class="vtur-sidebar"
    class:vtur-sidebar--mobile={$isMobile}
    class:vtur-sidebar--open={$isMobile && $sidebar.isOpen}
    class:vtur-sidebar--collapsed={!isMenuExpanded && !$isMobile}
    aria-label="Menu principal do sistema"
    style={$isMobile ? 'position:fixed;z-index:999;' : ''}
  >
    <!-- Toggle Button -->
    <div class="vtur-sidebar__toggle">
      <Button
        type="button"
        variant="unstyled"
        class_name="vtur-sidebar__toggle-button"
        on:click={toggleMenuExpanded}
        ariaExpanded={isMenuExpanded}
        ariaLabel={isMenuExpanded ? 'Recolher menu' : 'Expandir menu'}
        title={isMenuExpanded ? 'Recolher menu' : 'Expandir menu'}
      >
        {#if isMenuExpanded}
          <ChevronLeft size={20} />
        {:else}
          <ChevronRight size={20} />
        {/if}
      </Button>
    </div>

    <!-- Body com nav -->
    <div class="vtur-sidebar__body scrollbar-dark">
      {#each visibleMenuSections as section (section.title)}
        <section class="vtur-sidebar__section">
          {#if section.collapsible}
            <Button
              type="button"
              variant="unstyled"
              class_name="vtur-sidebar__section-toggle px-1! py-0! rounded-none! border-0! bg-transparent! shadow-none! focus:ring-0!"
              on:click={() => toggleSection(section.title)}
              ariaExpanded={!collapsed[section.title]}
              ariaControls={sectionDomId(section.title)}
              ariaLabel={section.title}
            >
              <span class="vtur-sidebar__section-title">{section.title}</span>
              <ChevronDown
                size={12}
                class="vtur-sidebar__section-toggle-icon transition-transform duration-200 {collapsed[section.title] ? '' : 'rotate-180'}"
                aria-hidden="true"
              />
            </Button>
          {:else}
            <h2 class="vtur-sidebar__section-title px-1">{section.title}</h2>
          {/if}

          {#if !section.collapsible || !collapsed[section.title]}
            <nav id={sectionDomId(section.title)} class="vtur-sidebar__nav" aria-label={section.title} transition:slide={{ duration: 180 }}>
              {#each section.items as item}
                {#if item.disabled}
                  <div class="vtur-sidebar__item vtur-sidebar__item--disabled" aria-disabled="true" title={item.name}>
                    <div class="vtur-sidebar__item-main">
                      <svelte:component this={item.icon} size={22} class="vtur-sidebar__item-icon" />
                      <span class="vtur-sidebar__item-label">{item.name}</span>
                    </div>
                    {#if item.badge}
                      <span class="vtur-sidebar__badge">{item.badge}</span>
                    {/if}
                  </div>
                {:else if item.href}
                  <a
                    href={item.href}
                    title={item.name}
                    class="vtur-sidebar__item"
                    class:vtur-sidebar__item--active={isActive(item.href)}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    on:click={handleItemClick}
                  >
                    <div class="vtur-sidebar__item-main">
                      <svelte:component
                        this={item.icon}
                        size={22}
                        class="vtur-sidebar__item-icon {isActive(item.href) ? 'text-blue-600' : ''}"
                      />
                      <span class="vtur-sidebar__item-label">{item.name}</span>
                    </div>
                    {#if item.badge}
                      <span class="vtur-sidebar__badge">{item.badge}</span>
                    {/if}
                  </a>
                {/if}
              {/each}
            </nav>
          {/if}
        </section>
      {/each}

      {#if $permissoes.isMaster && visibleMasterItems.length > 0}
        <section class="vtur-sidebar__section">
          <h2 class="vtur-sidebar__section-title px-1">MASTER</h2>
          <nav class="vtur-sidebar__nav" aria-label="Master">
            {#each visibleMasterItems as item}
              <a
                href={item.href}
                title={item.name}
                class="vtur-sidebar__item"
                class:vtur-sidebar__item--active={isActive(item.href)}
                aria-current={isActive(item.href) ? 'page' : undefined}
                on:click={handleItemClick}
              >
                <div class="vtur-sidebar__item-main">
                  <svelte:component this={item.icon} size={22} class="vtur-sidebar__item-icon {isActive(item.href) ? 'text-blue-600' : ''}" />
                  <span class="vtur-sidebar__item-label">{item.name}</span>
                </div>
              </a>
            {/each}
          </nav>
        </section>
      {/if}

      {#if visibleAdminItems.length > 0}
        <section class="vtur-sidebar__section">
          <h2 class="vtur-sidebar__section-title px-1">{$permissoes.isSystemAdmin ? 'ADMINISTRAÇÃO' : 'ADMIN'}</h2>
          <nav class="vtur-sidebar__nav" aria-label="Admin">
            {#each visibleAdminItems as item}
              <a
                href={item.href}
                title={item.name}
                class="vtur-sidebar__item"
                class:vtur-sidebar__item--active={isActive(item.href)}
                aria-current={isActive(item.href) ? 'page' : undefined}
                on:click={handleItemClick}
              >
                <div class="vtur-sidebar__item-main">
                  <svelte:component this={item.icon} size={22} class="vtur-sidebar__item-icon {isActive(item.href) ? 'text-blue-600' : ''}" />
                  <span class="vtur-sidebar__item-label">{item.name}</span>
                </div>
              </a>
            {/each}
          </nav>
        </section>
      {/if}
    </div>

    <!-- Footer -->
    <div class="vtur-sidebar__footer">
      <div class="vtur-sidebar__quick-actions">
        <Button
          type="button"
          variant="unstyled"
          class_name="vtur-sidebar__item"
          on:click={handleRefreshPermissions}
          disabled={refreshingPerms}
          ariaLabel="Atualizar permissões"
          title="Atualizar permissões"
        >
          <div class="vtur-sidebar__item-main">
            <RefreshCw size={22} class={`vtur-sidebar__item-icon ${refreshingPerms ? 'animate-spin' : ''}`} />
            <span class="vtur-sidebar__item-label">{refreshingPerms ? 'Atualizando...' : 'Atualizar permissões'}</span>
          </div>
        </Button>
        <Button
          type="button"
          variant="unstyled"
          class_name="vtur-sidebar__item"
          on:click={handleLogout}
          ariaLabel="Fazer logout"
          title="Sair"
        >
          <div class="vtur-sidebar__item-main">
            <LogOut size={22} class="vtur-sidebar__item-icon" />
            <span class="vtur-sidebar__item-label">Sair</span>
          </div>
        </Button>
      </div>

      <div class="vtur-sidebar__profile">
        <div class="vtur-sidebar__avatar">
          {userDisplayName.slice(0, 2).toUpperCase()}
        </div>
        <div class="vtur-sidebar__profile-copy">
          <p class="vtur-sidebar__profile-name">{userDisplayName}</p>
          <p class="vtur-sidebar__profile-meta">{userEmail}</p>
        </div>
      </div>
    </div>
  </aside>
{/if}

<!-- ============================================================
     BOTTOM NAV — só renderiza no mobile
     ============================================================ -->
{#if $isMobile}
  <!--
    BOTTOM NAV COMPACTO — padrão vtur-app:
    3 colunas: [Menu] [Página atual com ícone + nome grande] [Spacer]
  -->
  <nav
    class="vtur-mobile-nav"
    aria-label="Navegação principal"
  >
    <!-- Coluna 1: Hamburguer / Menu -->
    <Button
      type="button"
      variant="unstyled"
      class_name={`vtur-mobile-nav__menu flex flex-col items-center justify-center gap-1 ${$sidebar.isOpen ? 'vtur-mobile-nav__menu--open' : ''}`}
      id={MOBILE_MENU_BUTTON_ID}
      on:click={toggleMobileMenu}
      ariaExpanded={$sidebar.isOpen}
      ariaControls="vtur-menu-lateral"
      ariaLabel={$sidebar.isOpen ? 'Fechar menu' : 'Abrir menu'}
    >
      <Menu size={22} aria-hidden="true" />
      <span class="text-[0.65rem] font-medium leading-none">Menu</span>
    </Button>

    <!-- Coluna 2: Módulo/Página atual — ícone + nome em destaque -->
    <a
      href={currentNavEntry.href}
      class="vtur-mobile-nav__current transition-colors"
      on:click={() => sidebar.close()}
      aria-label={currentNavEntry.name}
      aria-current={currentNavEntry.href === activeHref ? 'page' : undefined}
    >
      <svelte:component this={currentNavEntry.icon} size={22} />
      <span class="vtur-mobile-nav__label">{currentNavEntry.name}</span>
    </a>

    <!-- Coluna 3: Spacer invisível (simetria) -->
    <span aria-hidden="true"></span>
  </nav>
{/if}
