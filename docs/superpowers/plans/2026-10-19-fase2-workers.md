# Fase 2 — Runtime em Cloudflare Workers (Express + Hyperdrive + R2 + Cron) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o servidor Express do babel-play roda num Cloudflare Worker (GRU) contra o Postgres do Supabase em sa-east-1 via Hyperdrive, com áudio no R2 por binding e os jobs em Cron Triggers, mantendo o Node (self-host, dev e testes) funcionando com o mesmo código.

**Architecture:** dois pontos de entrada sobre um único `criarApp()`: `server.ts` (Node: `app.listen`, jobs por `setTimeout`, `pg.Pool`) e `worker.ts` (Workers: `httpServerHandler`, `scheduled`, um `pg.Client` por requisição vindo do Hyperdrive, exposto por `AsyncLocalStorage`). Toda dependência de processo (disco, estado em memória, trava por sessão, `process.exit`) sai de trás de uma costura com dois backends. Nada de produção muda até o portão G1 (Fase 5).

**Tech Stack:** Express 4 via `cloudflare:node` `httpServerHandler` (`nodejs_compat`, compat date ≥ 2025-09-01), `pg` ≥ 8.16.3 + Drizzle node-postgres, Hyperdrive (cache desligado), R2 binding + S3 SigV4 existente, Cron Triggers, Workers Static Assets (só o mínimo para `wrangler dev`; o resto é Fase 4), wrangler ≥ 4.36.

**Spec:** `docs/specs/2026-10-19-migracao-cloudflare.md` (opção C; Fase 2 na tabela "Plano de entrega"). Fatos medidos: `docs/auditoria/2026-10-19-spikes-cloudflare.md` (S1–S6). Inventário do código que este plano usa: ver a seção "Fatos do código" abaixo.

## Global Constraints

- Branch `cloudflare/migracao`; a `main` e o deploy no Fly não mudam até o portão G1.
- Textos, comentários e docs em português do Brasil; identificadores seguem o padrão da pasta.
- `npm run typecheck`, `npm run lint` (`--max-warnings 0`) e `npm test` verdes ao fim de cada tarefa; `npx knip` sem export morto novo ao fim da fase. Testes de Postgres real (`TESTE_POSTGRES_URL`) verdes contra Postgres 17 local ao fim de toda tarefa que toque `server/db/`.
- Nunca enfraquecer um teste. O runtime Node continua funcionando em tudo (self-host): nenhuma tarefa remove capacidade do Node a não ser as listadas na Tarefa 10.
- Segredos só em `.env`/secrets do host/`wrangler secret`; nada versionado. Tokens da Cloudflare e senha do banco nunca em arquivo versionado nem em saída de comando.
- Toda costura nova tem os dois backends (Node e Workers) e um teste por backend; o backend Workers é testado em Node com um dublê fiel (`tests/harness/workers/*`) e, no portão, com `wrangler dev` de verdade.
- `data/babel.db` e o projeto Supabase em us-east-1 não são tocados. O projeto em sa-east-1 (`bqfjvcfjkyeehizydqfw`) é o alvo de todo teste remoto; só a CA em `data/supabase-ca.crt`.

## Decisões de desenho (rulings; a spec é a autoridade, estes são os argumentos)

1. **Travas por usuário viram travas de linha** (`SELECT … FOR UPDATE` numa tabela `travas`), não advisory locks: a doc do Hyperdrive lista advisory locks como não suportados (pool por transação). A API `travarUsuario(tx, id)`/`travarGlobal(tx, nome)` não muda. Custo se errado: uma tabela a mais e um INSERT idempotente por trava.
2. **Hyperdrive com cache desligado** na configuração principal: leituras de sessão, cota e saldo não podem ficar 60 s velhas. Um segundo binding com cache fica para a Fase 4, se medição pedir.
3. **Um `pg.Client` por requisição no Worker, `pg.Pool` no Node.** O Drizzle `db` passa a ser um acessor sobre `AsyncLocalStorage`; repositórios não mudam.
4. **Rate limit continua no banco** (`express-rate-limit` + `usage_counters`): o binding Rate Limiting é por PoP e permissivo (doc), e o motivo da spec (linhas escritas no Turso) não existe no Postgres. Binding fica como otimização de Fase 4.
5. **Sentry e Langfuse continuam com os clientes próprios**; o que muda é um gancho `emSegundoPlano(promise)` que no Worker vira `ctx.waitUntil` e no Node é no-op. Evita `@sentry/cloudflare` (dependência nova, envelope já funciona).
6. **Importação pesada (Anki, PDF, DOCX, web) fica Node-only até a Fase 3**: no Worker as rotas respondem `503 { code: 'indisponivel_neste_runtime' }`. Loopback (`/api/audio`) e `desligamento.ts` continuam Node-only (self-host); não entram no bundle do Worker.
7. **Removidos de vez** (Node e Worker): `node:cluster` e `CLUSTER_WORKERS`, o servidor de métricas na porta 9091, yt-dlp (`POST /api/import/youtube` → 410). `prom-client` fica só no Node atrás de uma fachada em `server/http/metricas.ts`; no Worker a fachada é no-op (Analytics Engine fica para a Fase 4).
8. **Migrations e seeds saem do boot** e viram etapa de CI/`npm run db:migrate` contra a conexão direta; o Worker só verifica `schemaPresente` no primeiro request do isolate e falha fechado (503) se faltar.
9. **TLS ao Supabase pelo Hyperdrive com `verify-full`** e a CA própria enviada por `wrangler cert upload`. Host de origem: o direto (IPv6) se o S7 provar alcance; senão o pooler de sessão `aws-1-sa-east-1…:5432` com usuário `postgres.<ref>`.
10. **Prazos de sessão** (`statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`) passam a ser definidos no papel do banco (`ALTER ROLE … SET`), porque pooler e Hyperdrive ignoram `options`; o `pg.Pool` do Node continua mandando `options` (inofensivo).

## Fatos do código (do inventário de 19/10; linhas podem deslocar)

- `process.env` fora de `config.ts`: 54 leituras diretas em `diretorios.ts`, `server.ts`, `auth.ts`, `asaas.ts`, `storageQuota.ts`, `app.ts`, `provedores.ts`, `crypto.ts`, `versao.ts` e 1 por arquivo em 12 outros; 7 leituras no nível de módulo (`db.ts:27`, `authContext.ts:25`, `corposGrandes.ts:91`, `crypto.ts:80,90`, `routes/sessions.ts:71,78`, `import/youtube.ts:21`, `migrate.ts:13`).
- Disco: `crypto.ts` (`secret.key`, `scryptSync` ×2 no import), `corpoEmArquivo.ts` (`mkdtemp`), `routes/sessions.ts` (`.recebendo/`), `storageQuota.ts` (`statfsSync`), `diarioDeErros.ts`, `estaticos.ts`, `manutencao.ts`/`migrate.ts` (`_journal.json`).
- Jobs (7 `setTimeout` em `server.ts:393-462`): snapshot (aposentado), `agendarLimpezaDeAudio`, `agendarLimpezaDeConvidados`, `agendarPodaDasJanelasDiarias`, `agendarPodaDasMarcasDeTeste`, `agendarPodaDoCacheDeTraducao`, `agendarLimpezaDiaria`; reconciliação de armazenamento é oportunista (`reconciliarSeVencido`).
- Estado por processo que importa: `ai/admissao.ts` (baldes e `emVoo`), `lib/langfuse.ts` (fila + `setInterval`), `lib/sentry.ts` (fetch solto), `http/metricas.ts` (prom-client, 17 importadores).
- HTTP: `criarApp()` em `server/http/app.ts:119` não faz `listen` nem monta `erroGlobal`; `server.ts` faz validações de boot, migrations, seeds, Vite/SPA, `listen`, jobs, cluster. Sem WebSocket/SSE. Testes sobem o app com `listen()` + `fetch` (`tests/caracterizacao/_app.ts`), 10+ testes leem `app.ts`/`fly.toml`/`Dockerfile` como texto.
- Uploads: áudio 120 MB (`receberCorpoEmArquivo`), Anki 200 MB, documento 30 MB, STT 25 MB em memória; leitura de áudio com Range em `routes/sessions.ts:421-490` via `Armazenamento.lerFaixa`.
- SSRF: `server/ai/ssrf.ts` usa `node:dns` + `undici.Agent` (`despachanteSeguro`), usado por `ai/proxy.ts`, `cascataDeStt.ts`, `provedoresDeVoz.ts`, `import/web.ts`.

## Review Focus

1. **Trava de linha sob carga:** dois gastos simultâneos do mesmo usuário com saldo para um → exatamente um passa, também pelo Hyperdrive (pool por transação). Teste: `gasto-concorrente` continua a prova; T3 acrescenta o caso via dublê de pool por transação.
2. **Request sem `env` no escopo global:** um módulo que leia `process.env`/disco ao ser importado quebra o isolate inteiro com 500 em todas as rotas. Teste: T5 carrega `criarApp` num contexto sem `process.env.DATABASE_URL` e sem `data/` e exige que a importação não lance.
3. **Fim do request corta o que ficou pendente:** erro enviado ao Sentry e rastro do Langfuse após a resposta. Teste: T11 prova que `emSegundoPlano` entrega ao `waitUntil` do dublê.
4. **Upload de 120 MB sem disco:** stream direto para o R2 em multipart, com cota reservada antes e devolvida em falha. Teste: T7 com bucket dublê registra partes e aborto em erro.
5. **Cron que roda duas vezes ao mesmo tempo** (dois isolates) não duplica efeito: cada job é idempotente e toma `travarGlobal(nome)`. Teste: T9 roda o mesmo job duas vezes em paralelo e confere efeito único.

---

### Task 1: S7 — spike real: Hyperdrive → Supabase SP, latência de GRU, travas e runtime (exige token da Cloudflare)

**Files:**

- Create: `scripts/spikes/s7-hyperdrive/{wrangler.jsonc,worker.ts,README.md}` (descartável, fora do bundle do app; `npm run` não o inclui)
- Modify: `docs/auditoria/2026-10-19-spikes-cloudflare.md` (seção "S7")

**Interfaces:**

- Produces: decisão escrita sobre (a) host de origem do Hyperdrive (direto IPv6 ou pooler sessão), (b) advisory xact lock funciona ou não via Hyperdrive, (c) `process.env` populado no Worker (flag `nodejs_compat_populate_process_env`/compat date), (d) `crypto.scryptSync` e `zlib.zstdDecompressSync` existem no workerd, (e) `placement.region = "aws:sa-east-1"` aceito pelo `wrangler deploy`, (f) latência p50/p95 de 25 `SELECT 1` e de uma rota de 7 consultas, do Worker.
- Consumes: `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no `.env` (nunca em arquivo versionado), `SUPABASE_DB_PASSWORD`, `data/supabase-ca.crt`.

- [ ] **Step 1: CA e configuração do Hyperdrive**

Run: `npx wrangler cert upload certificate-authority --ca-cert data/supabase-ca.crt --name supabase-2021` e `npx wrangler hyperdrive create babel-sp --connection-string "postgres://postgres:<senha>@db.bqfjvcfjkyeehizydqfw.supabase.co:5432/postgres" --ca-certificate-id <id> --sslmode verify-full --caching-disabled` (senha lida de `.env` pelo shell, nunca ecoada). Se falhar por IPv6, repetir com `aws-1-sa-east-1.pooler.supabase.com:5432` e usuário `postgres.bqfjvcfjkyeehizydqfw`.
Expected: id da configuração; registrar qual host funcionou.

- [ ] **Step 2: Worker de sonda**

`worker.ts` com `nodejs_compat`, `compatibility_date = "2026-09-01"`, binding `HYPERDRIVE`, `placement.region = "aws:sa-east-1"`: rotas `/select1` (25× `SELECT 1`, devolve p50/p95), `/rota7` (7 consultas típicas: `users`, `sessions`, `vocab_cards` por usuário…), `/trava` (duas transações concorrentes com `pg_advisory_xact_lock(hashtext('x'))` e com `SELECT … FOR UPDATE` numa tabela temporária; devolve se serializou), `/runtime` (`typeof process.env.X`, `typeof crypto.scryptSync`, `typeof zlib.zstdDecompressSync`, `navigator.userAgent`, `request.cf.colo`).
Run: `npx wrangler deploy` (nome `spike-s7`, apagar ao fim) e 3 chamadas a cada rota de São Paulo.
Expected: tabela em `docs/auditoria` com os números; `colo` = GRU ou vizinho.

- [ ] **Step 3: Apagar os recursos de teste e registrar**

Run: `npx wrangler delete spike-s7`; manter a configuração Hyperdrive `babel-sp` (será a de produção) e a CA.
Expected: seção S7 commitada com as seis decisões preenchidas. Se (b) der "não serializa", a Task 3 é obrigatória; se der "serializa", a Task 3 continua (regra 1) mas vira baixo risco.

- [ ] **Step 4: Commit**

```bash
git add scripts/spikes/s7-hyperdrive docs/auditoria/2026-10-19-spikes-cloudflare.md
git commit -m "docs(auditoria): S7 — Hyperdrive→Supabase SP do Worker em GRU: latência, travas e runtime"
```

---

### Task 2: Lotes em uma instrução (`emLote` multi-VALUES)

**Files:**

- Modify: `server/db/lotes.ts`, `server/db/db.ts` (helpers), `server/db/repositories/vocab.ts` (upsert de cartões ≤ 500, reetiquetar ≤ 5 000, revisões), `server/db/repositories/exerciseResults.ts` (VALUES já existe: conferir), `server/db/repositories/agregados.ts`
- Test: `tests/integration/lotes-em-uma-instrucao.test.ts`

**Interfaces:**

- Produces: `inserirEmLotes(tx, tabela, linhas, { conflito?: { alvo, atualizar? } , tamanho? })` e `atualizarEmLotes(tx, tabela, linhas: { id, …campos }[], { chave })` em `server/db/lotes.ts`, ambos com teto de parâmetros (`LIMITE_DE_PARAMETROS_POSTGRES`) e retorno `{ instrucoes: number; linhas: number }`. `atualizarEmLotes` gera `UPDATE t SET c = v.c FROM (VALUES …) AS v(id, …) WHERE t.id = v.id` com CAST por coluna (lição da Fase 1: VALUES vêm como texto).
- Consumes: `emLote`, `travarUsuario`, `registrarObservadorDeConsultas` (para contar idas).

- [ ] **Step 1: Teste**

```ts
it('reetiquetar 5 000 cartões faz no máximo 12 instruções no banco e mantém a trava do usuário', async () => {
  const contador = contarConsultas()
  await vocabRepo.reetiquetarIdioma(u, 'en', 'en-US') // 5 000 cartões semeados
  expect(contador.instrucoes).toBeLessThanOrEqual(12) // 1 trava + ceil(5000/500) UPDATEs + versões
  expect((await vocabRepo.listar(u)).every((c) => c.srcLang === 'en-US')).toBe(true)
})
it('upsert de 500 cartões com conflito em uq_vocab_user_norm é uma instrução e mantém o merge', …)
it('VALUES tipados: coluna bigint recebe number e boolean recebe true/false (CAST por coluna)', …)
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run tests/integration/lotes-em-uma-instrucao.test.ts` → FAIL (helpers inexistentes / contagem alta).
- [ ] **Step 3: Implementar helpers e converter os três lotes grandes.** Manter `emLote` para os pequenos. A trava do usuário continua a primeira instrução.
- [ ] **Step 4: Verificar** — Run: o teste acima, `tests/integration/{gasto-concorrente,rodada-e-glossario-concorrentes,vocab-*}.test.ts` em PGlite e com `TESTE_POSTGRES_URL` (Docker). Expected: PASS; `rodada-e-glossario-concorrentes` em Postgres real termina em < 10 s.
- [ ] **Step 5: Commit** — `git commit -m "perf(db): lotes de INSERT/UPDATE em uma instrução; reetiquetar e upsert de cartões deixam de fazer uma ida por linha"`

---

### Task 3: Travas de linha no lugar de advisory locks

**Files:**

- Create: `server/db/migrations-pg/0003_travas.sql` (`CREATE TABLE travas (chave text PRIMARY KEY, criado_em bigint NOT NULL)`; RLS + REVOKE como 0002), `meta/_journal.json` + snapshot
- Modify: `server/db/schema.ts` (`travas`), `server/db/db.ts` (`travarUsuario`, `travarGlobal`), `tests/integration/schema-pg-baseline.test.ts` (39 tabelas), `server/db/repositories/conta.ts` (`TABELAS_TRATADAS_A_PARTE` inclui `travas`)
- Test: `tests/integration/travas-de-linha.test.ts`

**Interfaces:**

- Produces: `travarUsuario(tx, userId)` = `INSERT INTO travas(chave, criado_em) VALUES ('u:'||$1, now_ms) ON CONFLICT DO NOTHING` seguido de `SELECT 1 FROM travas WHERE chave = 'u:'||$1 FOR UPDATE`; `travarGlobal(tx, nome)` idem com `'g:'||nome`. Mesmas assinaturas de hoje. `pg_advisory_xact_lock` não aparece mais em `server/`.
- Consumes: todos os sítios atuais (credits, seedSpends, glossario, testesPremium, exerciseResults, vocab ×4, conta, limpezaDiaria, agregados, storageQuota global, reparoDeIdioma).

- [ ] **Step 1: Teste** — dois `emTransacao` concorrentes com `travarUsuario(u)`: o segundo só entra após o commit do primeiro (ordem observada por timestamps); `travarGlobal('x')` idem; `grep -r pg_advisory server/` vazio (teste lê o código); usuário inexistente também trava (não depende de `users`).
- [ ] **Step 2: RED** — Run: `npx vitest run tests/integration/travas-de-linha.test.ts` → FAIL.
- [ ] **Step 3: Implementar** migration, schema, `db.ts`; `conta.ts` não apaga `travas` (`TABELAS_TRATADAS_A_PARTE`), mas a limpeza diária poda chaves `u:` de usuários apagados.
- [ ] **Step 4: Verificar** — Run: todos os gated com `TESTE_POSTGRES_URL` (Docker, `--maxWorkers=2`) e a suíte. Expected: PASS; `gasto-concorrente` continua provando "exatamente um passa".
- [ ] **Step 5: Commit** — `git commit -m "feat(db): travas por linha (tabela travas) no lugar de advisory locks, compatíveis com pool por transação"`

---

### Task 4: Prazos de sessão no papel do banco e `options` opcional

**Files:**

- Create: `server/db/migrations-pg/0004_prazos_do_papel.sql` (`DO $$ BEGIN EXECUTE format('ALTER ROLE %I SET statement_timeout = ''30s''', current_user); … lock_timeout '10s'; idle_in_transaction_session_timeout '60s'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'sem privilégio: defina os prazos no papel manualmente'; END $$;`)
- Modify: `server/db/configDoPool.ts` (`DB_SESSION_OPTIONS=0` desliga o `options`), `server/lib/config.ts` (variável), `.env.production.example`, `docs/deploy.md`, `docs/runbook.md`
- Test: `tests/integration/prazos-do-papel.test.ts` (gated: após as migrations, `SHOW statement_timeout` numa conexão nova = `30s`; com `DB_SESSION_OPTIONS=0` o pool não envia `options`)

- [ ] **Step 1: Teste** / **Step 2: RED** / **Step 3: Implementar** / **Step 4: Verificar** (Docker e, uma vez, contra o Supabase SP pela conexão direta: `SHOW` numa sessão nova via pooler `aws-1-sa-east-1` = `30s`) / **Step 5: Commit** — `git commit -m "feat(db): prazos de sessão no papel do banco (pooler e Hyperdrive ignoram options)"`

---

### Task 5: Boot preguiçoso e decomposição de `server.ts`

**Files:**

- Create: `server/boot/validar.ts` (validações que hoje abortam em `server.ts:76-114` → devolvem `Achado[]`; quem decide `process.exit` é `server.ts`), `server/boot/preparar.ts` (migrations, seeds, backfills: só Node/CI), `server/boot/jobs.ts` (os 7 agendamentos de `server.ts:393-462` → `agendarJobsNoNode(registro)`), `server/lib/runtime.ts` (`ehWorker(): boolean` via `navigator.userAgent === 'Cloudflare-Workers'`; `env()` acessor único; `emSegundoPlano(p)` stub que T11 completa)
- Modify: `server.ts` (fica orquestração), `server/db/db.ts:27` (URL lida ao abrir, não ao importar), `server/crypto.ts` (`scryptSync` e leitura do `secret.key` adiados para o primeiro uso; `obterChave()`), `server/lib/authContext.ts:25`, `server/lib/corposGrandes.ts:91`, `server/routes/sessions.ts:71,78` (`AUDIO_DIR`/`armazenamentoDeMidia` por getter memoizado), `server/import/youtube.ts:21` (sai na T10), `server/db/migrate.ts:13`
- Test: `tests/integration/importacao-sem-efeitos.test.ts`

**Interfaces:**

- Produces: importar `server/http/app.ts` (e tudo que ele puxa) num processo com `process.env` reduzido a `{}` e `cwd` sem `data/` **não lança e não cria arquivo**; `criarApp()` continua síncrono; `obterChave()` em `crypto.ts`; `armazenamentoDeMidia()` função em vez de constante.
- Consumes: nada novo.

- [ ] **Step 1: Teste** — `spawnSync(node, ['--import', 'tsx', '-e', "import('./server/http/app.ts')"], { env: { PATH }, cwd: tmp })` → status 0, `tmp` continua vazio; e `criarApp()` + uma rota pública respondem num processo sem `DATABASE_URL` até o primeiro acesso ao banco (que então responde 503, não 500).
- [ ] **Step 2: RED** / **Step 3: Implementar** (mover, não reescrever; `server.ts` ≤ 200 linhas ao fim) / **Step 4: Verificar** (`npm test`; `tests/caracterizacao/montagem-espelha-o-server.test.ts` e os 10 testes que leem `app.ts` como texto continuam verdes — se um deles ler `server.ts`, ajustar o teste para o novo arquivo sem afrouxar) / **Step 5: Commit** — `git commit -m "refactor(boot): server.ts vira orquestração; nenhum módulo lê env ou disco ao ser importado"`

---

### Task 6: `db` por requisição (AsyncLocalStorage) com `pg.Client` do Hyperdrive

**Files:**

- Create: `server/db/executor.ts` (`als: AsyncLocalStorage<Executor>`, `comExecutor(exec, fn)`, `executorAtual()`), `server/db/clientePorRequisicao.ts` (`abrirClienteDoHyperdrive(connectionString)` → `{ db, fechar }` com `pg.Client` e os mesmos parsers de int8/numeric e gancho de medição de `db.ts`), `tests/harness/workers/hyperdriveDuble.ts` (connection string local = `TESTE_POSTGRES_URL` ou PGlite; um `Client` por chamada)
- Modify: `server/db/db.ts` (`db` vira Proxy que delega a `executorAtual() ?? executorDoNode()`; `emTransacao`/`emLote` idem; `fecharBanco` fecha só o do Node), `server/db/manutencao.ts` (`schemaPresente` usado pelo T12)
- Test: `tests/integration/db-por-requisicao.test.ts`

**Interfaces:**

- Produces: `comExecutor(executor, fn)`; dentro de `fn` todo `db.*`, `emTransacao`, `emLote`, `travar*` usam esse executor; fora, o Node. `abrirClienteDoHyperdrive(url): Promise<{ db: DB; fechar(): Promise<void> }>`.
- Consumes: T3 (travas), T2 (lotes).

- [ ] **Step 1: Teste** — dentro de `comExecutor(A, …)` um `INSERT` não é visto por `db` fora até o commit; dois requests paralelos com executores distintos não compartilham transação; o Proxy preserva `db.transaction`, `db.select`, `db.execute` e tipos (`DB`); `fechar()` encerra o client; em Node sem ALS o comportamento é o atual (suíte inteira).
- [ ] **Step 2: RED** / **Step 3: Implementar** / **Step 4: Verificar** (suíte + gated) / **Step 5: Commit** — `git commit -m "feat(db): executor por requisição via AsyncLocalStorage; Hyperdrive abre um Client por request"`

---

### Task 7: Armazenamento R2 por binding, upload em stream e cota sem disco

**Files:**

- Create: `server/lib/armazenamentoR2.ts` (`armazenamentoR2(bucket: R2Bucket): Armazenamento` — `gravar`, `gravarDeStream(nome, stream, contentType, tamanho?)` com multipart ≥ 5 MiB por parte e `abort` em erro, `ler`, `lerFaixa` via `get(nome, { range })`, `remover`, `tamanho` via `head`), `tests/harness/workers/r2Duble.ts` (bucket em memória que registra `put/get/head/delete/createMultipartUpload/uploadPart/complete/abort`)
- Modify: `server/lib/armazenamento.ts` (interface ganha `gravarDeStream`; `armazenamentoDeArquivos` e `armazenamentoS3` a implementam), `server/lib/corpoEmArquivo.ts` → `server/lib/corpoRecebido.ts` (`receberCorpo(req, { limite }) → { paraArquivo() | paraStream() }`: Node com disco usa arquivo; sem disco, stream), `server/routes/sessions.ts` (upload usa `receberCorpo` + `gravarDeStream` quando `!temDisco()`), `server/lib/storageQuota.ts` (`volumeSemFolga`/`statfsSync` só com disco; `temDisco()` em `runtime.ts`), `server/lib/tetoDoR2.ts` (embrulha também o R2 por binding; HEAD conta B), `server/lib/diretorios.ts`
- Test: `tests/integration/armazenamento-r2-binding.test.ts`, `tests/integration/upload-sem-disco.test.ts`

**Interfaces:**

- Produces: `armazenamentoR2`, `receberCorpo`, `temDisco()`; `armazenamentoDoAmbiente(dir, env, { r2?: R2Bucket })` prefere o binding, depois S3, depois disco.
- Consumes: T5 (getters), T6.

- [ ] **Step 1: Testes** — upload de 120 MB simulado (stream de 24 partes de 5 MiB) grava multipart no dublê, reserva cota antes e devolve em falha no meio (abort chamado); `lerFaixa` repassa `range` e devolve 206 pela rota; `tamanho` conta classe B; disco continua o caminho em Node com `AUDIO_DIR`.
- [ ] **Step 2: RED** / **Step 3: Implementar** / **Step 4: Verificar** (suíte; `tests/caracterizacao/audio-range-e-filename.test.ts` e `tests/seguranca/uploads-grandes.test.ts` verdes) / **Step 5: Commit** — `git commit -m "feat(armazenamento): R2 por binding com upload em stream multipart; cota e corpo grande sem depender de disco"`

---

### Task 8: Admissão de IA no banco (atômica) e estado por isolate documentado

**Files:**

- Create: `server/db/migrations-pg/0005_admissao_de_ia.sql` (tabela `admissao_de_ia(chave text PK, janela text, usado bigint, em_voo bigint, atualizado_em bigint)` + RLS/REVOKE), `server/db/repositories/admissaoDeIa.ts` (`reservar(chave, janela, custo, teto) → boolean` com `INSERT … ON CONFLICT DO UPDATE SET usado = usado + $custo WHERE usado + $custo <= $teto RETURNING`, `liberarEmVoo`, `podar(janelasAntigas)`)
- Modify: `server/ai/admissao.ts` (baldes/`emVoo` passam a chamar o repositório; memória vira só cache de recusa por 1 s para não bater no banco em rajada), `server/lib/config.ts` (nada novo), `docs/adr/0007-admissao-de-ia-em-memoria-e-fila-duravel-so-para-lote.md` (nota "substituído em parte")
- Test: `tests/integration/admissao-no-banco.test.ts` (dois processos/executores concorrentes não ultrapassam o teto do minuto; `em_voo` volta a 0 após liberar; o 429 do provedor zera o saldo até o `Retry-After`)

- [ ] Steps 1–5 como nas tarefas anteriores. Commit — `git commit -m "feat(ia): admissão por minuto/dia e vagas em voo no banco, atômicas entre instâncias"`

---

### Task 9: Registro de jobs e `scheduled` idempotente

**Files:**

- Create: `server/jobs/registro.ts` (`JOBS: { nome, cron, rodar(ctx) }[]` — os 7 de `server.ts` + `reconciliarArmazenamento` como 8º; cada `rodar` toma `travarGlobal('job:'+nome)` e tem teto de lotes), `server/jobs/executar.ts` (`executarJob(nome)` com log de início/fim/duração e `emSegundoPlano`)
- Modify: `server/boot/jobs.ts` (Node agenda a partir do registro), `server/lib/limpezaDiaria.ts` (transação interativa de `:86` vira lotes idempotentes de 500 por usuário sem segurar a transação entre lotes)
- Test: `tests/integration/jobs-idempotentes.test.ts` (o mesmo job rodado duas vezes em paralelo produz efeito único; `scheduled('0 3 * * *')` dispara só os jobs daquela expressão; `limpezaDiaria` em lotes apaga tudo em ≥ 2 passadas sem transação longa)

- [ ] Steps 1–5. Commit — `git commit -m "feat(jobs): registro único de jobs com trava global, usado pelo Node e pelo scheduled do Worker"`

---

### Task 10: Aposentar cluster, porta 9091, yt-dlp; fachada de métricas

**Files:**

- Delete: `server/import/youtube.ts`, o bloco de cluster de `server.ts`/`server/boot`, `server/http/metricas.ts` servidor HTTP (`:848`) e `portaInternaDeMetricas`
- Modify: `server/http/metricas.ts` (fachada: mesma API `contar*`, `observar*`, `registrarLeitor*`; backend prom-client só quando `!ehWorker()`; no Worker, no-op com contadores em memória para `/api/health`), `server/routes/import.ts` (`POST /api/import/youtube` → `410 { code: 'rota_removida' }`), `server/lib/diretorios.ts`, `server/lib/diarioDeErros.ts`, `server/audio/loopback.ts` (`CLUSTER_WORKERS` some), `server/lib/config.ts` (`CLUSTER_WORKERS` → removida com nota de versão; `METRICS_PORT`… idem), `fly.toml:50,104` (só comentário "legado"), `package.json` (sem remover prom-client)
- Test: ajustar `tests/integration/cluster.test.ts` (apagar com justificativa: o assunto deixou de existir), `tests/integration/metricas-*.test.ts` (continuam no Node), `tests/seguranca/matriz-de-rotas.test.ts`, `tests/caracterizacao/prontidao.test.ts`, `tests/metricas-producao-fail-closed.test.ts`, `tests/preflight-producao.test.ts` (sem afrouxar: trocar a asserção "9091 existe" por "9091 não existe mais")

- [ ] Steps: RED (testes ajustados primeiro), implementar, `npm test`, knip. Commit — `git commit -m "chore(runtime): sem cluster, sem porta 9091 e sem yt-dlp; métricas atrás de fachada com backend por runtime"`

---

### Task 11: `emSegundoPlano`, SSRF sem `node:dns`, compressão por runtime

**Files:**

- Modify: `server/lib/runtime.ts` (`emSegundoPlano(p)`: Worker → `ctx.waitUntil` via ALS de request; Node → `void p`), `server/lib/sentry.ts` e `server/lib/langfuse.ts` (flush por `emSegundoPlano`; Langfuse sem `setInterval` no Worker: flush ao fim do request), `server/ai/ssrf.ts` (`despachanteSeguro` Node mantém `node:dns`; Worker: `resolverSeguro(host)` via DoH `https://cloudflare-dns.com/dns-query` + lista de bloqueio de IP privado/literal + `redirect: 'manual'`; mesma função `fetchSeguro(url, init)` para os dois), `server/http/app.ts` (`compression` só `!ehWorker()`)
- Test: `tests/integration/segundo-plano.test.ts`, `tests/seguranca/ssrf-vetores.test.ts` e `ssrf-rebinding.test.ts` ganham o caso Worker (dublê de DoH devolvendo IP privado → recusa; resposta com redirect para IP privado → recusa)

- [ ] Steps 1–5. Commit — `git commit -m "feat(runtime): waitUntil para Sentry/Langfuse, SSRF sem node:dns no Worker, compressão só no Node"`

---

### Task 12: Ponto de entrada do Worker, `wrangler.jsonc` e fumaça em `wrangler dev`

**Files:**

- Create: `worker.ts` (`export default { fetch: httpServerHandler(...)` embrulhado para: popular `env` → `process.env` se o S7 disser que não vem populado, abrir `comExecutor(abrirClienteDoHyperdrive(env.HYPERDRIVE.connectionString))` por request e fechar no fim, `emSegundoPlano` ligado ao `ctx`, `/api/*` → Express, resto → `env.ASSETS.fetch`; `scheduled(controller, env, ctx)` → `executarJob` por cron }`), `wrangler.jsonc`(substitui o`wrangler.toml`de Pages:`name`babel-play,`main`worker.ts,`compatibility_date`2026-09-01,`compatibility_flags: ["nodejs_compat"]`, `hyperdrive: [{ binding: "HYPERDRIVE", id, localConnectionString: "postgres://…localhost:5433…" }]`, `r2_buckets: [{ binding: "MIDIA", bucket_name: "babel-midia" }]`, `triggers.crons`do registro,`observability.enabled`, `placement.region`conforme S7,`assets: { directory: "dist", not_found_handling: "single-page-application", binding: "ASSETS", run_worker_first: ["/api/*"] }`, `env.staging`), `scripts/worker/fumaca.mjs`(sobe`wrangler dev`, bate `/api/health` (`banco: 'postgres'`), login JWT ES256 de teste → `/api/me`, upload de 1 MB em `/api/sessions/:id/audio`+ GET com Range 206,`GET /cdn-cgi/local/scheduled?cron=…` de um job; falha com código ≠ 0)
- Modify: `package.json` (`worker:dev`, `worker:build` com relatório de tamanho, `fumaca:worker`; override `iconv-lite@0.7.0`), `scripts/build-servidor.mjs` ou esbuild config (externals: `prom-client`, `loopback-capture`, `jsdom`, `@electric-sql/pglite` fora do bundle do Worker via alias para stubs em `server/stubs/`), `.gitignore` (`.wrangler/`), `docs/deploy.md` (seção "Worker em desenvolvimento")
- Test: `tests/worker/fumaca.test.ts` (executa `scripts/worker/fumaca.mjs` só se `WRANGLER_FUMACA=1`; senão `skip` com motivo) + `tests/worker/bundle.test.ts` (bundle do Worker ≤ 10 MB bruto; nenhum `node:fs` fora dos stubs)

**Interfaces:**

- Consumes: T5–T11. Hyperdrive local: `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` apontando ao Postgres 17 do `docker-compose.yml`.

- [ ] **Step 1: Teste de bundle (RED)** / **Step 2: Implementar `worker.ts` e `wrangler.jsonc`** / **Step 3: `npm run worker:build`** → tamanho e lista de módulos Node restantes / **Step 4: `WRANGLER_FUMACA=1 npm run fumaca:worker`** → 4 verificações verdes (health, JWT, upload+range, cron) / **Step 5: Commit** — `git commit -m "feat(worker): ponto de entrada em Workers com Hyperdrive, R2, cron e assets; fumaça em wrangler dev"`

---

### Task 13: Pendências de CI da Fase 1 (pg_dump semanal no R2; integração inteira em Postgres real)

**Files:**

- Create: `.github/workflows/backup-pg-dump.yml` (semanal, `pg_dump --format=custom --schema=public --schema=drizzle` via `PG*` do ambiente (`secrets.SUPABASE_DB_URL` dividido em partes), envia para o R2 `babel-backups` com o cliente S3 de `scripts/backup.mjs`; `pg_restore --list` como verificação; retenção 8 semanas por lifecycle)
- Modify: `.github/workflows/ci.yml` (job `postgres-real` passa a rodar TODA `tests/integration` com `TESTE_POSTGRES_URL` e `BANCO_DE_TESTE=postgres` — `tests/harness/bancoDeTeste.ts` já cria um banco por arquivo; `continue-on-error: true` só na primeira semana, com issue para remover), `tests/harness/ephemeralDb.ts` (honra `BANCO_DE_TESTE=postgres` para todos os arquivos), `docs/deploy.md`, `docs/runbook.md` (restauração do dump)
- Test: `tests/integration/ci-backup.test.ts` (o workflow existe, cita `--schema=public --schema=drizzle`, nenhuma senha em texto)

- [ ] Steps. Commit — `git commit -m "ci: pg_dump semanal para o R2 e integração inteira contra Postgres real"`

---

### Task 14: Portão da Fase 2

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build && npm run worker:build && npx knip`; gated com Docker (`--maxWorkers=2`) e, uma vez, contra o Supabase SP.
- [ ] **Step 2:** `WRANGLER_FUMACA=1 npm run fumaca:worker` com Hyperdrive local → Postgres do Docker; depois `wrangler dev --remote` contra o Hyperdrive `babel-sp` (token no `.env`) com as 4 verificações.
- [ ] **Step 3:** E2E Playwright (desktop e mobile) contra o Node em PGlite (regressão) e, se `wrangler dev` servir `dist/`, uma passada do `desktop-1280` contra o Worker local (`BASE_URL=http://localhost:8787`).
- [ ] **Step 4:** `revisor-critico` (opus) com o diff `main...HEAD -- server worker.ts wrangler.jsonc scripts tests .github` e esta lista de rulings; uma rodada de correção; `verificador`.
- [ ] **Step 5:** Seção "Fase 2 concluída" em `docs/auditoria/2026-10-19-spikes-cloudflare.md` (números do S7, tamanho do bundle, fumaça, pendências para a Fase 3: importação no navegador, SSRF/DoH em produção, Analytics Engine, binding de rate limit, segundo Hyperdrive com cache). Push da branch.
