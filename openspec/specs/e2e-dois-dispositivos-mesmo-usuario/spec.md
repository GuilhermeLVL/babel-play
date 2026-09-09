# e2e-dois-dispositivos-mesmo-usuario Specification

## Purpose
TBD - created by archiving change e2e-dois-dispositivos-mesmo-usuario. Update Purpose after archive.
## Requirements
### Requirement: Dois dispositivos, um saldo
Com o mesmo usuario em dois clientes, o saldo de Seeds e o `due` dos cartoes SHALL ser os mesmos apos recarregar, e gastos simultaneos SHALL nunca deixar o saldo negativo.

#### Scenario: Gasto simultaneo
- **WHEN** dois clientes gastam ao mesmo tempo mais do que o saldo comporta
- **THEN** no maximo os gastos que cabem no saldo sao aceitos

