## Why

A auditoria contou 15 copias de `normalize('NFD')`. Sao tres perguntas diferentes; unificar as tres
quebraria a comparacao de frases.

## What Changes

- ADR 0004, `dobrarTexto(s, { espacos })` no nucleo, os quatro chamadores ligados a ela, e
  `tests/normalizacaoDeTexto.test.ts` com 13 casos que fixam a diferenca entre as tres.

## Nao-escopo

Mover arquivo de lugar (a movimentacao por dominio e change propria) e mudar comportamento.
