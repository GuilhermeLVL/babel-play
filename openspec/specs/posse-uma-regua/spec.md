# posse-uma-regua Specification

## Purpose
TBD - created by archiving change posse-de-cosmeticos-uma-regua. Update Purpose after archive.
## Requirements
### Requirement: Um catalogo com ids unicos e canal implementado
Todo cosmetico SHALL existir em um unico catalogo, com id unico entre origens e um canal de obtencao que o codigo implementa (nivel, seeds, conquista existente, premium, drop).

#### Scenario: Item sem canal
- **WHEN** um item e adicionado ao catalogo com canal que nenhum caminho de credito ou desbloqueio implementa
- **THEN** o teste de invariante do catalogo falha citando o id

#### Scenario: Ids de origens distintas
- **WHEN** um item da loja e um item do cofre teriam o mesmo id
- **THEN** o namespace (`loja:`/`cofre:`) os distingue e a posse de um nunca concede o outro

### Requirement: Uma regua de posse
Toda pergunta "o usuario pode equipar X" SHALL ser respondida por `estadoDoItem`, com contexto
explicito, em todas as telas e em todo caminho de aplicar. A pergunta gêmea — "como o usuário
consegue X" — SHALL ser respondida por `rotaDeObtencao`, que mora ao lado dela, ramifica na mesma
ordem, e é comparada com ela por teste; nenhuma tela SHALL montar essa resposta por conta própria.

#### Scenario: Item premium possuido
- **WHEN** um item comprado com creditos e consultado na Loja e no Cofre
- **THEN** as duas telas devolvem o mesmo estado (equipavel) porque chamam a mesma funcao

#### Scenario: Tela que redige a própria rota
- **WHEN** uma tela escreve à mão o texto de "como conseguir" em vez de chamar `rotaDeObtencao`
- **THEN** ela pode divergir do cadeado sem que nada acuse, que foi o defeito medido em G31 — a
  rota mostrava o id da conquista onde o cadeado já mostrava o nome

### Requirement: Equipar passa por um chokepoint
Nenhum setter de aparencia SHALL gravar estado sem que `equiparItem` tenha validado a posse.

#### Scenario: Suite tematica nao possuida
- **WHEN** qualquer codigo tenta aplicar uma suite que o usuario nao possui
- **THEN** nada e gravado, a funcao devolve o que falta e nenhuma mensagem de sucesso e exibida

### Requirement: O servidor nao persiste aparencia que o usuario nao possui
`PUT /api/settings` SHALL recusar tema, paleta ou cores customizadas cujo item o usuario nao possui segundo o ledger do servidor.

#### Scenario: Tema custom sem o item
- **WHEN** um cliente envia `ui.theme='custom'` sem ter `tema-custom` em `seed_spends`/`credit_spends`
- **THEN** o servidor responde 403 com `falta` e nao grava

### Requirement: Posse e servida pelo servidor
Conquistas, itens premium e itens da loja SHALL ser hidratados do perfil do servidor (ou do efemero no modo anonimo); `localStorage` e cache.

#### Scenario: localStorage editado a mao
- **WHEN** o usuario adiciona uma conquista em `localStorage` que nao existe em `seed_credits`
- **THEN** na proxima hidratacao a conquista some e o item exclusivo continua bloqueado

### Requirement: Toda aba da loja tem URL
Toda aba que uma tela emite para a loja SHALL existir no vocabulario unico de rotas. O endereço de
uma superfície SHALL ser independente da organização visual da tela: reorganizar as abas NÃO PODE
mudar em que URL uma superfície mora.

#### Scenario: Ir para a loja a partir de uma rodada
- **WHEN** a raspadinha manda para a aba de progressao
- **THEN** a URL e uma das rotas declaradas em `rotas.ts`, nunca `/loja/undefined`

#### Scenario: Link salvo sobrevive à reorganização
- **WHEN** a barra de abas é reordenada ou reagrupada
- **THEN** `/loja/passe`, `/loja/itens`, `/loja/meu-visual` e `/loja/desafios` continuam abrindo as
  mesmas quatro superfícies

### Requirement: Cada superfície de Personalizar tem porta própria na barra de cima
As quatro superfícies — Meu visual, Loja, Passe e Desafios — SHALL ter cada uma a sua aba no
seletor de primeiro nível da tela, alcançável em um clique a partir de qualquer uma das outras.

#### Scenario: Organização que agrupa duas superfícies numa porta
- **WHEN** uma organização põe Passe e Desafios atrás de uma aba comum, com sub-abas
- **THEN** o teste de superfícies alcançáveis falha citando a que perdeu a porta própria

#### Scenario: Organização que remove uma superfície do seletor
- **WHEN** uma tela é montada sem a aba da Loja ou sem a do Passe
- **THEN** o teste falha, porque a Loja é a única superfície em que Seeds e Créditos são gastos

### Requirement: A ordem das abas agrupa por verbo
A barra SHALL abrir na aba padrão da tela, que SHALL ser a primeira, e as duas superfícies de
recompensa SHALL ser vizinhas.

#### Scenario: Leitura da barra
- **WHEN** o usuário abre a tela de Personalizar
- **THEN** a ordem é Meu visual (o que se usa), Loja (o que se compra), Passe e Desafios (o que se
  ganha), e a tela abre na primeira

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

