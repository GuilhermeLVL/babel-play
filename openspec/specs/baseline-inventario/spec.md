# baseline-inventario Specification

## Purpose
TBD - created by archiving change baseline-inventario. Update Purpose after archive.
## Requirements
### Requirement: Baseline reproduzivel
Toda metrica de partida da rodada SHALL ter arquivo de evidencia em `openspec/audits/2026-09-08-baseline/` com o comando exato, a data, o SHA e a versao do Node.

#### Scenario: Comparacao final
- **WHEN** a Fase 6 mede o estado final
- **THEN** usa o mesmo comando e o mesmo cenario do arquivo de baseline, e a tabela final cita os dois arquivos

