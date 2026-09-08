## Why

`@vitest/coverage-v8` estava instalado e nunca configurado: 313 arquivos de teste e nenhum numero de cobertura. Sem ele nao ha piso para a catraca da Fase 1.

## What Changes

- Bloco `coverage` em `vitest.config.ts` (v8, `src/**`, `server/**`, `server.ts`; reporters text-summary/json/json-summary/lcov).
- Script `test:cov` e `scripts/cobertura-por-modulo.mjs` (agrega `coverage-final.json` por diretorio; `--md`).
- Contagem da suite por `vitest --reporter=json` e do e2e por JSON do Playwright.

## Nao-escopo

Nenhuma remocao, movimentacao ou otimizacao: a Fase 0 so mede e instala.
