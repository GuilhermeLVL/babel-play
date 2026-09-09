# estado-por-processo-eliminado Specification

## Purpose

TBD - created by archiving change estado-por-processo-eliminado. Update Purpose after archive.

## Requirements

### Requirement: Teto de recurso vale para o conjunto, nao por processo

Um teto de uso SHALL ser contado onde todas as instancias o enxergam, e nao no heap de um processo.

#### Scenario: Duas instancias sobre o mesmo banco

- **WHEN** dois processos atendem o mesmo usuario e o teto e 10
- **THEN** a soma aceita pelos dois nao passa de 10
