# Ambiente isolado GeoNames

Este runbook prepara um Worker e dois bancos D1 que não são staging nem produção.
Ele não liga flags e não publica o aplicativo `vturapp`.

Os ids de produção (`36d3da2e-b186-48f8-bb3e-4f9a14b20235`) e de staging
(`96c13e55-60e3-4e3b-9ecc-b22da019c010`) são recusados pelo script. Em 9 de
novembro de 2026 os bancos isolados ficaram com estes ids:

- `vturapp-db-geo-isolado`, binding `DB`: `4f480221-b5e7-4639-9e28-d995b9615f7f`
- `vturapp-geonames-isolado`, binding `GEO_DB`: `bf40654b-8083-4fa1-8424-a923282d9888`

Staging e a raiz de produção também apontam o binding `GEO_DB` para esse
mesmo banco, somente para leitura. O script continua recusando `--env staging`
e `--env production`.
A validação do aplicativo em staging está em `docs/GEONAMES-STAGING.md`.

`[env.geo]` não declara KV nem R2. O aviso do Wrangler é esperado: os bindings
do topo do arquivo não são herdados, e este ambiente não deve receber os
namespaces ou buckets de staging e produção. A carga e as consultas usam só D1.
Não faça deploy deste ambiente.

Execute na raiz do repositório, com o Wrangler já autenticado. Cada passo pode
ser repetido.

## 1. Conferir o custo antes de carregar

```bash
python3 scripts/geonames/prepare.py \
  --places allCountries.zip \
  --names alternateNamesV2.zip \
  --output geonames.sqlite
python3 scripts/geonames/cost.py --source geonames.sqlite
```

A base preparada em 9 de novembro de 2026, pelos scripts `prepare.py` e
`export_d1.py`, tem 5.778.732 lugares, 9.992.084 nomes alternativos, 10.848.670
nomes de busca e 2.692.711 prefixos curtos. São 29.312.203 comandos SQL em 78
arquivos de até 32 MiB (2,41 GB). Cada linha escrita na tabela conta uma vez, e
cada índice secundário conta outra
([preços do D1](https://developers.cloudflare.com/d1/platform/pricing/)):
47.775.724 escritas. Isso fica dentro das 50 milhões incluídas no plano. O
arquivo SQLite ocupa 1,662 GB, dentro dos 5 GB incluídos. Dois milhões de
leituras de validação também ficam dentro dos 25 bilhões incluídos. O plano
Workers Paid custa US$ 5
([preços do Workers](https://developers.cloudflare.com/workers/platform/pricing/)).
O ciclo fica em US$ 5,00. Uma margem de 20% nas escritas chega a 57,3 milhões,
US$ 7,33 acima da franquia, e o total passa a US$ 12,33. Os dois valores cabem
nos US$ 20. Não repita a carga completa no mesmo mês: as escritas não são
estornadas. Se `cabe_no_teto` vier falso ao recalcular, pare.

## 2. Criar os bancos isolados

```bash
bash scripts/geonames/isolated.sh create
```

O comando cria `vturapp-db-geo-isolado` e `vturapp-geonames-isolado` se ainda
não existirem. Os ids criados em 9 de novembro de 2026 já estão em
`[env.geo]`. Não altere `[env.staging]` nem `[env.production]`.

## 3. Aplicar as migrações no banco isolado do aplicativo

```bash
bash scripts/geonames/isolated.sh migrate
```

Isso executa `wrangler d1 migrations apply vturapp-db-geo-isolado --remote --env geo`.
Um banco novo recebe toda a cadeia local, portanto as migrações `0019` a `0023`
entram junto com a `0024`. O comando é idempotente. Ele não aponta para os
bancos de staging ou produção.

## 4. Exportar e carregar a base mundial, com retomada

```bash
python3 scripts/geonames/export_d1.py --source geonames.sqlite --output geonames-sql
GEO_SQL_DIR="$PWD/geonames-sql" bash scripts/geonames/isolated.sh load
```

O carregamento confere o SHA-256 de cada arquivo e grava o nome em
`.geonames-isolated-ledger` somente depois que o `wrangler d1 execute` termina.
Rodar de novo pula os arquivos já lançados. Uma falha no meio deixa o banco
parcial; o próximo `load` continua do arquivo seguinte, sem reenviar os
anteriores.

## 5. Conferir contagens, integridade e cobertura

```bash
bash scripts/geonames/isolated.sh verify
bash scripts/geonames/isolated.sh benchmark
```

Cada contagem é uma consulta separada. Entre elas há pausa de 20 segundos.
Se o D1 responder `overloaded` ou `7429`, a consulta espera e tenta de novo,
com espera de 10, 20, 40 e 80 segundos, até cinco vezes. Uma varredura lê cerca
de 29 milhões de linhas; não junte as quatro contagens num único `UNION`.

`lugares_sem_pais` esperado é 3, não zero. O GeoNames deixa o país vazio em
entidades históricas que não são um país ISO atual. Na base preparada são:

| id       | nome                                | classe | código |
| -------- | ----------------------------------- | ------ | ------ |
| 8354411  | Union of Soviet Socialist Republics | A      | PCLH   |
| 8378500  | Gallia Belgica                      | A      | ADM1H  |
| 12489745 | Akkadian Empire                     | A      | ADM1H  |

`PCLH` é entidade política histórica e `ADM1H` é divisão administrativa
histórica de primeira ordem. O importador mantém `ADM*` e `PCL*`, então esses
três registros são esperados.

O benchmark devolve o `meta.rows_read` de uma busca curta, de uma busca por
prefixo longo e de uma leitura por id. Esses números medem a base remota; a
amostra dos testes locais não substitui essa conferência.

## Execução remota de 9 de novembro de 2026

Feita no Mac, somente em `[env.geo]`.

- `prepare.py`: 5.778.732 lugares e 9.992.084 nomes alternativos; 6 nomes vazios
  descartados. `cost.py`: 47.775.724 escritas, 1,662 GB, US$ 5,00 e US$ 12,33
  com margem. Cabe no teto.
- `create` e `migrate`: migrações `0000` a `0024` aplicadas em
  `vturapp-db-geo-isolado`.
- `load`: 78/78 arquivos, sem erro e sem reimportação. A primeira tentativa foi
  interrompida antes de gravar. `size_after` = 1.647.247.360 bytes.
- `verify`: place = 5.778.732, alternate_name = 9.992.084, search_name =
  10.848.670, short_search = 2.692.711. Feature class A = 543.970 e P =
  5.234.762. Lugares sem país = 3, os históricos da tabela acima. Uma contagem
  recebeu `D1 DB is overloaded [7429]` e passou ao repetir depois da pausa.
- `benchmark`: prefixo `rom` em 3,5 ms e 16 linhas lidas; busca `roma` em
  `search_name` em 51,6 ms e 5.369 linhas lidas; leitura por id em 0,2 ms e 1
  linha lida.

## 6. Atualização incremental sem reatribuição

Quando existir uma base nova preparada ao lado da anterior:

```bash
python3 scripts/geonames/incremental.py \
  --previous geonames-anterior.sqlite \
  --current geonames.sqlite \
  --destinations destinos-personalizados.json \
  --output revisao-geonames.sql \
  --detected-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

O SQL só contém `INSERT OR IGNORE` em `destinos_revisao_geonames`. O nome
personalizado e `referencia_geonames_id` permanecem. Aplique esse arquivo
apenas no banco isolado do aplicativo, nunca em produção:

```bash
wrangler d1 execute vturapp-db-geo-isolado --remote --env geo --file revisao-geonames.sql
```

Repetir o arquivo não duplica a mesma diferença. Uma diferença nova gera outra
linha de revisão manual com status `pendente`.

## Recuperação e rollback

- Falha no meio do `load`: rode `load` de novo. O ledger impede o reenvio dos
  lotes concluídos.
- Contagem divergente: não use esse `GEO_DB`. Apague só os bancos isolados e
  recomece do passo 2.
- Para apagar os dois bancos isolados, e nenhum outro:

```bash
CONFIRM_GEO_ROLLBACK=yes bash scripts/geonames/isolated.sh rollback
```

O Time Travel do D1 Paid guarda 30 dias no banco isolado
([limites](https://developers.cloudflare.com/d1/platform/limits/)). Restaurar
por Time Travel também fica restrito a esses bancos. Não há passo de publicação
nem de ativação de flag neste runbook.
