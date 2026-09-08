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

### Requirement: Um jogo declara o proprio id no relatorio
Todo `RoundReport` SHALL trazer o `gameId` do jogo que o produziu, e nenhum jogo SHALL reportar o id
de outro.

#### Scenario: Jogo cultural fecha uma rodada
- **WHEN** uma rodada de Karuta termina
- **THEN** `exercise_results` recebe `exercise_kind: 'karuta'`, e o recorde e o combo do Duelo nao mudam

### Requirement: A rodada sai do baralho, ou nao nasce
Nenhum jogo SHALL embutir conteudo proprio para jogar. Quando `items` nao permite montar a rodada,
o jogo SHALL sair em vez de inventar material.

#### Scenario: Material insuficiente
- **WHEN** um jogo recebe menos itens do que o seu `minItems`
- **THEN** ele chama `onExit` e a pessoa volta a grade, sem rodada falsa

#### Scenario: Item sem cartao
- **WHEN** um item chega sem `cardId` (veio de fala, nao do baralho)
- **THEN** o outcome sai sem `cardId` — nunca com um id fabricado — e o FSRS o ignora

### Requirement: Todo jogo da tabela tem tela e lugar na grade
O mapa de telas SHALL cobrir todo `MinigameId`, e a grade SHALL listar todo jogo de `MINIGAMES`.

#### Scenario: Jogo novo sem tela declarada
- **WHEN** um id entra em `MINIGAMES` sem entrada no mapa de telas
- **THEN** a compilacao falha, em vez de a tela ficar vazia em silencio

#### Scenario: Jogo novo fora da grade
- **WHEN** um id entra em `MINIGAMES` sem card na grade
- **THEN** o teste da grade falha citando o id

### Requirement: O gate conta o que o jogo consegue usar
`canPlay` e o card SHALL refletir a mesma rodada que `buildItems` monta. Restricao propria de um
jogo SHALL viver dentro de `buildItems`, nunca dentro do componente.

#### Scenario: Jogo que exige frase
- **WHEN** o material tem itens sem frase e o jogo precisa de frase
- **THEN** o card nao os conta, em vez de prometer material e devolver a pessoa a grade

#### Scenario: Jogo que exige encadeamento
- **WHEN** as palavras do material nao encadeiam
- **THEN** o card diz o que falta, e a rodada nao nasce impossivel

### Requirement: O requisito de escrita e declarado, nao deduzido do nome
Um jogo que exige alfabeto SHALL declarar qual escrita usa (`teclado` ou `grade`), e o filtro SHALL
sair do requisito.

#### Scenario: Jogo novo com alfabeto latino
- **WHEN** um jogo declara `requisitos: { alfabeto: 'latino', escrita: 'grade' }`
- **THEN** o gate aplica o filtro da grade sem que nenhum arquivo precise conhecer o nome dele

