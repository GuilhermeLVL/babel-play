## Why

A rodada de saneamento (plano aprovado em 08/09) exige medir antes de tocar. Nao havia inventario de ferramentas nem numeros de partida coletados pela mesma ferramenta que vai medir o fim. A auditoria de 07/09 mediu com 15 requisicoes em serie e sem percentis; a rodada precisa de p50/p95/p99, cobertura, segredos no historico e codigo morto cru, todos reproduziveis.

## What Changes

- Inventario de MCPs e ferramentas locais em `openspec/audits/2026-09-08-baseline/ferramentas.md`, com a fase em que cada um entra.
- Contagem de arquivos e linhas por diretorio e extensao; arvore de dependencias (`npm ls --all --json`).
- Lint por regra (`eslint -f json`), `npm audit --json` + `audit:gate`, `gitleaks` no historico inteiro.
- Saida crua de knip (arquivos, deps, exports, tipos), depcheck, jscpd, madge e ast-grep em JSON.
- Instala `gh` (winget) e `autocannon` (devDep). Remove nada.

## Nao-escopo

Nenhuma remocao, movimentacao ou otimizacao: a Fase 0 so mede e instala.
