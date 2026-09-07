## ADDED Requirements

### Requirement: Nenhuma casa do passe fica vazia
O passe SHALL ter as 100 casas ocupadas, com todo item nao exclusivo entrando exatamente uma vez na propria decada e o marco de cada dezena recebendo o item mais raro da decada.

#### Scenario: Casas ocupadas
- **WHEN** o passe e montado a partir do catalogo
- **THEN** nenhuma das 100 casas esta vazia (`tests/passe.test.ts:53`)

#### Scenario: Marco de dezena
- **WHEN** a decada tem itens de raridades diferentes
- **THEN** a casa 10, 20, ..., 100 recebe o mais raro (`tests/passe.test.ts:59`)

### Requirement: A origem do item e legivel em toda tela
Cada item SHALL mostrar de que origem veio (nivel, Seeds, conquista ou creditos) com icone e cor de token proprios; raridade vira selo, nao cor.

#### Scenario: Cartao unico
- **WHEN** um item aparece em Meu visual, Loja, Passe ou Conquistas
- **THEN** o mesmo cartao, com a mesma regua de origem, e usado (tarefa 2.5 ainda aberta: hoje a regua vale em Meu visual e Loja)
