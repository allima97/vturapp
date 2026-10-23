<script lang="ts">
  import { PUBLIC_ENVIRONMENT } from '$env/static/public';

  const DPO_EMAIL = 'dpo@vtur.com.br';
  const EMPRESA_NOME = 'Vtur Tecnologia Ltda';
  const ANPD_URL = 'https://www.gov.br/anpd/pt-br';
  const ATUALIZADO_EM = '2026-10-23';

  // Tipos do Art. 18 LGPD
  const direitos = [
    { tipo: 'acesso', label: 'Acesso aos dados', desc: 'Confirmar a existência e obter cópia dos seus dados pessoais tratados.' },
    { tipo: 'portabilidade', label: 'Portabilidade', desc: 'Receber seus dados em formato estruturado, legível por máquina.' },
    { tipo: 'retificacao', label: 'Retificação', desc: 'Corrigir dados incompletos, inexatos ou desatualizados.' },
    { tipo: 'eliminacao', label: 'Eliminação', desc: 'Solicitar a exclusão de dados tratados com consentimento, salvo obrigação legal.' },
    { tipo: 'revogacao', label: 'Revogar consentimento', desc: 'Retirar consentimento a qualquer momento, sem prejuízo ao tratamento anterior.' },
    { tipo: 'oposicao', label: 'Oposição', desc: 'Opor-se a tratamento em caso de descumprimento da LGPD.' },
    { tipo: 'informacao', label: 'Informação', desc: 'Obter informações sobre entidades públicas e privadas com quem compartilhamos dados.' }
  ];

  let tipoSelecionado = $state('');
  let nome = $state('');
  let email = $state('');
  let descricao = $state('');
  let token = $state('');
  let enviando = $state(false);
  let resultado = $state<{ ok: boolean; protocolo?: string; prazo?: string; mensagem?: string; erro?: string } | null>(null);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!tipoSelecionado || !nome.trim() || !email.trim() || !descricao.trim()) return;
    enviando = true;
    resultado = null;

    try {
      const res = await fetch('/api/v1/lgpd/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: tipoSelecionado,
          nome: nome.trim(),
          email: email.trim(),
          descricao: descricao.trim(),
          turnstile_token: token
        })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        resultado = { ok: true, protocolo: data.protocolo, prazo: data.prazo, mensagem: data.mensagem };
        tipoSelecionado = '';
        nome = '';
        email = '';
        descricao = '';
        token = '';
      } else {
        resultado = { ok: false, erro: data.error || 'Erro ao enviar. Tente novamente.' };
      }
    } catch {
      resultado = { ok: false, erro: 'Falha de conexão. Tente novamente.' };
    } finally {
      enviando = false;
    }
  }
</script>

<svelte:head>
  <title>Política de Privacidade & LGPD — Vtur</title>
  <meta name="description" content="Política de privacidade e exercício de direitos LGPD (Lei 13.709/2018)" />
</svelte:head>

<main class="lgpd-page">
  <div class="container">

    <!-- Cabeçalho -->
    <header class="page-header">
      <div class="badge">LGPD · Lei 13.709/2018</div>
      <h1>Política de Privacidade</h1>
      <p class="subtitulo">
        {EMPRESA_NOME} está comprometida com a proteção dos seus dados pessoais,
        em conformidade com a Lei Geral de Proteção de Dados.
      </p>
      <p class="atualizado">Última atualização: {ATUALIZADO_EM}</p>
    </header>

    <div class="content-grid">
      <!-- Coluna principal -->
      <div class="main-col">

        <!-- 1. Quem somos -->
        <section class="card">
          <h2>1. Controlador dos Dados</h2>
          <p>
            <strong>{EMPRESA_NOME}</strong> é a controladora responsável pelo tratamento
            dos dados pessoais coletados pela plataforma Vtur.
          </p>
          <p>
            <strong>Encarregado de Dados (DPO):</strong>
            <a href="mailto:{DPO_EMAIL}">{DPO_EMAIL}</a>
          </p>
        </section>

        <!-- 2. Dados coletados -->
        <section class="card">
          <h2>2. Dados Pessoais Tratados</h2>
          <p>Coletamos e tratamos os seguintes dados, conforme necessário para cada finalidade:</p>
          <ul>
            <li><strong>Clientes e passageiros:</strong> nome completo, e-mail, telefone, CPF/RG/passaporte, data de nascimento, endereço, preferências de viagem.</li>
            <li><strong>Usuários da plataforma:</strong> nome, e-mail, senha (hash), cargo, empresa, histórico de acesso e ações (auditoria).</li>
            <li><strong>Dados técnicos:</strong> endereço IP, User-Agent, cookies de sessão (autenticação), logs de erro.</li>
          </ul>
        </section>

        <!-- 3. Finalidades e bases legais -->
        <section class="card">
          <h2>3. Finalidades e Bases Legais (Art. 7 e 11)</h2>
          <div class="tabela-responsiva">
            <table>
              <thead>
                <tr>
                  <th>Finalidade</th>
                  <th>Base Legal</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Gestão de reservas e viagens</td><td>Execução de contrato (Art. 7, V)</td></tr>
                <tr><td>Emissão de vouchers e documentos</td><td>Execução de contrato (Art. 7, V)</td></tr>
                <tr><td>Comunicações sobre serviços</td><td>Legítimo interesse / Consentimento (Art. 7, IX)</td></tr>
                <tr><td>Autenticação e controle de acesso</td><td>Legítimo interesse do controlador (Art. 7, IX)</td></tr>
                <tr><td>Auditoria e segurança da plataforma</td><td>Obrigação legal / Legítimo interesse (Art. 7, II e IX)</td></tr>
                <tr><td>Cumprimento de obrigações fiscais</td><td>Obrigação legal (Art. 7, II)</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- 4. Compartilhamento -->
        <section class="card">
          <h2>4. Compartilhamento de Dados</h2>
          <p>Compartilhamos dados apenas nas situações necessárias:</p>
          <ul>
            <li><strong>Fornecedores de tecnologia:</strong> Supabase (infraestrutura de banco de dados, EUA — cláusulas contratuais padrão), Cloudflare (CDN e segurança).</li>
            <li><strong>Parceiros de viagem:</strong> hotéis, companhias aéreas, operadoras — apenas dados necessários para a prestação do serviço contratado.</li>
            <li><strong>Autoridades:</strong> quando exigido por lei ou ordem judicial.</li>
          </ul>
          <p>Não vendemos dados pessoais a terceiros.</p>
        </section>

        <!-- 5. Retenção -->
        <section class="card">
          <h2>5. Retenção e Eliminação</h2>
          <p>Os dados são retidos pelos seguintes períodos:</p>
          <ul>
            <li><strong>Dados de clientes e viagens:</strong> 5 anos após o encerramento do contrato (obrigação fiscal — Lei 8.212/91).</li>
            <li><strong>Logs de acesso:</strong> 6 meses (Marco Civil da Internet, Art. 15).</li>
            <li><strong>Dados de sessão:</strong> até o logout ou expiração (máx. 7 dias).</li>
            <li><strong>Consentimentos:</strong> enquanto necessários para comprovar a legalidade do tratamento.</li>
          </ul>
          <p>
            Após o prazo, os dados são eliminados ou anonimizados de forma irreversível,
            salvo obrigação legal de retenção.
          </p>
        </section>

        <!-- 6. Segurança -->
        <section class="card">
          <h2>6. Medidas de Segurança (Art. 46)</h2>
          <ul>
            <li>Criptografia em trânsito (TLS 1.2+) e em repouso.</li>
            <li>Autenticação multifator (MFA) disponível e obrigatória para empresas configuradas.</li>
            <li>Controle de acesso baseado em papéis (RBAC) e módulos.</li>
            <li>Registro de auditoria de todas as ações sensíveis.</li>
            <li>Proteção contra bots (Cloudflare Turnstile) em formulários públicos.</li>
            <li>Cabeçalhos de segurança HTTP (CSP, HSTS, X-Frame-Options).</li>
          </ul>
        </section>

        <!-- 7. Cookies -->
        <section class="card">
          <h2>7. Cookies</h2>
          <p>Utilizamos apenas cookies estritamente necessários para autenticação e manutenção de sessão. Não utilizamos cookies de rastreamento ou publicidade.</p>
        </section>

        <!-- 8. DPO e ANPD -->
        <section class="card">
          <h2>8. Encarregado de Dados (DPO) e ANPD</h2>
          <p>
            Para exercer seus direitos ou esclarecer dúvidas, entre em contato com nosso
            Encarregado de Dados: <a href="mailto:{DPO_EMAIL}">{DPO_EMAIL}</a>.
          </p>
          <p>
            Você também pode apresentar reclamação à
            <a href="{ANPD_URL}" target="_blank" rel="noreferrer">
              Autoridade Nacional de Proteção de Dados (ANPD)
            </a>.
          </p>
        </section>

      </div>

      <!-- Sidebar: formulário de direitos -->
      <aside class="sidebar">
        <div class="card formulario-card">
          <h2>Exercer Direitos (Art. 18)</h2>
          <p class="form-intro">
            Envie sua solicitação. Respondemos em até <strong>15 dias corridos</strong>,
            conforme previsto na LGPD.
          </p>

          {#if resultado?.ok}
            <div class="alert alert-success">
              <strong>Solicitação recebida!</strong><br />
              {resultado.mensagem}<br />
              <small>Protocolo: <code>{resultado.protocolo}</code></small>
            </div>
          {:else}
            {#if resultado?.erro}
              <div class="alert alert-error">{resultado.erro}</div>
            {/if}

            <form onsubmit={handleSubmit}>
              <div class="field">
                <label for="tipo">Tipo de solicitação *</label>
                <select id="tipo" bind:value={tipoSelecionado} required>
                  <option value="">Selecione...</option>
                  {#each direitos as d}
                    <option value={d.tipo}>{d.label}</option>
                  {/each}
                </select>
                {#if tipoSelecionado}
                  <p class="field-help">{direitos.find(d => d.tipo === tipoSelecionado)?.desc}</p>
                {/if}
              </div>

              <div class="field">
                <label for="nome">Nome completo *</label>
                <input id="nome" type="text" bind:value={nome} required placeholder="Seu nome" />
              </div>

              <div class="field">
                <label for="email">E-mail *</label>
                <input id="email" type="email" bind:value={email} required placeholder="seu@email.com" />
              </div>

              <div class="field">
                <label for="descricao">Descrição *</label>
                <textarea
                  id="descricao"
                  bind:value={descricao}
                  required
                  rows={4}
                  placeholder="Descreva sua solicitação com o máximo de detalhes..."
                ></textarea>
              </div>

              <!-- Turnstile widget -->
              <div
                class="cf-turnstile"
                data-sitekey={PUBLIC_ENVIRONMENT === 'production'
                  ? '0x4AAAAAAAxxxxxx'
                  : '1x00000000000000000000AA'}
                data-callback="onTurnstileSuccess"
              ></div>

              <button type="submit" class="btn-primary" disabled={enviando || !token}>
                {enviando ? 'Enviando...' : 'Enviar Solicitação'}
              </button>
            </form>
          {/if}
        </div>

        <!-- Contato rápido -->
        <div class="card contato-card">
          <h3>Contato Direto</h3>
          <p>DPO: <a href="mailto:{DPO_EMAIL}">{DPO_EMAIL}</a></p>
          <p class="small">Prazo de resposta: até 15 dias corridos (LGPD Art. 18, §3)</p>
        </div>
      </aside>
    </div>
  </div>
</main>

<svelte:window
  on:load={() => {
    // Callback global para o Turnstile
    (window as unknown as Record<string, unknown>).onTurnstileSuccess = (t: string) => { token = t; };
  }}
/>

<!-- Carrega script Turnstile -->
<svelte:head>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</svelte:head>

<style>
  .lgpd-page {
    min-height: 100vh;
    background: var(--color-background, #f8fafc);
    padding: 2rem 1rem 4rem;
    font-family: var(--font-body, system-ui, sans-serif);
    color: var(--color-text, #1a202c);
  }

  .container {
    max-width: 1100px;
    margin: 0 auto;
  }

  .page-header {
    text-align: center;
    margin-bottom: 2.5rem;
  }

  .badge {
    display: inline-block;
    background: #2563eb;
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    margin-bottom: 0.75rem;
  }

  .page-header h1 {
    font-size: 2rem;
    font-weight: 700;
    margin: 0 0 0.5rem;
  }

  .subtitulo {
    color: var(--color-text-muted, #6b7280);
    max-width: 600px;
    margin: 0 auto 0.5rem;
  }

  .atualizado {
    font-size: 0.8rem;
    color: var(--color-text-muted, #9ca3af);
  }

  .content-grid {
    display: grid;
    grid-template-columns: 1fr 360px;
    gap: 1.5rem;
    align-items: start;
  }

  @media (max-width: 768px) {
    .content-grid {
      grid-template-columns: 1fr;
    }
    .sidebar {
      order: -1;
    }
  }

  .card {
    background: #fff;
    border-radius: 0.75rem;
    border: 1px solid var(--color-border, #e5e7eb);
    padding: 1.5rem;
    margin-bottom: 1rem;
  }

  .card h2 {
    font-size: 1.1rem;
    font-weight: 700;
    margin: 0 0 0.75rem;
    color: #1a202c;
  }

  .card p, .card li {
    font-size: 0.95rem;
    line-height: 1.6;
    margin-bottom: 0.5rem;
    color: var(--color-text, #374151);
  }

  .card ul {
    padding-left: 1.25rem;
  }

  .tabela-responsiva {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
  }

  th {
    background: #f1f5f9;
    text-align: left;
    padding: 0.5rem 0.75rem;
    font-weight: 600;
  }

  td {
    padding: 0.5rem 0.75rem;
    border-top: 1px solid #e5e7eb;
  }

  /* Sidebar */
  .formulario-card h2 {
    font-size: 1.05rem;
  }

  .form-intro {
    font-size: 0.88rem;
    color: #6b7280;
    margin-bottom: 1rem;
  }

  .field {
    margin-bottom: 1rem;
  }

  .field label {
    display: block;
    font-size: 0.875rem;
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
    font-size: 0.9rem;
    background: #fff;
    color: #1a202c;
    box-sizing: border-box;
  }

  .field input:focus,
  .field select:focus,
  .field textarea:focus {
    outline: 2px solid #2563eb;
    border-color: #2563eb;
  }

  .field-help {
    font-size: 0.8rem;
    color: #6b7280;
    margin-top: 0.25rem;
  }

  .cf-turnstile {
    margin-bottom: 1rem;
  }

  .btn-primary {
    width: 100%;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 0.5rem;
    padding: 0.625rem 1rem;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .alert {
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    font-size: 0.88rem;
    margin-bottom: 1rem;
    line-height: 1.5;
  }

  .alert-success {
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #a7f3d0;
  }

  .alert-error {
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fca5a5;
  }

  .contato-card h3 {
    font-size: 0.95rem;
    font-weight: 700;
    margin: 0 0 0.5rem;
  }

  .contato-card p {
    font-size: 0.88rem;
    margin: 0 0 0.25rem;
  }

  .small {
    font-size: 0.78rem;
    color: #9ca3af;
  }

  a {
    color: #2563eb;
    text-decoration: underline;
  }

  code {
    background: #f1f5f9;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.85em;
  }
</style>
