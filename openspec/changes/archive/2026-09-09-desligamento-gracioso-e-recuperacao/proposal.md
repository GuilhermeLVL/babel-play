## Why

`grep -rn "SIGTERM\|SIGINT\|process.on(" server server.ts` devolvia ZERO: um SIGTERM matava o
processo no meio de uma escrita. E o `cluster.on('exit')` refazia qualquer worker, inclusive
durante o desligamento.

## What Changes

- SIGTERM/SIGINT: `server.close()`, dreno com teto, `wal_checkpoint(TRUNCATE)`, `client.close()`,
  saida 0; teto estourado sai com 1.
- O primario repassa o sinal e trava o respawn.
- `DESLIGAMENTO_TIMEOUT_MS` declarada, com o padrao de 10 s justificado pelo prazo do `docker stop`.

## Nao-escopo

`closeIdleConnections()`. Medido: com socket keep-alive aberto o dreno leva 2 ms sem ela — o Node
ja derruba a ociosa dentro do `close()` desde a v19, e o projeto exige >=22.
