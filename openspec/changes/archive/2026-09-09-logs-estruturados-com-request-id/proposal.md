## Why

O id do request existia e quase nunca aparecia. Medido em 2026-09-09, varrendo `server/**` +
`server.ts` e descontando comentarios: das 45 chamadas de `log()`, **23 nao passavam `requestId`**.
E a distribuicao diz por que isso nao se resolve pedindo disciplina — `storageQuota` (4),
`usageQuota` (5), `bootStatus` (3), `entitlements`, `repositories/credentials`: nenhum deles TEM um
`Request` em maos.

## What Changes

- `AsyncLocalStorage` aberto no `requestIdMiddleware` e lido dentro de `log()`. Nenhum chamador
  muda, e as 23 linhas passam a sair correlacionadas.
- O explicito continua ganhando; fora do ciclo de um request nao inventa id.
- `run` e nao `enterWith`, que contaminaria o tick inteiro.

## Nao-escopo

Passar o id a mao. Era o desenho anterior, e foi ele que produziu 50% de adesao — disciplina que
precisa ser lembrada em cada chamada nova nao e garantia, e estatistica.
