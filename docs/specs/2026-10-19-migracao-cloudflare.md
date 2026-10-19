# Migração do servidor para Cloudflare sem perder latência nem qualidade

Status: **aprovado (opção C)** em 2026-10-19 · Data: 2026-10-19 · Autor: Guilherme (com pesquisa e spikes do assistente)

**Decisão do dono (19/10/2026):** centralizar em dois fornecedores já contratados, Cloudflare (servidor, site,
arquivos, cron, DNS, WAF) e Supabase (Auth + Postgres em São Paulo), aceitando o esforço maior em troca de
escalabilidade e de planos pagos que resolvem gargalos (compute do Supabase, réplicas de leitura, PITR). A opção B
(Turso) sai da mesa; a Fase 1 (SQLite→Postgres) começa já, porque vale em qualquer variante de C, inclusive se
o servidor tiver de ficar no Fly por um tempo.

Complementa `docs/auditoria/2026-10-19-spikes-cloudflare.md` (medições) e substitui o plano em fases anterior
(Pages + Worker + D1), que o spike S1 reprovou. Nada aqui altera a `main` nem o deploy no Fly.

## Problema

O dono quer **um só fornecedor** (Cloudflare) para servidor, banco, arquivos, DNS e site, em vez de Fly.io (servidor
e banco) + Cloudflare (DNS, WAF, R2, Pages). As medições de 19/10/2026 mostram que o alvo óbvio não serve:

- **D1 não roda na América do Sul** (hints: wnam, enam, weur, eeur, apac, oc; réplicas idem). Medido do Rio: cada
  ida ao D1 custa ~130 ms; uma rota com 7 consultas em sequência fica em 1,1 s (p95 1,3 s); mesmo com `batch`, o
  piso é ~250 ms por requisição contra ~100 a 130 ms do Fly em São Paulo.
- **Durable Objects não nascem na América do Sul** (`locationHint: "sam"` cai em ENAM; nenhum PoP brasileiro é
  DO-capable). O salto Worker→DO custa os mesmos ~130 ms.
- **Containers** rodam em `SAM`, mas toda requisição passa por um Durable Object (que fica em ENAM), o disco é
  efêmero e um experimento público de 12/10/2026 perdeu 9 a 694 escritas de 1.280 num `kill -9` com Litestream.

O que **não** é problema: o Express do app roda em Workers (`httpServerHandler`, S2), o servidor empacotado tem
4,8 MB (limite 64 MiB, S5) e nenhum arquivo de `dist/` passa de 25 MiB (S5, com um a 0,4 % do limite).

## Objetivos

- Servidor, site, arquivos, cron, DNS e WAF na Cloudflare; o banco onde a latência permitir.
- Latência de rota típica (3 a 7 consultas) **p50 ≤ 130 ms e p95 ≤ 250 ms** medida do Brasil, igual ou melhor
  que o Fly hoje.
- Custo recorrente **≤ US$ 36/mês** com até 300 usuários (hoje: Fly ~US$ 11 + Supabase Pro US$ 25).
- Zero perda de dados no corte (paridade por contagem e checksum) e restauração provada antes.
- Suíte atual (917 testes, segurança, E2E) continua passando; nada vai para a `main` antes do portão final.

## Fora do escopo

- Troca de nome Babel Play → Frasy (pedido separado, aguarda "pode trocar").
- Trocar o Supabase Auth, o Asaas, o Resend ou os provedores de IA.
- Alta disponibilidade multi-região e sharding (ficam como gatilhos, como no ADR 0006).

## Opções consideradas

| Opção                                                          | Prós                                                                                                                                                                   | Contras                                                                                                                                                                                                                                                                                                                             | Custo/mês (estimativa)                              | Esforço (estimativa) | Risco                                                                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| **A. Não migrar** (Fly GRU + Cloudflare DNS/WAF/R2/Pages)      | Já funciona; banco a 0 ms; backup contínuo testado em CI                                                                                                               | Dois fornecedores; deploy derruba ~20 s; sem edge                                                                                                                                                                                                                                                                                   | Fly 11 + Supabase 25 = **~36**                      | 0                    | Baixo                                                                                                  |
| **B. Workers + Turso Cloud em São Paulo** (SQLite remoto)      | **Mesmo dialeto**: 54 migrações, 34 tabelas, 178 SQLs crus e ~900 testes sobrevivem; `batch()` = 1 ida HTTP; região `aws-sa-east-1` desde 01/10/2026; PITR 1 a 30 dias | Terceiro fornecedor (Turso); produto em transição (nova engine em beta privado); cobra por linha escrita (Developer 25 M/mês, Scaler 100 M); `transaction()` custa 1 ida por statement (janela 5 s); região SP ainda não medida                                                                                                     | Workers 5 + Turso 0 a 6 + Supabase 25 = **30 a 36** | **3 a 4 semanas**    | Médio: quota de escritas a partir de ~300 usuários; maturidade do Turso                                |
| **C. Workers + Hyperdrive + Postgres do Supabase (sa-east-1)** | Só fornecedores já pagos; sem cobrança por linha; é o destino do ADR 0006; Hyperdrive incluso no plano; transações interativas reais                                   | **Reescrita SQLite→Postgres**: schema (84 colunas `integer`→`bigint`), baseline de migrações, 22 `db.run`, 27 `rowsAffected`, 21 `batch`, `json_group_array`, `LIKE`; harness de teste em Postgres; pool do Hyperdrive na América do Sul **não confirmado**; cache de 60 s sem invalidação; Direct é IPv6-only (add-on IPv4 ~US$ 4) | Workers 5 + Supabase 25 (+4 IPv4) = **30 a 34**     | **5 a 7 semanas**    | Médio-alto: se o pool não estiver no Brasil, volta a ~200 ms por consulta; regressões sutis de dialeto |
| D. Workers + Containers (SAM) + SQLite + Litestream            | Imagem Docker atual quase intacta                                                                                                                                      | Worker→DO (ENAM)→Container (SAM): dois cruzamentos de continente por requisição; disco efêmero; perda medida em `kill -9`; `basic` insuficiente (relato)                                                                                                                                                                            | 5 + 12 a 25 + 25 = **42 a 55**                      | 2 a 3 semanas        | Alto: latência e durabilidade                                                                          |
| E. Workers + D1 com `batch` em toda rota                       | Tudo Cloudflare; Time Travel 30 dias                                                                                                                                   | Piso medido ~250 ms (p95 até 700 ms); toda rota reescrita para uma ida; 100 variáveis por consulta; 10 GB                                                                                                                                                                                                                           | 5 + 25 = **30**                                     | 5 a 6 semanas        | Alto: 2 a 5× mais lento que hoje                                                                       |

Fontes dos números: `docs/auditoria/2026-10-19-spikes-cloudflare.md` (S1, S2, S5); docs oficiais da Cloudflare
(limits/pricing de Workers, D1, DO, Containers, R2, Hyperdrive, datas de 06 a 18/10/2026);
turso.tech/blog/turso-cloud-new-regions (01/10/2026) e turso.tech/pricing; supabase.com/pricing. Esforço é
estimativa minha a partir do levantamento de código (seção Design). A quota de escritas do Turso usa a premissa
do ADR 0006 (0,076 escritas/s por cadastrado): ~20 M linhas/mês com 100 usuários, ~60 M com 300, ~200 M com 1.000.

## Recomendação

**Medir primeiro (spike S6, 1 a 2 dias), depois escolher entre B e C pelos números.** Com o que já se sabe, a
ordem de preferência é:

1. **B (Workers + Turso São Paulo)** se o S6 medir ≤ 10 ms por consulta do Worker no Brasil: é a migração de
   menor risco de regressão porque não troca o dialeto, mantém as 54 migrações e os testes, e cabe em 3 a 4
   semanas. Aceita-se um terceiro fornecedor para o banco. A ida ao Postgres continua como gatilho do ADR 0006
   (nesse ponto, a opção C vira o caminho natural, já com o servidor em Workers).
2. **C (Hyperdrive + Supabase)** se o S6 mostrar o Hyperdrive ≤ 5 ms por consulta **e** o dono preferir só
   fornecedores já pagos, aceitando 5 a 7 semanas e o risco de dialeto.
3. **A (não migrar)** se nenhum dos dois passar no S6. D e E estão descartadas pelas medições.

O que muda a recomendação: Turso não liberar São Paulo no plano Free/Developer; latência Turso > 15 ms por
consulta; Hyperdrive sem pool na América do Sul; o dono rejeitar um terceiro fornecedor (aí é C ou A).

**Após a decisão por C**, o S6 passa a medir três caminhos do Worker (placement `aws:sa-east-1`) ao Postgres em
sa-east-1: (1) Hyperdrive sobre a conexão Direct; (2) Hyperdrive sobre o Supavisor em modo sessão (IPv4); (3) sem
Hyperdrive, `pg` direto no Supavisor em modo sessão (3 idas de handshake por requisição, ~15 ms, depois ~5 ms por
consulta). Qualquer um com p50 ≤ 5 ms por consulta e rota de 7 consultas ≤ 130 ms de ponta a ponta aprova o G0.
Se os três falharem, o servidor fica no Fly em GRU falando com o mesmo Postgres (ainda dois fornecedores, mais o
Fly) até a Cloudflare ter pool ou DO na América do Sul.

Escala com C: Supabase Pro inclui compute Micro (US$ 10 de crédito); Small US$ 15, Medium US$ 60 etc. (até 64
núcleos), disco a US$ 0,125/GB além dos 8 GB, réplicas de leitura e PITR (US$ 100/mês) como add-ons. Workers
escala sozinho (10 M requisições e 30 M CPU-ms inclusos; excedente US$ 0,30/M e US$ 0,02/M CPU-ms); R2 sem egress.

## Design (alvo B; as diferenças de C estão marcadas)

```
usuário (BR) ──HTTPS──> Cloudflare PoP BR
                         ├─ Worker "frasy" (Express via httpServerHandler, nodejs_compat)
                         │    ├─ Static Assets: SPA (dist/, exceto wasm/modelos)
                         │    ├─ API /api/* (mesmas rotas, mesmos middlewares, case-sensitive)
                         │    ├─ bindings: R2 (áudio, modelos, wasm, snapshots), RATE_LIMITER, AI, KV LIMITES
                         │    ├─ Cron Triggers (8 jobs), waitUntil (Langfuse, Sentry)
                         │    └─ placement.region = "aws:sa-east-1"
                         └──> Turso aws-sa-east-1 (@libsql/client/web, drizzle-orm/libsql)   [C: Hyperdrive → Supabase Postgres sa-east-1]
Supabase Auth (JWT via jose) · Asaas · Resend · Groq/OpenRouter: inalterados (só fetch)
GitHub Actions: wrangler deploy / versions (rollback), staging como ambiente wrangler
```

### Camada de dados

- `server/db/db.ts` vira a única costura: `createClient({url: 'file:'})` em dev/testes, `@libsql/client/web`
  em produção (B). Remover `PRAGMA journal_mode/busy_timeout` (sem efeito no Turso), `emTransacao` com
  re-PRAGMA, retry de `SQLITE_BUSY`, `VACUUM INTO`, `sqlite_master` em `manutencao.ts` (usar `PRAGMA table_info`
  ou drizzle introspection).
- As 3 transações interativas (`testesPremium.ts:46`, `limpezaDiaria.ts:86`, `agregados.ts:264`) continuam
  como `transaction()` (≈ N+1 idas de ~5 ms, bem abaixo da janela de 5 s) **ou** viram `batch()` idempotente;
  preferir `batch()` onde o resultado intermediário não decide o próximo passo.
- Rate limit sai do banco (`rateLimitStore.ts`) e vai para o binding Rate Limiting do Workers (por PoP, grátis):
  corta a maior fonte de linhas escritas. Orçamento de IA (`admissao.ts`, hoje em memória) vira linha no banco
  com `UPDATE ... WHERE gasto + x <= teto` (atômico, 1 ida), não Durable Object (130 ms).
- Migrações: `drizzle-orm/libsql` `migrate()` roda no Turso num único request com `foreign_keys=off`; manter
  as 54. Conferir 0011 (recriação de 7 tabelas) e 0032/0053 (25 triggers) num banco Turso de teste.
- Backup: PITR do Turso (Developer 10 dias) + export semanal `turso db export` para o R2 via GitHub Actions;
  `snapshot.ts`, `litestream.yml` e `restauracao-litestream` aposentados.
- **[C]** schema em `pg-core` (`bigint` nos 84 timestamps, `boolean`, `jsonb` nos 7 JSON, coluna gerada STORED),
  baseline único de migração, `rowsAffected`→`rowCount`, `db.run`→`db.execute`, `batch`→`transaction`,
  `json_group_array`→`json_agg`, `group_concat`→`string_agg`, `max(a,b)`→`GREATEST`, revisar 16 `LIKE` e 3
  divisões inteiras; harness de teste com PGlite ou Postgres em container; dois bindings Hyperdrive (com e sem
  cache); backup diário do Supabase + `pg_dump` semanal para o R2 (PITR do Supabase custa US$ 100/mês: não).

### Runtime e HTTP

- Manter o Express (S2 provou; preserva roteamento sensível à caixa e os testes com supertest). `iconv-lite`
  fixado em 0.7.0. Hono fica como refatoração opcional depois do corte.
- Config: `server/lib/config.ts` recebe `env` do Worker; os 95 `process.env` fora dele (maiores:
  `diretorios.ts`, `registroDeProvedores.ts`, `server.ts`, `auth.ts`, `provedores.ts`) passam pelo acessor.
- `server/crypto.ts`: `scryptSync` + `data/secret.key` → segredo do Worker + Web Crypto (sem usuários, recifrar
  do zero).
- Disco: `diretorios.ts`, `storageQuota.ts` (statfs), `corpoEmArquivo.ts` (mkdtemp), `routes/sessions.ts`,
  `routes/import.ts` → R2 por binding (upload multipart via Worker ou URL pré-assinada S3 para corpos > 100 MB,
  limite do plano Free da zona), quota por metadados no banco, retenção por lifecycle.
- Jobs (8, hoje `setTimeout`) → Cron Triggers (250 no Paid), cada um idempotente e em lotes.
- Remover de vez: `node:cluster`, porta 9091/prom-client (→ Analytics Engine ou nada), `loopback-capture`,
  yt-dlp (`import/youtube.ts`, já 403 em produção), `desligamento.ts`.
- Sentry via `@sentry/cloudflare`; Langfuse via `ctx.waitUntil`.

### Importação pesada (Anki, PDF, DOCX, web)

- Anki no **navegador** (sql.js WASM + `fflate` + `fzstd`), alinhado ao produto local-first: elimina 128 MB de
  pico no servidor e o `zstdDecompressSync`; o servidor só recebe cartões já extraídos em lotes.
- PDF/DOCX no navegador (`pdfjs-dist` e `mammoth` têm build para browser). Web: `fetch` + `HTMLRewriter`/
  `linkedom` + Readability no Worker, com lista de bloqueio de IP privado no lugar de `node:dns`.

### Front, domínio e entrega

- SPA em **Workers Static Assets** (Pages está em segundo plano desde 2025); `public/_headers` com CSP real.
- `.wasm` do onnxruntime (até 26,1 MB) e modelos Bergamot → R2 com cache longo; `vite.config.ts` aponta a base
  pública por variável de build.
- Domínio `frasy.com.br` (ou o escolhido) na zona Cloudflare; callbacks Supabase/Asaas/Resend ajustados.
- CI: `ci.yml` mantém a suíte em Node; `deploy.yml` → `wrangler deploy` com `versions` para rollback; staging
  como `env.staging` do `wrangler.jsonc`; drill de restauração semanal contra o PITR.

## Critérios de aceite

- [ ] S6: do Worker no Brasil, `SELECT 1` e a rota simulada de 7 consultas contra Turso `aws-sa-east-1` têm p50 ≤
      10 ms por consulta e p95 ≤ 250 ms no total (25 amostras); o mesmo medido via Hyperdrive→Supabase.
- [ ] Rotas `/api/me`, registrar resultado de exercício e vocabulário: p50 ≤ 130 ms e p95 ≤ 250 ms do Brasil,
      comparadas ao Fly com o mesmo script k6 (`scripts/perf/carga.k6.js`).
- [ ] `npm run typecheck`, `npm run lint`, `npm test` passam; os ~30 testes de WAL/snapshot/réplica/cluster são
      substituídos por equivalentes (PITR, Cron, R2) sem reduzir a cobertura de segurança (`tests/seguranca/*`).
- [ ] AAL2: `/API/me` continua 404 (roteamento sensível à caixa) no Worker.
- [ ] Webhook do Asaas idempotente (`billingEventsRepo.marcarSeNovo`) e checkout sandbox completos no E2E.
- [ ] Importação de um `.apkg` de 200 MB conclui no navegador em ≤ 60 s num notebook comum, sem tocar o servidor
      além dos lotes de cartões.
- [ ] Paridade de dados: export do SQLite do Fly → Turso com contagem por tabela e checksum por tabela iguais.
- [ ] Restauração: PITR para um ponto de 1 h atrás e export para o R2 testados e documentados no runbook.
- [ ] Custo medido na primeira fatura ≤ US$ 36 com tráfego de teste de carga.
- [ ] Fly permanece 14 dias como retorno; DNS volta em ≤ 5 min (TTL baixo) se o portão pós-corte falhar.

## Riscos e mitigação

| Risco                                                              | Mitigação                                                                                                                        |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Turso São Paulo mais lento que o esperado ou indisponível no plano | S6 antes de qualquer código; critério numérico; C como alternativa medida no mesmo spike                                         |
| Quota de linhas escritas do Turso estourar (Developer 25 M/mês)    | Rate limit fora do banco; métrica de linhas escritas com alerta a 70 %; Scaler (US$ 29) só quando houver receita; C como gatilho |
| Produto Turso em transição (nova engine, Fly descontinuado)        | Ficar na engine libSQL estável; export semanal para o R2 em formato `.db` (portável para qualquer SQLite/Fly)                    |
| Hyperdrive sem pool na América do Sul (só em C)                    | Medido no S6 com `cf-placement` e `pg_stat_activity`; se falhar, C sai da mesa                                                   |
| Regressão de segurança ao trocar o runtime                         | Suíte `tests/seguranca/*` e ZAP obrigatórios no portão; CSP real no `_headers`                                                   |
| Corpo de upload > 100 MB bloqueado pela zona Free                  | Upload direto ao R2 por URL pré-assinada/multipart; o Worker só valida e registra                                                |
| Workers CPU-ms (30 M inclusos)                                     | Rotas caras (`vocab` 133 ms de CPU) medidas; 1 M requisições pesadas ≈ US$ 2 extra, dentro do teto                               |
| Perda de dados no corte                                            | Congelar escritas no Fly, exportar, importar, conferir checksum, só então trocar DNS; Fly 14 dias como retorno                   |
| Pages/Static Assets 25 MiB                                         | wasm e modelos no R2 (já decidido para o Bergamot)                                                                               |

## Plano de entrega (alvo B; C soma 2 a 3 semanas na Fase 1)

| Fase | Entrega                                                                                                                                                         | Verificação                                                               | Estimativa |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------- |
| 0b   | **S6**: Worker em GRU com `placement aws:sa-east-1`, banco Turso em `aws-sa-east-1` e projeto Supabase Free em sa-east-1 via Hyperdrive; 25 amostras por célula | Tabela em `docs/auditoria/`; portão G0 decide B, C ou A                   | 1 a 2 dias |
| 1    | Dados: `db.ts` com driver duplo, PRAGMAs/snapshot/litestream fora, rate limit no binding, admissão no banco, migrações validadas no Turso                       | `npm test` em Node (file:) e os repositórios contra um Turso de teste     | 4 a 5 dias |
| 2    | Runtime: `env` injetado, Web Crypto, R2 por binding, uploads, 8 Cron, remoção de cluster/9091/yt-dlp, Sentry/Langfuse                                           | `wrangler dev` com `/api/health`, login JWT, upload e um cron manual      | 5 a 6 dias |
| 3    | Importação no navegador (Anki, PDF, DOCX) e web sem jsdom                                                                                                       | E2E com `.apkg` real; testes unitários do parser movidos para `src/core`  | 4 a 5 dias |
| 4    | Static Assets, R2 para wasm/modelos, `_headers`, domínio, workflows, staging                                                                                    | Lighthouse e ZAP na URL de staging; rollback por `wrangler versions`      | 2 a 3 dias |
| 5    | Verificação: suíte dupla, segurança, E2E, k6 Fly vs Cloudflare, paridade por checksum, drill de PITR, revisão independente; **portão G1**                       | Relatório em `docs/auditoria/`; só então merge e corte com Fly em retorno | 4 a 5 dias |

Total: **3 a 4 semanas** de trabalho concentrado para B; 5 a 7 para C.

## Perguntas em aberto

1. Aceita um terceiro fornecedor (Turso) para o banco, ou prefere só Cloudflare + Supabase (opção C, mais cara em
   esforço)?
2. O S6 precisa de um token novo da Cloudflare (os dois anteriores devem ser revogados) e de uma conta Turso
   (Free) e um projeto Supabase Free em sa-east-1 para medir; posso criá-los?
3. R2 ainda não está ativado na conta (erro 10042): é pré-requisito das Fases 2 e 4.
4. Transferir o rate limit para o binding do Workers muda a semântica de global para por PoP; aceitável para o
   lançamento?
