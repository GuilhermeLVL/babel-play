# Prontidão para produção — Fase 6: versionamento e distribuição (25/09/2026)

Branch `feat/entrega-continua` (worktree `.claude/worktrees/fx-entrega`, a partir de
`auditoria/prontidao-producao` em `fa1fa3e`). Escopo: CI/CD, migrations, backups e runbooks. Feature
flags ficaram com outro agente e não foram tocadas.

## 0. Ponto de partida (Fase 1)

`deploy.yml` manual com portão de CI (P0-5) e `--strategy immediate`, sem staging obrigatório, sem
snapshot pré-deploy, sem rollback automático · migrations só para a frente, no boot, sem gate
expand/contract · snapshots drizzle faltando para 0023 e 0025–0030 · restauração nunca feita em
produção · sem semver/tag, CHANGELOG parado · versão já exposta (`x-babel-versao`, `/api/health.versao`).

## 1. O que foi feito

| # | Entrega | Arquivos | Evidência |
|---|---|---|---|
| 1 | **Semver e release.** `npm run release -- patch\|minor\|major` sobe `package.json` + `package-lock.json`, move `[Unreleased]` para `[X.Y.Z] — data` e **imprime** (não executa) commit/tag. Recusa `[Unreleased]` vazio sem tocar em nada. Política de major/minor/patch para app + API | `scripts/release.mjs`, `tests/release.test.ts`, `docs/versionamento.md` §1 | 10 testes (CLI de verdade num `mkdtemp`) |
| 2 | **Compatibilidade da API.** Censo das 94 rotas `/api` em `tests/contratos/api-contrato.json`; rota só some 2 minor depois de entrar em `api-depreciacoes.json`; rota nova é livre mas precisa ser registrada (`--atualizar`). O censo foi extraído de `rotas-sem-consumidor.mjs` para `_rotas-do-servidor.mjs` e é o MESMO nos dois portões. Passo "Contrato da API" no job `verify` | `scripts/testes/{contrato-api,_rotas-do-servidor}.mjs`, `tests/contratos/{api-contrato,api-depreciacoes}.json`, `tests/contratos/compatibilidade-api.test.ts`, `docs/versionamento.md` §2 | 9 testes; `rotas-sem-consumidor` segue com 96 rotas / 0 órfãs |
| 3a | **Portão expand/contract.** Migration ≥ 0030 com `DROP TABLE`/`DROP COLUMN`/`RENAME`/`ALTER … NOT NULL` sem `DEFAULT` reprova, salvo `-- CONTRATO: <justificativa>`; com contrato, o `git diff` contra a base não pode ter código de `src/`, `server/` ou `server.ts` (exceto `server/db/schema.ts` e `server/db/migrations/`). Exige `REVERSAO:`/`REVERSÃO:`. Confere journal × arquivos. Job `migracoes` (com `fetch-depth: 0`; PR → `origin/<base>`, push → `github.event.before`; sem base resolvível só cobra o marcador e avisa) | `scripts/migracoes/conferir.mjs`, `tests/migracoes-conferir.test.ts`, `ci.yml` | 16 testes; repositório atual: 31 migrations, 1 conferida (0030), 0 erros |
| 3b | **Snapshots drizzle.** `0030_snapshot.json` gerado pelo drizzle-kit (`generateSQLiteDrizzleJson` de `drizzle-kit/api`, `prevId` = 0024), não à mão. `npx drizzle-kit generate` agora responde **"No schema changes, nothing to migrate"** (antes: prompt interativo de renomeação, que trava sem TTY). Os de 0023 e 0025–0029 **não foram recriados**: o `schema.ts` daquelas épocas não existe mais e o `generate` só usa o último — documentado | `scripts/migracoes/snapshot-do-schema.ts`, `server/db/migrations/meta/0030_snapshot.json` | saída do `drizzle-kit generate` |
| 3c | **Teste schema × banco por introspecção.** Aplica todas as migrations num libsql em memória e pede ao drizzle-kit (`pushSQLiteSchema`) o diff até o `schema.ts`; tem que ser vazio. Índice parcial e coluna gerada (limitações conhecidas da introspecção SQLite) só são aceitos se o banco também os tiver (conferido no `sqlite_master`/`table_xinfo`). **Achou divergência real**: `rank.combo` tem `DEFAULT 0` no banco (0027) e não no `schema.ts` → corrigido no schema (sem migration). Conferido que o teste reprova ao desfazer a correção | `tests/integration/schema-igual-ao-banco.test.ts`, `server/db/schema.ts` | 2 testes |
| 4 | **Deploy staging → produção.** `deploy.yml` (destino `staging` \| `staging-e-producao` \| `producao`) → `implantar-ambiente.yml` (workflow_call, um por ambiente). Produção só de commit com o selo `deploy/staging` = success (commit status gravado pela fumaça verde) ou `pular_staging` + justificativa no resumo; rollback manual para produção aceita também `deploy/production`. Por ambiente: registra a imagem no ar → constrói (tag = sha) → `fly volumes snapshots create` do `babel_dados` → `fly deploy --strategy immediate` → fumaça (`/api/ready` 200 **e** `/api/health.versao` termina em `+<sha7>`) → se falhar, **rollback automático** para a imagem anterior, job vermelho, selo `failure`. `URL_PUBLICA` passou a ser obrigatória (sem ela não há fumaça nem rollback) | `.github/workflows/{deploy,implantar-ambiente}.yml` | `npm run workflows:validar` OK |
| 5 | **CI de carga leve.** Job `carga`: `npm run build`, sobe `dist-server/server.cjs` (NODE_ENV=production, self-host, banco vazio, migrations no boot), autocannon 10 conexões × 10 s em `/api/health`, `/api/abertura`, `/api/settings`, `/api/sessions`; reprova p95 ≥ 500 ms (calculado de cada resposta) ou qualquer erro/timeout/não-2xx, com a rota e o motivo; tabela no step summary | `scripts/perf/ci-carga.mjs`, `tests/ci-carga.test.ts`, `ci.yml` | local: p95 4,2 / 1,7 / 8,2 / 6,8 ms, 0 erro; com `--p95=3` reprova e diz "`/api/health`: p95 5.8 ms >= 3 ms" |
| 6 | **Exercício de restauração.** Runbook §0.2-C (Fly: máquina temporária com volume NOVO, `restaurar-snapshot` + `litestream restore` + `verificar`, contagens contra o banco vivo, desmontagem) e §0.2-D; workflow manual `restauracao-drill.yml`: acha o snapshot mais recente no R2, restaura com `server/operacao/cli.ts restaurar-snapshot` (o código da produção), Litestream opcional (mesma versão e sha256 do Dockerfile, ponto no tempo opcional), `integrity_check` + contagens no resumo, reprova snapshot > 26 h, apaga os bancos no fim (`if: always()`), nunca vira artefato | `.github/workflows/restauracao-drill.yml`, `docs/runbook.md` §0.2 | `verificar` rodado localmente num banco migrado; workflow não executado (depende dos segredos) |
| 7 | **Checklist e rollback.** `docs/deploy-checklist.md` (antes/durante/depois + custo aceito do downtime). Runbook §0.3 reescrito: 1) imagem (automático + manual), 2) banco a um instante (Litestream `-timestamp`), 3) volume inteiro (snapshot pré-deploy → `fly volumes create --snapshot-id`) | `docs/deploy-checklist.md`, `docs/runbook.md` §0.3, `docs/LANCAMENTO.md` §8.5 | — |
| 8 | **Trivy + SBOM.** No job `imagem`, depois da fumaça: Trivy reprova só HIGH/CRITICAL **com correção** (`ignore-unfixed`), relatório JSON completo sem reprovar; SBOM CycloneDX pelo Syft; os dois como artefato `imagem-trivy-sbom`. `trivy-action` fixado no SHA da **0.35.0** e binário **v0.69.3**: as tags 0.0.1–0.34.2 foram reescritas em 19/03/2026 para roubar segredos de CI (GHSA-69fq-xp46-6x23) e a v0.69.4 do Trivy foi maliciosa | `ci.yml` (job `imagem`) | entradas conferidas no `action.yaml` do SHA fixado |

Também: `CHANGELOG.md` `[Unreleased]` atualizado; scripts `release`, `contrato:api`, `migracoes:conferir` no `package.json`.

## 2. Decisões

- **Sem blue-green, e o custo é explícito.** Uma máquina + volume (ADR 0006): o volume monta em uma
  máquina só e duas máquinas com SQLite seriam dois bancos. `--strategy immediate` fica, com downtime de
  segundos por deploy (~20 s no ADR 0006), compensado por snapshot antes, fumaça com versão depois e
  rollback automático. Registrado no cabeçalho do `implantar-ambiente.yml` e no checklist.
- **O que se promove é o commit, não a imagem.** O bundle embute `VITE_*` no build (URL do Supabase,
  URL pública), então staging e produção têm imagens diferentes do mesmo sha. O selo `deploy/staging` é
  um commit status; a fumaça de cada ambiente confere pela versão que é aquele sha que responde.
- **Snapshot de volume, não `operacao.cjs snapshot`.** O snapshot da aplicação grava a chave do DIA
  (`backups/diario/AAAA-MM-DD.db.gz`) e seria sobrescrito pelo timer diário depois de um deploy ruim; o
  snapshot de volume do Fly é independente do R2 e do Litestream, e restaura para um volume novo.
- **Rollback automático volta a imagem, não o banco.** É o portão expand/contract que torna isso seguro:
  a imagem anterior roda sobre o banco migrado porque a migration nova só acrescentou.
- **Contrato da API por rota, não por campo.** Não há esquema de resposta declarado por rota; campo
  removido fica coberto por revisão + testes de caracterização (limitação escrita em versionamento.md §2).
- **Regras de migration a partir da 0030.** As anteriores são história (a 0026 remove tabela órfã).

## 3. Gates

| gate | resultado |
|---|---|
| `tsc --noEmit` | 0 erros |
| `eslint src server server.ts tests --max-warnings 0` (o `npm run lint`) | 0 |
| `eslint` nos scripts novos/alterados (`scripts/release.mjs`, `scripts/migracoes`, `scripts/testes`, `scripts/perf/ci-carga.mjs`) | 0 |
| `eslint scripts` inteiro | 6 erros + 3 avisos **pré-existentes**, nenhum em arquivo desta fase (`backup.mjs`, `eval-fala/*`, `perf/recuperacao.mjs`); `scripts/` não está no `npm run lint` |
| `vitest run --maxWorkers=3` | 451 arquivos, 4.711 testes: 4.682 ok, 23 pulados, 6 falhas em 4 arquivos — `cluster` (2), `desligamento-gracioso` (3), `teto-de-erros-entre-instancias` (1): os de subprocesso `tsx` da worktree, por ambiente, como combinado; e `caracterizacao/ia.test.ts` com _hook timeout_ de 10 s sob carga, que passa isolado (21 ok, 1 pulado). Os 37 testes novos desta fase passam |
| `npm run workflows:validar` | 7 workflows OK (inclui `implantar-ambiente.yml` e `restauracao-drill.yml`) |
| `actionlint` | **não instalado** na máquina; não instalado (instrução). Pendente para quem tiver |
| `node scripts/migracoes/conferir.mjs` / `contrato-api.mjs` / `rotas-sem-consumidor.mjs` | 0 erros / 94 rotas ok / 96 rotas, 0 órfãs |
| `npx drizzle-kit generate` | "No schema changes, nothing to migrate" |
| `morto:ciclos` | sem ciclo |
| `morto:arquivos` (knip) | nenhum arquivo desta fase acusado; acusa devDependencies "sem uso" e `libsql` em `semear.mjs` — ambiente da worktree (sem `node_modules` próprio) e pré-existente |
| `typecheck:estrito` | 1 erro **pré-existente** em `tests/fetch-models-selecao.test.ts:89` (arquivo não tocado) |
| `rotas-sem-caracterizacao.mjs` | 1 "sobrando" **pré-existente**: `GET *` de `server/http/app.ts` (o 404 JSON da P0-7) |

Commits: `c0064f3` (semver, contrato da API, expand/contract, snapshot 0030, schema × banco),
`0bde8bd` (deploy staging→produção, carga, Trivy/SBOM, exercício de restauração, docs), e o deste relatório.

## 4. Pendências do dono

1. **App de staging no Fly**: `fly apps create babel-play-staging`, volume `babel_dados` em `gru`, os
   mesmos segredos da produção com valores de staging (Supabase de staging ou o mesmo projeto com
   outro domínio; R2/Litestream com buckets próprios).
2. **Environments do GitHub** `staging` e `production`: secret `FLY_API_TOKEN` (`fly tokens create deploy
   --app <app>`) e variáveis `FLY_APP`, **`URL_PUBLICA` (agora obrigatória)**, `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, `VITE_SELF_HOST_MODELS`, `VITE_SENTRY_DSN`. Em `production`, _Required
   reviewers_. Conferir se o token de deploy pode `volumes snapshots create` e `machines list` (é
   escopado ao app; se não puder, o deploy para no passo do snapshot — melhor que seguir sem ele).
3. **Environment `restauracao`** para o exercício: `R2_ENDPOINT`, `R2_LEITURA_ACCESS_KEY_ID`,
   `R2_LEITURA_SECRET_ACCESS_KEY` (token R2 **só leitura** nos dois buckets), variáveis `BACKUP_S3_BUCKET`
   e `LITESTREAM_BUCKET`. Decidir se o banco de produção pode passar pelo runner do GitHub (LGPD, há dados
   de menores); se não, usar só o exercício C (Fly) do runbook.
4. **`HEALTH_URL`** (secret/variável do `uptime.yml`) apontando para `https://<domínio>/api/health`.
5. **Primeiro exercício de restauração em produção** (runbook §0.2 C ou D) e anotar na tabela.
6. Branch protection: exigir os jobs `verify`, `migracoes`, `carga` e `imagem` no `main`.
7. Primeira release: quando for publicar, `npm run release -- minor` e os comandos que ele imprime (esta
   fase não criou tag).

## 5. Riscos e o que não foi validado

- Nenhum workflow novo rodou no GitHub (sem push, sem segredos). Validado: YAML, entradas das actions
  fixadas contra o `action.yaml` do SHA, sintaxe dos comandos `flyctl` contra a documentação. O primeiro
  deploy real em staging é o teste do `implantar-ambiente.yml`; o primeiro push, o do Trivy (pode acusar
  CVE HIGH/CRITICAL corrigível na base Debian — tratar antes de exigir o job).
- `flyctl machines list --json | .config.image`: se o formato mudar, `IMAGEM_ANTERIOR` fica vazio e o
  rollback automático se recusa com mensagem (não volta para imagem errada).
- O selo `deploy/staging` só existe para commits implantados por este workflow: rollback manual para
  uma imagem de antes dele exige `pular_staging` + justificativa.
- Testes que sobem subprocesso com `tsx` da worktree (cluster, desligamento-gracioso,
  teto-de-erros-entre-instâncias) falham por ambiente, conforme combinado.
