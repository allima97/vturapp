# Integração GeoNames: acompanhamento

Este arquivo registra o trabalho pendente para ativar a integração e publicar.
Atualize-o a cada etapa, distinguindo validação local de alterações remotas.

## Situação

- As flags geográficas e de revisão de roteiros estão desligadas.
- A base mundial foi preparada localmente; o D1 remoto isolado contém apenas uma
  amostra e não deve ser usado como base mundial.
- O binding `GEO_DB` não está configurado em produção. As migrações locais
  `0019` a `0023` ainda não foram aplicadas remotamente.
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
- [ ] Executar o runbook do ambiente isolado em `docs/GEONAMES-AMBIENTE-ISOLADO.md`.
      O `[env.geo]` e o script idempotente estão prontos e recusam staging e
      produção. As migrações e a carga ainda não foram aplicadas remotamente.
- [x] Revalidar preços, consumo agregado e custo da carga mundial antes de
      executá-la. A base local de 9 de novembro de 2026 cabe no teto de US$ 20
      numa única carga (US$ 5,00; US$ 12,33 com margem de 20% nas escritas).
      Uma segunda carga completa no mesmo mês não cabe. O teto inclui os US$ 5
      do Workers Paid; alertas não constituem limite rígido. A execução remota
      continua por fazer.
- [ ] Carregar e validar a base mundial remota, medir consultas e custos,
      conferir contagens, integridade e cobertura, sem considerar a amostra como
      validação mundial.
- [ ] Executar testes autenticados de ponta a ponta e regressões dos módulos,
      inclusive dados legados e cenários de falha e concorrência.
- [ ] Somente após cumprir os itens acima, aplicar migrações e configuração
      necessários, ativar as flags, publicar e verificar a versão publicada.

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
- Flags, binding remoto e carga mundial seguem intocados. O `[env.geo]` só
  declara bancos isolados com ids sentinela; ninguém executou comando remoto.
- A suíte completa passou de novo nesta etapa: 1470 testes em 186 arquivos
  (unitários, DOM e Workers), além da checagem de tipos, do lint e do build
  Cloudflare. A contagem da base foi feita no SQLite local; nenhum comando
  remoto foi executado.

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
