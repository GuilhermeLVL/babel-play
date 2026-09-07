# metricas-honestas Specification

## Purpose
TBD - created by archiving change metricas-honestas-consertos. Update Purpose after archive.
## Requirements
### Requirement: Estado vazio diz a verdade
Todo painel de métricas em estado vazio SHALL descrever a população real que o esvazia.

#### Scenario: Deck inteiro sem revisão
- **WHEN** todos os N cartões são novos (sem revisão e sem estabilidade)
- **THEN** o texto diz que os N nunca foram revisados — nunca "0 nunca foram revisados"

### Requirement: Escopo declarado é escopo aplicado
Um gráfico intitulado "da Sessão" SHALL plotar apenas dados daquela sessão.

#### Scenario: Topologia lexical
- **WHEN** a aba de métricas de uma gravação abre a Topologia Lexical
- **THEN** só os cartões com `sourceSessionId` daquela gravação aparecem

