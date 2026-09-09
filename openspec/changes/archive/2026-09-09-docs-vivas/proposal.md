## Why

Não havia runbook: `docs/deploy.md` explica como SUBIR, e nada explicava o que ler com o serviço já
rodando — e às vezes já quebrado. O `CONTRIBUTING.md` prometia uma bateria de cinco comandos quando
a CI roda quinze, e dizia "~1.850 testes" quando são 3.901. E `docs/arquitetura.md` se declara
histórico desde julho, sem um mapa mínimo de onde o código mora hoje.

## What Changes

- `docs/runbook.md`: as duas perguntas de saúde e por que são duas, ler o diário, `/metrics` em
  cluster, desligamento, rotação de segredos, os três baldes de limite, medir de novo, e uma tabela
  de sintomas conhecidos.
- `CONTRIBUTING.md`: a bateria de verdade, por que as regras têm fixture, a armadilha do `rtk` com o
  Playwright, e como medir uma mudança que se diz mais rápida.
- `docs/arquitetura.md` ganha a seção 0 com a árvore atual e o registro de que a árvore por domínio
  foi aprovada e não executada.

## Nao-escopo

Reescrever `docs/arquitetura.md`. Ele é histórico e está marcado como tal desde 2026-07-24; a
descrição vigente mora em `openspec/specs/`.
