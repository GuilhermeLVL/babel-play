## ADDED Requirements

### Requirement: A carga tem limiar que reprova

O roteiro de carga SHALL falhar quando a latencia ou a taxa de erro passarem dos valores medidos,
e SHALL falhar tambem quando nenhum trabalho tiver sido feito.

#### Scenario: Regressao de latencia

- **WHEN** a p95 de uma rota da jornada passa do valor da catraca
- **THEN** o comando sai com codigo diferente de zero

#### Scenario: Nenhum gasto aceito

- **WHEN** o teste de concorrencia nao consegue nenhum gasto aceito
- **THEN** ele REPROVA, em vez de declarar o teto respeitado
