# segredos-e-vulnerabilidades Specification

## Purpose

TBD - created by archiving change segredos-e-vulnerabilidades. Update Purpose after archive.

## Requirements

### Requirement: Historico sem segredo e SAST no CI

O repositorio SHALL passar `gitleaks` no historico completo e uma varredura SAST generica a cada
push, alem das regras proprias de arquitetura.

#### Scenario: Segredo novo commitado

- **WHEN** um valor sensivel que nao esta na allowlist nomeada entra no repositorio
- **THEN** o job de seguranca falha
