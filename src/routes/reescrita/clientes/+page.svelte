<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authClient } from '$lib/auth-client';
  import {
    AccessibleDialog,
    AlertMessage,
    Button,
    Card,
    Checkbox,
    CursorPagination,
    DataTable,
    EmptyState,
    FieldInput,
    FieldSelect,
    LoadingState,
  } from '$lib/components/ui';
  import ClientNameCell from '$lib/components/ui/ClientNameCell.svelte';
  import ClientActionsCell from '$lib/components/ui/ClientActionsCell.svelte';

  type Cliente = {
    id: number; nome: string; tipo_pessoa: 'PF' | 'PJ'; documento: string;
    telefone: string; email: string | null; cidade: string | null; estado: string | null;
    ativo: boolean; versao: number; nascimento: string | null; whatsapp: string | null;
    classificacao: string | null; endereco: string | null; numero: string | null;
    complemento: string | null; cep: string | null; rg: string | null; genero: string | null;
    nacionalidade: string | null; tags: string[]; tipo_cliente: string; notas: string | null;
  };
  type Anexo = { id: number; nome_original: string; content_type: string; tamanho_bytes: number };

  let itens: Cliente[] = [];
  let cursor: number | null = null;
  let cursors: (number | null)[] = [null];
  let pagina = 0;
  let busca = '';
  let inativos = false;
  let loading = true;
  let saving = false;
  let authRequired = false;
  let error = '';
  let notice = '';
  let timer: ReturnType<typeof setTimeout>;
  let formOpen = false;
  let detailOpen = false;
  let editing: Cliente | null = null;
  let selected: Cliente | null = null;
  let anexos: Anexo[] = [];
  let selectedFiles: FileList | undefined;
  let fileInputElement: HTMLInputElement | null = null;
  let form = emptyForm();
  let loadSequence = 0;

  $: tableRows = itens.map((cliente) => ({
    ...cliente,
    documento_label: `${cliente.tipo_pessoa} · ${cliente.documento}`,
    contato_label: `${cliente.telefone}${cliente.email ? ` · ${cliente.email}` : ''}`,
    cidade_label: [cliente.cidade, cliente.estado].filter(Boolean).join(' / ') || '—',
    status_label: cliente.ativo ? 'Ativo' : 'Inativo',
    email_label: cliente.email || 'Sem e-mail',
  }));
  $: tableColumns = [
    { key: 'nome', label: 'Cliente', component: ClientNameCell, componentProps: (row: (typeof tableRows)[number]) => ({ name: row.nome, email: row.email_label, onOpen: (event: MouseEvent) => { event.stopPropagation(); const cliente = itens.find((item) => item.id === row.id); if (cliente) void abrirDetalhe(cliente); } }) },
    { key: 'documento_label', label: 'Documento' },
    { key: 'contato_label', label: 'Contato' },
    { key: 'cidade_label', label: 'Cidade' },
    { key: 'status_label', label: 'Status' },
  ];

  function emptyForm() {
    return { nome: '', tipo_pessoa: 'PF' as 'PF' | 'PJ', documento: '', telefone: '', email: '', cidade: '', estado: '' };
  }

  onMount(() => {
    void initialize();
    return () => clearTimeout(timer);
  });

  async function initialize() {
    try {
      const session = await authClient.getSession();
      if (!session.data?.user) {
        authRequired = true;
        loading = false;
        return;
      }
      await load();
    } catch {
      authRequired = true;
      loading = false;
    }
  }

  async function request<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { ...init, credentials: 'same-origin' });
    if (response.status === 401) {
      authRequired = true;
      throw new Error('Sua sessão expirou. Entre novamente para continuar.');
    }
    const body = (await response.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
    if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.');
    return body as T;
  }

  async function load(nextCursor = cursors[pagina] ?? null) {
    const sequence = ++loadSequence;
    loading = true;
    error = '';
    try {
      const params = new URLSearchParams({ limite: '20' });
      if (busca.trim()) params.set('busca', busca.trim());
      if (inativos) params.set('inativos', '1');
      if (nextCursor) params.set('cursor', String(nextCursor));
      const result = await request<{ itens: Cliente[]; proximo_cursor: number | null }>(`/api/v2/clientes?${params}`);
      if (sequence !== loadSequence) return;
      itens = result.itens;
      cursor = result.proximo_cursor;
    } catch (err) {
      if (sequence !== loadSequence) return;
      error = err instanceof Error ? err.message : 'Falha ao carregar clientes.';
    } finally {
      if (sequence === loadSequence) loading = false;
    }
  }

  function pesquisar() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      pagina = 0;
      cursors = [null];
      void load(null);
    }, 250);
  }

  async function avancar() {
    if (cursor === null) return;
    cursors = [...cursors.slice(0, pagina + 1), cursor];
    pagina += 1;
    await load(cursor);
  }

  async function voltar() {
    if (pagina === 0) return;
    pagina -= 1;
    await load(cursors[pagina]);
  }

  async function abrirNovo() {
    editing = null;
    form = emptyForm();
    formOpen = true;
  }

  async function abrirEdicao(cliente: Cliente) {
    editing = cliente;
    error = '';
    form = {
      nome: cliente.nome,
      tipo_pessoa: cliente.tipo_pessoa,
      documento: cliente.documento,
      telefone: cliente.telefone,
      email: cliente.email ?? '',
      cidade: cliente.cidade ?? '',
      estado: cliente.estado ?? '',
    };
    detailOpen = false;
    formOpen = true;
  }

  async function recarregarClienteEmEdicao() {
    if (!editing) return;
    try {
      const result = await request<{ data: Cliente }>(`/api/v2/clientes/${editing.id}`);
      editing = result.data;
      form = {
        nome: editing.nome,
        tipo_pessoa: editing.tipo_pessoa,
        documento: editing.documento,
        telefone: editing.telefone,
        email: editing.email ?? '',
        cidade: editing.cidade ?? '',
        estado: editing.estado ?? '',
      };
      error = 'Dados atualizados. Revise as alterações e salve novamente.';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Não foi possível recarregar o cliente.';
    }
  }

  async function salvar(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    error = '';
    try {
      // O PATCH do serviço valida o cadastro completo; preserva os campos que
      // esta versão compacta do formulário ainda não edita.
      const payload = editing ? { ...editing, ...form, versao: editing.versao } : form;
      await request(editing ? `/api/v2/clientes/${editing.id}` : '/api/v2/clientes', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      formOpen = false;
      notice = editing ? 'Cliente atualizado.' : 'Cliente cadastrado.';
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Não foi possível salvar o cliente.';
    } finally {
      saving = false;
    }
  }

  async function abrirDetalhe(cliente: Cliente) {
    selected = cliente;
    error = '';
    detailOpen = true;
    try {
      const result = await request<{ itens: Anexo[] }>(`/api/v2/clientes/${cliente.id}/anexos`);
      anexos = result.itens;
    } catch (err) {
      anexos = [];
      error = err instanceof Error ? err.message : 'Não foi possível carregar os anexos.';
    }
  }

  async function enviarAnexo() {
    const file = selectedFiles?.[0];
    if (!file || !selected) return;
    error = '';
    try {
      const data = new FormData();
      data.append('arquivo', file);
      const result = await request<{ data: Anexo }>(`/api/v2/clientes/${selected.id}/anexos`, { method: 'POST', body: data });
      anexos = [...anexos, result.data];
      selectedFiles = undefined;
      if (fileInputElement) fileInputElement.value = '';
      notice = 'Anexo enviado com segurança.';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Não foi possível enviar o anexo.';
    }
  }

  async function baixarAnexo(anexo: Anexo) {
    if (!selected) return;
    const response = await fetch(`/api/v2/clientes/${selected.id}/anexos/${anexo.id}`, { credentials: 'same-origin' });
    if (!response.ok) {
      error = response.status === 401 ? 'Sua sessão expirou. Entre novamente.' : 'Não foi possível baixar o anexo.';
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = anexo.nome_original;
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

<svelte:head>
  <title>Clientes · VTUR Reescrita</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="reescrita-page">
  <header class="reescrita-topline">
    <div><p class="reescrita-eyebrow">VTUR · NOVA APLICAÇÃO</p><h1>Clientes</h1><p class="reescrita-subtitle">Cadastros da empresa vinculada à sua conta.</p></div>
    {#if !authRequired}<Button on:click={abrirNovo}>＋ Novo cliente</Button>{/if}
  </header>

  {#if notice}<AlertMessage variant="success" message={notice} dismissable />{/if}

  {#if authRequired}
    <Card class="reescrita-state-card"><h2>Entre na nova aplicação</h2><p>Esta área usa a conta Better Auth da reescrita, separada do aplicativo atual.</p><Button href="/reescrita/login">Ir para entrar</Button></Card>
  {:else}
    <Card class="reescrita-toolbar" padding="sm">
      <FieldInput id="search" class_name="reescrita-toolbar-search" label="Buscar cliente" srLabel type="text" placeholder="Nome ou CPF/CNPJ" bind:value={busca} on:input={pesquisar} />
      <label class="reescrita-toggle"><Checkbox ariaLabel="Incluir inativos" bind:checked={inativos} on:change={() => { pagina = 0; cursors = [null]; void load(null); }} /> Incluir inativos</label>
    </Card>

    {#if loading}
      <LoadingState title="Carregando clientes" message="Aguarde enquanto buscamos os cadastros da sua empresa." />
    {:else if error && itens.length === 0}
      <Card class="reescrita-state-card"><h2>Não foi possível carregar os clientes</h2><p>{error}</p><Button variant="outline" on:click={() => load()}>Tentar novamente</Button></Card>
    {:else if itens.length === 0}
      <EmptyState className="reescrita-state-card" title={busca ? 'Nenhum resultado' : 'Sua lista começa aqui'} message={busca ? 'Tente outro nome ou documento.' : 'Cadastre o primeiro cliente para preparar uma venda manual.'} actionLabel={!busca ? 'Cadastrar cliente' : undefined} onAction={!busca ? abrirNovo : undefined} />
    {:else}
      {#if error}<AlertMessage variant="error" message={error} />{/if}
      <DataTable data={tableRows} columns={tableColumns} color="clientes" title="Clientes" emptyMessage="Nenhum cliente encontrado" showRowCount={false} searchable={false} filterable={false} exportable={false} pagination={false} serverSide>
        <svelte:fragment slot="row-actions-cell" let:row>
          <ClientActionsCell onEdit={(event) => { event.stopPropagation(); const cliente = itens.find((item) => item.id === row.id); if (cliente) void abrirEdicao(cliente); }} />
        </svelte:fragment>
      </DataTable>
      <CursorPagination page={pagina + 1} hasPrevious={pagina > 0} hasNext={cursor !== null} {loading} onPrevious={voltar} onNext={avancar} />
    {/if}
  {/if}
</main>

<AccessibleDialog open={formOpen} labelledBy="form-title" className="reescrita-dialog" on:close={() => { error = ''; }}>
  <form class="reescrita-dialog-content" onsubmit={salvar}>
    <div class="reescrita-dialog-head"><div><p class="reescrita-eyebrow">CADASTRO MANUAL</p><h2 id="form-title">{editing ? 'Editar cliente' : 'Novo cliente'}</h2></div><Button variant="ghost" ariaLabel="Fechar" on:click={() => formOpen = false}>×</Button></div>
    {#if error}<AlertMessage variant="error" message={error} />{/if}
    <div class="reescrita-form-grid">
      <FieldInput id="cliente-nome" class_name="wide" label="Nome completo" bind:value={form.nome} maxlength={200} autocomplete="name" required />
      <FieldSelect label="Tipo de pessoa" bind:value={form.tipo_pessoa} options={[{value:'PF',label:'Pessoa física'},{value:'PJ',label:'Pessoa jurídica'}]} />
      <FieldInput label={form.tipo_pessoa === 'PF' ? 'CPF' : 'CNPJ'} bind:value={form.documento} mask={form.tipo_pessoa === 'PF' ? 'cpf' : 'cnpj'} autocomplete="off" required />
      <FieldInput label="Telefone com DDD" bind:value={form.telefone} type="tel" mask="phone" autocomplete="tel" required />
      <FieldInput label="E-mail" bind:value={form.email} type="email" autocomplete="email" />
      <FieldInput label="Cidade" bind:value={form.cidade} autocomplete="address-level2" />
      <FieldInput label="UF" bind:value={form.estado} maxlength={2} autocomplete="address-level1" />
    </div>
    <p class="reescrita-form-note">Campos obrigatórios. CPF/CNPJ e telefone são validados ao salvar.</p>
    <div class="reescrita-dialog-actions"><Button variant="outline" on:click={() => formOpen = false}>Cancelar</Button><Button type="submit" loading={saving}>{saving ? 'Salvando…' : 'Salvar cliente'}</Button></div>
  </form>
</AccessibleDialog>

<AccessibleDialog open={detailOpen} labelledBy="detail-title" className="reescrita-dialog" on:close={() => { error = ''; }}>
  {#if selected}<section class="reescrita-dialog-content">
    <div class="reescrita-dialog-head"><div><p class="reescrita-eyebrow">DETALHES</p><h2 id="detail-title">{selected.nome}</h2></div><Button variant="ghost" ariaLabel="Fechar detalhes" on:click={() => detailOpen = false}>×</Button></div>
    {#if error}
      <AlertMessage variant="error" message={error} />
      {#if editing && error.includes('Recarregue e tente novamente')}<Button variant="outline" size="sm" on:click={recarregarClienteEmEdicao}>Recarregar dados</Button>{/if}
    {/if}
    <dl class="reescrita-detail-grid"><div><dt>Documento</dt><dd>{selected.tipo_pessoa} · {selected.documento}</dd></div><div><dt>Telefone</dt><dd>{selected.telefone}</dd></div><div><dt>E-mail</dt><dd>{selected.email || '—'}</dd></div><div><dt>Cidade</dt><dd>{[selected.cidade, selected.estado].filter(Boolean).join(' / ') || '—'}</dd></div></dl>
    <h3>Anexos privados</h3><p class="reescrita-muted">Arquivos ficam privados no armazenamento da VTUR e são entregues somente após validar seu acesso.</p>
    <ul class="reescrita-attachments">{#each anexos as anexo (anexo.id)}<li><span>{anexo.nome_original} <small>{Math.ceil(anexo.tamanho_bytes / 1024)} KB</small></span><Button variant="outline" size="sm" on:click={() => baixarAnexo(anexo)}>Baixar</Button></li>{:else}<li class="reescrita-muted">Nenhum anexo enviado.</li>{/each}</ul>
    <label class="reescrita-upload">Adicionar documento
      <input bind:this={fileInputElement} bind:files={selectedFiles} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onchange={enviarAnexo} />
    </label>
    <div class="reescrita-dialog-actions"><Button variant="outline" on:click={() => detailOpen = false}>Fechar</Button><Button on:click={() => abrirEdicao(selected!)}>Editar cliente</Button></div>
  </section>{/if}
</AccessibleDialog>

<style>
  :global(body) { background:#f5f7fb; }
  .reescrita-dialog-content { padding:clamp(1.1rem,4vw,1.8rem); }
  .reescrita-dialog-head { display:flex; justify-content:space-between; align-items:start; gap:1rem; margin-bottom:1.2rem; }
  .reescrita-dialog-head h2 { margin:0; font-size:1.45rem; }
  .reescrita-dialog-actions { flex-wrap:wrap; }
  .reescrita-detail-grid { margin:0; padding:0; }
  .reescrita-dialog-content h3 { margin:1.35rem 0 .25rem; }
  @media(max-width:40rem) { .reescrita-dialog-actions { display:grid; grid-template-columns:1fr 1fr; } }
</style>
