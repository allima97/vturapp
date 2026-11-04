<script lang="ts">
  import { dev } from '$app/environment';
  import { onMount } from 'svelte';
  import { apiDelete, apiFetch, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createBrowserDataClient } from '$lib/db/browserData';
  import { assinarRecadosDaEmpresa } from '$lib/realtime/muralRecados';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import { FieldInput, FieldSelect, FieldTextarea, LoadingState } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import {
    ArrowLeft,
    Building2,
    MessageCircle,
    Plus,
    RefreshCw,
    Search,
    Send,
    Trash2,
    Users
  } from '$lib/icons';
  import {
    buildThreads,
    formatBadge,
    formatDateTimeBR,
    formatThreadTime,
    getInitials,
    getNomeExibicao,
    normalizeSortKey,
    safeAttachmentHref,
    type EmpresaOption,
    type RecadoRow,
    type Thread,
    type UserMini
  } from '$lib/mural/helpers';

  type BootstrapPayload = {
    userId: string | null;
    userTypeName: string | null;
    companyId: string | null;
    empresas: EmpresaOption[];
    usuariosEmpresa: UserMini[];
    recados: RecadoRow[];
    supportsAttachments: boolean;
  };

  type CompanyPayload = {
    usuariosEmpresa: UserMini[];
    recados: RecadoRow[];
    supportsAttachments: boolean;
  };

  type RecadosPayload = {
    recados: RecadoRow[];
    supportsAttachments: boolean;
  };

  let loading = true;
  let recadosLoading = false;
  let sending = false;
  let deleting = false;
  let errorMessage: string | null = null;

  let userId: string | null = null;
  let userCompanyId: string | null = null;
  let userTypeName = '';
  let empresas: EmpresaOption[] = [];
  let empresaSelecionada = '';
  let usuariosEmpresa: UserMini[] = [];
  let recados: RecadoRow[] = [];
  let supportsAttachments = true;

  let threadQuery = '';
  let conteudo = '';
  let selectedThreadId = 'company';
  let mobileScreen: 'list' | 'chat' = 'list';
  let mobileTab: 'chats' | 'contacts' = 'chats';
  let isMobile = false;

  let deleteTarget: RecadoRow | null = null;
  let lastLoadedCompanyId = '';
  let lastReadKey = '';
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const bootstrapGuard = createLoadGuard();
  const recadosGuard = createLoadGuard();

  const PT_BR_BASE_COLLATOR = new Intl.Collator('pt-BR', { sensitivity: 'base' });

  const isMaster = () => /MASTER/i.test(userTypeName);
  const companyContextId = () => empresaSelecionada || userCompanyId || '';

  // Fase 6.1: além da atualização a cada 15 s (mantida como está), recado novo aparece na hora
  // via Dados Realtime. O aviso só dispara uma nova busca na API do mural.
  let pararRealtime: (() => void) | null = null;
  let realtimeCompanyId = '';

  function clearPoller() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    pararRealtime?.();
    pararRealtime = null;
    realtimeCompanyId = '';
  }

  function startPoller() {
    const companyId = companyContextId();
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (!companyId) {
      clearPoller();
      return;
    }
    pollTimer = setInterval(() => {
      void loadRecados();
    }, 15000);
    if (realtimeCompanyId !== companyId) {
      pararRealtime?.();
      realtimeCompanyId = companyId;
      let client = null;
      try {
        client = createBrowserDataClient();
      } catch {
        client = null;
      }
      pararRealtime = assinarRecadosDaEmpresa(client, companyId, () => {
        if (companyContextId() === companyId) void loadRecados(true);
      });
    }
  }

  function getVisibleRecados(rows: RecadoRow[], targetUserId = userId) {
    if (!targetUserId) return rows;
    return rows.filter((recado) => {
      if (recado.sender_id === targetUserId && recado.sender_deleted) return false;
      if (recado.receiver_id === targetUserId && recado.receiver_deleted) return false;
      return true;
    });
  }

  async function loadBootstrap() {
    const request = bootstrapGuard.next();
    loading = true;
    errorMessage = null;
    try {
      const payload = await apiGet<BootstrapPayload>('/api/v1/mural/bootstrap', undefined, request.signal);
      if (!bootstrapGuard.isCurrent(request.seq)) return;
      userId = payload.userId ? String(payload.userId) : null;
      userCompanyId = payload.companyId ? String(payload.companyId) : null;
      userTypeName = String(payload.userTypeName || '');
      empresas = payload.empresas || [];
      empresaSelecionada = empresaSelecionada || payload.companyId || '';
      usuariosEmpresa = payload.usuariosEmpresa || [];
      supportsAttachments = payload.supportsAttachments !== false;
      recados = getVisibleRecados(payload.recados || [], payload.userId || null);
      lastLoadedCompanyId = companyContextId();
      startPoller();
    } catch (err) {
      if (isCanceledApiError(err)) return;
      errorMessage = toUserMessage(err, 'Erro ao carregar mural.');
      toast.error(errorMessage);
    } finally {
      if (bootstrapGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function loadCompanyData(companyId: string) {
    if (!companyId) {
      recadosGuard.abort();
      usuariosEmpresa = [];
      recados = [];
      return;
    }
    const request = recadosGuard.next();
    recadosLoading = true;
    try {
      const payload = await apiGet<CompanyPayload>('/api/v1/mural/company', { company_id: companyId }, request.signal);
      if (!recadosGuard.isCurrent(request.seq)) return;
      usuariosEmpresa = payload.usuariosEmpresa || [];
      supportsAttachments = payload.supportsAttachments !== false;
      recados = getVisibleRecados(payload.recados || []);
      startPoller();
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao trocar empresa.'));
    } finally {
      if (recadosGuard.isCurrent(request.seq)) recadosLoading = false;
    }
  }

  async function loadRecados(fresh = false) {
    const companyId = companyContextId();
    if (!companyId) {
      recadosGuard.abort();
      recados = [];
      return;
    }
    const request = recadosGuard.next();
    recadosLoading = true;
    try {
      // Aviso do Realtime: busca sem o cache curto das leituras, para o recado novo aparecer já.
      const payload = fresh
        ? await apiFetch<RecadosPayload>('/api/v1/mural/recados', { query: { company_id: companyId }, signal: request.signal, noCache: true })
        : await apiGet<RecadosPayload>('/api/v1/mural/recados', { company_id: companyId }, request.signal);
      if (!recadosGuard.isCurrent(request.seq)) return;
      supportsAttachments = payload.supportsAttachments !== false;
      recados = getVisibleRecados(payload.recados || []);
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao atualizar recados.'));
    } finally {
      if (recadosGuard.isCurrent(request.seq)) recadosLoading = false;
    }
  }

  async function enviarRecado() {
    const companyId = companyContextId();
    const currentThread = currentThreadData;
    if (!companyId) {
      toast.error('Selecione uma empresa antes de enviar.');
      return;
    }
    if (!currentThread) {
      toast.error('Selecione uma conversa antes de enviar.');
      return;
    }
    if (!conteudo.trim()) {
      toast.error('Digite uma mensagem.');
      return;
    }

    sending = true;
    try {
      await apiPost('/api/v1/mural/recados', {
        company_id: companyId,
        receiver_id: currentThread.type === 'user' ? currentThread.id : null,
        conteudo: conteudo.trim()
      });
      conteudo = '';
      await loadRecados();
      mobileScreen = 'chat';
      toast.success('Recado enviado.');
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao enviar recado.'));
    } finally {
      sending = false;
    }
  }

  async function confirmarExclusao() {
    if (!deleteTarget) return;
    deleting = true;
    try {
      await apiDelete('/api/v1/mural/recados', { id: deleteTarget.id });
      recados = recados.filter((recado) => recado.id !== deleteTarget?.id);
      deleteTarget = null;
      toast.success('Recado excluído.');
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao excluir recado.'));
    } finally {
      deleting = false;
    }
  }

  async function marcarComoLidos(ids: string[]) {
    if (!ids.length) return;
    try {
      await Promise.all(ids.map((id) => apiPost('/api/v1/mural/read', { id })));
      await loadRecados();
    } catch (err) {
      if (dev) console.error('Falha ao marcar leitura do mural', err);
    }
  }

  function canDeleteRecado(recado: RecadoRow) {
    return recado.sender_id === userId || recado.receiver_id === userId;
  }

  function formatConversationStatus(recado: RecadoRow) {
    if (recado.sender_id === userId) {
      const lidoPeloDestino = Boolean(
        recado.receiver_id && recado.leituras?.some((entry) => entry.user_id === recado.receiver_id)
      );
      return lidoPeloDestino ? 'Lido' : 'Enviado';
    }
    const minhaLeitura = recado.leituras?.some((entry) => entry.user_id === userId);
    return minhaLeitura ? 'Lido' : 'Ainda não lido';
  }

  let threads: Thread[] = [];
  let orderedThreads: Thread[] = [];
  let filteredThreads: Thread[] = [];
  let orderedContacts: UserMini[] = [];
  let currentThreadData: Thread | null = null;
  let conversation: RecadoRow[] = [];

  $: threads = buildThreads(recados, usuariosEmpresa, userId);

  $: orderedThreads = (() => {
    const company = threads.find((thread) => thread.id === 'company');
    const others = threads.filter((thread) => thread.id !== 'company');
    const sorted = others.slice().sort((a, b) => {
      const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
      const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return PT_BR_BASE_COLLATOR.compare(normalizeSortKey(a.name), normalizeSortKey(b.name));
    });
    return company ? [company, ...sorted] : sorted;
  })();

  $: filteredThreads = (() => {
    const query = normalizeSortKey(threadQuery);
    if (!query) return orderedThreads;
    return orderedThreads.filter((thread) => {
      const haystack = `${thread.name} ${thread.subtitle}`.trim();
      return normalizeSortKey(haystack).includes(query);
    });
  })();

  $: orderedContacts = (() => {
    const query = normalizeSortKey(threadQuery);
    const pool = usuariosEmpresa.filter((user) => user.id && user.id !== userId);
    const filtered = query
      ? pool.filter((user) => normalizeSortKey(getNomeExibicao(user)).includes(query))
      : pool;
    return filtered
      .slice()
      .sort((a, b) =>
        PT_BR_BASE_COLLATOR.compare(normalizeSortKey(getNomeExibicao(a)), normalizeSortKey(getNomeExibicao(b)))
      );
  })();

  $: if (threads.length > 0 && !threads.some((thread) => thread.id === selectedThreadId)) {
    selectedThreadId = threads[0].id;
  }

  $: currentThreadData = threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null;

  $: conversation = recados
    .filter((recado) => {
      if (!selectedThreadId) return false;
      if (selectedThreadId === 'company') return !recado.receiver_id;
      return (
        (recado.receiver_id === selectedThreadId && recado.sender_id === userId) ||
        (recado.sender_id === selectedThreadId && recado.receiver_id === userId)
      );
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  $: if (companyContextId() && companyContextId() !== lastLoadedCompanyId) {
    lastLoadedCompanyId = companyContextId();
    void loadCompanyData(lastLoadedCompanyId);
  }

  $: {
    const unreadIds = conversation
      .filter((recado) => {
        if (!userId) return false;
        if (selectedThreadId === 'company') {
          return !recado.receiver_id && !recado.leituras?.some((entry) => entry.user_id === userId);
        }
        return recado.receiver_id === userId && !recado.leituras?.some((entry) => entry.user_id === userId);
      })
      .map((recado) => recado.id);
    const nextKey = `${selectedThreadId}:${unreadIds.join(',')}`;
    if (unreadIds.length > 0 && nextKey !== lastReadKey) {
      lastReadKey = nextKey;
      void marcarComoLidos(unreadIds);
    }
  }

  onMount(() => {
    const mediaQuery = window.matchMedia('(max-width: 1024px)');
    const syncMobile = () => {
      isMobile = mediaQuery.matches;
      mobileScreen = mediaQuery.matches ? 'list' : 'chat';
    };
    syncMobile();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncMobile);
    } else {
      mediaQuery.addListener(syncMobile);
    }

    void loadBootstrap();

    return () => {
      clearPoller();
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', syncMobile);
      } else {
        mediaQuery.removeListener(syncMobile);
      }
    };
  });
</script>

<svelte:head>
  <title>Mural de Recados | VTUR</title>
</svelte:head>

<PageHeader
  title="Mural de Recados"
  subtitle="Troca de mensagens internas com navegação no padrão do mural do VTUR."
  color="operacao"
  breadcrumbs={[
    { label: 'Recados' }
  ]}
  actions={[{ label: 'Atualizar', onClick: () => loadRecados(), variant: 'secondary', icon: RefreshCw }]}
/>

{#if errorMessage}
  <div role="alert" class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
    {errorMessage}
  </div>
{/if}

{#if loading}
  <Card color="operacao">
    <LoadingState compact={true} />
  </Card>
{:else if !companyContextId()}
  <Card color="operacao">
    <div class="py-16 text-center text-slate-500">
      Você ainda não está vinculado a uma empresa aprovada para usar o mural.
    </div>
  </Card>
{:else}
  <Card color="operacao" class="mb-4">
    <div class="mural-topbar">
      <div class="mural-topbar__copy">
        <div class="mural-topbar__title">Conversas internas</div>
        <div class="mural-topbar__subtitle">Painel contínuo de comunicação entre equipe e empresa.</div>
      </div>
      {#if empresas.length > 1}
        <div class="mural-topbar__company">
          <FieldSelect
            id="mural-empresa"
            label="Empresa"
            srLabel={true}
            bind:value={empresaSelecionada}
            options={empresas.map((e) => ({ value: e.id, label: e.nome_fantasia }))}
            placeholder="Selecione"
            class_name="w-full min-w-[240px]"
          />
        </div>
      {/if}
    </div>
  </Card>

  {#if isMobile}
    <div class="mural-wa-mobile">
      {#if mobileScreen === 'list'}
        <section class="mural-wa-mobile-list vtur-card">
          <div class="mural-wa-mobile-topbar">
            <div>
              <div class="mural-wa-mobile-title">Recados</div>
              <div class="mural-muted">{filteredThreads.length} conversa(s)</div>
            </div>
            <Button
              variant="primary"
              color="operacao"
              size="sm"
              on:click={() => {
                mobileScreen = 'chat';
                if (!selectedThreadId && filteredThreads[0]) selectedThreadId = filteredThreads[0].id;
              }}
            >
              <Plus size={15} class="mr-1.5" />
              Abrir
            </Button>
          </div>

          <div class="mural-wa-mobile-tabs" role="tablist" aria-label="Seções do mural">
            <Button
              type="button"
              variant="unstyled"
              class_name={`mural-wa-tab ${mobileTab === 'chats' ? 'active' : ''}`}
              on:click={() => (mobileTab = 'chats')}
            >
              Chats
            </Button>
            <Button
              type="button"
              variant="unstyled"
              class_name={`mural-wa-tab ${mobileTab === 'contacts' ? 'active' : ''}`}
              on:click={() => (mobileTab = 'contacts')}
            >
              Contatos
            </Button>
          </div>

          <FieldInput
            id="mural-mobile-search"
            label="Buscar"
            icon={Search}
            bind:value={threadQuery}
            class_name="w-full"
            placeholder={mobileTab === 'chats' ? 'Buscar chats...' : 'Buscar contatos...'}
          />

          <div class="mural-whatsapp-thread-list">
            {#if mobileTab === 'chats'}
              {#each filteredThreads as thread}
                <Button
                  type="button"
                  variant="unstyled"
                  class_name={`mural-whatsapp-thread ${currentThreadData?.id === thread.id ? 'active' : ''}`}
                  on:click={() => {
                    selectedThreadId = thread.id;
                    mobileScreen = 'chat';
                  }}
                >
                  <span class:company={thread.type === 'company'} class="mural-thread-avatar">
                    {getInitials(thread.name)}
                  </span>
                  <span class="mural-thread-content">
                    <span class="mural-whatsapp-thread-line">
                      <span class="mural-whatsapp-thread-name">{thread.name}</span>
                      {#if thread.lastAt}
                        <span class="mural-whatsapp-thread-time">{formatThreadTime(thread.lastAt)}</span>
                      {/if}
                    </span>
                    <span class="mural-whatsapp-thread-subtitle">{thread.subtitle}</span>
                  </span>
                  {#if thread.unreadCount > 0}
                    <span class="mural-thread-unread">{formatBadge(thread.unreadCount)}</span>
                  {/if}
                </Button>
              {/each}
            {:else}
              {#each orderedContacts as contato}
                <Button
                  type="button"
                  variant="unstyled"
                  class_name="mural-whatsapp-thread"
                  on:click={() => {
                    selectedThreadId = contato.id;
                    mobileScreen = 'chat';
                  }}
                >
                  <span class="mural-thread-avatar">{getInitials(getNomeExibicao(contato))}</span>
                  <span class="mural-thread-content">
                    <span class="mural-whatsapp-thread-line">
                      <span class="mural-whatsapp-thread-name">{getNomeExibicao(contato)}</span>
                    </span>
                    <span class="mural-whatsapp-thread-subtitle">Contato da empresa</span>
                  </span>
                </Button>
              {/each}
            {/if}
          </div>
        </section>
      {:else}
        <section class="mural-whatsapp-chat vtur-card">
          <div class="mural-whatsapp-chat-header">
            <div class="mural-chat-header-left">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                ariaLabel="Voltar para a lista"
                class_name="mural-wa-back h-8! w-8! p-0!"
                on:click={() => (mobileScreen = 'list')}
              >
                <ArrowLeft size={16} />
              </Button>
              <span class:company={currentThreadData?.type === 'company'} class="mural-thread-avatar mural-chat-avatar">
                {getInitials(currentThreadData?.name)}
              </span>
              <div class="mural-chat-header-info">
                <div class="mural-chat-title">{currentThreadData?.name || 'Conversa'}</div>
                <div class="mural-chat-subtitle">
                  {currentThreadData?.type === 'company' ? 'Canal geral da empresa' : 'Conversa privada'}
                </div>
              </div>
            </div>
          </div>

          <div class="mural-whatsapp-chat-body">
            {#if recadosLoading && conversation.length === 0}
              <LoadingState compact={true} />
            {:else if conversation.length === 0}
              <div class="chat-empty">Nenhuma mensagem nesta conversa.</div>
            {:else}
              {#each conversation as recado}
                <div class:sent={recado.sender_id === userId} class:received={recado.sender_id !== userId} class="chat-bubble">
                  <div class="chat-bubble-body">
                    {#if recado.sender_id !== userId}
                      <div class="chat-bubble-header">
                        <span>{getNomeExibicao(recado.sender)}</span>
                        <span class="chat-bubble-status">{formatConversationStatus(recado)}</span>
                      </div>
                    {/if}
                    {#if String(recado.conteudo || '').trim()}
                      <div class="chat-bubble-text">{recado.conteudo}</div>
                    {/if}
                    {#if recado.arquivos && recado.arquivos.length > 0}
                      <div class="chat-attachments-files">
                        {#each recado.arquivos as arquivo}
                          <a
                            class="chat-attachment-file"
                            href={safeAttachmentHref(
                              arquivo.download_url,
                              arquivo.storage_bucket,
                              arquivo.storage_path,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <span class="chat-attachment-file-icon">•</span>
                            <span class="chat-attachment-file-info">
                              <span class="chat-attachment-file-name">{arquivo.file_name}</span>
                            </span>
                          </a>
                        {/each}
                      </div>
                    {/if}
                    <div class="chat-bubble-meta">
                      <span>{formatDateTimeBR(recado.created_at)}</span>
                      {#if canDeleteRecado(recado)}
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          class_name="chat-inline-btn px-0! py-0! text-red-600 hover:bg-transparent! hover:text-red-700!"
                          on:click={() => (deleteTarget = recado)}
                        >
                          Excluir
                        </Button>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            {/if}
          </div>

          <form
            class="mural-whatsapp-input"
            on:submit|preventDefault={() => {
              void enviarRecado();
            }}
          >
            {#if supportsAttachments === false}
              <div class="mural-inline-note">Anexos ainda não estão disponíveis neste ambiente.</div>
            {/if}
            <div class="mural-input-row">
              <FieldTextarea
                bind:value={conteudo}
                rows={3}
                class_name="w-full"
                placeholder="Digite sua mensagem..."
              />
              <Button type="submit" color="operacao" variant="primary" loading={sending} class_name="min-w-[128px] justify-center">
                <Send size={15} class="mr-1.5" />
                Enviar
              </Button>
            </div>
          </form>
        </section>
      {/if}
    </div>
  {:else}
    <div class="mural-desktop-grid">
      <aside class="mural-whatsapp-sidebar vtur-card">
        <div class="mural-whatsapp-sidebar-head">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h4>Chats</h4>
              <p class="mural-muted">{orderedThreads.length} contato(s) no escopo</p>
            </div>
            <div class="mural-sidebar-badge">
              <Building2 size={14} />
              {isMaster() ? 'Master' : 'Equipe'}
            </div>
          </div>
          <FieldInput
            id="mural-search"
            label="Buscar conversa"
            icon={Search}
            bind:value={threadQuery}
            class_name="w-full"
            placeholder="Buscar chats ou contatos..."
          />
        </div>

        <div class="mural-whatsapp-thread-list">
          {#each filteredThreads as thread}
            <Button
              type="button"
              variant="unstyled"
              class_name={`mural-whatsapp-thread ${currentThreadData?.id === thread.id ? 'active' : ''}`}
              on:click={() => (selectedThreadId = thread.id)}
            >
              <span class:company={thread.type === 'company'} class="mural-thread-avatar">
                {getInitials(thread.name)}
              </span>
              <span class="mural-thread-content">
                <span class="mural-whatsapp-thread-line">
                  <span class="mural-whatsapp-thread-name">{thread.name}</span>
                  {#if thread.lastAt}
                    <span class="mural-whatsapp-thread-time">{formatThreadTime(thread.lastAt)}</span>
                  {/if}
                </span>
                <span class="mural-whatsapp-thread-subtitle">{thread.subtitle}</span>
              </span>
              {#if thread.unreadCount > 0}
                <span class="mural-thread-unread">{formatBadge(thread.unreadCount)}</span>
              {/if}
            </Button>
          {/each}
        </div>
      </aside>

      <section class="mural-whatsapp-chat vtur-card">
        <div class="mural-whatsapp-chat-header">
          <div class="mural-chat-header-left">
            <span class:company={currentThreadData?.type === 'company'} class="mural-thread-avatar mural-chat-avatar">
              {getInitials(currentThreadData?.name)}
            </span>
            <div class="mural-chat-header-info">
              <div class="mural-chat-title">{currentThreadData?.name || 'Selecione uma conversa'}</div>
              <div class="mural-chat-subtitle">
                {currentThreadData?.type === 'company' ? 'Canal geral da empresa' : 'Conversa privada entre colaboradores'}
              </div>
            </div>
          </div>
        </div>

        <div class="mural-whatsapp-chat-body">
          {#if recadosLoading && conversation.length === 0}
            <LoadingState compact={true} />
          {:else if conversation.length === 0}
            <div class="chat-empty">
              <MessageCircle size={28} class="mx-auto mb-3 opacity-40" />
              Nenhuma mensagem nesta conversa.
            </div>
          {:else}
            {#each conversation as recado}
              <div class:sent={recado.sender_id === userId} class:received={recado.sender_id !== userId} class="chat-bubble">
                <div class="chat-bubble-body">
                  {#if recado.sender_id !== userId}
                    <div class="chat-bubble-header">
                      <span>{getNomeExibicao(recado.sender)}</span>
                      <span class="chat-bubble-status">{formatConversationStatus(recado)}</span>
                    </div>
                  {/if}

                  {#if String(recado.conteudo || '').trim()}
                    <div class="chat-bubble-text">{recado.conteudo}</div>
                  {/if}

                  {#if recado.arquivos && recado.arquivos.length > 0}
                    <div class="chat-attachments-files">
                      {#each recado.arquivos as arquivo}
                        <a
                          class="chat-attachment-file"
                          href={safeAttachmentHref(
                            arquivo.download_url,
                            arquivo.storage_bucket,
                            arquivo.storage_path,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span class="chat-attachment-file-icon">•</span>
                          <span class="chat-attachment-file-info">
                            <span class="chat-attachment-file-name">{arquivo.file_name}</span>
                          </span>
                        </a>
                      {/each}
                    </div>
                  {/if}

                  <div class="chat-bubble-meta">
                    <span>{formatDateTimeBR(recado.created_at)}</span>
                    <div class="chat-bubble-actions">
                      {#if canDeleteRecado(recado)}
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          class_name="chat-inline-btn px-0! py-0! text-red-600 hover:bg-transparent! hover:text-red-700!"
                          on:click={() => (deleteTarget = recado)}
                        >
                          <Trash2 size={13} class="mr-1" />
                          Excluir
                        </Button>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>

        <form
          class="mural-whatsapp-input"
          on:submit|preventDefault={() => {
            void enviarRecado();
          }}
        >
          <div class="mural-input-toolbar">
            <div class="mural-inline-target">
              {#if currentThreadData?.type === 'company'}
                <Users size={14} />
              {:else}
                <MessageCircle size={14} />
              {/if}
              <span>
                {currentThreadData?.type === 'company'
                  ? 'Enviando para todos da empresa'
                  : `Enviando para ${currentThreadData?.name || 'contato'}`}
              </span>
            </div>
            {#if supportsAttachments === false}
              <div class="mural-inline-note">Anexos ainda não estão disponíveis neste ambiente.</div>
            {/if}
          </div>

          <div class="mural-input-row">
            <FieldTextarea
              bind:value={conteudo}
              rows={3}
              class_name="w-full"
              placeholder="Digite sua mensagem..."
            />
            <Button type="submit" color="operacao" variant="primary" loading={sending} class_name="min-w-[148px] justify-center">
              <Send size={15} class="mr-1.5" />
              Enviar
            </Button>
          </div>
        </form>
      </section>
    </div>
  {/if}
{/if}

<Dialog
  open={deleteTarget !== null}
  title="Excluir recado"
  color="operacao"
  size="sm"
  showCancel={true}
  showConfirm={true}
  confirmText={deleting ? 'Excluindo...' : 'Excluir'}
  confirmVariant="danger"
  confirmDisabled={deleting}
  onCancel={() => (deleteTarget = null)}
  onConfirm={() => {
    void confirmarExclusao();
  }}
>
  <p class="text-sm text-slate-600">
    Este recado será removido da sua visualização. Deseja continuar?
  </p>
</Dialog>
