## ADDED Requirements

### Requirement: Falha de CI e legivel sem admin
Toda run da CI SHALL publicar o resultado da suite (JSON) e do e2e (trace, screenshot) como artefato, inclusive quando falha.

#### Scenario: `npm test` falha no runner
- **WHEN** um teste falha so no runner
- **THEN** o artefato `vitest-resultado` diz qual, sem precisar do log do job
