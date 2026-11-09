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

- [ ] Proteger vínculos por registro em dias, hotéis e passeios: a comparação
      atual por contagem não detecta trocas de identidades que preservam as
      quantidades. Definir IDs estáveis e tratar registros legados, inclusões,
      exclusões, duplicação, reordenação e salvamentos consecutivos.
- [x] Preparar transição local dos grupos de opcionais legados: IDs temporários
      são derivados do roteiro e da revisão na leitura e no salvamento; o editor
      os persiste e o servidor detecta trocas mesmo na primeira gravação.
      A validação remota e de ponta a ponta permanece pendente.
- [ ] Validar todos os caminhos de leitura e gravação de roteiro, inclusive
      importações, salvamento simplificado, clientes antigos e concorrência.
      Confirmações fornecidas pela API não comprovam interação humana.
- [ ] Integrar os campos operacionais restantes, incluindo orçamentos,
      consultoria, viagens, vouchers, preferências e relatórios, conforme o uso de
      cada módulo. Preservar dados existentes e permissões.
- [ ] Concluir o fluxo utilizável de destinos personalizados e a estratégia
      para referências GeoNames removidas ou alteradas, atualização incremental,
      atribuição e tratamento de regiões ausentes.
- [ ] Conferir migrações, binding, ambiente e plano de recuperação; validar
      localmente e depois em ambiente remoto isolado com dados representativos.
- [ ] Revalidar preços, consumo agregado e custo da carga mundial antes de
      executá-la. O teto autorizado por ciclo é US$ 20 no total, incluindo os
      US$ 5 do plano Workers Paid; alertas não constituem limite rígido.
- [ ] Carregar e validar a base mundial remota, medir consultas e custos,
      conferir contagens, integridade e cobertura, sem considerar a amostra como
      validação mundial.
- [ ] Executar testes autenticados de ponta a ponta e regressões dos módulos,
      inclusive dados legados e cenários de falha e concorrência.
- [ ] Somente após cumprir os itens acima, aplicar migrações e configuração
      necessários, ativar as flags, publicar e verificar a versão publicada.

## Última validação local (9 de novembro de 2026)

- Exclusão de roteiros: revisão e escopo verificados; rotas testadas também com
  revisão desligada em banco anterior à migração.
- Salvamento versionado: dias com conteúdo idêntico são preservados; o modo
  legado mantém a deduplicação anterior.
- Grupos de opcionais: a leitura versionada fornece IDs determinísticos também
  aos grupos legados, sem gravar; a comparação detecta trocas na primeira edição,
  e reordenações preservam os IDs. Dias, hotéis e passeios ainda não têm essa
  proteção individual.
- Na transição dos grupos legados, passaram 93 testes direcionados, a checagem
  de tipos, o lint e o build Cloudflare; o inventário de APIs também foi
  atualizado e conferido. Esses resultados não validam a carga nem o ambiente
  remoto.
