## ADDED Requirements

### Requirement: O filtro escolhido e o filtro aplicado pelo servidor
Quando o cliente compoe uma rodada com um filtro facetado, o pedido ao servidor SHALL carregar o filtro inteiro, e o servidor SHALL aplica-lo com precedencia sobre `fonte`, `fonteRef` e `lang`.

#### Scenario: Recorte por baralho
- **WHEN** o usuario escolhe um baralho Anki e um idioma e pede uma rodada
- **THEN** `GET /api/vocab/para-jogo` recebe `filtro` com `fontes`, `baralhos` e `idiomas`, e cada item devolvido tem ocorrencia naquele baralho

#### Scenario: Filtro grande
- **WHEN** o filtro serializado ultrapassa o teto da query
- **THEN** o cliente envia o mesmo filtro por POST e recebe a mesma resposta
