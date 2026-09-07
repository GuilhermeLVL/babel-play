# Jogos culturais — fora da grade até entrarem no sistema

Nove jogos (Karuta, Koffer, Choseong, Taboo, Shiritori, Cadavre Exquis, Bao, Tense Tennis,
Vitendawili) moram aqui e **não são alcançáveis pela aplicação**: nenhuma rota os importa.

## Por que saíram

Eles estavam na grade de `/jogar` com o selo "100% Funcional" e fora de todos os sistemas
(auditoria de 2026-09-07, achado A02):

- Registro paralelo (`JogoAtivo`/`JOGOS_CULTURAIS` em `Play.tsx`), fora de `MinigameId` e de
  `MINIGAMES`.
- A rodada não passava por `montarRodada`: a entrada era o acervo inteiro mapeado na hora, sem
  composição, memória de itens, dificuldade nem antessala.
- A saída era um `onFinish` sem argumentos: os nove `RoundReport` eram **descartados**. Zero em
  `exercise_results`, `review_logs`, XP, sequência, recordes e conquistas — confirmado por SQL no
  banco real, que não tinha uma única rodada dos nove.
- Seis ignoravam `items` e jogavam com listas fixas; a voz usava locale cravado (`de-DE`, `en-US`,
  `es-ES`, `sw`); Shiritori descartava escrita não latina; Choseong é inerte fora do coreano.
- Nenhum teste citava qualquer um deles.

A decisão e as alternativas estão em
`openspec/changes/jogos-culturais-dentro-do-sistema/design.md`.

## O que cada um precisa para voltar

O contrato é o mesmo para os nove, e está na spec `jogo-so-entra-pelo-sistema`:

1. Id em `MinigameId` e definição em `MINIGAMES` (`src/core/minigames/types.ts`), com
   `minItems`/`maxItems`, modalidade, `writesSrs` e requisitos de escrita e idioma.
2. A rodada nasce em `montarRodada` a partir de `jogaveis` — nunca do acervo cru.
3. `onFinish(report)` chega a `aoTerminar`, que é o funil único: pontuação, FSRS por item quando
   há `cardId`, gravação em `exercise_results`.
4. A voz sai de `item.lang`. Nenhum locale cravado no componente.
5. O gating passa por `estadoDeCadaJogo`: sem material no idioma-alvo, o card diz o motivo.
6. Teste de componente que joga uma rodada e verifica o `RoundReport`, mais uma linha em
   `tests/matriz-dos-jogos.test.ts`.

Dívida específica por jogo (do relatório): Koffer, Taboo, Cadavre, Bao, Tense Tennis e Vitendawili
ignoram `items`; Shiritori filtra `/^[A-Z]+$/`; Choseong mapeia o acervo inteiro sem recorte e
esconde vogais latinas.
