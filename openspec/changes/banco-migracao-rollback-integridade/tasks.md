- [x] 1.1 `fixture-anonimizada.mjs` + teste de PII
- [x] 1.2 `migracoes-sobre-estado-atual.test.ts`
- [x] 1.3 `rollback-por-backup.test.ts`

## Achados registrados (`// caracterizacao:` nos testes)
- Migration que falha sobre o estado atual (ex.: `0026` DROP COLUMN repetido) e engolida com `console.warn` por `aplicarMigrations` porque `schemaPresente()` e verdadeiro: o diario fica atrasado e o boot repete a falha em silencio. Fase 5 (`health-e-ready`): boot deve denunciar.
- `__drizzle_migrations.id` e `SERIAL` (tipo Postgres): 28 linhas com `id = NULL`.
- No Windows o handle do libsql sobrevive ao `close()`: `rmSync` do arquivo falha com EPERM; restaurar e sobrescrever no lugar.
