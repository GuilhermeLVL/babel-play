# fonte-ciclica Specification

## Purpose
TBD - created by archiving change controle-de-fonte-ciclico. Update Purpose after archive.
## Requirements
### Requirement: Um controle de fonte que cicla
O tamanho do texto SHALL ser controlado por um único botão que avança a escala a cada clique e
retorna à menor após a maior.

#### Scenario: Ciclo completo
- **WHEN** o usuário clica no botão estando na escala máxima (`xl`)
- **THEN** a escala vai para a mínima (`sm`), e o rótulo acessível anuncia o novo estado

