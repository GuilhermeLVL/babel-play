## ADDED Requirements

### Requirement: O modelo de IA entregue segue o plano do usuario

Quando `LLM_MODEL_GRANDE` estiver configurada, o servidor SHALL entrega-la apenas a quem tem o
entitlement `largerModels`, resolvido no servidor.

#### Scenario: Usuario sem o entitlement

- **WHEN** um usuario de plano free ou essencial usa a IA gerenciada
- **THEN** o modelo escolhido e o de `LLM_MODEL`, nunca o de `LLM_MODEL_GRANDE`

#### Scenario: Variavel nao configurada

- **WHEN** `LLM_MODEL_GRANDE` esta ausente
- **THEN** todo plano recebe o mesmo modelo, como antes
