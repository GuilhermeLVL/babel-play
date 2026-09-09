## Why

A rede so protege se rodar a cada push. O `ci.yml` nao roda cobertura, nao conhece os tres projetos e2e e nao tem piso.

## What Changes

- `ci.yml`: `test:cov` com `coverage.thresholds` = baseline (linhas 42, ramos 34, funcoes 36 — catraca que so sobe), tres projetos e2e, artefato `coverage/`.
- Job unico mantido enquanto ficar abaixo de 15 min.

## Nao-escopo

Nenhuma remocao, movimentacao ou correcao de comportamento de produto: a Fase 1 so grava o que existe. Um teste que encontra um defeito o registra com `// caracterizacao: comportamento atual` e a correcao vai para a fase que a possui.
