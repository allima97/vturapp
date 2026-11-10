# Validar GeoNames em staging

Produção continua sem `GEO_DB` e sem as flags. Staging lê o banco já carregado
`vturapp-geonames-isolado` (`bf40654b-8083-4fa1-8424-a923282d9888`) e grava só
em `vturapp-db-staging`. Não rode `scripts/geonames/isolated.sh load` de novo.

O deploy de staging precisa ser o script do `package.json`. Ele compila com
`PUBLIC_DEPLOY_ENV=staging` e `PUBLIC_GEONAMES_ATIVO=1`. Esse par liga, só nesse
build, as flags de catálogo, roteiro, revisão, vendas, produtos, fornecedores
e módulos operacionais. `npm run cf:deploy` não define as variáveis, então a
produção permanece desligada.

## 1. Migrações

Staging está em `0015`. Este comando aplica `0016` até `0024` e é idempotente:

```bash
npm run d1:migrate:staging
```

## 2. Conferir chaves estrangeiras

```bash
npx wrangler d1 execute vturapp-db-staging --remote --env staging \
  --command "PRAGMA foreign_key_check;"
```

O resultado precisa vir sem linhas. Uma lista vazia significa que as chaves
recriadas em `0016` e `0017` continuam válidas.

## 3. Publicar somente o Worker de staging

```bash
npm run cf:deploy:staging
```

Use a URL que o Wrangler imprimir. Abaixo ela aparece como `$STAGING_URL`.

## 4. Smoke tests sem sessão

Estas rotas exigem login. Sem cookie, a resposta esperada é 401.

```bash
STAGING_URL="https://SUBSTITUA-PELA-URL-DO-STAGING"
curl -s -o /dev/null -w "%{http_code}\n" \
  "$STAGING_URL/api/v1/destinos-geograficos/busca?q=roma&idioma=pt"
curl -s -o /dev/null -w "%{http_code}\n" \
  "$STAGING_URL/api/v1/destinos-geograficos/exata?q=Roma&idioma=pt&pais=IT"
curl -s -o /dev/null -w "%{http_code}\n" \
  "$STAGING_URL/api/v1/destinos-geograficos/detalhes?id=geonames:3169070&idioma=pt"
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "$STAGING_URL/api/v1/destinos-geograficos" \
  -H "content-type: application/json" -d "{}"
curl -s -o /dev/null -w "%{http_code}\n" \
  "$STAGING_URL/api/v1/vendas/cidades-geograficas?q=roma"
```

Cada linha deve imprimir `401`.

## 5. Testes manuais com login

Entre como `admin@vtur.com.br`.

- Roteiro: crie ou abra um roteiro, grave dias, hotéis e passeios com cidades
  escolhidas na lista e salve. Recarregue e confira se os mesmos destinos
  permanecem.
- Troca de cidade: inverta as cidades de dois dias que já têm identidade e
  tente salvar. A tela deve pedir confirmação. Sem confirmar, o roteiro não
  muda. Depois confirme e confira a nova ordem.
- Venda, produto, fornecedor, orçamento e voucher: abra um registro existente,
  escolha um destino geográfico onde o campo aparecer e salve. O texto antigo
  não deve sumir quando o campo geográfico ficar em branco.
- Endereços por CEP: abra um cliente, o perfil e uma empresa que já tenham
  endereço preenchido por CEP. Os campos de CEP, rua e número devem estar
  iguais aos de antes desta publicação.

## Migrações 0016 a 0024 em um banco que já tem dados

Staging está em `0015` e já tem o administrador. Nenhuma dessas migrações
apaga linhas de negócio no resultado final. Duas delas recriam tabelas:

- `0016` copia `legado_roteiro_personalizado` inteira para uma tabela
  temporária, recria a tabela com as mesmas colunas de `0015` e devolve cada
  linha. A única mudança é `opcionais` passar a ter `DEFAULT '[]'`. Um valor
  nulo vira `[]`.
- `0017` faz o mesmo com `legado_minhas_preferencias` e
  `legado_minhas_preferencias_shares`. As colunas e a ordem são as de `0015`.
  `company_id` de preferências passa a aceitar nulo; os valores existentes
  são copiados. O usuário administrador fica em `legado_users` e não entra
  nessas tabelas.

Esses dois arquivos dão `DROP` na tabela viva depois da cópia e depois dão
`DROP` na cópia, já vazia de dados exclusivos. `0016` desliga `foreign_keys`
durante a recriação e liga de novo no fim. O arquivo precisa terminar: o
`INSERT` de volta está no mesmo arquivo, antes do `DROP` da cópia.

`0018` e `0019` só criam `catalogo_opcionais` e `destinos_personalizados`.
`0020` a `0023` só acrescentam colunas anuláveis, a coluna `revisao` com
`DEFAULT ''` e índices. `0024` acrescenta colunas anuláveis de destino e a
tabela nova `destinos_revisao_geonames`. Nenhuma dessas apaga tabela com dados.

## O que não fazer

- Não rode `npm run d1:migrate:prod`.
- Não rode `npm run cf:deploy` nesta etapa.
- Não importe de novo a base GeoNames.
