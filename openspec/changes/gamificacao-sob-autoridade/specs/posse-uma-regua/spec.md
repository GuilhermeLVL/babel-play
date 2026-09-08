## ADDED Requirements

### Requirement: O drop sorteia entre itens que já têm porta
O sorteio de fim de rodada SHALL escolher entre itens do catálogo único, e NÃO SHALL introduzir um
canal de obtenção próprio. Um item obtido por drop SHALL ser um item que já poderia ser obtido de
outra forma.

#### Scenario: Item exclusivo de conquista
- **WHEN** o servidor monta a lista sorteável
- **THEN** nenhum item com `exclusivoDe` entra, porque conquista é o que não se sorteia

#### Scenario: Item da prateleira paga
- **WHEN** o servidor monta a lista sorteável
- **THEN** nenhum item com `precoCreditos` entra: moeda comprada não sai de baú

#### Scenario: Item que todo mundo já tem
- **WHEN** um item é de nível 1 e sem preço em Seeds
- **THEN** ele fica fora do sorteio, senão o baú entrega repetidamente o que já é de todos

### Requirement: Quem sorteia o drop é o servidor
O item entregue por um drop SHALL ser decidido pelo servidor, e o cliente NÃO SHALL poder
influenciá-lo.

#### Scenario: Cliente pede um item específico
- **WHEN** o corpo do pedido nomeia o item desejado
- **THEN** o campo é ignorado; o item sai do sorteio do servidor

#### Scenario: Modo sem conta
- **WHEN** o mesmo pedido é feito ao servidor efêmero
- **THEN** ele usa as mesmas funções do core e chega ao mesmo resultado

### Requirement: Um drop por rodada, ancorado numa rodada real
O `creditoId` de um drop SHALL ser derivado do identificador da rodada, e a rodada SHALL existir e
pertencer ao usuário.

#### Scenario: Rodada inventada
- **WHEN** o cliente pede um drop para um `roundId` que não existe
- **THEN** o pedido é recusado e nenhum item é concedido

#### Scenario: Mesmo pedido duas vezes
- **WHEN** o mesmo `drop:<roundId>` é enviado de novo
- **THEN** o mesmo item é devolvido, sem novo sorteio, e as Seeds são creditadas uma vez só

#### Scenario: Identificador com carimbo de tempo
- **WHEN** o `creditoId` embute um instante em vez do identificador da rodada
- **THEN** ele não resolve como drop, porque cada envio criaria um crédito novo

### Requirement: A posse por drop é derivada do razão do crédito
A posse de um item ganho por drop SHALL ser derivada de `seed_credits.reason`, e NÃO SHALL depender
de estado local.

#### Scenario: Perfil recarregado
- **WHEN** o perfil é hidratado do servidor depois de um drop
- **THEN** o item continua sendo do usuário, porque a posse vem da mesma coluna que a hidratação lê

### Requirement: A moeda da temporada é decidida, não derivada do tamanho do catálogo
O número de cofres de Seeds de cada década do passe SHALL ser uma constante declarada, e NÃO SHALL
ser o que sobrar depois dos itens.

#### Scenario: Catálogo ganha itens
- **WHEN** itens novos entram no catálogo e enchem as décadas
- **THEN** o total de Seeds da temporada não muda, e o excedente de itens divide a coluna do marco

#### Scenario: Alguém quer mudar a moeda da trilha
- **WHEN** o total de Seeds da temporada precisa mudar
- **THEN** a mudança exige editar a constante, e o teste do total falha até ela ser editada

### Requirement: A recompensa de uma conquista é proporcional ao feito
O cosmético prometido por uma conquista SHALL ser exclusivo dela, NÃO SHALL ser vendido em
paralelo, e SHALL ter raridade igual ou superior à da conquista.

#### Scenario: Conquista comum com prêmio épico
- **WHEN** uma conquista de raridade comum promete um cosmético épico ou lendário
- **THEN** o teste de contrato falha: o feito mais fácil não paga como o mais difícil

#### Scenario: Prêmio também vendido na Loja
- **WHEN** o item que uma conquista promete tem preço em Seeds ou em Créditos
- **THEN** o teste falha, porque a promessa e a sua quebra estariam na mesma tela
