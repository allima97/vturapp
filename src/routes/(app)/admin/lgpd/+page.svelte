<script lang="ts">
  import { onMount } from 'svelte';

  type Solicitacao = {
    id: string;
    tipo: string;
    titular_nome: string;
    titular_email: string;
    titular_cpf?: string;
    descricao: string;
    status: string;
    resposta?: string;
    prazo_legal: string;
    prazo_vencido: boolean;
    created_at: string;
  };

  type Atividade = {
    id: string;
    nome: string;
    finalidade: string;
    base_legal: string;
    dados_tratados: string[];
    titulares: string[];
    retencao_meses?: number;
    ativo: boolean;
  };

  const TIPO_LABEL: Record<string, string> = {
    acesso: 'Acesso', portabilidade: 'Portabilidade', retificacao: 'Retificação',
    eliminacao: 'Eliminação', revogacao: 'Revogação', oposicao: 'Oposição', informacao: 'Informação'
  };

  const STATUS_LABEL: Record<string, string> = {
    recebida: 'Recebida', em_analise: 'Em análise', concluida: 'Concluída', recusada: 'Recusada'
  };

  const STATUS_COR: Record<string, string> = {
    recebida: 'badge-warn', em_analise: 'badge-info', concluida: 'badge-ok', recusada: 'badge-err'
  };

  let aba = $state<'solicitacoes' | 'atividades' | 'anonimizar'>('solicitacoes');
  let solicitacoes = $state<Solicitacao[]>([]);
  let atividades = $state<Atividade[]>([]);
  let carregando = $state(false);
  let erroGlobal = $state('');

  // Responder solicitação
  let respondendo = $state<string | null>(null);
  let novoStatus = $state('em_analise');
  let resposta = $state('');
  let salvando = $state(false);
  let msgResposta = $state('');

  // Anonimizar
  let anonTipo = $state<'cliente' | 'acompanhante'>('cliente');
  let anonId = $state('');
  let anonProtocolo = $state('');
  let anonizando = $state(false);
  let msgAnon = $state('');

  async function carregarSolicitacoes() {
    carregando = true;
    erroGlobal = '';
    try {
      const r = await fetch('/api/v1/lgpd/admin/solicitacoes');
      const d: any = await r.json();
      if (r.ok) solicitacoes = d.items;
      else erroGlobal = d.error || 'Erro ao carregar.';
    } catch { erroGlobal = 'Falha de conexão.'; }
    finally { carregando = false; }
  }

  async function carregarAtividades() {
    carregando = true;
    erroGlobal = '';
    try {
      const r = await fetch('/api/v1/lgpd/admin/atividades');
      const d: any = await r.json();
      if (r.ok) atividades = d.atividades;
      else erroGlobal = d.error || 'Erro ao carregar.';
    } catch { erroGlobal = 'Falha de conexão.'; }
    finally { carregando = false; }
  }

  async function salvarResposta() {
    if (!respondendo) return;
    salvando = true;
    msgResposta = '';
    try {
      const r = await fetch(`/api/v1/lgpd/admin/solicitacoes/${respondendo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus, resposta })
      });
      const d: any = await r.json();
      if (r.ok) {
        msgResposta = '✅ Atualizado com sucesso.';
        await carregarSolicitacoes();
        respondendo = null;
        resposta = '';
      } else {
        msgResposta = `❌ ${d.error || 'Erro.'}`;
      }
    } catch { msgResposta = '❌ Falha de conexão.'; }
    finally { salvando = false; }
  }

  async function executarAnonimizacao() {
    if (!anonId.trim()) return;
    anonizando = true;
    msgAnon = '';
    try {
      const r = await fetch('/api/v1/lgpd/admin/anonimizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: anonTipo, id: anonId.trim(), protocolo_solicitacao: anonProtocolo.trim() || undefined })
      });
      const d: any = await r.json();
      msgAnon = r.ok ? `✅ ${d.mensagem}` : `❌ ${d.error || 'Erro.'}`;
      if (r.ok) { anonId = ''; anonProtocolo = ''; }
    } catch { msgAnon = '❌ Falha de conexão.'; }
    finally { anonizando = false; }
  }

  $effect(() => {
    if (aba === 'solicitacoes') carregarSolicitacoes();
    else if (aba === 'atividades') carregarAtividades();
  });

  function dataFormatada(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function abrirResponder(s: Solicitacao) {
    respondendo = s.id;
    novoStatus = s.status === 'recebida' ? 'em_analise' : 'concluida';
    resposta = s.resposta ?? '';
    msgResposta = '';
  }
</script>

<svelte:head>
  <title>LGPD — Administração</title>
</svelte:head>

<div class="admin-lgpd">
  <div class="page-header">
    <h1>Conformidade LGPD</h1>
    <p>Lei 13.709/2018 — Gestão de solicitações, atividades de tratamento e anonimização.</p>
  </div>

  <!-- Abas -->
  <div class="abas">
    <button class="aba" class:ativa={aba === 'solicitacoes'} onclick={() => aba = 'solicitacoes'}>
      Solicitações de Titulares
    </button>
    <button class="aba" class:ativa={aba === 'atividades'} onclick={() => aba = 'atividades'}>
      Atividades de Tratamento (ROPA)
    </button>
    <button class="aba" class:ativa={aba === 'anonimizar'} onclick={() => aba = 'anonimizar'}>
      Anonimizar Dados
    </button>
  </div>

  {#if erroGlobal}
    <div class="alert alert-error">{erroGlobal}</div>
  {/if}

  <!-- Aba: Solicitações -->
  {#if aba === 'solicitacoes'}
    <div class="secao">
      <div class="secao-header">
        <h2>Solicitações — Art. 18 LGPD</h2>
        <button class="btn-sec" onclick={carregarSolicitacoes} disabled={carregando}>↺ Atualizar</button>
      </div>
      {#if carregando}
        <p class="info-text">Carregando...</p>
      {:else if solicitacoes.length === 0}
        <p class="info-text">Nenhuma solicitação encontrada.</p>
      {:else}
        <div class="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th><th>Titular</th><th>Tipo</th><th>Status</th><th>Prazo</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {#each solicitacoes as s}
                <tr class={s.prazo_vencido ? 'row-vencida' : ''}>
                  <td>{dataFormatada(s.created_at)}</td>
                  <td>
                    <strong>{s.titular_nome}</strong><br/>
                    <small>{s.titular_email}</small>
                  </td>
                  <td><span class="badge">{TIPO_LABEL[s.tipo] ?? s.tipo}</span></td>
                  <td><span class="badge {STATUS_COR[s.status]}">{STATUS_LABEL[s.status] ?? s.status}</span></td>
                  <td class={s.prazo_vencido ? 'prazo-vencido' : ''}>
                    {dataFormatada(s.prazo_legal)}
                    {#if s.prazo_vencido}<br/><small>⚠️ VENCIDO</small>{/if}
                  </td>
                  <td>
                    {#if s.status !== 'concluida' && s.status !== 'recusada'}
                      <button class="btn-sm" onclick={() => abrirResponder(s)}>Responder</button>
                    {:else}
                      <small class="info-text">Concluída</small>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <!-- Modal de resposta -->
      {#if respondendo}
        <div class="modal-overlay" onclick={() => respondendo = null}>
          <div class="modal" onclick={(e) => e.stopPropagation()}>
            <h3>Responder Solicitação</h3>
            {#if msgResposta}<p class="msg-resultado">{msgResposta}</p>{/if}
            <div class="field">
              <label>Novo Status</label>
              <select bind:value={novoStatus}>
                <option value="em_analise">Em Análise</option>
                <option value="concluida">Concluída</option>
                <option value="recusada">Recusada</option>
              </select>
            </div>
            <div class="field">
              <label>Resposta ao titular *</label>
              <textarea bind:value={resposta} rows={5} placeholder="Descreva a ação tomada..."></textarea>
            </div>
            <div class="modal-btns">
              <button class="btn-ghost" onclick={() => respondendo = null}>Cancelar</button>
              <button class="btn-primary" onclick={salvarResposta} disabled={salvando || !resposta.trim()}>
                {salvando ? 'Salvando...' : 'Salvar Resposta'}
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Aba: Atividades (ROPA) -->
  {#if aba === 'atividades'}
    <div class="secao">
      <div class="secao-header">
        <h2>Registro de Atividades de Tratamento — Art. 37</h2>
        <button class="btn-sec" onclick={carregarAtividades} disabled={carregando}>↺ Atualizar</button>
      </div>
      {#if carregando}
        <p class="info-text">Carregando...</p>
      {:else if atividades.length === 0}
        <p class="info-text">Nenhuma atividade cadastrada.</p>
      {:else}
        <div class="tabela-wrap">
          <table>
            <thead>
              <tr><th>Atividade</th><th>Finalidade</th><th>Base Legal</th><th>Dados</th><th>Retenção</th><th>Ativo</th></tr>
            </thead>
            <tbody>
              {#each atividades as a}
                <tr>
                  <td><strong>{a.nome}</strong></td>
                  <td>{a.finalidade}</td>
                  <td>{a.base_legal}</td>
                  <td><small>{a.dados_tratados.join(', ')}</small></td>
                  <td>{a.retencao_meses ? `${a.retencao_meses}m` : '—'}</td>
                  <td>{a.ativo ? '✅' : '❌'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Aba: Anonimizar -->
  {#if aba === 'anonimizar'}
    <div class="secao">
      <h2>Anonimizar Dados — Art. 18, IV/VI</h2>
      <p class="info-text">
        A anonimização substitui os dados pessoais por <code>[ANONIMIZADO-LGPD]</code>,
        tornando o titular irreversivamente não identificável, sem excluir os registros de negócio.
      </p>
      {#if msgAnon}<div class="alert {msgAnon.startsWith('✅') ? 'alert-ok' : 'alert-error'}">{msgAnon}</div>{/if}
      <div class="form-anon">
        <div class="field">
          <label>Tipo de entidade</label>
          <select bind:value={anonTipo}>
            <option value="cliente">Cliente</option>
            <option value="acompanhante">Acompanhante</option>
          </select>
        </div>
        <div class="field">
          <label>ID do {anonTipo} (UUID) *</label>
          <input type="text" bind:value={anonId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
        </div>
        <div class="field">
          <label>Protocolo da solicitação LGPD (opcional)</label>
          <input type="text" bind:value={anonProtocolo} placeholder="UUID da solicitação para vincular" />
        </div>
        <div class="confirm-warn">
          ⚠️ <strong>Esta operação é irreversível.</strong> Confirme que obteve a solicitação formal do titular.
        </div>
        <button class="btn-danger" onclick={executarAnonimizacao} disabled={anonizando || !anonId.trim()}>
          {anonizando ? 'Anonimizando...' : 'Anonimizar Dados'}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .admin-lgpd {
    padding: 1.5rem;
    max-width: 1100px;
    margin: 0 auto;
  }

  .page-header h1 {
    font-size: 1.6rem;
    font-weight: 700;
    margin: 0 0 0.25rem;
  }

  .page-header p {
    color: #6b7280;
    font-size: 0.9rem;
    margin: 0 0 1.5rem;
  }

  .abas {
    display: flex;
    gap: 0.25rem;
    border-bottom: 2px solid #e5e7eb;
    margin-bottom: 1.5rem;
  }

  .aba {
    padding: 0.5rem 1rem;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 0.9rem;
    color: #6b7280;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    transition: all 0.15s;
  }

  .aba.ativa {
    color: #2563eb;
    border-bottom-color: #2563eb;
    font-weight: 600;
  }

  .aba:hover:not(.ativa) {
    color: #374151;
  }

  .secao {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 1.5rem;
  }

  .secao-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .secao-header h2, .secao > h2 {
    font-size: 1rem;
    font-weight: 700;
    margin: 0 0 0.75rem;
  }

  .tabela-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
  }

  th {
    background: #f8fafc;
    text-align: left;
    padding: 0.5rem 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }

  td {
    padding: 0.625rem 0.75rem;
    border-top: 1px solid #f1f5f9;
    vertical-align: top;
  }

  .row-vencida td {
    background: #fff7ed;
  }

  .prazo-vencido {
    color: #dc2626;
    font-weight: 600;
  }

  .badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 600;
    background: #e5e7eb;
    color: #374151;
  }

  .badge-warn { background: #fef3c7; color: #92400e; }
  .badge-info { background: #dbeafe; color: #1e40af; }
  .badge-ok   { background: #d1fae5; color: #065f46; }
  .badge-err  { background: #fee2e2; color: #991b1b; }

  .btn-sm {
    padding: 0.25rem 0.75rem;
    border: 1px solid #2563eb;
    background: none;
    color: #2563eb;
    border-radius: 0.375rem;
    font-size: 0.82rem;
    cursor: pointer;
  }

  .btn-sm:hover { background: #eff6ff; }

  .btn-sec {
    padding: 0.35rem 0.75rem;
    border: 1px solid #d1d5db;
    background: #fff;
    border-radius: 0.5rem;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .btn-sec:hover { background: #f9fafb; }

  .btn-primary {
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 0.5rem;
    padding: 0.5rem 1.25rem;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

  .btn-ghost {
    background: none;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    padding: 0.5rem 1.25rem;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .btn-danger {
    background: #dc2626;
    color: #fff;
    border: none;
    border-radius: 0.5rem;
    padding: 0.5rem 1.25rem;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-danger:hover:not(:disabled) { background: #b91c1c; }
  .btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: #fff;
    border-radius: 0.75rem;
    padding: 1.5rem;
    width: 90%;
    max-width: 500px;
  }

  .modal h3 {
    font-size: 1.1rem;
    font-weight: 700;
    margin: 0 0 1rem;
  }

  .modal-btns {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    margin-top: 1rem;
  }

  .field {
    margin-bottom: 0.875rem;
  }

  .field label {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .field input,
  .field select,
  .field textarea {
    width: 100%;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.88rem;
    box-sizing: border-box;
  }

  .form-anon {
    max-width: 500px;
    margin-top: 1rem;
  }

  .confirm-warn {
    background: #fff7ed;
    border: 1px solid #fed7aa;
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    font-size: 0.88rem;
    color: #92400e;
    margin-bottom: 1rem;
  }

  .alert {
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    font-size: 0.88rem;
    margin-bottom: 1rem;
  }

  .alert-error { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
  .alert-ok    { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }

  .info-text { color: #6b7280; font-size: 0.88rem; }

  .msg-resultado { font-size: 0.88rem; margin-bottom: 0.75rem; }

  code {
    background: #f1f5f9;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.85em;
  }
</style>
