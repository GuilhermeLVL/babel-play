## Why

O Playwright roda um projeto so (chromium desktop). Nenhum fluxo de jogo, FSRS, seeds, transcricao, estatisticas, tema ou limite de plano tem e2e. A Fase 0 mediu CLS 0,5 em `/jogar` no mobile e nenhum teste veria.

## What Changes

- `playwright.config.ts`: projetos `mobile-375`, `tablet-768`, `desktop-1280` (mesmo chromium, viewport fixo; `workers: 1` mantido pelo motivo documentado).
- Novos `*.e2e.ts`: sessao de jogo (Memoria, Termo e um cultural), revisao FSRS, seeds (saldo e gasto), transcricao (upstream falso), importacao Anki (fixture `.txt`), estatisticas, tema/personalizacao, limites (modo anonimo, `tetoAnonimo`).
- Login: `test.skip` com motivo (decisao do dono: cobertura no nivel HTTP).

## Nao-escopo

Nenhuma remocao, movimentacao ou correcao de comportamento de produto: a Fase 1 so grava o que existe. Um teste que encontra um defeito o registra com `// caracterizacao: comportamento atual` e a correcao vai para a fase que a possui.
