# adr-normalizacao-de-texto Specification

## Purpose
TBD - created by archiving change adr-normalizacao-de-texto. Update Purpose after archive.
## Requirements
### Requirement: As tres normalizacoes sao distinguiveis
Chave de palavra, dobra de texto e alfabeto de grade SHALL ser funcoes distintas com nome proprio.

#### Scenario: Unificacao indevida
- **WHEN** alguem tenta unificar as tres
- **THEN** o caso de `agua doce` (espaco) e o de `latwy` (letra nao decomposta) falham

