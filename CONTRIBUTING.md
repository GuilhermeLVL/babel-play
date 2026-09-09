# Contributing

Thanks for taking a look. This project is built in public by one person; small, focused
contributions are the ones most likely to land.

## Run it locally

```bash
npm install            # also copies the ONNX Runtime / VAD binaries into public/
cp .env.example .env   # PORT and optional keys; no key is required for the local pipeline
npm run dev            # Express + Vite in one process → http://localhost:<PORT>
```

Open it through `localhost` (secure context) — the models load in the browser.

## Before you open a PR

This is the same list CI runs, in the same order. All of it must be green.

```bash
npm run typecheck && npm run typecheck:core && npm run typecheck:estrito
npm run lint                       # --max-warnings 0: a warning fails the build
npm test                           # ~3,900 tests, temporary SQLite; never touches your data/
npm run build
npm run morto:arquivos             # knip: unused files, deps, unlisted imports
npm run morto:ciclos               # madge: zero import cycles, and it stays zero
npm run audit:gate                 # no new high/critical CVE outside the named allowlist
npm run workflows:validar
node scripts/i18n/pseudo.mjs --check && npm run i18n:orfas && node scripts/i18n/cobertura.mjs --check
node scripts/testes/rotas-sem-caracterizacao.mjs   # every server route has a test or a written reason
node scripts/testes/rotas-sem-consumidor.mjs       # and every route has a caller
./node_modules/.bin/ast-grep test -c sgconfig.yml  # the rules have fixtures — see below
./node_modules/.bin/ast-grep scan -c sgconfig.yml src server server.ts
npm run test:e2e                   # three viewports: 375, 768, 1280
```

**Why the fixtures matter.** An architectural rule that stops matching returns zero findings, and
zero findings looks exactly like clean code. That is not hypothetical here: three rules used to
match `server/routes/*.ts` — one level only — and would have silently covered nothing the day routes
moved into subfolders. Each rule now has a fixture that must keep failing, so a broken rule breaks
the build instead of going quiet.

**Playwright and the `rtk` shell hook.** If `npx playwright` exits 127 with no output, call the CLI
directly: `node node_modules/@playwright/test/cli.js test --reporter=json`.

## What kind of change is welcome

- Bugs with a reproduction (browser, WebGPU support, OS, model) — use the issue form.
- Accessibility and UX fixes backed by a measurement (contrast, target size, keyboard).
- New STT/MT adapters behind the existing gateway (`src/gateway/`), with a fallback path.
- Tests that fail before and pass after.

Things that need a discussion first (open an issue): new persistence, new external services,
anything that sends user data off the device by default.

## Conventions

- Commits: `tipo(escopo): resumo` — `feat`, `fix`, `docs`, `test`, `refactor`. Portuguese or
  English, both fine. Say **why**, not only what.
- No `fetch('/api/…')` outside `src/data/funil.ts` — an ast-grep rule enforces the single funnel
  (it is what makes the no-account mode work). The funnel moved out of `src/data/api.ts` when that
  file was split; the rule's `ignores` moved with it, with a negative proof on record.
- Anything the server writes for itself — owner id, soft-delete marker — stays on the server. There
  is a test for it (`tests/integration/vocab-colunas-que-saem.test.ts`).
- Nothing user-typed reaches the log. The logger has a field allowlist _and_ redacts values, because
  the ORM appends bound parameters to its error messages (`server/lib/redacao.ts` has the
  measurement).
- Honesty as a type: never fabricate a value the server does not know; show a skeleton instead.
- OpenSpec: `openspec/specs/` describes the product as it is. A change whose last task is checked is
  archived in the same PR (`npx openspec archive <name> -y`), so its delta lands in the main specs and
  `openspec list` only shows open work. Every requirement cites the `file:line` that implements it.

## Measuring, when a change claims to be faster

Numbers or it did not happen — and from the same command, before and after, on a **copy** of the
database (every script below writes for real):

```bash
node scripts/perf/latencia.mjs --api=http://127.0.0.1:3101 --duracao=15 --conexoes=10 --card=<id>
node scripts/perf/arranque.mjs --db=<COPY.db>
node scripts/perf/recuperacao.mjs --db=<COPY.db> --porta=3104 --carga=30 --matar=10
k6 run scripts/perf/carga.k6.js          # BASE=... CARTAO=...
```

Two traps that already cost time here, both documented in
`openspec/audits/2026-09-09-fase5-observabilidade-e-desempenho.md`: a load run that measured
validation errors and read as saturation, and a concurrency check that passed on an empty database
while announcing the limit held. If a test can pass without doing any work, it will.

Use `127.0.0.1`, never `localhost` — on Windows the IPv6 attempt adds a phantom ~200 ms per request.

## Operating it

[`docs/runbook.md`](docs/runbook.md) — health vs readiness, reading the log, `/metrics`, shutdown,
secret rotation, the rate-limit buckets and the known symptoms.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
