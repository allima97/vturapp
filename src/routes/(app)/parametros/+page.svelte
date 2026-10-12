<script lang="ts">
  import { dev } from "$app/environment";
  import { onMount } from "svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Tabs from "$lib/components/ui/Tabs.svelte";
  import { FieldCheckbox, FieldInput, FieldSelect, FieldTextarea, SimpleTable, LoadingState } from "$lib/components/ui";
  import FieldToggle from "$lib/components/ui/form/FieldToggle.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import { toast } from "$lib/stores/ui";
  import { permissoes } from "$lib/stores/permissoes";
  import { descobrirModulo } from "$lib/config/modulos";
  import { toUserMessage } from "$lib/utils/errors";
  import { ApiError, apiFetch, apiGet, apiPost, isCanceledApiError } from "$lib/services/api";
  import { DEFAULT_HIDDEN_MENU_KEYS } from "$lib/config/menuDefaults";
  import { createLoadGuard } from "$lib/utils/loadGuard";
  import {
    createDefaultConciliacaoBandRules,
    createEmptyConciliacaoTier,
    createManualConciliacaoBandRule,
    normalizeConciliacaoTipo,
    sanitizeConciliacaoBandRules,
    sanitizeConciliacaoTiers,
    type ConciliacaoBandRule,
    type ConciliacaoTier,
  } from "$lib/utils/conciliacao";
  import {
    CheckCircle2,
    CircleOff,
    Edit2,
    GitBranch,
    Layout,
    Percent,
    Plus,
    RefreshCw,
    Save,
    Settings,
    Shield,
    Trash2,
  } from '$lib/icons';

  // ─── TABS ────────────────────────────────────────────────────────────────────
  const tabItems = [
    { key: 'sistema',     label: 'Parâmetros do Sistema', icon: Settings },
    { key: 'regras',      label: 'Regras de Comissão',    icon: GitBranch },
    { key: 'personalizar',label: 'Personalizar Menu',     icon: Layout },
  ];
  let activeTab = 'sistema';
  const sysGuard = createLoadGuard();
  const rulesContextGuard = createLoadGuard();
  const rulesGuard = createLoadGuard();
  const menuGuard = createLoadGuard();

  // ═══════════════════════════════════════════════════════════════════════════
  // ABA 1 — PARÂMETROS DO SISTEMA
  // ═══════════════════════════════════════════════════════════════════════════
  type ParametrosSistema = {
    id?: string | null;
    company_id: string | null;
    owner_user_id?: string | null;
    owner_user_nome?: string | null;
    usar_taxas_na_meta: boolean;
    foco_valor: "bruto" | "liquido";
    modo_corporativo: boolean;
    politica_cancelamento: "cancelar_venda" | "estornar_recibos";
    foco_faturamento: "bruto" | "liquido";
    conciliacao_sobrepoe_vendas: boolean;
    conciliacao_regra_ativa: boolean;
    conciliacao_tipo: "GERAL" | "ESCALONAVEL";
    conciliacao_meta_nao_atingida: number | null;
    conciliacao_meta_atingida: number | null;
    conciliacao_super_meta: number | null;
    conciliacao_tiers: ConciliacaoTier[];
    conciliacao_faixas_loja: ConciliacaoBandRule[];
    mfa_obrigatorio: boolean;
    exportacao_pdf: boolean;
    exportacao_excel: boolean;
  };

  const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function createDefaultForm(): ParametrosSistema {
    const base: ParametrosSistema = {
      id: null,
      company_id: null,
      owner_user_id: null,
      owner_user_nome: null,
      usar_taxas_na_meta: false,
      foco_valor: "bruto",
      modo_corporativo: false,
      politica_cancelamento: "cancelar_venda",
      foco_faturamento: "bruto",
      conciliacao_sobrepoe_vendas: false,
      conciliacao_regra_ativa: false,
      conciliacao_tipo: "GERAL",
      conciliacao_meta_nao_atingida: null,
      conciliacao_meta_atingida: null,
      conciliacao_super_meta: null,
      conciliacao_tiers: [],
      conciliacao_faixas_loja: [],
      mfa_obrigatorio: false,
      exportacao_pdf: false,
      exportacao_excel: false,
    };
    return { ...base, conciliacao_faixas_loja: createDefaultConciliacaoBandRules(base) };
  }

  function cloneTierSys(tier: ConciliacaoTier): ConciliacaoTier { return { ...tier }; }
  function cloneBand(band: ConciliacaoBandRule): ConciliacaoBandRule {
    return { ...band, tiers: band.tiers.map(cloneTierSys) };
  }

  function hydrateForm(payload?: Partial<ParametrosSistema> | null): ParametrosSistema {
    const base = { ...createDefaultForm(), ...(payload || {}) } as ParametrosSistema;
    const normalized: ParametrosSistema = {
      ...base,
      foco_valor: base.foco_valor === "liquido" ? "liquido" : "bruto",
      foco_faturamento: base.foco_faturamento === "liquido" ? "liquido" : "bruto",
      politica_cancelamento: base.politica_cancelamento === "estornar_recibos" ? "estornar_recibos" : "cancelar_venda",
      conciliacao_tipo: normalizeConciliacaoTipo(base.conciliacao_tipo),
      conciliacao_tiers: sanitizeConciliacaoTiers(base.conciliacao_tiers),
      conciliacao_faixas_loja: [],
      usar_taxas_na_meta: Boolean(base.usar_taxas_na_meta),
      modo_corporativo: Boolean(base.modo_corporativo),
      conciliacao_sobrepoe_vendas: Boolean(base.conciliacao_sobrepoe_vendas),
      conciliacao_regra_ativa: Boolean(base.conciliacao_regra_ativa),
      mfa_obrigatorio: Boolean(base.mfa_obrigatorio),
      exportacao_pdf: Boolean(base.exportacao_pdf),
      exportacao_excel: Boolean(base.exportacao_excel),
    };
    normalized.conciliacao_faixas_loja = sanitizeConciliacaoBandRules(base.conciliacao_faixas_loja, normalized).map(cloneBand);
    return { ...normalized, conciliacao_tiers: normalized.conciliacao_tiers.map(cloneTierSys) };
  }

  function parseNumberOrNull(value: string): number | null {
    if (value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function parseNumberOrZero(value: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function formatDateTime(value?: string | null) {
    if (!value) return "Ainda não salvo";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Ainda não salvo";
    return DATE_TIME_FORMATTER.format(date);
  }

  let sysLoading = true;
  let sysSaving = false;
  let sysAccessDenied = false;
  let sysForm = createDefaultForm();
  let ultimaAtualizacao: string | null = null;
  let origemDados: "default" | "banco" = "default";
  let ownerNome: string | null = null;

  $: canEdit =
    !$permissoes.ready ||
    $permissoes.isSystemAdmin ||
    $permissoes.isMaster ||
    permissoes.can("parametros", "edit") ||
    permissoes.can("admin", "edit") ||
    permissoes.can("admin_financeiro", "edit");
  $: readOnly = !canEdit;
  $: bloqueado = sysLoading || sysSaving || sysAccessDenied || readOnly;
  $: bloqueadoConciliacao = bloqueado || !sysForm.conciliacao_regra_ativa;
  $: bandasAtivas = (() => {
    let total = 0;
    for (const item of sysForm.conciliacao_faixas_loja) {
      if (item.ativo) total += 1;
    }
    return total;
  })();

  async function loadSys() {
    const request = sysGuard.next();
    sysLoading = true;
    sysAccessDenied = false;
    try {
      const payload = await apiFetch<{
        params?: Partial<ParametrosSistema>;
        ultima_atualizacao?: string | null;
        origem?: string | null;
        owner_nome?: string | null;
      }>("/api/v1/parametros/sistema", { redirectOnForbidden: false, signal: request.signal });
      if (!sysGuard.isCurrent(request.seq)) return;
      sysForm = hydrateForm(payload.params);
      ultimaAtualizacao = payload.ultima_atualizacao || null;
      origemDados = payload.origem === "banco" ? "banco" : "default";
      ownerNome = payload.owner_nome || payload.params?.owner_user_nome || null;
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (err instanceof ApiError && err.status === 403) { sysAccessDenied = true; sysForm = createDefaultForm(); return; }
      if (dev) console.error(err);
      toast.error("Não foi possível carregar os parâmetros do sistema.");
    } finally {
      if (sysGuard.isCurrent(request.seq)) sysLoading = false;
    }
  }

  async function saveSys() {
    if (bloqueado) return;
    sysSaving = true;
    try {
      const payload = await apiFetch<{ id?: string | null; owner_nome?: string | null }>("/api/v1/parametros/sistema", {
        method: "POST",
        body: {
          ...sysForm,
          conciliacao_tiers: sysForm.conciliacao_tiers.map(cloneTierSys),
          conciliacao_faixas_loja: sysForm.conciliacao_faixas_loja.map(cloneBand),
        },
      });
      if (payload?.id) sysForm = { ...sysForm, id: payload.id };
      ultimaAtualizacao = new Date().toISOString();
      origemDados = "banco";
      ownerNome = payload?.owner_nome || sysForm.owner_user_nome || ownerNome;
      toast.success("Parâmetros do sistema salvos com sucesso.");
      await loadSys();
    } catch (err) {
      if (dev) console.error(err);
      toast.error(toUserMessage(err, "Erro ao salvar parâmetros."));
    } finally {
      sysSaving = false;
    }
  }

  function updateTopLevel<K extends keyof ParametrosSistema>(key: K, value: ParametrosSistema[K]) {
    sysForm = { ...sysForm, [key]: value };
  }
  function addTierSys(faixa: "PRE" | "POS") {
    sysForm = { ...sysForm, conciliacao_tiers: [...sysForm.conciliacao_tiers, createEmptyConciliacaoTier(faixa)] };
  }
  function updateTierSys(index: number, field: keyof ConciliacaoTier, value: string) {
    sysForm = {
      ...sysForm,
      conciliacao_tiers: sysForm.conciliacao_tiers.map((tier, i) =>
        i !== index ? tier : { ...tier, [field]: field === "faixa" ? (value === "POS" ? "POS" : "PRE") : parseNumberOrZero(value) }
      ),
    };
  }
  function removeTierSys(index: number) {
    sysForm = { ...sysForm, conciliacao_tiers: sysForm.conciliacao_tiers.filter((_, i) => i !== index) };
  }
  function addBand() {
    sysForm = { ...sysForm, conciliacao_faixas_loja: [...sysForm.conciliacao_faixas_loja, createManualConciliacaoBandRule(sysForm.conciliacao_faixas_loja.length + 1)] };
  }
  function updateBand(index: number, changes: Partial<ConciliacaoBandRule>) {
    sysForm = { ...sysForm, conciliacao_faixas_loja: sysForm.conciliacao_faixas_loja.map((band, i) => i === index ? { ...band, ...changes } : band) };
  }
  function removeBand(index: number) {
    if (sysForm.conciliacao_faixas_loja.length <= 1) return;
    sysForm = { ...sysForm, conciliacao_faixas_loja: sysForm.conciliacao_faixas_loja.filter((_, i) => i !== index) };
  }
  function addBandTier(index: number, faixa: "PRE" | "POS") {
    updateBand(index, { tiers: [...sysForm.conciliacao_faixas_loja[index].tiers, createEmptyConciliacaoTier(faixa)] });
  }
  function updateBandTier(index: number, tierIndex: number, field: keyof ConciliacaoTier, value: string) {
    updateBand(index, {
      tiers: sysForm.conciliacao_faixas_loja[index].tiers.map((tier, i) =>
        i !== tierIndex ? tier : { ...tier, [field]: field === "faixa" ? (value === "POS" ? "POS" : "PRE") : parseNumberOrZero(value) }
      ),
    });
  }
  function removeBandTier(index: number, tierIndex: number) {
    updateBand(index, { tiers: sysForm.conciliacao_faixas_loja[index].tiers.filter((_, i) => i !== tierIndex) });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABA 2 — REGRAS DE COMISSÃO
  // ═══════════════════════════════════════════════════════════════════════════
  type RuleType = 'GERAL' | 'ESCALONAVEL';
  type FaixaType = 'PRE' | 'POS';

  interface Tier {
    id?: string;
    faixa: FaixaType;
    de_pct: number;
    ate_pct: number;
    inc_pct_meta: number;
    inc_pct_comissao: number;
    ativo?: boolean;
  }
  interface Rule {
    id: string;
    company_id?: string | null;
    nome: string;
    descricao: string | null;
    tipo: RuleType;
    meta_nao_atingida: number | null;
    meta_atingida: number | null;
    super_meta: number | null;
    ativo: boolean;
    commission_tier?: Tier[];
  }
  interface EmpresaOption { id: string; nome?: string | null; nome_fantasia?: string | null; razao_social?: string | null; }
  interface RuleForm {
    nome: string; descricao: string; tipo: RuleType;
    meta_nao_atingida: number; meta_atingida: number; super_meta: number;
    ativo: boolean; tiers: Tier[];
  }

  const percentFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const faixas: FaixaType[] = ['PRE', 'POS'];
  const ruleTypeOptions = [
    { value: 'GERAL', label: 'Geral (percentuais fixos)' },
    { value: 'ESCALONAVEL', label: 'Escalonável (faixas PRE/POS)' }
  ];
  const faixaOptions = [{ value: 'PRE', label: 'PRE' }, { value: 'POS', label: 'POS' }];

  const emptyRuleForm = (): RuleForm => ({ nome: '', descricao: '', tipo: 'GERAL', meta_nao_atingida: 0, meta_atingida: 0, super_meta: 0, ativo: true, tiers: [] });

  let rules: Rule[] = [];
  let rulesLoading = true;
  let rulesSaving = false;
  let rulesActionLoading = false;
  let showRuleForm = false;
  let editRuleId: string | null = null;
  let rulesError = '';
  let rulesValidationError = '';
  let ruleForm: RuleForm = emptyRuleForm();
  let empresas: EmpresaOption[] = [];
  let empresaId = '';
  let confirmOpen = false;
  let confirmMode: 'inativar' | 'excluir' = 'inativar';
  let selectedRule: Rule | null = null;

  $: empresaOptions = empresas.map((e) => ({ value: e.id, label: e.nome_fantasia || e.nome || e.razao_social || e.id }));
  $: canSelectEmpresa = empresaOptions.length > 1;
  $: canEditRules = $permissoes.ready && (permissoes.can('RegrasComissao', 'edit') || permissoes.can('Parametros', 'edit'));

  function normalizeNumber(value: unknown) { const p = Number(value); return Number.isFinite(p) ? p : 0; }
  function cloneTiers(tiers?: Tier[]): Tier[] {
    return (tiers || []).map((t): Tier => ({ id: t.id, faixa: t.faixa === 'POS' ? 'POS' : 'PRE', de_pct: normalizeNumber(t.de_pct), ate_pct: normalizeNumber(t.ate_pct), inc_pct_meta: normalizeNumber(t.inc_pct_meta), inc_pct_comissao: normalizeNumber(t.inc_pct_comissao) }));
  }
  function normalizeRule(raw: unknown): Rule {
    const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return { id: String(value.id || ''), nome: String(value.nome || ''), descricao: value.descricao ? String(value.descricao) : null, company_id: value.company_id ? String(value.company_id) : null, tipo: value.tipo === 'ESCALONAVEL' ? 'ESCALONAVEL' : 'GERAL', meta_nao_atingida: normalizeNumber(value.meta_nao_atingida), meta_atingida: normalizeNumber(value.meta_atingida), super_meta: normalizeNumber(value.super_meta), ativo: Boolean(value.ativo), commission_tier: cloneTiers(value.commission_tier as Tier[] | undefined) };
  }
  async function requestRulesApi<T = unknown>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: Record<string, unknown>, signal?: AbortSignal): Promise<T | null> {
    return apiFetch<T | null>('/api/v1/parametros/commission-rules', { method, signal, query: method === 'GET' ? { empresa_id: empresaId || undefined } : undefined, body: method === 'GET' ? undefined : { ...(body || {}), empresa_id: empresaId || undefined } });
  }
  async function loadUserContext() {
    const request = rulesContextGuard.next();
    try {
      const data = await apiGet<{ company_id?: string | null; empresas?: EmpresaOption[] }>('/api/v1/user/context', undefined, request.signal);
      if (!rulesContextGuard.isCurrent(request.seq)) return false;
      empresas = Array.isArray(data.empresas) ? data.empresas : [];
      empresaId = String(data.company_id || '').trim() || empresas[0]?.id || '';
      return true;
    } catch (err) {
      if (isCanceledApiError(err)) return false;
      empresas = []; empresaId = '';
      return true;
    }
  }
  async function loadRules(opts: { silent?: boolean } = {}) {
    const request = rulesGuard.next();
    if (!opts.silent) rulesLoading = true;
    rulesError = '';
    try {
      const data = await requestRulesApi<Rule[]>('GET', undefined, request.signal);
      if (!rulesGuard.isCurrent(request.seq)) return;
      rules = Array.isArray(data) ? data.map(normalizeRule) : [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      const msg = toUserMessage(err, 'Erro ao carregar regras de comissão.');
      rulesError = msg; rules = []; toast.error(msg);
    } finally { if (rulesGuard.isCurrent(request.seq)) rulesLoading = false; }
  }
  async function handleEmpresaChange() { showRuleForm = false; resetRuleForm(); await loadRules(); }

  $: rulesResumo = rules.reduce((acc, rule) => {
    if (rule.ativo) acc.activeRules += 1; else acc.inactiveRules += 1;
    if (rule.tipo === 'ESCALONAVEL') acc.escalonaveis += 1;
    acc.totalTiers += rule.commission_tier?.length || 0;
    return acc;
  }, { activeRules: 0, inactiveRules: 0, escalonaveis: 0, totalTiers: 0 });
  $: ({ activeRules, inactiveRules, escalonaveis, totalTiers } = rulesResumo);

  function formatPercent(value: number | null | undefined) { return percentFormatter.format(normalizeNumber(value)); }
  function resetRuleForm() { ruleForm = emptyRuleForm(); editRuleId = null; rulesValidationError = ''; rulesError = ''; }
  function openCreateRuleForm() { resetRuleForm(); showRuleForm = true; }
  function cancelRuleForm() { showRuleForm = false; resetRuleForm(); }
  function editRule(rule: Rule) {
    ruleForm = { nome: rule.nome, descricao: rule.descricao || '', tipo: rule.tipo, meta_nao_atingida: normalizeNumber(rule.meta_nao_atingida), meta_atingida: normalizeNumber(rule.meta_atingida), super_meta: normalizeNumber(rule.super_meta), ativo: Boolean(rule.ativo), tiers: cloneTiers(rule.commission_tier) };
    editRuleId = rule.id; showRuleForm = true; rulesValidationError = ''; rulesError = '';
  }
  function addRuleTier(faixa: FaixaType) { ruleForm = { ...ruleForm, tiers: [...ruleForm.tiers, { faixa, de_pct: 0, ate_pct: 0, inc_pct_meta: 0, inc_pct_comissao: 0 }] }; }
  function updateRuleTier(index: number, field: 'faixa' | 'de_pct' | 'ate_pct' | 'inc_pct_meta' | 'inc_pct_comissao', value: string) {
    ruleForm = { ...ruleForm, tiers: ruleForm.tiers.map((tier, i) => i !== index ? tier : field === 'faixa' ? { ...tier, faixa: value === 'POS' ? 'POS' : 'PRE' } : { ...tier, [field]: normalizeNumber(value) }) };
  }
  function removeRuleTier(index: number) { ruleForm = { ...ruleForm, tiers: ruleForm.tiers.filter((_, i) => i !== index) }; }
  function handleRuleTierInput(index: number, field: 'de_pct' | 'ate_pct' | 'inc_pct_meta' | 'inc_pct_comissao', event: Event) { updateRuleTier(index, field, (event.currentTarget as HTMLInputElement)?.value || '0'); }
  function handleRuleTierFaixaChange(index: number, event: Event) { updateRuleTier(index, 'faixa', (event.currentTarget as HTMLSelectElement)?.value || 'PRE'); }
  function handleRuleMetaInput(field: 'meta_nao_atingida' | 'meta_atingida' | 'super_meta', event: Event) { ruleForm = { ...ruleForm, [field]: normalizeNumber((event.currentTarget as HTMLInputElement)?.value) }; }

  function validateRuleForm() {
    if (!ruleForm.nome.trim()) return 'Informe o nome da regra.';
    if (ruleForm.tipo !== 'ESCALONAVEL') return null;
    if (ruleForm.tiers.length === 0) return 'Adicione pelo menos uma faixa PRE ou POS.';
    for (const tier of ruleForm.tiers) { if (tier.de_pct > tier.ate_pct) return 'Em uma faixa, o valor inicial não pode ser maior que o final.'; }
    for (const faixa of faixas) {
      const list = ruleForm.tiers.filter((t) => t.faixa === faixa).sort((a, b) => a.de_pct - b.de_pct);
      for (let i = 1; i < list.length; i++) { if (list[i - 1].ate_pct > list[i].de_pct) return `Faixas ${faixa} sobrepostas: finalize a faixa anterior em ${formatPercent(list[i - 1].ate_pct)}% antes de iniciar ${formatPercent(list[i].de_pct)}%.`; }
    }
    return null;
  }

  async function saveRule() {
    if (rulesSaving) return;
    rulesValidationError = '';
    const validation = validateRuleForm();
    if (validation) { rulesValidationError = validation; toast.error(validation); return; }
    rulesSaving = true; rulesError = '';
    try {
      await requestRulesApi('POST', { id: editRuleId || undefined, nome: ruleForm.nome.trim(), descricao: ruleForm.descricao.trim() || null, tipo: ruleForm.tipo, meta_nao_atingida: ruleForm.meta_nao_atingida, meta_atingida: ruleForm.meta_atingida, super_meta: ruleForm.super_meta, ativo: ruleForm.ativo, tiers: ruleForm.tipo === 'ESCALONAVEL' ? ruleForm.tiers : [] });
      toast.success(editRuleId ? 'Regra atualizada com sucesso.' : 'Regra criada com sucesso.');
      await loadRules({ silent: true }); cancelRuleForm();
    } catch (err) { const msg = toUserMessage(err, 'Erro ao salvar regra.'); rulesError = msg; toast.error(msg); } finally { rulesSaving = false; }
  }

  function askInactivate(rule: Rule) { selectedRule = rule; confirmMode = 'inativar'; confirmOpen = true; }
  function askDelete(rule: Rule) { selectedRule = rule; confirmMode = 'excluir'; confirmOpen = true; }
  function closeConfirm() { confirmOpen = false; selectedRule = null; rulesActionLoading = false; }
  async function confirmRuleAction() {
    if (!selectedRule || rulesActionLoading) return;
    rulesActionLoading = true;
    try {
      if (confirmMode === 'inativar') { await requestRulesApi('PATCH', { id: selectedRule.id, ativo: false }); toast.success('Regra inativada com sucesso.'); }
      else { await requestRulesApi('DELETE', { id: selectedRule.id }); toast.success('Regra excluída com sucesso.'); }
      await loadRules({ silent: true }); closeConfirm();
    } catch (err) {
      const msg = toUserMessage(err, confirmMode === 'inativar' ? 'Erro ao inativar regra.' : 'Erro ao excluir regra.');
      rulesError = msg; toast.error(msg); rulesActionLoading = false;
    }
  }
  function getSortedTiers(rule: Rule, faixa: FaixaType) { return cloneTiers(rule.commission_tier).filter((t) => t.faixa === faixa).sort((a, b) => a.de_pct - b.de_pct); }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABA 3 — PERSONALIZAR MENU
  // ═══════════════════════════════════════════════════════════════════════════
  const MENU_PREFS_UPDATED_EVENT = 'vtur:menu-prefs-updated';
  const MENU_PREFS_KEY = 'vtur:menu-prefs';

  const SECOES = [
    { key: 'informativos', label: 'Informativos', items: [
      { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
      { key: 'tarefas', label: 'Tarefas', href: '/operacao/tarefas' },
      { key: 'agenda', label: 'Agenda', href: '/operacao/agenda' },
      { key: 'acompanhamento', label: 'Follow-up', href: '/operacao/acompanhamento' },
      { key: 'recados', label: 'Recados', href: '/operacao/recados' },
      { key: 'aniversariantes', label: 'Aniversariantes', href: '/aniversariantes' }
    ]},
    { key: 'operacao', label: 'Operação', items: [
      { key: 'vendas', label: 'Vendas', href: '/vendas' },
      { key: 'ultimas_compras', label: 'Últimas Compras', href: '/operacao/ultimas-compras' },
      { key: 'clientes', label: 'Clientes', href: '/clientes' },
      { key: 'viagens', label: 'Viagens', href: '/operacao/viagens' },
      { key: 'orcamentos', label: 'Orçamentos', href: '/orcamentos' },
      { key: 'roteiros', label: 'Roteiros', href: '/orcamentos/roteiros' },
      { key: 'vouchers', label: 'Vouchers', href: '/operacao/vouchers' },
      { key: 'controle_sac', label: 'Controle SAC', href: '/operacao/controle-sac' },
      { key: 'campanhas', label: 'Campanhas', href: '/operacao/campanhas' },
      { key: 'documentos', label: 'Documentos', href: '/operacao/documentos-viagens' },
      { key: 'consultoria_online', label: 'Consultoria Online', href: '/consultoria-online' },
      { key: 'relatorios', label: 'Relatórios', href: '/relatorios' },
      { key: 'rel_ranking', label: 'Ranking', href: '/relatorios/ranking' }
    ]},
    { key: 'financeiro', label: 'Financeiro', items: [
      { key: 'caixa', label: 'Caixa', href: '/financeiro/caixa' },
      { key: 'comissoes', label: 'Comissões', href: '/financeiro/comissoes' },
      { key: 'fechamento', label: 'Fechamento', href: '/comissoes/fechamento' },
      { key: 'ajustes_vendas', label: 'Ajustes Vendas', href: '/financeiro/ajustes-vendas' },
      { key: 'formas_pagamento', label: 'Formas de Pagamento', href: '/financeiro/formas-pagamento' },
      { key: 'notas_fiscais', label: 'Notas Fiscais', href: '/financeiro/notas-fiscais' },
      { key: 'regras', label: 'Regras', href: '/financeiro/regras' }
    ]},
    { key: 'parametros', label: 'Parâmetros', items: [
      { key: 'parametros', label: 'Parâmetros', href: '/parametros' },
      { key: 'metas', label: 'Metas', href: '/parametros/metas' },
      { key: 'equipe', label: 'Equipe', href: '/parametros/equipe' },
      { key: 'escalas', label: 'Escalas', href: '/parametros/escalas' },
      { key: 'cambios', label: 'Câmbios', href: '/parametros/cambios' },
      { key: 'tipo_pacotes', label: 'Tipo Pacotes', href: '/parametros/tipo-pacotes' },
      { key: 'tipo_produtos', label: 'Tipo Produtos', href: '/parametros/tipo-produtos' },
      { key: 'vouchers_assets', label: 'Vouchers', href: '/parametros/vouchers' },
      { key: 'orcamentos_pdf', label: 'Orçamentos PDF', href: '/parametros/orcamentos' },
      { key: 'crm', label: 'CRM', href: '/parametros/crm' },
      { key: 'avisos', label: 'Avisos', href: '/parametros/avisos' },
      { key: 'empresa', label: 'Empresa', href: '/parametros/empresa' }
    ]},
    { key: 'cadastros', label: 'Cadastros', items: [
      { key: 'cadastros_produtos', label: 'Produtos', href: '/cadastros/produtos' },
      { key: 'cadastros_circuitos', label: 'Circuitos', href: '/cadastros/circuitos' },
      { key: 'cadastros_paises', label: 'Países', href: '/cadastros/paises' },
      { key: 'cadastros_estados', label: 'Estados', href: '/cadastros/estados' },
      { key: 'cadastros_cidades', label: 'Cidades', href: '/cadastros/cidades' },
      { key: 'cadastros_destinos', label: 'Destinos', href: '/cadastros/destinos' },
      { key: 'cadastros_lote', label: 'Lote', href: '/cadastros/lote' },
      { key: 'cadastros_fornecedores', label: 'Fornecedores', href: '/cadastros/fornecedores' }
    ]},
    { key: 'perfil', label: 'Perfil', items: [
      { key: 'meu_perfil', label: 'Meu Perfil', href: '/perfil' },
      { key: 'minha_escala', label: 'Minha Escala', href: '/perfil/escala' },
      { key: 'autenticacao_2fa', label: 'Autenticação 2FA', href: '/perfil/mfa' },
      { key: 'personalizar_menu', label: 'Personalizar Menu', href: '/perfil/personalizar' },
      { key: 'preferencias', label: 'Preferências', href: '/operacao/minhas-preferencias' }
    ]}
  ];

  function podeVerItem(href: string): boolean {
    if (!$permissoes.ready) return true;
    if (href === '/operacao/ultimas-compras' && !($permissoes.isMaster || $permissoes.isGestor)) return false;
    if (href === '/comissoes/fechamento' && !$permissoes.isFinanceiro) return false;
    if (href === '/financeiro/notas-fiscais' && !$permissoes.isFinanceiro) return false;
    if ($permissoes.isSystemAdmin) return href.startsWith('/perfil') && !href.startsWith('/perfil/escala');
    if (href.startsWith('/perfil')) return true;
    if (href.startsWith('/master')) return $permissoes.isMaster;
    const modulo = descobrirModulo(href);
    if (!modulo) return false;
    return permissoes.can(modulo, 'view');
  }

  $: {
    $permissoes;
    secoesVisiveis = SECOES
      .map((secao) => ({ ...secao, items: secao.items.filter((item) => podeVerItem(item.href)) }))
      .filter((secao) => secao.items.length > 0);
  }

  type MenuPrefs = { hidden: string[] };
  type MenuPrefsResponse = { prefs?: Partial<MenuPrefs> | null };
  let secoesVisiveis = SECOES;
  let prefs: MenuPrefs = { hidden: [] };
  let menuLoading = true;
  let menuSaving = false;
  let feedbackMessage = '';
  let feedbackType: 'success' | 'error' | 'info' = 'info';

  function setFeedback(message: string, type: 'success' | 'error' | 'info' = 'info') { feedbackMessage = message; feedbackType = type; }

  async function loadMenuPrefs() {
    const request = menuGuard.next();
    menuLoading = true;
    try {
      const payload = await apiGet<MenuPrefsResponse>('/api/v1/menu/prefs', undefined, request.signal);
      if (!menuGuard.isCurrent(request.seq)) return;
      const hidden = Array.isArray(payload?.prefs?.hidden) ? payload.prefs.hidden : [];
      prefs = { hidden };
      localStorage.setItem(MENU_PREFS_KEY, JSON.stringify({ hidden }));
      window.dispatchEvent(new CustomEvent(MENU_PREFS_UPDATED_EVENT));
      setFeedback('Preferências do menu carregadas.', 'info');
    } catch (err) {
      if (isCanceledApiError(err)) return;
      const stored = localStorage.getItem(MENU_PREFS_KEY);
      if (stored) { const parsed = JSON.parse(stored) as MenuPrefs; prefs = { hidden: Array.isArray(parsed?.hidden) ? parsed.hidden : [] }; }
      setFeedback('Não foi possível validar o perfil. Preferências locais mantidas.', 'info');
    } finally { if (menuGuard.isCurrent(request.seq)) menuLoading = false; }
  }

  function isHidden(key: string) { return prefs.hidden.includes(key); }
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
      const itemLabel = SECOES.flatMap((s) => s.items).find((item) => item.key === key)?.label || key;
      const message = hiddenNow ? `${itemLabel} foi ocultado do menu.` : `${itemLabel} voltou a aparecer no menu.`;
      toast.success(message); setFeedback(message, 'success');
    } else { toast.error('Falha ao aplicar alteração do menu.'); setFeedback('Falha ao aplicar alteração do menu.', 'error'); }
  }
  function persistPrefsLocal(showToast = true) {
    try {
      localStorage.setItem(MENU_PREFS_KEY, JSON.stringify(prefs));
      window.dispatchEvent(new CustomEvent(MENU_PREFS_UPDATED_EVENT));
      if (showToast) { toast.success('Preferências de menu salvas.'); setFeedback('Preferências de menu salvas com sucesso.', 'success'); }
      return true;
    } catch { if (showToast) { toast.error('Erro ao salvar preferências.'); setFeedback('Erro ao salvar preferências.', 'error'); } return false; }
  }
  async function saveMenuPrefs() {
    menuSaving = true;
    try {
      const localOk = persistPrefsLocal(false);
      if (!localOk) throw new Error('Falha ao salvar preferências localmente.');
      await apiPost('/api/v1/menu/prefs', { prefs: { v: 1, hidden: prefs.hidden, order: {}, section: {} } });
      toast.success('Preferências de menu salvas com sucesso.');
      setFeedback('Preferências de menu salvas com sucesso.', 'success');
    } catch (err) {
      const message = toUserMessage(err, 'Erro ao salvar preferências de menu.');
      toast.error(message);
      setFeedback(message, 'error');
    } finally { menuSaving = false; }
  }
  async function resetMenuPrefs() {
    const defaultHidden = [...DEFAULT_HIDDEN_MENU_KEYS];
    prefs = { hidden: defaultHidden };
    localStorage.setItem(MENU_PREFS_KEY, JSON.stringify({ hidden: defaultHidden }));
    window.dispatchEvent(new CustomEvent(MENU_PREFS_UPDATED_EVENT));
    try {
      await apiPost('/api/v1/menu/prefs', { prefs: { v: 1, hidden: defaultHidden, order: {}, section: {} } });
      toast.success('Preferências resetadas para o padrão.');
      setFeedback('Preferências resetadas para o padrão.', 'success');
    } catch (err) {
      const message = toUserMessage(err, 'Erro ao resetar preferências de menu.');
      toast.error(message);
      setFeedback(message, 'error');
    }
  }

  // ─── MOUNT ───────────────────────────────────────────────────────────────────
  onMount(async () => {
    await Promise.all([
      loadSys(),
      (async () => {
        if (await loadUserContext()) await loadRules();
        else rulesLoading = false;
      })(),
      loadMenuPrefs()
    ]);
  });
</script>

<svelte:head>
  <title>Parâmetros | VTUR</title>
</svelte:head>

<PageHeader
  title="Parâmetros"
  subtitle="Configure o sistema, regras de comissão e preferências do menu."
  color="financeiro"
  breadcrumbs={[{ label: 'Parâmetros' }]}
/>

<Tabs items={tabItems} bind:activeKey={activeTab} className="mb-6" />

<!-- ═══════════════════════════════════════════════════════════════════════════ -->
<!-- ABA 1 — PARÂMETROS DO SISTEMA                                              -->
<!-- ═══════════════════════════════════════════════════════════════════════════ -->
{#if activeTab === 'sistema'}
  {#if sysAccessDenied}
    <Card color="financeiro">
      <div class="flex items-start gap-3">
        <Shield size={22} class="mt-0.5 text-amber-600" />
        <div class="space-y-1">
          <p class="font-semibold text-slate-900">Acesso restrito</p>
          <p class="text-sm text-slate-600">
            Seu perfil não possui acesso a este conjunto de parâmetros.
          </p>
        </div>
      </div>
    </Card>
  {:else}
    <div class="space-y-6">
      <Card color="financeiro" title="Resumo da configuração">
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Última atualização</p>
            <p class="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(ultimaAtualizacao)}</p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Origem</p>
            <p class="mt-2 text-sm font-semibold text-slate-900">{origemDados === "banco" ? "Banco de dados" : "Valores padrão"}</p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Última edição por</p>
            <p class="mt-2 text-sm font-semibold text-slate-900">{ownerNome || "Sem registro"}</p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Regra de conciliação</p>
            <p class="mt-2 text-sm font-semibold text-slate-900">
              {sysForm.conciliacao_regra_ativa ? sysForm.conciliacao_tipo === "ESCALONAVEL" ? "Escalonável" : "Geral" : "Desativada"}
            </p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Faixas ativas</p>
            <p class="mt-2 text-sm font-semibold text-slate-900">{bandasAtivas}</p>
          </div>
        </div>

        {#if readOnly}
          <div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Seu perfil está em modo de consulta.
          </div>
        {/if}
        {#if origemDados === "default"}
          <div class="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Exibindo valores padrão — nenhum registro salvo encontrado para a empresa atual.
          </div>
        {/if}
      </Card>

      <div class="grid gap-6 xl:grid-cols-3">
        <Card color="financeiro" title="Metas e faturamento">
          <div class="space-y-4">
            <FieldCheckbox label="Meta considera taxas" helper="Inclui taxas no cálculo da meta geral e no resumo operacional da equipe." bind:checked={sysForm.usar_taxas_na_meta} disabled={bloqueado} color="financeiro" class_name="rounded-xl border border-slate-200 bg-white px-4 py-4" />
            <FieldSelect id="foco-valores" label="Foco das metas" value={sysForm.foco_valor} options={[{ value: 'bruto', label: 'Valor bruto' }, { value: 'liquido', label: 'Valor líquido' }]} disabled={bloqueado} class_name="w-full" on:change={(e) => updateTopLevel('foco_valor', (e.currentTarget as HTMLSelectElement).value === 'liquido' ? 'liquido' : 'bruto')} />
            <FieldSelect id="foco-faturamento" label="Foco de faturamento" value={sysForm.foco_faturamento} options={[{ value: 'bruto', label: 'Valor bruto' }, { value: 'liquido', label: 'Valor líquido' }]} disabled={bloqueado} class_name="w-full" on:change={(e) => updateTopLevel('foco_faturamento', (e.currentTarget as HTMLSelectElement).value === 'liquido' ? 'liquido' : 'bruto')} />
          </div>
        </Card>

        <Card color="financeiro" title="Operação da empresa">
          <div class="space-y-4">
            <FieldCheckbox label="Modo corporativo" helper="Ativa controles multiempresa e comportamentos extras para estruturas corporativas." bind:checked={sysForm.modo_corporativo} disabled={bloqueado} color="financeiro" class_name="rounded-xl border border-slate-200 bg-white px-4 py-4" />
            <FieldSelect id="politica-cancelamento" label="Política de cancelamento" value={sysForm.politica_cancelamento} options={[{ value: 'cancelar_venda', label: 'Cancelar venda (exclui venda)' }, { value: 'estornar_recibos', label: 'Estornar recibos (manter venda)' }]} disabled={bloqueado} class_name="w-full" helper="Define o comportamento padrão do sistema ao cancelar uma venda." on:change={(e) => updateTopLevel('politica_cancelamento', (e.currentTarget as HTMLSelectElement).value === 'estornar_recibos' ? 'estornar_recibos' : 'cancelar_venda')} />
          </div>
        </Card>

        <Card color="financeiro" title="Segurança e exportações">
          <div class="space-y-4">
            <FieldCheckbox label="Exigir verificação em duas etapas (2FA)" helper="Usuários sem autenticador configurado precisam regularizar o acesso antes de entrar nos módulos." bind:checked={sysForm.mfa_obrigatorio} disabled={bloqueado} color="financeiro" class_name="rounded-xl border border-slate-200 bg-white px-4 py-4" />
            <FieldCheckbox label="Exportação em PDF" helper="Libera relatórios e documentos administrativos em PDF." bind:checked={sysForm.exportacao_pdf} disabled={bloqueado} color="financeiro" class_name="rounded-xl border border-slate-200 bg-white px-4 py-4" />
            <FieldCheckbox label="Exportação em Excel" helper="Mantém exportação tabular ativa para relatórios, conciliação e operação administrativa." bind:checked={sysForm.exportacao_excel} disabled={bloqueado} color="financeiro" class_name="rounded-xl border border-slate-200 bg-white px-4 py-4" />
          </div>
        </Card>
      </div>

      <Card color="financeiro" title="Conciliação e comissionamento">
        <div class="space-y-6">
          <div class="grid gap-4 xl:grid-cols-2">
            <FieldCheckbox label="Conciliação como fonte principal" helper="Faz a movimentação conciliada prevalecer sobre a venda lançada manualmente." bind:checked={sysForm.conciliacao_sobrepoe_vendas} disabled={bloqueado} color="financeiro" class_name="rounded-xl border border-slate-200 bg-white px-4 py-4" />
            <FieldCheckbox label="Regra própria de comissão" helper="Coloca a regra de conciliação antes do template geral e das regras por produto." bind:checked={sysForm.conciliacao_regra_ativa} disabled={bloqueado} color="financeiro" class_name="rounded-xl border border-slate-200 bg-white px-4 py-4" />
          </div>

          <div class="grid gap-4 xl:grid-cols-4">
            <FieldSelect id="conciliacao-tipo" label="Tipo da regra" value={sysForm.conciliacao_tipo} options={[{ value: 'GERAL', label: 'Geral (percentuais fixos)' }, { value: 'ESCALONAVEL', label: 'Escalonável (faixas)' }]} disabled={bloqueadoConciliacao} class_name="w-full" on:change={(e) => updateTopLevel('conciliacao_tipo', (e.currentTarget as HTMLSelectElement).value === 'ESCALONAVEL' ? 'ESCALONAVEL' : 'GERAL')} />
            <FieldInput id="conciliacao-nao-batida" label="% Concil. meta não batida" type="number" step="0.01" value={sysForm.conciliacao_meta_nao_atingida == null ? "" : String(sysForm.conciliacao_meta_nao_atingida)} disabled={bloqueadoConciliacao} class_name="w-full" on:input={(e) => updateTopLevel('conciliacao_meta_nao_atingida', parseNumberOrNull((e.currentTarget as HTMLInputElement).value))} />
            <FieldInput id="conciliacao-batida" label="% Concil. meta batida" type="number" step="0.01" value={sysForm.conciliacao_meta_atingida == null ? "" : String(sysForm.conciliacao_meta_atingida)} disabled={bloqueadoConciliacao} class_name="w-full" on:input={(e) => updateTopLevel('conciliacao_meta_atingida', parseNumberOrNull((e.currentTarget as HTMLInputElement).value))} />
            <FieldInput id="conciliacao-super-meta" label="% Concil. super meta" type="number" step="0.01" value={sysForm.conciliacao_super_meta == null ? "" : String(sysForm.conciliacao_super_meta)} disabled={bloqueadoConciliacao} class_name="w-full" on:input={(e) => updateTopLevel('conciliacao_super_meta', parseNumberOrNull((e.currentTarget as HTMLInputElement).value))} />
          </div>

          {#if sysForm.conciliacao_regra_ativa && sysForm.conciliacao_tipo === "ESCALONAVEL"}
            <div class="rounded-vtur-xl border border-orange-200 bg-orange-50/40 p-4">
              <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div class="flex items-center gap-2">
                    <Percent size={18} class="text-orange-600" />
                    <h3 class="text-base font-semibold text-slate-900">Faixas escalonáveis da conciliação</h3>
                  </div>
                  <p class="text-sm text-slate-500">Reaproveita a lógica do legado com faixas PRE e POS para incremento por meta e comissão.</p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" on:click={() => addTierSys("PRE")} disabled={bloqueado}>+ Faixa PRE</Button>
                  <Button type="button" size="sm" variant="primary" color="financeiro" on:click={() => addTierSys("POS")} disabled={bloqueado}>+ Faixa POS</Button>
                </div>
              </div>
              {#if sysForm.conciliacao_tiers.length === 0}
                <div class="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">Nenhuma faixa escalonável cadastrada.</div>
              {:else}
                <div class="overflow-x-auto">
                  <SimpleTable tableClass="min-w-full divide-y divide-slate-200 text-sm" color="financeiro">
                    <thead class="bg-white/80"><tr class="text-left text-slate-600"><th class="px-3 py-2 font-medium">Faixa</th><th class="px-3 py-2 font-medium">De (%)</th><th class="px-3 py-2 font-medium">Até (%)</th><th class="px-3 py-2 font-medium">Inc. Meta (%)</th><th class="px-3 py-2 font-medium">Inc. Comissão (%)</th><th class="px-3 py-2 text-right font-medium">Ações</th></tr></thead>
                    <tbody class="divide-y divide-slate-200 bg-white">
                      {#each sysForm.conciliacao_tiers as tier, index}
                        <tr>
                          <td class="px-3 py-2"><FieldSelect class_name="min-w-[110px]" value={tier.faixa} options={[{ value: "PRE", label: "PRE" }, { value: "POS", label: "POS" }]} placeholder={null} disabled={bloqueado} on:change={(e) => updateTierSys(index, "faixa", (e.target as HTMLSelectElement).value)} /></td>
                          <td class="px-3 py-2"><FieldInput type="number" step="0.01" value={tier.de_pct == null ? "" : String(tier.de_pct)} class_name="min-w-[120px]" disabled={bloqueado} on:input={(e) => updateTierSys(index, "de_pct", (e.target as HTMLInputElement).value)} /></td>
                          <td class="px-3 py-2"><FieldInput type="number" step="0.01" value={tier.ate_pct == null ? "" : String(tier.ate_pct)} class_name="min-w-[120px]" disabled={bloqueado} on:input={(e) => updateTierSys(index, "ate_pct", (e.target as HTMLInputElement).value)} /></td>
                          <td class="px-3 py-2"><FieldInput type="number" step="0.01" value={tier.inc_pct_meta == null ? "" : String(tier.inc_pct_meta)} class_name="min-w-[140px]" disabled={bloqueado} on:input={(e) => updateTierSys(index, "inc_pct_meta", (e.target as HTMLInputElement).value)} /></td>
                          <td class="px-3 py-2"><FieldInput type="number" step="0.01" value={tier.inc_pct_comissao == null ? "" : String(tier.inc_pct_comissao)} class_name="min-w-[160px]" disabled={bloqueado} on:input={(e) => updateTierSys(index, "inc_pct_comissao", (e.target as HTMLInputElement).value)} /></td>
                          <td class="px-3 py-2 text-right"><Button type="button" size="sm" variant="danger" on:click={() => removeTierSys(index)} disabled={bloqueado}>Remover</Button></td>
                        </tr>
                      {/each}
                    </tbody>
                  </SimpleTable>
                </div>
              {/if}
            </div>
          {/if}

          <div class="rounded-vtur-xl border border-slate-200 bg-slate-50/60 p-4">
            <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 class="text-base font-semibold text-slate-900">Faixas de comissionamento da loja</h3>
                <p class="text-sm text-slate-500">Define como a regra de conciliação deve ser aplicada conforme a % de comissão da loja em cada recibo.</p>
              </div>
              <Button type="button" variant="primary" color="financeiro" on:click={addBand} disabled={bloqueado}>+ Nova faixa</Button>
            </div>
            <div class="space-y-4">
              {#each sysForm.conciliacao_faixas_loja as band, bandIndex}
                <div class="rounded-vtur-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p class="text-base font-semibold text-slate-900">{band.nome || `Faixa ${bandIndex + 1}`}</p>
                      <p class="text-sm text-slate-500">Faixa da loja entre <span class="font-medium text-slate-700">{band.percentual_min == null ? " sem mínimo" : ` ${band.percentual_min}%`}</span> e <span class="font-medium text-slate-700">{band.percentual_max == null ? " sem máximo" : ` ${band.percentual_max}%`}</span>.</p>
                    </div>
                    <Button type="button" variant="danger" size="sm" on:click={() => removeBand(bandIndex)} disabled={bloqueado || sysForm.conciliacao_faixas_loja.length <= 1}><Trash2 size={16} class="mr-1" />Excluir faixa</Button>
                  </div>
                  <div class="grid gap-4 xl:grid-cols-4">
                    <FieldInput id={`band-name-${bandIndex}`} label="Nome da faixa" value={band.nome} class_name="w-full" disabled={bloqueado} on:input={(e) => updateBand(bandIndex, { nome: (e.target as HTMLInputElement).value })} />
                    <FieldInput id={`band-min-${bandIndex}`} label="% mínimo" type="number" step="0.01" value={band.percentual_min == null ? "" : String(band.percentual_min)} class_name="w-full" disabled={bloqueado} on:input={(e) => updateBand(bandIndex, { percentual_min: parseNumberOrNull((e.target as HTMLInputElement).value) })} />
                    <FieldInput id={`band-max-${bandIndex}`} label="% máximo" type="number" step="0.01" value={band.percentual_max == null ? "" : String(band.percentual_max)} class_name="w-full" disabled={bloqueado} on:input={(e) => updateBand(bandIndex, { percentual_max: parseNumberOrNull((e.target as HTMLInputElement).value) })} />
                    <FieldSelect id={`band-base-${bandIndex}`} label="Base do pagamento" value={band.tipo_calculo} options={[{ value: "CONCILIACAO", label: "Regra da conciliação" }, { value: "PRODUTO_DIFERENCIADO", label: "Produto diferenciado" }]} placeholder={null} class_name="w-full" disabled={bloqueadoConciliacao} on:change={(e) => updateBand(bandIndex, { tipo_calculo: (e.target as HTMLSelectElement).value === "PRODUTO_DIFERENCIADO" ? "PRODUTO_DIFERENCIADO" : "CONCILIACAO" })} />
                  </div>
                  <div class="mt-4 rounded-xl border border-slate-200 p-4">
                    <FieldCheckbox checked={band.ativo} label="Faixa ativa" helper="Quando ativa, essa faixa entra no cálculo dos recibos conciliados." color="financeiro" disabled={bloqueadoConciliacao} on:change={(e) => updateBand(bandIndex, { ativo: (e.target as HTMLInputElement).checked })} />
                  </div>
                  {#if band.tipo_calculo === "CONCILIACAO"}
                    <div class="mt-4 grid gap-4 xl:grid-cols-4">
                      <FieldSelect id={`band-type-${bandIndex}`} label="Tipo da regra" value={band.tipo} options={[{ value: "GERAL", label: "Geral (percentuais fixos)" }, { value: "ESCALONAVEL", label: "Escalonável (faixas)" }]} placeholder={null} class_name="w-full" disabled={bloqueadoConciliacao || !band.ativo} on:change={(e) => updateBand(bandIndex, { tipo: (e.target as HTMLSelectElement).value === "ESCALONAVEL" ? "ESCALONAVEL" : "GERAL" })} />
                      <FieldInput id={`band-nao-${bandIndex}`} label="% Meta não batida" type="number" step="0.01" value={band.meta_nao_atingida == null ? "" : String(band.meta_nao_atingida)} class_name="w-full" disabled={bloqueadoConciliacao || !band.ativo} on:input={(e) => updateBand(bandIndex, { meta_nao_atingida: parseNumberOrNull((e.target as HTMLInputElement).value) })} />
                      <FieldInput id={`band-sim-${bandIndex}`} label="% Meta batida" type="number" step="0.01" value={band.meta_atingida == null ? "" : String(band.meta_atingida)} class_name="w-full" disabled={bloqueadoConciliacao || !band.ativo} on:input={(e) => updateBand(bandIndex, { meta_atingida: parseNumberOrNull((e.target as HTMLInputElement).value) })} />
                      <FieldInput id={`band-super-${bandIndex}`} label="% Super meta" type="number" step="0.01" value={band.super_meta == null ? "" : String(band.super_meta)} class_name="w-full" disabled={bloqueadoConciliacao || !band.ativo} on:input={(e) => updateBand(bandIndex, { super_meta: parseNumberOrNull((e.target as HTMLInputElement).value) })} />
                    </div>
                    {#if band.tipo === "ESCALONAVEL"}
                      <div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div><p class="font-medium text-slate-900">Faixas escalonáveis desta banda</p><p class="text-sm text-slate-500">Monte o comportamento PRE/POS que será aplicado só para esta faixa da loja.</p></div>
                          <div class="flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="secondary" on:click={() => addBandTier(bandIndex, "PRE")} disabled={bloqueadoConciliacao || !band.ativo}>+ Faixa PRE</Button>
                            <Button type="button" size="sm" variant="primary" color="financeiro" on:click={() => addBandTier(bandIndex, "POS")} disabled={bloqueadoConciliacao || !band.ativo}>+ Faixa POS</Button>
                          </div>
                        </div>
                        {#if band.tiers.length === 0}
                          <div class="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">Nenhuma faixa escalonável cadastrada para esta banda.</div>
                        {:else}
                          <div class="overflow-x-auto">
                            <SimpleTable tableClass="min-w-full divide-y divide-slate-200 text-sm" color="financeiro">
                              <thead class="bg-white/80"><tr class="text-left text-slate-600"><th class="px-3 py-2 font-medium">Faixa</th><th class="px-3 py-2 font-medium">De (%)</th><th class="px-3 py-2 font-medium">Até (%)</th><th class="px-3 py-2 font-medium">Inc. Meta (%)</th><th class="px-3 py-2 font-medium">Inc. Comissão (%)</th><th class="px-3 py-2 text-right font-medium">Ações</th></tr></thead>
                              <tbody class="divide-y divide-slate-200 bg-white">
                                {#each band.tiers as tier, tierIndex}
                                  <tr>
                                    <td class="px-3 py-2"><FieldSelect class_name="min-w-[110px]" value={tier.faixa} options={[{ value: "PRE", label: "PRE" }, { value: "POS", label: "POS" }]} placeholder={null} disabled={bloqueadoConciliacao || !band.ativo} on:change={(e) => updateBandTier(bandIndex, tierIndex, "faixa", (e.target as HTMLSelectElement).value)} /></td>
                                    <td class="px-3 py-2"><FieldInput type="number" step="0.01" value={tier.de_pct == null ? "" : String(tier.de_pct)} class_name="min-w-[120px]" disabled={bloqueadoConciliacao || !band.ativo} on:input={(e) => updateBandTier(bandIndex, tierIndex, "de_pct", (e.target as HTMLInputElement).value)} /></td>
                                    <td class="px-3 py-2"><FieldInput type="number" step="0.01" value={tier.ate_pct == null ? "" : String(tier.ate_pct)} class_name="min-w-[120px]" disabled={bloqueadoConciliacao || !band.ativo} on:input={(e) => updateBandTier(bandIndex, tierIndex, "ate_pct", (e.target as HTMLInputElement).value)} /></td>
                                    <td class="px-3 py-2"><FieldInput type="number" step="0.01" value={tier.inc_pct_meta == null ? "" : String(tier.inc_pct_meta)} class_name="min-w-[140px]" disabled={bloqueadoConciliacao || !band.ativo} on:input={(e) => updateBandTier(bandIndex, tierIndex, "inc_pct_meta", (e.target as HTMLInputElement).value)} /></td>
                                    <td class="px-3 py-2"><FieldInput type="number" step="0.01" value={tier.inc_pct_comissao == null ? "" : String(tier.inc_pct_comissao)} class_name="min-w-[160px]" disabled={bloqueadoConciliacao || !band.ativo} on:input={(e) => updateBandTier(bandIndex, tierIndex, "inc_pct_comissao", (e.target as HTMLInputElement).value)} /></td>
                                    <td class="px-3 py-2 text-right"><Button type="button" size="sm" variant="danger" on:click={() => removeBandTier(bandIndex, tierIndex)} disabled={bloqueadoConciliacao || !band.ativo}>Remover</Button></td>
                                  </tr>
                                {/each}
                              </tbody>
                            </SimpleTable>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  {:else}
                    <div class="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">Esta faixa usará as regras de produto diferenciado já cadastradas no sistema.</div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        </div>
      </Card>

      <Card color="financeiro" title="Ações">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <p class="text-sm text-slate-600">Revise cada bloco antes de salvar para manter metas, segurança e conciliação consistentes para toda a empresa.</p>
          <div class="flex flex-wrap gap-3">
            <Button variant="secondary" on:click={loadSys} disabled={sysSaving}><RefreshCw size={16} class="mr-2" />Recarregar</Button>
            <Button variant="primary" color="financeiro" on:click={saveSys} loading={sysSaving} disabled={bloqueado}><Save size={16} class="mr-2" />Salvar parâmetros</Button>
          </div>
        </div>
      </Card>
    </div>
  {/if}
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════ -->
<!-- ABA 2 — REGRAS DE COMISSÃO                                                 -->
<!-- ═══════════════════════════════════════════════════════════════════════════ -->
{#if activeTab === 'regras'}
  {#if canSelectEmpresa}
    <Card title="Escopo" color="financeiro" class="mb-6">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <FieldSelect id="regra-empresa" label="Empresa" bind:value={empresaId} options={empresaOptions} class_name="w-full" on:change={handleEmpresaChange} />
      </div>
    </Card>
  {/if}

  <div class="vtur-kpi-grid mb-6">
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500"><CheckCircle2 size={20} /></div>
      <div><p class="text-sm font-medium text-slate-500">Regras Ativas</p><p class="text-2xl font-bold text-slate-900">{activeRules}</p></div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500"><CircleOff size={20} /></div>
      <div><p class="text-sm font-medium text-slate-500">Regras Inativas</p><p class="text-2xl font-bold text-slate-900">{inactiveRules}</p></div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-500"><GitBranch size={20} /></div>
      <div><p class="text-sm font-medium text-slate-500">Escalonáveis</p><p class="text-2xl font-bold text-slate-900">{escalonaveis}</p></div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500"><Percent size={20} /></div>
      <div><p class="text-sm font-medium text-slate-500">Faixas Cadastradas</p><p class="text-2xl font-bold text-slate-900">{totalTiers}</p></div>
    </div>
  </div>

  {#if rulesError}
    <div class="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{rulesError}</div>
  {/if}

  {#if !showRuleForm && canEditRules}
    <div class="mb-6 flex justify-end">
      <Button type="button" variant="primary" on:click={openCreateRuleForm}><Plus size={16} class="mr-2" />Nova Regra</Button>
    </div>
  {/if}

  {#if showRuleForm}
    <Card title={editRuleId ? 'Editar regra de comissão' : 'Nova regra de comissão'} color="financeiro" class="mb-6">
      <form class="space-y-5" on:submit|preventDefault={saveRule}>
        <div class="grid grid-cols-1 gap-4 xl:grid-cols-4">
          <FieldInput id="regra-nome" label="Nome" bind:value={ruleForm.nome} required={true} class_name="xl:col-span-2" placeholder="Ex: Comissão padrão comercial" />
          <FieldSelect id="regra-tipo" label="Tipo" bind:value={ruleForm.tipo} options={ruleTypeOptions} class_name="w-full" />
          <div class="flex items-end"><FieldCheckbox label="Regra ativa" bind:checked={ruleForm.ativo} color="financeiro" class_name="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" /></div>
          <FieldInput id="meta-nao-atingida" label="Meta não atingida (%)" type="number" value={String(ruleForm.meta_nao_atingida)} step="0.01" class_name="w-full" on:input={(e) => handleRuleMetaInput('meta_nao_atingida', e)} />
          <FieldInput id="meta-atingida" label="Meta atingida (%)" type="number" value={String(ruleForm.meta_atingida)} step="0.01" class_name="w-full" on:input={(e) => handleRuleMetaInput('meta_atingida', e)} />
          <FieldInput id="super-meta" label="Super meta (%)" type="number" value={String(ruleForm.super_meta)} step="0.01" class_name="w-full" on:input={(e) => handleRuleMetaInput('super_meta', e)} />
          <FieldTextarea id="regra-descricao" label="Descrição" rows={3} bind:value={ruleForm.descricao} class_name="xl:col-span-4" placeholder="Contexto de uso, equipe atendida e observações da regra." />
        </div>

        {#if rulesValidationError}
          <div class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{rulesValidationError}</div>
        {/if}

        {#if ruleForm.tipo === 'ESCALONAVEL'}
          <div class="rounded-vtur-xl border border-financeiro-200 bg-financeiro-50/40 p-4">
            <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h3 class="text-base font-semibold text-slate-900">Faixas escalonáveis</h3><p class="text-sm text-slate-500">Monte faixas PRE e POS sem sobreposição de intervalos.</p></div>
              <div class="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" on:click={() => addRuleTier('PRE')}>+ Faixa PRE</Button>
                <Button type="button" size="sm" variant="primary" on:click={() => addRuleTier('POS')}>+ Faixa POS</Button>
              </div>
            </div>
            {#if ruleForm.tiers.length === 0}
              <div class="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">Nenhuma faixa adicionada ainda.</div>
            {:else}
              <SimpleTable tableClass="min-w-full divide-y divide-slate-200" color="financeiro">
                <thead class="bg-white/70"><tr class="text-left text-slate-600"><th class="px-3 py-2 font-medium">Faixa</th><th class="px-3 py-2 font-medium">De (%)</th><th class="px-3 py-2 font-medium">Até (%)</th><th class="px-3 py-2 font-medium">Inc. Meta (%)</th><th class="px-3 py-2 font-medium">Inc. Comissão (%)</th><th class="px-3 py-2 font-medium text-right">Ações</th></tr></thead>
                <tbody class="divide-y divide-slate-200 bg-white">
                  {#each ruleForm.tiers as tier, index}
                    <tr>
                      <td class="px-3 py-2"><FieldSelect class_name="min-w-[110px]" value={tier.faixa} options={faixaOptions} on:change={(e) => handleRuleTierFaixaChange(index, e)} /></td>
                      <td class="px-3 py-2"><FieldInput type="number" step="0.01" value={String(tier.de_pct)} on:input={(e) => handleRuleTierInput(index, 'de_pct', e)} class_name="min-w-[120px]" /></td>
                      <td class="px-3 py-2"><FieldInput type="number" step="0.01" value={String(tier.ate_pct)} on:input={(e) => handleRuleTierInput(index, 'ate_pct', e)} class_name="min-w-[120px]" /></td>
                      <td class="px-3 py-2"><FieldInput type="number" step="0.01" value={String(tier.inc_pct_meta)} on:input={(e) => handleRuleTierInput(index, 'inc_pct_meta', e)} class_name="min-w-[140px]" /></td>
                      <td class="px-3 py-2"><FieldInput type="number" step="0.01" value={String(tier.inc_pct_comissao)} on:input={(e) => handleRuleTierInput(index, 'inc_pct_comissao', e)} class_name="min-w-[160px]" /></td>
                      <td class="px-3 py-2 text-right"><Button type="button" size="sm" variant="danger" on:click={() => removeRuleTier(index)}>Remover</Button></td>
                    </tr>
                  {/each}
                </tbody>
              </SimpleTable>
            {/if}
          </div>
        {/if}

        <div class="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" on:click={cancelRuleForm} disabled={rulesSaving}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={rulesSaving}>{editRuleId ? 'Salvar alterações' : 'Salvar regra'}</Button>
        </div>
      </form>
    </Card>
  {/if}

  <Card title="Regras cadastradas" color="financeiro">
    {#if rulesLoading}
      <LoadingState compact={true} />
    {:else if rules.length === 0}
      <div class="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-slate-500">
        <Percent size={42} class="mx-auto mb-3 opacity-40" />
        <p class="font-medium text-slate-700">Nenhuma regra cadastrada</p>
        <p class="mt-1 text-sm">Crie a primeira regra para estruturar percentuais e faixas da operação.</p>
        {#if !showRuleForm && canEditRules}
          <div class="mt-4"><Button type="button" variant="primary" on:click={openCreateRuleForm}>Criar primeira regra</Button></div>
        {/if}
      </div>
    {:else}
      <div class="space-y-4">
        {#each rules as rule}
          <div class="rounded-vtur-xl border border-slate-200 bg-slate-50/60 p-4">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div class="min-w-0 flex-1 space-y-4">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-lg font-semibold text-slate-900">{rule.nome}</h3>
                  <span class="inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">{rule.tipo === 'ESCALONAVEL' ? 'Escalonável' : 'Geral'}</span>
                  <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-medium {rule.ativo ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-700'}">{rule.ativo ? 'Ativa' : 'Inativa'}</span>
                </div>
                {#if rule.descricao}<p class="text-sm text-slate-600">{rule.descricao}</p>{/if}
                <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div class="rounded-xl border border-slate-200 bg-white px-3 py-3"><p class="text-xs font-medium uppercase tracking-wide text-slate-500">Meta não atingida</p><p class="mt-1 text-lg font-semibold text-slate-900">{formatPercent(rule.meta_nao_atingida)}%</p></div>
                  <div class="rounded-xl border border-slate-200 bg-white px-3 py-3"><p class="text-xs font-medium uppercase tracking-wide text-slate-500">Meta atingida</p><p class="mt-1 text-lg font-semibold text-slate-900">{formatPercent(rule.meta_atingida)}%</p></div>
                  <div class="rounded-xl border border-slate-200 bg-white px-3 py-3"><p class="text-xs font-medium uppercase tracking-wide text-slate-500">Super meta</p><p class="mt-1 text-lg font-semibold text-slate-900">{formatPercent(rule.super_meta)}%</p></div>
                </div>
                {#if rule.tipo === 'ESCALONAVEL'}
                  <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {#each faixas as faixa}
                      <div class="rounded-xl border border-slate-200 bg-white p-3">
                        <div class="mb-2 flex items-center justify-between"><p class="text-sm font-semibold text-slate-900">Faixas {faixa}</p><span class="text-xs text-slate-500">{getSortedTiers(rule, faixa).length} faixa(s)</span></div>
                        {#if getSortedTiers(rule, faixa).length === 0}
                          <p class="text-sm text-slate-500">Nenhuma faixa {faixa} cadastrada.</p>
                        {:else}
                          <div class="space-y-2">
                            {#each getSortedTiers(rule, faixa) as tier}
                              <div class="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                <div class="flex flex-wrap items-center justify-between gap-2">
                                  <span class="font-medium">{formatPercent(tier.de_pct)}% até {formatPercent(tier.ate_pct)}%</span>
                                  <span class="text-slate-500">Meta +{formatPercent(tier.inc_pct_meta)}% | Comissão +{formatPercent(tier.inc_pct_comissao)}%</span>
                                </div>
                              </div>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
              {#if canEditRules}
                <div class="flex flex-wrap gap-2 xl:justify-end">
                  <Button type="button" size="sm" variant="secondary" on:click={() => editRule(rule)}><Edit2 size={16} class="mr-1" />Editar</Button>
                  {#if rule.ativo}<Button type="button" size="sm" variant="outline" on:click={() => askInactivate(rule)}><CircleOff size={16} class="mr-1" />Inativar</Button>{/if}
                  <Button type="button" size="sm" variant="danger" on:click={() => askDelete(rule)}><Trash2 size={16} class="mr-1" />Excluir</Button>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </Card>

  <Dialog bind:open={confirmOpen} title={confirmMode === 'inativar' ? 'Inativar regra' : 'Excluir regra'} color="financeiro" showCancel={true} cancelText="Cancelar" showConfirm={true} confirmText={confirmMode === 'inativar' ? 'Inativar' : 'Excluir'} confirmVariant="danger" loading={rulesActionLoading} onCancel={closeConfirm} onConfirm={confirmRuleAction}>
    {#if selectedRule}
      <div class="space-y-3 text-sm text-slate-600">
        <p>{#if confirmMode === 'inativar'}A regra <strong class="text-slate-900">{selectedRule.nome}</strong> será marcada como inativa e deixará de ser considerada na operação.{:else}A regra <strong class="text-slate-900">{selectedRule.nome}</strong> e suas faixas vinculadas serão removidas permanentemente.{/if}</p>
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"><p><strong>Tipo:</strong> {selectedRule.tipo === 'ESCALONAVEL' ? 'Escalonável' : 'Geral'}</p><p><strong>Faixas:</strong> {selectedRule.commission_tier?.length || 0}</p></div>
      </div>
    {/if}
  </Dialog>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════ -->
<!-- ABA 3 — PERSONALIZAR MENU                                                  -->
<!-- ═══════════════════════════════════════════════════════════════════════════ -->
{#if activeTab === 'personalizar'}
  {#if menuLoading}
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
                on:change={() => setItemHidden(item.key, !isHidden(item.key))}
              />
            {/each}
          </div>
        </Card>
      {/each}

      {#if feedbackMessage}
        <div class={`rounded-xl border px-4 py-3 text-sm ${feedbackType === 'success' ? 'border-green-200 bg-green-50 text-green-700' : feedbackType === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`} role="status" aria-live="polite">{feedbackMessage}</div>
      {/if}

      <div class="flex justify-end gap-3">
        <Button type="button" variant="secondary" on:click={resetMenuPrefs}><RefreshCw size={16} class="mr-2" />Resetar</Button>
        <Button type="button" variant="primary" loading={menuSaving} on:click={saveMenuPrefs}><Save size={16} class="mr-2" />{menuSaving ? 'Salvando...' : 'Salvar preferências'}</Button>
      </div>
    </div>
  {/if}
{/if}
