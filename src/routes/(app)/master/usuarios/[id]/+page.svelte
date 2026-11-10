<script lang="ts">
  import { dev } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import { FieldInput, FieldSelect, FieldCheckbox } from '$lib/components/ui';
  import { ApiError, apiFetch, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { ensureServerSessionCookie } from '$lib/services/session';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { KeyRound, Mail, RefreshCw, ShieldAlert, ShieldCheck, Users } from '$lib/icons';

  type Option = {
    id: string;
    name?: string;
    nome?: string;
    nome_completo?: string;
    description?: string | null;
    nome_fantasia?: string | null;
  };

  type AvisoTemplate = {
    id: string;
    nome?: string | null;
    assunto?: string | null;
    mensagem?: string | null;
    ativo?: boolean | null;
    sender_key?: string | null;
  };

  type PermissionSummaryEntry = {
    label: string;
    modulo: string;
    permissao: string;
    ativo: boolean;
  };

  type UserMeta = {
    id: string;
    nome: string;
    email: string | null;
    telefone?: string | null;
    cidade?: string | null;
    estado?: string | null;
    tipo: string;
    tipo_id: string | null;
    empresa: string;
    empresa_id: string | null;
    ativo: boolean;
    uso_individual: boolean;
    created_by_gestor: boolean;
    participa_ranking: boolean;
    financeiro_company_ids?: string[] | null;
    created_at?: string | null;
    updated_at?: string | null;
  };

  type UserDetailResponse = {
    user: UserMeta;
    permissions?: PermissionSummaryEntry[] | null;
    default_permissions?: PermissionSummaryEntry[] | null;
    available?: {
      user_types?: Option[] | null;
      companies?: Option[] | null;
      aviso_templates?: AvisoTemplate[] | null;
      company_ids?: string[] | null;
    } | null;
  };

  type OptionsListResponse = {
    items?: Option[] | null;
  };

  type AvisoTemplatesResponse = {
    items?: AvisoTemplate[] | null;
  };

  type MfaStatusResponse = {
    statuses?: Record<
      string,
      { enabled: boolean; verified_count: number; factor_count: number } | null
    > | null;
  };

  const emptyForm = {
    id: '',
    nome_completo: '',
    email: '',
    password: '',
    user_type_id: '',
    company_id: '',
    uso_individual: false,
    active: true,
    participa_ranking: false
  };

  let loading = true;
  let saving = false;
  let userForm = { ...emptyForm };
  let userMeta: UserMeta | null = null;
  let permissionsSummary: PermissionSummaryEntry[] = [];
  let defaultPermissionsSummary: PermissionSummaryEntry[] = [];
  let userTypes: Option[] = [];
  let companies: Option[] = [];
  let avisoTemplates: AvisoTemplate[] = [];
  let mfaStatus: { enabled: boolean; verified_count: number; factor_count: number } | null = null;
  let financeiroCompanyIds: string[] = [];
  let showAvisoDialog = false;
  let showSenhaDialog = false;
  let showMfaDialog = false;
  let avisoTemplateId = '';
  let novaSenha = '';
  let confirmarSenha = '';
  let lastLoadedId = '';
  const detailGuard = createLoadGuard();

  $: isCreateMode = $page.params.id === 'novo';
  $: currentId = $page.params.id;
  $: activePermissionsSummary = permissionsSummary.filter((item) => item.ativo);
  $: selectedUserTypeName = String(
    userTypes.find((type) => type.id === userForm.user_type_id)?.nome ||
      userTypes.find((type) => type.id === userForm.user_type_id)?.name ||
      userMeta?.tipo ||
      ''
  ).toUpperCase();
  $: isFinanceiroUser = selectedUserTypeName.includes('FINANCEIRO');
  $: if (
    isFinanceiroUser &&
    userForm.company_id &&
    !financeiroCompanyIds.includes(userForm.company_id)
  ) {
    financeiroCompanyIds = [...financeiroCompanyIds, userForm.company_id];
  }

  const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  function formatDateTime(value?: string | null) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return DATE_TIME_FORMATTER.format(date);
  }

  async function loadCreateReference(signal?: AbortSignal) {
    await ensureServerSessionCookie();
    const [typesPayload, companiesPayload, templatesPayload] = await Promise.all([
      apiGet<OptionsListResponse>('/api/v1/admin/tipos-usuario', undefined, signal),
      apiGet<OptionsListResponse>('/api/v1/admin/empresas', undefined, signal),
      apiGet<AvisoTemplatesResponse>('/api/v1/admin/avisos', undefined, signal)
    ]);

    userTypes = typesPayload.items || [];
    companies = companiesPayload.items || [];
    avisoTemplates = templatesPayload.items || [];
    userForm = { ...emptyForm };
    userMeta = null;
    permissionsSummary = [];
    defaultPermissionsSummary = [];
    mfaStatus = null;
    financeiroCompanyIds = [];
  }

  async function loadMfaStatus(userId: string, signal?: AbortSignal) {
    try {
      const payload = await apiPost<MfaStatusResponse>(
        '/api/v1/admin/auth/mfa-status',
        { user_ids: [userId] },
        signal
      );
      mfaStatus = payload?.statuses?.[userId] || null;
    } catch (err) {
      if (isCanceledApiError(err)) return;
      mfaStatus = null;
    }
  }

  async function loadDetail() {
    const request = detailGuard.next();
    loading = true;
    try {
      if (isCreateMode) {
        await loadCreateReference(request.signal);
        if (!detailGuard.isCurrent(request.seq)) return;
      } else {
        await ensureServerSessionCookie();
        let payload: UserDetailResponse;
        try {
          payload = await apiFetch<UserDetailResponse>(`/api/v1/admin/usuarios/${currentId}`, {
            redirectOnForbidden: false,
            redirectOnUnauthorized: false,
            signal: request.signal
          });
        } catch (err) {
          if (err instanceof ApiError) {
            const message = err.message || 'Nao foi possivel carregar o detalhe do usuario.';
            if (err.status === 401) {
              toast.error('Sessão expirada. Faça login novamente para continuar.');
              const next = `${$page.url.pathname}${$page.url.search}`;
              await goto(`/auth/login?session_expired=1&next=${encodeURIComponent(next)}`);
              return;
            }
            if (err.status === 403) {
              toast.error(message || 'Você não tem permissão para acessar este usuário.');
              await goto('/master/usuarios');
              return;
            }
            if (err.status === 404) {
              toast.error(message || 'Usuário não encontrado.');
              await goto('/master/usuarios');
              return;
            }
          }
          throw err;
        }

        if (!detailGuard.isCurrent(request.seq)) return;
        userMeta = payload.user;
        permissionsSummary = payload.permissions || [];
        defaultPermissionsSummary = payload.default_permissions || [];
        userTypes = payload.available?.user_types || [];
        companies = payload.available?.companies || [];
        avisoTemplates = payload.available?.aviso_templates || [];

        userForm = {
          id: payload.user.id,
          nome_completo: payload.user.nome || '',
          email: payload.user.email || '',
          password: '',
          user_type_id: payload.user.tipo_id || '',
          company_id: payload.user.empresa_id || '',
          uso_individual: Boolean(payload.user.uso_individual),
          active: Boolean(payload.user.ativo),
          participa_ranking: Boolean(payload.user.participa_ranking)
        };
        financeiroCompanyIds = [];
        if (Array.isArray(payload.user.financeiro_company_ids)) {
          for (const id of payload.user.financeiro_company_ids) {
            const normalizedId = String(id || '').trim();
            if (normalizedId) financeiroCompanyIds.push(normalizedId);
          }
        }

        await loadMfaStatus(payload.user.id, request.signal);
      }
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (dev) console.error(err);
      toast.error('Nao foi possivel carregar o detalhe do usuario.');
    } finally {
      if (detailGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function saveUser() {
    saving = true;
    try {
      if (!userForm.nome_completo.trim()) {
        throw new Error('Informe o nome completo.');
      }

      if (!userForm.email.trim()) {
        throw new Error('Informe o e-mail do usuario.');
      }

      if (!userForm.user_type_id) {
        throw new Error('Selecione o tipo de usuario.');
      }

      if (!userForm.uso_individual && !userForm.company_id) {
        throw new Error('Selecione a empresa do usuario.');
      }

      if (isFinanceiroUser && financeiroCompanyIds.length === 0) {
        throw new Error('Selecione ao menos uma empresa para o usuario financeiro.');
      }

      if (isCreateMode && !userForm.password.trim()) {
        throw new Error('Defina a senha inicial do usuario.');
      }

      if (isCreateMode && userForm.uso_individual) {
        throw new Error('O escopo master nao pode criar usuario individual sem empresa.');
      }

      const payload = await apiPost<{ id?: string }>('/api/v1/admin/usuarios', {
        id: isCreateMode ? undefined : userForm.id,
        nome_completo: userForm.nome_completo,
        email: userForm.email,
        password: isCreateMode ? userForm.password : undefined,
        user_type_id: userForm.user_type_id,
        company_id: userForm.uso_individual ? null : userForm.company_id,
        uso_individual: userForm.uso_individual,
        active: userForm.active,
        participa_ranking: isFinanceiroUser ? false : userForm.participa_ranking,
        financeiro_company_ids: isFinanceiroUser ? financeiroCompanyIds : []
      });
      toast.success(
        isCreateMode ? 'Usuario criado com sucesso.' : 'Usuario atualizado com sucesso.'
      );

      if (isCreateMode && payload.id) {
        await goto(`/master/usuarios/${payload.id}`);
      } else {
        await loadDetail();
      }
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar usuario.'));
    } finally {
      saving = false;
    }
  }

  function isFinanceiroCompanySelected(companyId: string) {
    return financeiroCompanyIds.includes(companyId);
  }

  function toggleFinanceiroCompany(companyId: string, checked: boolean) {
    const id = String(companyId || '').trim();
    if (!id) return;
    if (checked) {
      if (!financeiroCompanyIds.includes(id)) financeiroCompanyIds = [...financeiroCompanyIds, id];
      return;
    }
    if (id === userForm.company_id) return;
    financeiroCompanyIds = financeiroCompanyIds.filter((value) => value !== id);
  }

  async function sendAviso() {
    try {
      await apiPost('/api/v1/admin/avisos/send', {
        user_id: userForm.id,
        template_id: avisoTemplateId
      });
      toast.success('Aviso disparado com sucesso.');
      showAvisoDialog = false;
      avisoTemplateId = '';
    } catch (err) {
      if (dev) console.error(err);
      toast.error(toUserMessage(err, 'Erro ao enviar aviso.'));
    }
  }

  async function redefineSenha() {
    try {
      if (!novaSenha.trim() || novaSenha.length < 8) {
        throw new Error('A nova senha precisa ter pelo menos 8 caracteres.');
      }
      if (novaSenha !== confirmarSenha) {
        throw new Error('A confirmacao da senha nao confere.');
      }

      await apiPost('/api/v1/admin/auth/set-password', {
        user_id: userForm.id,
        password: novaSenha,
        confirm_email: true
      });
      toast.success('Senha atualizada com sucesso.');
      showSenhaDialog = false;
      novaSenha = '';
      confirmarSenha = '';
    } catch (err) {
      if (dev) console.error(err);
      toast.error(toUserMessage(err, 'Erro ao redefinir senha.'));
    }
  }

  async function resetarMfa() {
    try {
      await apiPost('/api/v1/admin/auth/reset-mfa', { user_id: userForm.id });
      toast.success('2FA resetado com sucesso.');
      showMfaDialog = false;
      await loadMfaStatus(userForm.id);
    } catch (err) {
      if (dev) console.error(err);
      toast.error(toUserMessage(err, 'Erro ao resetar 2FA.'));
    }
  }

  $: if ($page.params.id && $page.params.id !== lastLoadedId) {
    lastLoadedId = $page.params.id;
    loadDetail();
  }
</script>

<svelte:head>
  <title>{isCreateMode ? 'Novo usuario' : 'Usuario'} | Master | VTUR</title>
</svelte:head>

<PageHeader
  title={isCreateMode ? 'Novo usuario' : userMeta?.nome || 'Usuario'}
  subtitle={isCreateMode
    ? 'Cadastro do escopo master com papel, empresa, escopo e senha inicial.'
    : 'Edicao do usuario no escopo master, com acoes de acesso e seguranca.'}
  breadcrumbs={[
    { label: 'Master', href: '/master' },
    { label: 'Usuarios', href: '/master/usuarios' },
    { label: isCreateMode ? 'Novo' : userMeta?.nome || 'Detalhe' }
  ]}
  actions={isCreateMode
    ? []
    : [
        { label: 'Atualizar', onClick: loadDetail, variant: 'secondary', icon: RefreshCw },
        {
          label: 'Permissoes',
          href: `/master/permissoes/${currentId}`,
          variant: 'secondary',
          icon: ShieldCheck
        }
      ]}
/>

<div class="space-y-6">
  {#if !isCreateMode}
    <div class="grid gap-4 md:grid-cols-4">
      <Card color="financeiro">
        <p class="text-sm text-slate-500">Perfil</p>
        <p class="mt-2 text-lg font-semibold text-slate-900">{userMeta?.tipo || '-'}</p>
      </Card>
      <Card color="financeiro">
        <p class="text-sm text-slate-500">Empresa</p>
        <p class="mt-2 text-lg font-semibold text-slate-900">
          {userMeta?.empresa || 'Sem empresa'}
        </p>
      </Card>
      <Card color="financeiro">
        <p class="text-sm text-slate-500">Permissoes ativas</p>
        <p class="mt-2 text-lg font-semibold text-slate-900">
          {activePermissionsSummary.length}
        </p>
      </Card>
      <Card color="financeiro">
        <p class="text-sm text-slate-500">MFA</p>
        <p class="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-900">
          {#if mfaStatus?.enabled}
            <Badge color="green">Ativo</Badge>
          {:else}
            <Badge color="gray">Nao configurado</Badge>
          {/if}
        </p>
      </Card>
    </div>
  {/if}

  <Card color="financeiro" title="Cadastro administrativo">
    <div class="grid gap-4 lg:grid-cols-2">
      <FieldInput
        id="usuario-nome"
        label="Nome completo"
        bind:value={userForm.nome_completo}
        class_name="w-full"
      />
      <FieldInput
        id="usuario-email"
        label="E-mail"
        type="email"
        bind:value={userForm.email}
        class_name="w-full"
      />
      {#if isCreateMode}
        <FieldInput
          id="usuario-senha"
          label="Senha inicial"
          type="password"
          bind:value={userForm.password}
          class_name="w-full"
        />
      {/if}
      <FieldSelect
        id="usuario-tipo"
        label="Tipo de usuario"
        bind:value={userForm.user_type_id}
        options={userTypes.map((t) => ({ value: t.id, label: t.nome || t.name || '' }))}
        placeholder="Selecione uma opção"
        class_name="w-full"
      />
      <FieldSelect
        id="usuario-empresa"
        label="Empresa"
        bind:value={userForm.company_id}
        options={companies.map((c) => ({
          value: c.id,
          label: c.nome_fantasia || c.nome || c.name || ''
        }))}
        placeholder="Selecione uma opção"
        disabled={!isCreateMode && userForm.uso_individual}
        class_name="w-full"
      />
      {#if isCreateMode}
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p class="font-medium text-slate-900">Empresa obrigatoria no cadastro master</p>
          <p class="text-sm text-slate-500">
            Usuarios novos no escopo master devem ser vinculados a uma empresa.
          </p>
        </div>
      {:else}
        <FieldCheckbox
          label="Uso individual"
          helper="Remove o vinculo corporativo com empresa."
          bind:checked={userForm.uso_individual}
          color="financeiro"
          class_name="rounded-xl border border-slate-200 bg-white px-4 py-4"
        />
      {/if}
      <FieldCheckbox
        label="Usuario ativo"
        helper="Controla acesso imediato ao sistema."
        bind:checked={userForm.active}
        color="financeiro"
        class_name="rounded-xl border border-slate-200 bg-white px-4 py-4"
      />
      {#if !isFinanceiroUser}
        <FieldCheckbox
          label="Participa do ranking"
          helper="Inclui o usuario nos indicadores competitivos."
          bind:checked={userForm.participa_ranking}
          color="financeiro"
          class_name="rounded-xl border border-slate-200 bg-white px-4 py-4"
        />
      {:else}
        <div class="rounded-xl border border-blue-200 bg-blue-50 px-4 py-4">
          <p class="font-medium text-blue-950">Perfil financeiro</p>
          <p class="mt-1 text-sm text-blue-800">
            Este usuario nao participa do ranking e acessa apenas o escopo financeiro das empresas
            vinculadas.
          </p>
        </div>
      {/if}
    </div>

    {#if isFinanceiroUser}
      <div class="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div class="mb-4">
          <p class="font-semibold text-slate-900">Empresas do financeiro</p>
          <p class="text-sm text-slate-500">
            O Master pode vincular uma ou varias empresas. A empresa principal fica sempre
            selecionada.
          </p>
        </div>
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {#each companies as company}
            {@const companyId = String(company.id || '')}
            <FieldCheckbox
              label={company.nome_fantasia || company.nome || company.name || 'Empresa'}
              helper={companyId === userForm.company_id ? 'Empresa principal' : undefined}
              checked={isFinanceiroCompanySelected(companyId)}
              disabled={companyId === userForm.company_id}
              color="financeiro"
              class_name="rounded-xl border border-slate-200 bg-white px-4 py-3"
              on:change={(event) =>
                toggleFinanceiroCompany(
                  companyId,
                  Boolean((event.target as HTMLInputElement)?.checked)
                )}
            />
          {/each}
        </div>
      </div>
    {/if}

    {#if !isCreateMode}
      <div class="mt-6 grid gap-4 md:grid-cols-3">
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p class="text-sm text-slate-500">Criado em</p>
          <p class="mt-2 font-medium text-slate-900">{formatDateTime(userMeta?.created_at)}</p>
        </div>

        <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p class="text-sm text-slate-500">Ultima atualizacao</p>
          <p class="mt-2 font-medium text-slate-900">{formatDateTime(userMeta?.updated_at)}</p>
        </div>

        <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p class="text-sm text-slate-500">Escopo</p>
          <p class="mt-2 font-medium text-slate-900">
            {#if userMeta?.uso_individual}
              Individual
            {:else if userMeta?.created_by_gestor}
              Equipe criada por gestor
            {:else}
              Corporativo
            {/if}
          </p>
        </div>
      </div>
    {/if}

    <div class="mt-6 flex flex-wrap gap-3">
      <Button variant="secondary" href="/master/usuarios">Voltar</Button>
      <Button variant="primary" color="financeiro" on:click={saveUser} loading={saving}>
        Salvar usuario
      </Button>
    </div>
  </Card>

  {#if !isCreateMode}
    <div class="grid gap-6 xl:grid-cols-2">
      <Card color="financeiro" title="Permissoes aplicadas">
        <div class="space-y-3">
          {#each activePermissionsSummary.slice(0, 8) as item}
            <div class="flex items-center justify-between rounded-xl border border-slate-200 p-3">
              <div>
                <p class="font-medium text-slate-900">{item.label}</p>
                <p class="text-xs text-slate-500">{item.modulo}</p>
              </div>
              <Badge color="blue">{item.permissao}</Badge>
            </div>
          {/each}

          {#if activePermissionsSummary.length === 0}
            <p class="text-sm text-slate-500">Nenhuma permissao ativa encontrada.</p>
          {/if}

          <Button variant="secondary" href={`/master/permissoes/${currentId}`}
            >Abrir editor completo</Button
          >
        </div>
      </Card>

      <Card color="financeiro" title="Acoes administrativas">
        <div class="space-y-3">
          <Button
            variant="outline"
            color="financeiro"
            class_name="w-full justify-between! rounded-xl! border-slate-200! p-4! text-left! hover:border-orange-300! hover:bg-orange-50/40!"
            on:click={() => (showAvisoDialog = true)}
          >
            <div class="flex items-center gap-3">
              <Mail size={18} class="text-orange-600" />
              <div>
                <p class="font-medium text-slate-900">Enviar aviso administrativo</p>
                <p class="text-sm text-slate-500">Usa templates ativos do modulo de avisos.</p>
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            color="financeiro"
            class_name="w-full justify-between! rounded-xl! border-slate-200! p-4! text-left! hover:border-orange-300! hover:bg-orange-50/40!"
            on:click={() => (showSenhaDialog = true)}
          >
            <div class="flex items-center gap-3">
              <KeyRound size={18} class="text-orange-600" />
              <div>
                <p class="font-medium text-slate-900">Redefinir senha</p>
                <p class="text-sm text-slate-500">Atualiza a senha diretamente no Auth.</p>
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            color="financeiro"
            class_name="w-full justify-between! rounded-xl! border-slate-200! p-4! text-left! hover:border-orange-300! hover:bg-orange-50/40!"
            on:click={() => (showMfaDialog = true)}
          >
            <div class="flex items-center gap-3">
              <ShieldAlert size={18} class="text-orange-600" />
              <div>
                <p class="font-medium text-slate-900">Resetar 2FA</p>
                <p class="text-sm text-slate-500">
                  Remove fatores ativos e obriga nova configuracao.
                </p>
              </div>
            </div>
            {#if mfaStatus?.enabled}
              <Badge color="green">Ativo</Badge>
            {:else}
              <Badge color="gray">Nao configurado</Badge>
            {/if}
          </Button>
        </div>
      </Card>
    </div>
  {/if}
</div>

<Dialog
  bind:open={showAvisoDialog}
  title="Enviar aviso administrativo"
  size="md"
  showConfirm={true}
  confirmText="Enviar aviso"
  onConfirm={sendAviso}
>
  <div class="space-y-4">
    <FieldSelect
      id="aviso-template"
      label="Template"
      bind:value={avisoTemplateId}
      options={avisoTemplates.map((t) => ({ value: t.id, label: t.nome || '' }))}
      placeholder="Selecione uma opção"
      class_name="w-full"
    />
    <p class="text-sm text-slate-500">
      O envio usa as configuracoes globais de e-mail do sistema e aplica as variaveis do usuario
      atual.
    </p>
  </div>
</Dialog>

<Dialog
  bind:open={showSenhaDialog}
  title="Redefinir senha"
  size="md"
  showConfirm={true}
  confirmText="Salvar senha"
  onConfirm={redefineSenha}
>
  <div class="space-y-4">
    <FieldInput
      id="nova-senha"
      label="Nova senha"
      type="password"
      bind:value={novaSenha}
      class_name="w-full"
    />
    <FieldInput
      id="confirmar-senha"
      label="Confirmacao"
      type="password"
      bind:value={confirmarSenha}
      class_name="w-full"
    />
  </div>
</Dialog>

<Dialog
  bind:open={showMfaDialog}
  title="Resetar 2FA"
  size="sm"
  showConfirm={true}
  confirmText="Resetar 2FA"
  confirmVariant="danger"
  onConfirm={resetarMfa}
>
  <p class="text-sm text-slate-600">
    Esta acao remove todos os fatores MFA do usuario e exige configuracao novamente no proximo
    acesso.
  </p>
</Dialog>
