## ADDED Requirements

### Requirement: Rota registrada tem chamador ou razao escrita
Toda rota registrada no Express SHALL ter um chamador em `src/` ou uma entrada nomeada explicando quem a chama (ou por que a tela ainda nao existe).

#### Scenario: Rota nova sem tela
- **WHEN** uma rota e registrada e nenhum codigo do cliente a chama
- **THEN** `rotas-sem-consumidor.mjs` a lista e o CI falha ate a decisao ser escrita
