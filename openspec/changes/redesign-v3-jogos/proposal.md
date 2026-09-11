## Why

Os 18 jogos já eram só tokens e classes, com duas exceções: o selo de combo ("x3!") copiado em
oito jogos com `bg-gradient-to-r from-orange-500 to-amber-500 text-white` — cores da paleta do
Tailwind, fora dos 7 temas e sem par de contraste verificado — e um tinte `emerald-500` na carta
fechada do Memory. Os `text-white` restantes ficam todos sobre `bg-accent`/`bg-warn`/`bg-good`/
`bg-error`, pares que a camada de contraste já resolve por tema.

## What Changes

- Nova classe `.selo-combo` (preenchimento `warn` + `--warn-contrast` verificado por tema) no
  lugar do gradiente copiado em Blitz, Conectores, Ditado, Escuta, Memory, Scramble, Termo e
  Caça-palavras. O `animate-bounce` continua.
- Memory: tinte da carta fechada em `good/5` em vez de `emerald-500/5`.
- Nenhuma regra de jogo, handler, `data-tour` ou nome acessível muda; `juice.ts` não seleciona
  por nenhuma dessas classes.

## Nao-escopo

Antessala, ComoSeJoga, Tour, Resumo e Raspadinha já vestiam a F1. `ArteDosJogos` (ilustrações)
não é tocada: as cores das artes são por modalidade e passam pela legenda do lobby.
