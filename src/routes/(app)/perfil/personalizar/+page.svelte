<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import FieldToggle from '$lib/components/ui/form/FieldToggle.svelte';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { descobrirModulo } from '$lib/config/modulos';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { DEFAULT_HIDDEN_MENU_KEYS } from '$lib/config/menuDefaults';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { Save, RefreshCw } from '$lib/icons';

  const MENU_PREFS_UPDATED_EVENT = 'vtur:menu-prefs-updated';
  const MENU_PREFS_KEY = 'vtur:menu-prefs';

  // Seções do menu com seus itens — espelha exatamente o Sidebar,
  // incluindo o href para que possamos filtrar por permissão.
  const SECOES = [
    {
      key: 'informativos',
      label: 'Informativos',
      items: [
        { key: 'dashboard',       label: 'Dashboard',        href: '/dashboard' },
        { key: 'tarefas',         label: 'Tarefas',           href: '/operacao/tarefas' },
        { key: 'agenda',          label: 'Agenda',            href: '/operacao/agenda' },
        { key: 'acompanhamento',  label: 'Follow-up',    href: '/operacao/acompanhamento' },
        { key: 'recados',         label: 'Recados',           href: '/operacao/recados' },
        { key: 'aniversariantes', label: 'Aniversariantes',   href: '/aniversariantes' }
      ]
    },
    {
      key: 'operacao',
      label: 'Operação',
      items: [
        { key: 'vendas',              label: 'Vendas',            href: '/vendas' },
        { key: 'ultimas_compras',     label: 'Últimas Compras',   href: '/operacao/ultimas-compras' },
        { key: 'clientes',            label: 'Clientes',          href: '/clientes' },
        { key: 'viagens',             label: 'Viagens',           href: '/operacao/viagens' },
        { key: 'orcamentos',          label: 'Orçamentos',        href: '/orcamentos' },
        { key: 'roteiros',            label: 'Roteiros',          href: '/orcamentos/roteiros' },
        { key: 'vouchers',            label: 'Vouchers',          href: '/operacao/vouchers' },
        { key: 'controle_sac',        label: 'Controle SAC',      href: '/operacao/controle-sac' },
        { key: 'campanhas',           label: 'Campanhas',         href: '/operacao/campanhas' },
        { key: 'documentos',          label: 'Documentos',        href: '/operacao/documentos-viagens' },
        { key: 'consultoria_online',  label: 'Consultoria Online', href: '/consultoria-online' },
        { key: 'relatorios',          label: 'Relatórios',        href: '/relatorios' },
        { key: 'rel_ranking',         label: 'Ranking',           href: '/relatorios/ranking' }
      ]
    },
    {
      key: 'financeiro',
      label: 'Financeiro',
      items: [
        { key: 'caixa',            label: 'Caixa',               href: '/financeiro/caixa' },
        { key: 'comissoes',        label: 'Comissões',           href: '/financeiro/comissoes' },
        { key: 'fechamento',       label: 'Fechamento',          href: '/comissoes/fechamento' },
        { key: 'ajustes_vendas',   label: 'Ajustes Vendas',      href: '/financeiro/ajustes-vendas' },
        { key: 'formas_pagamento', label: 'Formas de Pagamento', href: '/financeiro/formas-pagamento' },
        { key: 'notas_fiscais',    label: 'Notas Fiscais',       href: '/financeiro/notas-fiscais' },
        { key: 'regras',           label: 'Regras',              href: '/financeiro/regras' }
      ]
    },
    {
      key: 'parametros',
      label: 'Parâmetros',
      items: [
        { key: 'parametros',    label: 'Parâmetros',    href: '/parametros' },
        { key: 'metas',         label: 'Metas',         href: '/parametros/metas' },
        { key: 'equipe',        label: 'Equipe',        href: '/parametros/equipe' },
        { key: 'escalas',       label: 'Escalas',       href: '/parametros/escalas' },
        { key: 'cambios',       label: 'Câmbios',       href: '/parametros/cambios' },
        { key: 'tipo_pacotes',  label: 'Tipo Pacotes',  href: '/parametros/tipo-pacotes' },
        { key: 'tipo_produtos', label: 'Tipo Produtos', href: '/parametros/tipo-produtos' },
        { key: 'vouchers_assets', label: 'Vouchers', href: '/parametros/vouchers' },
        { key: 'orcamentos_pdf',label: 'Orçamentos PDF',href: '/parametros/orcamentos' },
        { key: 'crm',           label: 'CRM',           href: '/parametros/crm' },
        { key: 'avisos',        label: 'Avisos',        href: '/parametros/avisos' },
        { key: 'empresa',       label: 'Empresa',       href: '/parametros/empresa' }
      ]
    },
    {
      key: 'cadastros',
      label: 'Cadastros',
      items: [
        { key: 'cadastros_produtos',    label: 'Produtos',     href: '/cadastros/produtos' },
        { key: 'cadastros_circuitos',   label: 'Circuitos',    href: '/cadastros/circuitos' },
        { key: 'cadastros_paises',      label: 'Países',       href: '/cadastros/paises' },
        { key: 'cadastros_estados',     label: 'Estados',      href: '/cadastros/estados' },
        { key: 'cadastros_cidades',     label: 'Cidades',      href: '/cadastros/cidades' },
        { key: 'cadastros_destinos',    label: 'Destinos',     href: '/cadastros/destinos' },
        { key: 'cadastros_lote',        label: 'Lote',         href: '/cadastros/lote' },
        { key: 'cadastros_fornecedores',label: 'Fornecedores', href: '/cadastros/fornecedores' }
      ]
    },
    {
      key: 'perfil',
      label: 'Perfil',
      items: [
        { key: 'meu_perfil',        label: 'Meu Perfil',        href: '/perfil' },
        { key: 'minha_escala',      label: 'Minha Escala',      href: '/perfil/escala' },
        { key: 'autenticacao_2fa',  label: 'Autenticação 2FA',  href: '/perfil/mfa' },
        { key: 'personalizar_menu', label: 'Personalizar Menu', href: '/perfil/personalizar' },
        { key: 'preferencias',      label: 'Preferências',      href: '/operacao/minhas-preferencias' }
      ]
    }
  ];

  // Filtra um item de acordo com as permissões do usuário — mesma lógica do Sidebar.
  function podeVerItem(href: string): boolean {
    if (!$permissoes.ready) return true; // aguarda carregamento
    if (href === '/operacao/ultimas-compras' && !($permissoes.isMaster || $permissoes.isGestor)) return false;
    if (href === '/comissoes/fechamento' && !$permissoes.isFinanceiro) return false;
    if (href === '/financeiro/notas-fiscais' && !$permissoes.isFinanceiro) return false;
    if ($permissoes.isSystemAdmin) {
      return href.startsWith('/perfil') && !href.startsWith('/perfil/escala');
    }
    if (href.startsWith('/perfil')) return true; // perfil sempre acessível
    if (href.startsWith('/master')) return $permissoes.isMaster;
    const modulo = descobrirModulo(href);
    if (!modulo) return false;
    return permissoes.can(modulo, 'view');
  }

  // Seções visíveis de acordo com as permissões do usuário atual.
  // $permissoes é referenciado explicitamente para que o Svelte recompute
  // quando o store de permissões ficar pronto (ready = true).
  $: {
    $permissoes;
    secoesVisiveis = SECOES
      .map((secao) => ({
        ...secao,
        items: secao.items.filter((item) => podeVerItem(item.href))
      }))
      .filter((secao) => secao.items.length > 0);
  }

  type MenuPrefs = {
    hidden: string[];
  };

  type MenuPrefsResponse = {
    prefs?: Partial<MenuPrefs> | null;
  };

  let secoesVisiveis = SECOES;

  let prefs: MenuPrefs = { hidden: [] };
  let loading = true;
  let saving = false;
  let feedbackMessage = '';
  let feedbackType: 'success' | 'error' | 'info' = 'info';
  const loadGuard = createLoadGuard();

  function setFeedback(message: string, type: 'success' | 'error' | 'info' = 'info') {
    feedbackMessage = message;
    feedbackType = type;
  }

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<MenuPrefsResponse>('/api/v1/menu/prefs', undefined, request.signal);
      if (!loadGuard.isCurrent(request.seq)) return;
      const hidden = Array.isArray(payload?.prefs?.hidden) ? payload.prefs.hidden : [];
      prefs = { hidden };
      localStorage.setItem(MENU_PREFS_KEY, JSON.stringify({ hidden }));
      window.dispatchEvent(new CustomEvent(MENU_PREFS_UPDATED_EVENT));
      setFeedback('Preferências do menu carregadas.', 'info');
    } catch (err) {
      if (isCanceledApiError(err)) return;
      const stored = localStorage.getItem(MENU_PREFS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as MenuPrefs;
        prefs = { hidden: Array.isArray(parsed?.hidden) ? parsed.hidden : [] };
      }
      setFeedback('Não foi possível validar o perfil. Preferências locais mantidas.', 'info');
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function isHidden(key: string) {
    return prefs.hidden.includes(key);
  }

  function setItemHidden(key: string, hidden: boolean) {
    const nextHidden = hidden
      ? prefs.hidden.includes(key)
        ? [...prefs.hidden]
        : [...prefs.hidden, key]
      : prefs.hidden.filter((k) => k !== key);

    prefs = { ...prefs, hidden: nextHidden };

    const ok = persistPrefsLocal(false);
    if (ok) {
      const hiddenNow = isHidden(key);
      const itemLabel =
        SECOES.flatMap((secao) => secao.items).find((item) => item.key === key)?.label || key;
      const message = hiddenNow
        ? `${itemLabel} foi ocultado do menu.`
        : `${itemLabel} voltou a aparecer no menu.`;
      toast.success(message);
      setFeedback(message, 'success');
    } else {
      toast.error('Falha ao aplicar alteração do menu.');
      setFeedback('Falha ao aplicar alteração do menu.', 'error');
    }
  }

  function persistPrefsLocal(showToast = true) {
    try {
      localStorage.setItem(MENU_PREFS_KEY, JSON.stringify(prefs));
      window.dispatchEvent(new CustomEvent(MENU_PREFS_UPDATED_EVENT));
      if (showToast) {
        toast.success('Preferências de menu salvas.');
        setFeedback('Preferências de menu salvas com sucesso.', 'success');
      }
      return true;
    } catch {
      if (showToast) {
        toast.error('Erro ao salvar preferências.');
        setFeedback('Erro ao salvar preferências.', 'error');
      }
      return false;
    }
  }

  async function save() {
    saving = true;
    try {
      const localOk = persistPrefsLocal(false);
      if (!localOk) throw new Error('Falha ao salvar preferências localmente.');

      await apiPost('/api/v1/menu/prefs', {
        prefs: {
          v: 1,
          hidden: prefs.hidden,
          order: {},
          section: {}
        }
      });

      toast.success('Preferências de menu salvas com sucesso.');
      setFeedback('Preferências de menu salvas com sucesso.', 'success');
    } catch (err) {
      const message = toUserMessage(err, 'Erro ao salvar preferências de menu.');
      toast.error(message);
      setFeedback(message, 'error');
    } finally {
      saving = false;
    }
  }

  async function resetPrefs() {
    const defaultHidden = [...DEFAULT_HIDDEN_MENU_KEYS];
    prefs = { hidden: defaultHidden };
    localStorage.setItem(MENU_PREFS_KEY, JSON.stringify({ hidden: defaultHidden }));
    window.dispatchEvent(new CustomEvent(MENU_PREFS_UPDATED_EVENT));
    try {
      await apiPost('/api/v1/menu/prefs', {
        prefs: {
          v: 1,
          hidden: defaultHidden,
          order: {},
          section: {}
        }
      });
      toast.success('Preferências resetadas para o padrão.');
      setFeedback('Preferências resetadas para o padrão.', 'success');
    } catch (err) {
      const message = toUserMessage(err, 'Erro ao resetar preferências de menu.');
      toast.error(message);
      setFeedback(message, 'error');
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>Personalizar Menu | VTUR</title>
</svelte:head>

<PageHeader
  title="Personalizar Menu"
  subtitle="Mostre ou oculte itens do menu lateral conforme sua preferência."
  breadcrumbs={[
    { label: 'Perfil', href: '/perfil' },
    { label: 'Personalizar Menu' }
  ]}
  actions={[
    { label: 'Resetar', onClick: resetPrefs, variant: 'secondary', icon: RefreshCw }
  ]}
/>

{#if loading}
  <LoadingState />
{:else}
  <div class="space-y-6">
    {#each secoesVisiveis as secao}
      <Card title={secao.label}>
        <div class="space-y-2">
          {#each secao.items as item}
            <FieldToggle
              label={item.label}
              checked={!isHidden(item.key)}
              color="operacao"
              helper={isHidden(item.key) ? 'Oculto no menu lateral' : 'Visível no menu lateral'}
              on:change={() => {
                setItemHidden(item.key, !isHidden(item.key));
              }}
            />
          {/each}
        </div>
      </Card>
    {/each}

    {#if feedbackMessage}
      <div
        class={`rounded-xl border px-4 py-3 text-sm ${
          feedbackType === 'success'
            ? 'border-green-200 bg-green-50 text-green-700'
            : feedbackType === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-blue-200 bg-blue-50 text-blue-700'
        }`}
        role="status"
        aria-live="polite"
      >
        {feedbackMessage}
      </div>
    {/if}

    <div class="flex justify-end">
      <Button
        type="button"
        variant="primary"
        loading={saving}
        on:click={save}
      >
        <Save size={16} class="mr-2" />
        {saving ? 'Salvando...' : 'Salvar preferências'}
      </Button>
    </div>
  </div>
{/if}
