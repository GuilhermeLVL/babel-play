# banco-migracao-rollback-integridade Specification

## Purpose

TBD - created by archiving change banco-migracao-rollback-integridade. Update Purpose after archive.

## Requirements

### Requirement: Migracao sobre o estado atual e reversivel por backup

As migrations SHALL aplicar sem erro sobre uma copia anonimizada do banco real, sem nenhuma violacao de FK (nenhuma constraint de chave estrangeira pendurada) e com as contagens das tabelas conferindo apos cada uma; e o backup gerado por `scripts/backup.mjs` SHALL listar sem erro em `pg_restore --list` e restaurar um banco que sobe, com as mesmas contagens.

#### Scenario: Migration nova quebra integridade

- **WHEN** uma migration deixa uma FK pendurada na fixture
- **THEN** o teste a nomeia e falha
