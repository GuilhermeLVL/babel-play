# Fase 1 da migração para Cloudflare: SQLite → Postgres (Drizzle pg-core)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trocar o banco do servidor de SQLite/libsql para Postgres (dialeto `pg-core` do Drizzle) mantendo a lógica dos 35 repositórios e a suíte de testes verde, com um harness de teste em Postgres embutido (PGlite) que não exige Docker nem serviço externo.

**Architecture:** `server/db/db.ts` continua a única costura com o driver: escolhe PGlite (dev e testes, `pglite:`) ou `pg` (produção, `postgres://`) pela `DATABASE_URL`, e expõe `db`, `emTransacao`, `emLote`, `linhasAfetadas` e `linhas`. O schema vira `pgTable` com todos os `integer` em `bigint` (modo `number`); as 54 migrações SQLite dão lugar a um baseline gerado + um arquivo manual com os 25 triggers e os seeds de `flags`. Nada de Workers, Hyperdrive, R2 ou Cron nesta fase: o servidor Node continua subindo (é a variante de retorno da spec).

**Tech Stack:** drizzle-orm 0.45 (`pg-core`, `drizzle-orm/pglite`, `drizzle-orm/node-postgres`), drizzle-kit 0.31 (`dialect: 'postgresql'`), `@electric-sql/pglite`, `pg` + `@types/pg`, vitest 4, tsx. `@libsql/client` permanece só para ler `.apkg` (Anki) e para o script de migração de dados.

**Spec:** `docs/specs/2026-10-19-migracao-cloudflare.md` (opção C, seção "Camada de dados", itens marcados **[C]**).

## Global Constraints

- Branch `cloudflare/migracao`; a `main` e o deploy no Fly não mudam até o portão G1.
- Textos, comentários e docs em português do Brasil; identificadores seguem o padrão da pasta.
- `npm run typecheck`, `npm run lint` (`--max-warnings 0`) e `npm test` verdes ao fim de cada tarefa que mexe em código; `npx knip` sem export morto novo ao fim da fase.
- Nunca enfraquecer um teste para passar. Testes que só existem por causa do SQLite (WAL, PRAGMA, snapshot por `VACUUM INTO`, réplica/cluster com arquivo) são **apagados com justificativa no commit** e, onde a spec pede, substituídos por equivalente em Postgres.
- Segredos só em `.env`; `DATABASE_URL` de produção nunca entra em arquivo versionado.
- Gerenciador: npm (`package-lock.json`). Commits pequenos, mensagens em inglês ou português como o histórico.
- `data/babel.db` (banco real do desenvolvedor) nunca é tocado por teste; o setup global aponta para `pglite://memory`.

## Review Focus

Entradas e condições que a spec implica mas nenhum teste cobria. Cada linha ganhou um teste na tarefa dona:

1. `count(*)` e `sum()` crus voltam como **string** no `pg` (bigint/numeric) e como number no PGlite em alguns caminhos. Código que faz aritmética com o resultado cru quebra em produção e passa no teste. → Tarefa 2: `linhas()` normaliza e o teste afirma `typeof === 'number'` em ambos os drivers.
2. Erro dentro de uma transação **aborta a transação inteira** no Postgres ("current transaction is aborted"), enquanto o SQLite deixava continuar. Qualquer `try/catch` que engole um erro e segue dentro de `emTransacao`/`emLote` passa a falhar no `COMMIT`. → Tarefa 2: teste que prova o comportamento; Tarefa 5 revisa os 3 sites.
3. `ON CONFLICT (...) WHERE deleted_at IS NULL` só funciona se existir um índice único parcial com **exatamente** o mesmo predicado; o Postgres rejeita o upsert caso contrário. → Tarefa 1: teste de upsert em `vocab_cards` com um gêmeo apagado.
4. `LIKE` no Postgres diferencia maiúsculas; no SQLite (ASCII) não. Busca digitada pela pessoa com "Casa" deixa de achar "casa". → Tarefa 4: teste de busca em `sessions`/`vocab` com caixa diferente.
5. `rowsAffected`/`rowCount`/`affectedRows` têm nomes diferentes por driver; um `undefined > 0` vira `false` em silêncio e a idempotência do webhook do Asaas (`billingEventsRepo.marcarSeNovo`) deixaria de detectar duplicata. → Tarefa 2: `linhasAfetadas()` com teste nos dois drivers; Tarefa 3: teste de `marcarSeNovo` duplicado.

---

### Task 1: Schema em `pg-core` e baseline de migrações

**Files:**

- Modify: `server/db/schema.ts` (1214 linhas, 34 tabelas)
- Modify: `drizzle.config.ts`
- Modify: `package.json` (deps)
- Create: `server/db/migrations-pg/0000_baseline.sql` (gerado) e `server/db/migrations-pg/meta/*` (gerado)
- Create: `server/db/migrations-pg/0001_triggers_e_flags.sql` (manual)
- Rename: `server/db/migrations/` → `server/db/migrations-sqlite/` (fica até a Tarefa 10 usar e a Fase 5 apagar)
- Test: `tests/integration/schema-pg-baseline.test.ts`

**Interfaces:**

- Produces: `server/db/schema.ts` exporta as mesmas 34 tabelas com os mesmos nomes de export e de coluna; tipos de coluna: `text` → `text`, `integer` → `bigint('…', { mode: 'number' })` (todos os 84, inclusive flags 0/1 e contadores), `integer({ mode: 'boolean' })` (1 em `schema.ts:1065`) → `boolean`, `real` (11) → `doublePrecision`, coluna gerada `srcLangBase` → `generatedAlwaysAs(sql\`lower(substr(coalesce(src_lang,''),1,2))\`)`(STORED, sem`mode`). Índices parciais (`.where(sql\`deleted_at is null\`)`) mantidos literalmente. `references()`mantidos sem`onDelete`.
- Produces: pasta `server/db/migrations-pg/` consumida pelas Tarefas 2 e 8.

- [ ] **Step 1: Instalar dependências e apontar o drizzle-kit para Postgres**

```bash
npm i pg @electric-sql/pglite && npm i -D @types/pg
```

Em `drizzle.config.ts`: `dialect: 'postgresql'`, `out: './server/db/migrations-pg'`, `dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://localhost/babel' }` (o kit só precisa da URL para `push`/`studio`; `generate` não conecta).

- [ ] **Step 2: Renomear a pasta das migrações SQLite**

```bash
git mv server/db/migrations server/db/migrations-sqlite
```

Atualizar a exclusão de cobertura em `vitest.config.ts:49` (`server/db/migrations/**` → `server/db/migrations-*/**`) e `process.env.MIGRATIONS_DIR` em `tests/setup-db-isolada.ts:34` para `migrations-pg`.

- [ ] **Step 3: Reescrever `server/db/schema.ts` para `pg-core`**

Import: `import { bigint, boolean, doublePrecision, index, pgTable, text, unique, uniqueIndex } from 'drizzle-orm/pg-core'`. Aplicar a regra de tipos do bloco Interfaces a todas as colunas; manter comentários, nomes e ordem. Em `server/db/repositories/conta.ts:12,132-133` trocar `SQLiteTable` por `PgTable` de `drizzle-orm/pg-core`.

- [ ] **Step 4: Gerar o baseline**

```bash
npx drizzle-kit generate --name baseline
```

Expected: `server/db/migrations-pg/0000_baseline.sql` com 34 `CREATE TABLE`, os 52 `index` + 14 `uniqueIndex` + 4 `unique` e os 12 `REFERENCES`. Conferir no arquivo que os 21 índices parciais trazem o `WHERE`.

- [ ] **Step 5: Escrever `0001_triggers_e_flags.sql` à mão**

Portar os 25 triggers de `server/db/migrations-sqlite/0032_*.sql` e `0053_*.sql` como uma função PL/pgSQL por família e um `CREATE TRIGGER` por tabela/evento, com os mesmos nomes (`versao_<tabela>_<ins|upd|del>` sobre `vocab_cards`, `vocab_occurrences`, `sessions`, `utterances`, `review_logs`, `exercise_results`; `marca_<tabela>_<ins|upd|del>` sobre `review_logs` e `exercise_results`; `marca_vocab_cards_idioma` com `WHEN (OLD.src_lang IS DISTINCT FROM NEW.src_lang)`). O corpo preserva a semântica: `INSERT INTO versoes_de_dados … ON CONFLICT (user_id) DO UPDATE SET vocab = versoes_de_dados.vocab + 1, …` (no Postgres a coluna no `DO UPDATE` precisa do prefixo da tabela ou de `EXCLUDED`). Em seguida, os seeds de `flags` extraídos dos `INSERT … INTO flags` de `0031`, `0036`, `0040`, `0046`, `0048`, `0051` como `INSERT … ON CONFLICT DO NOTHING`. Separar statements com `--> statement-breakpoint` e registrar o arquivo em `meta/_journal.json` (segunda entrada, `tag: "0001_triggers_e_flags"`).

- [ ] **Step 6: Escrever o teste do baseline**

`tests/integration/schema-pg-baseline.test.ts` (usa o harness da Tarefa 3; esta tarefa só deixa o teste pronto e marcado `it.todo` até a Tarefa 3 ligar o PGlite):

```ts
it('o baseline cria as 34 tabelas, os 25 triggers e semeia as flags', async () => {
  const h = await setupEphemeralDb()
  const { db } = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
  const tabelas = linhas<{ n: string }>(await db.execute(sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name <> '__drizzle_migrations'`))
  expect(tabelas[0].n).toBe(34)
  const triggers = linhas<{ n: number }>(await db.execute(sql`select count(*)::int as n from pg_trigger where not tgisinternal`))
  expect(triggers[0].n).toBe(25)
  const flags = linhas<{ n: number }>(await db.execute(sql`select count(*)::int as n from flags`))
  expect(flags[0].n).toBe(/* número de INSERTs distintos em flags nas migrações SQLite, contado no Step 5 */)
})
it('upsert em vocab_cards ignora o gêmeo apagado (índice parcial casa com o ON CONFLICT)', …) // insere (user, norm) com deleted_at, depois insere o mesmo (user, norm) vivo via vocabRepo e espera 2 linhas
```

- [ ] **Step 7: Typecheck do schema**

Run: `npm run typecheck`
Expected: erros só em arquivos que ainda importam `drizzle-orm/libsql` ou usam `db.run`/`rowsAffected` (serão tratados nas Tarefas 3 e 4). Nenhum erro dentro de `schema.ts`.

- [ ] **Step 8: Commit**

```bash
git add -A server/db drizzle.config.ts package.json package-lock.json vitest.config.ts tests/setup-db-isolada.ts tests/integration/schema-pg-baseline.test.ts
git commit -m "feat(db): schema em pg-core, baseline de migrações Postgres e triggers portados"
```

---

### Task 2: Driver duplo em `server/db/db.ts` e harness de testes em PGlite

**Files:**

- Modify: `server/db/db.ts` (reescrever)
- Modify: `server/db/migrate.ts`, `server/db/manutencao.ts:105-118` (`schemaPresente`) e a checagem de migrações "atrasadas"
- Modify: `tests/setup-db-isolada.ts:22-34`, `tests/harness/ephemeralDb.ts`
- Modify: `server/db/observadorDeConsultas.ts` (só o tipo de instrução, se precisar)
- Test: `tests/integration/db-driver.test.ts`

**Interfaces:**

- Produces (`server/db/db.ts`):
  - `export const urlDoBanco: string` (default `pglite:./data/pg`), `export const bancoEmbutido: boolean` (`urlDoBanco.startsWith('pglite:')`).
  - `export const db: DB` onde `type DB = PgDatabase<PgQueryResultHKT, typeof schema>` (união que cobre `PgliteDatabase` e `NodePgDatabase`).
  - `export type ExecutorDb = DB | Parameters<Parameters<DB['transaction']>[0]>[0]`.
  - `export async function emTransacao<T>(fn: (tx: ExecutorDb) => Promise<T>): Promise<T>` (só `db.transaction(fn)`; sem PRAGMA).
  - `export async function emLote<T extends readonly unknown[]>(montar: (tx: ExecutorDb) => { [K in keyof T]: PromiseLike<T[K]> | (() => Promise<T[K]>) }): Promise<T>`: roda as instruções **em sequência** dentro de uma transação e devolve os resultados na ordem (substitui `db.batch`). Implementação: aceitar funções `() => Promise` e chamá-las uma a uma com `await` (nunca `Promise.all`: uma conexão só).
  - `export function linhasAfetadas(r: unknown): number` (`rowCount` do `pg`, `affectedRows` do PGlite, `0` se ausente).
  - `export function linhas<T>(r: unknown): T[]` (`rows` de ambos; converte strings numéricas vindas de `count`/`sum` quando o campo é `bigint`/`numeric` usando o `fields`/`rowDescription` do resultado; se não houver metadado, devolve como veio).
  - `export async function fecharBanco(): Promise<void>` (`pool.end()` ou `pglite.close()`).
  - `export const dbReady: Promise<void>` (resolve após um `select 1`; sem WAL).
- Produces (`tests/harness/ephemeralDb.ts`): `setupEphemeralDb(): Promise<EphemeralDb>` com `{ load, cleanup }` (sem `dbPath`); internamente `process.env.DATABASE_URL = 'pglite://memory'` e `migrate` de `drizzle-orm/pglite/migrator` com `migrationsFolder: process.env.MIGRATIONS_DIR`.
- Consumes: pasta `server/db/migrations-pg/` da Tarefa 1.

- [ ] **Step 1: Escrever o teste do driver**

```ts
// tests/integration/db-driver.test.ts
it('abre PGlite em memória e responde select 1', async () => {
  const h = await setupEphemeralDb()
  const { db, linhas } = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
  expect(linhas<{ um: number }>(await db.execute(sql`select 1 as um`))).toEqual([{ um: 1 }])
})
it('emTransacao desfaz tudo quando a função lança', …) // insere em flags, lança, espera count igual ao de antes
it('erro engolido dentro da transação ainda aborta o COMMIT', …) // dentro de emTransacao: try { insert inválido } catch {} ; insert válido → espera rejeição com /current transaction is aborted/
it('emLote devolve os resultados na ordem e numa transação só', …) // 3 inserts, o 3º inválido → nenhum persiste
it('linhasAfetadas lê rowCount e affectedRows', () => { expect(linhasAfetadas({ rowCount: 2 })).toBe(2); expect(linhasAfetadas({ affectedRows: 3 })).toBe(3); expect(linhasAfetadas({})).toBe(0) })
it('linhas converte count(*) para number', …) // select count(*) as n from flags → typeof n === 'number'
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/integration/db-driver.test.ts`
Expected: FAIL (`drizzle-orm/libsql` ainda importado; `emLote` não existe).

- [ ] **Step 3: Reescrever `server/db/db.ts`**

Seleção do driver por prefixo da `DATABASE_URL`: `pglite://memory` → `new PGlite()`; `pglite:<caminho>` → `new PGlite(caminho)` (criar o diretório); `postgres://`/`postgresql://` → `new Pool({ connectionString, max: 5 })`; qualquer outro prefixo → lançar `Erro de configuração: DATABASE_URL deve começar com pglite: ou postgres:`. Manter a medição (`medirConsultas`) embrulhando `db.execute`/`query` do driver escolhido ou, mais simples, embrulhando `pool.query`/`pglite.query` antes de passar ao `drizzle`.

- [ ] **Step 4: Adaptar harness, setup e scripts de migração**

`tests/setup-db-isolada.ts`: `process.env.DATABASE_URL = 'pglite://memory'` (sem `mkdtemp` para o banco; manter o `DOTENV_CONFIG_PATH` inexistente). `tests/harness/ephemeralDb.ts`: conforme Interfaces. `server/db/migrate.ts`: `migrate` de `drizzle-orm/pglite/migrator` ou `node-postgres/migrator` conforme `bancoEmbutido`; listar tabelas por `information_schema.tables`. `manutencao.ts`: `schemaPresente()` → `select to_regclass('public.sessions') is not null as ok`; "atrasadas" lê `drizzle.__drizzle_migrations` (schema `drizzle`).

- [ ] **Step 5: Rodar o teste do driver e o do baseline**

Run: `npx vitest run tests/integration/db-driver.test.ts tests/integration/schema-pg-baseline.test.ts`
Expected: PASS (remover o `it.todo` da Tarefa 1).

- [ ] **Step 6: Commit**

```bash
git add server/db/db.ts server/db/migrate.ts server/db/manutencao.ts tests/setup-db-isolada.ts tests/harness/ephemeralDb.ts tests/integration/db-driver.test.ts tests/integration/schema-pg-baseline.test.ts
git commit -m "feat(db): driver duplo (PGlite/pg), emLote e harness de testes em Postgres embutido"
```

---

### Task 3: Trocar a API do driver nos repositórios (`db.run`, `db.all`, `db.get`, `rowsAffected`, `client`)

**Files:**

- Modify: 22 `db.run(` em `agregados.ts`(6), `credits.ts`(3), `cacheDeTraducao.ts`, `conta.ts`, `economia.ts`(2), `estadoDaConta.ts`(2), `exerciseResults.ts`, `glossario.ts`, `rank.ts`, `seedSpends.ts`(2), `settings.ts`, `routes/health.ts`(2)
- Modify: 27 `rowsAffected` nos 19 arquivos listados pelo levantamento (`billingEvents`, `cacheDeTraducao`, `conta`, `credentials`, `credits`, `economia`, `estadoDaConta`, `exerciseResults`, `gastoDeIa`, `glossario`, `rank`, `seedSpends`, `testesPremium`, `usageCounters`, `utterances`, `vinculos`, `vocab`, `lib/limpezaDiaria`, `lib/storageQuota`)
- Modify: importações de `client` em `server.ts`, `server/lib/limpezaDiaria.ts`, `server/db/repositories/{agregados,testesPremium}.ts`, `scripts/vitrine/semear.ts`
- Test: os testes existentes de cada repositório (`tests/integration/*`), mais `tests/integration/billing-webhook-idempotente.test.ts` (novo, se não existir equivalente)

**Interfaces:**

- Consumes: `db.execute`, `linhas`, `linhasAfetadas`, `emTransacao` da Tarefa 2.
- Produces: nenhum export novo; nenhuma assinatura pública de repositório muda.

- [ ] **Step 1: Teste de idempotência do webhook**

```ts
it('marcarSeNovo devolve false na segunda chamada com o mesmo evento', async () => {
  expect(await billingEventsRepo.marcarSeNovo('evt_1', …)).toBe(true)
  expect(await billingEventsRepo.marcarSeNovo('evt_1', …)).toBe(false)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/integration/billing-webhook-idempotente.test.ts`
Expected: FAIL (`rowsAffected` é `undefined`).

- [ ] **Step 3: Substituir mecanicamente**

`db.run(x)` → `db.execute(x)`; `db.all<T>(x)` → `linhas<T>(await db.execute(x))`; `db.get<T>(x)` → `linhas<T>(await db.execute(x))[0]`; `r.rowsAffected` → `linhasAfetadas(r)`; `client.execute('…')` → `db.execute(sql.raw('…'))` (ou remover quando era PRAGMA: ver Tarefa 6). `server.ts` deixa de importar `client` e `aplicarPragmas`; usa `dbReady` e `fecharBanco()` no desligamento.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: zero erros fora de `leituraCompacta.ts`, `snapshot.ts`, `desligamento.ts`, `limpezaDiaria.ts`, `agregados.ts` (Tarefas 4 a 6).

- [ ] **Step 5: Rodar os testes dos repositórios tocados**

Run: `npx vitest run tests/integration/billing-webhook-idempotente.test.ts tests/integration/rate-limit-store.test.ts tests/integration/credits*.test.ts tests/integration/vocab*.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A server scripts/vitrine/semear.ts tests/integration/billing-webhook-idempotente.test.ts
git commit -m "refactor(db): repositórios usam db.execute, linhas e linhasAfetadas (sem API do libsql)"
```

---

### Task 4: Funções específicas do SQLite → Postgres

**Files:**

- Modify: `server/db/leituraCompacta.ts:58-110` (`lerCompacto`)
- Modify: `server/db/repositories/economia.ts:73` (`group_concat`), `server/lib/storageQuota.ts:211`, `server/db/repositories/usageCounters.ts:144`, `server/db/repositories/agregados.ts:218` (`max(a,b)`), `agregados.ts:383,423` e `resumoDosCartoes.ts:162` (`CAST(x/y AS INTEGER)`)
- Modify: os 22 usos de `LIKE` em `anki.ts`, `convidados.ts`(2), `credits.ts`(3), `economia.ts`(9), `seedSpends.ts`(3), `sessions.ts`(2), `vocab.ts`(1)
- Test: `tests/integration/leitura-compacta.test.ts` (existente ou criar), `tests/integration/busca-sem-caixa.test.ts` (novo)

**Interfaces:**

- Consumes: `db.execute`, `linhas` (Tarefa 2).
- Produces: `lerCompacto<T>(colunas, de): Promise<T[]>` mantém assinatura e contrato (objetos com as chaves de `colunas[i][0]`); o truque de `json_group_array`/`printf('%!.17g')` desaparece porque o `pg` entrega `float8` sem perda.

- [ ] **Step 1: Teste de busca sem diferenciar caixa**

```ts
it('busca de sessão por título acha "Casa" quando a pessoa digita "casa"', async () => {
  await sessionsRepo.create({ …, title: 'Casa nova' })
  expect((await sessionsRepo.search(userId, 'casa')).length).toBe(1)
})
```

(Nome real do método: o que `routes/sessions.ts` usa para a busca; ajustar.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/integration/busca-sem-caixa.test.ts`
Expected: FAIL (0 resultados: `LIKE` sensível).

- [ ] **Step 3: Reescrever `lerCompacto`**

Corpo: validar identificadores como hoje; `const r = linhas<Record<string, unknown>>(await db.execute(interna))`; mapear `colunas[i][1]` → `colunas[i][0]`. Apagar `exprs`, `foraDaFaixa` e o comentário sobre a faixa de 17 algarismos (substituir por uma linha: "o driver `pg` devolve `float8` sem passar por JSON; a leitura compacta do SQLite não é mais necessária").

- [ ] **Step 4: Trocar as funções**

`group_concat(x, ',')` → `string_agg(x, ',')` (com `ORDER BY` explícito se o teste depender da ordem); `max(a, b)` de dois argumentos → `greatest(a, b)`; `CAST(x / y AS INTEGER)` → manter, confirmando que `x` e `y` são `bigint` nos dois lados (divisão inteira igual à do SQLite) ou `floor(x::float8 / y)::int` quando um deles for `doublePrecision`. `LIKE`: usar `ilike` onde o padrão vem de entrada da pessoa (busca, filtro de título/palavra); manter `like` nos prefixos fixos de métrica (`'ratelimit:%'`, `'seed:%'` etc.).

- [ ] **Step 5: Rodar os testes**

Run: `npx vitest run tests/integration/busca-sem-caixa.test.ts tests/integration/leitura-compacta.test.ts tests/integration/economia*.test.ts tests/integration/agregados-diarios.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -am "refactor(db): leitura compacta, string_agg, greatest e ilike no dialeto Postgres"
```

---

### Task 5: `db.batch` → `emLote` e as três transações interativas

**Files:**

- Modify: 21 `.batch(` em `manutencao.ts`(1), `anki.ts`(2), `conta.ts`(1), `convidados.ts`(1), `credentials.ts`(1), `exerciseResults.ts`(1), `sessions.ts`(4), `utterances.ts`(2), `vocab.ts`(6, inclusive `$client.batch` em `vocab.ts:788`), `operacao/reparoDeIdioma.ts`(1)
- Modify: `server/db/repositories/testesPremium.ts:46`, `server/lib/limpezaDiaria.ts:81-139`, `server/db/repositories/agregados.ts:264-271`
- Test: existentes `agregados-diarios`, `provisionamento-concorrente`, `teto-de-erros-entre-instancias`, `testes-premium*`, `conta-excluir*`; novo `tests/integration/agregados-concorrentes.test.ts`

**Interfaces:**

- Consumes: `emLote`, `emTransacao`, `ExecutorDb` (Tarefa 2).
- Produces: nenhuma assinatura pública muda. Trava por usuário nas reconstruções concorrentes: `select pg_advisory_xact_lock(hashtext(${userId}))` como primeira instrução da transação em `agregados.ts` e `limpezaDiaria.ts` (substitui `behavior: 'immediate'` e o retry de `SQLITE_BUSY`).

- [ ] **Step 1: Teste de reconstrução concorrente**

```ts
it('duas reconstruções simultâneas do mesmo usuário terminam sem erro e com um resultado só', async () => {
  await Promise.all([
    agregadosRepo.reconstruir(userId, hoje),
    agregadosRepo.reconstruir(userId, hoje),
  ]);
  const linhas = await agregadosRepo.lerDia(userId, hoje);
  expect(linhas).toHaveLength(1);
});
```

(Nomes reais dos métodos em `agregados.ts`; ajustar.)

- [ ] **Step 2: Rodar e ver falhar ou travar**

Run: `npx vitest run tests/integration/agregados-concorrentes.test.ts`
Expected: FAIL com `behavior` desconhecido ou duplicata.

- [ ] **Step 3: Converter os lotes**

Cada `db.batch([q1, q2, …])` vira `emLote((tx) => [() => q1(tx), () => q2(tx), …])`, reconstruindo os builders sobre `tx` (não sobre `db`). Nos 5 sites que usam o resultado (`exerciseResults.ts:514`, `utterances.ts:184,270`, `vocab.ts:1290`, `sessions.ts:233,273`) manter a desestruturação posicional. `vocab.ts:788` (`$client.batch` cru) vira `emLote` com `tx.execute(sql.raw(...))`.

- [ ] **Step 4: Converter as transações**

`testesPremium.ts`: `emTransacao` sem mudança além de `linhasAfetadas`. `limpezaDiaria.ts` e `agregados.ts`: remover `behavior: 'immediate'` e o laço de retry em `SQLITE_BUSY`; primeira instrução `await tx.execute(sql\`select pg_advisory_xact_lock(hashtext(${userId}))\`)`. Apagar o comentário sobre "conexão nova sem PRAGMAs".

- [ ] **Step 5: Rodar os testes**

Run: `npx vitest run tests/integration/agregados-concorrentes.test.ts tests/integration/agregados-diarios.test.ts tests/integration/provisionamento-concorrente.test.ts tests/integration/teto-de-erros-entre-instancias.test.ts tests/integration/conta*.test.ts tests/integration/vocab*.test.ts tests/integration/sessions*.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -am "refactor(db): lotes em transação sequencial e trava consultiva por usuário no lugar de BEGIN IMMEDIATE"
```

---

### Task 6: Aposentar PRAGMA, WAL, `VACUUM INTO` e os testes que só existem por causa do arquivo

**Files:**

- Modify: `server/lib/limpezaDiaria.ts:195-220` (remover `PRAGMA optimize` e `wal_checkpoint`; no lugar, `analyze` opcional só quando `!bancoEmbutido`), `server/lib/desligamento.ts:120-135` (remover checkpoint; chamar `fecharBanco()`), `server/operacao/snapshot.ts` (o job `snapshot` passa a registrar "indisponível neste banco; backup por pg_dump no CI" e devolver sem erro), `server/routes/health.ts` (campo `journal_mode` sai; entra `banco: 'pglite' | 'postgres'`)
- Modify: `server.ts` (trava de boot: `CLUSTER_WORKERS > 1` ou `REPLICAS > 1` com `bancoEmbutido` recusa, mesma mensagem da trava atual de "banco local")
- Delete: `tests/integration/{db-pragmas,pragmas-transacao,migrations-replica,replica-sem-estado-local,snapshot-e-restauracao,snapshot-processo-filho,rollback-por-backup,migracoes-sobre-estado-atual}.test.ts`
- Modify: `tests/integration/desligamento-gracioso.test.ts` (afirmações sobre `-wal` saem; a de "fecha o banco antes de sair" fica), `tests/integration/cluster.test.ts` (sobe os workers com `DATABASE_URL=postgres://…` só se `process.env.TEST_PG_URL` existir; senão `it.skip` com o motivo "PGlite é de processo único; o cluster sai na Fase 2"), `tests/integration/banco-real-intocado.test.ts` (afirma que `DATABASE_URL` começa com `pglite://memory` dentro dos testes), `tests/integration/schema-igual-ao-banco.test.ts` (compara o schema Drizzle com `information_schema.columns`), `tests/integration/health-schema.test.ts`, `tests/integration/erro-e-boot.test.ts`
- Test: `tests/integration/health-banco.test.ts` (novo)

**Interfaces:**

- Consumes: `bancoEmbutido`, `fecharBanco` (Tarefa 2).

- [ ] **Step 1: Teste do health**

```ts
it('GET /api/health informa o tipo de banco e não menciona journal_mode', async () => {
  const r = await request(app).get('/api/health');
  expect(r.body.banco).toBe('pglite');
  expect(r.body).not.toHaveProperty('journal_mode');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/integration/health-banco.test.ts`
Expected: FAIL.

- [ ] **Step 3: Remover PRAGMA/WAL/VACUUM e apagar os testes listados**

Mensagem do commit explica cada arquivo apagado em uma linha (o que ele provava e por que deixou de existir).

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS, com os `skip` só em `cluster.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A server tests && git commit -m "chore(db): remove PRAGMA, WAL e VACUUM INTO; testes exclusivos do SQLite em arquivo saem com justificativa"
```

---

### Task 7: Scripts e ambiente de desenvolvimento

**Files:**

- Modify: `scripts/subir-dev.mjs` (`DATABASE_URL` default `pglite:./data/pg`), `.env.example`, `.env.production.example`, `.env.docker.example` (`DATABASE_URL=postgres://…`), `docker-compose.yml` (serviço `postgres:17` para quem quiser testar o `pg` de verdade), `scripts/backup.mjs` (vira `pg_dump` para arquivo quando `DATABASE_URL` é `postgres://`; com PGlite, copia o diretório `data/pg`)
- Modify: os 23 scripts em `scripts/` que abrem `file:` (listar com `grep -rl "file:" scripts`): os que leem o banco do app passam a importar `db` de `server/db/db.ts`; os que leem `.apkg` ou SQLite de terceiros mantêm `@libsql/client`
- Modify: `.gitignore` (`data/pg/`)
- Test: `tests/preflight-producao.test.ts` (afirma que produção exige `postgres://` e recusa `pglite:`)

- [ ] **Step 1: Teste de preflight**

```ts
it('produção recusa DATABASE_URL pglite', () => {
  expect(() => conferirConfigDeProducao({ ...base, DATABASE_URL: 'pglite:./data/pg' })).toThrow(
    /postgres:\/\//,
  );
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/preflight-producao.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar e ajustar scripts**

- [ ] **Step 4: Subir o servidor de verdade**

Run: `npm run dev:local` e `curl -s localhost:3000/api/health`
Expected: JSON com `"banco":"pglite"`; diretório `data/pg/` criado; `data/babel.db` intocado.

- [ ] **Step 5: Commit**

```bash
git add -A scripts .env*.example docker-compose.yml .gitignore tests/preflight-producao.test.ts
git commit -m "chore(dev): PGlite em data/pg como banco padrão de desenvolvimento; scripts falam com o driver novo"
```

---

### Task 8: Migração de dados SQLite → Postgres com paridade por checksum

**Files:**

- Create: `scripts/migracao/sqlite-para-postgres.ts`
- Create: `scripts/migracao/paridade.ts` (função pura reutilizada pelo script e pelo teste)
- Test: `tests/integration/migracao-sqlite-para-postgres.test.ts`

**Interfaces:**

- Produces: `migrarSqliteParaPostgres(opts: { origem: string; destino: DB; tamanhoDoLote?: number }): Promise<Relatorio>` com `Relatorio = { tabelas: Array<{ nome: string; linhasOrigem: number; linhasDestino: number; checksumOrigem: string; checksumDestino: string }>; ok: boolean }`.
- Produces: `checksumDaTabela(linhas: Record<string, unknown>[]): string` em `paridade.ts`: ordena as linhas pela chave primária, serializa cada linha com chaves ordenadas e valores normalizados (`number` inteiro como string decimal; `boolean` como `0`/`1`; `null` como `null`), e devolve o `sha256` hex da concatenação.
- Consumes: `server/db/migrations-sqlite/` (para montar a origem no teste), `server/db/schema.ts` (ordem de inserção: pais antes de filhos, mesma lista invertida de `contaRepo.excluir`), `@libsql/client` (leitura da origem), `db` da Tarefa 2.
- CLI: `npx tsx scripts/migracao/sqlite-para-postgres.ts --origem file:./data/babel.db` usa `DATABASE_URL` como destino; imprime a tabela do relatório e sai com código 1 se `ok` for falso. Tamanho do lote padrão 500 (abaixo do teto de parâmetros do `pg`, 65.535, com margem para 100 colunas).

- [ ] **Step 1: Escrever o teste**

```ts
it('migra um SQLite semeado e os checksums por tabela batem', async () => {
  const origem = await criarSqliteSemeado() // libsql file: em mkdtemp + migrações de migrations-sqlite + 3 usuários com sessões, falas, cartões, resultados e flags
  const h = await setupEphemeralDb()
  const { db } = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
  const r = await migrarSqliteParaPostgres({ origem, destino: db })
  expect(r.ok).toBe(true)
  for (const t of r.tabelas) expect(t.checksumDestino, t.nome).toBe(t.checksumOrigem)
})
it('a segunda execução é idempotente (ON CONFLICT DO NOTHING) e o relatório continua ok', …)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/integration/migracao-sqlite-para-postgres.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

Booleans do SQLite (0/1) na única coluna `boolean` viram `true/false`; a coluna gerada `src_lang_base` não é inserida; triggers de versão disparam na carga, então **desligar os triggers durante a carga** (`alter table … disable trigger all` no `pg`; no PGlite igual) e copiar `versoes_de_dados` e `estado_dos_agregados` como tabelas normais, religando ao fim.

- [ ] **Step 4: Rodar o teste e o script contra o banco real do desenvolvedor**

Run: `npx vitest run tests/integration/migracao-sqlite-para-postgres.test.ts` → PASS.
Run: `DATABASE_URL=pglite:/tmp/paridade npx tsx scripts/migracao/sqlite-para-postgres.ts --origem file:./data/babel.db`
Expected: relatório com `ok: true` para as 34 tabelas (se alguma divergir, é defeito de tipo no schema e volta para a Tarefa 1).

- [ ] **Step 5: Commit**

```bash
git add scripts/migracao tests/integration/migracao-sqlite-para-postgres.test.ts
git commit -m "feat(migracao): exporta o SQLite para Postgres em lotes com paridade por checksum"
```

---

### Task 9: Documentação e ADR

**Files:**

- Create: `docs/adr/0014-postgres-agora-pelo-cloudflare.md` (Contexto: spec e spikes; Decisão: supersede o gatilho do ADR 0006; Alternativas: Turso, D1, Containers; Consequências: PGlite em dev, `pg` em produção, backup por `pg_dump`, `@libsql/client` só para Anki)
- Modify: `docs/adr/0006-sqlite-numa-maquina-ate-o-gatilho-de-postgres.md` (Estado: substituído pelo 0014)
- Modify: `CLAUDE.md` (linha 1-3: "SQLite/libsql" → "Postgres (PGlite em dev/testes, pg em produção)"; seção Armadilhas: "`data/pg/` é o banco de dev; testes usam `pglite://memory`"), `docs/arquitetura.md`, `docs/runbook.md` (backup/restauração), `docs/deploy.md`
- Test: `npx knip` e `npm run lint`

- [ ] **Step 1: Escrever o ADR e atualizar os docs**
- [ ] **Step 2: Rodar knip e lint**

Run: `npx knip && npm run lint`
Expected: nenhum export morto novo (o `client` antigo, `aplicarPragmas`, `bancoLocal` sumiram) e lint limpo.

- [ ] **Step 3: Commit**

```bash
git add docs CLAUDE.md && git commit -m "docs(db): ADR 0014 — Postgres agora; CLAUDE.md e runbook atualizados"
```

---

### Task 10: Portão da Fase 1

**Files:** nenhum novo. Verificação de ponta a ponta.

- [ ] **Step 1: Suíte completa**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: tudo verde; `npm test` com os mesmos ~917 testes menos os 8 apagados mais os ~8 novos.

- [ ] **Step 2: E2E Playwright contra o servidor em PGlite**

Run: `npm run dev:local` numa aba e `npx playwright test` na outra (ou o script de E2E do repo).
Expected: login de convidado, captura, vocabulário e exercício passam.

- [ ] **Step 3: Revisão independente**

Despachar `revisor-critico` com o diff `git diff main...cloudflare/migracao -- server tests scripts` e a spec; corrigir o que for apontado; depois `verificador`.

- [ ] **Step 4: Relatório**

Acrescentar seção "Fase 1 concluída" em `docs/auditoria/2026-10-19-spikes-cloudflare.md` com: contagem de testes antes/depois, lista dos apagados, resultado da paridade contra `data/babel.db`, pendências para a Fase 2 (rate limit no binding, `db` por requisição via `AsyncLocalStorage` para o `pg.Client` do Hyperdrive, `pg_dump` no CI).

- [ ] **Step 5: Commit e push da branch**

```bash
git push origin cloudflare/migracao
```
