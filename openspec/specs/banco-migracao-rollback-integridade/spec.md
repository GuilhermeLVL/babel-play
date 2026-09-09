# banco-migracao-rollback-integridade Specification

## Purpose
TBD - created by archiving change banco-migracao-rollback-integridade. Update Purpose after archive.
## Requirements
### Requirement: Migracao sobre o estado atual e reversivel por backup
As migrations SHALL aplicar sem erro sobre uma copia anonimizada do banco real, com `foreign_key_check` vazio e `integrity_check` ok apos cada uma; e o backup gerado por `scripts/backup.mjs` SHALL restaurar um banco que sobe.

#### Scenario: Migration nova quebra integridade
- **WHEN** uma migration deixa uma FK pendurada na fixture
- **THEN** o teste a nomeia e falha

