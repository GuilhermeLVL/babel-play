# Inventario de ferramentas e MCPs — 2026-09-08 — 47ecf10

Confirmado por execucao nesta sessao (`--version`, `command -v`), salvo onde indicado.

## MCPs conectados nesta sessao

| MCP | Oferece | Fase de uso |
|---|---|---|
| playwright (plugin) | navegador controlado, snapshots, screenshots, rede | 1 (E2E exploratorio), 5 (re-renders) |
| chrome-devtools | `lighthouse_audit`, `performance_start_trace`, rede, console, emulacao | 0 e 5 (Lighthouse cross-check, trace de re-render) |
| docker | build/run/logs/stats de containers | 0 e 5 (recuperacao em container, k6, semgrep) |
| git | status, diff, log, branch, commit | todas |
| filesystem | leitura/escrita/busca | todas |
| duckdb | consultas analiticas (le SQLite) | 0 e 5 (EXPLAIN, integridade) |
| langfuse | traces/metricas de LLM | 5 (custo de IA, se houver projeto) |
| context7 | documentacao atualizada de bibliotecas | 3 e 5 (prom-client, otel, opossum) |
| thinking (sequential) | raciocinio estruturado | pontual |
| memory, chroma, qdrant | grafos e vetores | nao usados nesta rodada |
| arxiv, hf-mcp-server, searxng, tavily, fetch, ollama, jupyter, terminal | pesquisa / execucao | nao usados nesta rodada (ollama parado) |
| github | PRs, issues, runs | **exige OAuth; indisponivel nesta sessao** — substituido pelo `gh` CLI |
| sentry | erros em producao | **exige OAuth; indisponivel nesta sessao** |
| paper, Roblox_Studio | — | falharam ao conectar |

## Ferramentas locais

| Ferramenta | Estado | Versao / observacao |
|---|---|---|
| node | presente | v24.18.0 (CI e Docker fixam 22; medicoes registram a versao) |
| npm | presente | 11.16.0 |
| docker | presente | 28.5.1 |
| gitleaks | presente | 8.30.1 |
| gh | **instalado nesta rodada** (winget) | 2.100.0; `gh auth login` pendente pelo dono |
| python | presente | 3.12.7 (usado so para agregar JSON) |
| sqlite3 | presente | 3.45.3 |
| k6, semgrep, trufflehog | ausentes | via Docker nas Fases 4 e 5 |
| eslint / typescript-eslint | devDep | eslint 10.7, ts-eslint 8.65, `--max-warnings 0` |
| knip / madge / depcheck / jscpd | devDep | knip 6.32.1, madge 8, depcheck 1.4.7, jscpd 5.0.14 |
| ast-grep | devDep | 0.45.1, 6 regras em `audit/rules/ast-grep` |
| vitest / @vitest/coverage-v8 | devDep | 4.1.10; cobertura **configurada nesta rodada** (`test:cov`) |
| playwright | devDep | 1.62.1; 1 projeto (chromium desktop) |
| lighthouse | devDep | 13.4.1 (`npx lighthouse`) |
| autocannon | **devDep instalado nesta rodada** | 8.0.0; `scripts/perf/latencia.mjs`, `recuperacao.mjs` |
| prettier, .editorconfig, husky, lint-staged | ausentes | Fase 3 |
| prom-client, opentelemetry, opossum | ausentes | Fase 5 |
| helmet, express-rate-limit, compression, zod, jose | dependencias | presentes e em uso |
| logging | `server/lib/logger.ts` (JSON com allowlist) + `requestId.ts` | sem biblioteca |
| health / ready / metrics / tracing | `/api/health` existe; `/ready`, `/metrics` Prometheus e OTel **ausentes** | Fase 5 |

## CI (`.github/workflows`)
`ci.yml` (job unico: workflows:validar, typecheck, typecheck:core, lint, knip, madge, vitest, build, i18n x4, audit:gate, playwright, ast-grep), `seguranca.yml` (gitleaks + CodeQL), `uptime.yml` (sonda a cada 15 min).
