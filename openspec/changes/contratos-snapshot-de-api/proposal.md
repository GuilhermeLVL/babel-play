## Why

Os contratos entre cliente, Express e espelho anonimo ja foram alinhados (change `contratos-alinhados-nas-tres-pontas`), mas nada congela a FORMA das respostas: um campo que some so aparece quando uma tela quebra. A Fase 2 vai remover exports e a Fase 3 vai mover arquivos; uma mudanca de contrato precisa falhar no CI, nao na tela.

## What Changes

- Snapshot de forma (`toMatchFileSnapshot`) para cada resposta dos testes de caracterizacao, em `tests/caracterizacao/__snapshots__/<metodo>.<rota>.json`.
- `paridade-de-forma.test.ts`: as mesmas rotas contra `src/data/efemero/servidor.ts`, comparadas ao snapshot do Express (chaves do espelho sao subconjunto do servidor ou justificadas).
- Prova negativa registrada: mudar um campo de `/api/health` numa branch descartavel e ver o teste falhar.

## Nao-escopo

Nenhuma remocao, movimentacao ou correcao de comportamento de produto: a Fase 1 so grava o que existe. Um teste que encontra um defeito o registra com `// caracterizacao: comportamento atual` e a correcao vai para a fase que a possui.
