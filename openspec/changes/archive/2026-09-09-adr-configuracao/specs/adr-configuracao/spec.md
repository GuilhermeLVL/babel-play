## ADDED Requirements

### Requirement: Leitura montada de env nao e invisivel
Uma variavel lida por nome montado em runtime SHALL estar declarada no inventario.

#### Scenario: Plano novo
- **WHEN** um plano entra na `PLAN_MATRIX`
- **THEN** as suas variaveis aparecem no inventario sem ninguem escrever
