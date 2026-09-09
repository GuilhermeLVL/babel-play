## Why

O repositorio nao tinha formatter, e a medicao mostrou que tambem nao tinha caos: `src/` fecha
statement com ponto e virgula e `server/`/`tests/`/`scripts/` nao.

## What Changes

- `prettier.config.mjs` com `semi` por area, `.editorconfig`, husky + lint-staged.
- `eslint-plugin-simple-import-sort` ligado; 664 avisos corrigidos.
- A passada GERAL do Prettier (1.111 arquivos) fica para depois das movimentacoes.

## Nao-escopo

Mover arquivo de lugar (a movimentacao por dominio e change propria) e mudar comportamento.
