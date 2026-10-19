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
