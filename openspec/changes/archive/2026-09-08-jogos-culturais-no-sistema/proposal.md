# Os nove jogos culturais entram no sistema

## Por quê

Os nove existiam como arquivos e não como jogos. Em 2026-09-07 eles saíram da grade porque o
resultado das partidas era descartado; a change `jogos-culturais-dentro-do-sistema` deixou escrito o
contrato de volta. Esta change é a volta.

## O que estava errado, medido

| Fato | Número |
|---|---|
| Jogos que reportavam `gameId: 'blitz' as any` | **9 de 9** |
| Jogos que ignoravam a prop `items` (assinavam `_itemsProp`) | **6 de 9** |
| Jogos que preenchiam `cardId` (sem ele não há FSRS) | **0 de 9** |
| Tabelas `Record<MinigameId, …>` que param de compilar com os ids novos | 7 |

Religar qualquer um deles como estava teria gravado a rodada com `exercise_kind: 'blitz'` e a nota
de velocidade do Duelo — contaminando recorde, combo e histórico de outro jogo.

## O que muda

- Os nove ids entram em `MinigameId`, e a compilação apontou as tabelas que precisavam deles. O
  `gradeFor` só foi pego pelo `typecheck:core` (o core é `strict`): sem a entrada, o `switch` caía
  fora e a nota que alimenta o FSRS sairia `undefined`.
- A cascata de render vira `Record` exaustivo (`play/telaDoJogo.ts`): jogo sem tela declarada não
  compila, em vez de virar tela vazia.
- O gate de alfabeto deixa de conhecer jogo por nome. Cada jogo declara `requisitos.escrita`
  (`teclado` ou `grade`) e o filtro sai do requisito.
- A grade ganha teste contra `MINIGAMES` — ela é um array, então um jogo sumia dela sem nada acusar.
- `culturais/**` sai do ignore do ESLint e do knip.

**As mecânicas que mudaram de natureza**, ditas porque três deles deixam de ser o que eram:
Tênis abandona a conjugação espanhola e vira rali cronometrado; Koffer abandona o Akkusativ (gênero
gramatical não existe em cartão nenhum do app) e vira a mala cumulativa; Cadavre entra com
`writesSrs: false` — usar a palavra numa frase não é evidência de recuperação.

## O defeito que só apareceu jogando

Charada e Corrente mostravam "8 nesta rodada" na grade e devolviam a pessoa à grade ao serem
clicadas. O gate contava todo item elegível; o jogo depois descartava o que não servia — a Charada
precisa de frase, a Corrente precisa que as palavras encadeiem. O recorte foi para dentro de
`buildItems`, que é o que o gate lê.

A Corrente precisou de um segundo conserto: a busca cortava o **pool** no teto da rodada, o que
equivale a perguntar "estas 8 palavras encadeiam?" — e 8 palavras do baralho quase nunca encadeiam.
O corte passou a ser a profundidade dentro de um pool de 60.

## Verificação

Rodada de Karuta com o baralho na fonte gravou `exercise_kind: 'karuta'`, 7 dos 8 itens com
`card_id` real e `kind: 'srs'`, e os cartões foram reagendados pelo FSRS (`reps: 2`, `stability`
calculada, `due_at` futuro). Com só a trilha na fonte o `card_id` vem vazio — comportamento dos
jogos antigos também, porque os cartões da trilha têm `id` vazio de propósito.

Portões: typecheck, typecheck:core, lint 0 avisos, 3.459 testes, knip, madge, os quatro de i18n,
audit:gate, ast-grep, build, workflows, e2e 26/26.
