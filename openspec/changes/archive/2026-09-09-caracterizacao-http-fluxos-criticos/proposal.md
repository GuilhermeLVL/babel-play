## Why

Antes de remover ou mover qualquer coisa (Fases 2 e 3), cada fluxo critico precisa de um teste que grave o comportamento ATUAL por HTTP, com a montagem real de middlewares e routers. Os 107 testes de integracao existentes montam um router por vez; nenhum passa pela ordem do `server.ts`, e e a ordem que decide o que e publico, o que e limitado e o que e privado. Cobertura medida na Fase 0: `server/routes` 55,6 %, `server.ts` 0 %.

## What Changes

- `tests/caracterizacao/_app.ts`: harness que sobe o app na ordem do `server.ts` (requestId, json, compression, health, webhook, rank, auth, limitadores, 13 routers, erroGlobal), em `self-host` ou `publico` (JWT ES256 injetado), sobre banco efemero; `forma()` reduz respostas a chaves+tipos; `semear()` cria cartoes, sessao e rodada.
- Um arquivo por fluxo: auth e conta, idioma, sessao e rodada, FSRS, seeds, IA (upstream falso), importacao Anki, estatisticas, tema e posse, planos e quotas, rank publico.
- `montagem-espelha-o-server.test.ts`: a lista de routers do harness e a do `server.ts` nao podem divergir.
- `scripts/testes/rotas-sem-caracterizacao.mjs`: cruza as rotas registradas com as chamadas nos testes de caracterizacao; toda rota critica aparece em pelo menos um.

## Nao-escopo

Nenhuma remocao, movimentacao ou correcao de comportamento de produto: a Fase 1 so grava o que existe. Um teste que encontra um defeito o registra com `// caracterizacao: comportamento atual` e a correcao vai para a fase que a possui.
