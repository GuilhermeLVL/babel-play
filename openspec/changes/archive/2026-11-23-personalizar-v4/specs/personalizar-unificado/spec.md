## ADDED Requirements

### Requirement: Um item, uma cara
Um item do catálogo SHALL ser renderizado pelo mesmo componente e o mesmo vocabulário de
raridade em toda a superfície de personalização.

#### Scenario: O mesmo tema em três lugares
- **WHEN** um tema aparece na progressão, na loja e nas conquistas
- **THEN** é o mesmo card, com o mesmo nome de raridade e o mesmo estado
  (equipado/possuído/comprável/bloqueado-por-nível/por-conquista)

### Requirement: Progressão legível
O usuário SHALL conseguir ver, numa única vista, o que cada nível libera e onde ele está.

#### Scenario: Trilha de recompensas
- **WHEN** o usuário abre a área de progressão
- **THEN** os níveis 1 a 10 aparecem em sequência com as recompensas de cada um e o nível
  atual destacado
