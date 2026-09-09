## Why

Sete arquivos somavam 15.833 linhas e cada um servia a cinco dominios. O mapa levantado do grafo de
imports mostrou que mover esses arquivos nao os coloca em dominio nenhum — eles se dividem.

## What Changes

- Sete divisoes, uma por commit, com o corte por faixa de linha lido do proprio arquivo.
- 42 modulos novos com dono; a ordem dos hooks VERIFICADA (166/166 e 70/70, `diff` vazio).
- `montarRodada` vai para `src/core/minigames/rodada.ts` como funcao pura, com 25 casos.

## Nao-escopo

Mover arquivo de lugar (a movimentacao por dominio e change propria) e mudar comportamento.
