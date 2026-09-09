# caracterizacao-http-fluxos-criticos Specification

## Purpose
TBD - created by archiving change caracterizacao-http-fluxos-criticos. Update Purpose after archive.
## Requirements
### Requirement: Todo fluxo critico tem teste HTTP com a montagem real
Cada fluxo critico (auth, idioma, sessao, jogo, FSRS, seeds, IA, importacao, estatisticas, tema, planos, rank) SHALL ter um teste que o exercita por HTTP contra o app montado na mesma ordem do `server.ts`.

#### Scenario: Rota critica sem teste
- **WHEN** uma rota critica nova e registrada sem teste de caracterizacao
- **THEN** `scripts/testes/rotas-sem-caracterizacao.mjs` a lista e o CI falha

