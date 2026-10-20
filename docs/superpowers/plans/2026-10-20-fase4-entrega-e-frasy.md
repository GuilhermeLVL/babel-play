# Fase 4 — Entrega na Cloudflare e nome Frasy — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** deixar o Worker pronto para ser publicado com o nome Frasy: CSP bloqueante nos estáticos, buckets R2 e lifecycle, secrets fora do git, `/api/health` honesto no Worker, staging com Hyperdrive próprio, CI que publica com rollback, cache de DoH, métricas no Analytics Engine, e as medições pendentes feitas num deploy de staging.

**Architecture:** o build do Vite passa a GERAR `dist/_headers` a partir da mesma fonte da CSP do Express (`diretivasDeCsp`), então estáticos e API nunca divergem. A infraestrutura é criada por scripts reproduzíveis em `scripts/cloudflare/` (buckets, lifecycle, CORS, Hyperdrive de staging, secrets) com o token do `.env`; o staging usa um **banco separado no mesmo projeto Supabase de SP** (`frasy_staging`) e um Hyperdrive próprio, evitando um segundo projeto. A publicação é por `wrangler versions upload` + `versions deploy`, com fumaça pós-deploy e rollback automático no workflow. O nome muda só onde a pessoa vê e no que é criado novo na Cloudflare; identificadores internos (`babel-` em chaves de storage, sais criptográficos, bancos, Fly, repo) ficam.

**Tech Stack:** Vite (plugin de build), Express/helmet, Cloudflare Workers + Static Assets + R2 + Hyperdrive + Analytics Engine, wrangler 4, GitHub Actions, Supabase Postgres, Playwright, vitest.

**Spec:** `docs/specs/2026-10-19-migracao-cloudflare.md` ("Front, domínio e entrega", "Plano de entrega" Fase 4, critérios de aceite). Contexto: `docs/auditoria/2026-10-19-spikes-cloudflare.md` (pendências das Fases 3–5; "Fase 3 concluída"). Inventários desta fase estão nos rulings abaixo.

## Global Constraints

- Branch `cloudflare/migracao`; `main`, Fly e domínio atual intactos. Commits diretos (autorizado). Nenhum `wrangler deploy` para PRODUÇÃO nesta fase; o deploy de **staging** (`frasy-staging.guigui-cruzeiro.workers.dev`, sem crons, Free) só depois da resposta do dono à pergunta feita em 20/10 (Task 9 fica BLOCKED até lá).
- Segredos nunca em arquivo versionado: tokens só no `.env`; secrets do Worker por `wrangler secret bulk` lendo `.secrets.<ambiente>.json` (gitignored, `.secrets.example.json` versionado só com nomes).
- Nunca imprimir tokens/senhas; nunca desligar verificação TLS; `verify-full` com a CA `supabase-2021` já enviada (id `011bac50-d7ab-4034-b878-ff0a5d5c3cf5`).
- Ações que GASTAM ou são visíveis fora da máquina: criar buckets/Hyperdrive/secrets é permitido (grátis, reversível); deploy só de staging e só após "sim" do dono; nada de Workers Paid (o dono assina).
- Textos de UI, comentários e docs em pt-BR; identificadores no padrão da pasta; `src/core` puro.
- Rename: muda o que a pessoa vê (UI, i18n, e-mails, Asaas, nomes de arquivo exportado, `.apkg`, User-Agent, docs vivos, `index.html`, `.env.production.example`) e o que nasce novo na Cloudflare (Worker `frasy`/`frasy-staging`, buckets `frasy-*`). NÃO muda: chaves `babel.*`/`babel_*` do navegador, sais `babel-play-web:*`, `.babel-lock`, `data/babel.db`, `babel_teste`, tema `babel`, `__babelGateway`, tags de imagem/Fly/docker-compose, `wrangler.toml` do Pages, URLs do GitHub, Sentry/Langfuse `babel-play*`, `ops/alertas`/`dashboards` (Prometheus do Fly, aposentados na Fase 5), histórico em `docs/auditoria`, `docs/historico`, `docs/prototipos`, `docs/redesign`, `docs/pesquisa`, `openspec/`.
- Portão de cada tarefa: `npm run typecheck`, `npm run lint`, testes citados. Portão final: `npm test`, `BANCO_DE_TESTE=postgres` em `tests/integration tests/caracterizacao`, `npm run worker:build` + `tests/worker`, `WRANGLER_FUMACA=1 npm run fumaca:worker`, E2E Node, `npx knip`, `npm run i18n:orfas`.

## Review Focus

1. **CSP bloqueante quebra uma tela que a E2E não cobre** (checkout Asaas/Turnstile, login Supabase, imagem de capa externa): a pessoa vê a tela sem funcionar e nada avisa. Teste em Task 2 (o `_headers` gerado contém TODAS as origens de `diretivasDeCsp(env)`, incluindo Turnstile e Supabase quando as variáveis existem) e Task 9 (passeio no staging com o console aberto, sem violação).
2. **Secret faltando em produção**: hoje o Worker sobe e `/api/health` diz `ok` mesmo sem `ASAAS_WEBHOOK_TOKEN`. Teste em Task 4 (`relatarConfiguracao()` no portão → `degraded` com o nome da variável).
3. **Deploy que sobe uma versão quebrada**: o workflow precisa fazer fumaça em `/api/ready` e `/api/health.versao === sha` e voltar sozinho. Teste em Task 6 (workflow validado por `npm run workflows:validar` + teste do script de fumaça com servidor falso).
4. **Staging escrevendo no banco de produção** por erro de binding: Task 5 fixa `database: frasy_staging` no Hyperdrive de staging e um teste lê o `wrangler.jsonc` e exige que `env.staging.hyperdrive[0].id ≠ produção`.
5. **Rename quebra reconhecimento de arquivo antigo**: alguém com `babel-play-relatorio.json` exportado antes precisa continuar importando. Teste em Task 1 (importadores aceitam os dois prefixos).
6. **Cache de DoH reabre DNS rebinding**: TTL curto e fail-closed; teste em Task 7 (entrada expirada volta a consultar; IP privado nunca é cacheado como público).

---

## Rulings de desenho

- **R1 — `_headers` gerado no build.** Plugin Vite `scripts/vite/cabecalhos.ts` escreve `dist/_headers` com: regras de cache de hoje (`public/_headers` vira `scripts/vite/_headers.base`, sem a linha de CSP), COOP/COEP/DIP iguais a `server/http/isolamento.ts`, e `Content-Security-Policy` (bloqueante) = `diretivasDeCsp(env)` serializada, lendo as `VITE_*`/`SUPABASE_URL`/`VITE_TURNSTILE_SITE_KEY`/`VITE_SENTRY_DSN`/`VITE_BERGAMOT_MODELOS_URL`/`VITE_ORT_WASM_URL` do ambiente de build. `public/_headers` deixa de existir (a edição estática usa o mesmo `dist/`). `/diagnostico-audio.html` mantém a exceção. `cdn.jsdelivr.net` permanece em `connect-src` até o Task 3 mover os pesos.
- **R2 — Modelos/WASM por variável, R2 como opção.** `VITE_ORT_WASM_URL` (base pública) alimenta `ort.env.wasm.wasmPaths` nos 4 lugares; vazia → `/` (assets, como hoje). Buckets `frasy-modelos` (público) criado e script de publicação apontado; a troca efetiva de origem espera o domínio (r2.dev não é para produção). Vale também para `VITE_BERGAMOT_MODELOS_URL`/`VITE_SELF_HOST_MODELS`, que já existem.
- **R3 — Staging = banco `frasy_staging` no projeto Supabase de SP** + Hyperdrive `frasy-staging-sp` (mesma CA, `verify-full`), migrado por `npm run db:migrate`. Worker `frasy-staging`, bucket `frasy-midia-staging`, `crons: []`, `workers_dev: true` só no staging.
- **R4 — Publicação por versões.** `wrangler versions upload` → fumaça na URL de preview (`--preview-alias`) → `wrangler versions deploy` 100 % → fumaça final → se falhar, `wrangler rollback` para a versão anterior. Migrations rodam no workflow ANTES do upload (`db:migrate` pelo pooler de sessão; compatíveis para trás por regra).
- **R5 — Secrets.** `scripts/cloudflare/secrets.mjs <ambiente>` lê `.secrets.<ambiente>.json` e faz `wrangler secret bulk`; a lista de nomes obrigatórios/recomendados sai de `server/lib/config.ts` (não de um arquivo paralelo). `relatarConfiguracao()` roda uma vez por isolate no portão do Worker.
- **R6 — Analytics Engine com subconjunto.** Dataset `frasy_metricas`; a fachada `server/http/metricas.ts` ganha um implementador para Worker que grava 6 famílias: requisições (rota, status, ms), admissão recusada (motivo), custo de IA por plano, uso do R2 (op/bytes), provedor de IA (nome, status, ms), jobs (nome, ms, resultado). O resto fica no-op com comentário. Painéis/alertas Prometheus do Fly ficam até a Fase 5.
- **R7 — Cache de DoH por isolate**: `Map` host → `{ ips, expiraEm }`, TTL 60 s, 512 entradas, só respostas com IP público; IP privado nunca entra; `fail-closed` mantido.
- **R8 — Rename sem tocar identificadores internos** (lista nas Global Constraints). "Nuvem do Babel" → "Nuvem do Frasy". Textos jurídicos (`privacidade.html`, `termos.html`, consentimento do responsável) trocam só o nome do produto; razão social é do dono. Se o consentimento tiver versão/hash, incrementar.
- **R9 — Medições no staging real** (scrypt frio, admissão p95, upload 100 MB, ganho do DoH) são do Task 9; k6 e carga ficam na Fase 5. Bloqueantes para o G1 só: scrypt frio < 50 ms de CPU e admissão p95 < 250 ms; o resto é registro.
- **R10 — Dependências do dono** (não bloqueiam o resto): Workers Paid; zona `frasy.com.br` na Cloudflare (hoje não existe nenhuma zona na conta); Turnstile; painéis Supabase/Asaas/Resend com o domínio; tokens de CI com escopos Workers/R2/Hyperdrive; apagar o Worker antigo `babel-play` (edição estática em `babel-play.guigui-cruzeiro.workers.dev`) quando quiser.

---

### Task 1: Nome Frasy (lote mecânico)

**Files:** `index.html`, `src/**` (30 arquivos com "Babel Play" + 158 chaves internas que NÃO mudam), `public/i18n/{en,es,ar,xx}.json`, `src/lib/anki/montarApkg.ts`, `src/components/views/BaralhoAnki.tsx`, `src/components/views/*/ExportarVocabulario.tsx`, `src/lib/{baixarCaptura,relatorioDeProgresso}.ts`, `src/components/**/{AbaDados,Estatisticas}.tsx`, `src/lib/**/modeloDoRelatorio.ts`, `server/lib/{conviteDoResponsavel,consentimentoDoResponsavel,config,preflightProducao}.ts`, `server/routes/billing.ts`, `server/ai/funcoesDeIa.ts`, `server/import/web.ts`, `scripts/trilha/lexemes.mjs`, `scripts/vitrine/asaas-falso.mjs`, `scripts/subir-dev.mjs`, `scripts/vitrine/subir.mjs`, `server.ts`, `public/{privacidade,termos}.html`, `README*.md`, `CLAUDE.md`, `.claude/skills/*/SKILL.md`, `docs/{LANCAMENTO,STAGING,runbook,CUSTOS-E-SERVICOS,deploy,escala,edicao-estatica,testar-no-quest}.md`, `docs/auth/EMAILS-E-PROVEDORES.md`, `docs/auth/emails/*.html`, `.env.production.example`, `wrangler.jsonc` (`name: "frasy"`, staging `"frasy-staging"`, buckets `frasy-midia`/`frasy-midia-staging`), `scripts/backup/enviar-ao-r2.ts` (padrão `frasy-backups`), `.github/workflows/backup-pg-dump.yml`, `scripts/modelos/publicar-*-r2.ts` (`frasy-modelos`), `package.json` (`description`), testes listados pelo inventário (27 arquivos; `tests/e2e-publico/login-pseudo.e2e.ts` `MARCA`), `tests/ci-backup.test.ts`, `tests/preflight-producao.test.ts`, `tests/url-publica-index.test.ts` (`frasy.com.br`).

**Interfaces:** nomes de arquivo exportado passam a `frasy-…`; os importadores de relatório/captura (`src/lib/**` que leem o JSON) aceitam também o prefixo antigo `babel-play-…` (teste). Domínio nos exemplos: `frasy.com.br`, `modelos.frasy.com.br`, `EMAIL_REMETENTE=Frasy <nao-responda@frasy.com.br>`.

- [ ] **Step 1: Testes primeiro** — atualizar os 27 arquivos de teste citados para o nome novo e acrescentar `it('ainda importa um relatório exportado com o prefixo babel-play-')` onde houver importador de arquivo com nome fixo (se não houver importador por nome, registrar no relatório e pular). Rodar: FAIL.
- [ ] **Step 2: Substituição guiada** (`git grep -n -i -E "babel[ _-]?play"` em `src server scripts public index.html README* CLAUDE.md .claude docs/{LANCAMENTO,STAGING,runbook,CUSTOS-E-SERVICOS,deploy,escala,edicao-estatica,testar-no-quest,auth}.md .env.production.example wrangler.jsonc package.json .github/workflows/backup-pg-dump.yml`), respeitando a lista do que NÃO muda; i18n: renomear as 12 chaves em en/xx, traduzir em es/ar o que faltar, "Nuvem do Babel" → "Nuvem do Frasy" nos 4; `node scripts/i18n/pseudo.mjs`; `npm run i18n:orfas` sem órfã nova.
- [ ] **Step 3:** `npm run typecheck && npm run lint && npx vitest run <os 27 arquivos> tests/contratos tests/worker` → PASS; `git grep -i -E "babel ?play" -- src public/i18n index.html server scripts | grep -v -E "babel-play-web:|babel-play\.(envelope|server)|logger: 'babel-play'|github.com/GuilhermeLVL|babel-play-(http|prod|staging)|pages\.dev|/babel-play/"` → vazio.
- [ ] **Step 4: Commit** — `feat(marca): Babel Play vira Frasy no que a pessoa vê e no que nasce na Cloudflare (Fase 4, T1)`

### Task 2: CSP bloqueante gerada no build (`dist/_headers`)

**Files:** Create `scripts/vite/cabecalhos.ts`, `scripts/vite/_headers.base`; Modify `vite.config.ts` (plugin), `server/http/csp.ts` (exportar `serializarCsp(diretivas): string` se não existir), `scripts/build-estatica.mjs` e `tests/e2e-estatica/_servidor-estatico.mjs` (passam a ler `dist/_headers`), `docs/deploy.md`; Delete `public/_headers`; Test `tests/cabecalhos-gerados.test.ts`, `tests/seguranca/csp-estreita.test.ts` (acrescentar caso).

**Interfaces:** `gerarHeaders(env: NodeJS.ProcessEnv, base: string): string` em `scripts/vite/cabecalhos.ts` — devolve o conteúdo do `_headers`: regra `/*` com COOP `same-origin`, COEP `credentialless`, `Document-Isolation-Policy: isolate-and-credentialless`, nosniff, Referrer-Policy e Permissions-Policy de hoje, mais `Content-Security-Policy: <serializarCsp(diretivasDeCsp(env))>`; `/diagnostico-audio.html` com `! Content-Security-Policy`; depois as regras de cache do `_headers.base` inalteradas. Plugin `cabecalhosDoDeploy()` em `closeBundle` escreve `dist/_headers`.

- [ ] **Step 1: Testes** — `it('a CSP do _headers é a mesma de diretivasDeCsp(env), bloqueante')` (com `SUPABASE_URL`, `VITE_TURNSTILE_SITE_KEY`, `VITE_SENTRY_DSN`, `VITE_BERGAMOT_MODELOS_URL` definidos → as origens aparecem em `connect-src`/`script-src`/`frame-src`), `it('sem variáveis, a política é a mínima do app (self, wasm-unsafe-eval, blob:, jsdelivr, huggingface…)')`, `it('as regras de cache do base vêm inalteradas')`, `it('diagnostico-audio.html fica sem CSP')`, `it('não existe Content-Security-Policy-Report-Only')`.
- [ ] **Step 2:** RED → implementar → GREEN. `npm run build` gera `dist/_headers`; `npm run build:estatica` e `npx vitest run tests/e2e-estatica` (se rodarem localmente) continuam passando.
- [ ] **Step 3:** `npx vitest run tests/cabecalhos-gerados.test.ts tests/seguranca tests/worker` + `npm run typecheck && npm run lint`; Commit — `feat(csp): _headers gerado no build com a mesma política bloqueante do Express (Fase 4, T2)`

### Task 3: R2 — buckets, lifecycle, CORS, base dos modelos por variável

**Files:** Create `scripts/cloudflare/r2.mjs` (idempotente: cria `frasy-midia`, `frasy-midia-staging`, `frasy-backups`, `frasy-modelos`; lifecycle `semanal/` 56 dias em `frasy-backups`; CORS GET para `frasy-modelos` com `--origens` dadas); Modify `src/gateway/offlineTranscribe.ts:175`, `src/gateway/capture/{fimDeFalaWorker,vadWorker}.ts`, `src/gateway/adapters/parakeetWorker.ts` (`wasmPaths = baseDoWasm()`), Create `src/gateway/baseDoWasm.ts` (`VITE_ORT_WASM_URL` ou `/`), `server/http/csp.ts` (inclui `VITE_ORT_WASM_URL` em `connect-src`/`script-src`? só `connect-src` + `worker-src` se for mesma origem; ORT carrega `.wasm` por fetch), `scripts/modelos/publicar-no-r2.ts` (aceita `--prefixo ort/<versão>`), `docs/deploy.md`, `docs/LANCAMENTO.md`; Test `tests/baseDoWasm.test.ts`, `tests/cabecalhos-gerados.test.ts` (+1 caso), `tests/worker/wrangler.test.ts` (buckets `frasy-*`).

- [ ] **Step 1:** `node scripts/cloudflare/r2.mjs --dry-run` imprime o plano; `node scripts/cloudflare/r2.mjs` cria (token do `.env`; se faltar permissão de R2, reportar BLOCKED com a mensagem exata, sem contornar). `npx wrangler r2 bucket list` mostra os 4; `wrangler r2 bucket lifecycle list frasy-backups` mostra a regra.
- [ ] **Step 2:** testes de `baseDoWasm` (vazio → `/`; URL → termina em `/`; valor inválido → erro de build legível) e da CSP; implementar; `npm run build` com `VITE_ORT_WASM_URL=https://modelos.frasy.com.br/ort/` gera `_headers` com a origem.
- [ ] **Step 3:** `npm run typecheck && npm run lint && npx vitest run tests/baseDoWasm.test.ts tests/cabecalhos-gerados.test.ts tests/worker`; Commit — `feat(r2): buckets frasy-* com lifecycle e CORS; base do WASM por variável (Fase 4, T3)`

### Task 4: Secrets do Worker e `relatarConfiguracao()` no portão

**Files:** Create `scripts/cloudflare/secrets.mjs`, `.secrets.example.json` (só nomes, gerado de `server/lib/config.ts`: obrigatórias em produção/modo público + `impede-servico` + recomendadas), `.gitignore` (`.secrets.*.json` exceto `.example`); Modify `server/boot/portaoDoWorker.ts` (chama `relatarConfiguracao()` UMA vez por isolate quando `validarBoot()` passa; a saída vai pelo logger, não `console.log`), `server/boot/validar.ts` (se `relatarConfiguracao` escrever em `console.log`, trocar por `log.info`), `docs/deploy.md` (seção "Secrets do Worker"); Test `tests/worker/portao-do-boot.test.ts` (+2 casos), `tests/secrets-example.test.ts`.

- [ ] **Step 1: Testes** — `it('no Worker, variável crítica ausente deixa /api/health degraded com o nome dela')`, `it('relatarConfiguracao roda uma vez por isolate (segunda requisição não reporta de novo)')`, `it('.secrets.example.json lista exatamente as variáveis que config.ts marca como produção/modo-publico/impede-servico')`.
- [ ] **Step 2:** RED → implementar → GREEN. `node scripts/cloudflare/secrets.mjs staging --dry-run` lista os nomes sem valores; sem arquivo `.secrets.staging.json` → mensagem clara.
- [ ] **Step 3:** `npm run typecheck && npm run lint && npx vitest run tests/worker tests/secrets-example.test.ts`; Commit — `feat(worker): secrets por script e configuração reportada no portão (Fase 4, T4)`

### Task 5: Staging real — banco `frasy_staging` + Hyperdrive próprio + `env.staging` completo

**Files:** Create `scripts/cloudflare/hyperdrive-staging.mjs` (cria o banco `frasy_staging` via conexão direta ao Supabase SP com `SUPABASE_DB_PASSWORD` do `.env` e `sslrootcert=data/supabase-ca.crt`; `wrangler hyperdrive create frasy-staging-sp --connection-string ... --ca-certificate-id 011bac50-d7ab-4034-b878-ff0a5d5c3cf5 --sslmode verify-full --caching-disabled`; imprime o id), Modify `wrangler.jsonc` (`env.staging`: `hyperdrive` com o id, `workers_dev: true`, `assets` e `placement` só se o wrangler não herdar — conferir com `wrangler deploy --dry-run --env staging` que o bundle sai igual), `docs/deploy.md`; Test `tests/worker/wrangler.test.ts` (`env.staging.hyperdrive[0].id !== hyperdrive[0].id`; `env.staging.triggers.crons` vazio; `env.staging.name === 'frasy-staging'`).

- [ ] **Step 1:** rodar o script (cria o banco e o Hyperdrive; se a conexão direta IPv6 não existir nesta rede, usar o pooler `aws-1-sa-east-1.pooler.supabase.com:5432` para o `CREATE DATABASE` e reportar); `DATABASE_URL=<direta>/frasy_staging npm run db:migrate` (prazos do papel já valem: papel é do cluster).
- [ ] **Step 2:** testes do `wrangler.jsonc`; `npm run worker:build` e `npx wrangler deploy --dry-run -c wrangler.jsonc --env staging` sem erro (não publica).
- [ ] **Step 3:** Commit — `feat(staging): banco frasy_staging e Hyperdrive próprio; env.staging publicável (Fase 4, T5)`

### Task 6: CI — publicação com versões e rollback; job do Worker no CI

**Files:** Create `.github/workflows/deploy-worker.yml` (manual com `environment: staging|production` e `ref`; passos: checkout, `npm ci`, build Vite com `VITE_*` do Environment + `VITE_PUBLIC_URL`, `npm run db:migrate` (`DATABASE_URL` do Environment, pooler de sessão), `wrangler versions upload --env <amb> --var GIT_SHA:$sha --preview-alias fumaca`, fumaça na URL de preview (`scripts/cloudflare/fumaca-remota.mjs <url> <sha>`: `/api/ready` 200 e `/api/health.versao` termina com o sha), `wrangler versions deploy <id>@100% -y`, fumaça na URL final, e em falha `wrangler rollback --message "fumaça falhou" -y` + `exit 1`), `scripts/cloudflare/fumaca-remota.mjs`; Modify `.github/workflows/ci.yml` (job `worker`: `npm run worker:build`, `npx vitest run tests/worker`, `WRANGLER_FUMACA=1 npm run fumaca:worker` com o service Postgres 17 já usado por `postgres-real` — se a fumaça exigir Docker, usar o `services:` do job em vez do `docker run` do script: acrescentar `FUMACA_PG_URL` ao script), `.github/workflows/lighthouse.yml` (input `url`; mede a URL em vez de subir o Node), `docs/deploy.md`; Test `tests/fumaca-remota.test.ts` (servidor HTTP falso: ok, versão errada, 503), `npm run workflows:validar`.

- [ ] **Step 1:** testes da fumaça remota (RED → GREEN).
- [ ] **Step 2:** workflows; `npm run workflows:validar` e `tests/validar-workflows*` passam; `act` não é exigido.
- [ ] **Step 3:** Commit — `ci(worker): publicação por versões com fumaça e rollback; job do Worker no CI (Fase 4, T6)`

### Task 7: Cache de DoH por isolate

**Files:** Modify `server/ai/ssrf.ts` (`resolverSeguro` com cache R7), `docs/deploy.md` (janela de rebinding); Test `tests/seguranca/ssrf-rebinding.test.ts` (+3 casos: cacheia IP público 60 s; IP privado nunca é cacheado; entrada expirada consulta de novo e, se agora privado, recusa).

- [ ] **Step 1:** RED → implementar → GREEN; `npx vitest run tests/seguranca/ssrf-rebinding.test.ts tests/seguranca/ssrf-vetores.test.ts`.
- [ ] **Step 2:** Commit — `perf(ssrf): cache de DoH por isolate com TTL curto, fail-closed (Fase 4, T7)`

### Task 8: Analytics Engine (subconjunto R6)

**Files:** Modify `wrangler.jsonc` (`analytics_engine_datasets: [{ binding: "METRICAS", dataset: "frasy_metricas" }]`, também no staging), `worker.ts` (passa o binding ao escopo), `server/http/metricas.ts` (implementador `metricasDoAnalyticsEngine(binding)` para as 6 famílias; fora do Worker continua `prom-client`), `docs/runbook.md` (consultas SQL do Analytics Engine para cada família); Test `tests/worker/metricas-analytics.test.ts` (binding falso recebe `writeDataPoint` com `blobs`/`doubles`/`indexes` no formato documentado; chamadas fora das 6 famílias são no-op; nunca lança).

- [ ] **Step 1:** RED → implementar → GREEN; `npm run worker:build && npx vitest run tests/worker tests/metricas*`.
- [ ] **Step 2:** Commit — `feat(metricas): Analytics Engine no Worker para 6 famílias (Fase 4, T8)`

### Task 9: Deploy de staging + medições + Lighthouse/ZAP (BLOCKED até o "sim" do dono)

**Files:** Create `scripts/perf/staging-medicoes.mjs` (scrypt frio: 20 requisições `/api/me` após `wrangler versions deploy` nova, mede `cf-ray`/tempo da 1ª vs 2ª; admissão p95: 50 chamadas paralelas à rota de STT com corpo mínimo e token de teste; upload 100 MB a `/api/sessions/:id/audio`; importação web com e sem cache de DoH), `docs/auditoria/2026-10-20-fase4-staging.md`.

- [ ] **Step 1:** `node scripts/cloudflare/secrets.mjs staging` (com `.secrets.staging.json` preenchido pelo controlador a partir do `.env`: `SECRET_KEY` nova, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_SANDBOX=1` etc.); `gh workflow run deploy-worker.yml -f environment=staging` OU localmente `wrangler versions upload/deploy --env staging`.
- [ ] **Step 2:** passeio no staging com o console aberto (captura, tradução, jogos, dicionário, login, importação de `.apkg`) sem violação de CSP; `E2E_RUNTIME=worker BASE_URL=https://frasy-staging.guigui-cruzeiro.workers.dev npx playwright test` (só suítes que não dependem de login, ou com conta de teste); Lighthouse e ZAP pela URL (`gh workflow run`).
- [ ] **Step 3:** medições (R9) registradas no doc; se scrypt frio > 50 ms CPU ou admissão p95 > 250 ms, abrir item na Fase 5.
- [ ] **Step 4:** Commit — `docs(auditoria): staging publicado, medições e CSP provada (Fase 4, T9)`

### Task 10: Docs, portão e fechamento

- [ ] `CLAUDE.md` (scripts/cloudflare, `_headers` gerado), `docs/deploy.md` (ordem: buckets → secrets → migrate → versions), `docs/auditoria/2026-10-19-spikes-cloudflare.md` seção "Fase 4 concluída" (portão, decisões R1–R10, pendências do dono: Workers Paid, zona DNS, Turnstile, painéis, tokens de CI, apagar Worker `babel-play`), memória.
- [ ] Portão completo (Global Constraints). Commit — `docs(auditoria): Fase 4 concluída`.

## Self-review

- Cobertura da spec: `_headers` com CSP real (T2); `.wasm`/Bergamot para R2 com base por variável (T3, troca efetiva depende do domínio — R2); domínio (R10, dono) e callbacks (docs em T10); `deploy.yml` → `wrangler deploy` com versions e rollback (T6); staging como `env.staging` (T5); drill de restauração fica na Fase 5 (spec a coloca com o PITR). Pendências da auditoria: todas (T2–T9). Rename (dono) em T1.
- Tipos: `gerarHeaders`/`serializarCsp` (T2) usados em T3; `fumaca-remota.mjs` (T6) usado em T9; binding `METRICAS` (T8) referido no `worker.ts`.
- Review Focus: 1→T2/T9, 2→T4, 3→T6, 4→T5, 5→T1, 6→T7.
