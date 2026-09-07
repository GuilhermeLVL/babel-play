# jogo-so-entra-pelo-sistema Specification

## Purpose
TBD - created by archiving change jogos-culturais-dentro-do-sistema. Update Purpose after archive.
## Requirements
### Requirement: Um jogo na grade e um MinigameDef
Todo jogo exibido em `/jogar` SHALL ter um `MinigameDef` em `MINIGAMES` e um id em `MinigameId`; nao existe registro paralelo.

#### Scenario: Grade gerada da definicao
- **WHEN** um jogo e removido de `MINIGAMES`
- **THEN** ele some da grade, da partida rapida e do ranking sem outra alteracao

### Requirement: Toda rodada nasce do pipeline e volta pelo funil
A rodada de qualquer jogo SHALL ser montada por `montarRodada` a partir de `jogaveis`, e o `RoundReport` SHALL chegar a `aoTerminar`.

#### Scenario: Rodada de um jogo cultural
- **WHEN** o usuario conclui uma rodada de Karuta
- **THEN** `exercise_results` recebe uma linha por item, XP e sequencia atualizam, e o recorde do jogo existe

### Requirement: Nada e anunciado como disponivel sem material
Um card SHALL aparecer como jogavel apenas quando `estadoDeCadaJogo` confirma material suficiente no idioma-alvo; conteudo proprio do jogo SHALL ser declarado no card.

#### Scenario: Aprendiz de japones abre a grade
- **WHEN** o idioma-alvo e japones e um jogo so tem material em ingles
- **THEN** o card mostra o motivo (sem material neste idioma) em vez de "funcional"

### Requirement: Voz e escrita seguem o item
Sintese de voz e regras de escrita SHALL derivar de `item.lang`, nunca de um locale cravado no componente.

#### Scenario: Palavra em alemao
- **WHEN** um item com `lang = 'de'` e falado
- **THEN** a voz escolhida e de `de`, e um item com `lang = 'ja'` no mesmo jogo usa voz de `ja`

