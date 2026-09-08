## Why

A Fase 0 exige branch a partir de `main` e CI verde antes de qualquer mudanca. A run da CI em `47ecf10` esta VERMELHA em `npm test` (run 34278328814) e o log do job so e legivel com admin — o dono ve, esta sessao nao. Alem disso `audit:gate` passou a falhar por um advisory novo de `@xmldom/xmldom`.

## What Changes

- Branch `saneamento/2026-09-08`.
- `@xmldom/xmldom` 0.8.13 -> 0.8.15 (transitivo de `mammoth`), `audit:gate` verde de novo.
- `ci.yml`: a suite roda com `--reporter=json` e o JSON sobe como artefato `if: always()`; trace/screenshot do Playwright idem. Actions fixadas por SHA como as demais.
- Reproducao local da falha em Node 22 e `TZ=UTC` (o runner e Ubuntu/UTC; a maquina local e Node 24 / America/Sao_Paulo).

## Nao-escopo

Nenhuma remocao, movimentacao ou otimizacao: a Fase 0 so mede e instala.
