## ADDED Requirements

### Requirement: A moldura padrão é a sidebar à esquerda, sem remover as outras

Quem nunca escolheu uma posição de menu SHALL ver o rail à esquerda. As posições topo, rodapé e
direita SHALL continuar disponíveis e equipáveis como antes, e uma escolha gravada SHALL vencer o
padrão.

#### Scenario: Primeira visita

- **WHEN** não há `babel.menu_position` gravado
- **THEN** a casca monta `NavRail` à esquerda com `data-shell="rail"`

#### Scenario: Preferência anterior

- **WHEN** `babel.menu_position` é `top`
- **THEN** a casca monta `NavBar` no topo, como antes

### Requirement: Nenhum rótulo de navegação é cortado

Os rótulos do rail SHALL quebrar em linhas em vez de serem truncados, em qualquer perfil de
exibição e em pseudo-locale (+40 %).

#### Scenario: Pseudo-locale no rail

- **WHEN** a interface está em `xx` e o rail expandido
- **THEN** nenhum item tem `scrollWidth` maior que `clientWidth` (gate `pseudo-localizacao.e2e.ts`)
