## ADDED Requirements

### Requirement: Provedor de IA que esta fora deixa de ser tentado

Depois de um numero seguido de falhas, o servidor SHALL parar de chamar aquele provedor por uma
janela, e SHALL voltar a sonda-lo uma vez quando ela terminar.

#### Scenario: Cinco falhas seguidas

- **WHEN** um provedor falha cinco vezes seguidas
- **THEN** a chamada seguinte nao toca nele e cai direto na reserva, e depois da janela ele volta a
  ser sondado uma vez
