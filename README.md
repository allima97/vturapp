# VTUR Svelte

CRM de vendas para agências de viagens, com identidade VTur, desenvolvido em SvelteKit + Flowbite-Svelte.

Vendas e orçamentos são cadastrados manualmente. Esta versão não oferece importação de contratos, reservas ou orçamentos para criar vendas. A conciliação financeira de extratos permanece separada do cadastro de vendas.

## Preparação local do GeoNames

O estado e as etapas pendentes para ativação e publicação são acompanhados em
[Integração GeoNames: acompanhamento](docs/GEONAMES-PENDENCIAS.md).

O importador experimental prepara **apenas um arquivo SQLite local**; ele ainda não
altera a busca do VTUR, nem cria ou alimenta bancos D1. Baixe
[`allCountries.zip`](https://download.geonames.org/export/dump/allCountries.zip) e
[`alternateNamesV2.zip`](https://download.geonames.org/export/dump/alternateNamesV2.zip)
do GeoNames e execute com Python 3:

```bash
python3 scripts/geonames/prepare.py --places allCountries.zip --names alternateNamesV2.zip --output geonames.sqlite
python3 -m unittest discover -s scripts/geonames -p 'test_*.py'
```

O destino não pode existir. O arquivo contém localidades povoadas, países e
subdivisões administrativas, nomes alternativos e índices para busca por prefixo.
Outras entidades geográficas, links e códigos postais ou de aeroporto não são
importados. Nomes alternativos vazios são ignorados com aviso. A base local exige
vários gigabytes de espaço temporário. Os dados são
do [GeoNames](https://www.geonames.org/), licença CC BY 4.0, sem garantia de
completude ou exatidão. Não importe o arquivo para produção sem revisar custos,
modelo de atualização, conciliação de cidades e testes de integração.

Existe também um protótipo de consulta em `src/lib/server/geonames.ts`, testado
com D1 local, mas ainda não conectado às telas ou à API. Ele precisa ser avaliado
com o conjunto mundial e com D1 remoto antes de ser usado em produção.
Consultas de duas ou três letras usam uma lista pré-calculada de até 64 sugestões
por prefixo; prefixos de quatro letras muito frequentes também usam essa lista.
As demais localidades permanecem pesquisáveis pelo nome completo ou
por prefixos mais longos; a busca exata aceita filtro por país e paginação para
nomes curtos. Nomes históricos e coloquiais são preservados na base, mas não
compõem o índice de busca normal. Essas opções ainda precisam de interface para
que o usuário possa acessá-las.

A migração `0019_destinos_personalizados.sql` e a camada
`src/lib/server/destinosPersonalizados.ts` preparam registros próprios no banco
transacional, identificados por UUID e vinculados a uma localidade GeoNames.
Ainda não há tela ou uso nos roteiros; a migração não foi aplicada remotamente.
Não há chave estrangeira entre os dois bancos D1: se uma atualização remover a
localidade de referência, a resolução retorna um erro e exige tratamento explícito.
A camada experimental `src/lib/server/destinosBusca.ts` combina as duas fontes e
retorna identidades distintas com prefixos `geonames:` e `personalizado:`.
A construção dos rótulos usa consultas administrativas em lote e localiza nomes
em grupos de até 20 localidades, respeitando o limite de parâmetros do D1. Apenas
os resultados exibidos são resolvidos; a medição de desempenho remoto com a base
mundial ainda é necessária.
Há endpoints experimentais autenticados em `/api/v1/destinos-geograficos` para
busca, busca exata, consulta por ID, cadastro e criação de referência interna.
A referência (`POST /referencia`) exige permissão de escrita na área operacional,
valida o ID e reutiliza o UUID de cidade; não confia em nomes enviados pelo cliente.
Eles retornam indisponibilidade
enquanto o binding `GEO_DB` não for configurado e não substituem os fluxos atuais.
O componente experimental `src/lib/components/SeletorDestinoGeografico.svelte`
seleciona uma identidade em vez de aceitar texto livre e oferece busca exata no
GeoNames. Ele está preparado nos formulários de catálogo e importação, mas o uso
nessas telas permanece desligado em `src/lib/config/destinosGeograficos.ts`.
Não ative até integrar os consumidores de roteiro e validar a base mundial remota.
Os opcionais de roteiro já reconhecem o campo experimental `cidade_id` ao comparar
passeios por identidade. O salvamento da API ainda rejeita esse campo até que
a validação e a persistência completas estejam integradas.
A migração local `0020_identidades_destino_roteiro.sql` acrescenta colunas opcionais
para as identidades nos dias, hotéis, passeios e catálogo, preservando dados legados.
Ela deve ser aplicada antes da versão do cliente de dados que reconhece essas
colunas. Ainda não foi aplicada remotamente e não ativa o uso de identidades.
O resolvedor experimental de persistência obtém o nome e a identidade no servidor
em vez de confiar no texto enviado pelo cliente. Uma preparação para roteiros valida
os IDs de todas as abas e mantém separadas as cidades legadas. Os dois salvamentos
de roteiro estão conectados a essa preparação sob a flag `roteiroGeograficoAtivo`,
que permanece desligada; nesse estado, a validação continua rejeitando IDs.
Antes de ativá-la, conclua a proteção contra edições concorrentes e confirme as
migrações e a base remota. Quando a flag estiver ativa, os dois endpoints exigem
a versão de protocolo enviada pelo editor geográfico; clientes antigos recebem
erro 409 para recarregar a página antes de salvar. A versão não controla edições
concorrentes nem protege contra clientes que a enviem indevidamente. Sob a flag
experimental, o salvamento completo grava o roteiro e as coleções enviadas em uma
transação D1; o simplificado também usa uma transação quando recebe dias. Ambos
podem usar o controle experimental de revisão para impedir perda de edições
concorrentes. A migração local `0022_roteiro_revisao.sql` prepara um token separado
de `updated_at`; os endpoints de leitura, os dois salvamentos e suas telas usam
esse token sob `revisaoRoteiroAtiva`, que permanece desligada. Ative apenas junto
ao roteiro geográfico, após aplicar a migração e validar os demais fluxos.
Com essa flag ativa, as duas rotas de exclusão exigem a revisão apresentada na
confirmação e a conferem na própria exclusão, junto ao escopo de acesso. A
revisão vazia de roteiros antigos é transportada com um prefixo para não ser
omitida da URL. Clientes antigos sem revisão recebem conflito.
Com a revisão ativa, a leitura verifica novamente o token após carregar os filhos
e tenta novamente se houve alteração. Para evitar substituir dados omitidos pelos
limites de leitura, roteiros com mais de 100 dias, hotéis, passeios ou transportes,
ou mais de 50 investimentos ou pagamentos, são recusados para edição; os mesmos
limites são aplicados ao salvamento.
No salvamento completo versionado, dias com conteúdo idêntico são preservados
como registros distintos; sem a revisão experimental, a deduplicação legada
permanece inalterada.
Com a flag desligada, o salvamento completo continua usando várias operações e não
garante atomicidade em caso de falha: erros de exclusão são reportados, mas
operações anteriores podem já ter sido gravadas.
As leituras de roteiro e de dias disponíveis para importação incluem `cidade_id`,
e erros nas consultas dos dados do roteiro são reportados em vez de retornar abas
vazias. O editor prepara o seletor geográfico nos dias, hotéis, passeios e opcionais
sob a mesma flag desligada do salvamento. Cidades antigas permanecem editáveis pelo
cadastro legado e podem ser selecionadas novamente no GeoNames. Pendências de
seleção permanecem ao trocar de aba; falhas ao validar um ID não apagam o vínculo.
O servidor rejeita IDs enquanto a flag estiver desligada.
Com a revisão experimental ativa, a versão 2 do protocolo exige `cidade_id`
explícito em cada dia, hotel, passeio e grupo de opcionais; `null` representa
cidade legada ou campo vazio. Isso bloqueia clientes que omitem a propriedade,
Ao reduzir a quantidade de um vínculo geográfico em uma coleção, o servidor
recusa o salvamento até receber uma confirmação explícita, vinculada à revisão;
o editor apresenta os IDs e quantidades antes de repetir o pedido. Dias, hotéis
e passeios ainda são comparados por identidade e coleção: trocas que mantêm as
mesmas quantidades não são detectadas. Grupos de opcionais podem ter um
`registro_id` UUID próprio, preservado nas gravações e comparado individualmente
dentro do roteiro; reordenações não causam confirmação. Na leitura versionada,
grupos legados recebem IDs determinísticos vinculados ao roteiro e à revisão, sem
alterar o banco. O servidor usa os mesmos IDs ao comparar o salvamento; eles são
persistidos no JSON enviado pelo editor. A posição é usada apenas para distinguir
grupos sem ID no snapshot lido, nunca para associar registros depois de alterados.
O editor gera IDs para novos grupos. Mudanças concorrentes exigem nova leitura.
Confirmações fornecidas diretamente por um cliente não comprovam interação humana.
Não habilite a flag enquanto a proteção dos outros registros e os outros caminhos
de escrita não estiverem concluídos.
A migração local `0021_cidades_identidade_geografica.sql` prepara uma identidade
geográfica única e opcional no cadastro interno de cidades: vendas, recibos e
produtos ainda utilizam seus UUIDs e chaves estrangeiras existentes. A busca
geográfica experimental permite leitura para os módulos de vendas, sem conceder
permissão para cadastrar destinos personalizados. A migração e a substituição do
autocomplete de vendas ainda não foram aplicadas nem ativadas remotamente.
O resolvedor experimental `src/lib/server/cidadesIdentidade.ts` cria, somente
quando chamado, uma referência interna para um destino validado e reutiliza seu
UUID em chamadas concorrentes. Os seletores experimentais de vendas e produtos
solicitam esse vínculo explicitamente; nomes existentes não são conciliados automaticamente.
A busca experimental `/api/v1/vendas/cidades-geograficas` retorna destinos e seus
UUIDs internos já vinculados por identidade, sem gravar cidades durante a busca.
Ela também retorna, separadamente, cidades antigas não vinculadas e informa quando
há mais resultados; `offset_legadas` pagina essa lista para permitir a seleção
explícita de UUIDs usados por produtos.
O modo `exata=1` permite buscar GeoNames por nome completo, inclusive nomes de
uma letra, filtrar por código de país e paginar com `offset_geografico`.
Destinos personalizados continuam disponíveis na busca normal.
Resultados geográficos incluem uma `referencia` estruturada com localidade,
subdivisão secundária, região, país e código de país; nos destinos personalizados,
ela descreve a localidade GeoNames de referência, não o nome personalizado.
Subdivisões ausentes são `null` e o país pode usar o código quando não houver nome.
Os dados não garantem que uma subdivisão seja município oficial. Os seletores
experimentais exibem atribuição ao GeoNames e o link da licença CC BY 4.0.
Os formulários multipasso de nova venda e edição e o modal de recibo nos detalhes
possuem um seletor experimental sob `vendasGeograficasAtivas`, que permanece
desligada. Eles bloqueiam seleções pendentes, preservam-nas ao trocar de etapa e
mantêm o UUID interno de cada recibo. O formulário compartilhado de produtos e
destinos também possui um seletor sob `produtosGeograficosAtivos`, igualmente
desligada. Sua rota de busca e consulta por UUID exige acesso a Produtos, e o
vínculo de um novo destino exige permissão de escrita. Produtos antigos não são
conciliados automaticamente. Não habilite as flags antes de concluir os demais
módulos e validar a base mundial remota.
Para fornecedores, a migração experimental `0023_fornecedores_identidade_geografica.sql`
adiciona a identidade sem alterar cidade e estado legados. Sob a flag desligada
`fornecedoresGeograficosAtivos`, a API valida o destino e deriva cidade e estado
no servidor; destinos sem região não são aceitos pelo modelo atual. Edições de
clientes antigos não podem remover vínculos, e alterações concorrentes de
cidade/estado durante a requisição são verificadas na gravação. O editor envia a
identidade esperada ao alterar ou manter um vínculo para detectar edições
desatualizadas, mas isso não é uma revisão completa do cadastro nem detecta uma
troca seguida do retorno à identidade anterior. A remoção de vínculo para texto
livre ainda não é suportada: uma identidade pode ser substituída por outra.
O formulário experimental permite preservar cidade legada ou substituí-la por
destino geográfico e bloqueia seleções pendentes; a migração não foi aplicada
remotamente.
O catálogo experimental aceita `cidade_id` em cadastro, importação e filtro,
resolve os rótulos no servidor e distingue homônimos por identidade. A busca
legada por texto retorna apenas registros sem identidade; dados antigos não são
associados automaticamente. As telas ainda não usam esse fluxo enquanto estiver
desligado, e a edição legada de registros com identidade é bloqueada inclusive
quando o vínculo é criado concorrentemente durante a edição. No modo experimental,
o filtro distingue homônimos e oferece busca explícita de registros antigos por
texto; para editar um registro antigo é preciso selecionar o destino novamente.
As abas de opcionais e passeios consultam o catálogo por identidade quando ela
existe, sem cruzar registros antigos por texto ou localidades homônimas. Cidades
copiadas do itinerário preservam a identidade, mas o salvamento de roteiro com
IDs continua bloqueado até a ativação segura do fluxo completo.

Para preparar arquivos SQL de importação, sem enviar dados ao Cloudflare:

```bash
python3 scripts/geonames/export_d1.py --source geonames.sqlite --output geonames-sql
```

O diretório de saída deve ser novo. Os arquivos devem ser processados na ordem
indicada no `manifest.json`, que registra tamanho, SHA-256 e contagens de origem.
A exportação não é uma sincronização incremental; uma falha pode deixar o destino
remoto parcialmente preenchido. Use um banco isolado e valide-o antes de ativá-lo.

A identidade visual dos documentos é fixa: orçamentos, roteiros, circuitos, vouchers e cartões usam o logo VTur incorporado. Logos antigos de empresas, fornecedores e modelos não são utilizados nas novas emissões.

O catálogo compartilhado de passeios opcionais fica em **Cadastros → Passeios Opcionais**.
Na aba Opcionais de um roteiro, adicione as cidades do itinerário e busque os passeios
correspondentes. A busca compara o nome completo da cidade (incluindo região e país)
usado pelo seletor; cidades antigas com nomes diferentes devem ser selecionadas novamente.
Os passeios adicionados são cópias editáveis: mudanças ou exclusões no catálogo não
alteram roteiros já salvos. O acesso para gerenciar o catálogo segue as permissões de
Cadastros; a consulta também está disponível para usuários com acesso a Orçamentos.
Na aba Opcionais, cada cidade mostra a quantidade de passeios adicionados (`+`) e ainda
disponíveis no catálogo (`-`), em grupos separados. A comparação usa o nome normalizado;
alterar o nome da cópia pode fazer o original voltar a aparecer como disponível. É possível
adicionar todos os passeios de uma cidade ou das cidades do itinerário e da aba. O roteiro
permite até 100 cidades e 100 passeios por cidade; salve-o para manter as alterações.
No botão **Importar passeios opcionais**, no cabeçalho do catálogo, cole texto ou escolha
um arquivo `.md`/`.txt` em UTF-8 no modal.
Informe o título em uma linha e a descrição na próxima linha com texto, repetindo para cada passeio.
Linhas em branco são ignoradas. Confira os pares na prévia antes de importar. Para descrições
com várias linhas, também é possível
usar o formato anterior: `#### Nome do passeio` seguido de `##### Descrição`.
Importe uma cidade por vez: omita o cabeçalho de cidade e selecione-a no campo acima do texto.
A prévia permite conferir os passeios e nomes já existentes na mesma cidade são ignorados.

## Stack Tecnológica

- **Framework**: SvelteKit 2.x
- **UI Library**: Flowbite-Svelte
- **Estilização**: Tailwind CSS 3.x
- **Banco de dados**: Cloudflare D1
- **Arquivos**: Cloudflare R2
- **Autenticação**: Better Auth (sobre D1) + Cloudflare Turnstile
- **Cache Local**: IndexedDB nativo (quando necessário)
- **API**: Hono (compatibilidade com APIs existentes)
- **Deploy**: Cloudflare Workers

## Estrutura

```
src/
├── lib/
│   ├── components/     # Componentes Svelte
│   ├── stores/         # Svelte Stores
│   ├── db/             # Cliente de dados do navegador (D1 via API)
│   ├── api/            # Cliente API
│   ├── theme/          # Cores e tema
│   └── utils/          # Utilitários
├── routes/             # Rotas SvelteKit
└── app.html            # Template HTML
```

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Migração do VTUR Original

Esta é uma reescrita completa do sistema VTUR (Astro + React) para SvelteKit.
Mantém:

- Lógica de negócio (APIs Hono)
- Banco de dados relacional (agora Cloudflare D1, em vez de Supabase)
- Identidade visual (cores por módulo)
- Funcionalidades existentes

## Cores por Módulo

- **Clientes**: Azul (#2563eb)
- **Financeiro/Parâmetros**: Laranja (#f97316)
- **Vendas**: Verde (#16a34a)
