## Why

O `tsconfig.json` da raiz nunca teve `strict`; so `src/core` era estrito, por tsconfig proprio.

## What Changes

- `tsconfig.estrito.json` com `strict` sobre a arvore inteira, e `npm run typecheck:estrito` no CI.
- Os 81 erros que ele acusava foram a ZERO — nao ha lista de pendentes porque nao sobrou nenhum.

## Nao-escopo

Mover arquivo de lugar (a movimentacao por dominio e change propria) e mudar comportamento.
