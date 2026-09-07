# Decisao: entrega B — os nove saem da grade ate entrarem no sistema

## A pergunta

A pergunta 6 do relatorio (`openspec/audits/2026-09-07-coerencia.md`) e uma decisao de produto:
os nove jogos culturais viram jogos de verdade (entram em `MinigameId`, `montarRodada`,
`aoTerminar`, ranking) ou saem da grade ate isso acontecer?

## O que foi decidido, e por que

**Entrega B: sair da grade.** Sem resposta do dono, esta e a unica das duas que nao aposta.

1. **O dano atual e uma afirmacao falsa, e ela e barata de tirar.** Cada card anuncia
   `100% Funcional` (`Play.tsx:3648`). Nao e: a rodada nao e montada pelo pipeline, o
   `RoundReport` e descartado por um `onFinish` sem argumentos (`Play.tsx:2586-2592`), e o banco
   real tem **zero** rodadas registradas para os nove. Quem joga trinta minutos de Karuta nao
   ganha XP, nao mexe no FSRS, nao aparece em recorde nenhum. Seis dos nove nem usam o acervo da
   pessoa (`_itemsProp` ignorado) e jogam com listas fixas, com locale de voz cravado.
2. **A entrega A e grande e especulativa.** Nove `MinigameDef` novos, nove ramos de
   `montarRodada`, nove testes de componente, requisitos de escrita por jogo e mudanca no ranking
   D1 — construir isso sem o dono ter dito que quer estes nove jogos no produto e apostar semanas
   de trabalho na resposta que a pergunta ainda nao teve.
3. **B e reversivel e nao destroi nada.** Os nove componentes continuam no repositorio, agora em
   `src/components/minigames/culturais/`, com um README dizendo o que falta. A spec desta change
   (`jogo-so-entra-pelo-sistema`) continua valendo e e exatamente o contrato que a entrega A tera
   de cumprir quando for autorizada. Voltar e reconectar a grade.

## O que sai, o que fica

| Sai | Fica |
|---|---|
| Os nove cards da grade `/jogar`, a aba "Jogos do Mundo" e o separador | Os nove componentes, movidos para `minigames/culturais/` |
| Os nove no sorteio da Partida Rapida | O `README.md` da pasta, com a divida por jogo |
| `JogoAtivo`, `JogoCulturalMeta`, `JOGOS_CULTURAIS` e o bloco de render (`Play.tsx`) | A spec `jogo-so-entra-pelo-sistema`, para a entrega A |
| `MinigamesShowcase.tsx` (segundo roteador, sem importador desde sempre) | Os testes existentes (nenhum citava os nove) |

## O que isso muda para quem usa

A grade passa de 18 para 9 jogos, e os 9 que ficam sao os que registram progresso. Ninguem perde
progresso: nao havia progresso a perder — e o que esta change corrige.

## Contrato para a volta (entrega A)

Um jogo so volta a grade quando: tem id em `MinigameId` e def em `MINIGAMES`; a rodada nasce em
`montarRodada` a partir de `jogaveis`; `onFinish(report)` chega a `aoTerminar`; a voz sai de
`item.lang`; o gating passa por `estadoDeCadaJogo`; e ha teste de componente que joga uma rodada.
