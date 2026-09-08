## Why

O arranque e o peso de cada tela ja tinham um script (`scripts/perf/medir-rotas.mjs`), mas nao havia bundle por rota nem Lighthouse mobile/desktop registrados.

## What Changes

- `bundle-medir-rotas.txt` (build de producao real) e `bundle-por-rota.md` (manifest do Vite, chunks proprios de cada entrada `lazy`).
- Lighthouse 13 (`npx lighthouse`, headless) em `/`, `/jogar`, `/capturar`, `/vocabulario`, `/loja`, `/perfil`, mobile e desktop; 3 execucoes para `/` e `/jogar`, mediana por `scripts/perf/resumir-lighthouse.mjs`.

## Nao-escopo

Nenhuma remocao, movimentacao ou otimizacao: a Fase 0 so mede e instala.
