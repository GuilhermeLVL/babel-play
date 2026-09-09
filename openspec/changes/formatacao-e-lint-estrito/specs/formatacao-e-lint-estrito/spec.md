## ADDED Requirements

### Requirement: Formato e ordem de import sao automaticos
O que esta no indice SHALL ser formatado e ter os imports ordenados antes do commit.

#### Scenario: Import fora de ordem
- **WHEN** alguem acrescenta um import no meio do bloco
- **THEN** o `lint-staged` o reordena antes do commit
