## Why

Existem testes de migracao do zero, de replica e de integridade referencial. Falta migrar A PARTIR DO ESTADO ATUAL (o banco real anonimizado), provar o rollback (que no Drizzle e restauracao de backup) e conferir `foreign_key_check` e `integrity_check` apos cada migration.

## What Changes

- `scripts/db/fixture-anonimizada.mjs`: gera `tests/fixtures/banco-estado-atual.db` a partir de uma copia com PII zerada (emails, nomes, tokens, apelidos); teste que faz grep por `@` e por nomes.
- `migracoes-sobre-estado-atual.test.ts`: todas as migrations sobre a fixture; `PRAGMA foreign_key_check` vazio e `integrity_check` ok apos cada uma.
- `rollback-por-backup.test.ts`: `scripts/backup.mjs` + restauracao + boot.

## Nao-escopo

Nenhuma remocao, movimentacao ou correcao de comportamento de produto: a Fase 1 so grava o que existe. Um teste que encontra um defeito o registra com `// caracterizacao: comportamento atual` e a correcao vai para a fase que a possui.
