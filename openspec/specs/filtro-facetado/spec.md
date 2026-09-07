# filtro-facetado Specification

## Purpose
TBD - created by archiving change seletor-facetado. Update Purpose after archive.
## Requirements
### Requirement: Facetas se combinam por união dentro, interseção entre
O sistema SHALL avaliar `FiltroDaPratica` com união entre membros de cada faceta (fontes, recorte
por nível) e interseção entre facetas distintas (fontes × idioma × recorte × mídia).

#### Scenario: Duas fontes marcadas
- **WHEN** o filtro marca `fontes: ['trilha', 'baralho']` sem recorte de baralho
- **THEN** o resultado é a união do acervo geral com a trilha, cobrindo os dois
- Coberto por: `tests/integration/filtro-composicao.test.ts` — "fontes:[trilha, baralho] sem baralhos — UNIÃO = acervo inteiro"

#### Scenario: Recorte contraditório
- **WHEN** `recorte.nuncaVistas` e `recorte.pedindoRevisao` estão marcados ao mesmo tempo
- **THEN** nenhum cartão passa, porque as duas exigências (vencimento nulo e vencimento passado)
  se anulam por interseção — comportamento correto, não falha
- Coberto por: `src/core/minigames/filtro.ts` (`passaRecorte`); paridade validada em
  `tests/integration/filtro-composicao.test.ts` (casos de `recorte.nuncaVistas` e
  `recorte.pedindoRevisao` isolados)

#### Scenario: Idioma interseta fontes
- **WHEN** o filtro combina `fontes` múltiplas com `idiomas: ['en']`
- **THEN** só passam cartões em inglês, independente de qual fonte os trouxe
- Coberto por: `tests/integration/filtro-composicao.test.ts` — "idiomas:[en] com todas as fontes — interseção por idioma"

### Requirement: Recorte por baralho não vaza para outros baralhos
O sistema SHALL, quando `baralhos` (a lista de decks Anki) não está vazia, incluir apenas cartões
projetados a partir de algum dos decks listados.

#### Scenario: Filtrar por um baralho específico
- **WHEN** o filtro marca `fontes: ['baralho']` e `baralhos: [deckA]`
- **THEN** só cartões do deckA aparecem, e nenhum cartão do deckB é incluído
- Coberto por: `tests/integration/filtro-composicao.test.ts` — "fontes:[baralho], baralhos:[deckA]" e "…[deckB]"

### Requirement: O filtro degrada de forma declarada quando o payload não traz a origem por baralho
O sistema SHALL detectar quando um recorte de baralho não pode ser aplicado (payload sem
`baralhosAnki`) e SHALL reportar isso em vez de esvaziar a rodada em silêncio.

#### Scenario: Payload antigo sem `baralhosAnki`
- **WHEN** `filtroAplicavel` recebe cartões sem o campo `baralhosAnki` e um filtro com
  `baralhos.length > 0`
- **THEN** o resultado é `{ aplicavel: false, motivo: '...' }`, não uma lista vazia sem explicação

### Requirement: O complemento local de composição respeita o mesmo filtro do pool
O sistema SHALL filtrar qualquer item usado para completar uma composição incompleta pelo mesmo
predicado `passaNoFiltro` que decidiu o pool original, quando um filtro facetado está em uso.

#### Scenario: Fonte incompleta, filtro restritivo
- **WHEN** `recortarPelaComposicao` é chamado com `{ filtro, extras }` e o pool inicial não atingiu
  o mínimo
- **THEN** o complemento só aceita itens que também passam em `passaNoFiltro`, nunca um item fora
  do recorte

#### Scenario: Chamador antigo sem filtro
- **WHEN** `recortarPelaComposicao` é chamado com `{ completar: boolean }` (forma antiga)
- **THEN** o comportamento é idêntico ao anterior a esta mudança — nenhum chamador existente quebra

### Requirement: O filtro escolhido e o filtro aplicado pelo servidor
Quando o cliente compoe uma rodada com um filtro facetado, o pedido ao servidor SHALL carregar o filtro inteiro, e o servidor SHALL aplica-lo com precedencia sobre `fonte`, `fonteRef` e `lang`.

#### Scenario: Recorte por baralho
- **WHEN** o usuario escolhe um baralho Anki e um idioma e pede uma rodada
- **THEN** `GET /api/vocab/para-jogo` recebe `filtro` com `fontes`, `baralhos` e `idiomas`, e cada item devolvido tem ocorrencia naquele baralho

#### Scenario: Filtro grande
- **WHEN** o filtro serializado ultrapassa o teto da query
- **THEN** o cliente envia o mesmo filtro por POST e recebe a mesma resposta

