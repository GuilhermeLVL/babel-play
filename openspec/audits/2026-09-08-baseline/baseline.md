# Baseline — rodada de saneamento — 2026-09-08

Base: `main` @ `47ecf10` (== `origin/main`), arvore limpa. Branch de trabalho `saneamento/2026-09-08`.
Maquina: Windows 11, Node local v24.18.0 (CI e Docker: 22; a reproducao da CI usou `npx -p node@22`, v22.23.2).
Toda medicao de servidor: `node dist-server/server.cjs`, `NODE_ENV=production`, `AUTH_REQUIRED=0`, `127.0.0.1`,
COPIA do banco real (`sqlite3 .backup`: 1 usuario, 2.818 cartoes, 58 `seed_credits`, 58 `review_logs`, 198 `exercise_results`, 6 sessoes, 240 falas).
**EXEC** = confirmado por execucao nesta rodada. **lido** = inferido por leitura.

## 1. Tabela de metricas

| # | Metrica | Valor | Comando | Evidencia | Estado |
|---|---|---|---|---|---|
| 1 | Arquivos rastreados | 1.339 (src 352, tests 335, openspec 309, server 136, docs 64) | `git ls-files` | `arquivos-linhas.txt` | EXEC |
| 2 | Linhas por diretorio | src 80.025; server 64.303 (+ `server.ts` 703); tests 36.396; scripts 4.681 | `git ls-files <dir> \| xargs cat \| wc -l` | idem | EXEC |
| 3 | Linhas por linguagem | ts 77.094 (585 arq.); tsx 50.500 (161); json 81.508 (98); md 21.688 (296); mjs 5.045 (43); css 1.775 (1); sql 912 (33) | idem | idem | EXEC |
| 4 | Dependencias diretas | 28 prod + 32 dev (apos +autocannon) | `package.json` | `deps-diretas.json` | EXEC |
| 5 | Dependencias transitivas unicas | 879 (nome@versao) | `npm ls --all --json` | `deps.json` | EXEC |
| 6 | Testes vitest | 3.527 (3.526 verdes, 1 pulado), 312 arquivos, 39 s; **1 erro nao tratado** que derrubava a CI (ver 3.1) | `vitest run --reporter=json` | `testes.json` | EXEC |
| 7 | Testes e2e (Playwright, 1 projeto chromium desktop) | 26/26 verdes em 5,7 min (secao 2) | `PLAYWRIGHT_JSON_OUTPUT_NAME=... npx playwright test --reporter=json` | `e2e-baseline.json` | EXEC |
| 8 | Cobertura (v8) | linhas 42,8 %; ramos 34,5 %; funcoes 36,7 %; 142 de 417 arquivos sem nenhuma linha coberta. Por modulo: `src/core` 94,7 %, `server/lib` 85,4 %, `server/db` 90,6 %, `server/routes` 55,6 %, `src/lib` 53,8 %, `src/components` 17,6 %, `src/gateway` 20,7 %, `server.ts` 0 % | `npm run test:cov && node scripts/cobertura-por-modulo.mjs --md` | `cobertura-por-modulo.md`, `cobertura-resumo.json` | EXEC |
| 9 | Lint | 0 erros, 0 avisos em 739 arquivos (`--max-warnings 0` ja e gate) | `eslint -f json` | `lint.json`, `lint-por-regra.json` | EXEC |
| 10 | Typecheck | 0 erros (`tsc --noEmit`; `strict` so em `src/core`) | `npm run typecheck && npm run typecheck:core` | — | EXEC |
| 11 | Vulnerabilidades (npm audit) | 18: 0 critical, **5 high** (`@xmldom/xmldom` com fix — corrigido nesta fase; `adm-zip`, `sharp`, `onnxruntime-node`, `@huggingface/transformers` sem fix, na allowlist nomeada ate 2026-11-01), 13 moderate, 0 low | `npm audit --json` | `audit.json` | EXEC |
| 12 | Segredos no historico (296 commits) | 2 achados, ambos a MESMA constante de teste `segredo-e2e-hs256-marco1` (`tests/integration/mt1-isolation-e2e.test.ts:14`, `docs/auditoria/seguranca-v1.md:20`); nao e segredo real; allowlist nomeada na Fase 4 | `gitleaks git --log-opts=--all` | `gitleaks-historico.json` | EXEC |
| 13 | Codigo morto: arquivos | 0 (gate `morto:arquivos` ja vale) | `knip --include files` | `morto/knip.json` | EXEC |
| 14 | Codigo morto: exports/tipos (nao gateado) | 16 exports + 15 tipos sem uso (7 no barril `src/core/index.ts`) | `knip --include exports,types` | idem | EXEC |
| 15 | Codigo morto: dependencias | knip 0 (apos remover `rollup-plugin-visualizer`); depcheck aponta 7 devDeps usadas so por script/plugin (falsos positivos conhecidos, `knip.json ignoreDependencies`) e 2 "missing" que sao o alias `@core` | `knip`, `depcheck --json` | `morto/depcheck.json` | EXEC |
| 16 | Ciclos de importacao | 0 | `madge --circular` | `morto/madge.json` | EXEC |
| 17 | Duplicacao (jscpd, >= 10 linhas, src+server) | 171 clones, 23.459 linhas duplicadas (16,2 % de 457 arquivos em 6 formatos, inclui json/css/md) | `jscpd --min-lines 10` | `morto/jscpd/jscpd-report.json` | EXEC |
| 18 | Regras arquiteturais (ast-grep) | 3 avisos pre-existentes: `resposta-crua` em `server/routes/sessions.ts:102` e `import.ts:184`; `rota-fala-com-o-banco` em `health.ts:26` (scan da CI passa com aviso) | `ast-grep scan --json` | `ast-grep.json` | EXEC |
| 19 | Bundle (build de producao real) | 94 chunks; arranque 210 KB gz; total 1.660 KB gz; maiores: mtWorker 155, whisperWorker 155, speakerIdWorker 144, Play 132, index 124+117, AreaChart 103 | `npm run build && node scripts/perf/medir-rotas.mjs` | `bundle-medir-rotas.txt` | EXEC |
| 20 | Bundle por rota (manifest) | LiveCapture 204 KB gz (28 chunks), Analysis 201, Play 155, Metrics 149, Library 134, Perfil 118, Settings 38, Loja 26 | `vite build --manifest` + parse | `bundle-por-rota.md` | EXEC |
| 21 | Latencia p50/p95/p99 (10 conexoes, 15 s) | health 2/2/4 ms; me 4/7/8; **metrics/profile 354/372/549** (28 req/s); metrics/xp 14/15/16; para-jogo 40/41/45; **GET /api/vocab 991/1.576/1.779** (2,3 MB por resposta); sessions 4/6/6; exercises/results 37/39/39; rank 2/3/4; POST exercises/rodada 27/38/39; POST vocab/:id/review 14/20/23 | `node scripts/perf/latencia.mjs --api=... --duracao=15` | `latencia.md`, `latencia.json` | EXEC |
| 22 | Arranque ate `/api/health` 200 | producao mediana 1.334 ms (min 1.312, max 1.806); dev:local 3.197 ms | `node scripts/perf/arranque.mjs` | `arranque.md` | EXEC |
| 23 | Recuperacao apos `kill -9` sob carga de escrita | 1.405 ms ate health 200 (supervisor em processo); 27.398 2xx, **0 perdidos**; 6.903 conexoes cortadas; `integrity_check` ok. Cluster 2 workers (kill no primario): 1.556 ms, 0 perdidos | `node scripts/perf/recuperacao.mjs` | `recuperacao.md` | EXEC |
| 24 | Lighthouse desktop (perf / a11y / boas praticas) | `/` 93/98/92; `/jogar` **70**/95/92 (CLS 0,51, TBT 146 ms); `/capturar` 97; `/vocabulario` 97; `/loja` 88; `/perfil` 98 | `npx lighthouse --preset=desktop` | `lighthouse.md`, `lighthouse/*.json` | EXEC |
| 25 | Lighthouse mobile | `/` 82; `/jogar` **26** (LCP 6,7 s, TBT 1.518 ms, CLS 0,53); `/capturar` 78; `/vocabulario` 66; `/loja` 75; `/perfil` 73 | `npx lighthouse` (mobile padrao) | idem | EXEC |
| 26 | CI em `origin/main` @ 47ecf10 | **vermelha** em `npm test` (run 34278328814); `seguranca` e `uptime` verdes | API publica do GitHub | secao 3 | EXEC |
| 27 | CI na branch `saneamento/2026-09-08` | ver secao 3 | idem | `ci.md` | EXEC |

## 2. E2E (Playwright 1.62, 1 projeto chromium desktop, 1 worker, dev:local na 3100 sobre COPIA do banco)

26 testes em 9 arquivos, **26 verdes**, 5,7 min (`e2e-baseline.json`). Os quatro mais lentos levam 29-36 s cada
(`baralhos`, `facetas`, `trilha-carregamento`, `quatro-superficies`), o que sugere esperas por timeout e nao por
condicao — hipotese para a Fase 1. Nao ha e2e de login, sessao de jogo, FSRS, seeds, transcricao, estatisticas, tema
nem limites de plano; nem outras viewports.

Invocacao que funciona nesta maquina (o hook `rtk` quebra `npx playwright` e `rtk proxy npx playwright` com
`--reporter=json`, exit 127 sem saida): `PLAYWRIGHT_JSON_OUTPUT_NAME=<arquivo> node node_modules/@playwright/test/cli.js test --reporter=json`.

## 3. O que a Fase 0 mudou (e por que era pre-requisito)

3.1 **CI vermelha em `main`.** `npm test` devolvia 1 sem nenhum teste falhar: um erro nao tratado
(`speak() sem lang`, `src/lib/tts.ts:276`) disparado por `src/lib/falante.ts:83` quando o item nao
tem idioma, alcancado por `tests/errosDeMidia.test.ts`. O log do job exige admin (403 pela API); a
causa foi reproduzida em Node 22 + `TZ=UTC` e corrigida em `8ec99cd` (`ItemAudivel.lang` obrigatorio,
fixtures com `lang`). Nao e alteracao de comportamento de produto: os tres jogos ja passavam o idioma.

3.2 **`audit:gate` vermelho** por advisory novo de `@xmldom/xmldom` (transitivo de `mammoth`): 0.8.13 -> 0.8.15 em `701d97b`.

3.3 **CI cega em falha**: JSON do vitest e trace/screenshot do Playwright agora sobem como artefato `if: always()` (`fc3b841`).

3.4 Cobertura configurada (`57b7f24`), scripts de medicao (`51e4656`), `gh` 2.100 instalado (sem `gh auth login`; o dono precisa fazer).

## 4. Achados novos desta fase (hipoteses para as fases seguintes)

- `/jogar` tem CLS 0,5 em desktop e mobile e TBT de 1,5 s em mobile: a tela de jogos desloca layout apos o carregamento (lido: `Play.tsx` monta o lobby apos `fetchDeck`). Fase 5.
- `GET /api/vocab` devolve 2,3 MB e sob 10 conexoes chega a 1,8 s p99; o lobby ainda o chama? (a change `arranque-leve-e-payloads-enxutos` disse que nao; confirmar quem chama na Fase 5).
- `/api/metrics/profile` a 28 req/s e o teto do servidor com um usuario; com N usuarios cada um paga 11 consultas. Fase 5.
- `server/routes` com 55,6 % e `src/components` com 17,6 % de cobertura sao onde a rede da Fase 1 precisa crescer.
- 16 exports e 15 tipos sem uso, 7 deles no barril do core: candidatos da Fase 2 (categoria "exports").
- 171 clones jscpd: evidencia para os ADRs da Fase 3 (nao para remocao na Fase 2).
