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

