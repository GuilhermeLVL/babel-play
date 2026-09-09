## Why

`tests/contratos/rotas-espelhadas.test.ts` cobra um lado (toda rota que o cliente chama existe sem conta) e nada cobrava o outro: toda rota que o servidor registra tem quem a chame? Foi assim que `POST /api/ai/llm/chat/completions` ficou orfa (achado A52 de 07/09) sem que nada acusasse.

## What Changes

- `scripts/testes/rotas-sem-consumidor.mjs`: cruza as 84 rotas registradas com as chamadas em `src/`, `scripts/`, `tests/` e `.github/`; rota sem chamador e sem motivo escrito derruba o CI.
- Seis rotas sem chamador em `src/` ficam NOMEADAS com a razao, e nenhuma delas e removida: sao capacidade de servidor pronta e testada cuja tela nunca foi feita.

## Nao-escopo

Consolidar duplicata (isso e Fase 3, com ADR), mover arquivo (Fase 3) e corrigir comportamento (Fase 4). Aqui so sai o que nao tem consumidor, com prova.
