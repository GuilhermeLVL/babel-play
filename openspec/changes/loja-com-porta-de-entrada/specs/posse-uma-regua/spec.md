## ADDED Requirements

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

## MODIFIED Requirements

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
