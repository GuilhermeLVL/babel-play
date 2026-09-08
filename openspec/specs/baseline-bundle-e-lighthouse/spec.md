# baseline-bundle-e-lighthouse Specification

## Purpose
TBD - created by archiving change baseline-bundle-e-lighthouse. Update Purpose after archive.
## Requirements
### Requirement: Peso por rota medido do manifest
O bundle por rota SHALL ser derivado de `dist/.vite/manifest.json` (entradas dinamicas e imports estaticos transitivos), nao de nomes de arquivo.

#### Scenario: Chunk compartilhado
- **WHEN** duas telas importam o mesmo chunk fora do arranque
- **THEN** ele conta no peso das duas

