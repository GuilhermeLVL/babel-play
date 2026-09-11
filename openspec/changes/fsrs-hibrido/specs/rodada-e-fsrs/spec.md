## ADDED Requirements

### Requirement: A nota da revisão é escolhida pela pessoa quando ela acerta

Após uma resposta correta em qualquer formato de revisão, a interface SHALL oferecer as notas
`Difícil`, `Bom` e `Fácil` com a nota derivada pré-selecionada, e SHALL enviar ao servidor a nota
marcada no momento de avançar. Após uma resposta errada a nota SHALL ser `Again`, sem escolha.

#### Scenario: Acerto sem mexer na nota

- **WHEN** a pessoa acerta e aperta "Avançar" sem tocar no grupo
- **THEN** o servidor recebe a nota derivada (Bom; Fácil em produção ativa)

#### Scenario: Acerto com ajuste

- **WHEN** a pessoa acerta, marca "Fácil" e aperta "Avançar"
- **THEN** o servidor recebe 4

#### Scenario: Erro

- **WHEN** a pessoa erra
- **THEN** nenhum grupo de notas aparece e o servidor recebe 1
