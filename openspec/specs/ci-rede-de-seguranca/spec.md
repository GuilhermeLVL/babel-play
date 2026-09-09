# ci-rede-de-seguranca Specification

## Purpose
TBD - created by archiving change ci-rede-de-seguranca. Update Purpose after archive.
## Requirements
### Requirement: Cobertura nao regride
A suite SHALL falhar se a cobertura de linhas, ramos ou funcoes cair abaixo do piso registrado em `vitest.config.ts`.

#### Scenario: Teste removido
- **WHEN** um commit remove testes e a cobertura cai abaixo do piso
- **THEN** `npm run test:cov` falha

