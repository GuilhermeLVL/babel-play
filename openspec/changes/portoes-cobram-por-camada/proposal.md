## Why

Tres regras de portao usam o caminho de HOJE, nao a camada: `env-fora-de-config.yml:8` e
`rota-fala-com-o-banco.yml:9` casam `server/routes/*.ts` (um nivel so), e `eslint.config.js:69`
lista quatro pastas literais para `no-console: error`. No dia em que as rotas fossem para
`server/dominios/<dominio>/rotas/`, as tres passariam a cobrar de ZERO arquivo — sem erro, sem
aviso, com a cara de codigo limpo.

E o mesmo defeito que a Fase 2 corrigiu no `rotas-sem-consumidor.mjs`, que lia a si mesmo e dava
toda rota como viva. Um portao que passa sempre e pior que portao nenhum, porque ninguem procura
o que ele deveria ter achado.

## What Changes

- Os dois globs de ast-grep passam a listar `server/routes/**/*.ts` E `server/**/rotas/**/*.ts`.
- O bloco de `no-console` do eslint ganha as tres camadas por nome (`rotas`, `servico`,
  `repositorio`), alem das quatro pastas atuais.
- **Prova negativa registrada** (`evidencias/prova-negativa.md`): uma rota criada em
  `server/dominios/prova/rotas/` com as tres violacoes, os tres portoes acusando, e a limpeza.

## Nao-escopo

Mover arquivo. Esta change so garante que os portoes sobrevivam a movimentacao que vem depois.
