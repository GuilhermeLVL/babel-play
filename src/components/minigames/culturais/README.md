# Jogos culturais — dentro do sistema desde 2026-09-08

Nove jogos moram aqui: **Karuta** (ja), **Choseong** (ko), **Tense Tennis** (en), **Koffer** (de),
**Bao** (sw), **Vitendawili** (sw), **Shiritori** (ja), **Cadavre Exquis** (fr) e **Taboo** (es).

Eles **estão na grade e rodam sobre o baralho**: `src/components/views/play/telaDoJogo.ts` os
importa, `src/core/minigames/types.ts` os registra em `MINIGAMES`, e o e2e
`tests/e2e/grade-so-com-jogos-do-sistema.e2e.ts` cobra que os nove apareçam. A volta foi feita pela
change `jogos-culturais-no-sistema` (arquivada em `openspec/changes/archive/2026-09-08-*`).

> Até 2026-09-07 este arquivo dizia o contrário — que eles não eram alcançáveis por rota nenhuma.
> Era verdade quando foi escrito e deixou de ser no dia seguinte; a correção veio na Fase 2 da
> rodada de saneamento (2026-09-09), junto com o gate que impede a próxima rota órfã.

## Por que eles saíram, e o que precisou mudar para voltarem

O diagnóstico de 2026-09-07 (achado A02) mediu o que faltava: os nove nasciam fora de
`montarRodada`, o `RoundReport` era descartado num `onFinish` sem argumentos (zero linhas em
`exercise_results` no banco real), seis ignoravam `items` e jogavam com listas fixas, a voz usava
locale cravado (`de-DE`, `en-US`, `es-ES`, `sw`), e nenhum teste citava qualquer um deles.

O contrato de entrada é o da spec `jogo-so-entra-pelo-sistema`, e vale para qualquer jogo novo:

1. Id em `MinigameId` e definição em `MINIGAMES` (`src/core/minigames/types.ts`), com
   `minItems`/`maxItems`, modalidade, `writesSrs` e requisitos de escrita e idioma.
2. A rodada nasce em `montarRodada` a partir de `jogaveis` — nunca do acervo cru.
3. `onFinish(report)` chega a `aoTerminar`, que é o funil único: pontuação, FSRS por item quando
   há `cardId`, gravação em `exercise_results`.
4. A voz sai de `item.lang`. Nenhum locale cravado no componente — a regra é cobrada pela regra
   ast-grep `locale-cravado`.
5. O gating passa por `estadoDeCadaJogo`: sem material no idioma-alvo, o card diz o motivo.
6. Teste de componente que joga uma rodada e verifica o `RoundReport`, mais uma linha em
   `tests/matriz-dos-jogos.test.ts`.

## O que ainda não é igual aos clássicos

Estes jogos exigem escrita ou alfabeto próprio (`tenis` exige alfabeto latino desde `47ecf10`;
Choseong é inerte fora do coreano; Shiritori depende de kana). O gating cobre isso pela definição
em `MINIGAMES`, não por `if` dentro do componente — quando falta material, o card explica em vez de
abrir um jogo vazio.
