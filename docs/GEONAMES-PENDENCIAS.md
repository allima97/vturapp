# Integração GeoNames: acompanhamento

Este arquivo registra o trabalho pendente para ativar a integração e publicar.
Atualize-o a cada etapa, distinguindo validação local de alterações remotas.

## Situação

- As flags geográficas ficam desligadas na produção e no build padrão. O
  script `npm run cf:deploy:staging` compila com `PUBLIC_DEPLOY_ENV=staging` e
  `PUBLIC_GEONAMES_ATIVO=1`, o que liga catálogo, roteiro, revisão, vendas,
  produtos, fornecedores e módulos operacionais só nesse build.
- Em 9 de novembro de 2026 a base mundial foi carregada no D1 isolado
  `vturapp-geonames-isolado` (`bf40654b-8083-4fa1-8424-a923282d9888`). Esse
  mesmo banco agora também é o `GEO_DB` de `[env.staging]`, só para leitura.
  O banco do aplicativo em staging continua `vturapp-db-staging`. Produção
  continua sem `GEO_DB`.
- As migrações `0000` a `0024` foram aplicadas somente em
  `vturapp-db-geo-isolado` (`4f480221-b5e7-4639-9e28-d995b9615f7f`). Staging
  ainda está em `0015`. O roteiro para aplicar `0016`–`0024` e publicar o
  Worker de staging está em `docs/GEONAMES-STAGING.md`. Não foram aplicadas
  em produção.
- Não houve publicação desta integração.
- Endereços de clientes, perfil e empresas preenchidos por CEP estão fora do
  escopo e devem permanecer intactos.

## Pendências antes da ativação

- [x] Proteger vínculos por registro em dias, hotéis e passeios. O id da linha
      é a identidade estável: a leitura o devolve, o editor o reenvia e o
      salvamento versionado o preserva. Troca de cidade no mesmo registro pede
      confirmação mesmo quando as quantidades não mudam. Inclusão, exclusão,
      reordenação e salvamentos consecutivos foram validados localmente.
      Registros sem id, como clientes antigos e a primeira gravação antes da
      leitura, recebem um id determinístico pela posição (roteiro, revisão,
      coleção e índice), só para a comparação e sem gravar esse id. Reordenar
      um payload sem ids pede confirmação, porque a posição é a única
      identidade disponível. A duplicação gera ids novos para não colidir com
      a chave primária. A validação remota e de ponta a ponta permanece pendente.
- [x] Preparar transição local dos grupos de opcionais legados: IDs temporários
      são derivados do roteiro e da revisão na leitura e no salvamento; o editor
      os persiste e o servidor detecta trocas mesmo na primeira gravação.
      A validação remota e de ponta a ponta permanece pendente.
- [ ] Validar todos os caminhos de leitura e gravação de roteiro no ambiente
      remoto e com interação humana. Localmente, o salvamento completo e o
      simplificado preservam ids e a revisão continua a impedir a gravação
      concorrente. Importar dias substitui a lista e, no editor, recebe ids
      novos; importar hotéis e passeios acrescenta registros sem reutilizar os
      ids anteriores. Confirmações fornecidas pela API não comprovam interação
      humana.
- [x] Integrar localmente orçamentos, consultoria, viagens, vouchers,
      preferências e relatórios sob `modulosOperacionaisGeograficosAtivos`,
      que permanece desligada. Com a flag apagada, o texto e o `cidade_id`
      internos seguem iguais e um id geográfico enviado é recusado. Endereços
      por CEP não foram alterados. A ativação remota continua pendente.
- [x] Não reatribuir referências em massa. A atualização incremental só grava
      diferenças em `destinos_revisao_geonames`, com status pendente, e é
      idempotente. O nome personalizado e a referência original permanecem.
      A aplicação remota dessa revisão continua por fazer.
- [x] Executar o runbook do ambiente isolado em `docs/GEONAMES-AMBIENTE-ISOLADO.md`.
      Em 9 de novembro de 2026 as migrações `0000`–`0024` e a carga mundial
      foram aplicadas só em `[env.geo]`. Staging e produção não foram usados.
- [x] Revalidar preços e executar a carga isolada. `cost.py` confirmou 47.775.724
      escritas, 1,662 GB, US$ 5,00 e US$ 12,33 com margem. A carga coube no teto.
      Uma segunda carga completa no mesmo mês não cabe. O teto inclui os US$ 5
      do Workers Paid; alertas não constituem limite rígido.
- [x] Carregar e validar a base mundial no D1 isolado. As contagens remotas
      coincidiram com o SQLite. Três lugares sem país são entidades históricas
      do GeoNames (URSS, Gallia Belgica e Império Acádio), não perda de dados.
      O benchmark mediu 16, 5.369 e 1 linhas lidas. Isso não ativa produção.
- [ ] Executar testes autenticados de ponta a ponta e regressões dos módulos,
      inclusive dados legados e cenários de falha e concorrência.
- [ ] Validar em staging com o roteiro `docs/GEONAMES-STAGING.md`: migrar
      `vturapp-db-staging` de `0015` até `0024`, conferir as chaves estrangeiras,
      publicar com `npm run cf:deploy:staging` e percorrer roteiro, venda,
      produto, fornecedor, orçamento, voucher e endereços por CEP. A preparação
      está no repositório; a execução no Mac ainda não foi feita.
- [ ] Somente depois da validação em staging, aplicar migrações e configuração
      em produção, ativar as flags, publicar e verificar a versão publicada.
      Produção continua sem `GEO_DB` e com as flags desligadas.

## Última validação local (9 de novembro de 2026, continuação)

- Vínculos de dias, hotéis e passeios: a troca que preserva quantidades pede
  confirmação na primeira gravação, tanto com o id lido do banco quanto com a
  posição dos registros legados. Reordenação com id, inclusão, exclusão,
  duplicação, id inválido, id duplicado, id de outro roteiro e dois
  salvamentos consecutivos foram exercitados nos testes do Worker e do editor.
  Isso não valida o ambiente remoto nem a interação humana de confirmação.
- Destinos personalizados: a busca não falha mais quando uma referência visível
  foi removida; a resolução e a persistência conservam o id personalizado e um
  rótulo que declara a referência indisponível. A alteração de nome no GeoNames
  de teste atualiza o rótulo sem trocar o id.
- A carga isolada de 9 de novembro de 2026 está registrada em
  `docs/GEONAMES-AMBIENTE-ISOLADO.md`. `size_after` = 1.647.247.360 bytes.
  Flags e produção seguem intocados.
- A preparação de staging (binding `GEO_DB` só leitura, flags só no build de
  staging e roteiro `docs/GEONAMES-STAGING.md`) foi conferida localmente com
  1473 testes, tipos, lint e build Cloudflare. Staging e produção não foram
  migrados nem publicados daqui.

## Validação local anterior (9 de novembro de 2026)

- Exclusão de roteiros: revisão e escopo verificados; rotas testadas também com
  revisão desligada em banco anterior à migração.
- Salvamento versionado: dias com conteúdo idêntico são preservados; o modo
  legado mantém a deduplicação anterior.
- Grupos de opcionais: a leitura versionada fornece IDs determinísticos também
  aos grupos legados, sem gravar; a comparação detecta trocas na primeira edição,
  e reordenações preservam os IDs. Dias, hotéis e passeios ainda não tinham essa
  proteção individual nesta validação.
- Na transição dos grupos legados, passaram 93 testes direcionados, a checagem
  de tipos, o lint e o build Cloudflare; o inventário de APIs também foi
  atualizado e conferido. Esses resultados não validam a carga nem o ambiente
  remoto.
