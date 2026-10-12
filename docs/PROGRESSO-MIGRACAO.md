# Progresso da modernização do vturapp

> Arquivo de retomada. Atualizado a cada etapa, junto com o documento `fase2-hono-execucao.md` do projeto no Claude.
> Regra de ouro: **nenhuma mudança de regra de negócio**. Toda etapa é provada com teste de paridade ou contrato antes de ir para a pasta.

_Última atualização: 25/09/2026, 21:00._

## Onde paramos
- **Fase 2 concluída para `/api/v1`:** as 252 rotas de `/api/v1` rodam no Hono (`docs/api-inventory.md`: 252 de 261 endpoints). Os 9 restantes são o catch-all e `src/routes/api/auth`.
- **Fase 2.6, lote 3, gravado no Mac e sem commit:** 34 rotas dos domínios pequenos, mais as 3 rotas profundas que tinham ficado no SvelteKit.
- **Decisão do usuário (24/09/2026):** as rotas de login e autenticação em `src/routes/api/auth` (login, convite, set-session, turnstile e passkeys) **não serão migradas**. Elas continuam no SvelteKit, sem alteração.
- **Fase 3.1:** com commit ("fase7"). O "Dados atualizados há X" do dashboard funciona, e o `svelte-check` está sem erros.
- **Fase 3.2:** com commit ("telas_botoes").
- **Fase 3.3:** com commit ("breacrumbs").
- **Correção do dashboard em meses anteriores (25/09):** com commit ("dashboard"). Ver a seção "Dashboard: meses anteriores" abaixo.
- **Fase 3.5, 1ª rodada:** com commit ("correções_dashboard").
- **Fase 3.5, 2ª rodada (abas e janelas da conciliação e do roteiro):** gravada no Mac, sem commit. Ver a seção 3.5.
- **Correção: telas travadas no mês atual (25/09, 08:45):** gravada no Mac, sem commit. Ver a seção "Filtros que não recarregavam" abaixo.
- **Fase 3.4:** com commit ("consultas"). Resumo:
  - o `wrangler.toml` roda o Worker ao lado do banco (`[placement] region = "aws:us-west-2"`);
  - o detalhe da viagem busca os dados em paralelo.
- **Próximo passo:**
  - publicar a 3.4 e medir o resultado;
  - depois, Fase 3.5 (dividir telas gigantes).

## Pendências do usuário
1. No Mac: `npm test` (629 testes), depois commit/push da Fase 3.4.
2. Publicar com `npm run cf:deploy`. Depois, conferir no DevTools (aba Rede, qualquer chamada `/api/v1/...`):
   - o header `cf-placement` deve mostrar algo como `remote-PDX` ou `remote-SEA`;
   - o `server-timing` deve cair.
   Para desfazer: remover o bloco `[placement]` e publicar de novo.
2. Em produção, conferir:
   - Lote 3: cadastros de cidades, países, subdivisões, tipos de produto e circuitos; consultorias (inclusive o .ics); convites (enviar e aceitar); CRM (biblioteca e assinatura); perfil e assinatura; menu; CEP; equipe; QR; vouchers (assets); e-mail de boas-vindas; aniversariantes.
   - As 3 rotas profundas: permissões por tipo de usuário, regra de comissão por id e acompanhante de cliente.
   - Cron: nos logs do Worker, confirmar que o `scheduled` continua chamando `/api/v1/read-model/rebuild` com sucesso (200). `cron/alerta-comissao` e `cron/lembretes-consultoria` continuam exigindo o segredo.
3. Pendências antigas:
   - Rodar `supabase/manual/2026-09-24_read_model_cleanup.sql` depois do deploy (pedir aprovação).
   - Confirmar o build do Cloudflare com `npm run cf:build` e os secrets `CRON_SECRET`/`WORKER_BASE_URL`.

## Fases
| Fase | Status | Resumo |
|---|---|---|
| 0: read model v4 | ✅ commit | Triggers de dirty em produção, rebuild v4, correções. |
| 1: paridade | ✅ commit | Inventário de APIs, testes de caracterização, auditoria em `logs`. |
| 2: Hono | ✅ commit | 252 rotas de `/api/v1` no Hono. `api/auth` não migra (decisão do usuário). |
| 3: telas, navegação, acessibilidade, velocidade | ✅ commit | 3.1 a 3.10. |
| 4: design system | ✅ commit | Tailwind 4, Flowbite 1.33 (componentes do 0.48 copiados), ícones Flowbite. `!important`: fica como está (ver 4.4). |
| 5: UX e navegação | ✅ commit | Ctrl+K, acessibilidade, placar, ficha do cliente, revisão do `/negado`. |
| 6: tempo real | ✅ 6.1 com commit | Recados em tempo real. Próximos: vendas por empresa, placar ao vivo. |
| Relatório de Performance por agência | ⏳ implementado, sem commit | Tela `/relatorios/performance` + PDF. Ver a seção abaixo. |

## API no Hono
Todas as rotas de `src/routes/api/v1/**` são pontes (`apiHandler`), com os routers em `src/lib/server/api/routes/<dominio>/index.ts` e o registro em `src/lib/server/api/app.ts`.

**Detalhes que precisam ser lembrados:**
- **Arquivos-apelido** (`export { GET } from '../outra/+server'`): o gerador não os migra. É preciso registrar o mesmo handler no caminho do apelido, antes das rotas `/:param`, e trocar o arquivo por uma ponte. Se isso não for feito, a ponte responde 404. Apelidos tratados: `orcamentos/interaction` → `interacao`, `viagens/list` → raiz, `documentos-viagens/list` → `operacao/documentos-viagens`.
- **`cards`:** os módulos de `aniversario.svg`, `render.png` e `render.svg` usam `-` no nome do arquivo, para o Vite não tratá-los como asset. As URLs não mudam.
- **Helpers que continuam em `routes/`:** `conciliacao/_legacy.ts`, `conciliacao/_types.ts`, `relatorios/_legacyForward.ts`, `preferencias/_shared.ts`, `mural/_shared.ts` e `cards/_render.ts`. Os módulos importam esses helpers por caminho relativo.
- **`RequestHandler` usado em outro ponto** (ex.: `Parameters<RequestHandler>[0]` em `documentacao`): o import de `./$types` vira o de `@sveltejs/kit`. É só tipo, e o comportamento não muda.
- **405 preservado:** a ponte só exporta os métodos da rota original, então o SvelteKit responde 405 antes de chegar ao Hono. Os testes de "método inexistente" evitam métodos que, chamados direto no Hono, cairiam numa rota `/:id` do mesmo nível.
- **Rotas profundas:** passam de 7 níveis de pasta e não dá para copiá-las pelas ferramentas de arquivo. São lidas e gravadas pelo shell do Mac, com conferência de hash antes de gravar.
- **Cron:** `scripts/patch-worker-scheduled.js` chama `GET /api/v1/read-model/rebuild` com `x-cron-secret`. No teste local, sem o segredo ou com o segredo errado a resposta é 401, e com o segredo certo a chamada chega ao handler.

**Como migrar:** ver `scripts/migracao-hono/README.md`.

**Ambiente:** o shell remoto do Mac roda em Linux e não consegue usar a `node_modules` do Mac (os binários são de macOS). Os testes rodam na cópia de trabalho do Claude, e antes de gravar ele confere, arquivo por arquivo, que o `src/` do Mac é idêntico a ela. Pelo shell remoto, usar só `git --no-optional-locks status/log`, nunca comandos que gravam no `.git`.

## Fase 3: telas, navegação, acessibilidade e velocidade (sem mudar regra de negócio)

**Situação encontrada:**
- 126 páginas em `src/routes/(app)`.
- Nenhuma página importa `flowbite-svelte` diretamente: todas usam o kit próprio `$lib/components/ui` (Button, Card, Dialog, DataTable, Tabs, Dropdown, campos de formulário etc.), e 19 desses componentes usam Flowbite por baixo.
- **Consequência:** a melhoria de layout e acessibilidade é feita no kit, e vale para todas as telas de uma vez, sem reescrever página por página.

**3.1 (feito):**
- **"Dados atualizados há X" no dashboard:** nunca aparecia, porque a RPC `dashboard_vendas_summary_from_read_model` não devolve `rebuilt_at`. Agora a data vem de `ranking_read_model_status` (modelo v4), consultada em paralelo com a RPC. Mostra a reconstrução mais antiga entre os meses e empresas exibidos, em min, h ou dias, com a data completa ao passar o mouse. Se a consulta falhar, o dashboard continua funcionando, só sem a indicação. Nenhuma mudança no banco.
- **`svelte-check`:**
  - a propriedade `rebuiltAt` entrou no tipo `VendasKpiDashboardSummary`;
  - em `roteiroAereoImport.ts`, o `numero_voo` ficou fora do tipo intermediário. É só tipo: esse campo nunca era lido e a saída já usa `''`.
- **Verificação:** 605 testes, build OK e `svelte-check` com 0 erros.

**3.2 (feito):** só atributos `aria-*`, `tabindex` e foco. Nenhuma regra de negócio muda, e o visual continua o mesmo.
- **Campos** (`FieldInput`, com e sem máscara, `FieldSelect`, `FieldTextarea`, `FieldCheckbox`, `FieldToggle`):
  - a mensagem de erro ou de ajuda ganhou `id` e passa a ser anunciada junto com o campo (`aria-describedby`);
  - com erro, o campo recebe `aria-invalid="true"`;
  - o `*` de obrigatório fica `aria-hidden`, e o campo continua `required`.
- **`FieldRadioGroup`:** o rótulo apontava (`for`) para um id que não existia. Agora o grupo tem `role="radiogroup"` e é nomeado pelo rótulo, com `aria-required`, `aria-invalid` e `aria-describedby`.
- **`Tabs`:** tabindex móvel (só a aba ativa entra no Tab); setas esquerda e direita, Home e End navegam e ativam a aba, pulando as desabilitadas. A lógica fica em `tabsKeyboard.ts`, com teste. O clique continua igual.
- **`Button`:** `aria-busy` enquanto carrega e prop opcional `tabindex`.
- **`DataTable`:**
  - `aria-sort` nas colunas ordenáveis;
  - linhas clicáveis (`onRowClick`) passam a ser focáveis e abrem com Enter ou Espaço. Isso só vale quando o foco está na própria linha, então botões e campos dentro dela continuam com o comportamento de sempre.
- **`ToastContainer`:** sucesso e informação usam `role="status"` (educado, não interrompe a leitura); erro e alerta continuam `role="alert"`. O botão de fechar ganhou nome ("Fechar aviso").
- **`OverlayModal`:** ao abrir, o foco vai para a janela, então Esc funciona de imediato; ao fechar, o foco volta para onde estava.
- **`AlertMessage`:** o ícone de fechar ficou `aria-hidden`.
- **Verificação:**
  - `src/lib/components/ui/a11y.test.ts` renderiza os componentes no servidor (`svelte/server`, sem dependência nova) e confere os atributos, com 13 testes;
  - total de 618 testes passando;
  - `svelte-check` com 0 erros e 0 avisos;
  - build OK.

**3.3 (feito):** os itens do menu, a ordem e as permissões (`canSeeItem`) continuam exatamente iguais.
- **Pular para o conteúdo:** o primeiro Tab da página mostra o link "Pular para o conteúdo", que leva o foco para o `<main id="conteudo-principal">`. Foi criada a classe `.vtur-skip-link` em `app.css`.
- **Menu lateral (`Sidebar.svelte`):**
  - O estado de cada seção recolhida passou a ser guardado **pelo nome da seção**. Antes era pela posição na lista, e quando as permissões terminavam de carregar a seção recolhida podia trocar.
  - Menu expandido/recolhido e seções recolhidas ficam lembrados neste navegador (`localStorage`, chaves `vtur:sidebar-expanded` e `vtur:sidebar-secoes-recolhidas`). As funções estão em `layout/sidebarPrefs.ts`, com teste. Qualquer falha volta ao padrão.
  - Os botões de seção e o de expandir ganharam `aria-expanded` e `aria-controls`.
- **Menu no celular:**
  - o botão Menu ganhou `aria-expanded` e o rótulo passou a alternar entre Abrir e Fechar;
  - ao abrir, o foco vai para o primeiro link;
  - **Esc fecha** o menu e devolve o foco ao botão;
  - o menu fecha sozinho em qualquer navegação, inclusive no voltar do navegador (`afterNavigate`);
  - o fundo escuro deixou de ser um botão falso com foco;
  - o item da página atual ganhou `aria-current`.
- **Breadcrumbs (`PageHeader`):**
  - `<nav aria-label="Trilha de navegação">`;
  - o ícone de início ganhou o nome "Início";
  - as setas ficaram `aria-hidden`;
  - o último item recebe `aria-current="page"`;
  - o foco agora fica visível.
- **`Button`:** nova prop `ariaControls`.
- **Títulos da aba do navegador:** foram adicionados em Consultoria Online, Análise de Desempenho e Correção de recibos. As outras telas já tinham título, direto ou pelo componente que usam, e 4 são só redirecionamentos.
- **Topbar:** o rótulo do logo agora é "VTUR, página inicial".
- **Verificação:**
  - 623 testes passando, com 5 novos: `sidebarPrefs` e trilha/ariaControls em `a11y.test.ts`;
  - `svelte-check` com 0 erros e 0 avisos;
  - build OK.
- **Observações:**
  - `layout/Header.svelte` não é usado por nenhuma tela. Fica como está e pode ser apagado depois, se você quiser.
  - Atalhos globais de teclado ficaram de fora de propósito, para não conflitar com a digitação nos formulários.
  - A cópia de build da nuvem estava sem 8 arquivos de rotas profundas (os editar de cadastros e as passkeys). Foi completada, e agora é idêntica ao Mac.

**3.4 (feito): diagnóstico medido, sem mudar o banco (só consultas de leitura).**
- **As estatísticas do Postgres enganam.** O `pg_stat_statements` conta desde 12/2025. A lista de cidades aparecia com 1,3 s de média, mas era do tempo em que a tabela tinha cerca de 160 mil linhas. Medida hoje (`EXPLAIN ANALYZE`, como usuário `authenticated`), leva **3 ms**. A RLS não pesa.
- **Logs dos últimos dias (tempo de resposta do PostgREST):** até consultas triviais levam cerca de **200 a 500 ms**. Exemplo: `quote`, com média de 210 ms.
- **Causa:** o banco fica em **us-west-2 (Oregon)** e o Worker roda perto do usuário, em São Paulo (`colo GRU`). Cada consulta atravessa o continente. Toda API também chama o Supabase Auth (`getUser`), que fica na mesma região.
- **Correção 1 (`wrangler.toml`):** `[placement] region = "aws:us-west-2"`.
  - O Worker passa a rodar ao lado do banco. O usuário paga uma ida até Oregon por requisição, e as consultas ficam em poucos ms.
  - Os arquivos estáticos continuam saindo do ponto mais próximo do usuário.
  - O wrangler 4.87 aceita a opção, e o `wrangler deploy --dry-run` passou.
  - Estimativa para uma API com 5 idas ao banco: de ~1 s para ~250 ms.
  - Documentação: https://developers.cloudflare.com/workers/configuration/placement/
- **Correção 2 (`viagens/id.ts`, GET):**
  - Antes, depois do controle de acesso, todas as leituras rodavam em fila: status, cliente, venda → recibos → produtos, recibo, vouchers e passageiros.
  - Agora essas leituras rodam em paralelo, e o caminho mais longo fica em 3 idas.
  - O controle de acesso ficou **igual**, de propósito.
  - **Prova:** `id.contract.test.ts`, com o banco falso `$lib/server/testing/fakeSupabase.ts`. São 5 cenários (admin completo, vendedor com acesso pela venda, vendedor sem acesso → 403, 404, e viagem sem venda nem cliente).
  - Os snapshots foram gerados com o código **antigo** e passam iguais com o novo: mesmo status, mesmo corpo e o mesmo conjunto de consultas.
  - Um teste extra confirma 1 consulta aberta por vez antes e 6 ao mesmo tempo agora.
- **Verificado e não precisa mexer:** estes já buscam em paralelo e com cache:
  - detalhe de venda, orçamento e voucher;
  - base do cadastro de venda;
  - listas de viagens e orçamentos;
  - resumo admin;
  - `user/context`.
  O front também guarda os GETs por 15 s, e o servidor manda `private, max-age=30`.
- **Opcional (banco, precisa da sua aprovação):** a tabela `cidades` tem 102 kB de dados em 17 MB de disco, mais 22 MB de índices, sobra das cerca de 160 mil cidades antigas. Um `VACUUM FULL public.cidades` recuperaria esse espaço. O ganho hoje é pequeno (poucos ms), por isso não fiz.
- **Verificação:** 629 testes passando, `svelte-check` com 0 erros e 0 avisos, build OK.

**Dashboard: meses anteriores ficavam só no esqueleto (25/09).** O diagnóstico foi feito só com consultas de leitura no banco.
- **Causa 1:** fev a mai/2026, na empresa 104037a0, estavam em `status='error'`. O erro era sempre o mesmo: `violates foreign key constraint ranking_recibo_contribuicoes_recibo_id_fkey`.
  - Recibo que existe só na conciliação, sem recibo de venda, usa o id da conciliação como `reciboId` (`buildConcRecibo`: `linked_recibo_id || item.id`).
  - O resumo do mês nunca era gravado. A cada abertura, o dashboard tentava reconstruir (cálculo do mês inteiro, que falhava) e depois **calculava tudo de novo**. Isso estourava o tempo.
  - Afeta **todo mês com conciliação importada**. Os meses sem conciliação (dez, jan, jun, ago, set) estavam ok.
- **Causa 2:** jul/2026 estava `ready` com **0 linhas**. Foi montado em 01/07 às 09:46, com o mês ainda vazio, e nunca mais foi marcado para refazer. Os gatilhos de "dirty" da Fase 0 **não estão aplicados** no banco (conferido em `information_schema.triggers`), e a aplicação só marca o mês atual e o anterior.
- **Correção 1: `readModelRowGuard.ts`** (novo), usado nos **dois** pontos de gravação (`reciboContribuicoesReadModel.ts` do dashboard e `readModelRebuild.ts` do cron).
  - Antes de apagar o mês, confere em `vendas_recibos` quais `recibo_id` existem. Os inexistentes são gravados como `null`, igual ao que já se fazia com `venda_id`. O cálculo não muda.
  - **Trava:** as contagens de recibos usam o `recibo_id` na chave: painel e RPCs usam `venda|recibo ou número|data`, produtos usa `recibo || venda|número|data`, ranking usa `venda::recibo ou número`, destinos e clientes usam `venda || recibo || …`.
    - Só grava se a troca for **um-para-um** em todas essas chaves. Linhas do mesmo recibo, como no rateio, continuam iguais, e recibos diferentes continuam diferentes. Assim nenhuma contagem muda em nenhum filtro.
    - Se não for, o mês não é gravado e fica como antes. O `last_error` informa qual chave bateria.
  - Consulta nos dados reais: dos 392 recibos da conciliação sem recibo de venda, **0** colidem na chave do painel.
- **Correção 2: rodada noturna.** O `wrangler.toml` ganhou o cron `"7 6 * * *"` (03:07 de Brasília).
  - `scripts/patch-worker-scheduled.js` passa a enviar o header `x-cron-schedule`. O endpoint só considera esse header depois de validar o `x-cron-secret`.
  - `markNightlyReadModelMonthsDirty` marca como `dirty`, para as empresas ativas e os últimos 12 meses mais o atual:
    - o mês atual e os 2 anteriores, sempre;
    - meses que nunca foram montados;
    - meses `ready` montados **antes de o mês terminar**, como julho.
  - O cron de 5 min reconstrói durante a madrugada, até 50 meses por rodada. Hoje são 3 empresas, então no máximo 39 meses. De manhã, o dashboard só lê.
  - A regra está em `selectNightlyDirtyMonths`, uma função pura com teste.
- **Correção 3:** o cron tenta de novo mês em `error` só **1 vez por hora**, e não a cada 5 min. Antes, um mês com falha recalculava o mês inteiro 12 vezes por hora à toa.
- **Testes novos:**
  - `readModelRowGuard.test.ts`: 7 testes, incluindo os 2 casos em que a trava impede a gravação;
  - `readModelNightly.test.ts`: 6 testes.
  - O `fakeSupabase` ganhou `upsert`.
- **Verificação:**
  - 642 testes passando;
  - `svelte-check` com 0 erros e 0 avisos;
  - build OK;
  - `wrangler deploy --dry-run` OK com os 2 crons.
- **Depois do deploy:**
  - fev a mai: o cron tenta de novo em até 1 hora, e o dashboard, na próxima abertura;
  - julho: corrigido na primeira rodada noturna.
  - Para corrigir julho na hora, precisa de aprovação:
    ```sql
    update ranking_read_model_status set status='dirty', dirty_at=now(), updated_at=now()
    where modelo='recibo_contribuicoes_v4' and company_id='104037a0-e143-4cb7-ae81-fc31da188ae4' and mes='2026-07-01';
    ```
- **Recomendado:** aplicar a migration dos gatilhos da Fase 0 (`20260924200100_read_model_v4_dirty_triggers.sql`). Com ela, qualquer alteração em mês antigo marca o mês na hora, sem esperar a noite. Precisa de aprovação.

**3.5 (25/09): dividir as telas gigantes, sem mudar o comportamento.** Começou com outro agente e foi revisada e concluída aqui.

| Tela | Antes | Depois | O que saiu |
|---|---|---|---|
| `vendas/[id]/editar` | 1388 | 1065 | 5 componentes das etapas (`EtapasNavegacao`, `EtapaDadosVenda`, `EtapaRecibos`, `EtapaPagamentos`, `EtapaResumo`) e `types.ts` (feito pelo outro agente) |
| `operacao/vouchers/novo` | 1605 | 1442 | `SelecaoFornecedor`, `WizardEtapas`, `ImportacaoVoucher`, `formatters.ts` e `types.ts` |
| `orcamentos/roteiros/[id]` | 2764 | 2477 | tipos e funções de lista (`tipos.ts`), importação de dias (`importacao-dias.ts`) e `formatadores.ts` |
| `financeiro/conciliacao` | 3113 | 2809 | 14 tipos (`types.ts`) e 18 formatadores (`formatters.ts`) |

- **Como foi provado que nada mudou:**
  - **HTML:** com cada componente expandido de volta no lugar da tag, a tela fica **idêntica** à original, linha a linha, nas 4 telas. No `SelecaoFornecedor` só houve renomeação de variável (`provider` → `providerOption`, `form.provider` → prop `provider`).
  - **Script:** cada função ou tipo foi removido da página **só se o texto for igual** ao do módulo. A comparação foi automática, uma por uma: 18 + 14 na conciliação, 19 + 7 no roteiro, mais `formatDateBR` e `WizardForm`.
  - **Reatividade:** os dados editados nos componentes filhos usam `bind:` (`recibos`, `pagamentos`, `venda`, os textos colados na importação de voucher). As funções continuam na página e são passadas como props.
- **Correções no que o outro agente deixou:**
  - Em `importacao-dias.ts`, a expressão que remove acentos estava gravada com caracteres invisíveis literais. Voltou para `/[\u0300-\u036f]/`, como no original. O efeito era o mesmo, mas a forma literal é frágil.
  - Em `conciliacao/_components/types.ts`, havia 2 tipos que **não existiam** na tela (`ImportDiferenca`, `VisaoGeralRow`). Foram removidos.
  - Os componentes de voucher e roteiro e os formatadores da conciliação estavam criados, mas não eram usados pelas telas. Agora são.
- **Testes novos:**
  - `conciliacao/_components/formatters.test.ts` (6);
  - `roteiros/[id]/_components/importacao-dias.test.ts` (5).
- **Verificação:**
  - 653 testes passando;
  - `svelte-check` com 0 erros e 0 avisos;
  - build OK.
- **2ª rodada (25/09): abas e janelas.**

| Tela | Antes | Depois | Componentes novos |
|---|---|---|---|
| `financeiro/conciliacao` | 2809 | 2526 | `AbaRegistros`, `AbaAlteracoes`, `AbaExecucoes` (tabelas só de leitura) e `JanelaAuditoriaVinculos` (só `bind:open`) |
| `orcamentos/roteiros/[id]` | 2477 | 1550 | `AbaItinerario`, `AbaHoteis`, `AbaPasseios`, `AbaTransporte`, `AbaInvestimento`, `AbaPagamento` |

  - **O roteiro usa runas do Svelte 5.** As abas recebem as listas e as variáveis que alteram como `$bindable()`, e a página liga com `bind:`. Um script detectou quais variáveis cada aba altera, e o `svelte-check` validou os tipos.
  - **Prova do HTML:** expandindo as tags, as duas telas ficam idênticas às originais. No script, só entraram os imports.
  - **Prova de execução**, feita com `jsdom` instalado só na cópia da nuvem, sem mudar o `package.json`: montei a aba dentro de uma página de teste com `bind:`, cliquei nos botões e digitei nos campos.
    - Adicionar, editar, trocar a opção, mover e remover alteram a lista da página.
    - As variáveis simples também voltam para a página, por exemplo `showDiasImport` e as mensagens.
    - **Contraprova:** sem o `bind:` o teste falha, então ele detecta o erro.
  - **Deixados de propósito na página da conciliação:**
    - a janela de **diferenças na importação**: os botões mudam duas variáveis e na mesma linha chamam `importPreviewRows()`, que lê uma delas. Separar arriscaria a ordem, numa tela de dinheiro;
    - a janela de **detalhes**, com 18 `bind:` de valores financeiros;
    - a aba **Visão geral**, com 8 filtros com `bind:`;
    - a aba **Importação**.
  - **Verificação:** 653 testes passando, `svelte-check` com 0 erros e 0 avisos, build OK.
- **Resultado da 3.5:**

| Tela | Original | Agora |
|---|---|---|
| `financeiro/conciliacao` | 3113 | 2526 |
| `orcamentos/roteiros/[id]` | 2764 | 1550 |
| `operacao/vouchers/novo` | 1605 | 1442 |
| `vendas/[id]/editar` | 1388 | 1065 |

**Filtros que não recarregavam e dashboard de julho (25/09).**
- **Sintoma:** em Relatórios de vendas, escolher fevereiro continuava mostrando setembro, tanto nos KPIs quanto na lista.
  - Nos logs do banco, o relatório só pediu setembro (`data_venda` entre 2026-09-01 e 2026-09-25): a busca de fevereiro nunca saiu da tela.
  - O endereço só é atualizado quando a busca termina com sucesso, e por isso continuava mostrando setembro.
- **Causa (provada com teste no jsdom):** no modo legado do Svelte, `$: autoReloadKey = buildAutoReloadKey();` só reage às variáveis escritas **na própria linha**, e não às que estão dentro da função. Trocar o mês não mudava a chave, então a recarga nunca era agendada.
  - No teste, depois de mudar o mês para 2026-02, a chave feita pela função continuou `mes|2026-09`, enquanto a escrita direto na linha virou `mes|2026-02`.
- **Correção:** a linha `$:` passou a ter a **mesma expressão** do `return` da função, copiada literalmente por script, então a chave sai idêntica. Foram 14 linhas em 13 telas:
  - `autoReloadKey` (11 telas): relatórios de vendas, produtos, destinos e clientes; cadastros de estados e cidades; follow-up (`operacao/acompanhamento`); fechamento de comissões; cálculo de comissões; ajustes de vendas; logs.
  - `clienteSelecionado` em `vendas/nova` e `vendas/[id]/editar`: as informações do cliente mostradas abaixo do campo não acompanhavam a troca de cliente. Afetava só a exibição.
  - `subdivisoesKey` em `cadastros/cidades`: a busca de subdivisões não recarregava.
  - `relatorios/ranking` (`diasRestantesNoMes`) depende só da data de hoje e ficou como está.
- **Dashboard de julho:** julho estava `ready` com **0 linhas** (montado em 01/07), então o dashboard mostrava julho vazio.
  - `isStatusReady` (`reciboContribuicoesReadModel.ts`) agora trata como **não pronto** um mês já encerrado que foi montado antes de terminar. Na próxima abertura ele é refeito uma vez, e com isso o `rebuilt_at` fica depois do fim do mês e o mês volta a valer.
  - Foi aplicada a mesma regra da rodada noturna. Teste: `readModelStatusReady.test.ts` (4 casos, incluindo o limite de meia-noite em Brasília).
- **Situação no banco às 08:30 (leitura):**
  - fevereiro a maio **refeitos às 07:45**, depois do deploy, já com a correção do `recibo_id`;
  - os tempos do PostgREST caíram para 20 a 70 ms, o que confirma que o placement em us-west-2 está ativo.
- **A cópia da nuvem estava desatualizada em `vendas/nova`:** o arquivo foi mudado no Mac e passou a usar `$lib/features/vendas/form`. A correção desse arquivo foi aplicada **direto no Mac**. Depois disso, a pasta `src` inteira ficou idêntica entre a nuvem e o Mac (conferido por hash).
- **Verificação:** 657 testes passando, `svelte-check` com 0 erros e 0 avisos, build OK.
- **Achados, não corrigidos:**
  - A RPC `check_security_rate_limit` **não existe** no banco e responde 404. O limite de tentativas cai para o contador em memória, que ainda protege, mas separado por instância do Worker.
  - A tabela `companies` **não tem** a coluna `logo_url`, que é lida em `crm/library.ts`, `clientes/templates-send.ts` e `parametros/empresa.ts` e responde 400. É preciso conferir no vtur-app de onde vem o logo.

**Plano (próximas etapas):**
- ~~3.2 Kit `ui`~~ (feito). Pendentes do kit, para depois:
  - o `Dialog` (Flowbite `Modal`) não liga o título ao `role="dialog"`, porque o Flowbite não repassa atributos para esse elemento;
  - contraste no modo escuro;
  - padronizar os estados de carregando, vazio e erro.
- ~~3.3 Navegação~~ (feito, ver acima).
- ~~3.4 Velocidade~~ (feito, ver acima). Plano original: com o header `server-timing`, medir a API de cada tela e atacar as mais lentas (cache, chamadas em paralelo), sem mudar os resultados. Prova com testes de contrato.
- ~~3.5 Telas gigantes~~ (1ª rodada feita, ver acima). Plano original: dividir em componentes, sem mudar o comportamento. As maiores são `financeiro/conciliacao` (3113 linhas), `orcamentos/roteiros/[id]` (2764), `operacao/vouchers/novo` (1605) e `vendas/[id]/editar` (1388).

## Problemas conhecidos (não corrigidos, fora do escopo atual)
- Tabela `push_subscriptions` não existe no banco (`push/subscribe` e `push/unsubscribe`).
- Auditoria em `logs` só cobre Vendas. Faltam login, Clientes, Cadastros, Parâmetros, Escalas, Admin e perfil.

### Dashboard lento ao trocar de mês (25/09)
- Causa: `syncUrl()` do `UnifiedDashboard.svelte` fazia `goto('/dashboard/geral?...')` fixo. Vendedor fica em `/dashboard/vendedor` (ou `/`), então cada troca de mês mudava de rota: o SvelteKit desmontava o dashboard, montava outro e o `onMount` refazia tudo (loadBase + summary + operacional + assinatura), além do `atualizar()` já disparado. Resultado: requisições em dobro, tela "piscando" e título trocando para "Dashboard geral".
- Correção: `goto(\`${window.location.pathname}?...\`)` mantém a rota atual. Mesma regra, mesmos parâmetros de URL. `svelte-check` 0/0.
- Pendente usuário: commit/push/`cf:deploy`.

### Dashboard travado no skeleton ao trocar de mês (25/09, 2ª correção)
- A correção anterior (goto na rota atual) piorou: sem remontagem, a tela ficava presa no skeleton.
- Causa real: `syncUrl()` usava `goto()`. O `beforeNavigate` do `src/routes/+layout.svelte` chama `abortInFlightApiReads()`, e o SvelteKit só dispara o beforeNavigate depois de um `await` interno — ou seja, depois que `atualizar()` já tinha iniciado a busca do mês. Em `api.ts`, uma leitura abortada por navegação devolve `new Promise(() => {})` (nunca resolve), então `loading` ficava `true` para sempre. Os logs do banco mostravam o RPC respondendo em ~30 ms; era o navegador que descartava a resposta.
- Correção: `replaceState()` de `$app/navigation` (roteamento raso: atualiza o endereço sem navegação, sem beforeNavigate, sem load). Aplicado no `UnifiedDashboard.svelte` e em `relatorios/ranking` (mesmo padrão: syncUrl() antes de loadRanking()).
- Verificação: `svelte-check` 0/0, 657 testes, hash Mac = container.

### 3.6 (25/09, 12:10): robustez da URL, título dos diálogos e modo escuro. Gravado no Mac, falta o commit
- **URL sem navegação (`replaceState`)**
  - **Relatórios de vendas:** a URL passou a ser atualizada sem navegar, como já foi feito no dashboard e no ranking.
  - **Bug latente evitado:** no `onMount`, `loadBase()` e `loadRelatorio()` rodam juntos. Se o relatório terminasse primeiro, o `goto()` cancelava a busca dos filtros. Essa leitura, cancelada por navegação, nunca resolvia, e empresas e vendedores ficavam "carregando" para sempre.
  - **Conferência:** agora nenhuma tela usa `goto()` para sincronizar a própria URL.
  - **Aviso:** `api.ts` devolve uma promessa que nunca resolve quando a leitura é cancelada por navegação. Toda sincronização de URL na mesma rota precisa usar `replaceState`.
- **Título dos diálogos**
  - O `Dialog` agora dá nome ao `role="dialog"`: o título vira `aria-labelledby` e a descrição vira `aria-describedby`.
  - O Modal do Flowbite 0.48 não repassa atributos para esse `<div>`. Por isso a action `dialogLabel` (`ui/dialogLabel.ts`) parte do `<h3>` e sobe até o `[role="dialog"]`.
  - **Testes:** o novo `dialogLabel.test.ts` tem 3 casos. Um teste de execução no jsdom, feito uma vez só, montou o Dialog aberto: o leitor de tela passa a anunciar "Excluir venda" e a descrição.
- **Modo escuro**
  - `tailwind.config.js` passou a usar `darkMode: 'class'`.
  - **Problema:** o app é sempre claro (ver o bloco "NEUTRALIZAR DARK MODE" em `app.css`). Com o padrão `media`, as classes `dark:` do Flowbite, do dashboard, de `relatorios/desempenho` e do roteiro ligavam quando o sistema operacional estava no modo escuro. Na tela de desempenho, isso deixava texto `slate-100` sobre o fundo branco forçado, praticamente invisível.
  - **Solução:** agora essas classes só ligariam com `.dark` no `<html>`, e o app nunca aplica essa classe.
  - **Conferência:** no CSS gerado, as classes `dark:` ficaram como `:is(.dark *)`, e só sobrou a media query de neutralização.
- **Ambiente:** a cópia da nuvem não tinha `tailwind.config.js` nem `postcss.config.js`. Os dois foram copiados do Mac.
- **Verificação:** 660 testes passando, `svelte-check` com 0 erros e 0 avisos, build OK. Os hashes do Mac e da nuvem conferem.
- **Próximos candidatos:**
  - padronizar os estados de carregando, vazio e erro;
  - medir `clientes/historico` e `vendas/complementares`.

### 3.7 (25/09, 12:25): velocidade de `clientes/historico` e `vendas/complementares`. Gravado no Mac, falta o commit
- **Medição (logs do banco, 15:03 UTC):** o histórico do cliente fazia 6 idas ao banco **em fila** depois da autenticação: vendas, passageiros, viagens, vendas do passageiro, recibos e orçamentos, e por fim cidades. Somavam cerca de 400 ms.
- **`clientes/historico`:**
  - os orçamentos começam junto com as vendas;
  - a cadeia de passageiro (passageiros, viagens, vendas) roda ao lado das vendas do titular;
  - cidades e criadores dos orçamentos saem juntos.
  - Continua igual: a mesma montagem (primeiro titular, depois passageiro), o mesmo "falha silenciosa" da cadeia de passageiro e os erros lançados na mesma ordem (`allSettled`).
- **`vendas/complementares`:** de até 7 consultas em fila para 3 rodadas:
  1. recibos e vínculos da venda;
  2. recibos vinculados;
  3. vendas vinculadas, recibos do par e vínculos do par.
  - A busca de sugestões (`q` com 2 letras ou mais) roda ao lado de tudo, só depois de a venda ser encontrada: o caminho 404 continua sem consultas extras.
- **Prova (testes de contrato novos):** `historico.contract.test.ts` (5 cenários) e `complementares.contract.test.ts` (7 cenários, incluindo 404, 400, 403, escopo de vendedor e busca).
  - Os snapshots foram gerados com o código **antigo**: mesmo status, mesmo corpo e mesmo conjunto de consultas.
  - Um teste de paralelismo exige 3 consultas abertas ao mesmo tempo.
  - **Contraprova:** o código antigo passa nos snapshots e falha no paralelismo (2 e 1 consultas abertas ao mesmo tempo).
- **Line endings:** no Mac, `historico.ts` estava com CRLF (o HEAD tem LF). Foi gravado com LF, então o diff mostra só a mudança.
- **Conferência Mac × nuvem:** a pasta `src` inteira é idêntica, ignorando CRLF. A única diferença são as fontes em `src/assets/cards/fonts`, que não existem na nuvem.
- **Verificação:** 674 testes passando, `svelte-check` com 0 erros e 0 avisos.
- **Arquivos auxiliares:** `tmp/container-src.md5` e `tmp/container-src.norm.md5` foram usados só na conferência. Podem ser apagados.

### 3.8 (25/09, 12:35): estados de carregando, vazio e erro (auditoria)
- **Resultado da auditoria:** o kit já cobre estes estados.
  - **Carregando:** o `LoadingState` é usado em 49 telas, e o `DataTable` mostra skeleton e anuncia "Carregando registros" para o leitor de tela.
  - **Vazio:** o `emptyMessage` do `DataTable` cobre as listas.
  - **Erro:** as listas principais mostram uma faixa vermelha além do toast.
  - Os "Carregando..." restantes são textos de botões ("Carregar mais", "Aplicar"). Estão certos e ficaram como estão.
- **Única correção:** `role="alert"` nas 6 faixas de erro feitas à mão, para o leitor de tela anunciar a falha. As telas são vendas, clientes, orçamentos, ranking, recados e regras financeiras. A faixa de `orcamentos/importar` usa o `AlertMessage` (Flowbite), que já tinha `role="alert"`.
- **Verificação:** `svelte-check` com 0 erros e 0 avisos. Os hashes de Mac e nuvem batem, ignorando CRLF.

### 3.9 (25/09, 12:45): pedidos aprovados pelo usuário (testes de tela, rate limit, logo)

**1. Testes de tela permanentes (jsdom)**
- **O que foi criado:**
  - `vitest.workspace.ts` com dois grupos:
    - `unit`: os testes de sempre, em Node;
    - `dom`: arquivos `*.dom.test.ts`, com jsdom e a versão "browser" do Svelte.
  - `src/lib/testing/dom/`: `setup.ts` (polyfill de `matchMedia`) e três harnesses em `harness/`.
- **Testes de tela:**
  - `roteiroAbas.dom.test.ts`: as abas Investimento e Itinerário alteram a página pelo `bind:`. Contraprova: sem o `bind:`, o teste falha.
  - `dialog.dom.test.ts`: o Dialog aberto é nomeado pelo título e pela descrição.
  - `legacyReactivity.dom.test.ts`: documenta a armadilha do `$: x = fn()`.
- **Guardas estáticas** (`src/lib/testing/guards.test.ts`, grupo `unit`):
  - Falha se algum `.svelte` voltar a ter `$: x = fn();` sem argumentos. Há duas exceções conscientes.
  - Falha se algum `.svelte` usar `goto(..., { replaceState: true })`. Nesses casos, usar `replaceState()`.
  - As duas foram testadas com contraprova.
- **Resultado:** 680 testes passando (89 arquivos), `svelte-check` com 0 erros e 0 avisos.
- **Pendência do usuário:** instalar o `jsdom` no Mac com `npm install -D jsdom@^25.0.1`, que atualiza o `package.json` e o `package-lock.json`.
  - O lock não foi gerado aqui porque o npm deste ambiente apaga os campos `libc` do lock do Mac, o que seria ruído.
  - Sem essa instalação, o grupo `dom` falha no `npm test`.

**2. RPC `check_security_rate_limit`, aplicada no banco**
- **Migração:** `supabase/migrations/20260925160000_security_rate_limit.sql`.
- **Tabela `security_rate_limits`:**
  - chave primária `(scope, key_hash)`;
  - a chave é gravada só como md5, então IP e id do usuário não ficam em texto;
  - RLS ligado e sem políticas;
  - sem acesso para `anon` e `authenticated`.
- **Função:** SECURITY DEFINER, com `search_path` fixo. Só o `service_role` pode executá-la, que é o cliente admin do servidor.
- **Regra:** a mesma do contador em memória (`rateLimit.ts`).
  - A janela é fixa e começa na primeira chamada.
  - Permite até `p_max` chamadas.
  - Depois disso responde `allowed=false` com o tempo que falta, com mínimo de 1 s.
  - Faz limpeza ocasional das janelas vencidas.
- **Teste no banco:**
  - max=2: as chamadas 1 e 2 passam, a 3 é bloqueada com 60 s, e outra chave é independente;
  - depois que a janela vence, volta a permitir;
  - as linhas de teste foram apagadas.
- **Advisor de segurança:** só aparece o aviso INFO "RLS sem política", esperado e igual ao das tabelas do read model.
- **Efeito:** o `persistentRateLimit.ts` deixa de cair no fallback. Agora o limite vale para todas as instâncias do Worker. O contador em memória continua sendo checado primeiro.

**3. Coluna `companies.logo_url`, aplicada no banco**
- **Migração:** `supabase/migrations/20260925160100_companies_logo_url.sql`.
- **Coluna:** `text`, opcional.
- **Efeito:**
  - As leituras de `parametros/empresa`, `crm/library`, `clientes/templates-send` e `cards/_render` param de receber 400 e passam a ler `null`. Mesmo resultado de antes, sem erro.
  - Quando alguém preencher o logo, ele passa a aparecer.
- **Pendente:** hoje nenhuma tela grava esse campo. A de parâmetros da empresa diz "entre em contato com o administrador". Criar um campo de edição seria função nova e depende de decisão.

### 3.10 (25/09, 13:00): auditoria na tabela `logs` além de Vendas (pendência da Fase 1). Gravado no Mac, falta o commit
- **Referência:** o histórico da própria tabela `logs`, gravado pelo sistema antigo até mai/2026. Módulo, ação e as chaves de `detalhes` foram copiados de lá.

| Módulo | Ação | Onde | `detalhes` |
|---|---|---|---|
| Clientes | `cliente_criado` | `clientes/create` | payload + `created_by` |
| Clientes | `cliente_editado` | `PATCH clientes/:id` | `{ id, payload }` |
| Clientes | `cliente_excluido` | `DELETE clientes/:id` | `{ id }` |
| Cadastros | `cidade_criada` / `cidade_editada` / `cidade_excluida` | `cidades` (POST, PATCH /:id, DELETE e DELETE /:id) | payload / `{ id, payload }` / `{ id }` |
| Parametros | `parametros_sistema_salvos` | `parametros/sistema` | payload sem `updated_at` |
| Parametros | `quote_print_settings_salvos` | `parametros/orcamentos-pdf` | campos da configuração, sem dono e empresa |
| Escalas | `escala_dia_salva` | `parametros/escalas` (`upsert_dia`) | as 13 chaves do histórico; empresa e gestor vêm do `escala_mes` |
| Escalas | `escala_dia_lote_salvo` | `parametros/escalas` (`apply_batch`) | as 12 chaves do histórico |
| Admin | `permissoes_atualizadas` | `admin/permissoes` e `admin/permissoes/:id` | `{ permissoes: { modulo: permissao }, usuario_alterado_id }` |
| Admin | `modulos_globais_atualizados` | `admin/permissoes` (global), `admin/system-modules` e `admin/modulos-sistema` | `{ disabled_modules }` |
| perfil | `perfil_atualizado` | `PATCH user/profile` | payload gravado em `users` |

- **Como funciona:** o `registrarLog` passou a aceitar `detalhes` como função assíncrona. Ela é montada em background (`waitUntil`) quando precisa ler o banco, como no caso das escalas e dos módulos globais. Assim a resposta não fica mais lenta. Se a função falhar, nada é gravado e a operação não é afetada.
- **Única mudança fora do log:** em `upsert_dia`, o insert de `escala_dia` passou a pedir `.select('id').maybeSingle()` para registrar o `escala_dia_id`. O tratamento de erro não mudou: o código já ignorava o retorno.
- **Fora desta etapa, de propósito:**
  - login e logout, `tentativa_login`, `login_falhou`, recuperação de senha e MFA (`auth_mfa`, `mfa_ativado`, `mfa_removido`). As rotas de `api/auth` não são alteradas, e a ativação e remoção do MFA acontecem no navegador (`supabase.auth.mfa`). Depende de decisão do usuário.
  - `upsert_horario_usuario` e as permissões por tipo de usuário, que não têm precedente no histórico.
- **Testes:**
  - `auditoria.contract.test.ts` (11 casos): módulo, ação e formato de cada log; erro de validação não gera log; a gravação de negócio não muda.
  - `auditLog.test.ts` ganhou 2 casos para os detalhes assíncronos.
  - `fakeSupabase` agora aceita `insert` e `delete`.
- **Verificação:** 693 testes passando, `svelte-check` com 0 erros e 0 avisos, e os hashes de Mac e nuvem batem, ignorando CRLF.
- **Arquivo auxiliar:** `tmp/audit_patch.py` foi o script que aplicou as mudanças. Pode ser apagado.

## Fase 4: design system (Tailwind 4 + Flowbite)

### 4.1 (25/09, 15:50): Tailwind 3.4 → 4.3, com o mesmo visual. Com commit
- **O que mudou:**
  - `@tailwindcss/vite` no `vite.config.ts`. O PostCSS ficou sem plugins e o `tailwind.config.js` foi removido.
  - O tema foi para o `@theme` do `app.css`: cores, fonte, sombras e raios do antigo config.
  - Os nomes de classe foram renomeados em 86 `.svelte`, pelo codemod oficial revisado à mão:
    - `shadow-sm`→`shadow-xs`, `shadow`→`shadow-sm`;
    - `rounded`→`rounded-sm`;
    - `!x`→`x!`;
    - `flex-shrink-0`→`shrink-0`;
    - `outline-none`→`outline-hidden`;
    - `rounded-[14px]`→`rounded-vtur-lg` etc.
- **Erros do codemod que foram desfeitos:**
  - Trocou a variante de botão `'outline'` por `'outline-solid'` em 10 lugares.
  - Mudou uma conta dentro de `cards/_render.ts` (`blur * 4` → `blur-sm * 4`).
  - Transformou as classes do `app.css` em `@utility`, o que muda a precedência.
- **Precedência igual à do v3:** o preflight e os utilitários foram importados **sem cascade layer**, na mesma ordem do v3 (base → componentes → `@tailwind utilities` → utilitários próprios → resto). O corpo do `app.css` é o original, só sem os `@layer`.
- **Compatibilidade com o v3, tudo no topo do `app.css`:**
  - paleta hex do v3, porque o v4 usa oklch;
  - altura de linha absoluta em `text-*`;
  - cor padrão de borda `gray-200`;
  - cor padrão de `ring`: azul 500 a 50%;
  - placeholder `gray-400`;
  - `cursor: pointer` em botões e `default` em `:disabled`;
  - fundo e opacidade padrão do navegador nos campos;
  - padding de `td`/`th` e dos campos de data;
  - `<dialog>` centralizado;
  - degradês em sRGB.
- **Como foi provado que o visual é o mesmo:**
  - Estilo computado no Chromium, comparando o CSS antigo com o novo.
  - **1.864 classes**, cada uma sozinha, e **2.034 combinações de classes** tiradas dos `class=` dos `.svelte`, em 1600 px e 375 px.
  - **DOM real de 143 telas e layouts**, renderizado no servidor, mais o Dialog e o ConfirmDialog abertos. Todos os elementos foram comparados em 1600, 800 e 375 px e com o sistema em modo escuro: box model, cores, fontes, bordas, sombras, flex/grid e a posição e o tamanho de cada elemento.
  - **Tela de login** via `vite dev` nas duas versões: 0 pixel diferente, em desktop e celular.
- **Diferenças que restaram (conscientes):**
  - `space-x/y-*` e `divide-*`: o v4 põe a margem ou a borda **depois** de cada filho, e não antes. Em fluxo normal o espaçamento é o mesmo. Muda só quando o primeiro ou o último filho está oculto, e aí some um espaço sobrando: o cabeçalho no celular fica 14 px mais justo, e a lista de usuários fica 7 px mais baixa.
  - `ml-13` em `cadastros/circuitos/novo`: não existia no v3 (a classe era ignorada) e agora recua a descrição do dia em 45 px, como o código pretendia.
  - `outline-none` → `outline-hidden`: sem contorno nos dois casos.
- **Verificação:** 693 testes passando, `svelte-check` com 0 erros e 0 avisos, build OK, e `vite dev` sobe. Mac e nuvem estão idênticos, ignorando CRLF.
- **Arquivos temporários:** `tmp/container-src*.md5` e `tmp/audit_patch.py` (entraram no commit "fase10") foram apagados.
- **Próximo (4.2):** Flowbite-Svelte 0.48 → 1.x. A 1.x exige Tailwind 4, que já está no lugar, e o `Modal`/`Dropdown` mudaram de API. A troca fica isolada nos wrappers de `lib/components/ui/`.

### 4.2 (25/09, 18:10): Flowbite-Svelte 0.48 → 1.33, com o mesmo visual e o mesmo comportamento. Com commit ("flowbite 1.33")
- **O que o 1.x muda (medido renderizando os wrappers de `ui/` nas duas versões, 142 casos):**
  - Select e Textarea ganham uma `div` em volta, e a classe `vtur-input` sai do campo;
  - Checkbox, Radio e Toggle mudam classes, cores (blue-700 no lugar de blue-600) e espaçamento;
  - Badge ganha fundo cinza nas cores que eram sem fundo (gray, dark, teal, operação); Alert muda as cores;
  - Button não repassa mais `on:click`, e teal/orange/purple mudam;
  - Modal passa a usar `<dialog>` nativo, e Dropdown e Tooltip passam a usar a Popover API (outro jeito de abrir, fechar, focar e rolar).
- **Decisão:** os componentes do 0.48 que o sistema usa foram copiados **sem alteração** para `src/lib/components/ui/flowbite-legacy/` (licença MIT, com `README.md` explicando). Só mudam os caminhos de import e um `// @ts-nocheck` no topo. Os wrappers de `ui/` trocaram só a linha do import (`'flowbite-svelte'` → `'./flowbite-legacy'`). Do pacote 1.x o sistema usa a tabela (`SimpleTable` → `flowbite-svelte/Table.svelte`, import direto para não puxar o pacote inteiro).
- **CSS idêntico, byte a byte:** antes o Tailwind lia o pacote 0.48 inteiro (`@source`), inclusive componentes que não usamos. As classes que vinham só de lá ficaram em `flowbite-legacy/tailwind-classes-0.48.txt`, lido pelo `app.css`. Resultado: os 7 arquivos `.css` do build são iguais aos de antes (mesmo hash).
- **Dependências:** `flowbite-svelte` ^1.33.1; `tailwind-merge` e `@floating-ui/dom` viraram dependências diretas (as cópias do 0.48 usam).
- **Como foi provado:**
  - os 142 casos dos wrappers renderizam o mesmo HTML (só a tabela muda um comentário de hidratação);
  - as 143 telas e layouts renderizadas no servidor: iguais, exceto um espaço em branco entre `<div>` e `<table>` na tela `admin/fix-recibos`, sem efeito visual;
  - CSS do build idêntico;
  - teste novo em `src/lib/testing/guards.test.ts`: nenhum `.svelte` importa `flowbite-svelte` pelo índice (fora a tabela).
- **Verificação:** 694 testes passando, `svelte-check` com 0 erros e 0 avisos, build OK.
- **No Mac:** rodar `npm install` (o `package-lock.json` já vem atualizado), depois `npm test` e `npm run build`.

### 4.3 (25/09, 18:40): ícones Lucide → flowbite-svelte-icons (aprovado pelo usuário). Com commit ("icones")
- **Como foi feito:** pasta nova `src/lib/icons/`, com um arquivo por ícone e os **mesmos nomes do Lucide** (`Plus`, `Trash2`, `RefreshCw`...). Nas 150 telas mudou só a linha do import (`'lucide-svelte'` → `'$lib/icons'`); o resto do código é o mesmo.
- **Mesmo tamanho e mesmo layout:** o `IconAdapter.svelte` faz o ícone do Flowbite aceitar as props do Lucide (`size` em px vira width/height, `class`, `strokeWidth`, `color`), desliga o tamanho próprio do Flowbite (w-5 h-5) e desfaz o `shrink-0` que ele acrescenta.
- **124 ícones** passaram para o desenho do Flowbite (versão contorno, "Outline"). Mapa em `src/lib/icons/*.svelte` (ex.: `Trash2`→`TrashBin`, `Save`→`FloppyDisk`, `Users`→`UsersGroup`, `Settings`→`Cog`, `X`→`Close`).
- **19 ícones continuam com o desenho do Lucide**, porque o Flowbite não tem equivalente: AlertTriangle, ArrowDownRight, ArrowUpRight, Calculator, Eraser, FileClock, ImagePlus, Loader2 (o que gira no "carregando"), Map, Package, Plane, PlugZap, Route, ShieldAlert, Ship, SquareCheckBig, Target, Trophy, UserCheck. O pacote `lucide-svelte` continua no `package.json` por causa deles.
- **Como foi provado:**
  - folha de comparação com os 143 ícones lado a lado (Lucide × Flowbite), conferida um a um;
  - as 143 telas e layouts renderizadas no servidor: os 1.283 `<svg>` têm a mesma largura, altura e classes de antes, e o resto do HTML é idêntico;
  - CSS: só entrou a classe `.shrink` (flex-shrink: 1, o valor padrão);
  - teste novo em `guards.test.ts`: nenhum arquivo fora de `src/lib/icons/` importa `lucide-svelte`.
- **Diferença visível (esperada):** os desenhos do Flowbite têm mais margem interna, então parecem um pouco menores dentro da mesma caixa (ex.: no menu lateral). O espaço ocupado é o mesmo.
- **Verificação:** 695 testes passando, `svelte-check` com 0 erros e 0 avisos, build OK.

## Fase 5: UX e navegação (sem mudar regra de negócio)

Plano (da revisão estrutural): Ctrl+K, dashboards por perfil, placar, cards no celular, menu inferior no celular, ficha 360° do cliente, acessibilidade.
- Já existem no sistema: dashboards por perfil (`/dashboard/admin|master|gestor|financeiro|vendedor`), menu inferior no celular (Sidebar) e tabelas em cartões no celular (`table-mobile-cards`).
- Placar e ficha completa do cliente: aprovados pelo usuário em 25/09 (5.3 e 5.4).

### 5.1 (25/09, 19:00): busca rápida no menu (Ctrl+K / ⌘K). Com commit ("fase11")
- **O que é:** botão "Buscar" no topo (no celular, só a lupa) e o atalho Ctrl+K (⌘K no Mac). Abre uma janela com as telas do menu; digitar filtra (sem acento, por nome ou seção); ↑/↓ escolhem, Enter abre, Esc fecha.
- **Sem regra nova:** mostra **exatamente o que o menu lateral mostra** para o usuário. O `Sidebar` publica os itens já filtrados (permissões, papel, "Personalizar Menu") no store `$lib/stores/navegacao.ts`; a busca só lê. Não chama API.
- **Acessibilidade:** padrão combobox + listbox (`aria-activedescendant`, `aria-selected`), foco no campo ao abrir, foco devolvido ao fechar; com outra janela aberta o atalho não abre uma segunda por cima.
- **Arquivos:** `layout/CommandPalette.svelte`, `layout/commandPalette.ts` (+ teste), `stores/navegacao.ts`, `testing/dom/commandPalette.dom.test.ts`; `Sidebar.svelte` (publica os itens, 1 bloco) e `Topbar.svelte` (botão).
- **Prova:** 704 testes (9 novos: filtro, atalho, abrir/filtrar/↓/Enter/Esc no jsdom), `svelte-check` 0/0, build OK. As 143 telas renderizadas no servidor só mudam no topo (o botão novo).

### 5.2 (25/09, 19:30): acessibilidade das tabelas (DataTable) e varredura de acessibilidade. Com commit ("fase14")
- **DataTable** (usada em ~50 telas), sem mudar dados, ordem, filtros ou visual:
  - nome da tabela para leitor de tela (`<caption class="sr-only">` com o título) e `aria-busy` enquanto carrega;
  - campo de busca com rótulo ("Buscar em <título>", invisível);
  - botão "Filtros" com `aria-expanded`/`aria-controls` apontando para o painel; no celular, `aria-haspopup`;
  - linha clicável com contorno de foco visível ao navegar por teclado (Enter/Espaço já abriam);
  - aviso falado de "N registros encontrados" ao buscar/filtrar e da página atual ao paginar.
- **Varredura automática (axe-core, WCAG 2 A/AA)** nas 143 telas renderizadas no servidor com o CSS real: de 56 problemas para **0**.
  - nomes que faltavam: botões das seções do menu lateral (menu recolhido), botões só com ícone (remover destino/dia em circuitos, mês anterior/próximo em Minha Escala), radios (`aria-label` com o texto da opção no `FieldRadioGroup`), seletores e chaves sem rótulo (novas props `ariaLabel` em `FieldSelect` e `FieldToggle`, usadas em circuitos e em notificações);
  - contraste: textos pequenos em cinza muito claro (`slate-400`/`slate-300` → `slate-500`), laranja/âmbar pequenos (`-600` → `-700`) e o prefixo/sufixo dos campos (ex.: "R$"). Só a cor do texto muda, um tom mais escuro.
  - Limite: a varredura vê o que a tela mostra sem dados (renderização no servidor). Conteúdo que só aparece com dados carregados não entrou.
- **Comparação de pixels** (antes × depois, 147 telas): mudaram só as telas com as cores acima, o botão "Placar" no ranking e os esqueletos animados de carregamento (a animação varia entre fotos).

### 5.3 (25/09, 19:30): Placar de vendas da equipe (tela nova, aprovada). Com commit ("fase14")
- **Onde:** `/relatorios/ranking/placar` (botão "Placar" no Ranking de vendas). Mesmo módulo de permissão do Ranking (a rota começa com `/relatorios/ranking`).
- **Quem vê:** o mesmo público do pódio do Ranking (admin do sistema, master e gestor). Vendedor vê um aviso com link para o ranking.
- **Sem regra nova:** usa a mesma API (`/api/v1/relatorios/ranking`), a mesma ordem (`posicao`), o mesmo percentual (`alcance_meta` e total/meta do resumo) e as mesmas cores de atingimento. As funções de cor/percentual saíram do Ranking para `$lib/features/ranking/atingimento.ts` sem alteração (com teste), e as duas telas usam o mesmo código.
- **O que mostra:** totais da equipe (vendas e seguro com barra de meta, vendas no mês, quantos bateram a meta), pódio dos 3 primeiros e a lista da equipe com barra de meta e tendência.
- **Uso em TV:** botão "Tela cheia" (só o placar), atualização sozinha a cada minuto enquanto a aba está visível, e "Atualizar" manual (busca sem cache).

### 5.4 (25/09, 19:30): ficha completa do cliente (aprovada). Com commit ("fase14")
- A tela do cliente (`/clientes/[id]`) já reunia cadastro, vendas, orçamentos e acompanhantes. Entraram:
  - **Viagens** do cliente (API existente `/api/v1/viagens/cliente/:id`, mesmo escopo e mesmo status da tela de Viagens), com link para cada viagem. Quem não tem o módulo Viagens não vê o quadro (e a tela não vai para "acesso negado": `redirectOnForbidden: false`).
  - **Contatos enviados**: últimos avisos (API existente `/api/v1/clientes/avisos/history`), recarregados depois de enviar um aviso pela própria ficha.
  - **Atalhos de contato** no resumo: WhatsApp, Ligar e E-mail (só abrem o app; nada é gravado).
- Arquivos novos: `components/clientes/ClienteViagensCard.svelte` e `ClienteContatosCard.svelte`.

### Verificação 5.2–5.4
- 719 testes (15 novos: DataTable, Placar, ficha do cliente, atingimento), `svelte-check` 0/0, build OK.
- Achado durante os testes: qualquer resposta 403 de uma API manda a tela para "/negado" (regra existente do `apiFetch`); por isso os quadros novos da ficha pedem `redirectOnForbidden: false`.

### 4.4 (25/09, 20:00): `!important` — decisão: não remover agora
- Medido: 319 `!important` no `app.css` e 504 classes com `!` nos `.svelte`. Cada um existe para vencer outra regra (Flowbite, utilitários ou o próprio CSS do sistema).
- Remover exigiria reescrever a precedência do CSS tela a tela, com risco alto de mudança visual e nenhum ganho para o usuário. Fica como está; dá para limpar aos poucos quando cada tela for mexida por outro motivo.

### 5.5 (25/09, 20:00): revisão das consultas que mandavam para "/negado". Com commit ("fase15")
- Regra existente (mantida): um 403 de qualquer API leva a tela para `/negado`, a não ser que a chamada peça `redirectOnForbidden: false`.
- Revisadas todas as telas: chamadas de API de outro módulo que são **opcionais** na tela. Encontrados e corrigidos (agora só ficam vazios, sem mandar para `/negado`):
  - **Roteiro (`orcamentos/roteiros/[id]`)**: sugestões e dados do PDF (`/parametros/orcamentos-pdf`, que exige o módulo Parâmetros). Quem tinha acesso a Roteiros mas não a Parâmetros era mandado para `/negado` ao abrir um roteiro, mesmo com a tela já protegida.
  - **Novo orçamento / editar orçamento**: busca de cliente (opcional, exige o módulo Clientes).
  - **Roteiro**: busca de cliente para gerar orçamento.
- Guarda nova em `guards.test.ts`: chamada de API com `.catch(...)` (opcional) sem `redirectOnForbidden: false` falha o teste.
- Não mudou: telas cuja consulta principal é de outro módulo (ex.: Aniversariantes usa a API do dashboard). Aí a tela depende dela; o comportamento continua o mesmo.

## Fase 6: tempo real

### 6.1 (25/09, 20:00): recados em tempo real. Com commit ("fase15")
- Recado novo, alterado ou apagado aparece na hora na tela de Recados, via Supabase Realtime (`mural_recados`, filtrado pela empresa). A tabela já estava publicada no Realtime; o RLS de leitura já limita cada usuário ao que ele pode ver.
- O aviso do Realtime só dispara uma nova busca na mesma API do mural (`/api/v1/mural/recados`, sem o cache curto). Nenhuma regra nova.
- A atualização a cada 15 s **continua igual** (reserva se o Realtime não conectar, e para as confirmações de leitura).
- Arquivos: `src/lib/realtime/muralRecados.ts` (+ teste) e `operacao/recados/+page.svelte`.
- Como conferir: abrir Recados em dois navegadores com usuários da mesma empresa e enviar um recado; deve aparecer no outro em ~1 s.

### Verificação 5.5 e 6.1
- 722 testes, `svelte-check` 0/0, build OK.

## Relatório de Performance por agência (pedido em 25/09). Gravado no Mac, falta o commit
- **Onde:** `/relatorios/performance` (cartão "Performance da agência" em Relatórios). Botão **Baixar PDF**: abre a impressão do navegador já montada em 1 folha A4 (Salvar como PDF).
- **Quem vê:** admin do sistema e master escolhem a empresa (só as do seu escopo); gestor vê a própria. Vendedor não vê (a API responde 403 e a tela nem chama).
- **API:** `GET /api/v1/relatorios/performance?company_id=&mes=AAAA-MM`. Agregação em `src/lib/server/performance/performance.ts` (testada); busca em `src/lib/server/api/routes/relatorios/performance.ts` (teste de contrato com banco falso).
- **Definições (confirmadas pelo usuário em 25/09):**
  - Venda: mesmas contribuições por recibo do Ranking/Dashboard (valor bruto); ICM e gap na mesma base de meta do Ranking (parâmetros de comissão da empresa).
  - Dados até D-1 (ontem); mês passado vai até o último dia. Comparação com o mesmo período do ano anterior.
  - Meta: soma das metas dos vendedores da equipe (mesma lista do Ranking). Meta até D-1 = proporcional aos **dias corridos**.
  - **Venda RA = REXTUR** (recibo "REXTUR"). **Business Consolidadora = REXTUR**; Marítimo = produto do tipo Cruzeiro; **Nacional = destino em cidade do Brasil**, Internacional = fora do Brasil (cidade → estado → país).
  - Produto = **tipo do produto do cadastro** (o mesmo das vendas).
  - Passageiros = os passageiros da venda (vêm na importação), sem repetir a mesma pessoa na mesma venda. Faixa etária pela data de nascimento no dia do corte.
  - Formas de pagamento: `vendas_pagamentos` das vendas do mês (Top 5 por valor).
  - Antecipação: % da venda por mês de embarque (ano atual / próximo ano).
- **Hoje no banco:** só 6 orçamentos importados. A parte de Orçamentos vai ganhar volume conforme os PDFs forem importados.
- **Verificação:** 734 testes (12 novos: regras, contrato da API, tela), `svelte-check` 0/0, build OK. Layout conferido em 1440 px, celular (390 px, sem rolagem lateral) e no PDF (1 folha A4).
