# cromas Specification

## Purpose
TBD - created by archiving change inventario-e-cromas. Update Purpose after archive.
## Requirements
### Requirement: Croma é adição, nunca remoção
Introduzir cromas SHALL NÃO reduzir o acesso que o usuário já tinha.

#### Scenario: Estilo de paleta já liberado
- **WHEN** o usuário possui um estilo de paleta (que hoje dá 30 matizes)
- **THEN** ele continua com as 30, e os cromas aparecem como variações NOVAS de outras peças

### Requirement: Croma se compra com a moeda de estudo
Um croma trancado SHALL exigir confirmação explícita antes de gastar, e o gasto SHALL ser
idempotente.

#### Scenario: Compra confirmada
- **WHEN** o usuário escolhe um croma trancado e confirma o preço
- **THEN** as Seeds são debitadas uma única vez e o croma passa a ser dele

#### Scenario: Clique sem saldo
- **WHEN** o saldo não cobre o preço
- **THEN** nada é gasto e o app diz quanto falta e de onde vêm as Seeds

#### Scenario: Croma que não está à venda
- **WHEN** o croma vem de conquista ou do Passe Premium
- **THEN** nenhuma quantia o compra, e a tela diz de onde ele sai

### Requirement: A edição é do tipo do item
Ao personalizar, o app SHALL oferecer os parâmetros que pertencem àquele tipo, e nada além.

#### Scenario: Partículas
- **WHEN** o usuário personaliza um item de partículas
- **THEN** ele ajusta intensidade e quantidade, além da cor

#### Scenario: Peça sem parâmetro
- **WHEN** o item não tem nada a ajustar
- **THEN** o app não oferece um botão de personalizar que abriria um editor vazio

