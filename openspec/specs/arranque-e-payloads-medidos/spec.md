# arranque-e-payloads-medidos Specification

## Purpose
TBD - created by archiving change arranque-leve-e-payloads-enxutos. Update Purpose after archive.
## Requirements
### Requirement: O arranque nao carrega o catalogo da loja
O chunk inicial SHALL NOT conter o catalogo de cosmeticos; ele SHALL ser carregado apenas pela tela da loja.

#### Scenario: Visitante abre o hub
- **WHEN** o hub e carregado pela primeira vez
- **THEN** nenhum chunk baixado contem os ids do catalogo, e o total gzip do arranque fica abaixo de 120 KB

### Requirement: Telas abrem com payload limitado
Nenhuma tela SHALL precisar de mais de 300 KB de resposta de API para abrir; o lobby SHALL usar um resumo agregado, nao o deck inteiro.

#### Scenario: Lobby com 2.800 cartoes
- **WHEN** o usuario abre `/jogar`
- **THEN** as contagens vem de `GET /api/vocab/resumo` e a rodada de `GET /api/vocab/para-jogo`; `GET /api/vocab` nao e chamado

### Requirement: Perfil e agregado no banco e pedido uma vez por tela
`computeProfile` SHALL agregar por SQL sem carregar linhas em memoria, e cada tela SHALL pedir o perfil uma vez.

#### Scenario: Tela de vocabulario
- **WHEN** `Metrics` e aberta
- **THEN** `GET /api/metrics/profile` e chamado uma unica vez e responde em menos de 40 ms na base de referencia

### Requirement: Manutencao de boot roda uma vez
Migracoes de dados idempotentes SHALL registrar conclusao e nao varrer tabelas em boots seguintes.

#### Scenario: Segundo boot
- **WHEN** o servidor sobe depois de a migracao Leitner ja ter concluido
- **THEN** nenhuma leitura de `vocab_cards` acontece por causa dela

