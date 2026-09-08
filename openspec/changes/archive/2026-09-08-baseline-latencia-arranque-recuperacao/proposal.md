## Why

A auditoria de 07/09 mediu latencia em serie (15 requisicoes) e nunca mediu arranque nem recuperacao apos morte do processo. A rodada precisa de percentis sob concorrencia e de prova de que um `kill -9` sob carga nao perde escrita confirmada.

## What Changes

- `scripts/perf/latencia.mjs` (autocannon, 10 conexoes, aquecimento descartado, p50/p95/p99 por rota critica, inclusive `POST /exercises/rodada` e `POST /vocab/:id/review`).
- `scripts/perf/arranque.mjs` (spawn ate `/api/health` 200, mediana de 5).
- `scripts/perf/recuperacao.mjs` (supervisor em processo, carga de escrita, `kill -9` aos 10 s, tempo ate health 200, `integrity_check`, 2xx x linhas gravadas).

## Nao-escopo

Nenhuma remocao, movimentacao ou otimizacao: a Fase 0 so mede e instala.
