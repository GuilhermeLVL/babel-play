## ADDED Requirements

### Requirement: Mudanca de contrato falha no CI
A forma (chaves e tipos) de cada resposta das rotas criticas SHALL estar congelada em snapshot; alterar a forma sem atualizar o snapshot SHALL falhar a suite.

#### Scenario: Campo removido
- **WHEN** um handler deixa de devolver um campo
- **THEN** o snapshot da rota falha ate ser atualizado com justificativa
