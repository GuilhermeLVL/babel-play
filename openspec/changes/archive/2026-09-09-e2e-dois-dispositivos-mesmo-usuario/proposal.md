## Why

O mesmo usuario em dois dispositivos e o cenario que corrompe economia e progresso em silencio: dois debitos simultaneos, um `due` lido antes da revisao do outro. Existem testes de concorrencia no nivel do repositorio; nenhum passa pela UI.

## What Changes

- `dois-dispositivos.e2e.ts`: dois `browser.newContext()` (mesmo usuario self-host); A joga uma rodada, B recarrega e ve o mesmo saldo e o mesmo `due`; A e B gastam ao mesmo tempo e o saldo nunca fica negativo.
- Par vitest: `Promise.all` de N debitos em `tests/caracterizacao/seeds-concorrencia.test.ts` sobre o app HTTP.

## Nao-escopo

Nenhuma remocao, movimentacao ou correcao de comportamento de produto: a Fase 1 so grava o que existe. Um teste que encontra um defeito o registra com `// caracterizacao: comportamento atual` e a correcao vai para a fase que a possui.
