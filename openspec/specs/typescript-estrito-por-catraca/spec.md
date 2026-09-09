# typescript-estrito-por-catraca Specification

## Purpose
TBD - created by archiving change typescript-estrito-por-catraca. Update Purpose after archive.
## Requirements
### Requirement: A arvore inteira compila em `strict`
`npm run typecheck:estrito` SHALL passar sem erro.

#### Scenario: Codigo novo sem tipo
- **WHEN** um parametro novo fica com `any` implicito
- **THEN** o passo do CI falha

