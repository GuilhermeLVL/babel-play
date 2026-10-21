# Spikes da migração para Cloudflare (Fase 0)

Branch `cloudflare/migracao`. Plano: `~/.claude/plans/acabei-de-testar-a-nested-reddy.md`. Nada aqui altera a `main` nem o deploy no Fly.

## Resultado até agora

| Spike                                | Estado                       | Resultado                                                                                                                                    |
| ------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| S2 Express em Workers                | **parcial, local (workerd)** | Ver abaixo                                                                                                                                   |
| S4 zstd no Node 22                   | **parcial**                  | `zlib.zstdDecompressSync` existe no Node 22.15+ (e no 24.22 local). O Docker estava desligado, então não rodei no `node:22-slim`.            |
| S1 Latência do D1 a partir do Brasil | **pendente**                 | Exige conta Cloudflare (`wrangler login`).                                                                                                   |
| S3 Container com Litestream          | **pendente**                 | Exige conta Cloudflare.                                                                                                                      |
| S5 Bundle e arquivos                 | **feito, local**             | Ver abaixo: servidor cabe num Worker (4,8 MB bruto / 1,4 MB gzip); nenhum arquivo de `dist/` passa de 25 MiB, mas um fica a 0,4 % do limite. |

## S2 em detalhe (workerd local, `nodejs_compat`, wrangler 4.151.1)

1. **Express mínimo** com `httpServerHandler` de `cloudflare:node`: responde `/api/health` e **mantém o roteamento sensível à caixa** (`/API/health` não casa com `/api/health`), o que protege a regressão do AAL2.
2. **Falha 1 (corrigível):** `body-parser` do Express 4 usa `iconv-lite@0.4.24`, cujo `require('./streams')` quebra no bundle do workerd (`require_streams(...) is not a function`). Funcionou com `iconv-lite@0.7.0` (override do npm ou `alias` no `wrangler.jsonc`). O repo hoje resolve `0.4.24`.
3. **`criarApp` real** (`server/http/app.ts`) empacota e carrega, com helmet, compression, jose e as rotas, **até abrir o banco**. Para aí em `@libsql/client`: `URL_SCHEME_NOT_SUPPORTED ... got "file:"`. Ou seja, o bloqueio é o banco (Fase 1), não o Express.
4. **Não provado:** boot completo (depende do banco), tamanho do bundle em produção, cold start, rotas autenticadas.

## Próximo

- S1 e S3 precisam de login: `! npx wrangler login` (ou `wrangler deploy --temporary`, conta de preview temporária, a validar se cria D1).
- S5: medir o bundle do Worker e os arquivos de `dist/` contra o limite de 25 MiB do Pages.
- Portão G0 só depois de S1.

## S5: tamanho do bundle e dos arquivos estáticos (medido em 2026-10-19)

- `server/http/app.ts` empacotado com esbuild (`--packages=bundle`, minificado, sem `node:*`, libsql, jsdom e prom-client): **4,8 MB bruto, 1,4 MB gzip**. Cabe com folga no limite do Worker (64 MiB descomprimido, Free e Paid, doc de 12/10/2026). Maiores pedaços: código do app 2,0 MB, `undici` 518 KiB, `pdfjs-dist` 482 KiB, `iconv-lite` 478 KiB, `zod` 445 KiB.
- `dist/` tem 1.025 arquivos e 186 MB. **Nenhum passa de 25 MiB**, mas `ort-wasm-simd-threaded.jsep.wasm` tem 26.101.073 bytes contra o limite de 26.214.400 (0,4 % de folga): qualquer atualização do onnxruntime pode estourar. Os outros grandes: `ort-wasm-simd-threaded.asyncify` 23,6 MB e o Bergamot pt-en 22,7 MB (já previsto para o R2).
- Recomendação: servir os `.wasm` do onnxruntime e os modelos pelo R2 (com `Cache-Control` longo), não pelo Pages/Static Assets.

## S1: latência do D1 a partir do Brasil (medido em 2026-10-19)

Worker no edge do Rio (`colo GIG`) chamando D1; cliente em casa, 25 amostras por célula. Banco criado "auto" caiu em **ENAM** (América do Norte Leste); também testei `weur`. O custo de ir ao edge e voltar (sem D1) é p50 117 ms / p95 135 ms.

| Rota simulada               | D1 ENAM, em sequência | D1 ENAM, 1 `batch` | D1 WEUR, 1 `batch` |
| --------------------------- | --------------------- | ------------------ | ------------------ |
| 1 leitura                   | 249 ms (p95 287)      | 251 (p95 469)      | 289 (p95 548)      |
| 3 leituras (tipo `/api/me`) | 565 (p95 714)         | 236 (p95 278)      | 278 (p95 452)      |
| 7 leituras                  | **1140 (p95 1334)**   | 245 (p95 691)      | 299 (p95 509)      |
| 3 leituras + 2 escritas     | **920 (p95 1220)**    | 259 (p95 658)      | 305 (p95 520)      |

- **Cada ida ao D1 custa ~130 ms (ENAM) ou ~175 ms (WEUR)**; um `batch` inteiro custa o mesmo que uma consulta. O código atual faz de 3 a 7 consultas em sequência por rota, então migrar "como está" dá 0,9 a 1,3 s por rota.
- Critério do plano (p95 ≤ 400 ms): **reprovado em sequência, aprovado só com `batch`** (e mesmo assim o p95 oscila até ~700 ms por ruído de rede).
- Durable Object com SQLite (consultas locais dentro do objeto, ~0 ms), com dica `sam` ou `enam`: **total p50 ~255 ms, p95 400 a 570 ms**, mas o hop Worker→DO custa os mesmos ~130 ms, e a dica `sam` não mudou nada, ou seja, o objeto não parece ter ficado em São Paulo. Resolve o N+1 (7 consultas custam o mesmo que 1), mas não elimina o salto até a América do Norte.
- Referência hoje: SQLite local no Fly GRU ≈ 0 ms por consulta; a rota custa só a rede do usuário.

**Conclusão G0 (parcial):** a migração "como está" fica de 5 a 10 vezes mais lenta. Só funciona se toda rota for reescrita para fazer **no máximo uma ida ao banco** (batch ou DO), o que é parte da Fase 1 e aumenta o risco e o esforço. Mesmo assim, a latência mínima fica em ~250 ms por requisição contra ~100 a 130 ms do Fly em São Paulo.

Recursos de teste (Worker `spike-lat`, bancos `spike-lat-auto` e `spike-lat-weur`) foram **apagados** ao fim.

## Fase 1 concluída: SQLite → Postgres (2026-10-19, branch `cloudflare/migracao`)

Plano: `docs/superpowers/plans/2026-10-19-fase1-postgres.md` (10 tarefas, cada uma com implementador e
revisor próprios, mais revisão final da branch inteira). Decisão: ADR 0014. A `main` e o deploy no Fly
não mudaram.

**O que entrou.** Schema Drizzle em `pg-core` (38 tabelas), migrations em `server/db/migrations-pg/`
(baseline, 25 gatilhos + 10 flags, RLS + REVOKE para o Supabase), driver único em `server/db/db.ts`
(PGlite em dev/testes, `pg` em produção, prazos e tamanho do pool pelo ambiente, parser de int8),
trava consultiva por usuário em todo padrão "ler saldo e escrever", trava de diretório do PGlite,
`ANALYZE` no PGlite, scripts e ambiente de dev em PGlite, `pg_dump` com credenciais fora do argv,
preflight de produção exigindo `postgres://`, CLI de migração de dados com paridade por checksum,
job de CI com Postgres 17 real, `npm run limpar` para processos órfãos.

**Testes.** Antes (main 163fa82c): 915 arquivos, 11 785 testes. Depois (17497c5c): 928 arquivos,
11 839 testes, 4 pulados (só os que exigem `TESTE_POSTGRES_URL` ou dois processos). Apagados com
justificativa no commit 7b41c39f: `db-pragmas`, `pragmas-transacao`, `snapshot-processo-filho`,
`rollback-por-backup`, `migracoes-sobre-estado-atual` (assunto deixou de existir) e
`snapshot-e-restauracao` (virou `snapshot-indisponivel`); `migrations-replica` e
`replica-sem-estado-local` foram adaptados, não apagados. 23 arquivos novos, entre eles os de
concorrência real (`gasto-concorrente`, `agregados-concorrentes`, `rodada-e-glossario-concorrentes`),
validados contra Postgres 17 em contêiner. Dois defeitos reais fora do banco apareceram no caminho e
foram corrigidos: o clique no microfone da revisão era descartado nos primeiros 700 ms da página
(`Gravador.tsx`) e o `--zerar` do semeador apagava na ordem errada das FKs.

**Paridade de dados.** `npx tsx scripts/migracao/sqlite-para-postgres.ts --origem file:<cópia de
data/babel.db>` para `pglite:<tmp>`: 38/38 tabelas com checksum igual, sha1 do original inalterado,
reexecução recusada sem `--continuar`. A leitura da origem não é snapshot: o servidor antigo precisa
estar parado.

**E2E (Playwright, servidor em PGlite temporário).** `desktop-1280`: 75 passaram, 24 pulados, 0
falhas. `mobile-375`: 73/5/21 na primeira corrida (durante a suíte completa e um contêiner Postgres
na mesma máquina); os 4 arquivos que falharam passaram na repetição com a máquina folgada, exceto
um caso do modo intérprete, que oscila (ver nota abaixo). A `main` no mesmo viewport deu 78/0/21.
Nenhum erro de servidor ou de banco nos logs; todas as falhas são "elemento não encontrado" na tela.

**Revisão final da branch (opus).** 0 críticos, 5 importantes, todos corrigidos na mesma branch:
int8 chegava como string no `pg` (quebrava `NotaDeContagem`), PGlite sem trava de diretório (perda
de escrita reproduzida), pool sem prazos, CI sem Postgres real, mensagem de backup prometendo um
workflow inexistente.

**Pendências para a Fase 2 (antes do S6/G1).**

- Lotes com uma ida ao banco por instrução (`emLote`; até 5 000 no reetiquetar): virar
  INSERT/UPDATE multi-VALUES antes de medir com Hyperdrive, senão o p95 ≤ 250 ms da spec não fecha.
- `options -c statement_timeout…` pode ser recusado pelo Supavisor em modo transação: chave de
  ambiente para desligar ou `ALTER ROLE … SET`; documentar que os prazos valem também para
  migrations e para a CLI de migração de dados.
- Workflow semanal de `pg_dump` (schemas `public` e `drizzle`) para o R2: hoje não há backup
  automático neste build.
- Modo "toda a integração contra Postgres real" no harness (`postgresDescartavel` já existe); o job
  `postgres-real` roda só os arquivos gated.
- Ensaio da migração sobre uma cópia do SQLite de produção do Fly: procurar fração em coluna INTEGER
  (`typeof(col)='real'`) antes, porque isso derruba a carga.
- Bordas da trava do PGlite (retomada simultânea de trava velha; dois contêineres pid 1 no mesmo
  volume; `backup.mjs` copiar sem checar a trava) — só self-host, produção recusa `pglite:`.
- Rate limit fora do banco, `db` por requisição (`AsyncLocalStorage`) para o cliente do Hyperdrive,
  `Dockerfile`/`fly.toml`/`litestream.yml`/CI do Fly aposentados.
- E2E do modo intérprete no celular oscila entre corridas (sem erro de servidor): o mesmo arquivo
  falhou na primeira corrida num diretório PGlite recém-criado (1,8 min) e passou na segunda
  (31 s). Medir o custo do primeiro boot do PGlite (initdb + migrations + ANALYZE) e o tempo de
  espera do teste antes de usá-lo como portão.

## S6 (parcial): conexão real com o Supabase, projeto em us-east-1 (medido em 2026-10-19)

Sonda em Node com `pg`, TLS **verificado** com a CA própria do Supabase (`prod-ca-2021.crt`, download no
painel; sem ela as três vias falham no handshake e não se deve desligar a verificação). Origem: rede
doméstica em São Paulo. Cinco `select 1` por via, depois da conexão.

| Via                                          | Conexão         | `select 1` (ms) | `options -c statement_timeout…`           |
| -------------------------------------------- | --------------- | --------------- | ----------------------------------------- |
| direta `db.<ref>.supabase.co:5432` (só IPv6) | ~1 050 ms       | 136–205         | **honrado** (30 s / 10 s)                 |
| pooler sessão `aws-0-us-east-1.pooler…:5432` | ~1 000–1 200 ms | 138–235         | **ignorado em silêncio** (fica 2 min / 0) |
| pooler transação `…:6543`                    | ~850–900 ms     | 130–243         | **ignorado em silêncio**                  |

Conclusões:

- 130–240 ms por ida de São Paulo a us-east-1 é a mesma ordem do D1 (S1). O projeto de produção
  **tem** de ficar em South America (São Paulo); este projeto serve só para validar driver e migrations.
- O Supavisor não recusa `options`, só ignora: os prazos de sessão da Fase 1 (`DB_STATEMENT_TIMEOUT_MS`
  etc.) só valem pela conexão direta. Pelo pooler, a saída é `ALTER ROLE postgres SET statement_timeout = …`
  (uma vez, no banco) ou `SET` após conectar (em modo transação só `SET LOCAL` dentro da transação).
  Item obrigatório da Fase 2 antes do corte.
- Padrão do papel `postgres` no Supabase: `statement_timeout = 2min`, `lock_timeout = 0`.
- `pg` lê `sslrootcert`/`sslmode=verify-full` da própria URL (`pg-connection-string`), então
  `DATABASE_URL=postgres://…?sslmode=verify-full&sslrootcert=/caminho/supabase-ca.crt` deve servir ao driver
  sem código novo (a confirmar com os testes de `TESTE_POSTGRES_URL`).

**Testes de Postgres real contra o Supabase (mesmo dia).** Os 11 arquivos que exigem `TESTE_POSTGRES_URL`
rodaram contra o projeto em us-east-1 pela conexão direta com `sslmode=verify-full&sslrootcert=…`
(nenhum código novo): 8 arquivos verdes (22 testes), inclusive int8, medição em transação, ANALYZE,
trava do PGlite, prazos do pool e as migrations `0000`–`0002` aplicadas no banco `postgres` do projeto
(38 tabelas, RLS e REVOKE executados com os papéis `anon`/`authenticated` reais). Os 3 arquivos
vermelhos falharam por **latência**, não por lógica: `gasto-concorrente` e `r2-teto-armazenamento`
estouraram o `hookTimeout` de 20 s aplicando as migrations num banco descartável a 130 ms por ida;
`rodada-e-glossario-concorrentes` (reetiquetar + rodada + revisar do mesmo usuário, 5×) caiu em
`55P03` (`lock_timeout` de 10 s): um lote de centenas de instruções segura a trava do usuário por
dezenas de segundos quando cada instrução custa uma ida à rede. É a prova empírica de que os lotes
multi-VALUES (`emLote` hoje = 1 ida por instrução) são o **primeiro item da Fase 2**, antes de qualquer
medição com Hyperdrive; e que os testes de concorrência precisam de `hookTimeout`/`lock_timeout`
maiores quando apontados a um banco remoto.

## S6: latência real para o projeto Supabase em São Paulo (medido em 2026-10-19)

Projeto novo `bqfjvcfjkyeehizydqfw`, região confirmada **sa-east-1** pelo IPv6 do host direto contra o
`ip-ranges.json` da AWS (a opção "Americas" do painel é uma região geral e resolve para a Virgínia; a
região certa está em "Specific regions → South America (São Paulo)"). Mesma sonda do S6 parcial, TLS
verificado, origem rede doméstica em São Paulo, cinco `select 1` por via.

| Via                                                             | Conexão    | `select 1` (ms) |
| --------------------------------------------------------------- | ---------- | --------------- |
| direta `db.<ref>.supabase.co:5432` (IPv6)                       | 125–155 ms | 15–21           |
| pooler sessão `aws-1-sa-east-1.pooler.supabase.com:5432` (IPv4) | ~380 ms    | 18              |
| pooler transação `…:6543`                                       | ~115 ms    | 17–20           |

- De 130–240 ms (us-east-1) para 15–21 ms: a rota de 7 consultas cai de ~1,1 s para ~120 ms já de
  uma rede doméstica. Do PoP da Cloudflare em GRU para a AWS sa-east-1 a ida tende a ser menor; a
  medição final (Worker + Hyperdrive) fica para quando houver token da Cloudflare na sessão.
- O host do pooler deste projeto é `aws-1-sa-east-1` (não `aws-0`); o painel "Connect" mostra o certo.
- `options -c …` continua honrado só na conexão direta (ver S6 parcial).
- **Testes de Postgres real contra São Paulo:** os 11 arquivos com `TESTE_POSTGRES_URL` passam (32 testes,
  1 pulado por ser só-PGlite), com `--maxWorkers=2`, inclusive o de 5 rodadas concorrentes que estourava o
  `lock_timeout` a 130 ms. As duas falhas da primeira rodada eram corrida do harness (dois arquivos migrando
  o mesmo banco ao mesmo tempo); corrigido com um banco descartável por arquivo (`tests/harness/bancoDeTeste.ts`).

## S7: Worker em produção na Cloudflare, rede até o Supabase SP, runtime e placement (medido em 2026-10-19)

Worker de sonda `spike-s7` (`scripts/spikes/s7-hyperdrive/`), wrangler 4.151.2, `compatibility_date`
2026-09-01 + `nodejs_compat`, publicado em `workers.dev`, chamado de São Paulo (rede doméstica) e apagado
ao fim (`wrangler deployments list` → `10007 This Worker does not exist`; URL → 404). Resultados brutos em
`scripts/spikes/s7-hyperdrive/resultados/`.

**Hyperdrive de produção criado (2.ª rodada, depois que o dono deu "SSL and Certificates: Edit" ao token 1).**
A Supabase assina o Postgres (host direto e pooler) com a própria CA (`Supabase Root 2021 CA`, conferido com
`openssl s_client -starttls postgres`), então `verify-full` exige subir `data/supabase-ca.crt` como CA na
conta; a API recusa `verify-full` sem `ca_certificate_id` (`code 2007`). Recursos mantidos (ids não são
segredo):

- CA `supabase-2021`: **`011bac50-d7ab-4034-b878-ff0a5d5c3cf5`** (expira em 26/04/2031).
- Hyperdrive `babel-sp`: **`731fd033ab814021963c4faea04fdd20`**, origem `db.bqfjvcfjkyeehizydqfw.supabase.co:5432`
  (direta, IPv6), usuário `postgres`, `sslmode verify-full` com a CA acima, cache desligado,
  `origin_connection_limit` 20.

Na 1.ª rodada (sem a permissão) mediu-se só a rede do Worker até a origem (TCP + `SSLRequest`), o runtime e
o placement; a 2.ª rodada mediu `/select1`, `/rota7`, `/trava` e `/lock_timeout` pelo Hyperdrive.

### Permissões observadas dos tokens (`.env`)

| Comando                                                     | `CLOUDFLARE_API_TOKEN`      | `CLOUDFLARE_API_TOKEN_2` |
| ----------------------------------------------------------- | --------------------------- | ------------------------ |
| `user/tokens/verify`                                        | ativo (token de usuário)    | ativo (token de usuário) |
| `wrangler cert list` (mTLS/CA, leitura)                     | 10000                       | ok                       |
| `wrangler cert upload certificate-authority`                | 10000 → ok após a permissão | **10000**                |
| `wrangler hyperdrive list`                                  | ok (vazio)                  | ok (vazio)               |
| `wrangler hyperdrive create` (chegou à validação, `2007`)   | ok                          | 10000                    |
| `wrangler deploy` / `delete` / `deployments list` (Workers) | ok                          | não testado              |
| API `workers/scripts/<n>/settings` (leitura)                | ok                          | não testado              |

Na 1.ª rodada faltava aos dois a permissão de conta **"SSL and Certificates: Edit"** (endpoint
`/accounts/<id>/mtls_certificates`); o dono a deu ao token 1, que passou a fazer tudo o que o S7 precisa
(CA, Hyperdrive, Workers). O token 2 continua só lendo certificados.

### Rede do Worker até a Supabase SP (`/rede`, 3 chamadas, ms)

Ida = escrever o `SSLRequest` e ler o `S` (uma ida e volta inteira à origem); 10 amostras no pooler e 3 no
host direto por chamada. `request.cf.colo` = **GIG** (Rio; é o PoP de entrada da minha rede, não onde o
Worker roda com placement).

| Configuração                      | pooler: conexão p50/p95 | pooler: ida p50/p95 | direto IPv6: conexão p50 | direto IPv6: ida p50/p95 |
| --------------------------------- | ----------------------- | ------------------- | ------------------------ | ------------------------ |
| `placement.region: aws:sa-east-1` | 5–8 / 7–16              | **2–3 / 4–5**       | 4–12                     | 4–6 / 4–7                |
| sem placement (roda em GIG)       | 11–13 / 15–16           | 10–11 / 12–13       | 11–95                    | 10–11 / 10–13            |

### Pelo Hyperdrive `babel-sp` (Worker com placement `aws:sa-east-1`, 3 chamadas por rota, ms)

Um `pg.Client` (pg 8.23.1) por request com `env.HYPERDRIVE.connectionString`; `colo` = GIG nas 12 chamadas.

| Rota                       | Chamada  | conexão | p50 por consulta | p95 por consulta | total da rota |
| -------------------------- | -------- | ------- | ---------------- | ---------------- | ------------- |
| `/select1` (25×`select 1`) | 1        | 6       | 6                | 10               | 200           |
|                            | 2        | 4       | 6                | 10               | 202           |
|                            | 3        | 7       | 11               | 19               | 299           |
| `/rota7` (7 consultas)     | 1 (fria) | 3       | 24               | 89               | 226           |
|                            | 2        | 8       | 8                | 12               | 58            |
|                            | 3        | 15      | 8                | 13               | 62            |

`/rota7`: `count(*) users`, `sessions limit 5`, `vocab_cards where user_id=$1 limit 20`, `now()`, `flags`,
`count(*) utterances`, `select 1`; sem erros. Em `/select1` aparece um pico isolado de 43–48 ms em 2 das 3
chamadas. **Critério do spec** (p50 ≤ 10 ms/consulta, p95 ≤ 250 ms na rota de 7): atendido em 5 de 6
medidas; a 3.ª de `/select1` deu p50 11 ms (1 ms acima), e a rota de 7 inteira ficou em 58–226 ms
(a de 226 ms é a primeira, com o pool frio).

**Travas (`/trava`, duas conexões concorrentes, cada uma `begin; <trava>; pg_sleep(1); commit`)** — as três
formas **serializaram nas 3 chamadas**, sem erro: a segunda obtém a trava 1 021–1 032 ms depois da primeira e a
rota leva ~2,06–2,10 s.

| Forma                                                                              | serializou | espera da 2.ª |
| ---------------------------------------------------------------------------------- | ---------- | ------------- |
| `pg_advisory_xact_lock(hashtext('s7'))`                                            | 3/3        | 1 022–1 032   |
| `select 1 from s7_travas where chave='x' for update`                               | 3/3        | 1 024–1 032   |
| `insert into s7_travas … on conflict (chave) do update set chave = excluded.chave` | 3/3        | 1 021–1 024   |

**`lock_timeout` pelo Hyperdrive (`/lock_timeout`, 3/3 iguais):** a sessão chega com `lock_timeout = 0`
(sem limite), `statement_timeout = 2min`, `idle_in_transaction_session_timeout = 0`, usuário `postgres`,
servidor `2600:1f1e:b2a:a301::761f` (IPv6, PostgreSQL 17.11). Um `SET lock_timeout = '10s'` fora de
transação **não persiste** na consulta seguinte (relida = `0`: o Hyperdrive multiplexa por transação);
`SET LOCAL lock_timeout = '10s'` dentro de `begin … commit` vale (`10s`). Consequência: o `options -c
lock_timeout=…` da string de conexão do app não serve com Hyperdrive; o limite tem de ir em `SET LOCAL` em
cada transação que trava (ou `alter role … set lock_timeout`, que vale para toda conexão nova do papel).

### Runtime (`/runtime`, idêntico nas 3 chamadas)

- `typeof process.env.SPIKE_VAR` = `"string"`: `process.env` vem populado com os `vars` só com a compat
  date 2026-09-01 + `nodejs_compat` (sem flag extra).
- `crypto.scryptSync('a','b',16)` funciona (`87c5081bda438d4970b5384aa840b362`, igual ao Node);
  `zlib.zstdDecompressSync` existe e faz a ida e volta de `zstdCompressSync`.
- `navigator.userAgent` = `"Cloudflare-Workers"`; `typeof httpServerHandler` (`cloudflare:node`) = `"function"`.
- **Express 4 via `httpServerHandler`:** quebra com o `iconv-lite` 0.4.24 do repositório
  (`require_streams(...) is not a function`, carregado por `body-parser`/`raw-body`); com `alias` para
  `iconv-lite@0.7.0` funciona: `/express/api/health` → 200 `{"ok":true}`, `/express/API/health` → 404.
- Bundle do spike (Express + pg): 1,39 MB / 350 KB gzip; startup 15 ms.

### As seis decisões

1. **(a) Origem do Hyperdrive:** **host direto `db.<ref>.supabase.co:5432` (IPv6), usuário `postgres`.**
   O `hyperdrive create` validou a conexão e as consultas chegaram a um servidor IPv6; o pooler sessão não
   precisou ser tentado (não há erro do outro caminho a registrar). O pooler fica como plano B se o direto
   der problema.
2. **(b) Advisory xact lock via Hyperdrive:** **serializa** (3/3), sem erro, assim como `for update` e o upsert
   `on conflict … do update` da Task 3. A Task 3 continua pela regra 1, mas vira baixo risco. Atenção ao
   `lock_timeout`: chega `0` e só `SET LOCAL` dentro da transação vale.
3. **(c) `process.env` populado:** **sim**, com compat date 2026-09-01 + `nodejs_compat`; não precisa de
   `nodejs_compat_populate_process_env`.
4. **(d) `scryptSync` e `zstdDecompressSync`:** **existem e funcionam** no workerd de produção.
5. **(e) `placement.region = "aws:sa-east-1"`:** **aceito** pelo `wrangler deploy`; a API mostra
   `placement: {mode: "targeted", target: [13]}` e a ida à Supabase cai de ~10–11 ms (GIG) para ~2–3 ms.
   Manter em produção.
6. **(f) Latência p50/p95 via Hyperdrive:** `select 1` com p50 6–11 ms e p95 10–19 ms; rota de 7 consultas
   com p50 8 ms e p95 12–13 ms (aquecida; 24/89 ms fria), 58–226 ms no total. **Atende ao critério** (p50 ≤ 10,
   p95 ≤ 250 na rota de 7), exceto um p50 de 11 ms em 1 de 3 rodadas de `select 1`. Piso de rede: 2–3 ms
   por ida, então o Hyperdrive acrescenta ~3–5 ms por consulta.

`spike-s7` apagado ao fim das duas rodadas; a CA e o `babel-sp` ficam (produção).

## Fase 2 concluída: runtime em Cloudflare Workers (2026-10-20, branch `cloudflare/migracao`)

Plano: `docs/superpowers/plans/2026-10-19-fase2-workers.md` (14 tarefas, cada uma com implementador e
revisor próprios, mais revisão final da branch). Nada foi implantado: a `main`, o Fly e o domínio não
mudaram. O que existe é o mesmo servidor Express rodando num Worker **local** (`wrangler dev`) contra
Postgres, com tudo que a produção vai exigir já provado por teste ou fumaça.

**O que entrou (52 commits sobre o plano).**

- Hyperdrive `babel-sp` criado apontando para o Supabase em sa-east-1 pela conexão direta IPv6, TLS
  `verify-full` com a CA própria do Supabase; medido do Worker em GRU com `placement.region
aws:sa-east-1`: 2–3 ms por ida, `select 1` p50 6–11 ms, rota de 7 consultas ~60 ms aquecida (S7).
- Banco pronto para pool por transação: travas de linha (`travas`) no lugar de advisory locks; prazos
  de sessão no papel do banco (`ALTER ROLE`, migration 0004) porque pooler e Hyperdrive ignoram
  `options`; lotes de INSERT/UPDATE em uma instrução (reetiquetar 5 000 cartões: 5 003 → 4
  instruções); um `pg.Client` por requisição via `AsyncLocalStorage`, com fila de transações e
  fechamento só depois do trabalho pós-resposta.
- Admissão de IA no banco (migration 0005): token bucket com reabastecimento contínuo numa única
  instrução atômica, vagas em voo com prazo por tipo, bloqueio por `Retry-After` do provedor; 20
  reservas paralelas contra teto de 10 → exatamente 10 passam, em dois executores reais.
- Armazenamento sem disco: R2 por binding com upload em stream multipart (abort em erro), cota sem
  `statfs`, teto do R2 cobrado por operação (inclusive cada parte).
- Boot preguiçoso: nenhum módulo lê ambiente ou disco ao ser importado (teste com preload que vigia
  `process.env`); `server.ts` de 590 para 157 linhas; migrations fora do boot.
- Registro único de 7 jobs com lease de 15 min (dois `scheduled` simultâneos → efeito único), limpeza
  diária em lotes curtos com ajuste incremental dos agregados.
- Aposentados: `node:cluster`, porta 9091, yt-dlp (`POST /api/import/youtube` → 410); `prom-client`
  atrás de fachada só no Node.
- Worker: `worker.ts` + `wrangler.jsonc` (nodejs_compat, Hyperdrive, R2, 7 crons, assets SPA,
  placement, observability), bundle 5,7 MB / 1,3 MB gzip com stubs para o que é só Node; `fetchSeguro`
  com SSRF por DoH no Worker e `node:dns` no Node; `emSegundoPlano` → `ctx.waitUntil`; travas de
  produção provadas no Worker (`NODE_ENV`, `validarBoot` por isolate, IP do cliente por
  `CF-Connecting-IP`, `.env` fora do `wrangler dev`, `IA_PROVEDORES_ARQUIVO` recusado).
- CI: job `postgres-real` roda TODA a integração e caracterização em Postgres 17; workflow semanal de
  `pg_dump` para o R2 (sem bucket ainda; falha com clareza).

**Portão (HEAD da fase).**
| Verificação | Resultado |
|---|---|
| typecheck, lint, build (Vite + Node), knip | ok (knip só com achados pré-existentes) |
| `npm test` (PGlite) | 12 096 testes, 0 falhas |
| integração + caracterização em Postgres 17 | 271 arquivos, 0 falhas |
| bundle do Worker | 5 697 KB bruto, 1 339 KB gzip, 786 módulos |
| fumaça em `wrangler dev` | 7/7: health, JWT, upload + Range 206, cron, estorno pós-resposta, 10 requisições paralelas + upload cancelado (0 conexões abertas ao fim), `/api` 404 |
| E2E no Node | desktop 75/0, mobile 78/0 (sem regressão) |
| E2E no Worker local | 69 passaram; 4 falhas explicadas (import de Anki é Node-only até a Fase 3; 1 subpixel intermitente); com `E2E_RUNTIME=worker` as suítes de Anki são puladas |
| revisão final (opus) | 1 crítico (limpeza pós-resposta cortada pelo fechamento do cliente) e 2 importantes, todos corrigidos e re-revisados |

**Decisões registradas na fase** (rulings do plano e do ledger): travas de linha; cache do Hyperdrive
desligado; cliente por requisição; rate limit continua no banco; Sentry/Langfuse com clientes próprios

- `waitUntil`; importação pesada Node-only até a Fase 3 (503 no Worker); `prom-client` só no Node;
  migrations na CI; TLS `verify-full`; prazos no papel do banco; `flags` da origem vencem na migração
  de dados; CSP bloqueante dos estáticos fica para a Fase 4.

**Pendências para as Fases 3–5 (antes do G1).**

- Fase 3: importação de Anki/PDF/DOCX no navegador (hoje 503 no Worker); tirar o botão e o
  entitlement do YouTube; tratar o 410 no cliente.
- Fase 4: `_headers` com CSP bloqueante para os estáticos; bucket `babel-midia` e `babel-backups` com
  lifecycle (8 semanas); Hyperdrive próprio do staging; secrets no Cloudflare; `relatarConfiguracao()`
  no portão do Worker (sem ela o `/api/health` não acusa `degraded`); cache de DoH por isolate;
  Analytics Engine no lugar dos contadores em memória; medir `scrypt` frio por isolate, p95 da
  admissão (2–3 idas por fala) e o ritmo de uploads grandes pelo stream intermediário; segundo
  Hyperdrive com cache se a medição pedir; confirmar o plano Workers Paid (7 crons > 5 do grátis).
- Fase 5: ensaio da migração de dados sobre uma cópia do SQLite de produção (procurar fração em
  coluna INTEGER antes); k6 Fly × Cloudflare; drill de restauração do `pg_dump`.
- Dívidas menores conhecidas (ledger): handler pendurado segura o cliente até ~30 s (teto próprio
  para a lista de `waitUntil` é melhoria opcional); laço de espera do executor com `setTimeout(0)`
  (trocar por 5 ms); teste de prontidão no Node não prova sonda única sozinho; `acertarTokens` em linha antiga subconta; `Retry-After`
  usa só a primeira recusa; comentários antigos de CLUSTER_WORKERS/yt-dlp; `fillfactor` da `travas`
  aplicado à mão no projeto de São Paulo.

## Fase 3 concluída: importação no navegador e página web sem jsdom (2026-10-20, branch `cloudflare/migracao`)

Plano: `docs/superpowers/plans/2026-10-20-fase3-importacao.md` (10 tarefas, implementador + revisor por tarefa,
ledger SDD). Nada implantado: `main`, Fly e domínio intactos. O servidor deixou de receber arquivos pesados:
o `.apkg`, o PDF e o DOCX são lidos no navegador e só o resultado viaja (notas em lotes, ou texto que já vira
sessão-documento no cliente). A única importação que continua no servidor é a página web (CORS + anti-SSRF),
agora sem `jsdom`, rodando também no Worker. A guarda `503 indisponivel_neste_runtime` da Fase 2 saiu.

**O que entrou.**

- `src/core/anki/` (puro): limpeza de campo, mídia/cloze, mapeamento de campos por nome, leitor de `.txt/.csv`,
  escrita dominante e decisão de idioma (S11) — o mesmo código no navegador e no servidor.
- Leitor de `.apkg` no navegador (`src/lib/anki/`): zip em streaming com teto contado nos bytes inflados
  (`fflate`, sem confiar no cabeçalho, entradas de mídia descartadas sem inflar), zstd em streaming (`fzstd`,
  frames sem tamanho declarado), `sql.js` (wasm de 685 KB carregado só na importação), num Web Worker; teto
  somado de 300 MB entre as coleções; `temMidia` informado, mídia não importada (código do mapa de mídia
  apagado: não tinha chamador).
- Protocolo em lotes `POST /api/anki/imports` → `/:id/notas` (≤ 500 notas, ≤ 3 MiB em UTF-8, em sequência) →
  `/:id/fechar`, com o mesmo envelope de resposta da rota antiga. O servidor **reaplica** `limparCampo`, deriva
  `guid`/`estruturaHash` (`server/import/identidadeDaNota.ts`) e a régua `avaliarCartao`; teto de 50 000 notas
  por import reservado por `UPDATE` condicional (sem TOCTOU); um import aberto por baralho (o anterior vira
  `falhou: substituído`); `fechar` sem lote → `400 import_vazio`; imports abandonados viram `falhou` na
  limpeza diária (24 h); balde próprio de 200 lotes/min fora do limitador de escrita; `import_id` carimbado
  também nas notas iguais para `marcarAusentesForaDoImport` ser um `UPDATE` só.
- Cliente: `importarBaralhoAnki` orquestra leitura → abrir → lotes → fechar com progresso na tela
  ("Enviando 1.500 de 3.600 notas…"), repete um lote uma vez em 429 (`Retry-After`).
- Exportação `.apkg` também no navegador (`sql.js` + `fflate`, mesmo esquema 11, SHA-1 do `csum` por Web
  Crypto); rota `/api/import/anki/export` removida.
- PDF/DOCX no navegador (`src/lib/import/extrairDocumento.ts`): `pdfjs-dist` com o worker próprio,
  `mammoth` build de browser, bomba de DOCX barrada antes do mammoth por `medirExpansaoDoZip`, tetos de hoje
  (30 MB, 500 páginas, 5 M caracteres, 20/40 MB de expansão). Rotas `/api/import/document` e
  `/api/import/anki` removidas (sem período de depreciação: nada em produção; registradas em
  `tests/contratos/api-depreciacoes.json`).
- Página web: `linkedom` + `@mozilla/readability` (`baseURI` definido à mão), charset pelo `Content-Type` ou
  `<meta charset>` nos primeiros 2 048 bytes (`TextDecoder`), tetos e SSRF intactos. Provada no `wrangler dev`:
  Wikipédia "Língua portuguesa" → 200, 69 142 caracteres, 473 ms.
- YouTube fora do cliente e dos planos (`youtubeImport` removido das matrizes; rota segue 410).
- Servidor sem `jsdom` (só devDependency para o vitest), `jszip`, `mammoth`, `pdfjs-dist`, `@libsql/client`
  (fica no `package.json` só para os scripts de migração/snapshot da Fase 5) nem stubs deles.

**Critério de aceite da spec (`.apkg` de 200 MB ≤ 60 s).** `scripts/perf/anki-200mb.ts` gera um `.apkg` sintético
de 196 MB (`collection.anki21b` com 20 000 notas + 2 000 mídias de 100 KB) e mede o leitor em Node: 0,46 s.
No navegador (Chromium via Playwright, MacBook do dono, `npm run dev:local`): **4,4 s** da escolha do arquivo
até o passo 1 da tela — leitura no Web Worker + 40 lotes enviados e gravados (20 000 novas) — e 0,1 s para
fechar. Nenhuma requisição além dos lotes.

**Portão (HEAD da fase).**
| Verificação | Resultado |
|---|---|
| typecheck, lint, build (Vite), knip | ok (knip só com achados pré-existentes; 6 exports mortos novos removidos) |
| `npm test` (PGlite) | 12 127 testes, 0 falhas (1 flake de concorrência em `nuvemDoSite-cotas`, 3/3 isolado, arquivo não tocado) |
| integração + caracterização em Postgres 17 (cluster novo) | 272 arquivos, 2 172 testes, 0 falhas — depois de ampliar o retry da migration 0004 para `unique_violation` (corrida do `ALTER ROLE` num cluster recém-criado, R12) |
| bundle do Worker | 5,95 MB bruto, 1,41 MB gzip (era 5,38 / 1,27: `linkedom` + readability entram; jsdom/mammoth/pdfjs/jszip/libsql fora) |
| assets do Vite | `sql-wasm-browser` 685 KB (336 KB gzip) + worker do leitor 24 KB, `pdf.worker` 1,26 MB e `mammoth` 305 KB só sob demanda |
| fumaça em `wrangler dev` | 7/7, agora com `POST /api/import/web` real (Wikipédia → 200, 69 142 caracteres, 736 ms) |
| E2E no Node (3 larguras) | 245 passaram, 0 falhas reais (10 falhas da 1ª rodada eram o deck de 20 000 notas do benchmark deixado no banco de dev; purgado e reexecutado) |
| E2E no Worker local (`E2E_RUNTIME=worker`, SPA sem login, `--var AUTH_REQUIRED:0 SELF_HOST:1`) | 204 passaram, 0 falhas (93 pulos condicionais, os mesmos do Node); as suítes de Anki rodam no Worker — na Fase 2 pulavam |
| benchmark 196 MB | Node 0,46 s; navegador 4,4 s (ver acima) |

**Decisões registradas (R1–R11 do plano/ledger).** Protocolo em três passos; identidade da nota é do servidor;
rotas antigas removidas (sem compatibilidade); mapa de mídia não portado; exportação no navegador; PDF no
thread principal com o worker do pdfjs; nota inválida → 400; `linkedom` nos dois runtimes (HTMLRewriter
descartado depois da prova); depreciação de rota não se aplica antes do lançamento; limpeza dupla
(navegador + servidor) faz texto LITERAL `<b>` (vindo de `&lt;b&gt;`) perder a tag — aceito e documentado na
caracterização.

**Revisão final da branch (opus) e rodada única de correção.** Sem crítico. O achado importante: o schema do
lote recusava saídas legítimas do leitor (verso > 2 000, campo bruto > 20 KB, > 100 tags) e o import morria pela
metade — corrigido com os tetos numa fonte única (`src/core/anki/tetos.ts`, `TETOS_DA_NOTA`), limites ampliados
(verso/exemplo 4 000, campo bruto 50 000, 60 campos, 200 tags) e CORTE no cliente (`notaParaOFio`), com o servidor
continuando a recusar acima (defesa); teste de propriedade leitor → fio → schema. Também: guid repetido dentro do
lote vira `iguais` em vez de 500; `fechar` reivindica o estado com `UPDATE … WHERE estado = 'gravando'` (dois
`fechar` em paralelo → um 200, um 409; `ativarLote` uma vez); teste de que leitura inválida não abre import;
comentário do Dockerfile.

**Limitações conhecidas.** Charsets legados do `TextDecoder` não foram exercitados no `workerd` (só UTF-8 na
fumaça); `.apkg` exportado não foi testado num Anki real (limitação antiga); `semearBaralhoAnki` e
`scripts/polimento/_anki.mjs` duplicam as 4 notas da fixture; `somarPorMotivo` lê-soma-grava (só estatística);
dois `abrir` simultâneos no mesmo baralho podem se anular (caso de aba dupla, cliente recebe 409); o estágio zstd
do `.anki21b` junta os pedaços numa cópia (até 2× a coleção descomprimida no pico, antes da cópia do `sql.js`) —
num celular com coleção perto do teto de 300 MB a aba pode cair; pré-alocar pelo tamanho do frame quando
declarado e um teto menor no mobile ficam como melhoria; a conta não tem cota de armazenamento do acervo Anki
(só tetos por lote/import) — avaliar na Fase 4/5 junto com o orçamento do banco.

## Fase 4 (Tasks 1–8) concluída: entrega na Cloudflare e nome Frasy (2026-10-20, branch `cloudflare/migracao`)

Plano: `docs/superpowers/plans/2026-10-20-fase4-entrega-e-frasy.md` (10 tarefas; a Task 9 — deploy de staging
e medições — espera a autorização do dono para publicar; a Task 10 é esta seção e o portão). Nada publicado:
`main`, Fly e o Worker antigo `babel-play` (edição estática) intactos. O que foi CRIADO na conta Cloudflare e no
Supabase é reversível e sem custo: buckets, Hyperdrive de staging e um banco vazio.

**O que entrou.**

- **Frasy.** O produto chama-se Frasy em tudo que a pessoa vê (UI, 12 chaves i18n + "Nuvem do Frasy", e-mails,
  descrições do Asaas, nomes de arquivo exportado `frasy-…`, `.apkg`, User-Agent, páginas jurídicas só o nome,
  consentimento do responsável `v2-2026-10-20`, docs vivos, `.env.production.example` com `frasy.com.br`) e no
  que nasce na Cloudflare (Worker `frasy`/`frasy-staging`, buckets `frasy-*`). Identificadores internos
  (`babel.*` no navegador, sais criptográficos, bancos, Fly, Pages, repo, Sentry/Langfuse) não mudaram.
- **CSP bloqueante nos estáticos.** `scripts/vite/cabecalhos.ts` gera `dist/_headers` no build com a MESMA
  política do Express (`diretivasDeCsp(env)` + `serializarCsp`), COOP/COEP/DIP e as regras de cache;
  `public/_headers` (Report-Only) deixou de existir; a edição estática usa o mesmo arquivo.
- **R2.** `scripts/cloudflare/r2.mjs` (idempotente) criou `frasy-midia`, `frasy-midia-staging`,
  `frasy-backups` (lifecycle `semanal/` 56 dias) e `frasy-modelos` (CORS GET/HEAD); todos em ENAM (o R2 não tem
  dica de localização na América do Sul). `VITE_ORT_WASM_URL` passa a alimentar `wasmPaths` do ONNX e a CSP
  (`connect-src`, `script-src`, `worker-src`); a troca efetiva para o R2 espera o domínio.
- **Secrets e saúde.** `scripts/cloudflare/secrets.ts <amb>` faz `wrangler secret bulk` de `.secrets.<amb>.json`
  (gitignored; `.secrets.example.json` com os nomes obrigatórios, teste de drift); `relatarConfiguracao()` roda
  uma vez por isolate no portão do Worker, e `/api/health` responde `degraded` (passo `configuracao`; os nomes
  vão ao log) quando falta variável crítica.
- **Staging real.** Banco `frasy_staging` criado e migrado no projeto Supabase de SP + Hyperdrive
  `frasy-staging-sp` (`4c4526a6…`, criado pela API para a senha não passar por argv); `env.staging` publicável
  (`define` repetido — não é herdado; teste de igualdade; `workers_dev: true` só no staging).
- **CI.** `deploy-worker.yml` (manual, por Environment): build com `VITE_*`, `db:migrate` com CA, `wrangler
versions upload` → fumaça no preview → `versions deploy` 100 % → fumaça final → `rollback` só se o deploy
  passou e a fumaça final falhou; SHA do commit realmente baixado. Job `worker` no `ci.yml` (bundle, `tests/worker`,
  fumaça com Postgres de serviço). `lighthouse.yml` mede uma URL.
- **DoH com cache por isolate** (60 s, 512 hosts, só resultados todos públicos; fail-closed intacto).
- **Analytics Engine** (`METRICAS` → `frasy_metricas`/`_staging`): 6 famílias (requisição, admissão recusada,
  custo por plano, R2, provedor de IA, job), nunca lança, sem promessa solta; SQL no runbook.

**Portão (HEAD das Tasks 1–8).**
| Verificação | Resultado |
|---|---|
| typecheck, lint, i18n (2 órfãs pré-existentes) | ok |
| `npm test` (PGlite) | 12 177 testes, 0 falhas |
| integração + caracterização em Postgres 17 (cluster novo) | 272 arquivos, 2 174 testes, 0 falhas |
| bundle do Worker + `tests/worker` | 5 964 KB bruto; 44 testes |
| fumaça em `wrangler dev` | 7/7 (rodada na T8) |
| E2E no Node (3 viewports) | 202 ok, 0 falhas (2 casos reexecutados após falha ambiental concorrente com a correção) |
| knip | só achados pré-existentes |
| revisão final (opus, T1–T8) + re-revisão da correção (sonnet) | 0 crítico; 4 Important e 6 minors corrigidos em 926a90bf; re-revisão aprovada com 3 minors (2 aplicados no commit das docs, 1 cosmético) |

**Correção da revisão final (commit 926a90bf).** Quatro Important fechados: o `worker:build`/dry-run cria o `dist/`
quando falta (o job `worker` do CI e `tests/worker/bundle.test.ts` rodam em runner limpo); o `deploy-worker.yml`
pré-checa se o Worker existe (o primeiro deploy de cada ambiente é manual, `wrangler deploy`, documentado em
`docs/deploy.md`) e roda `wrangler triggers deploy` depois da fumaça, porque `versions deploy` não aplica crons;
`ASAAS_SANDBOX=1` no staging e `ASAAS_BASE_URL` em produção no `wrangler.jsonc` (sem isso o boot dava 503);
`preview_urls: true` no topo (R12) com fumaça da preview obrigatória em produção. Minors: `relatarConfiguracao`
sob try/catch no portão; o passo `configuracao` é limpo com `registrarSucessoDeBoot` quando a config valida (no
Worker só o espelho em memória, porque o `db` não existe fora de `comExecutor`); o script de secrets rejeita
valores vazios; docs (METRICAS, residência ENAM em `docs/lgpd/operadores.md`, secrets recomendadas). Ressalvas
aceitas: o rollback automático só dispara quando a fumaça final falha (falha isolada no `triggers deploy` fica
para o operador, que vê o passo vermelho); o pré-check de Worker inexistente casa a saída do wrangler por regex e
só será provado no primeiro deploy real.

**Decisões (R1–R12).** `_headers` gerado no build; modelos/WASM por variável, R2 quando houver domínio; staging no
mesmo projeto Supabase com banco próprio; publicação por versões; secrets por script; Analytics Engine com
subconjunto; cache de DoH; rename sem identificadores internos; medições no staging real (T9); R11: o staging
divide o Supabase Auth com a produção (mesmo emissor de JWT) — antes do LANÇAMENTO, projeto Supabase separado
para o staging ou lista de permitidos.

**Task 9 concluída (21/10/2026).** Staging publicado em `https://frasy-staging.guigui-cruzeiro.workers.dev` pelo
`deploy-worker.yml` (3 runs verdes por versões), com Analytics Engine ativado pelo dono e o GitHub Environment
`staging` configurado. Achados que só o staging real mostrou e já corrigidos: o front saía em self-host (faltava
`VITE_AUTH_REQUIRED=1` no build do workflow), HSTS ausente nos estáticos, `aria-label` do toast fora do `t()`;
deploy manual de rede doméstica inviável (~120 MB de assets) → o workflow faz o primeiro deploy e o build gera
`dist/.assetsignore`. Medições, ZAP (0 FAIL) e Lighthouse em `2026-10-20-fase4-staging.md`; scrypt frio
(90–160 ms de CPU por isolate novo) e admissão p95 ficam para a Fase 5.

**Depende do dono.** Assinar Workers Paid antes da produção (7 crons); colocar a zona `frasy.com.br` na Cloudflare
(hoje não há zona na conta) e então domínio do Worker, `APP_URL`/`VITE_PUBLIC_URL`, bucket público de modelos,
Supabase (Site URL/Redirects), Asaas (webhook), Resend (SPF/DKIM), Turnstile; GitHub Environment `production`
(o `staging` já existe) com `CLOUDFLARE_API_TOKEN` (Workers Scripts/Versions), `CLOUDFLARE_ACCOUNT_ID`,
`DATABASE_URL_MIGRACAO`, `SUPABASE_CA_PEM`, `VITE_*`; chaves S3 do R2 para o backup e para publicar os modelos;
apagar o Worker antigo `babel-play` quando quiser; decidir `preview_urls` em produção.

**Dívidas menores registradas (ledger).** "nuvem do Babel" em 9 comentários; `localhost:3100` no CORS de
produção do bucket de modelos; lifecycle comparado só por nome; chaves desconhecidas enviadas pelo script de
secrets; `boot_falhas` não é escrita no Worker (só espelho por isolate); migração do staging sem fallback ao
pooler; `rotuloFechado` em fornecedor/modelo do ponto `provedor`; teste ponta a ponta do middleware de métricas;
cópia do array do cache de DoH.
